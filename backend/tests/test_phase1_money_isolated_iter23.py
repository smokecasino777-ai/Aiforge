"""Isolated Mongo money-ledger tests for Phase-1 funded accounting and fulfillment guards."""

from __future__ import annotations

import asyncio
import uuid
from datetime import timedelta
import sys

import httpx
import pytest
import pytest_asyncio
from fastapi import APIRouter, FastAPI, HTTPException
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient

if "/app/backend" not in sys.path:
    sys.path.append("/app/backend")

import core
import metering
from core import iso, make_sudo_token, now_utc
from credit_fulfillment import fulfill
from credit_ledger import (
    budget_change,
    grant,
    key,
    pool,
    reserve_wallet,
    revoke,
    settle_wallet,
    starter,
    wallet,
)
from metering import MeteredRoute, provider_start, recover_stale, settle
from routes.credits import (
    CancelIntent,
    FundingRequest,
    IntentRequest,
    ProductRequest,
    QuoteRequest,
    RateRequest,
    cancel_intent,
    catalog,
    fingerprint,
    intent,
    quote,
    set_budget,
    set_product,
    set_rate,
)
from routes.subscription import _apply_entitlement, _grant_tokens


@pytest_asyncio.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


# ---------- isolated Mongo fixture ----------
@pytest_asyncio.fixture
async def isolated_db():
    """Each test uses a unique temporary DB and drops it afterwards."""
    db_name = f"aiforge_money_iter23_{uuid.uuid4().hex[:10]}"
    original = object.__getattribute__(core.db, "_db")
    original_client = core.mongo_client
    test_client = AsyncIOMotorClient(core.MONGO_URL)
    core.mongo_client = test_client
    test_db = test_client[db_name]
    core.db.point_to(test_db)
    try:
        yield test_db
    finally:
        core.db.point_to(original)
        await test_client.drop_database(db_name)
        test_client.close()
        core.mongo_client = original_client


# ---------- shared helpers ----------
async def seed_user(user_id: str, email: str, plan: str = "free") -> dict:
    user = {
        "user_id": user_id,
        "email": email,
        "plan": plan,
        "credit_catalog_version": "credits_v1",
        "tokens_balance": 0,
        "free_gens_remaining": 0,
    }
    await core.db.users.insert_one(user.copy())
    return user


async def seed_pool(funded_micros: int = 50_000_000, sales_enabled: bool = False):
    await core.db.credit_funding.update_one(
        {"_id": "pool"},
        {
            "$set": {
                "funded_micros": funded_micros,
                "held_micros": 0,
                "spent_micros": 0,
                "running_micros": 0,
                "sales_enabled": sales_enabled,
            }
        },
        upsert=True,
    )


async def liability_snapshot(user_id: str) -> int:
    w = await wallet(user_id)
    total = 0
    for lot in w.get("lots", {}).values():
        total += int(lot.get("remaining", 0))
    return total * 1000


# ---------- starter + promo ceiling ----------
@pytest.mark.asyncio
async def test_starter_once_per_email_and_unfunded_no_grant(isolated_db):
    await seed_pool(funded_micros=0)
    user_a = await seed_user("u_starter_a", "starter@test.dev")

    await starter(user_a)
    w_a = await wallet("u_starter_a")
    assert w_a.get("lots", {}) == {}

    # Same email with a different user_id cannot abuse re-registration.
    await core.db.credit_grants.update_one(
        {"_id": "starter:" + key("starter@test.dev")},
        {"$set": {"user_id": "old_owner", "status": "granted", "expires_at": iso(now_utc() + timedelta(days=30))}},
        upsert=True,
    )
    user_b = await seed_user("u_starter_b", "starter@test.dev")
    await starter(user_b)
    w_b = await wallet("u_starter_b")
    assert w_b.get("lots", {}) == {}


