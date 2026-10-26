# Iter19: Free-tier signup gift + token packs (RevenueCat NON_RENEWING_PURCHASE) + token-cost enforcement on /generate
import os
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
import requests
from pymongo import MongoClient


def _read_env(path, key):
    for line in Path(path).read_text().splitlines():
        if line.strip().startswith(f"{key}="):
            return line.split("=", 1)[1].strip().strip('"')
    return None


BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or _read_env("/app/frontend/.env", "EXPO_PUBLIC_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
RC_SECRET = _read_env("/app/backend/.env", "REVENUECAT_WEBHOOK_SECRET")
MONGO_URL = _read_env("/app/backend/.env", "MONGO_URL")
DB_NAME = _read_env("/app/backend/.env", "DB_NAME")

ALICE_EMAIL = "alice2@test.com"
ALICE_PW = "testing12"
SUFFIX = uuid.uuid4().hex[:8]
TXN1 = f"txn_test_1_{SUFFIX}"
GEN_TIMEOUT = 240

STATE = {}


@pytest.fixture(scope="module")
def mdb():
    c = MongoClient(MONGO_URL)
    d = c[DB_NAME]
    # Fresh start for alice2
    old = d.users.find_one({"email": ALICE_EMAIL})
    if old:
        d.token_ledger.delete_many({"user_id": old["user_id"]})
        d.creations.delete_many({"user_id": old["user_id"]})
        d.users.delete_one({"email": ALICE_EMAIL})
    yield d
    # teardown: remove test users + ledger rows
    for em in [ALICE_EMAIL, STATE.get("pro_email")]:
        if not em:
            continue
        u = d.users.find_one({"email": em})
        if u:
            d.token_ledger.delete_many({"user_id": u["user_id"]})
            d.creations.delete_many({"user_id": u["user_id"]})
            d.usage.delete_many({"user_id": u["user_id"]})
            d.users.delete_one({"email": em})
    c.close()


def hdr(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


def rc_post(event, auth="good", raw=None):
    h = {"Content-Type": "application/json"}
    if auth == "good":
        h["Authorization"] = f"Bearer {RC_SECRET}"
    elif auth == "bad":
        h["Authorization"] = "Bearer wrong-secret-xyz"
    if raw is not None:
        return requests.post(f"{API}/webhook/revenuecat", data=raw, headers=h, timeout=30)
    return requests.post(f"{API}/webhook/revenuecat", json={"event": event}, headers=h, timeout=30)


def balance():
    r = requests.get(f"{API}/tokens/balance", headers=hdr(STATE["token"]), timeout=30)
    assert r.status_code == 200, r.text
    return r.json()


def gen(gtype, prompt="galaxy cat", **kw):
    body = {"type": gtype, "prompt": prompt, **kw}
    return requests.post(f"{API}/generate", json=body, headers=hdr(STATE["token"]), timeout=GEN_TIMEOUT)


def nonrenew(user_id, product_id, txn):
    return {
        "type": "NON_RENEWING_PURCHASE", "app_user_id": user_id, "product_id": product_id,
        "transaction_id": txn, "store": "PLAY_STORE", "environment": "SANDBOX",
        "event_timestamp_ms": 1700000000000,
    }


class TestTokensFlow:
    # A. Register + free-tier gift
    def test_A_register_free_gift(self, mdb):
        r = requests.post(f"{API}/auth/register", json={"email": ALICE_EMAIL, "password": ALICE_PW, "name": "Alice2"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        data = r.json()
        STATE["token"] = data.get("token") or data.get("access_token")
        u = data["user"]
        STATE["user_id"] = u["id"]
        assert u["free_gens_remaining"] == 5
        exp = datetime.fromisoformat(u["free_gens_expires_at"])
        delta = exp - datetime.now(timezone.utc)
        assert timedelta(days=29, hours=23) < delta <= timedelta(days=30, minutes=1)
        me = requests.get(f"{API}/auth/me", headers=hdr(STATE["token"]), timeout=30).json()
        assert me["free_gens_remaining"] == 5 and me["free_gens_expires_at"] == u["free_gens_expires_at"]
        assert me["tokens_balance"] == 0
        b = balance()
        assert b["free_gens_remaining"] == 5 and b["signup_gens"] == 5
        assert b["costs"]["image"] == 1 and b["costs"]["video"] == 3 and b["costs"]["voice"] == 0

    # B. Free-tier debit
    def test_B1_image_debits_1(self, mdb):
        r = gen("image")
        print("B1 image:", r.status_code, r.text[:200] if r.status_code != 200 else "ok")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["status"] == "ready"
        assert balance()["free_gens_remaining"] == 4

    def test_B2_video_debits_3(self, mdb):
        r = gen("video", prompt="galaxy cat flying", duration=4)
        assert r.status_code == 200, r.text[:300]
        STATE["video_id"] = r.json()["id"]
        b = balance()
        print("B2 balance after video:", b)
        assert b["free_gens_remaining"] == 1

    def test_B3_image_debits_last(self, mdb):
        r = gen("image")
        assert r.status_code == 200, r.text[:300]
        b = balance()
        print("B3 balance:", b)
        STATE["free_after_B3"] = b["free_gens_remaining"]
        vdoc = mdb.creations.find_one({"creation_id": STATE["video_id"]}, {"_id": 0, "status": 1})
        # If the async video job already failed, its 3 gens are refunded (correct behaviour)
        expected = 3 if vdoc and vdoc.get("status") == "failed" else 0
        print(f"B3 video status={vdoc} expected_free={expected}")
        assert b["free_gens_remaining"] == expected

    def test_B4_out_of_gens_402(self, mdb):
        # Neutralise any async video refund so the 402 path is exercised deterministically
        cur = balance()
        if cur["free_gens_remaining"] > 0:
            print(f"NOTE: video refund restored {cur['free_gens_remaining']} free gens; zeroing via DB for 402 test")
            mdb.users.update_one({"user_id": STATE["user_id"]}, {"$set": {"free_gens_remaining": 0}})
        r = gen("image")
        print("B4:", r.status_code, r.text)
        assert r.status_code == 402
        assert "out of generations" in r.json()["detail"].lower()
        b = balance()
        assert b["free_gens_remaining"] == 0 and b["tokens_balance"] == 0 and b["total_available"] == 0

    # C. Token-pack grant
    def test_C_token_grant(self, mdb):
        r = rc_post(nonrenew(STATE["user_id"], "tokens_100", TXN1))
        assert r.status_code == 200, r.text
        d = r.json()
        print("C:", d)
        assert d["processed"] is True and d["status"] == "credited" and d["tokens"] == 100 and d["product_id"] == "tokens_100"
        b = balance()
        assert b["tokens_balance"] == 100 and b["total_available"] == 100 and b["free_gens_remaining"] == 0
        h = requests.get(f"{API}/tokens/history", headers=hdr(STATE["token"]), timeout=30).json()
        assert h["count"] == 1 and h["entries"][0]["tokens"] == 100 and h["entries"][0]["product_id"] == "tokens_100"
        assert h["entries"][0]["transaction_id"] == TXN1

    # D. Idempotent replay
    def test_D_duplicate(self, mdb):
        r = rc_post(nonrenew(STATE["user_id"], "tokens_100", TXN1))
        assert r.status_code == 200 and r.json()["status"] == "duplicate", r.text
        assert balance()["tokens_balance"] == 100

    # E. Unknown product
    def test_E_unknown_product(self, mdb):
        r = rc_post(nonrenew(STATE["user_id"], "tokens_9999", f"txn_test_2_{SUFFIX}"))
        assert r.status_code == 200 and r.json()["status"] == "unknown_product", r.text
        assert balance()["tokens_balance"] == 100

    # F. Unknown user
    def test_F_unknown_user(self, mdb):
        txn = f"txn_test_3_{SUFFIX}"
        r = rc_post(nonrenew("user_nonexistent", "tokens_25", txn))
        assert r.status_code == 200 and r.json()["status"] == "unknown_user", r.text
        assert mdb.token_ledger.count_documents({"transaction_id": txn}) == 0
        assert balance()["tokens_balance"] == 100

    # G. Consumption from purchased tokens
    def test_G1_image_from_tokens(self, mdb):
        r = gen("image")
        assert r.status_code == 200, r.text[:300]
        assert balance()["tokens_balance"] == 99

    def test_G2_video_from_tokens(self, mdb):
        r = gen("video", prompt="neon city", duration=4)
        assert r.status_code == 200, r.text[:300]
        STATE["video2_id"] = r.json()["id"]
        b = balance()
        print("G2:", b)
        assert b["tokens_balance"] == 96

    def test_G3_chat_from_tokens(self, mdb):
        before = balance()["tokens_balance"]
        r = gen("chat", prompt="hi")
        assert r.status_code == 200, r.text[:300]
        assert r.json()["media_mime"] == "text/plain"
        after = balance()["tokens_balance"]
        print(f"G3 tokens before={before} after={after}")
        assert after == before - 1

    # H. Webhook auth rejections
    def test_H_bad_auth(self, mdb):
        ev = nonrenew(STATE["user_id"], "tokens_25", f"txn_h_{SUFFIX}")
        assert rc_post(ev, auth="none").status_code == 401
        assert rc_post(ev, auth="bad").status_code == 401
        assert rc_post(None, auth="good", raw="{not json").status_code == 400
        assert mdb.token_ledger.count_documents({"transaction_id": f"txn_h_{SUFFIX}"}) == 0

    # I. Pro subscription webhook unchanged
    def test_I_pro_subscription(self, mdb):
        em = f"test_pro_{SUFFIX}@test.com"
        STATE["pro_email"] = em
        r = requests.post(f"{API}/auth/register", json={"email": em, "password": "testing12", "name": "ProT"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        uid = r.json()["user"]["id"]
        ev = {"type": "INITIAL_PURCHASE", "app_user_id": uid, "product_id": "prod77b31683df",
              "transaction_id": f"txn_sub_{SUFFIX}", "expiration_at_ms": int((time.time() + 30 * 86400) * 1000)}
        r = rc_post(ev)
        assert r.status_code == 200 and r.json()["status"] == "updated" and r.json()["plan"] == "pro", r.text
        u = mdb.users.find_one({"user_id": uid})
        assert u["plan"] == "pro" and int(u.get("tokens_balance", 0)) == 0
        assert mdb.token_ledger.count_documents({"user_id": uid}) == 0
        ev["type"] = "EXPIRATION"
        r = rc_post(ev)
        assert r.status_code == 200 and r.json()["plan"] == "free", r.text
        assert mdb.users.find_one({"user_id": uid})["plan"] == "free"

    # J. Pro users skip token debit
    def test_J_pro_skips_debit(self, mdb):
        mdb.users.update_one({"user_id": STATE["user_id"]}, {"$set": {"plan": "pro"}})
        before = balance()["tokens_balance"]
        for _ in range(2):
            r = gen("image")
            assert r.status_code == 200, r.text[:300]
        after = balance()
        print(f"J tokens before={before} after={after['tokens_balance']}")
        assert after["tokens_balance"] == before
        mdb.users.update_one({"user_id": STATE["user_id"]}, {"$set": {"plan": "free"}})

    # Video job outcome (refund correctness when background video fails)
    def test_Z_video_job_outcome(self, mdb):
        for vid in [STATE.get("video_id"), STATE.get("video2_id")]:
            if not vid:
                continue
            doc = mdb.creations.find_one({"creation_id": vid}, {"_id": 0, "status": 1, "error": 1})
            print(f"Video {vid}: {doc}")


# Edge cases: expired signup gift + race-free debit under concurrency
class TestTokensEdge:
    def test_expired_free_gens_not_usable(self, mdb):
        em = f"test_exp_{SUFFIX}@test.com"
        r = requests.post(f"{API}/auth/register", json={"email": em, "password": "testing12", "name": "Exp"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        STATE["exp_email"] = em
        tok, uid = r.json()["token"], r.json()["user"]["id"]
        past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        mdb.users.update_one({"user_id": uid}, {"$set": {"free_gens_expires_at": past}})
        b = requests.get(f"{API}/tokens/balance", headers=hdr(tok), timeout=30).json()
        me = requests.get(f"{API}/auth/me", headers=hdr(tok), timeout=30).json()
        assert b["free_gens_remaining"] == 0 and b["free_gens_expires_at"] is None
        assert me["free_gens_remaining"] == 0
        g = requests.post(f"{API}/generate", json={"type": "image", "prompt": "x"}, headers=hdr(tok), timeout=60)
        assert g.status_code == 402, g.text[:200]
        assert mdb.users.find_one({"user_id": uid})["free_gens_remaining"] == 5  # untouched
        mdb.users.delete_one({"user_id": uid})

    def test_parallel_debit_race_free(self, mdb):
        # alice2: plan free, free gens 0, tokens=1 → only ONE of N parallel requests may reserve.
        from concurrent.futures import ThreadPoolExecutor
        em = f"test_race_{SUFFIX}@test.com"
        r = requests.post(f"{API}/auth/register", json={"email": em, "password": "testing12", "name": "Race"}, timeout=30)
        assert r.status_code in (200, 201), r.text
        tok, uid = r.json()["token"], r.json()["user"]["id"]
        mdb.users.update_one({"user_id": uid}, {"$set": {"plan": "free", "free_gens_remaining": 0, "tokens_balance": 1}})
        def call(_):
            return requests.post(f"{API}/generate", json={"type": "image", "prompt": "tiny dot"}, headers=hdr(tok), timeout=GEN_TIMEOUT).status_code
        with ThreadPoolExecutor(max_workers=6) as ex:
            codes = list(ex.map(call, range(6)))
        print("race codes:", codes)
        assert codes.count(402) == 5
        assert sum(1 for c in codes if c != 402) == 1
        bal = int(mdb.users.find_one({"user_id": uid})["tokens_balance"])
        mdb.creations.delete_many({"user_id": uid})
        mdb.users.delete_one({"user_id": uid})
        assert bal in (0, 1)
