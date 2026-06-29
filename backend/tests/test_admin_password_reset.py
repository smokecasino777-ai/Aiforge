"""Tests for the NEW owner-only password reset endpoints (GET /admin/users, POST /admin/reset-user-password).

This is the headline fix for iteration 6 — we verify the full flow:
  - List users (owner only)
  - Reset alice's password, login with new, reset back to alice123
  - Negative paths: short pw, non-existent email, google-auth email, non-admin caller
"""
import os
import uuid
import requests
import pytest

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get("EXPO_BACKEND_URL", "https://fierce-forge-ios.preview.emergentagent.com"),
).rstrip("/")
API = f"{BASE_URL}/api"

DEMO_EMAIL = "demo@example.com"
DEMO_PASS = "demo1234"
ALICE_EMAIL = "alice@example.com"
ALICE_ORIG_PASS = "alice123"

GOOGLE_EMAIL = "smokecasino777@gmail.com"  # google-auth account in DB


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, password):
    r = session.post(f"{API}/auth/login", json={"email": email, "password": password})
    return r


@pytest.fixture(scope="module")
def demo_token(session):
    r = _login(session, DEMO_EMAIL, DEMO_PASS)
    assert r.status_code == 200, f"Demo login failed: {r.status_code} {r.text}"
    return r.json()["token"]