@pytest.mark.asyncio
async def test_promo_cap_25_exact(isolated_db):
    await seed_pool(funded_micros=100_000_000)
    await seed_user("u_promo", "promo@test.dev")

    await grant("u_promo", "promo-cap-exact", 25_000, "promo", paid=False)
    with pytest.raises(HTTPException) as exc:
        await grant("u_promo", "promo-cap-over", 1, "promo", paid=False)
    assert exc.value.status_code == 503


# ---------- grant idempotence + liabilities ----------
@pytest.mark.asyncio
async def test_paid_grant_idempotence_and_unfunded_obligation_blocks_start(isolated_db):
    await seed_pool(funded_micros=0)
    await seed_user("u_paid", "paid@test.dev")

    exp = iso(now_utc() + timedelta(days=30))
    await grant("u_paid", "PLAY:txn-paid-1", 2000, "monthly", expires_at=exp, paid=True)
    await grant("u_paid", "PLAY:txn-paid-1", 2000, "monthly", expires_at=exp, paid=True)

    with pytest.raises(HTTPException) as mismatch:
        await grant("u_other", "PLAY:txn-paid-1", 2000, "monthly", expires_at=exp, paid=True)
    assert mismatch.value.status_code == 409

    funds = await pool()
    assert funds["held_micros"] == await liability_snapshot("u_paid")
    assert funds["held_micros"] > funds["funded_micros"]  # visible unfunded paid obligation

    with pytest.raises(HTTPException) as no_funds:
        await budget_change("request:blocked-unfunded", {"running_micros": 1000}, require_funds=1000)
    assert no_funds.value.status_code == 503


# ---------- expiry/FIFO/reserve-settle ----------
@pytest.mark.asyncio
async def test_fifo_expiry_and_settlement_refunds(isolated_db):
    await seed_pool(funded_micros=100_000_000)
    await seed_user("u_fifo", "fifo@test.dev")

    past = iso(now_utc() - timedelta(minutes=1))
    soon = iso(now_utc() + timedelta(days=1))
    await grant("u_fifo", "expired-lot", 10, "monthly", expires_at=past, paid=True)
    await grant("u_fifo", "monthly-lot", 100, "monthly", expires_at=soon, paid=True)
    await grant("u_fifo", "pack-lot", 100, "purchased", expires_at=None, paid=True)

    before = await pool()
    await wallet("u_fifo")
    after_once = await pool()
    await wallet("u_fifo")
    after_twice = await pool()
    # Expiry release is idempotent (never decremented twice).
    assert after_once["held_micros"] <= before["held_micros"]
    assert after_twice["held_micros"] == after_once["held_micros"]

    await reserve_wallet("u_fifo", "q_fifo_1", 150)
    w_reserved = await wallet("u_fifo")
    allocation = w_reserved["reservations"]["q_fifo_1"]["allocation"]
    assert allocation[0]["credits"] == 100  # monthly expiring lot consumed first
    assert allocation[1]["credits"] == 50

    await settle_wallet("u_fifo", "q_fifo_1", success=True)
    w_spent = await wallet("u_fifo")
    remaining = [lot["remaining"] for lot in w_spent["lots"].values()]
    assert min(remaining) >= 0

    await reserve_wallet("u_fifo", "q_fifo_2", 40)
    await settle_wallet("u_fifo", "q_fifo_2", success=False)
    w_refund = await wallet("u_fifo")
    assert w_refund["active_quote"] is None


# ---------- concurrency and reserve guards ----------
@pytest.mark.asyncio
async def test_concurrent_grant_and_single_active_reservation(isolated_db):
    await seed_pool(funded_micros=100_000_000)
    await seed_user("u_conc", "conc@test.dev")

    await asyncio.gather(
        grant("u_conc", "PLAY:txn-concurrent", 500, "purchased", paid=True),
        grant("u_conc", "PLAY:txn-concurrent", 500, "purchased", paid=True),
    )
    w = await wallet("u_conc")
    assert len(w.get("lots", {})) == 1

    async def reserve(quote_id: str):
        try:
            await reserve_wallet("u_conc", quote_id, 200)
            return "ok"
        except HTTPException as e:
            return e.status_code

    r1, r2 = await asyncio.gather(reserve("qa"), reserve("qb"))
    assert sorted([r1, r2], key=str) == [409, "ok"]

    active = (await wallet("u_conc")).get("active_quote")
    if active:
        await settle_wallet("u_conc", active, success=False)

    with pytest.raises(HTTPException) as low_credits:
        await reserve_wallet("u_conc", "qc", 99999)
    assert low_credits.value.status_code == 402


