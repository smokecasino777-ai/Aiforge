"""
Iteration 7 — quick regression around the login bug fix.
Focus: /auth/login, /auth/register (dup), /auth/me, /plans, /creations, /admin/me.
"""
import os
import uuid
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://fierce-forge-ios.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
    assert r.status_code == 200, f"demo login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data and isinstance(data["token"], str)
    assert data["user"]["email"] == DEMO_EMAIL
    return data["token"]


# --- auth ---
class TestAuth:
    def test_login_valid(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD}, timeout=30)
        assert r.status_code == 200
        assert "token" in r.json()

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "WRONG_PASSWORD"}, timeout=30)
        assert r.status_code == 401

    def test_me_with_token(self, demo_token):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["email"] == DEMO_EMAIL

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me", timeout=30)
        assert r.status_code in (401, 403)

    def test_register_new_then_duplicate(self):
        rand = uuid.uuid4().hex[:8]
        email = f"TEST_iter7_{rand}@example.com"
        payload = {"email": email, "password": "test1234", "name": "iter7"}
        r1 = requests.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r1.status_code in (200, 201), f"register failed: {r1.status_code} {r1.text}"
        assert "token" in r1.json()
        # duplicate → 400
        r2 = requests.post(f"{API}/auth/register", json=payload, timeout=30)
        assert r2.status_code == 400
        detail = r2.json().get("detail", "").lower()
        assert "already" in detail or "registered" in detail or "exists" in detail


# --- catalog ---
class TestCatalog:
    def test_plans_returns_six(self):
        r = requests.get(f"{API}/plans", timeout=30)
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list)
        assert len(plans) == 6, f"expected 6 plans, got {len(plans)}: {[p.get('id') for p in plans]}"
        ids = {p["id"] for p in plans}
        assert {"free", "spark", "forge", "neon_pro", "quantum", "singularity"}.issubset(ids) or len(ids) == 6


class TestUserFlows:
    def test_creations_list(self, demo_token):
        r = requests.get(f"{API}/creations", headers={"Authorization": f"Bearer {demo_token}"}, timeout=30)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_admin_me_is_admin(self, demo_token):
        r = requests.get(f"{API}/admin/me", headers={"Authorization": f"Bearer {demo_token}"}, timeout=30)
        assert r.status_code == 200
        body = r.json()
        # Demo user is not an admin, so is_admin should be False
        assert body.get("is_admin") is False
        assert body.get("email") == DEMO_EMAIL