def auth_h(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- ensure alice exists (idempotent setup) ----------
@pytest.fixture(scope="module", autouse=True)
def ensure_alice(session, demo_token):
    """Make sure alice@example.com exists & password is alice123 at start of module."""
    r = session.post(f"{API}/auth/login", json={"email": ALICE_EMAIL, "password": ALICE_ORIG_PASS})
    if r.status_code == 200:
        return
    # try to register
    rr = session.post(f"{API}/auth/register", json={"email": ALICE_EMAIL, "password": ALICE_ORIG_PASS, "name": "Alice"})
    if rr.status_code == 200:
        return
    # account exists but pw drifted — reset via admin
    rs = session.post(
        f"{API}/admin/reset-user-password",
        headers=auth_h(demo_token),
        json={"email": ALICE_EMAIL, "new_password": ALICE_ORIG_PASS},
    )
    assert rs.status_code in (200, 404), f"could not normalize alice: {rs.status_code} {rs.text}"


# ---------- ensure alice is alice123 at end of module ----------
@pytest.fixture(scope="module", autouse=True)
def restore_alice(session, demo_token, ensure_alice):
    yield
    # Always reset to alice123 at teardown so credentials file stays accurate
    rs = session.post(
        f"{API}/admin/reset-user-password",
        headers=auth_h(demo_token),
        json={"email": ALICE_EMAIL, "new_password": ALICE_ORIG_PASS},
    )
    # If it 404s, alice was deleted during testing — log but don't fail teardown.
    print(f"[teardown] restore alice → {rs.status_code} {rs.text[:120]}")


# ============================================================
# /api/admin/me
# ============================================================
class TestAdminMe:
    def test_admin_me_demo_is_admin_true(self, session, demo_token):
        r = session.get(f"{API}/admin/me", headers=auth_h(demo_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_admin"] is True
        assert body["email"] == DEMO_EMAIL


# ============================================================
# GET /api/admin/users
# ============================================================
class TestAdminListUsers:
    def test_owner_can_list_users(self, session, demo_token):
        r = session.get(f"{API}/admin/users", headers=auth_h(demo_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "users" in body and isinstance(body["users"], list)
        assert "count" in body
        assert body["count"] == len(body["users"])
        assert body["count"] >= 3, f"expected >=3 users in DB, got {body['count']}"
        # required projected fields
        sample = body["users"][0]
        for k in ("user_id", "email"):
            assert k in sample, f"missing {k} in users projection: {sample.keys()}"
        # _id must NOT leak
        assert "_id" not in sample
        emails = [u["email"].lower() for u in body["users"]]
        assert DEMO_EMAIL in emails
        assert ALICE_EMAIL in emails

    def test_non_admin_blocked(self, session):
        # register a brand new throwaway user
        email = f"TEST_noadmin_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert reg.status_code == 200, reg.text
        tok = reg.json()["token"]
        r = session.get(f"{API}/admin/users", headers=auth_h(tok))
        assert r.status_code == 403, f"non-admin should get 403, got {r.status_code} {r.text[:200]}"

    def test_no_token_blocked(self, session):
        r = session.get(f"{API}/admin/users")
        assert r.status_code in (401, 403)


# ============================================================
# POST /api/admin/reset-user-password
# ============================================================
class TestAdminResetPassword:
    def test_reset_alice_round_trip(self, session, demo_token):
        new_pw = "alicepass99"
        # 1. reset alice → new_pw
        r1 = session.post(
            f"{API}/admin/reset-user-password",
            headers=auth_h(demo_token),
            json={"email": ALICE_EMAIL, "new_password": new_pw},
        )
        assert r1.status_code == 200, f"reset failed: {r1.status_code} {r1.text}"
        body = r1.json()
        assert body.get("ok") is True
        assert body.get("email") == ALICE_EMAIL

        # 2. old password must now FAIL
        r_old = _login(session, ALICE_EMAIL, ALICE_ORIG_PASS)
        assert r_old.status_code == 401, f"old pw still works after reset: {r_old.status_code}"

        # 3. new password must WORK
        r_new = _login(session, ALICE_EMAIL, new_pw)
        assert r_new.status_code == 200, f"new pw failed: {r_new.status_code} {r_new.text}"
        assert r_new.json().get("token")

        # 4. reset alice back to alice123
        r2 = session.post(
            f"{API}/admin/reset-user-password",
            headers=auth_h(demo_token),
            json={"email": ALICE_EMAIL, "new_password": ALICE_ORIG_PASS},
        )
        assert r2.status_code == 200, r2.text

        # 5. alice123 works again
        r_restore = _login(session, ALICE_EMAIL, ALICE_ORIG_PASS)
        assert r_restore.status_code == 200, f"restore login failed: {r_restore.status_code} {r_restore.text}"

    def test_short_password_rejected(self, session, demo_token):
        r = session.post(
            f"{API}/admin/reset-user-password",
            headers=auth_h(demo_token),
            json={"email": ALICE_EMAIL, "new_password": "12345"},
        )
        assert r.status_code == 400, r.text
        assert "6 characters" in r.text or "at least 6" in r.text

    def test_nonexistent_email_404(self, session, demo_token):
        bogus = f"nobody_{uuid.uuid4().hex[:6]}@example.com"
        r = session.post(
            f"{API}/admin/reset-user-password",
            headers=auth_h(demo_token),
            json={"email": bogus, "new_password": "Pass1234!"},
        )
        assert r.status_code == 404, f"expected 404, got {r.status_code} {r.text}"

    def test_google_only_account_rejected(self, session, demo_token):
        """If the target user signed up via Google, the endpoint must refuse with 400."""
        # First, check whether the google-auth seed user actually exists in this DB.
        rl = session.get(f"{API}/admin/users", headers=auth_h(demo_token))
        emails = [u["email"].lower() for u in rl.json().get("users", [])]
        if GOOGLE_EMAIL.lower() not in emails:
            pytest.skip(f"{GOOGLE_EMAIL} not in DB on this env — google-only branch un-testable here")
        r = session.post(
            f"{API}/admin/reset-user-password",
            headers=auth_h(demo_token),
            json={"email": GOOGLE_EMAIL, "new_password": "Newpass1234"},
        )
        assert r.status_code == 400, f"expected 400 for google-only, got {r.status_code} {r.text}"
        assert "Google" in r.text or "google" in r.text

    def test_non_admin_cannot_reset(self, session):
        email = f"TEST_neighbor_{uuid.uuid4().hex[:8]}@example.com"
        reg = session.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!"})
        assert reg.status_code == 200, reg.text
        tok = reg.json()["token"]
        r = session.post(
            f"{API}/admin/reset-user-password",
            headers=auth_h(tok),
            json={"email": ALICE_EMAIL, "new_password": "Hackerz123"},
        )
        assert r.status_code == 403, f"non-admin reset should 403, got {r.status_code} {r.text}"

    def test_no_token_cannot_reset(self, session):
        r = session.post(
            f"{API}/admin/reset-user-password",
            json={"email": ALICE_EMAIL, "new_password": "Whatever123"},
        )
        assert r.status_code in (401, 403)