# ---------- metered route tampering/replay/failure accounting ----------
@pytest.mark.asyncio
async def test_meteredroute_tamper_replay_and_failure_modes(isolated_db, monkeypatch):
    await seed_pool(funded_micros=50_000_000)
    await seed_user("u_metered", "metered@test.dev")
    await grant("u_metered", "PLAY:metered-seed", 500, "purchased", paid=True)

    async def fake_user(_creds):
        return {"user_id": "u_metered", "email": "metered@test.dev", "plan": "free", "credit_catalog_version": "credits_v1"}

    monkeypatch.setattr(metering, "get_current_user", fake_user)

    app = FastAPI()
    router = APIRouter(route_class=MeteredRoute)

    @router.post("/api/generate")
    async def mocked_generate(payload: dict):
        if payload.get("fail_before_start"):
            raise HTTPException(502, "before provider")
        quote = await provider_start()
        if payload.get("fail_after_start"):
            raise HTTPException(502, "after provider")
        return JSONResponse({"ok": True, "quote_id": quote["quote_id"]})

    app.include_router(router)

    async def insert_quote(quote_id: str, payload: dict, cost_micros: int = 2000, credits: int = 2):
        await core.db.credit_quotes.insert_one(
            {
                "quote_id": quote_id,
                "user_id": "u_metered",
                "credits": credits,
                "cost_micros": cost_micros,
                "owner_funded": False,
                "legacy": False,
                "path": "/generate",
                "fingerprint": fingerprint("/generate", payload),
                "status": "quoted",
                "created_at": iso(now_utc()),
                "expires_at": iso(now_utc() + timedelta(minutes=5)),
            }
        )

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Tampering check.
        await insert_quote("q_tamper", {"type": "image", "prompt": "a"})
        tampered = await client.post(
            "/api/generate",
            json={"type": "image", "prompt": "b"},
            headers={"Authorization": "Bearer fake", "X-Credit-Quote": "q_tamper"},
        )
        assert tampered.status_code == 409

        # Replay check.
        await insert_quote("q_replay", {"type": "image", "prompt": "ok"})
        first = await client.post(
            "/api/generate",
            json={"type": "image", "prompt": "ok"},
            headers={"Authorization": "Bearer fake", "X-Credit-Quote": "q_replay"},
        )
        again = await client.post(
            "/api/generate",
            json={"type": "image", "prompt": "ok"},
            headers={"Authorization": "Bearer fake", "X-Credit-Quote": "q_replay"},
        )
        assert first.status_code == 200
        assert again.status_code in {409, 428}

        # Failure before provider_start -> spent cost must stay 0.
        await insert_quote("q_fail_before", {"fail_before_start": True}, cost_micros=3000, credits=3)
        fb = await client.post(
            "/api/generate",
            json={"fail_before_start": True},
            headers={"Authorization": "Bearer fake", "X-Credit-Quote": "q_fail_before"},
        )
        assert fb.status_code >= 400

        # Failure after provider_start -> owner cost counted.
        await insert_quote("q_fail_after", {"fail_after_start": True}, cost_micros=4000, credits=4)
        fa = await client.post(
            "/api/generate",
            json={"fail_after_start": True},
            headers={"Authorization": "Bearer fake", "X-Credit-Quote": "q_fail_after"},
        )
        assert fa.status_code >= 400

    after_funds = await pool()
    assert after_funds["running_micros"] >= 0
    assert after_funds["held_micros"] >= 0

    q_before = await core.db.credit_quotes.find_one({"quote_id": "q_fail_before"}, {"_id": 0, "owner_cost_micros": 1})
    q_after = await core.db.credit_quotes.find_one({"quote_id": "q_fail_after"}, {"_id": 0, "owner_cost_micros": 1})
    assert q_before["owner_cost_micros"] == 0
    assert q_after["owner_cost_micros"] == 4000


