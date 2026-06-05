"""AI-powered editor backend.

Image transforms via Gemini Nano Banana (image-in / image-out):
  - POST /api/editor/enhance        (auto-enhance, denoise, sharpen, 4K)
  - POST /api/editor/style          (cyberpunk / anime / oil-painting / watercolor / pixel)
  - POST /api/editor/bg-remove      (isolate subject, transparent / studio bg)

Text via Claude Sonnet:
  - POST /api/editor/caption        (social-ready caption + hashtags)

Persistence:
  - POST /api/editor/save           (save the edited buffer as a new creation)
"""
import base64
import uuid
from typing import Literal, Optional

from emergentintegrations.llm.chat import ImageContent, LlmChat, UserMessage
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
)

router = APIRouter(tags=["editor"])

# ---------- Models ----------


class EditRequest(BaseModel):
    image_b64: str  # raw base64, no data: prefix


class StyleRequest(EditRequest):
    style: str  # validated against STYLE_PROMPTS in the handler so we return 400 (not 422)


class CaptionRequest(BaseModel):
    prompt: str
    media_type: Literal["image", "video", "model3d", "chat"] = "image"
    title: Optional[str] = None


class SaveRequest(BaseModel):
    media_b64: str
    media_mime: str  # e.g. "image/png", "video/mp4"
    type: Literal["image", "video", "model3d"] = "image"
    title: str
    prompt: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[int] = None


# ---------- Internal helpers ----------


async def _check_quota(user: dict) -> None:
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(
            status_code=402,
            detail=f"Daily limit reached ({limit}). Upgrade your plan.",
        )


async def _edit_image(
    image_b64: str, instruction: str, system: Optional[str] = None
) -> tuple[str, str]:
    """Run Nano Banana with the source image + instruction. Returns (b64, mime)."""
    chat = (
        LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"edit-{uuid.uuid4().hex}",
            system_message=(
                system
                or "You are an expert image editor. Apply the requested transformation "
                "while preserving the subject and composition. Output only the edited image."
            ),
        )
        .with_model("gemini", "gemini-3.1-flash-image-preview")
        .with_params(modalities=["image", "text"])
    )
    try:
        _text, images = await chat.send_message_multimodal_response(
            UserMessage(text=instruction, file_contents=[ImageContent(image_b64)])
        )
    except Exception as e:
        logger.exception("Nano Banana edit failed")
        raise HTTPException(status_code=502, detail=f"Edit failed: {str(e)[:200]}")
    if not images:
        raise HTTPException(status_code=502, detail="No image returned from model")
    img = images[0]
    return img["data"], img.get("mime_type", "image/png")


STYLE_PROMPTS = {
    "cyberpunk": (
        "Transform into a cyberpunk-aesthetic image: neon pink / cyan glow, rain-slick streets, "
        "holographic accents, futuristic atmosphere, high-contrast moody lighting. Preserve subject identity."
    ),
    "anime": (
        "Convert into anime-style illustration: clean line art, cel shading, vibrant colors, "
        "expressive eyes if a person, Ghibli-inspired backgrounds where applicable. Preserve composition."
    ),
    "oil_painting": (
        "Reinterpret as an oil painting in the style of classical Impressionism: visible brush strokes, "
        "rich textured paint, warm color palette, painterly atmospheric lighting."
    ),
    "watercolor": (
        "Reinterpret as a delicate watercolor painting: soft washes, bleeding edges, paper texture, "
        "transparent layered pigments, light airy feel."
    ),
    "pixel_art": (
        "Convert to 16-bit pixel art: limited palette, sharp blocky pixels, retro game aesthetic, "
        "consistent dithering."
    ),
    "neon_noir": (
        "Reimagine as a neon-noir film still: dramatic chiaroscuro lighting, magenta + teal palette, "
        "cinematic anamorphic feel, atmospheric haze, slick reflective surfaces."
    ),
    "studio_ghibli": (
        "Convert into Studio Ghibli style: soft watercolor backgrounds, expressive characters, "
        "warm pastoral atmosphere, hand-painted feel, gentle lighting."
    ),
    "cinematic": (
        "Color-grade as a cinematic film still: teal-and-orange Hollywood grade, shallow depth of field, "
        "anamorphic lens flares, filmic grain, dramatic key light."
    ),
}


# ---------- Endpoints ----------


@router.post("/editor/enhance")
async def editor_enhance(req: EditRequest, user: dict = Depends(get_current_user)):
    """Auto-enhance: denoise, sharpen, color-correct, mild upscale feel."""
    await _check_quota(user)
    if not (req.image_b64 or "").strip():
        raise HTTPException(status_code=400, detail="image_b64 is required")
    instruction = (
        "Auto-enhance this image: dramatically increase clarity and detail, denoise smoothly, "
        "color-correct skin/sky, gently sharpen edges, recover shadows and highlights, "
        "boost vibrance subtly, deliver a clean 4K-grade render. Keep composition identical."
    )
    data, mime = await _edit_image(req.image_b64, instruction)
    await increment_usage(user["user_id"])
    return {"image_b64": data, "media_mime": mime, "op": "enhance"}


