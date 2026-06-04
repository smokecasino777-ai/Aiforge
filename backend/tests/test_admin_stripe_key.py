"""Admin-only Stripe key rotation endpoint tests + regression on prior flows.

Covers iteration 5 additions:
- GET  /api/admin/me          (is_admin true for owner, false for non-admin)
- GET  /api/admin/stripe-key  (current mode/fingerprint, admin-gated)
- POST /api/admin/stripe-key  (prefix validation, Stripe validation, sandbox shortcut, hot-swap)
- DELETE /api/admin/stripe-key (revert to sandbox + persist to .env)
- 401 (no bearer) and 403 (non-admin) protection
- Regression: /auth/login, /auth/me, /checkout/create, /referrals/me, /creations, /creations/stats
- Atomic .env rewrite (STRIPE_API_KEY line is replaced, not appended)
"""
import os
import uuid
import time
import requests
import pytest
from pathlib import Path

BASE_URL = os.environ.get(
    "EXPO_PUBLIC_BACKEND_URL",
    os.environ.get(
        "EXPO_BACKEND_URL",
        "https://fierce-forge-ios.preview.emergentagent.com",
    ),
).rstrip("/")
API = f"{BASE_URL}/api"
ENV_PATH = Path("/app/backend/.env")
SANDBOX_KEY = "sk_test_emergent"


def auth_h(tok: str) -> dict:
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def admin_token(session):
    r = session.post(
        f"{API}/auth/login",
        json={"email": "demo@example.com", "password": "demo1234"},
    )
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def non_admin_token(session):
    # Try to log alice in; if she does not exist, register her.
    r = session.post(
        f"{API}/auth/login",
        json={"email": "alice@example.com", "password": "alice123"},
    )
    if r.status_code != 200:
        r = session.post(
            f"{API}/auth/register",
            json={"email": "alice@example.com", "password": "alice123", "name": "Alice"},
        )
    assert r.status_code == 200, f"alice auth failed: {r.status_code} {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module", autouse=True)
def reset_env_after(admin_token, session):
    """Ensure .env STRIPE_API_KEY is restored to sandbox after this module runs."""
    yield
    try:
        session.delete(f"{API}/admin/stripe-key", headers=auth_h(admin_token))
    except Exception:
        pass


# -------------------- Auth protection --------------------
class TestAdminAuthProtection:
    def test_admin_me_without_token_returns_401_or_403(self, session):
        r = session.get(f"{API}/admin/me")
        # FastAPI HTTPBearer returns 401 (no creds) or 403 depending on auto_error.
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_admin_stripe_key_get_without_token_returns_401_or_403(self, session):
        r = session.get(f"{API}/admin/stripe-key")
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_admin_stripe_key_post_without_token_returns_401_or_403(self, session):
        r = session.post(f"{API}/admin/stripe-key", json={"key": "sk_test_emergent"})
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_admin_stripe_key_delete_without_token_returns_401_or_403(self, session):
        r = session.delete(f"{API}/admin/stripe-key")
        assert r.status_code in (401, 403), f"got {r.status_code}: {r.text}"

    def test_non_admin_blocked_with_403(self, session, non_admin_token):
        r = session.get(f"{API}/admin/stripe-key", headers=auth_h(non_admin_token))
        assert r.status_code == 403, f"got {r.status_code}: {r.text}"

    def test_non_admin_post_blocked_with_403(self, session, non_admin_token):
        r = session.post(
            f"{API}/admin/stripe-key",
            json={"key": "sk_test_emergent"},
            headers=auth_h(non_admin_token),
        )
        assert r.status_code == 403, f"got {r.status_code}: {r.text}"

    def test_non_admin_delete_blocked_with_403(self, session, non_admin_token):
        r = session.delete(f"{API}/admin/stripe-key", headers=auth_h(non_admin_token))
        assert r.status_code == 403, f"got {r.status_code}: {r.text}"


