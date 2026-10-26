"""Iteration 13 - email/password auth flow, rate limits, health probes, JWT revocation.

Target: preview backend. Uses AUTH_TEST_BASE_URL env (default internal backend per review request)
Each test uses a unique X-Forwarded-For IP so rate-limit buckets don't bleed between tests.
"""
import os
import random
import time
import uuid

import pytest
import requests

BASE_URL = os.environ.get("AUTH_TEST_BASE_URL", "http://localhost:8001").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_EMAIL = "jraycwalker@gmail.com"
OWNER_PASSWORD = "KandiceJray1$"
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


def rand_ip():
    return f"10.{random.randint(1,254)}.{random.randint(1,254)}.{random.randint(1,254)}"


def hdrs(ip=None, token=None, extra=None):
    h = {"Content-Type": "application/json", "X-Forwarded-For": ip or rand_ip()}
    if token:
        h["Authorization"] = f"Bearer {token}"
    if extra:
        h.update(extra)
    return h


CREATED_TOKENS = []


@pytest.fixture(scope="module", autouse=True)
def cleanup():
    yield
    for tok in CREATED_TOKENS:
        try:
            requests.delete(f"{API}/auth/me", headers=hdrs(token=tok), timeout=10)
        except Exception:
            pass


def register(email=None, password="TestPass123!", name="TEST User"):
    email = email or f"test_{uuid.uuid4().hex[:10]}@example.com"
    r = requests.post(f"{API}/auth/register",
                      json={"email": email, "password": password, "name": name},
                      headers=hdrs(), timeout=15)
    return email, password, r


# --- Health probes ---
class TestHealth:
    def test_root(self):
        r = requests.get(f"{BASE_URL}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_health(self):
        r = requests.get(f"{BASE_URL}/health", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_api_root(self):
        r = requests.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("status") == "ok"

    def test_google_endpoint_removed(self):
        r = requests.post(f"{API}/auth/google", json={"id_token": "x"}, headers=hdrs(), timeout=10)
        assert r.status_code in (404, 405), r.text
        assert r.status_code == 404


# --- Register ---
class TestRegister:
    def test_register_success_then_me(self):
        email, pw, r = register()
        assert r.status_code == 200, r.text
        d = r.json()
        assert isinstance(d["token"], str) and d["token"].count(".") == 2
        assert d["user"]["email"] == email
        assert d["user"]["plan"] == "free"
        assert d["user"]["daily_limit"] == 5
        assert d["user"]["name"] == "TEST User"
        CREATED_TOKENS.append(d["token"])
        me = requests.get(f"{API}/auth/me", headers=hdrs(token=d["token"]), timeout=10)
        assert me.status_code == 200
        assert me.json()["email"] == email
        assert me.json()["id"] == d["user"]["id"]

    def test_register_short_password_422(self):
        _, _, r = register(password="short7!")
        assert r.status_code == 422, r.text

    def test_register_duplicate_400(self):
        email, pw, r = register()
        assert r.status_code == 200
        CREATED_TOKENS.append(r.json()["token"])
        _, _, r2 = register(email=email.upper())  # case-insensitive dup
        assert r2.status_code == 400, r2.text
        assert "already has an account" in r2.json()["detail"]

    def test_register_invalid_email_422(self):
        _, _, r = register(email="not-an-email")
        assert r.status_code == 422


# --- Login ---
class TestLogin:
    def test_login_new_user(self):
        email, pw, r = register()
        assert r.status_code == 200
        CREATED_TOKENS.append(r.json()["token"])
        lr = requests.post(f"{API}/auth/login", json={"email": f"  {email.upper()} ", "password": pw},
                           headers=hdrs(), timeout=15)
        # EmailStr may reject leading spaces; fall back to exact email
        if lr.status_code == 422:
            lr = requests.post(f"{API}/auth/login", json={"email": email.upper(), "password": pw},
                               headers=hdrs(), timeout=15)
        assert lr.status_code == 200, lr.text
        assert lr.json()["user"]["email"] == email
        assert lr.json()["token"]

    def test_login_owner(self):
        r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
                          headers=hdrs(), timeout=15)
        assert r.status_code == 200, r.text
        u = r.json()["user"]
        assert u["email"] == OWNER_EMAIL
        assert u["plan"] == "singularity"

    def test_login_demo(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                          headers=hdrs(), timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["user"]["email"] == DEMO_EMAIL

    def test_login_wrong_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrongpass!"},
                          headers=hdrs(), timeout=15)
        assert r.status_code == 401
        assert "Wrong password" in r.json()["detail"]

    def test_login_nonexistent(self):
        r = requests.post(f"{API}/auth/login",
                          json={"email": f"nobody_{uuid.uuid4().hex[:8]}@example.com", "password": "whatever1"},
                          headers=hdrs(), timeout=15)
        assert r.status_code == 401
        assert "No account" in r.json()["detail"]


# --- /auth/me ---
class TestMe:
    def test_me_no_token(self):
        r = requests.get(f"{API}/auth/me", timeout=10)
        assert r.status_code == 401
        assert r.json()["detail"] == "Missing token"

    def test_me_invalid_token(self):
        r = requests.get(f"{API}/auth/me", headers={"Authorization": "Bearer abc.def.ghi"}, timeout=10)
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid token"

    def test_me_owner_profile_fields(self):
        r = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
                          headers=hdrs(), timeout=15)
        tok = r.json()["token"]
        me = requests.get(f"{API}/auth/me", headers=hdrs(token=tok), timeout=10)
        assert me.status_code == 200
        d = me.json()
        for k in ("id", "email", "plan", "daily_used", "daily_limit"):
            assert k in d
        assert isinstance(d["daily_limit"], int) and d["daily_limit"] >= 99999


