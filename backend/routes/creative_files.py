"""Real, bounded local CAD and video operations. No AI provider calls."""
import asyncio
import io
import json
import math
import os
import subprocess
import tempfile
import uuid
import imageio_ffmpeg
import numpy as np
import trimesh
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from core import db, get_current_user, iso, now_utc
from media_storage import get_media, put_media

router = APIRouter(tags=["creative-files"])
_render_slots = asyncio.Semaphore(2)


def parse_stl(raw):
    if len(raw) > 10 * 1024 * 1024:
        raise HTTPException(413, "STL limit is 10 MB")
    try:
        mesh = trimesh.load(io.BytesIO(raw), file_type="stl", force="mesh")
        if not len(mesh.faces) or len(mesh.faces) > 100000 or not np.isfinite(mesh.vertices).all() or np.max(np.abs(mesh.vertices)) > 1000000:
            raise ValueError("invalid geometry")
        return mesh
    except Exception:
        raise HTTPException(400, "Use a valid ASCII or binary STL with at most 100,000 triangles")


def mesh_summary(mesh):
    sample = mesh.triangles[::max(1, math.ceil(len(mesh.faces) / 600))]
    return {"triangles": len(mesh.faces), "dimensions": mesh.extents.tolist(), "watertight": bool(mesh.is_watertight),
            "preview": sample.tolist(), "units": "mm", "note": "STL has no units. AiForge interprets coordinates as millimetres. Check dimensions and mesh quality in your slicer."}


async def save_mesh(user, mesh, name):
    mesh_id = uuid.uuid4().hex
    path = await put_media(user["user_id"], mesh.export(file_type="stl"), "model/stl", "stl")
    summary = mesh_summary(mesh)
    await db.cad_meshes.insert_one({"mesh_id": mesh_id, "user_id": user["user_id"], "storage_path": path,
        "name": name[:100], "created_at": iso(now_utc()), "summary": {k: v for k, v in summary.items() if k != "preview"}})
    return {"mesh_id": mesh_id, "name": name[:100], **summary}


