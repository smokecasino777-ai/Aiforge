"""Iteration 12 backend regression:
- Google/GitHub/git-sync code removed
- /api/admin/git/status -> 404, /api/admin/health -> 404
- Deployment root probe: GET / -> 200 {status: ok}
- Auth: demo + owner email/password login, admin sudo lockdown, plans=6,
  duplicate register 400, wrong password 401, /api/auth/google with bogus
  session_id still 401 (endpoint retained but unused), Azure /api/chat 200.
"""
import os
import time
import pytest
import requests

PUBLIC_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "").rstrip("/") or \
             "https://fierce-forge-ios.preview.emergentagent.com"
INTERNAL_URL = "http://localhost:8001"  # for un-prefixed root probe

API = f"{PUBLIC_URL}/api"

OWNER_EMAIL = "jraycwalker@gmail.com"
OWNER_PASSWORD = "KandiceJray1$"
DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "demo1234"


@pytest.fixture(scope="module")
def s():
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session


# ---------- Deployment / root health ----------
def test_internal_root_returns_status_ok(s):
    r = s.get(f"{INTERNAL_URL}/", timeout=10)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body.get("status") == "ok"


# ---------- Removed endpoints (P0) ----------
def test_admin_git_status_removed(s):
    r = s.get(f"{API}/admin/git/status", timeout=10)
    assert r.status_code == 404, f"expected 404 got {r.status_code}: {r.text[:200]}"


def test_admin_git_pull_removed(s):
    r = s.post(f"{API}/admin/git/pull", timeout=10)
    assert r.status_code == 404


def test_admin_git_push_removed(s):
    r = s.post(f"{API}/admin/git/push", timeout=10)
    assert r.status_code == 404


def test_admin_health_removed(s):
    r = s.get(f"{API}/admin/health", timeout=10)
    assert r.status_code == 404


# ---------- Public / auth ----------
def test_plans_returns_six(s):
    r = s.get(f"{API}/plans", timeout=10)
    assert r.status_code == 200
    plans = r.json()
    assert isinstance(plans, list)
    assert len(plans) == 6


def test_demo_login_success(s):
    r = s.post(f"{API}/auth/login",
               json={"email": DEMO_EMAIL, "password": DEMO_PASSWORD},
               timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    assert "token" in body or "access_token" in body
    token = body.get("token") or body.get("access_token")
    assert token
    # verify session works
    me = s.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert me.status_code == 200


def test_owner_login_and_is_admin(s):
    r = s.post(f"{API}/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
               timeout=15)
    assert r.status_code == 200, r.text
    body = r.json()
    token = body.get("token") or body.get("access_token")
    assert token
    me = s.get(f"{API}/admin/me", headers={"Authorization": f"Bearer {token}"}, timeout=10)
    assert me.status_code == 200, me.text
    data = me.json()
    assert data.get("is_admin") is True


def test_wrong_password_401(s):
    r = s.post(f"{API}/auth/login",
               json={"email": DEMO_EMAIL, "password": "wrong-password-xyz"},
               timeout=15)
    assert r.status_code == 401


def test_duplicate_register_400(s):
    r = s.post(f"{API}/auth/register",
               json={"email": DEMO_EMAIL, "password": "whatever123"},
               timeout=15)
    assert r.status_code == 400


def test_google_endpoint_still_returns_401_for_bogus_sid(s):
    # Endpoint retained but unused by app — must NOT be 404.
    r = s.post(f"{API}/auth/google",
               json={"session_id": "totally-bogus-not-real-session"},
               timeout=15)
    assert r.status_code == 401, f"expected 401 got {r.status_code}: {r.text[:200]}"


# ---------- Admin sudo lockdown ----------
def _owner_token(s):
    r = s.post(f"{API}/auth/login",
               json={"email": OWNER_EMAIL, "password": OWNER_PASSWORD},
               timeout=15)
    r.raise_for_status()
    return r.json().get("token") or r.json().get("access_token")


def test_sudo_lockdown_without_unlock_403(s):
    token = _owner_token(s)
    r = s.get(f"{API}/admin/stripe-key",
              headers={"Authorization": f"Bearer {token}"},
              timeout=10)
    assert r.status_code == 403


def test_sudo_unlock_and_read_stripe_key(s):
    token = _owner_token(s)
    unlock = s.post(f"{API}/admin/unlock",
                    headers={"Authorization": f"Bearer {token}"},
                    json={"password": OWNER_PASSWORD},
                    timeout=10)
    assert unlock.status_code == 200, unlock.text
    sudo = unlock.json().get("sudo_token") or unlock.json().get("token")
    assert sudo
    r = s.get(f"{API}/admin/stripe-key",
              headers={"Authorization": f"Bearer {token}",
                       "X-Admin-Unlock": sudo},
              timeout=10)
    assert r.status_code == 200, r.text


# ---------- Azure text sanity (single short call) ----------
def test_azure_chat_short_message(s):
    token = _owner_token(s)
    r = s.post(f"{API}/chat",
               headers={"Authorization": f"Bearer {token}"},
               json={"prompt": "Say hi in one word."},
               timeout=45)
    assert r.status_code == 200, r.text
    body = r.json()
    # accept a few common response shapes
    text = body.get("reply") or body.get("response") or body.get("message") or ""
    assert isinstance(body, dict)
    assert text or body  # some response present
