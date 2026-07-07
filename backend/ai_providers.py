"""AI provider layer — Azure AI Foundry first (customer-owned key).

  TEXT   → Azure `gpt-4o` chat deployment (AZURE_DEPLOYMENT).
  IMAGE  → Azure `gpt-image-1` deployment when AZURE_IMAGE_DEPLOYMENT is set,
           else Emergent Gemini Nano Banana.
  VIDEO  → Azure `sora` deployment when AZURE_VIDEO_DEPLOYMENT is set,
           else Emergent OpenAI sora-2.

To finish moving 100% onto the customer's Azure resource, create the
`gpt-image-1` and `sora` deployments in Azure AI Foundry and set the two
env vars — no code changes needed.

All Azure calls use the resource's OpenAI v1 surface with `api-key` auth:
  {AZURE_OPENAI_BASE}/chat/completions | /images/generations | /images/edits
  | /video/generations/jobs (api-version=preview)
"""
import asyncio
import base64
import os
import uuid
from typing import Optional, Tuple

import httpx

from core import EMERGENT_LLM_KEY, logger

AZURE_API_KEY = os.environ.get("AZURE_API_KEY", "")
AZURE_OPENAI_BASE = (os.environ.get("AZURE_OPENAI_BASE", "") or "").rstrip("/")
AZURE_CHAT_DEPLOYMENT = os.environ.get("AZURE_DEPLOYMENT", "")
AZURE_IMAGE_DEPLOYMENT = os.environ.get("AZURE_IMAGE_DEPLOYMENT", "")
AZURE_VIDEO_DEPLOYMENT = os.environ.get("AZURE_VIDEO_DEPLOYMENT", "")

_AZ_HEADERS = {"api-key": AZURE_API_KEY}


def azure_text_enabled() -> bool:
    return bool(AZURE_API_KEY and AZURE_OPENAI_BASE and AZURE_CHAT_DEPLOYMENT)


def azure_image_enabled() -> bool:
    return bool(AZURE_API_KEY and AZURE_OPENAI_BASE and AZURE_IMAGE_DEPLOYMENT)


def azure_video_enabled() -> bool:
    return bool(AZURE_API_KEY and AZURE_OPENAI_BASE and AZURE_VIDEO_DEPLOYMENT)


# ---------------- TEXT ----------------
async def generate_text(system: str, prompt: str) -> str:
    """Chat completion. Azure gpt-4o primary; Emergent Claude only if Azure
    text env is not configured at all."""
    if azure_text_enabled():
        async with httpx.AsyncClient(timeout=90) as client:
            r = await client.post(
                f"{AZURE_OPENAI_BASE}/chat/completions",
                headers=_AZ_HEADERS,
                json={
                    "model": AZURE_CHAT_DEPLOYMENT,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": prompt},
                    ],
                    "max_tokens": 4000,
                },
            )
        if r.status_code != 200:
            raise RuntimeError(f"Azure chat error {r.status_code}: {r.text[:200]}")
        return (r.json()["choices"][0]["message"]["content"] or "").strip()

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"txt-{uuid.uuid4().hex}",
        system_message=system,
    ).with_model("anthropic", "claude-sonnet-4-6")
    return await chat.send_message(UserMessage(text=prompt))


# ---------------- IMAGE ----------------
async def generate_image(prompt: str) -> Tuple[str, str]:
    """Text→image. Returns (base64, mime)."""
    if azure_image_enabled():
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                f"{AZURE_OPENAI_BASE}/images/generations",
                headers=_AZ_HEADERS,
                json={
                    "model": AZURE_IMAGE_DEPLOYMENT,
                    "prompt": prompt,
                    "size": "1024x1024",
                    "n": 1,
                },
            )
        if r.status_code != 200:
            raise RuntimeError(f"Azure image error {r.status_code}: {r.text[:200]}")
        return r.json()["data"][0]["b64_json"], "image/png"

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"gen-{uuid.uuid4().hex}",
            system_message="You are an AI artist generating high-quality images.",
        )
        .with_model("gemini", "gemini-3.1-flash-image-preview")
        .with_params(modalities=["image", "text"])
    )
    _text, images = await chat.send_message_multimodal_response(UserMessage(text=prompt))
    if not images:
        raise RuntimeError("No image returned")
    img = images[0]
    return img["data"], img.get("mime_type", "image/png")


