"""Iter16 - free-Pro exploit regression (sync now read-only), RevenueCat webhook fail-secure
(no secret set), grandfathering, and auth regression. Rate-limit tests run LAST.
"""
import os
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
DEMO = {"email": "demo@example.com", "password": "demo1234"}
STATE = {}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _register(prefix):
    email = f"{prefix}.{uuid.uuid4().hex[:10]}@aiforgeqa.dev"
    r = requests.post(f"{BASE_URL}/api/auth/register",
                      json={"email": email, "password": "Passw0rd!x", "name": "QA iter16"}, timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    return d["token"], d["user"]


def _delete(tok):
    d = requests.delete(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20)
    assert d.status_code == 200, d.text
    assert requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20).status_code == 401


def _me(tok):
    return requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20).json()


# ---------- Health ----------
class TestHealth:
    # bare / and /health only reachable on internal port (public ingress sends non-/api to Expo)
    def test_root(self):
        assert requests.get("http://localhost:8001/", timeout=20).json()["status"] == "ok"

    def test_health(self):
        assert requests.get("http://localhost:8001/health", timeout=20).json()["status"] == "ok"

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

    def test_me_ok(self):
        tok = STATE.get("demo_token") or pytest.skip("no demo token")
        r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(tok), timeout=20)
        assert r.status_code == 200
        assert "_id" not in r.json() and "password_hash" not in r.json()

    def test_me_no_bearer(self):
        assert requests.get(f"{BASE_URL}/api/auth/me", timeout=20).status_code == 401

    def test_google_deleted(self):
        assert requests.post(f"{BASE_URL}/api/auth/google", json={"id_token": "x"}, timeout=20).status_code == 404


# ---------- Exploit regression: sync must be read-only ----------
class TestSyncReadOnly:
    def test_sync_no_auth(self):
        assert requests.post(f"{BASE_URL}/api/subscription/sync", json={"entitlement_active": True},
                             timeout=20).status_code == 401

    def test_exploit_dead_fresh_user(self):
        tok, user = _register("attacker_test")
        try:
            assert user["plan"] == "free" and user["daily_limit"] == 5
            for body in ({"entitlement_active": True, "product_id": "prod77b31683df",
                          "expires_at": "2099-01-01T00:00:00Z"},
                         {"entitlement_active": True}, {}):
                r = requests.post(f"{BASE_URL}/api/subscription/sync", json=body, headers=_h(tok), timeout=20)
                assert r.status_code == 200, r.text
                d = r.json()
                assert d["plan"] == "free" and d["daily_limit"] == 5, d
                assert d.get("subscription_expires_at") is None
            me = _me(tok)
            assert me["plan"] == "free" and me["daily_limit"] == 5
        finally:
            _delete(tok)

    def test_sync_no_body(self):
        # truly empty request body (no JSON) — report the behaviour
        tok = STATE.get("demo_token") or pytest.skip("no demo token")
        r = requests.post(f"{BASE_URL}/api/subscription/sync", headers=_h(tok), timeout=20)
        print("no-body sync:", r.status_code, r.text[:200])
        assert r.status_code == 200, f"empty body -> {r.status_code} {r.text[:200]}"

    def test_grandfather_forge(self):
        tok = STATE.get("demo_token") or pytest.skip("no demo token")
        for active in (True, False):
            r = requests.post(f"{BASE_URL}/api/subscription/sync",
                              json={"entitlement_active": active}, headers=_h(tok), timeout=20)
            assert r.status_code == 200
            assert r.json()["plan"] == "forge" and r.json()["daily_limit"] == 200
        assert _me(tok)["plan"] == "forge"


# ---------- Webhook fail-secure (REVENUECAT_WEBHOOK_SECRET unset) ----------
class TestWebhookFailSecure:
    def _event(self, uid, etype="INITIAL_PURCHASE"):
        return {"event": {"type": etype, "app_user_id": uid, "product_id": "prod77b31683df",
                          "expiration_at_ms": 4102444800000}}

    def test_webhook_no_auth(self):
        r = requests.post(f"{BASE_URL}/api/webhook/revenuecat", json=self._event("nobody"), timeout=20)
        assert r.status_code == 200
        assert r.json() == {"received": True, "verified": False}

    def test_webhook_fake_purchase_does_not_upgrade(self):
        tok, user = _register("webhook_test")
        uid = user.get("id") or user.get("user_id")
        assert uid
        try:
            for auth in (None, "", "Bearer anything", "anything", "Bearer "):
                hdr = {} if auth is None else {"Authorization": auth}
                for et in ("INITIAL_PURCHASE", "RENEWAL", "TRIAL_STARTED"):
                    r = requests.post(f"{BASE_URL}/api/webhook/revenuecat", json=self._event(uid, et),
                                      headers=hdr, timeout=20)
                    assert r.status_code == 200, (auth, r.status_code, r.text)
                    assert r.json()["verified"] is False and "processed" not in r.json()
            me = _me(tok)
            assert me["plan"] == "free" and me["daily_limit"] == 5
        finally:
            _delete(tok)

    def test_webhook_cannot_downgrade_demo(self):
        tok = STATE.get("demo_token") or pytest.skip("no demo token")
        uid = _me(tok)["id"]
        r = requests.post(f"{BASE_URL}/api/webhook/revenuecat", json=self._event(uid, "EXPIRATION"),
                          headers={"Authorization": "Bearer x"}, timeout=20)
        assert r.status_code == 200 and r.json()["verified"] is False
        assert _me(tok)["plan"] == "forge"

    def test_webhook_garbage_body(self):
        r = requests.post(f"{BASE_URL}/api/webhook/revenuecat", data="not json",
                          headers={"Content-Type": "application/json"}, timeout=20)
        assert r.status_code == 200 and r.json()["verified"] is False


# ---------- Rate limits (run last) ----------
class TestRateLimits:
    def test_sync_rate_limit_30_per_min(self):
        tok = STATE.get("demo_token") or pytest.skip("no demo token")
        codes = [requests.post(f"{BASE_URL}/api/subscription/sync", json={}, headers=_h(tok),
                               timeout=20).status_code for _ in range(35)]
        print("sync codes:", codes)
        assert 429 in codes and codes.count(200) <= 30

    def test_login_rate_limit_xff_spoof(self):
        codes = []
        for i in range(1, 16):
            r = requests.post(f"{BASE_URL}/api/auth/login",
                              json={"email": f"nobody.{uuid.uuid4().hex[:6]}@aiforgeqa.dev", "password": "bad12345"},
                              headers={"X-Forwarded-For": f"10.0.0.{i}"}, timeout=20)
            codes.append(r.status_code)
        print("login codes:", codes)
        assert 429 in codes and codes.count(401) <= 10
        first = codes.index(429)
        assert all(c == 429 for c in codes[first:])