# -------------------- /admin/me --------------------
class TestAdminMe:
    def test_admin_me_for_owner(self, session, admin_token):
        r = session.get(f"{API}/admin/me", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("is_admin") is True
        assert (body.get("email") or "").lower() == "demo@example.com"

    def test_admin_me_for_non_admin(self, session, non_admin_token):
        r = session.get(f"{API}/admin/me", headers=auth_h(non_admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("is_admin") is False
        assert (body.get("email") or "").lower() == "alice@example.com"


# -------------------- GET /admin/stripe-key --------------------
class TestAdminStripeKeyGet:
    def test_returns_mode_and_fingerprint(self, session, admin_token):
        r = session.get(f"{API}/admin/stripe-key", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert "mode" in body
        assert "fingerprint" in body
        assert "is_sandbox" in body
        assert "is_live" in body
        # Default starts in sandbox
        assert body["mode"] in ("sandbox", "test", "live", "unknown")


# -------------------- POST /admin/stripe-key --------------------
class TestAdminStripeKeyPost:
    def test_rejects_empty_key(self, session, admin_token):
        r = session.post(
            f"{API}/admin/stripe-key", json={"key": ""}, headers=auth_h(admin_token)
        )
        assert r.status_code == 400, r.text
        assert "empty" in r.text.lower() or "key" in r.text.lower()

    def test_rejects_bad_prefix(self, session, admin_token):
        r = session.post(
            f"{API}/admin/stripe-key",
            json={"key": "pk_test_abc123"},
            headers=auth_h(admin_token),
        )
        assert r.status_code == 400, r.text
        body = r.json()
        assert "sk_live_" in (body.get("detail") or "")
        assert "sk_test_" in (body.get("detail") or "")

    def test_rejects_invalid_stripe_key(self, session, admin_token):
        # Valid prefix but obviously not a real Stripe key -> Stripe rejects with 401.
        r = session.post(
            f"{API}/admin/stripe-key",
            json={"key": "sk_test_thisisnotarealstripekey_" + uuid.uuid4().hex},
            headers=auth_h(admin_token),
        )
        assert r.status_code == 400, f"expected 400, got {r.status_code}: {r.text}"
        body = r.json()
        detail = (body.get("detail") or "").lower()
        assert "stripe" in detail or "rejected" in detail or "invalid" in detail

    def test_accepts_sandbox_placeholder_and_hot_swaps(self, session, admin_token):
        r = session.post(
            f"{API}/admin/stripe-key",
            json={"key": SANDBOX_KEY},
            headers=auth_h(admin_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("mode") == "sandbox"
        assert body.get("fingerprint")
        assert body.get("updated_at")

        # Verify GET reflects hot-swap
        g = session.get(f"{API}/admin/stripe-key", headers=auth_h(admin_token))
        assert g.status_code == 200
        gbody = g.json()
        assert gbody.get("mode") == "sandbox"
        assert gbody.get("is_sandbox") is True
        assert gbody.get("is_live") is False

    def test_env_file_atomically_updated(self, session, admin_token):
        """Ensure .env was rewritten in place (single STRIPE_API_KEY=… line)."""
        # First, set it again to be sure the write happened during this run.
        r = session.post(
            f"{API}/admin/stripe-key",
            json={"key": SANDBOX_KEY},
            headers=auth_h(admin_token),
        )
        assert r.status_code == 200, r.text

        text = ENV_PATH.read_text()
        stripe_lines = [
            ln for ln in text.splitlines() if ln.strip().startswith("STRIPE_API_KEY=")
        ]
        assert len(stripe_lines) == 1, f"Expected exactly 1 STRIPE_API_KEY line, got {len(stripe_lines)}: {stripe_lines}"
        assert stripe_lines[0] == f"STRIPE_API_KEY={SANDBOX_KEY}"

        # Fingerprint + updated_at should also appear exactly once each.
        fp_lines = [ln for ln in text.splitlines() if ln.strip().startswith("STRIPE_KEY_FINGERPRINT=")]
        ts_lines = [ln for ln in text.splitlines() if ln.strip().startswith("STRIPE_KEY_UPDATED_AT=")]
        assert len(fp_lines) == 1
        assert len(ts_lines) == 1


# -------------------- DELETE /admin/stripe-key --------------------
class TestAdminStripeKeyDelete:
    def test_revert_to_sandbox(self, session, admin_token):
        r = session.delete(f"{API}/admin/stripe-key", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("ok") is True
        assert body.get("mode") == "sandbox"

        # Persisted to .env
        text = ENV_PATH.read_text()
        assert f"STRIPE_API_KEY={SANDBOX_KEY}" in text

        # Hot-swap reflected on GET
        g = session.get(f"{API}/admin/stripe-key", headers=auth_h(admin_token))
        assert g.status_code == 200
        assert g.json().get("mode") == "sandbox"


# -------------------- Regression of prior flows --------------------
class TestRegressionAuth:
    def test_login_demo_works(self, session):
        r = session.post(
            f"{API}/auth/login",
            json={"email": "demo@example.com", "password": "demo1234"},
        )
        assert r.status_code == 200, r.text
        assert "token" in r.json()
        assert r.json()["user"]["email"].lower() == "demo@example.com"

    def test_auth_me_works(self, session, admin_token):
        r = session.get(f"{API}/auth/me", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        u = r.json()
        assert u.get("email", "").lower() == "demo@example.com"
        assert "plan" in u


class TestRegressionCheckout:
    def test_checkout_create_sandbox(self, session, admin_token):
        # Ensure sandbox is active so this is deterministic.
        session.post(
            f"{API}/admin/stripe-key",
            json={"key": SANDBOX_KEY},
            headers=auth_h(admin_token),
        )
        r = session.post(
            f"{API}/checkout/create",
            json={
                "plan": "forge",
                "origin_url": "https://fierce-forge-ios.preview.emergentagent.com",
            },
            headers=auth_h(admin_token),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("url"), f"no checkout url in {body}"
        assert body.get("session_id")


class TestRegressionReferrals:
    def test_referrals_me(self, session, admin_token):
        r = session.get(f"{API}/referrals/me", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        for key in ("code", "referred_count", "share_text"):
            assert key in body, f"missing {key} in {body}"


class TestRegressionCreations:
    def test_creations_list(self, session, admin_token):
        r = session.get(f"{API}/creations", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_creations_stats(self, session, admin_token):
        r = session.get(f"{API}/creations/stats", headers=auth_h(admin_token))
        assert r.status_code == 200, r.text
        body = r.json()
        # Just sanity check it returns an object (shape verified in older suite).
        assert isinstance(body, dict)