async def edit_image(
    image_b64: str, instruction: str, system: Optional[str] = None
) -> Tuple[str, str]:
    """Image + instruction → edited image. Returns (base64, mime)."""
    if azure_image_enabled():
        raw = base64.b64decode(image_b64.split(",")[-1])
        async with httpx.AsyncClient(timeout=300) as client:
            r = await client.post(
                f"{AZURE_OPENAI_BASE}/images/edits",
                headers=_AZ_HEADERS,
                data={"model": AZURE_IMAGE_DEPLOYMENT, "prompt": instruction},
                files={"image": ("input.png", raw, "image/png")},
            )
        if r.status_code != 200:
            raise RuntimeError(f"Azure image edit error {r.status_code}: {r.text[:200]}")
        return r.json()["data"][0]["b64_json"], "image/png"

    from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage

    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"edit-{uuid.uuid4().hex}",
            system_message=system
            or (
                "You are an expert image editor. Apply the requested transformation "
                "while preserving the subject and composition. Output only the edited image."
            ),
        )
        .with_model("gemini", "gemini-3.1-flash-image-preview")
        .with_params(modalities=["image", "text"])
    )
    _text, images = await chat.send_message_multimodal_response(
        UserMessage(text=instruction, file_contents=[ImageContent(image_b64)])
    )
    if not images:
        raise RuntimeError("No image returned from model")
    img = images[0]
    return img["data"], img.get("mime_type", "image/png")


# ---------------- VIDEO ----------------
async def generate_video(prompt: str, duration: int, size: str) -> Tuple[bytes, str]:
    """Text→video. Returns (mp4 bytes, mime)."""
    if azure_video_enabled():
        try:
            width, height = (int(x) for x in size.lower().split("x"))
        except Exception:
            width, height = 1280, 720
        async with httpx.AsyncClient(timeout=120) as client:
            r = await client.post(
                f"{AZURE_OPENAI_BASE}/video/generations/jobs?api-version=preview",
                headers=_AZ_HEADERS,
                json={
                    "model": AZURE_VIDEO_DEPLOYMENT,
                    "prompt": prompt,
                    "width": width,
                    "height": height,
                    "n_seconds": max(1, min(int(duration or 4), 20)),
                },
            )
            if r.status_code not in (200, 201):
                raise RuntimeError(f"Azure video error {r.status_code}: {r.text[:200]}")
            job_id = r.json()["id"]
            for _ in range(120):  # poll up to ~10 min
                await asyncio.sleep(5)
                jr = await client.get(
                    f"{AZURE_OPENAI_BASE}/video/generations/jobs/{job_id}?api-version=preview",
                    headers=_AZ_HEADERS,
                )
                job = jr.json()
                status = job.get("status")
                if status == "succeeded":
                    gen_id = job["generations"][0]["id"]
                    vr = await client.get(
                        f"{AZURE_OPENAI_BASE}/video/generations/{gen_id}/content/video?api-version=preview",
                        headers=_AZ_HEADERS,
                    )
                    if vr.status_code != 200:
                        raise RuntimeError(
                            f"Azure video download error {vr.status_code}"
                        )
                    return vr.content, "video/mp4"
                if status in ("failed", "cancelled"):
                    raise RuntimeError(
                        f"Azure video job {status}: {str(job.get('failure_reason'))[:160]}"
                    )
            raise RuntimeError("Azure video job timed out")

    from emergentintegrations.llm.openai.video_generation import OpenAIVideoGeneration

    def _blocking() -> bytes:
        gen = OpenAIVideoGeneration(api_key=EMERGENT_LLM_KEY)
        return gen.text_to_video(
            prompt=prompt,
            model="sora-2",
            size=size if size in OpenAIVideoGeneration.SIZES else "1280x720",
            duration=duration if duration in OpenAIVideoGeneration.DURATIONS else 4,
            max_wait_time=600,
        )

    loop = asyncio.get_event_loop()
    video_bytes = await loop.run_in_executor(None, _blocking)
    if not video_bytes:
        raise RuntimeError("No video returned")
    return video_bytes, "video/mp4"
