"""Iter16 - in-process happy-path check for signed RevenueCat webhook (secret patched in-memory only,
backend .env untouched). Run: cd /app/backend && python tests/check_rc_webhook_signed_iter16.py"""
import sys
import uuid

sys.path.insert(0, "/app/backend")
from fastapi.testclient import TestClient  # noqa: E402

import routes.subscription as sub  # noqa: E402
from server import app  # noqa: E402

SECRET = "qa-secret-" + uuid.uuid4().hex
sub.REVENUECAT_WEBHOOK_SECRET = SECRET
c = TestClient(app)
c.__enter__()
H = {"X-Real-IP": "192.0.2." + str(uuid.uuid4().int % 250)}

email = f"webhook_test.{uuid.uuid4().hex[:8]}@aiforgeqa.dev"
r = c.post("/api/auth/register", json={"email": email, "password": "Passw0rd!x", "name": "QA"}, headers=H)
assert r.status_code == 200, r.text
tok, uid = r.json()["token"], r.json()["user"]["id"]
A = {"Authorization": f"Bearer {tok}", **H}
res = []


def ev(t, u=uid):
    return {"event": {"type": t, "app_user_id": u, "product_id": "prod77b31683df", "expiration_at_ms": 4102444800000}}


def check(name, cond, info=""):
    res.append(cond)
    print(("PASS " if cond else "FAIL ") + name, info)


try:
    r = c.post("/api/webhook/revenuecat", json=ev("INITIAL_PURCHASE"), headers={"Authorization": "wrong"})
    check("wrong secret -> 401", r.status_code == 401, r.status_code)
    r = c.post("/api/webhook/revenuecat", json=ev("INITIAL_PURCHASE"))
    check("missing auth -> 401", r.status_code == 401, r.status_code)
    r = c.post("/api/webhook/revenuecat", json=ev("TEST"), headers={"Authorization": SECRET})
    check("TEST ignored", r.json().get("processed") is False, r.json())
    r = c.post("/api/webhook/revenuecat", json=ev("INITIAL_PURCHASE"), headers={"Authorization": f"Bearer {SECRET}"})
    check("INITIAL_PURCHASE processed", r.json().get("plan") == "pro", r.json())
    me = c.get("/api/auth/me", headers=A).json()
    check("me pro/500", me["plan"] == "pro" and me["daily_limit"] == 500, (me["plan"], me["daily_limit"]))
    s = c.post("/api/subscription/sync", json={"entitlement_active": False}, headers=A).json()
    check("sync false cannot downgrade pro", s["plan"] == "pro", s)
    r = c.post("/api/webhook/revenuecat", json=ev("EXPIRATION"), headers={"Authorization": SECRET})
    me = c.get("/api/auth/me", headers=A).json()
    check("EXPIRATION -> free/5", me["plan"] == "free" and me["daily_limit"] == 5, r.json())
    r = c.post("/api/webhook/revenuecat", json=ev("RENEWAL", "nonexistent-user"), headers={"Authorization": SECRET})
    check("unknown user handled", r.status_code == 200 and r.json().get("status") == "unknown_user", r.json())
    r = c.post("/api/webhook/revenuecat", json={"event": {"type": "INITIAL_PURCHASE"}}, headers={"Authorization": SECRET})
    check("missing app_user_id", r.json().get("reason") == "no_user_id", r.json())
    r = c.post("/api/webhook/revenuecat", content=b"nope", headers={"Authorization": SECRET, "Content-Type": "application/json"})
    check("bad json -> 400", r.status_code == 400, r.status_code)
    r = c.post("/api/webhook/revenuecat", json=[1, 2], headers={"Authorization": SECRET})
    check("json array body -> no 500", r.status_code < 500, r.status_code)
finally:
    d = c.delete("/api/auth/me", headers=A)
    print("cleanup", d.status_code, d.text)
print(f"{sum(res)}/{len(res)} passed")
c.__exit__(None, None, None)
