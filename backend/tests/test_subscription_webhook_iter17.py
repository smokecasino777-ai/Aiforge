"""Iter17 - final: free-Pro exploit still dead, optional sync body, SIGNED RevenueCat webhook
(secret live), CANCELLATION/BILLING_ISSUE no-downgrade, non-dict payload 400, grandfathering,
auth regression. Rate-limit tests run LAST. Secret is read from backend/.env and never printed.
"""
import os
import time
import uuid
from pathlib import Path

import pytest
import requests
from dotenv import dotenv_values

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
DEMO = {"email": "demo@example.com", "password": "demo1234"}
SECRET = (dotenv_values(Path(__file__).resolve().parents[1] / ".env").get("REVENUECAT_WEBHOOK_SECRET") or "").strip()
WH = f"{BASE_URL}/api/webhook/revenuecat"
STATE = {}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register(prefix):
    email = f"{prefix}.{uuid.uuid4().hex[:10]}@aiforgeqa.dev"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Passw0rd!x", "name": "QA iter17"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _delete(tok):
    d = requests.delete(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20)
    assert d.status_code == 200, d.text
    assert requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20).status_code == 401


def _me(tok):
    return requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20).json()


def _sync(tok):
    r = requests.post(f"{BASE_URL}/api/subscription/sync", headers=_h(tok), timeout=20)
    assert r.status_code == 200, r.text
    return r.json()


def _evt(uid, etype, auth=None, exp_ms=None):
    ev = {"type": etype, "app_user_id": uid, "product_id": "prod77b31683df", "id": uuid.uuid4().hex}
    if exp_ms:
        ev["expiration_at_ms"] = exp_ms
    headers = {"Content-Type": "application/json"}
    if auth is not None:
        headers["Authorization"] = auth
    return requests.post(WH, json={"api_version": "1.0", "event": ev}, headers=headers, timeout=20)


@pytest.fixture(scope="module")
def secret():
    if not SECRET:
        pytest.skip("REVENUECAT_WEBHOOK_SECRET not set")
    return SECRET


# ---------- Health ----------
class TestHealth:
    def test_root(self):
        assert requests.get("http://localhost:8001/", timeout=20).status_code == 200

    def test_health(self):
        assert requests.get("http://localhost:8001/health", timeout=20).status_code == 200

    def test_api_root(self):
        assert requests.get(f"{BASE_URL}/api/", timeout=20).status_code == 200


# ---------- Auth regression ----------
class TestAuthRegression:
    def test_demo_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json=DEMO, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["token"].count(".") == 2 and d["user"]["email"] == DEMO["email"]
        STATE["demo_token"] = d["token"]
        STATE["demo_uid"] = d["user"]["user_id"]

    def test_me(self):
        tok = STATE.get("demo_token") or pytest.skip()
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20)
        assert r.status_code == 200 and r.json()["email"] == DEMO["email"]
        assert requests.get(f"{BASE_URL}/api/auth/me", timeout=20).status_code == 401

    def test_google_deleted(self):
        r = requests.post(f"{BASE_URL}/api/auth/google", json={"session_id": "x"}, timeout=20)
        assert r.status_code == 404


# ---------- Sync read-only + optional body ----------
class TestSync:
    def test_exploit_dead(self):
        tok, user = _register("TEST_exploit17")
        try:
            r = requests.post(f"{BASE_URL}/api/subscription/sync", headers=_h(tok), timeout=20,
                              json={"entitlement_active": True, "product_id": "prod77b31683df",
                                    "expires_at": "2099-01-01T00:00:00Z"})
            assert r.status_code == 200, r.text
            assert r.json()["plan"] == "free" and r.json()["daily_limit"] == 5
            me = _me(tok)
            assert (me.get("plan") or "free") == "free"
        finally:
            _delete(tok)

    def test_sync_no_body(self):
        tok = STATE.get("demo_token") or pytest.skip()
        r = requests.post(f"{BASE_URL}/api/subscription/sync", headers=_h(tok), timeout=20)
        assert r.status_code == 200, r.text
        assert r.json()["plan"] == "forge"

    def test_sync_empty_obj(self):
        tok = STATE.get("demo_token") or pytest.skip()
        r = requests.post(f"{BASE_URL}/api/subscription/sync", json={}, headers=_h(tok), timeout=20)
        assert r.status_code == 200 and r.json()["daily_limit"] == 200

    def test_sync_no_auth(self):
        assert requests.post(f"{BASE_URL}/api/subscription/sync", timeout=20).status_code == 401


