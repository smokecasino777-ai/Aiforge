"""Phase-1 regression tests: payments guards, quote gating, CAD, and local video export."""

from __future__ import annotations

import os
import re
import sys
import tempfile
import subprocess
from pathlib import Path

import imageio_ffmpeg
import pytest
import requests


# ---------- env + credentials ----------
def _read_base_url() -> str:
    env_url = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL") or "").strip()
    if env_url:
        return env_url.rstrip("/")
    env_path = Path("/app/frontend/.env")
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("Missing EXPO_PUBLIC_BACKEND_URL/EXPO_BACKEND_URL")


def _read_creds(kind: str) -> tuple[str, str]:
    text = Path("/app/memory/test_credentials.md").read_text(encoding="utf-8")
    if kind == "demo":
        block = re.search(r"Customer demo account.*?Email\*\*: `([^`]+)`.*?Password\*\*: `([^`]+)`", text, re.S)
    else:
        block = re.search(r"OWNER / ADMIN account.*?Email\*\*: `([^`]+)`.*?Password\*\*: `([^`]+)`", text, re.S)
    if not block:
        raise RuntimeError(f"Missing {kind} credentials in /app/memory/test_credentials.md")
    return block.group(1), block.group(2)


BASE_URL = _read_base_url()
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session() -> requests.Session:
    s = requests.Session()
    return s


@pytest.fixture(scope="module")
def demo_auth(session: requests.Session) -> dict:
    email, password = _read_creds("demo")
    resp = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def owner_auth(session: requests.Session) -> dict:
    email, password = _read_creds("owner")
    resp = session.post(f"{API}/auth/login", json={"email": email, "password": password}, timeout=30)
    assert resp.status_code == 200, resp.text
    token = resp.json()["token"]
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- health + legal ----------
def test_health_and_legal_pages(session: requests.Session):
    health = session.get(f"{API}/health", timeout=30)
    assert health.status_code == 200
    assert health.json().get("status") == "ok"

    terms = session.get(f"{API}/legal/terms", timeout=30)
    privacy = session.get(f"{API}/legal/privacy", timeout=30)
    assert terms.status_code == 200
    assert privacy.status_code == 200
    assert "html" in terms.headers.get("content-type", "").lower()
    assert "html" in privacy.headers.get("content-type", "").lower()


# ---------- payments/catalog/budget guards ----------
def test_catalog_shape_and_disabled_products(session: requests.Session, demo_auth: dict):
    resp = session.get(f"{API}/credits/catalog", headers=demo_auth, timeout=30)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    products = data.get("products", [])
    monthly = [p for p in products if p.get("kind") == "monthly"]
    packs = [p for p in products if p.get("kind") == "purchased"]
    assert len(monthly) == 5
    assert len(packs) == 8
    assert any(p.get("id") == "creator" and p.get("suggested") for p in monthly)
    assert all(("available" in p) for p in products)


def test_non_owner_budget_routes_denied(session: requests.Session, demo_auth: dict):
    get_resp = session.get(f"{API}/credits/admin/budget", headers=demo_auth, timeout=30)
    put_resp = session.put(
        f"{API}/credits/admin/budget",
        headers=demo_auth,
        json={
            "funded_usd": 0,
            "evidence": "TEST_no_change_denied",
            "existing_prepaid_only": True,
            "sales_enabled": False,
        },
        timeout=30,
    )
    assert get_resp.status_code in {401, 403}
    assert put_resp.status_code in {401, 403}


def test_owner_budget_read_only_observation(session: requests.Session, owner_auth: dict):
    resp = session.get(f"{API}/credits/admin/budget", headers=owner_auth, timeout=30)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert isinstance(data.get("funded_micros"), int)
    assert isinstance(data.get("sales_enabled"), bool)


# ---------- quote + metering gates ----------
def test_unpriced_quote_rejected_before_provider_call(session: requests.Session, demo_auth: dict):
    resp = session.post(
        f"{API}/credits/quote",
        headers=demo_auth,
        json={"path": "/editor/caption", "payload": {"prompt": "TEST_caption"}, "quality": "economy"},
        timeout=30,
    )
    assert resp.status_code in {402, 503}, resp.text
    detail = str(resp.json().get("detail", "")).lower()
    assert ("paused" in detail) or ("verified" in detail) or ("needs" in detail) or ("available" in detail)


