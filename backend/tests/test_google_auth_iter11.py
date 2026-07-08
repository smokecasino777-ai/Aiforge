"""Iteration 11 — Google Sign-in integration + backend regression."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://fierce-forge-ios.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "jraycwalker@gmail.com"
OWNER_PASSWORD = "KandiceJray1$"
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ------------------ Google auth endpoint ------------------

class TestGoogleAuthEndpoint:
    def test_bogus_session_id_401(self, client):
        r = client.post(f"{API}/auth/google", json={"session_id": "obviously-not-real-sid"})
        assert r.status_code == 401, r.text
        assert r.json().get("detail") == "Invalid Google session"

    def test_missing_session_id_422(self, client):
        r = client.post(f"{API}/auth/google", json={})
        assert r.status_code == 422, r.text

    def test_empty_session_id(self, client):
        r = client.post(f"{API}/auth/google", json={"session_id": ""})
        # Empty string is still a string → 401 from the upstream, or 422 if pydantic rejects
        assert r.status_code in (401, 422), r.text


# ------------------ Regression: email/password login ------------------

class TestEmailPasswordAuth:
    def test_demo_login_success(self, client):
        r = client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        assert r.status_code == 200, r.text
        data = r.json()
        assert "token" in data
        assert data["user"]["email"] == DEMO_EMAIL

    def test_owner_login_and_admin(self, client):
        r = client.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        assert r.status_code == 200, r.text
        token = r.json()["token"]
        user = r.json()["user"]
        assert user["plan"] == "singularity"

        me = client.get(f"{API}/admin/me", headers={"Authorization": f"Bearer {token}"})
        assert me.status_code == 200, me.text
        assert me.json()["is_admin"] is True

    def test_admin_lockdown_without_sudo(self, client):
        r = client.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD})
        token = r.json()["token"]
        # /admin/users must require sudo (X-Admin-Unlock header)
        r = client.get(f"{API}/admin/users", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 403, r.text

    def test_login_wrong_password_401(self, client):
        r = client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrongpw"})
        assert r.status_code == 401

    def test_login_unknown_email_401(self, client):
        r = client.post(f"{API}/auth/login", json={"email": "nobody-xyz-9999@example.com", "password": "whatever"})
        assert r.status_code == 401


# ------------------ Registration ------------------

class TestRegistration:
    _created_email = None

    def test_register_new_and_duplicate(self, client):
        email = f"test_iter11_{uuid.uuid4().hex[:8]}@example.com"
        TestRegistration._created_email = email
        r = client.post(f"{API}/auth/register", json={"email": email, "password": "testpw123", "name": "iter11"})
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["user"]["email"] == email
        assert data["user"]["referral_code"], "referral_code should be issued"

        # verify persistence by logging in
        r2 = client.post(f"{API}/auth/login", json={"email": email, "password": "testpw123"})
        assert r2.status_code == 200

        # Duplicate
        r3 = client.post(f"{API}/auth/register", json={"email": email, "password": "testpw123"})
        assert r3.status_code == 400


# ------------------ Plans / chat sanity ------------------

class TestMisc:
    def test_plans_count(self, client):
        r = client.get(f"{API}/plans")
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list)
        assert len(plans) == 6, f"Expected 6 plans, got {len(plans)}"

    def test_azure_chat_smoke(self, client):
        # Log in as demo (cheap plan)
        r = client.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD})
        token = r.json()["token"]
        r2 = client.post(
            f"{API}/chat",
            json={"prompt": "Say hi in 3 words"},
            headers={"Authorization": f"Bearer {token}"},
            timeout=60,
        )
        assert r2.status_code == 200, r2.text
        assert isinstance(r2.json().get("reply"), str) and len(r2.json()["reply"]) > 0