# ---------- stale recovery + settle idempotence ----------
@pytest.mark.asyncio
async def test_recovery_and_settle_idempotence(isolated_db):
    await seed_pool(funded_micros=100_000_000)
    await seed_user("u_recover", "recover@test.dev")
    await grant("u_recover", "PLAY:recover-seed", 50, "purchased", paid=True)

    old = iso(now_utc() - timedelta(minutes=16))
    qid = "q_stale_running"
    await core.db.credit_quotes.insert_one(
        {
            "quote_id": qid,
            "user_id": "u_recover",
            "status": "running",
            "created_at": old,
            "expires_at": iso(now_utc() + timedelta(minutes=5)),
            "credits": 5,
            "cost_micros": 5000,
            "provider_started": True,
        }
    )
    await budget_change(f"request:{qid}", {"running_micros": 5000})
    await reserve_wallet("u_recover", qid, 5)

    await recover_stale("u_recover")
    recovered = await core.db.credit_quotes.find_one({"quote_id": qid}, {"_id": 0})
    assert recovered["status"] == "released"
    assert recovered["owner_cost_micros"] == 5000

    # Settlement latch: first success sticks even when retried with failure.
    q2 = {
        "quote_id": "q_latch",
        "user_id": "u_recover",
        "credits": 3,
        "cost_micros": 3000,
        "provider_started": True,
    }
    await core.db.credit_quotes.insert_one(
        {
            **q2,
            "status": "running",
            "created_at": iso(now_utc()),
            "expires_at": iso(now_utc() + timedelta(minutes=5)),
        }
    )
    await budget_change("request:q_latch", {"running_micros": 3000})
    await reserve_wallet("u_recover", "q_latch", 3)
    await settle(q2, True)
    await settle(q2, False)
    latched = await core.db.credit_quotes.find_one({"quote_id": "q_latch"}, {"_id": 0})
    assert latched["settlement_success"] is True
    assert latched["status"] == "completed"