@router.post("/cad/import")
async def import_stl(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    raw = await file.read(10 * 1024 * 1024 + 1)
    mesh = await asyncio.to_thread(parse_stl, raw)
    return await save_mesh(user, mesh, file.filename or "Imported STL")


class Primitive(BaseModel):
    shape: str = "box"
    size_mm: float = Field(default=20, gt=0, le=1000)


@router.post("/cad/primitive")
async def primitive(req: Primitive, user: dict = Depends(get_current_user)):
    if req.shape == "box":
        mesh = trimesh.creation.box(extents=[req.size_mm] * 3)
    elif req.shape == "sphere":
        mesh = trimesh.creation.icosphere(subdivisions=3, radius=req.size_mm / 2)
    elif req.shape == "cylinder":
        mesh = trimesh.creation.cylinder(radius=req.size_mm / 2, height=req.size_mm, sections=64)
    else:
        raise HTTPException(400, "Choose box, sphere or cylinder")
    return await save_mesh(user, mesh, req.shape.title())


async def owned_mesh(mesh_id, user):
    doc = await db.cad_meshes.find_one({"mesh_id": mesh_id, "user_id": user["user_id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(404, "Mesh not found")
    return doc


@router.get("/cad/meshes")
async def list_meshes(user: dict = Depends(get_current_user)):
    return await db.cad_meshes.find({"user_id": user["user_id"]}, {"_id": 0, "storage_path": 0}).sort("created_at", -1).to_list(30)


@router.get("/cad/meshes/{mesh_id}")
async def read_mesh(mesh_id: str, user: dict = Depends(get_current_user)):
    doc = await owned_mesh(mesh_id, user)
    mesh = await asyncio.to_thread(parse_stl, await get_media(doc["storage_path"]))
    return {"mesh_id": mesh_id, "name": doc["name"], **mesh_summary(mesh)}


class Transform(BaseModel):
    scale: float = Field(default=1, ge=0.01, le=100)
    rotate_x: float = Field(default=0, ge=-360, le=360)
    rotate_y: float = Field(default=0, ge=-360, le=360)
    rotate_z: float = Field(default=0, ge=-360, le=360)
    center: bool = True


@router.post("/cad/meshes/{mesh_id}/transform")
async def transform_mesh(mesh_id: str, req: Transform, user: dict = Depends(get_current_user)):
    doc = await owned_mesh(mesh_id, user)
    mesh = await asyncio.to_thread(parse_stl, await get_media(doc["storage_path"]))
    if req.center:
        mesh.apply_translation(-mesh.bounds.mean(axis=0))
    mesh.apply_scale(req.scale)
    matrix = trimesh.transformations.euler_matrix(*[math.radians(x) for x in (req.rotate_x, req.rotate_y, req.rotate_z)])
    mesh.apply_transform(matrix)
    return await save_mesh(user, mesh, doc["name"] + " · edited")


@router.get("/cad/meshes/{mesh_id}/export")
async def export_mesh(mesh_id: str, user: dict = Depends(get_current_user)):
    doc = await owned_mesh(mesh_id, user)
    return Response(await get_media(doc["storage_path"]), media_type="model/stl", headers={
        "Content-Disposition": 'attachment; filename="aiforge-model.stl"', "Cache-Control": "private, no-store"})


def render_video(raw, start, end, rotation, flip, speed, mute):
    with tempfile.TemporaryDirectory(prefix="aiforge-video-") as folder:
        source, output = os.path.join(folder, "input.mp4"), os.path.join(folder, "output.mp4")
        with open(source, "wb") as handle:
            handle.write(raw)
        reader = imageio_ffmpeg.read_frames(source, input_params=["-protocol_whitelist", "file,pipe"])
        try:
            metadata = next(reader)
        except Exception:
            raise HTTPException(400, "Could not read this video")
        finally:
            reader.close()
        duration = float(metadata.get("duration", 0))
        if not math.isfinite(duration) or duration <= 0 or end > duration + 0.05:
            raise HTTPException(400, "Trim end must be within the actual video duration")
        filters = ["scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2"]
        filters += {0: [], 90: ["transpose=1"], 180: ["hflip", "vflip"], 270: ["transpose=2"]}[rotation]
        if flip:
            filters.append("hflip")
        filters.append(f"setpts=PTS/{speed}")
        args = [imageio_ffmpeg.get_ffmpeg_exe(), "-nostdin", "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "file,pipe",
                "-ss", str(start), "-i", source, "-t", str((end - start) / speed), "-vf", ",".join(filters),
                "-map", "0:v:0", "-map", "0:a:0?", "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-threads", "1", "-pix_fmt", "yuv420p"]
        args += ["-an"] if mute else ["-af", f"atempo={speed}", "-c:a", "aac"]
        args += ["-movflags", "+faststart", "-map_metadata", "-1", "-y", output]
        result = subprocess.run(args, capture_output=True, timeout=120)
        if result.returncode != 0 or not os.path.exists(output) or os.path.getsize(output) < 1000:
            raise HTTPException(400, "Video could not be rendered. Use a valid MP4/MOV and a trim range within the clip.")
        with open(output, "rb") as handle:
            data = handle.read(60 * 1024 * 1024 + 1)
        if len(data) > 60 * 1024 * 1024:
            raise HTTPException(413, "Rendered file exceeds the 60 MB limit")
        return data


@router.post("/editor/video/export")
async def video_export(file: UploadFile = File(...), settings: str = Form(...), user: dict = Depends(get_current_user)):
    try:
        options = json.loads(settings)
        start, end, speed = float(options.get("start", 0)), float(options["end"]), float(options.get("speed", 1))
        rotation = int(options.get("rotation", 0)) % 360
        if not all(math.isfinite(v) for v in (start, end, speed)) or not 0 <= start < end or end - start > 60 or not 0.5 <= speed <= 2 or rotation not in {0, 90, 180, 270}:
            raise ValueError()
    except Exception:
        raise HTTPException(400, "Choose a clip of at most 60 seconds, speed 0.5–2x, and 90-degree rotations")
    raw = await file.read(60 * 1024 * 1024 + 1)
    if len(raw) > 60 * 1024 * 1024:
        raise HTTPException(413, "Video upload limit is 60 MB")
    async with _render_slots:
        data = await asyncio.to_thread(render_video, raw, start, end, rotation, bool(options.get("flip")), speed, bool(options.get("mute")))
    path = await put_media(user["user_id"], data, "video/mp4", "mp4")
    creation_id = f"cr_{uuid.uuid4().hex[:14]}"
    await db.creations.insert_one({"creation_id": creation_id, "user_id": user["user_id"], "type": "video", "status": "ready",
        "title": "Edited video", "prompt": f"Trim {start}–{end}s · {speed}x", "duration": (end-start)/speed,
        "media_mime": "video/mp4", "storage_path": path, "created_at": iso(now_utc()), "edited": True})
    return {"ok": True, "creation_id": creation_id, "duration": (end-start)/speed, "bytes": len(data)}