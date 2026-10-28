"""Private Emergent object storage; only metadata is persisted in MongoDB."""
import asyncio
import base64
import os
import uuid
import httpx
from dotenv import load_dotenv
from fastapi import HTTPException

load_dotenv()
_proxy = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip().rstrip("/")
BASE = _proxy + "/objstore/api/v1/storage" if _proxy else ""
_storage_key = None
_lock = asyncio.Lock()


async def init_storage():
    global _storage_key
    if not BASE:
        raise HTTPException(503, "Private media storage endpoint is not configured")
    if _storage_key:
        return _storage_key
    async with _lock:
        if not _storage_key:
            async with httpx.AsyncClient(timeout=30) as client:
                response = await client.post(BASE + "/init", json={"emergent_key": os.environ.get("EMERGENT_LLM_KEY")})
            if response.status_code != 200:
                raise HTTPException(503, "Private media storage is currently unavailable")
            _storage_key = response.json()["storage_key"]
    return _storage_key


async def put_media(user_id: str, raw: bytes, mime: str, extension: str):
    path = f"aiforge/uploads/{user_id}/{uuid.uuid4().hex}.{extension}"
    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.put(BASE + "/objects/" + path, content=raw,
            headers={"X-Storage-Key": await init_storage(), "Content-Type": mime})
    if response.status_code == 402:
        raise HTTPException(503, "Storage allowance is unavailable. Your original file has not been changed.")
    if response.status_code != 200:
        raise HTTPException(503, "Could not safely save media. Please keep your original file.")
    return response.json()["path"]


async def get_media(path: str):
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(BASE + "/objects/" + path, headers={"X-Storage-Key": await init_storage()})
    if response.status_code != 200:
        raise HTTPException(503, "Saved media could not be retrieved")
    return response.content


async def store_document_media(doc: dict):
    if doc.get("media_mime", "").startswith(("image/", "video/")) and doc.get("media_data"):
        raw = base64.b64decode(doc["media_data"].split(",")[-1], validate=True)
        extension = "mp4" if doc["media_mime"].startswith("video/") else "png"
        doc["storage_path"] = await put_media(doc["user_id"], raw, doc["media_mime"], extension)
        doc.pop("media_data", None)
    return doc