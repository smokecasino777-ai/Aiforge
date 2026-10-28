"""Voice features — TTS (read assistant replies aloud) + STT (voice input).

Both are Pro-gated to protect our API spend. Free users get a very small
daily budget so they can try the feature once and see what Pro unlocks;
Pro users get a generous but bounded daily cap.

TTS caching: audio bytes are keyed by sha256(text|voice|speed|model|format)
and served under /voice/tts/{key}.mp3 with a 1-year Cache-Control. The same
sentence is only ever generated once per voice.
"""
import hashlib
import io
import os
import re
import tempfile
import asyncio
import subprocess
import wave
import imageio_ffmpeg
from datetime import datetime, timezone
from typing import Optional

try:
    import emoji
except Exception:  # pragma: no cover
    emoji = None  # type: ignore

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from metering import MeteredRoute, current_quote, provider_start

from core import (
    EMERGENT_LLM_KEY,
    db,
    get_current_user,
    iso,
    limiter,
    logger,
    now_utc,
)

router = APIRouter(tags=["voice"], route_class=MeteredRoute)

# ---- Daily caps ----
# Chars for TTS, seconds for STT. Values are generous for Pro, zero-but-trial
# for free users so they can taste the feature once (24h cool-down).
FREE_TTS_CHARS_DAILY = 300
PRO_TTS_CHARS_DAILY = 20_000
FREE_STT_SECONDS_DAILY = 15
PRO_STT_SECONDS_DAILY = 600

# ---- Model picks (per playbooks) ----
TTS_MODEL = "tts-1"                        # fastest + cheapest for chat
TTS_DEFAULT_VOICE = "nova"                 # upbeat, friendly
TTS_DEFAULT_FORMAT = "mp3"
# Valid voices for tts-1 (per playbook). ballad/verse are gpt-4o-mini-tts only.
TTS_VALID_VOICES = {"alloy", "ash", "coral", "echo", "fable", "nova", "onyx", "sage", "shimmer"}
STT_MODEL = "whisper-1"                  # emergentintegrations OpenAISpeechToText only supports whisper-1

# ---- Imports from emergentintegrations (lazy so import-at-boot doesn't crash) ----
_tts_singleton = None
_stt_singleton = None


def _get_tts():
    global _tts_singleton
    if _tts_singleton is None:
        from emergentintegrations.llm.openai import OpenAITextToSpeech
        _tts_singleton = OpenAITextToSpeech(api_key=EMERGENT_LLM_KEY)
    return _tts_singleton


def _get_stt():
    global _stt_singleton
    if _stt_singleton is None:
        from emergentintegrations.llm.openai import OpenAISpeechToText
        _stt_singleton = OpenAISpeechToText(api_key=EMERGENT_LLM_KEY)
    return _stt_singleton