# ---------- fulfillment (new catalog + legacy guards) ----------
@pytest.mark.asyncio
async def test_fulfillment_mappings_refunds_and_legacy_guards(isolated_db):
    await seed_pool(funded_micros=300_000_000)
    await seed_user("u_fulfill", "fulfill@test.dev")
    await seed_user("u_other", "fulfill_other@test.dev")

    await core.db.credit_products.insert_many(
        [
            {
                "catalog_id": "spark",
                "offering_id": "default",
                "package_id": "$rc_monthly",
                "product_id": "prod_monthly",
                "verified": True,
            },
            {
                "catalog_id": "pack_400",
                "offering_id": "default",
                "package_id": "$rc_pack400",
                "product_id": "prod_pack400",
                "verified": True,
            },
        ]
    )

    now_ms = int(now_utc().timestamp() * 1000)
    exp1 = int((now_utc() + timedelta(days=30)).timestamp() * 1000)
    exp2 = int((now_utc() + timedelta(days=60)).timestamp() * 1000)

    initial = {
        "type": "INITIAL_PURCHASE",
        "store": "PLAY_STORE",
        "environment": "PRODUCTION",
        "product_id": "prod_monthly",
        "transaction_id": "txn_monthly_1",
        "entitlement_ids": ["pro"],
        "event_timestamp_ms": now_ms,
        "expiration_at_ms": exp1,
    }
    renewal = {**initial, "type": "RENEWAL", "transaction_id": "txn_monthly_2", "expiration_at_ms": exp2}
    trial = {**initial, "period_type": "TRIAL", "transaction_id": "txn_monthly_trial"}
    pack = {
        "type": "NON_RENEWING_PURCHASE",
        "store": "PLAY_STORE",
        "environment": "PRODUCTION",
        "product_id": "prod_pack400",
        "transaction_id": "txn_pack_1",
    }

    r_initial = await fulfill(initial, "u_fulfill")
    r_dup = await fulfill(initial, "u_fulfill")
    r_renewal = await fulfill(renewal, "u_fulfill")
    r_trial = await fulfill(trial, "u_fulfill")
    r_pack = await fulfill(pack, "u_fulfill")
    assert r_initial["status"] == "credits_verified"
    assert r_dup["status"] == "credits_verified"  # idempotent replay, no duplicate lot write
    assert r_renewal["status"] == "credits_verified"
    assert r_trial["status"] == "awaiting_paid_renewal"
    assert r_pack["status"] == "credits_verified"

    # Cancellation without refund (monthly non-support reason) keeps term.
    keep = await fulfill({**initial, "type": "CANCELLATION", "cancel_reason": "USER_CANCELLED", "transaction_id": "txn_monthly_1"}, "u_fulfill")
    assert keep["status"] == "recorded_without_new_credits"

    # Purchased refund executes once and never goes negative.
    refund_evt = {**pack, "type": "CANCELLATION", "cancel_reason": "CUSTOMER_SUPPORT"}
    await fulfill(refund_evt, "u_fulfill")
    await fulfill(refund_evt, "u_fulfill")
    w = await wallet("u_fulfill")
    assert all(lot.get("remaining", 0) >= 0 for lot in w.get("lots", {}).values())

    # Identity tampering / replay denied.
    with pytest.raises(HTTPException) as tamper:
        await fulfill({**pack, "transaction_id": "txn_pack_1"}, "u_other")
    assert tamper.value.status_code == 409

    # Sandbox promo path should be unpaid (promo-budget tracked).
    sandbox = {
        "type": "NON_RENEWING_PURCHASE",
        "store": "TEST_STORE",
        "environment": "SANDBOX",
        "product_id": "prod_pack400",
        "transaction_id": "txn_pack_sandbox",
    }
    await fulfill(sandbox, "u_fulfill")
    funds = await pool()
    month_field = now_utc().strftime("%Y-%m")
    assert funds.get("promo", {}).get(month_field, 0) >= 400_000

    # Legacy token grant/replay + entitlement timestamp stale guard.
    token_evt = {
        "product_id": "tokens_25",
        "transaction_id": "legacy_tok_1",
        "store": "PLAY_STORE",
        "environment": "PRODUCTION",
    }
    credited = await _grant_tokens("u_fulfill", token_evt)
    assert credited["status"] in {"credited", "duplicate"}
    with pytest.raises(HTTPException) as token_tamper:
        await _grant_tokens("u_other", token_evt)
    assert token_tamper.value.status_code == 409

    await core.db.users.update_one(
        {"user_id": "u_fulfill"},
        {"$set": {"plan": "free", "subscription_event_timestamp_ms": 9999999999999}},
    )
    stale = await _apply_entitlement(
        "u_fulfill",
        active=True,
        event={
            "type": "INITIAL_PURCHASE",
            "entitlement_ids": ["pro"],
            "event_timestamp_ms": now_ms,
            "expiration_at_ms": exp1,
            "product_id": "prod_monthly",
        },
    )
    assert stale["status"] == "stale_or_duplicate"