@pytest.mark.parametrize(
    "path,payload",
    [
        ("/chat", {"prompt": "TEST gated chat"}),
        ("/generate/scad", {"prompt": "TEST gated scad"}),
        ("/editor/caption", {"prompt": "TEST gated caption"}),
        ("/avatar/generate", {"prompt": "TEST gated avatar", "style": "cyberpunk"}),
        ("/voice/tts", {"text": "hello"}),
    ],
)
def test_ai_endpoints_require_quote(session: requests.Session, demo_auth: dict, path: str, payload: dict):
    before = session.get(f"{API}/credits/history", headers=demo_auth, timeout=30)
    assert before.status_code == 200
    before_count = len(before.json().get("requests", []))

    call = session.post(f"{API}{path}", headers=demo_auth, json=payload, timeout=45)
    assert call.status_code == 428, f"{path} expected 428, got {call.status_code}: {call.text[:300]}"

    after = session.get(f"{API}/credits/history", headers=demo_auth, timeout=30)
    assert after.status_code == 200
    assert len(after.json().get("requests", [])) == before_count


# ---------- webhook auth guard ----------
def test_revenuecat_webhook_missing_auth_never_grants(session: requests.Session, demo_auth: dict):
    me_before = session.get(f"{API}/auth/me", headers=demo_auth, timeout=30)
    assert me_before.status_code == 200
    old_plan = me_before.json().get("plan")

    payload = {
        "event": {
            "type": "INITIAL_PURCHASE",
            "app_user_id": me_before.json().get("id"),
            "product_id": "TEST_unknown",
            "entitlement_ids": ["pro"],
            "store": "PLAY_STORE",
            "event_timestamp_ms": 1735689600000,
            "expiration_at_ms": 1767225600000,
        }
    }
    unauth = session.post(f"{API}/webhook/revenuecat", json=payload, timeout=30)
    assert unauth.status_code in {401, 503}

    me_after = session.get(f"{API}/auth/me", headers=demo_auth, timeout=30)
    assert me_after.status_code == 200
    assert me_after.json().get("plan") == old_plan


# ---------- CAD + ownership ----------
def test_cad_primitive_transform_and_cross_account_guard(session: requests.Session, demo_auth: dict, owner_auth: dict):
    create = session.post(f"{API}/cad/primitive", headers=demo_auth, json={"shape": "box", "size_mm": 20}, timeout=60)
    assert create.status_code == 200, create.text
    created = create.json()
    mesh_id = created["mesh_id"]
    assert pytest.approx(20, rel=0.2) == max(created["dimensions"])

    transformed = session.post(
        f"{API}/cad/meshes/{mesh_id}/transform",
        headers=demo_auth,
        json={"scale": 2, "rotate_z": 90, "center": True},
        timeout=60,
    )
    assert transformed.status_code == 200, transformed.text
    tdata = transformed.json()
    assert tdata["mesh_id"] != mesh_id
    assert pytest.approx(40, rel=0.2) == max(tdata["dimensions"])

    other_user = session.get(f"{API}/cad/meshes/{mesh_id}", headers=owner_auth, timeout=30)
    assert other_user.status_code == 404


def test_cad_import_rejects_malformed_stl(session: requests.Session, demo_auth: dict):
    bad = {"file": ("bad.stl", b"not-an-stl", "model/stl")}
    headers = {"Authorization": demo_auth["Authorization"]}
    resp = session.post(f"{API}/cad/import", headers=headers, files=bad, timeout=30)
    assert resp.status_code == 400


# ---------- local video render logic ----------
def _tiny_mp4_bytes() -> bytes:
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    with tempfile.TemporaryDirectory(prefix="iter22-video-") as d:
        out = Path(d) / "tiny.mp4"
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-loglevel",
            "error",
            "-f",
            "lavfi",
            "-i",
            "testsrc=size=320x240:rate=24",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=44100:cl=stereo",
            "-t",
            "2",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-shortest",
            "-y",
            str(out),
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        assert result.returncode == 0, result.stderr.decode("utf-8", errors="ignore")
        return out.read_bytes()


def test_render_video_function_valid_and_invalid_range():
    if "/app/backend" not in sys.path:
        sys.path.append("/app/backend")
    from routes.creative_files import render_video
    from fastapi import HTTPException

    source = _tiny_mp4_bytes()
    rendered = render_video(source, start=0, end=1.5, rotation=90, flip=False, speed=1.5, mute=True)
    assert isinstance(rendered, bytes)
    assert len(rendered) > 1000

    with pytest.raises(HTTPException) as exc:
        render_video(source, start=0, end=10, rotation=0, flip=False, speed=1, mute=False)
    assert exc.value.status_code == 400


def test_video_export_http_rejects_over_duration_trim(session: requests.Session, demo_auth: dict):
    data = _tiny_mp4_bytes()
    files = {"file": ("tiny.mp4", data, "video/mp4")}
    headers = {"Authorization": demo_auth["Authorization"]}
    settings = {"settings": '{"start":0,"end":120,"speed":1,"rotation":0,"flip":false,"mute":false}'}
    resp = session.post(f"{API}/editor/video/export", headers=headers, files=files, data=settings, timeout=60)
    assert resp.status_code == 400
