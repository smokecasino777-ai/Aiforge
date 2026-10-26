"""Release-build regression checks for backend reachability/health."""

import os
from pathlib import Path

import requests


def _public_base_url() -> str:
    """Read public preview host from frontend env without hardcoding defaults."""
    env_path = Path("/app/frontend/.env")
    raw = env_path.read_text(encoding="utf-8")
    for line in raw.splitlines():
        if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
            return line.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("EXPO_PUBLIC_BACKEND_URL is missing in /app/frontend/.env")


PUBLIC_BASE = _public_base_url()
INTERNAL_BASE = os.environ.get("INTERNAL_BACKEND_BASE", "http://localhost:8001").rstrip("/")


class TestReleaseBuildRegression:
    """Release config smoke tests: public API ingress + internal liveness endpoints."""

    def test_public_api_root_health(self):
        r = requests.get(f"{PUBLIC_BASE}/api/", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("name") == "AiForge API"

    def test_internal_root_health(self):
        r = requests.get(f"{INTERNAL_BASE}/", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("service") == "AiForge API"

    def test_internal_health_endpoint(self):
        r = requests.get(f"{INTERNAL_BASE}/health", timeout=20)
        assert r.status_code == 200
        body = r.json()
        assert body.get("status") == "ok"
        assert body.get("service") == "AiForge API"