def _clean_for_tts(text: str) -> str:
    """Scrub emoji, URLs, markdown, control chars before synthesis."""
    if emoji is not None:
        text = emoji.replace_emoji(text, replace="")
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"`{1,3}[^`]*`{1,3}", "", text)
    text = re.sub(r"[*_#>~|]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _cache_key(text: str, voice: str, model: str, fmt: str, speed: float) -> str:
    raw = f"{text}|{voice}|{speed}|{model}|{fmt}"
    return hashlib.sha256(raw.encode()).hexdigest()


def _today_str() -> str:
    """UTC yyyy-mm-dd for quota rollover."""
    return now_utc().strftime("%Y-%m-%d")


async def _reserve_quota(
    user_id: str, kind: str, amount: int, free_cap: int, pro_cap: int
) -> None:
    """Atomically add `amount` to today's bucket and raise 429 if over cap.

    Uses a single `find_one_and_update` with a `$lte` guard so concurrent
    requests can't bypass the cap by reading the counter in parallel.
    """
    if current_quote.get() and not current_quote.get().get("legacy"):
        return
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "plan": 1})
    plan = (user or {}).get("plan", "free").lower()
    # Pro RC tier + legacy Stripe paying tiers both get the Pro cap.
    cap = pro_cap if plan != "free" else free_cap

    # HARD GATE: a single request that exceeds the cap by itself must 429
    # BEFORE we touch the counter. Without this check, the $exists:False
    # branch below would let the first request of the day through even if
    # `amount` were, say, 301 chars on a 300-char free cap (iteration-18
    # regression). We also treat negative/zero amounts defensively.
    if amount <= 0:
        return
    if amount > cap:
        raise HTTPException(
            status_code=429,
            detail=(
                "Voice daily limit reached — upgrade to Pro for a bigger daily budget."
                if plan == "free"
                else "Voice daily limit reached — try again tomorrow."
            ),
        )

    today = _today_str()
    counter_field = f"voice_quota.{today}.{kind}"
    max_before = cap - amount  # must be ≤ this for the increment to be allowed

    # Atomic: only increment when the current value is missing OR ≤ max_before.
    result = await db.users.find_one_and_update(
        {
            "user_id": user_id,
            "$or": [
                {counter_field: {"$exists": False}},
                {counter_field: {"$lte": max_before}},
            ],
        },
        {"$inc": {counter_field: amount}},
        projection={"_id": 1},
    )
    if result is None:
        raise HTTPException(
            status_code=429,
            detail=(
                "Voice daily limit reached — upgrade to Pro for a bigger daily budget."
                if plan == "free"
                else "Voice daily limit reached — try again tomorrow."
            ),
        )


class TtsRequest(BaseModel):
    text: str
    voice: Optional[str] = None  # falls back to TTS_DEFAULT_VOICE


@router.post("/voice/tts")
@limiter.limit("30/minute")
async def voice_tts(
    request: Request, req: TtsRequest, user: dict = Depends(get_current_user)
):
    """Synthesize `text` to MP3. Returns the audio bytes directly so the mobile
    client can write them to a cache file and play with expo-audio.

    Pro users: up to 20k chars/day. Free users: 300 chars/day (one taste).
    Response is cached in Mongo keyed by (text, voice, model, format, speed) so
    repeats are free.
    """
    text = _clean_for_tts(req.text or "")
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")
    # TTS endpoint max is 4096 chars per request — we chunk below.
    if len(text) > 4000:
        text = text[:4000]

    voice = (req.voice or TTS_DEFAULT_VOICE).lower().strip()
    if voice not in TTS_VALID_VOICES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown voice '{voice}'. Choose one of: {', '.join(sorted(TTS_VALID_VOICES))}.",
        )

    await _reserve_quota(
        user["user_id"], "tts_chars", len(text), FREE_TTS_CHARS_DAILY, PRO_TTS_CHARS_DAILY
    )

    key = _cache_key(text, voice, TTS_MODEL, TTS_DEFAULT_FORMAT, 1.0)
    cached = await db.tts_cache.find_one({"key": key}, {"_id": 0, "bytes": 1})
    if cached and cached.get("bytes"):
        return Response(
            content=cached["bytes"],
            media_type="audio/mpeg",
            headers={"Cache-Control": "public, max-age=31536000", "X-Cache": "hit"},
        )

    try:
        await provider_start()
        audio_bytes = await _get_tts().generate_speech(
            text=text,
            model=TTS_MODEL,
            voice=voice,
            response_format=TTS_DEFAULT_FORMAT,
        )
    except Exception as e:
        logger.exception("TTS synthesis failed")
        raise HTTPException(status_code=502, detail=f"TTS failed: {e}")

    # Cache (best-effort — upsert so a race doesn't crash).
    try:
        await db.tts_cache.update_one(
            {"key": key},
            {
                "$set": {
                    "key": key,
                    "voice": voice,
                    "model": TTS_MODEL,
                    "format": TTS_DEFAULT_FORMAT,
                    "chars": len(text),
                    "bytes": audio_bytes,
                    "created_at": iso(now_utc()),
                }
            },
            upsert=True,
        )
    except Exception as e:
        logger.warning(f"TTS cache write failed (non-fatal): {e}")

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={"Cache-Control": "public, max-age=31536000", "X-Cache": "miss"},
    )