# ---------- Signed webhook lifecycle ----------
class TestWebhookSigned:
    def test_no_auth_401(self):
        assert _evt("whatever", "INITIAL_PURCHASE").status_code == 401

    def test_wrong_auth_401(self):
        assert _evt("whatever", "INITIAL_PURCHASE", auth="wrong-secret").status_code == 401
        assert _evt("whatever", "INITIAL_PURCHASE", auth="Bearer wrong-secret").status_code == 401

    def test_non_dict_body_400(self, secret):
        for body in ("[]", '"string"', "123", "null"):
            r = requests.post(WH, data=body, headers={"Content-Type": "application/json",
                                                      "Authorization": secret}, timeout=20)
            assert r.status_code == 400, (body, r.status_code, r.text)
        r = requests.post(WH, data="not json", headers={"Content-Type": "application/json",
                                                        "Authorization": secret}, timeout=20)
        assert r.status_code == 400
        r = requests.post(WH, json={"event": []}, headers={"Authorization": secret}, timeout=20)
        assert r.status_code == 400

    def test_full_lifecycle(self, secret):
        tok, user = _register("TEST_rcwh17")
        uid = user["user_id"]
        exp = int((time.time() + 30 * 86400) * 1000)
        try:
            # INITIAL_PURCHASE (raw secret) -> pro/500
            r = _evt(uid, "INITIAL_PURCHASE", auth=secret, exp_ms=exp)
            assert r.status_code == 200 and r.json()["processed"] is True, r.text
            s = _sync(tok)
            assert s["plan"] == "pro" and s["daily_limit"] == 500, s
            assert s["subscription_source"] == "revenuecat" and s["subscription_expires_at"]
            # CANCELLATION -> stays pro
            r = _evt(uid, "CANCELLATION", auth=secret)
            assert r.status_code == 200 and r.json()["processed"] is False, r.text
            assert _sync(tok)["plan"] == "pro"
            # BILLING_ISSUE -> stays pro
            r = _evt(uid, "BILLING_ISSUE", auth=f"Bearer {secret}")
            assert r.status_code == 200, r.text
            assert _sync(tok)["plan"] == "pro"
            # SUBSCRIPTION_PAUSED -> stays pro
            r = _evt(uid, "SUBSCRIPTION_PAUSED", auth=secret)
            assert r.status_code == 200
            assert _sync(tok)["plan"] == "pro"
            # EXPIRATION -> free/5
            r = _evt(uid, "EXPIRATION", auth=secret)
            assert r.status_code == 200 and r.json()["plan"] == "free", r.text
            s = _sync(tok)
            assert s["plan"] == "free" and s["daily_limit"] == 5
            # CANCELLATION on free user -> stays free (no accidental upgrade)
            _evt(uid, "CANCELLATION", auth=secret)
            assert _sync(tok)["plan"] == "free"
            # RENEWAL (Bearer form) -> pro again
            r = _evt(uid, "RENEWAL", auth=f"Bearer {secret}", exp_ms=exp)
            assert r.status_code == 200
            assert _sync(tok)["plan"] == "pro"
        finally:
            _delete(tok)

    def test_unknown_user(self, secret):
        r = _evt(f"nouser_{uuid.uuid4().hex}", "INITIAL_PURCHASE", auth=secret)
        assert r.status_code == 200 and r.json().get("status") == "unknown_user"

    def test_grandfather_demo(self, secret):
        tok = STATE.get("demo_token") or pytest.skip()
        uid = STATE["demo_uid"]
        r = _evt(uid, "INITIAL_PURCHASE", auth=secret)
        assert r.status_code == 200 and r.json().get("status") == "grandfathered", r.text
        r = _evt(uid, "EXPIRATION", auth=secret)
        assert r.json().get("status") == "grandfathered"
        s = _sync(tok)
        assert s["plan"] == "forge" and s["daily_limit"] == 200
        assert _me(tok)["plan"] == "forge"


# ---------- Rate limits (run last) ----------
class TestRateLimits:
    def test_login_rate_limit_xff_spoof(self):
        codes = []
        for i in range(1, 16):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": f"nobody.{uuid.uuid4().hex[:6]}@aiforgeqa.dev", "password": "bad12345"},
                              headers={"X-Forwarded-For": f"10.0.0.{i}", "X-Real-IP": f"10.9.9.{i}"}, timeout=20)
            codes.append(r.status_code)
        print("login codes:", codes)
        assert 429 in codes and codes.count(401) <= 10
        first = codes.index(429)
        assert all(c == 429 for c in codes[first:])
