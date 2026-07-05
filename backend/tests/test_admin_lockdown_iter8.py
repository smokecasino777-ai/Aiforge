"""Iteration 8: Admin lockdown + sudo mode + demo demotion regression.

Tests via the PUBLIC preview URL (EXPO_PUBLIC_BACKEND_URL) to reflect what
Play Store users actually hit.
"""
import os
import uuid

import pytest
import requests

BASE = (
    os.environ.get("EXPO_PUBLIC_BACKEND_URL")
    or os.environ.get("EXPO_BACKEND_URL")
    or "https://fierce-forge-ios.preview.emergentagent.com"
).rstrip("/")
API = f"{BASE}/api"

OWNER_EMAIL = "jraycwalker@gmail.com"
OWNER_PW = "KandiceJray1$"
DEMO_EMAIL = "demo@example.com"
DEMO_PW = "demo1234"
BOB_EMAIL = "bob@example.com"
BOB_OLD_PW = "bob12345"
BOB_NEW_PW = "bobnew123"


@pytest.fixture(scope="module")
def s():
    return requests.Session()


def _login(s, email, pw):
    r = s.post(f"{API}/auth/login", json={"email": email, "password": pw}, timeout=20)
    return r


# ---------- P0 admin lockdown ----------
class TestOwnerLockdown:
    def test_owner_login_ok(self, s):
        r = _login(s, OWNER_EMAIL, OWNER_PW)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "token" in j and j["user"]["email"] == OWNER_EMAIL
        pytest.owner_token = j["token"]

    def test_owner_admin_me_true(self, s):
        h = {"Authorization": f"Bearer {pytest.owner_token}"}
        r = requests.get(f"{API}/admin/me", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["is_admin"] is True

    def test_admin_users_403_without_sudo(self, s):
        h = {"Authorization": f"Bearer {pytest.owner_token}"}
        r = requests.get(f"{API}/admin/users", headers=h, timeout=15)
        assert r.status_code == 403, r.text

    def test_stripe_key_get_403_without_sudo(self, s):
        h = {"Authorization": f"Bearer {pytest.owner_token}"}
        r = requests.get(f"{API}/admin/stripe-key", headers=h, timeout=15)
        assert r.status_code == 403

    def test_unlock_wrong_password_401(self, s):
        h = {"Authorization": f"Bearer {pytest.owner_token}"}
        r = requests.post(f"{API}/admin/unlock", headers=h, json={"password": "wrong"}, timeout=15)
        assert r.status_code == 401

    def test_unlock_correct_password_returns_sudo_token(self, s):
        h = {"Authorization": f"Bearer {pytest.owner_token}"}
        r = requests.post(f"{API}/admin/unlock", headers=h, json={"password": OWNER_PW}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "sudo_token" in j and j["expires_in_minutes"] == 15
        pytest.sudo = j["sudo_token"]

    def test_admin_users_200_with_sudo(self, s):
        h = {
            "Authorization": f"Bearer {pytest.owner_token}",
            "X-Admin-Unlock": pytest.sudo,
        }
        r = requests.get(f"{API}/admin/users", headers=h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert "users" in j and j["count"] >= 1
        emails = [u["email"] for u in j["users"]]
        assert OWNER_EMAIL in emails

    def test_stripe_key_get_sandbox_with_sudo(self, s):
        h = {
            "Authorization": f"Bearer {pytest.owner_token}",
            "X-Admin-Unlock": pytest.sudo,
        }
        r = requests.get(f"{API}/admin/stripe-key", headers=h, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["mode"] == "sandbox"
        assert j["is_sandbox"] is True
        assert j["is_live"] is False

    def test_reset_user_password_requires_sudo(self, s):
        # Without sudo
        h_no = {"Authorization": f"Bearer {pytest.owner_token}"}
        r = requests.post(
            f"{API}/admin/reset-user-password",
            headers=h_no,
            json={"email": BOB_EMAIL, "new_password": BOB_NEW_PW},
            timeout=15,
        )
        assert r.status_code == 403


# ---------- P0 demo demotion ----------
class TestDemoDemoted:
    def test_demo_login_ok(self, s):
        r = _login(s, DEMO_EMAIL, DEMO_PW)
        assert r.status_code == 200, r.text
        pytest.demo_token = r.json()["token"]

    def test_demo_admin_me_false(self, s):
        h = {"Authorization": f"Bearer {pytest.demo_token}"}
        r = requests.get(f"{API}/admin/me", headers=h, timeout=15)
        assert r.status_code == 200
        assert r.json()["is_admin"] is False

    def test_demo_admin_users_forbidden(self, s):
        h = {"Authorization": f"Bearer {pytest.demo_token}"}
        r = requests.get(f"{API}/admin/users", headers=h, timeout=15)
        # Non-admin blocked by ensure_admin BEFORE sudo check → 403
        assert r.status_code == 403

    def test_demo_unlock_forbidden(self, s):
        h = {"Authorization": f"Bearer {pytest.demo_token}"}
        r = requests.post(
            f"{API}/admin/unlock", headers=h, json={"password": DEMO_PW}, timeout=15
        )
        assert r.status_code == 403


# ---------- Bob password reset e2e ----------
class TestBobPasswordReset:
    def test_owner_resets_bob_password(self, s):
        # Login owner
        r = _login(s, OWNER_EMAIL, OWNER_PW)
        assert r.status_code == 200
        token = r.json()["token"]
        # Get sudo
        r = requests.post(
            f"{API}/admin/unlock",
            headers={"Authorization": f"Bearer {token}"},
            json={"password": OWNER_PW},
            timeout=15,
        )
        assert r.status_code == 200
        sudo = r.json()["sudo_token"]
        # Reset bob password
        r = requests.post(
            f"{API}/admin/reset-user-password",
            headers={"Authorization": f"Bearer {token}", "X-Admin-Unlock": sudo},
            json={"email": BOB_EMAIL, "new_password": BOB_NEW_PW},
            timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True

    def test_bob_new_password_works(self, s):
        r = _login(s, BOB_EMAIL, BOB_NEW_PW)
        assert r.status_code == 200, r.text

    def test_bob_old_password_rejected(self, s):
        r = _login(s, BOB_EMAIL, BOB_OLD_PW)
        assert r.status_code == 401


# ---------- Registration & plans smoke ----------
class TestSmoke:
    def test_plans_returns_six(self, s):
        r = requests.get(f"{API}/plans", timeout=15)
        assert r.status_code == 200
        plans = r.json()
        assert isinstance(plans, list) and len(plans) == 6

    def test_register_new_and_duplicate(self, s):
        email = f"TEST_iter8_{uuid.uuid4().hex[:8]}@example.com"
        r = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "testpw123", "name": "iter8"},
            timeout=20,
        )
        assert r.status_code == 200, r.text
        assert "token" in r.json()
        # Duplicate
        r2 = requests.post(
            f"{API}/auth/register",
            json={"email": email, "password": "testpw123"},
            timeout=15,
        )
        assert r2.status_code == 400
