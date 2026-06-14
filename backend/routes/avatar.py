"""Avatar Maker — generate stylized portraits via Nano Banana
and optionally set them as the user's profile picture.

Endpoints:
  POST /api/avatar/generate  — {prompt, style} → {creation_id, image_b64, mime}
  POST /api/avatar/set       — {image_b64} → sets users.picture
  POST /api/avatar/clear     — clears users.picture
"""
import base64
import uuid
from typing import Literal, Optional

from emergentintegrations.llm.chat import LlmChat, UserMessage
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from core import (
    EMERGENT_LLM_KEY,
    PLAN_LIMITS,
    daily_used,
    db,
    get_current_user,
    increment_usage,
    iso,
    logger,
    now_utc,
    user_to_out,
)

router = APIRouter(tags=["avatar"])


STYLE_PROMPTS = {
    "cyberpunk": (
        "Cyberpunk portrait of: {desc}. Neon-lit face, holographic implants, "
        "magenta and cyan rim lighting, futuristic city bokeh background, "
        "highly detailed, cinematic, square 1:1 portrait composition."
    ),
    "anime": (
        "Anime-style portrait of: {desc}. Clean line art, cel shading, vibrant "
        "colors, expressive eyes, dynamic hair, Ghibli-inspired pastel background, "
        "1:1 square portrait composition."
    ),
    "neon_noir": (
        "Neon-noir portrait of: {desc}. Dramatic chiaroscuro lighting, magenta "
        "and teal palette, rain-slick urban background, cinematic anamorphic feel, "
        "atmospheric haze, square 1:1 portrait composition."
    ),
    "fantasy": (
        "High-fantasy portrait of: {desc}. Painterly oil texture, warm golden "
        "hour lighting, ornate armor or robe details, magical aura, mythic "
        "background, 1:1 square portrait composition."
    ),
    "pixel_art": (
        "16-bit pixel art portrait of: {desc}. Limited palette, sharp blocky "
        "pixels, retro game aesthetic, square 1:1 portrait composition, "
        "centered subject on a contrasting tile background."
    ),
    "cinematic": (
        "Cinematic photographic portrait of: {desc}. Hollywood teal-and-orange "
        "color grade, shallow depth of field, anamorphic lens flares, filmic "
        "grain, dramatic key light, 1:1 square portrait composition."
    ),
}

ALLOWED_STYLES = sorted(STYLE_PROMPTS.keys())


# ---------- Models ----------
class AvatarGenerateRequest(BaseModel):
    prompt: str
    style: Literal[
        "cyberpunk", "anime", "neon_noir", "fantasy", "pixel_art", "cinematic"
    ] = "cyberpunk"


class AvatarSetRequest(BaseModel):
    image_b64: str
    media_mime: Optional[str] = "image/png"


# ---------- Endpoints ----------
@router.post("/avatar/generate")
async def avatar_generate(
    req: AvatarGenerateRequest, user: dict = Depends(get_current_user)
):
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(
            status_code=402, detail=f"Daily limit reached ({limit}). Upgrade your plan."
        )
    desc = (req.prompt or "").strip()
    if len(desc) < 3:
        raise HTTPException(
            status_code=400, detail="Describe your avatar in a sentence (min 3 chars)."
        )
    template = STYLE_PROMPTS.get(req.style)
    if not template:
        raise HTTPException(
            status_code=400, detail=f"Unknown style. Allowed: {ALLOWED_STYLES}"
        )
    prompt = template.format(desc=desc)

    try:
        chat = (
            LlmChat(
                api_key=EMERGENT_LLM_KEY,
                session_id=f"avatar-{uuid.uuid4().hex}",
                system_message=(
                    "You are an expert portrait artist generating high-quality 1:1 "
                    "square avatars suitable for app profile pictures. Always center "
                    "the subject. Never include text. Never include watermarks."
                ),
            )
            .with_model("gemini", "gemini-3.1-flash-image-preview")
            .with_params(modalities=["image", "text"])
        )
        _text, images = await chat.send_message_multimodal_response(
            UserMessage(text=prompt)
        )
    except Exception as e:
        logger.exception("Avatar generation failed")
        raise HTTPException(
            status_code=502, detail=f"Avatar generation failed: {str(e)[:200]}"
        )
    if not images:
        raise HTTPException(status_code=502, detail="No image returned from model")
    img = images[0]
    img_b64 = img["data"]
    mime = img.get("mime_type", "image/png")

    # Save into Library as an avatar-type creation
    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    doc = {
        "creation_id": creation_id,
        "user_id": user["user_id"],
        "type": "image",
        "subtype": "avatar",
        "title": f"Avatar · {req.style.replace('_', ' ').title()}",
        "prompt": desc,
        "style": req.style,
        "status": "ready",
        "media_data": img_b64,
        "media_mime": mime,
        "created_at": iso(now_utc()),
    }
    await db.creations.insert_one(doc)
    await increment_usage(user["user_id"])
    return {
        "creation_id": creation_id,
        "image_b64": img_b64,
        "media_mime": mime,
        "style": req.style,
    }


@router.post("/avatar/set")
async def avatar_set(req: AvatarSetRequest, user: dict = Depends(get_current_user)):
    if not (req.image_b64 or "").strip():
        raise HTTPException(status_code=400, detail="image_b64 is required")
    # Bound profile pictures to ~3 MB raw bytes to keep MongoDB doc lean.
    try:
        raw_len = len(base64.b64decode(req.image_b64.split(",")[-1], validate=False))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid base64")
    if raw_len > 3 * 1024 * 1024:
        raise HTTPException(
            status_code=413, detail="Avatar too large (limit 3MB raw)."
        )
    picture = f"data:{req.media_mime or 'image/png'};base64,{req.image_b64}"
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"picture": picture}}
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": (await user_to_out(fresh)).model_dump()}


@router.post("/avatar/clear")
async def avatar_clear(user: dict = Depends(get_current_user)):
    await db.users.update_one(
        {"user_id": user["user_id"]}, {"$set": {"picture": None}}
    )
    fresh = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return {"ok": True, "user": (await user_to_out(fresh)).model_dump()}