@router.post("/voice/stt")
@limiter.limit("20/minute")
async def voice_stt(
    request: Request,
    audio: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    """Transcribe a short recording (<60 sec, <5 MB) and return `{text}`.

    Pro: 600 sec/day. Free: 15 sec/day. We size the quota reservation using
    the uploaded file size as a proxy (~24 KB per second for m4a HQ) since we
    don't have an audio duration probe on the backend — client sends realistic
    short clips so this is accurate enough for cost control.
    """
    # Hard cap at 5 MB (~ 3.5 min of m4a; prevents accidental big uploads).
    MAX_BYTES = 5 * 1024 * 1024
    raw = await audio.read()
    if len(raw) < 2048:
        raise HTTPException(status_code=400, detail="Clip too short")
    if len(raw) > MAX_BYTES:
        raise HTTPException(status_code=413, detail="Clip too large (>5 MB)")

    # Decode and measure actual audio. Compressed file size is NOT a safe
    # duration or cost bound. No provider is contacted for an overlong clip.
    def normalize():
        with tempfile.TemporaryDirectory(prefix="aiforge-voice-") as directory:
            source, target = os.path.join(directory, "source"), os.path.join(directory, "speech.wav")
            with open(source, "wb") as handle:
                handle.write(raw)
            args = [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-loglevel", "error", "-protocol_whitelist", "file,pipe", "-i", source, "-t", "61", "-vn", "-ac", "1", "-ar", "16000", "-threads", "1", "-y", target]
            result = subprocess.run(args, capture_output=True, timeout=30)
            if result.returncode:
                raise HTTPException(400, "Audio format could not be read")
            with wave.open(target, "rb") as handle:
                seconds = handle.getnframes() / handle.getframerate()
            if not 0 < seconds <= 60:
                raise HTTPException(400, "Record at most 60 seconds for this quote")
            with open(target, "rb") as handle:
                return handle.read(), max(1, int(seconds + 0.999))
    raw, est_seconds = await asyncio.to_thread(normalize)
    await _reserve_quota(
        user["user_id"], "stt_seconds", est_seconds, FREE_STT_SECONDS_DAILY, PRO_STT_SECONDS_DAILY
    )

    # emergentintegrations wants an open file handle — write to tmp and open.
    suffix = ".wav"
    if suffix.lower() not in {".m4a", ".mp3", ".mp4", ".mpga", ".mpeg", ".wav", ".webm"}:
        suffix = ".m4a"

    try:
        await provider_start()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name
        try:
            with open(tmp_path, "rb") as fh:
                resp = await _get_stt().transcribe(
                    file=fh,
                    model=STT_MODEL,
                    response_format="json",
                )
        finally:
            try:
                os.unlink(tmp_path)
            except Exception:
                pass
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("STT transcription failed")
        raise HTTPException(status_code=502, detail=f"Transcription failed: {e}")

    text = (getattr(resp, "text", "") or "").strip()
    return {"text": text, "seconds_est": est_seconds}


@router.get("/voice/quota")
async def voice_quota(user: dict = Depends(get_current_user)):
    """Return today's remaining voice quota so the client can show counters."""
    plan = (user.get("plan") or "free").lower()
    today = _today_str()
    doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0, "voice_quota": 1})
    bucket = ((doc or {}).get("voice_quota") or {}).get(today) or {}
    tts_cap = PRO_TTS_CHARS_DAILY if plan != "free" else FREE_TTS_CHARS_DAILY
    stt_cap = PRO_STT_SECONDS_DAILY if plan != "free" else FREE_STT_SECONDS_DAILY
    return {
        "plan": plan,
        "tts_chars_used": int(bucket.get("tts_chars", 0)),
        "tts_chars_cap": tts_cap,
        "stt_seconds_used": int(bucket.get("stt_seconds", 0)),
        "stt_seconds_cap": stt_cap,
    }
