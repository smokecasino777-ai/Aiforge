"""Iter18 - Voice (TTS/STT/quota) + regressions. Rate-limit tests run LAST.
Uses pymongo only to (a) promote a TEST user to a legacy tier and (b) pre-fill quota buckets
to test the cap edge without spending 20k chars. All created users deleted via DELETE /auth/me.
"""
import concurrent.futures as cf
import io
import os
import struct
import uuid
import wave
from datetime import datetime, timezone
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values
from pymongo import MongoClient

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
ENV = dotenv_values(Path(__file__).resolve().parents[1] / ".env")
SECRET = (ENV.get("REVENUECAT_WEBHOOK_SECRET") or "").strip()
MDB = MongoClient(ENV["MONGO_URL"])[ENV["DB_NAME"]]
DEMO = {"email": "demo@example.com", "password": "demo1234"}
API = f"{BASE_URL}/api"
USERS = {}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _today():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _register(prefix):
    email = f"test_{prefix}.{uuid.uuid4().hex[:10]}@aiforgeqa.dev"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": "Passw0rd!x", "name": "QA iter18"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _quota(tok):
    r = requests.get(f"{API}/voice/quota", headers=_h(tok), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _tts(tok, text, voice=None):
    body = {"text": text}
    if voice:
        body["voice"] = voice
    return requests.post(f"{API}/voice/tts", json=body, headers=_h(tok), timeout=90)


def _stt(tok, data, name="clip.m4a", ctype="audio/m4a"):
    return requests.post(f"{API}/voice/stt", files={"audio": (name, data, ctype)},
                         headers=_h(tok), timeout=90)


def _set_bucket(uid, kind, val):
    MDB.users.update_one({"user_id": uid}, {"$set": {f"voice_quota.{_today()}.{kind}": val}})


def _wav_silence(seconds=2, rate=16000):
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(struct.pack("<h", 0) * rate * seconds)
    return buf.getvalue()


@pytest.fixture(scope="module", autouse=True)
def users():
    # free user, pro user (via signed webhook), legacy-tier user (forge via DB), concurrency user
    for k in ("free", "pro", "legacy", "conc"):
        tok, u = _register(f"voice_{k}")
        USERS[k] = {"tok": tok, "uid": u.get("user_id") or u["id"]}
    r = requests.post(f"{API}/webhook/revenuecat", headers={"Authorization": f"Bearer {SECRET}"},
                      json={"event": {"type": "INITIAL_PURCHASE", "app_user_id": USERS["pro"]["uid"],
                                      "product_id": "aiforge_pro_monthly"}}, timeout=20)
    assert r.status_code == 200 and r.json().get("plan") == "pro", r.text
    MDB.users.update_one({"user_id": USERS["legacy"]["uid"]}, {"$set": {"plan": "forge"}})
    yield
    for k, v in USERS.items():
        d = requests.delete(f"{API}/auth/me", headers=_h(v["tok"]), timeout=20)
        print(f"cleanup {k}: {d.status_code}")


# ---------- Quota endpoint ----------
class TestQuota:
    def test_unauth_401(self):
        assert requests.get(f"{API}/voice/quota", timeout=20).status_code == 401

    def test_free_defaults(self):
        q = _quota(USERS["free"]["tok"])
        assert q == {"plan": "free", "tts_chars_used": 0, "tts_chars_cap": 300,
                     "stt_seconds_used": 0, "stt_seconds_cap": 15}

    def test_pro_defaults(self):
        q = _quota(USERS["pro"]["tok"])
        assert q["plan"] == "pro" and q["tts_chars_cap"] == 20000 and q["stt_seconds_cap"] == 600

    def test_legacy_forge_gets_pro_cap(self):
        q = _quota(USERS["legacy"]["tok"])
        assert q["plan"] == "forge" and q["tts_chars_cap"] == 20000 and q["stt_seconds_cap"] == 600

    def test_demo_legacy(self):
        r = requests.post(f"{API}/auth/login", json=DEMO, timeout=20)
        assert r.status_code == 200
        q = _quota(r.json()["token"])
        assert q["tts_chars_cap"] == 20000, q


# ---------- TTS ----------
class TestTTS:
    def test_unauth_401(self):
        assert requests.post(f"{API}/voice/tts", json={"text": "hi"}, timeout=20).status_code == 401

    def test_empty_400(self):
        assert _tts(USERS["pro"]["tok"], "").status_code == 400
        assert _tts(USERS["pro"]["tok"], "   ").status_code == 400
        # only markdown/emoji/url -> cleans to empty -> 400
        assert _tts(USERS["pro"]["tok"], "*** 🎉 https://x.com ##").status_code == 400

    def test_missing_text_422(self):
        r = requests.post(f"{API}/voice/tts", json={}, headers=_h(USERS["pro"]["tok"]), timeout=20)
        assert r.status_code == 422

    def test_miss_then_hit_and_charges(self):
        tok = USERS["pro"]["tok"]
        text = f"AiForge voice QA check {uuid.uuid4().hex[:6]}"
        before = _quota(tok)["tts_chars_used"]
        r1 = _tts(tok, text)
        assert r1.status_code == 200, r1.text
        assert r1.headers["content-type"].startswith("audio/mpeg")
        assert r1.headers.get("x-cache") == "miss"
        assert len(r1.content) > 2000 and (r1.content[:3] == b"ID3" or r1.content[0] == 0xFF)
        r2 = _tts(tok, text)
        assert r2.status_code == 200 and r2.headers.get("x-cache") == "hit"
        assert r2.content == r1.content
        after = _quota(tok)["tts_chars_used"]
        assert after - before == 2 * len(text), (before, after, len(text))
        USERS["pro"]["mp3"] = r1.content  # reused for STT e2e

    def test_truncate_over_4000(self):
        tok = USERS["pro"]["tok"]
        before = _quota(tok)["tts_chars_used"]
        text = ("Testing truncation " * 300)[:4500]  # cleaned text ~4499 chars
        r = _tts(tok, text)
        assert r.status_code == 200, r.text[:300]
        assert _quota(tok)["tts_chars_used"] - before == 4000

    def test_free_cap_429_upgrade_msg(self):
        tok = USERS["free"]["tok"]
        r = _tts(tok, "x" * 301)
        assert r.status_code == 429, r.status_code
        assert "upgrade to pro" in r.json()["detail"].lower()
        assert _quota(tok)["tts_chars_used"] == 0  # rejected request not charged

    def test_free_within_cap_then_429(self):
        tok = USERS["free"]["tok"]
        r = _tts(tok, "Hello free tier user, this is a short preview.")
        assert r.status_code == 200, r.text[:200]
        used = _quota(tok)["tts_chars_used"]
        r2 = _tts(tok, "y" * (300 - used + 1))
        assert r2.status_code == 429

    def test_pro_cap_429_tomorrow_msg(self):
        _set_bucket(USERS["pro"]["uid"], "tts_chars", 19995)
        r = _tts(USERS["pro"]["tok"], "Hello there pro")
        assert r.status_code == 429
        assert "tomorrow" in r.json()["detail"].lower(), r.json()

    def test_legacy_cap_429_message(self):
        # Legacy forge user already has Pro-level cap; telling them "upgrade to Pro" is wrong UX
        _set_bucket(USERS["legacy"]["uid"], "tts_chars", 19995)
        r = _tts(USERS["legacy"]["tok"], "Hello there legacy")
        assert r.status_code == 429
        assert "tomorrow" in r.json()["detail"].lower(), f"legacy user got: {r.json()['detail']}"

    def test_invalid_voice(self):
        tok = USERS["legacy"]["tok"]
        _set_bucket(USERS["legacy"]["uid"], "tts_chars", 0)
        r = _tts(tok, "Invalid voice probe", voice="not_a_real_voice")
        print("invalid voice ->", r.status_code, r.text[:200])
        used = _quota(tok)["tts_chars_used"]
        print("charged chars after invalid voice:", used)
        assert r.status_code in (400, 422), f"invalid voice returns {r.status_code} and charged {used} chars"


# ---------- Atomicity ----------
class TestConcurrency:
    def test_concurrent_reservation_atomic(self):
        tok = USERS["conc"]["tok"]
        texts = [f"Concurrency probe number {i} " + "z" * 220 for i in range(8)]  # each ~250 chars
        with cf.ThreadPoolExecutor(max_workers=8) as ex:
            res = list(ex.map(lambda t: _tts(tok, t).status_code, texts))
        ok = res.count(200)
        used = _quota(tok)["tts_chars_used"]
        print(f"concurrent statuses={res}, successes={ok}, recorded used={used}")
        assert ok <= 1, f"{ok} concurrent requests passed a 300-char cap (non-atomic reservation); used counter={used}"


# ---------- STT ----------
class TestSTT:
    def test_unauth_401(self):
        r = requests.post(f"{API}/voice/stt", files={"audio": ("a.m4a", b"0" * 4096, "audio/m4a")}, timeout=20)
        assert r.status_code == 401

    def test_missing_file_422(self):
        r = requests.post(f"{API}/voice/stt", headers=_h(USERS["pro"]["tok"]), timeout=20)
        assert r.status_code == 422

    def test_too_short_400(self):
        r = _stt(USERS["pro"]["tok"], b"\x00" * 1000)
        assert r.status_code == 400 and "short" in r.json()["detail"].lower()

    def test_too_large_413(self):
        r = _stt(USERS["pro"]["tok"], b"\x00" * (5 * 1024 * 1024 + 10))
        assert r.status_code == 413

    def test_free_quota_429(self):
        tok = USERS["free"]["tok"]
        # 16s estimate (24KB/s) > 15s free cap
        r = _stt(tok, b"\x00" * (24 * 1024 * 16 + 100), name="big.wav", ctype="audio/wav")
        assert r.status_code == 429 and "upgrade" in r.json()["detail"].lower()

    def test_e2e_transcribe_tts_mp3(self):
        tok = USERS["pro"]["tok"]
        mp3 = USERS["pro"].get("mp3")
        if not mp3:
            pytest.skip("no mp3 from TTS test")
        before = _quota(tok)["stt_seconds_used"]
        r = _stt(tok, mp3, name="clip.mp3", ctype="audio/mpeg")
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        print("STT result:", d)
        assert "aiforge" in d["text"].lower().replace(" ", "") or "voice" in d["text"].lower()
        assert isinstance(d["seconds_est"], int) and d["seconds_est"] >= 1
        assert _quota(tok)["stt_seconds_used"] - before == d["seconds_est"]

    def test_wav_silence(self):
        r = _stt(USERS["pro"]["tok"], _wav_silence(2), name="s.wav", ctype="audio/wav")
        print("silence wav ->", r.status_code, r.text[:200])
        assert r.status_code == 200

    def test_garbage_audio_502_charges(self):
        tok = USERS["pro"]["tok"]
        before = _quota(tok)["stt_seconds_used"]
        r = _stt(tok, os.urandom(30 * 1024), name="junk.m4a")
        after = _quota(tok)["stt_seconds_used"]
        print("garbage ->", r.status_code, r.text[:200], "charged", after - before)
        assert r.status_code in (400, 502)


# ---------- Regressions ----------
class TestRegression:
    def test_root_health(self):
        # / and /health are backend-internal (public ingress sends non-/api to Expo)
        for u in ("http://localhost:8001/", "http://localhost:8001/health", f"{API}/"):
            assert requests.get(u, timeout=20).status_code == 200, u

    def test_demo_login_me(self):
        r = requests.post(f"{API}/auth/login", json=DEMO, timeout=20)
        assert r.status_code == 200
        me = requests.get(f"{API}/auth/me", headers=_h(r.json()["token"]), timeout=20)
        assert me.status_code == 200 and me.json()["email"] == DEMO["email"]

    def test_google_404(self):
        assert requests.post(f"{API}/auth/google", json={"session_id": "x"}, timeout=20).status_code == 404

    def test_sync_rejects_forged(self):
        tok = USERS["free"]["tok"]
        r = requests.post(f"{API}/subscription/sync", headers=_h(tok),
                          json={"entitlement_active": True, "product_id": "pro"}, timeout=20)
        assert r.status_code == 200 and r.json()["plan"] == "free"
        assert _quota(tok)["plan"] == "free"

    def test_webhook_unsigned_401(self):
        ev = {"event": {"type": "INITIAL_PURCHASE", "app_user_id": USERS["free"]["uid"]}}
        assert requests.post(f"{API}/webhook/revenuecat", json=ev, timeout=20).status_code == 401
        assert requests.post(f"{API}/webhook/revenuecat", json=ev, headers={"Authorization": "Bearer nope"},
                             timeout=20).status_code == 401

    def test_cancellation_no_downgrade(self):
        uid = USERS["pro"]["uid"]
        r = requests.post(f"{API}/webhook/revenuecat", headers={"Authorization": f"Bearer {SECRET}"},
                          json={"event": {"type": "CANCELLATION", "app_user_id": uid}}, timeout=20)
        assert r.status_code == 200 and r.json().get("processed") is False
        assert _quota(USERS["pro"]["tok"])["plan"] == "pro"


# ---------- Rate limits (LAST) ----------
class TestZRateLimits:
    def test_tts_rate_limit_30(self):
        tok = USERS["pro"]["tok"]
        _set_bucket(USERS["pro"]["uid"], "tts_chars", 0)
        codes = [_tts(tok, "hi").status_code for _ in range(35)]
        print("tts burst:", codes)
        assert 429 in codes and codes.index(429) <= 31

    def test_stt_rate_limit_20(self):
        tok = USERS["pro"]["tok"]
        codes = [_stt(tok, b"\x00" * 100).status_code for _ in range(25)]
        print("stt burst:", codes)
        assert 429 in codes and codes.index(429) <= 21

    def test_login_xff_spoof(self):
        codes = []
        for i in range(14):
            r = requests.post(f"{API}/auth/login", json={"email": "nobody@x.dev", "password": "wrongpass"},
                              headers={"X-Forwarded-For": f"10.0.{i}.{i}"}, timeout=20)
            codes.append(r.status_code)
        print("login burst:", codes)
        assert 429 in codes