@router.post("/editor/style")
async def editor_style(req: StyleRequest, user: dict = Depends(get_current_user)):
    """Style transfer with curated presets."""
    await _check_quota(user)
    if not (req.image_b64 or "").strip():
        raise HTTPException(status_code=400, detail="image_b64 is required")
    instruction = STYLE_PROMPTS.get(req.style)
    if not instruction:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown style preset. Allowed: {sorted(STYLE_PROMPTS.keys())}",
        )
    data, mime = await _edit_image(req.image_b64, instruction)
    await increment_usage(user["user_id"])
    return {"image_b64": data, "media_mime": mime, "op": f"style:{req.style}"}


@router.post("/editor/bg-remove")
async def editor_bg_remove(req: EditRequest, user: dict = Depends(get_current_user)):
    """Background removal — best-effort via Nano Banana (paints a clean studio bg)."""
    await _check_quota(user)
    if not (req.image_b64 or "").strip():
        raise HTTPException(status_code=400, detail="image_b64 is required")
    instruction = (
        "Remove the background entirely and replace it with a clean studio-grade neutral "
        "background (solid dark navy #0A0A14 if subject is light, solid white if subject is dark). "
        "Isolate the subject cleanly along its true silhouette. Preserve subject details, hair, "
        "edges and lighting. No watermarks or text."
    )
    data, mime = await _edit_image(req.image_b64, instruction)
    await increment_usage(user["user_id"])
    return {"image_b64": data, "media_mime": mime, "op": "bg_remove"}


@router.post("/editor/caption")
async def editor_caption(req: CaptionRequest, user: dict = Depends(get_current_user)):
    """AI Caption + hashtag generator (Claude Sonnet)."""
    await _check_quota(user)
    media_kind = {
        "image": "image",
        "video": "video clip",
        "model3d": "3D model render",
        "chat": "prompt",
    }.get(req.media_type, "creation")
    sys = (
        "You are a viral social-media copy writer. Given a creator's prompt for a piece of media, "
        "produce: a short caption (max 18 words), a hook line (max 8 words), and 6 relevant hashtags. "
        "Tone: confident, modern, cyberpunk-coded. Output strict JSON like: "
        '{"hook":"...","caption":"...","hashtags":["#tag1","#tag2",...]}. '
        "No prose, no markdown, no backticks."
    )
    try:
        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"cap-{uuid.uuid4().hex}",
            system_message=sys,
        ).with_model("anthropic", "claude-sonnet-4-6")
        out = await chat.send_message(
            UserMessage(
                text=(
                    f"Media type: {media_kind}\n"
                    f"Title: {(req.title or '').strip()}\n"
                    f"Creator prompt: {req.prompt.strip()}\n\nReturn JSON only."
                )
            )
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Caption AI failed: {str(e)[:200]}")
    import json
    text = (out or "").strip()
    # strip markdown fences if any
    if text.startswith("```"):
        text = text.split("\n", 1)[1] if "\n" in text else text
        if text.endswith("```"):
            text = text.rsplit("```", 1)[0]
    try:
        data = json.loads(text)
        if not isinstance(data.get("hashtags"), list):
            raise ValueError("hashtags missing")
    except Exception:
        # Fallback: dump whatever we got into a flat caption.
        data = {
            "hook": (req.title or req.prompt[:60]).strip(),
            "caption": text[:240],
            "hashtags": ["#aiart", "#aiforge", "#createwithai"],
        }
    await increment_usage(user["user_id"])
    return data


@router.post("/editor/save")
async def editor_save(req: SaveRequest, user: dict = Depends(get_current_user)):
    """Persist an edited buffer as a new creation in the user's library."""
    if not req.media_b64:
        raise HTTPException(status_code=400, detail="Empty buffer")
    # Bound size at 60 MB raw bytes (~80 MB base64) to protect Mongo doc limit.
    try:
        raw_len = len(base64.b64decode(req.media_b64.split(",")[-1], validate=False))
    except Exception:
        raise HTTPException(status_code=400, detail="media_b64 is not valid base64")
    if raw_len > 60 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large (limit 60MB)")
    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    doc = {
        "creation_id": creation_id,
        "user_id": user["user_id"],
        "type": req.type,
        "title": (req.title or req.prompt[:60]).strip() or "Edited",
        "prompt": req.prompt,
        "status": "ready",
        "media_data": req.media_b64,
        "media_mime": req.media_mime,
        "created_at": iso(now_utc()),
        "edited": True,
    }
    if req.width:
        doc["width"] = req.width
    if req.height:
        doc["height"] = req.height
    if req.duration:
        doc["duration"] = req.duration
    await db.creations.insert_one(doc)
    return {"creation_id": creation_id, "ok": True}
