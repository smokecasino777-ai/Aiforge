"""AI generation: image, video, model3d, chat (single-shot + multi-turn),
SCAD code generation, and the creations CRUD.
"""
import base64
import uuid
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from ai_providers import generate_image, generate_text, generate_video
from core import (
    PLAN_LIMITS,
    daily_used,
    db,
    get_current_user,
    increment_usage,
    iso,
    logger,
    now_utc,
)
from models import ChatRequest, CreationOut, GenerateRequest, ScadRequest

router = APIRouter(tags=["generation"])


# ---------- Helpers ----------
async def _generate_image_sync(prompt: str, style_3d: bool = False) -> tuple[str, str]:
    """Returns (base64_data, mime). Raises on failure."""
    final_prompt = prompt
    if style_3d:
        final_prompt = (
            f"Isometric 3D render, octane render, studio lighting, ultra detailed 3D model of: {prompt}. "
            f"Solid object on neutral background, photorealistic 3D, sharp details."
        )
    return await generate_image(final_prompt)


async def _process_video_job(creation_id: str, prompt: str, duration: int, size: str):
    try:
        video_bytes, mime = await generate_video(prompt, duration, size)
        b64 = base64.b64encode(video_bytes).decode()
        await db.creations.update_one(
            {"creation_id": creation_id},
            {
                "$set": {
                    "status": "ready",
                    "media_data": b64,
                    "media_mime": mime,
                    "completed_at": iso(now_utc()),
                }
            },
        )
        logger.info(f"Video creation {creation_id} completed")
    except Exception as e:
        logger.exception("Video generation failed")
        await db.creations.update_one(
            {"creation_id": creation_id},
            {"$set": {"status": "failed", "error": str(e)[:300]}},
        )


def _doc_to_creation(doc: dict) -> CreationOut:
    return CreationOut(
        id=doc["creation_id"],
        type=doc["type"],
        title=doc.get("title", "Untitled"),
        prompt=doc.get("prompt", ""),
        status=doc.get("status", "ready"),
        media_data=doc.get("media_data"),
        media_mime=doc.get("media_mime"),
        preview_image=doc.get("preview_image"),
        error=doc.get("error"),
        created_at=doc.get("created_at", iso(now_utc())),
        width=doc.get("width"),
        height=doc.get("height"),
        duration=doc.get("duration"),
    )