# ---------- purchase intent lifecycle + catalog readiness + sudo guards ----------
@pytest.mark.asyncio
async def test_intent_hold_cancel_fulfill_and_admin_write_guard(isolated_db):
    admin_user = await seed_user("u_admin", "owner@test.dev")
    admin_user["is_admin"] = True
    await core.db.users.update_one({"user_id": "u_admin"}, {"$set": {"is_admin": True}})
    await seed_pool(funded_micros=100_000_000, sales_enabled=False)

    # Catalog unavailable without ready signals.
    cold = await catalog(admin_user)
    assert all(not p["available"] for p in cold["products"])

    # Add rate + product but keep sales disabled -> still unavailable.
    await core.db.credit_rates.insert_one(
        {
            "action": "chat",
            "quality": "economy",
            "max_cost_micros": 1000,
            "verified": True,
            "valid_until": iso(now_utc() + timedelta(days=1)),
        }
    )
    await core.db.credit_products.insert_one(
        {
            "catalog_id": "spark",
            "offering_id": "default",
            "package_id": "$rc_monthly",
            "product_id": "prod_monthly_ready",
            "verified": True,
            "minimum_local_prices": {},
        }
    )
    still_locked = await catalog(admin_user)
    spark_locked = next(p for p in still_locked["products"] if p["id"] == "spark")
    assert spark_locked["available"] is False

    # Enable sales and verify availability.
    await core.db.credit_funding.update_one({"_id": "pool"}, {"$set": {"sales_enabled": True}})
    open_catalog = await catalog(admin_user)
    spark_open = next(p for p in open_catalog["products"] if p["id"] == "spark")
    assert spark_open["available"] is True

    held = await intent(IntentRequest(catalog_id="spark"), admin_user)
    after_hold = await pool()
    assert after_hold["running_micros"] > 0

    await cancel_intent(CancelIntent(intent_id=held["intent_id"]), admin_user)
    once_cancel = await pool()
    await cancel_intent(CancelIntent(intent_id=held["intent_id"]), admin_user)
    twice_cancel = await pool()
    assert once_cancel["running_micros"] == twice_cancel["running_micros"]

    # Hold and fulfill should release exactly once.
    held2 = await intent(IntentRequest(catalog_id="spark"), admin_user)
    running_before = (await pool())["running_micros"]
    await fulfill(
        {
            "type": "INITIAL_PURCHASE",
            "store": "PLAY_STORE",
            "environment": "PRODUCTION",
            "product_id": "prod_monthly_ready",
            "transaction_id": "txn_hold_release",
            "entitlement_ids": ["pro"],
            "event_timestamp_ms": int(now_utc().timestamp() * 1000),
            "expiration_at_ms": int((now_utc() + timedelta(days=30)).timestamp() * 1000),
        },
        "u_admin",
    )
    running_after = (await pool())["running_micros"]
    assert running_after < running_before

    # Owner sudo required for financial writes.
    with pytest.raises(HTTPException) as no_unlock:
        await set_budget(
            FundingRequest(
                funded_usd=10,
                evidence="TEST evidence line",
                existing_prepaid_only=True,
                sales_enabled=True,
            ),
            admin_user,
            x_admin_unlock=None,
        )
    assert no_unlock.value.status_code == 403

    token = make_sudo_token("u_admin")
    ok_budget = await set_budget(
        FundingRequest(
            funded_usd=10,
            evidence="TEST evidence line",
            existing_prepaid_only=True,
            sales_enabled=False,
        ),
        admin_user,
        x_admin_unlock=token,
    )
    assert ok_budget["ok"] is True

    ok_rate = await set_rate(
        RateRequest(
            action="chat",
            quality="economy",
            max_cost_usd=0.01,
            evidence="TEST verified connected rate",
            includes_all_inputs_outputs_and_surcharges=True,
        ),
        admin_user,
        x_admin_unlock=token,
    )
    assert ok_rate["ok"] is True

    ok_product = await set_product(
        ProductRequest(
            catalog_id="creator",
            offering_id="default",
            package_id="$rc_creator",
            product_id="prod_creator_ready",
            verified=True,
            evidence="TEST verified product mapping",
            minimum_local_prices={},
        ),
        admin_user,
        x_admin_unlock=token,
    )
    assert ok_product["ok"] is True