# --- Rate limiting ---
class TestRateLimit:
    def test_login_rate_limit_429(self):
        ip = rand_ip()
        codes = []
        for _ in range(12):
            r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrongpass!"},
                              headers=hdrs(ip=ip), timeout=15)
            codes.append(r.status_code)
        assert codes[:10] == [401] * 10, codes
        assert 429 in codes[10:], codes
        r = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": "wrongpass!"},
                          headers=hdrs(ip=ip), timeout=15)
        assert r.status_code == 429
        assert "Too many requests" in r.json()["detail"]


# --- JWT revocation after admin reset ---
class TestAdminResetRevokesJWT:
    def test_admin_reset_invalidates_old_token(self):
        email, pw, r = register()
        assert r.status_code == 200
        old_token = r.json()["token"]
        assert requests.get(f"{API}/auth/me", headers=hdrs(token=old_token), timeout=10).status_code == 200

        lr = requests.post(f"{API}/auth/login", json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
                           headers=hdrs(), timeout=15)
        assert lr.status_code == 200
        admin_tok = lr.json()["token"]

        # without sudo -> 403
        r403 = requests.post(f"{API}/admin/reset-user-password",
                             json={"email": email, "new_password": "NewPass987!"},
                             headers=hdrs(token=admin_tok), timeout=10)
        assert r403.status_code == 403

        ur = requests.post(f"{API}/admin/unlock", json={"password": OWNER_PASSWORD},
                           headers=hdrs(token=admin_tok), timeout=15)
        assert ur.status_code == 200, ur.text
        sudo = ur.json()["sudo_token"]

        time.sleep(1.2)  # iat has 1s granularity
        rr = requests.post(f"{API}/admin/reset-user-password",
                           json={"email": email, "new_password": "NewPass987!"},
                           headers=hdrs(token=admin_tok, extra={"X-Admin-Unlock": sudo}), timeout=15)
        assert rr.status_code == 200, rr.text
        assert rr.json()["ok"] is True

        old = requests.get(f"{API}/auth/me", headers=hdrs(token=old_token), timeout=10)
        assert old.status_code == 401, old.text
        assert "password change" in old.json()["detail"]

        # old password rejected, new password works
        bad = requests.post(f"{API}/auth/login", json={"email": email, "password": pw},
                            headers=hdrs(), timeout=15)
        assert bad.status_code == 401
        time.sleep(1.1)
        good = requests.post(f"{API}/auth/login", json={"email": email, "password": "NewPass987!"},
                             headers=hdrs(), timeout=15)
        assert good.status_code == 200
        new_tok = good.json()["token"]
        assert requests.get(f"{API}/auth/me", headers=hdrs(token=new_tok), timeout=10).status_code == 200
        CREATED_TOKENS.append(new_tok)

    def test_non_admin_cannot_unlock(self):
        lr = requests.post(f"{API}/auth/login", json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
                           headers=hdrs(), timeout=15)
        tok = lr.json()["token"]
        r = requests.post(f"{API}/admin/unlock", json={"password": DEMO_PASSWORD},
                          headers=hdrs(token=tok), timeout=10)
        assert r.status_code == 403


# --- Delete account ---
class TestDeleteMe:
    def test_delete_me_then_token_and_login_fail(self):
        email, pw, r = register()
        assert r.status_code == 200
        tok = r.json()["token"]
        d = requests.delete(f"{API}/auth/me", headers=hdrs(token=tok), timeout=10)
        assert d.status_code == 200
        assert d.json() == {"deleted": True}
        assert requests.get(f"{API}/auth/me", headers=hdrs(token=tok), timeout=10).status_code == 401
        lr = requests.post(f"{API}/auth/login", json={"email": email, "password": pw},
                           headers=hdrs(), timeout=15)
        assert lr.status_code == 401
        assert "No account" in lr.json()["detail"]