# ---------- /generate ----------
@router.post("/generate", response_model=CreationOut)
async def generate(
    req: GenerateRequest,
    background: BackgroundTasks,
    user: dict = Depends(get_current_user),
):
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(
            status_code=402, detail=f"Daily limit reached ({limit}). Upgrade your plan."
        )

    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    title = (req.title or req.prompt[:60]).strip()
    base_doc = {
        "creation_id": creation_id,
        "user_id": user["user_id"],
        "type": req.type,
        "title": title,
        "prompt": req.prompt,
        "created_at": iso(now_utc()),
        "status": "processing",
    }

    if req.type in ("image", "model3d"):
        try:
            b64, mime = await _generate_image_sync(
                req.prompt, style_3d=(req.type == "model3d")
            )
        except Exception as e:
            logger.exception("Image generation failed")
            raise HTTPException(status_code=502, detail=f"Generation failed: {str(e)[:200]}")
        base_doc.update({"status": "ready", "media_data": b64, "media_mime": mime})
        await db.creations.insert_one(base_doc)
        await increment_usage(user["user_id"])
        return _doc_to_creation(base_doc)

    if req.type == "video":
        base_doc.update({"status": "processing", "duration": req.duration or 4})
        await db.creations.insert_one(base_doc)
        await increment_usage(user["user_id"])
        background.add_task(
            _process_video_job,
            creation_id,
            req.prompt,
            req.duration or 4,
            req.size or "1280x720",
        )
        return _doc_to_creation(base_doc)

    if req.type == "chat":
        try:
            reply = await generate_text(
                system=(
                    "You are AiForge Assistant, a helpful AI creative partner. "
                    "Help users brainstorm prompts for images, videos and 3D models."
                ),
                prompt=req.prompt,
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Chat failed: {str(e)[:200]}")
        base_doc.update(
            {
                "status": "ready",
                "media_mime": "text/plain",
                "media_data": base64.b64encode(reply.encode()).decode(),
            }
        )
        await db.creations.insert_one(base_doc)
        await increment_usage(user["user_id"])
        return _doc_to_creation(base_doc)

    raise HTTPException(status_code=400, detail="Unknown type")


# ---------- /chat (multi-turn) ----------
@router.post("/chat", response_model=dict)
async def chat_endpoint(req: ChatRequest, user: dict = Depends(get_current_user)):
    """Multi-turn chat with persistent history keyed by (user_id, session_id)."""
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(
            status_code=402, detail=f"Daily limit reached ({limit}). Upgrade your plan."
        )

    session_id = req.session_id or f"chat-{uuid.uuid4().hex[:12]}"

    transcript_doc = await db.chat_sessions.find_one(
        {"user_id": user["user_id"], "session_id": session_id},
        {"_id": 0, "messages": 1},
    )
    history: List[dict] = (transcript_doc or {}).get("messages", []) or []
    history = history[-30:]

    try:
        system = (
            "You are AiForge Assistant, an energetic creative AI co-pilot. "
            "You help users craft amazing prompts, brainstorm ideas, and answer questions about "
            "image, video and 3D AI generation. Be concise, vivid and helpful. "
            "Stay in character and remember context from earlier in the conversation."
        )

        prior_pairs: List[tuple[str, str]] = []
        i = 0
        while i < len(history) - 1:
            if history[i]["role"] == "user" and history[i + 1]["role"] == "assistant":
                prior_pairs.append((history[i]["text"], history[i + 1]["text"]))
                i += 2
            else:
                i += 1

        if prior_pairs:
            primer = "[Conversation so far \u2014 for context only, do not re-greet]:\n\n"
            for u, a in prior_pairs:
                primer += f"User: {u}\nAssistant: {a}\n\n"
            primer += f"User: {req.prompt}\n\nReply to the latest user message above, keeping prior context."
            reply = await generate_text(system, primer)
        else:
            reply = await generate_text(system, req.prompt)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Chat failed: {str(e)[:200]}")

    new_messages = history + [
        {"role": "user", "text": req.prompt, "ts": iso(now_utc())},
        {"role": "assistant", "text": reply, "ts": iso(now_utc())},
    ]
    await db.chat_sessions.update_one(
        {"user_id": user["user_id"], "session_id": session_id},
        {
            "$set": {
                "user_id": user["user_id"],
                "session_id": session_id,
                "messages": new_messages,
                "updated_at": iso(now_utc()),
            }
        },
        upsert=True,
    )
    await increment_usage(user["user_id"])
    return {"reply": reply, "session_id": session_id}


# ---------- /generate/scad ----------
@router.post("/generate/scad")
async def generate_scad(req: ScadRequest, user: dict = Depends(get_current_user)):
    """Generate OpenSCAD code for a 3D mesh + isometric PNG preview."""
    plan = user.get("plan", "free")
    limit = PLAN_LIMITS.get(plan, 5)
    used = await daily_used(user["user_id"])
    if used >= limit:
        raise HTTPException(
            status_code=402, detail=f"Daily limit reached ({limit}). Upgrade your plan."
        )
    try:
        code = await generate_text(
            system=(
                "You are an OpenSCAD code expert. Given a description, return ONLY valid OpenSCAD code "
                "(no markdown fences, no explanations). Use parameters and modules. Output should be ready "
                "to render with openscad CLI to produce STL."
            ),
            prompt=f"Generate OpenSCAD code for: {req.prompt}",
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"SCAD generation failed: {str(e)[:200]}")
    code = code.strip()
    if code.startswith("```"):
        code = code.split("\n", 1)[1] if "\n" in code else code
        if code.endswith("```"):
            code = code.rsplit("```", 1)[0]

    preview_b64: Optional[str] = None
    try:
        preview_b64, _ = await _generate_image_sync(req.prompt, style_3d=True)
    except Exception as e:
        logger.warning(f"SCAD preview image failed: {e}")

    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    doc = {
        "creation_id": creation_id,
        "user_id": user["user_id"],
        "type": "model3d",
        "title": (req.prompt[:60]).strip(),
        "prompt": req.prompt,
        "status": "ready",
        "media_data": base64.b64encode(code.encode()).decode(),
        "media_mime": "application/x-openscad",
        "preview_image": preview_b64,
        "created_at": iso(now_utc()),
        "scad_code": code,
    }
    await db.creations.insert_one(doc)
    await increment_usage(user["user_id"])
    return _doc_to_creation(doc)


# ---------- Creations CRUD ----------
@router.get("/creations", response_model=List[CreationOut])
async def list_creations(
    user: dict = Depends(get_current_user),
    type: Optional[str] = None,
    limit: int = 50,
):
    q: dict = {"user_id": user["user_id"]}
    if type:
        q["type"] = type
    docs = (
        await db.creations.find(q, {"_id": 0}).sort("created_at", -1).to_list(limit)
    )
    return [_doc_to_creation(d) for d in docs]


@router.get("/creations/stats")
async def creation_stats(user: dict = Depends(get_current_user)):
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$group": {"_id": "$type", "count": {"$sum": 1}}},
    ]
    counts = {"image": 0, "video": 0, "model3d": 0, "chat": 0}
    async for d in db.creations.aggregate(pipeline):
        counts[d["_id"]] = d["count"]
    return counts


@router.get("/creations/{creation_id}", response_model=CreationOut)
async def get_creation(creation_id: str, user: dict = Depends(get_current_user)):
    doc = await db.creations.find_one(
        {"creation_id": creation_id, "user_id": user["user_id"]}, {"_id": 0}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return _doc_to_creation(doc)


@router.delete("/creations/{creation_id}")
async def delete_creation(creation_id: str, user: dict = Depends(get_current_user)):
    res = await db.creations.delete_one(
        {"creation_id": creation_id, "user_id": user["user_id"]}
    )
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}
