"""RevenueCat subscription integration — authoritative via webhooks only.

Design:
- The CLIENT CANNOT grant itself Pro by calling our API. The old
  `/subscription/sync` with `entitlement_active=true` → plan=pro was a
  server-side trust bug (see testing_agent iteration 15). It is now
  REWRITTEN to be read-only — the client calls it to pick up the latest
  plan from DB, nothing more.
- The AUTHORITATIVE path is `/api/webhook/revenuecat`, which RevenueCat
  calls on every real entitlement change (purchase, renewal, cancellation,
  expiration, billing issue, …). The webhook is protected by a shared
  secret the user configures in the RevenueCat dashboard and sets as
  REVENUECAT_WEBHOOK_SECRET in the backend env.

Server-side plan enforcement (daily_limit in /generate) relies on this —
without it, our API spend could be drained by a hacked client claiming Pro.
"""
import hmac
import math
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError
from credit_fulfillment import fulfill

from core import (
    PLAN_LIMITS,
    APP_ENV,
    REVENUECAT_WEBHOOK_SECRET,
    TOKEN_PACKS,
    db,
    get_current_user,
    iso,
    limiter,
    logger,
    now_utc,
)

router = APIRouter(tags=["subscription"])

# Legacy Stripe-era tiers. Never touched by the RevenueCat path so paying
# users from before the switch keep their original limits.
LEGACY_TIERS = {"spark", "forge", "neon", "quantum", "singularity"}

# RevenueCat event types that activate / deactivate the pro ENTITLEMENT (the
# recurring subscription). NON_RENEWING_PURCHASE is handled separately below
# because it credits consumable tokens — not Pro.
ACTIVATE_EVENTS = {
    "INITIAL_PURCHASE",
    "RENEWAL",
    "UNCANCELLATION",
    "TRIAL_STARTED",
    "TRIAL_CONVERTED",
}
# Token pack events — credit tokens, DO NOT upgrade plan.
TOKEN_EVENTS = {"NON_RENEWING_PURCHASE"}
# RevenueCat semantics: CANCELLATION means auto-renew turned off — the user
# STILL has access until the paid period expires. Only EXPIRATION should
# actually downgrade. BILLING_ISSUE and SUBSCRIPTION_PAUSED are also
# soft-states where the user might still have time left; we wait for the
# follow-up EXPIRATION to downgrade.
DEACTIVATE_EVENTS = {
    "EXPIRATION",
}


class SubscriptionSyncRequest(BaseModel):
    """Legacy-shape request kept for client compatibility. All fields are
    IGNORED — the server only consults its own authoritative DB. The client
    typically calls this right after a RevenueCat purchase to re-fetch the
    plan it already wrote via webhook."""

    entitlement_active: Optional[bool] = None
    product_id: Optional[str] = None
    expires_at: Optional[str] = None


@router.post("/subscription/sync")
@limiter.limit("30/minute")
async def sync_subscription(
    request: Request,
    _req: Optional[SubscriptionSyncRequest] = None,
    user: dict = Depends(get_current_user),
):
    """READ-ONLY: returns the user's current plan (which was set by the
    RevenueCat webhook, not by the client). The request body is ignored.

    Clients call this right after a purchase to pick up the plan the
    webhook just wrote — if the webhook hasn't landed yet, the response
    reflects the pre-purchase plan and the client should retry briefly.
    """
    plan = (user.get("plan") or "free").lower()
    return {
        "ok": True,
        "plan": plan,
        "daily_limit": PLAN_LIMITS.get(plan, 5),
        "subscription_source": user.get("subscription_source"),
        "subscription_expires_at": user.get("subscription_expires_at"),
    }


async def _apply_entitlement(user_id: str, *, active: bool, event: dict) -> dict:
    """Writes `user.plan` based on an authenticated RevenueCat event.

    Returns a summary dict for logging. Grandfathers legacy Stripe tiers.
    """
    if "pro" not in (event.get("entitlement_ids") or []):
        return {"status": "ignored_entitlement"}
    event_ms = _timestamp(event.get("event_timestamp_ms"), "event_timestamp_ms")
    exp_ms = _timestamp(event.get("expiration_at_ms"), "expiration_at_ms")
    # Delayed purchase notifications must not activate an already-expired term.
    active = active and exp_ms > now_utc().timestamp() * 1000
    doc = await db.users.find_one({"user_id": user_id}, {"_id": 0, "plan": 1})
    if not doc:
        logger.warning(f"RC webhook: unknown user_id={user_id}; dropping event")
        return {"status": "unknown_user"}

    current_plan = (doc.get("plan") or "free").lower()
    if current_plan in LEGACY_TIERS:
        # Grandfathered — RevenueCat should never touch these users.
        logger.info(
            f"RC webhook: legacy user {user_id} on {current_plan}; "
            f"ignoring {event.get('type')}"
        )
        return {"status": "grandfathered", "plan": current_plan}

    target_plan = "pro" if active else "free"
    update = {
        "plan": target_plan,
        "plan_updated_at": iso(now_utc()),
        "subscription_source": "revenuecat",
        "subscription_event_timestamp_ms": event_ms,
    }
    product_id = event.get("product_id")
    if product_id:
        update["subscription_product_id"] = product_id
    update["subscription_expires_at"] = iso(datetime.fromtimestamp(exp_ms / 1000, tz=timezone.utc))
    result = await db.users.update_one(
        {"user_id": user_id, "plan": {"$nin": list(LEGACY_TIERS)}, "$or": [
            {"subscription_event_timestamp_ms": {"$exists": False}},
            {"subscription_event_timestamp_ms": {"$lt": event_ms}},
        ]},
        {"$set": update},
    )
    if not result.matched_count:
        return {"status": "stale_or_duplicate"}
    if current_plan != target_plan:
        logger.info(
            f"RC webhook: user {user_id} {current_plan} → "
            f"{target_plan} (event={event.get('type')}, product={product_id})"
        )
    return {"status": "updated", "plan": target_plan}


async def _grant_tokens(user_id: str, event: dict) -> dict:
    """Credit a user's `tokens_balance` based on a RevenueCat
    NON_RENEWING_PURCHASE event. Idempotent per transaction_id.

    product_id MUST exist in TOKEN_PACKS (core.py). Unknown products are
    logged and dropped so a misconfigured Play Store product can't ever
    silently award tokens.
    """
    product_id = (event.get("product_id") or "").strip()
    tokens = TOKEN_PACKS.get(product_id)
    if not tokens:
        logger.warning(
            f"RC webhook: unknown token product_id={product_id!r} for "
            f"user={user_id}; dropping. Known: {list(TOKEN_PACKS.keys())}"
        )
        return {"status": "unknown_product", "product_id": product_id}

    txn_id = event.get("transaction_id")
    if not isinstance(txn_id, str) or not txn_id.strip():
        raise HTTPException(status_code=400, detail="Token purchase requires transaction_id")

    # Idempotency guard: if we've seen this transaction, skip the increment.
    existing = await db.token_ledger.find_one({"transaction_id": txn_id}, {"_id": 0})
    if existing and (existing.get("user_id") != user_id or existing.get("product_id") != product_id):
        raise HTTPException(status_code=409, detail="Transaction already belongs to another purchase")
    if existing and existing.get("status") != "pending":
        logger.info(f"RC webhook: duplicate token grant for txn={txn_id}; skipped")
        return {"status": "duplicate", "transaction_id": txn_id}

    # Make sure the user actually exists before we debit RevenueCat for nothing.
    user = await db.users.find_one({"user_id": user_id}, {"_id": 0, "user_id": 1})
    if not user:
        logger.warning(
            f"RC webhook: token grant for unknown user_id={user_id}; dropping"
        )
        raise HTTPException(status_code=503, detail="Purchase account not available; retry delivery")

    now_iso = iso(now_utc())
    try:
        await db.token_ledger.update_one(
            {"transaction_id": txn_id},
            {"$setOnInsert":
            {
                "status": "pending",
                "user_id": user_id,
                "product_id": product_id,
                "tokens": int(tokens),
                "transaction_id": txn_id,
                "store": event.get("store"),
                "environment": event.get("environment"),
                "price_in_purchased_currency": event.get("price_in_purchased_currency"),
                "currency": event.get("currency"),
                "created_at": now_iso,
            }},
            upsert=True,
        )
    except DuplicateKeyError:
        # Another delivery inserted the same pending record. Continue through
        # the atomic account guard; never mistake general DB errors for success.
        pass

    reserved = await db.token_ledger.find_one({"transaction_id": txn_id}, {"_id": 0})
    if not reserved or reserved.get("user_id") != user_id or reserved.get("product_id") != product_id:
        raise HTTPException(status_code=409, detail="Transaction ownership mismatch")
    if reserved.get("status") != "pending":
        return {"status": "duplicate", "transaction_id": txn_id}

    # Balance increment and idempotency marker are ONE atomic write. A crash
    # before/after the ledger update can be retried without losing/doubling credit.
    credited = await db.users.update_one(
        {"user_id": user_id, "credited_token_transactions": {"$ne": txn_id}},
        {
            "$inc": {
                "tokens_balance": int(tokens),
                "tokens_total_purchased": int(tokens),
            },
            "$set": {"last_token_purchase_at": now_iso},
            "$addToSet": {"credited_token_transactions": txn_id},
        },
    )
    await db.token_ledger.update_one(
        {"transaction_id": txn_id, "user_id": user_id, "status": "pending"},
        {"$set": {"status": "credited"}},
    )
    logger.info(
        f"RC webhook: verified token purchase for {user_id} "
        f"(product={product_id}, txn={txn_id})"
    )
    return {"status": "credited" if credited.modified_count else "duplicate", "tokens": int(tokens), "product_id": product_id}


def _timestamp(value, field: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value < 253402300799000:
        raise HTTPException(status_code=400, detail=f"Invalid {field}")
    return int(value)


async def _refund_tokens(user_id: str, event: dict) -> dict:
    """Revoke an authenticated refunded consumable once, without negative balance."""
    txn_id = event.get("transaction_id")
    if not isinstance(txn_id, str) or not txn_id:
        raise HTTPException(status_code=400, detail="Refund requires transaction_id")
    entry = await db.token_ledger.find_one({"transaction_id": txn_id}, {"_id": 0})
    if not entry or entry.get("status") == "pending":
        raise HTTPException(status_code=503, detail="Purchase not yet recorded; retry refund")
    if entry.get("user_id") != user_id or entry.get("product_id") != event.get("product_id"):
        raise HTTPException(status_code=409, detail="Refund ownership mismatch")
    if entry.get("status") == "refunded":
        return {"status": "duplicate_refund"}
    tokens = int(entry["tokens"])
    result = await db.users.update_one(
        {"user_id": user_id, "refunded_token_transactions": {"$ne": txn_id}},
        [{"$set": {
            "tokens_balance": {"$max": [0, {"$subtract": [{"$ifNull": ["$tokens_balance", 0]}, tokens]}]},
            "tokens_total_purchased": {"$max": [0, {"$subtract": [{"$ifNull": ["$tokens_total_purchased", 0]}, tokens]}]},
            "refunded_token_transactions": {"$setUnion": [{"$ifNull": ["$refunded_token_transactions", []]}, [txn_id]]},
        }}],
    )
    await db.token_ledger.update_one({"transaction_id": txn_id}, {"$set": {"status": "refunded", "refunded_at": iso(now_utc())}})
    return {"status": "refunded" if result.modified_count else "duplicate_refund"}


@router.post("/webhook/revenuecat")
async def revenuecat_webhook(
    request: Request, authorization: Optional[str] = Header(None)
):
    """Authoritative entitlement updates from RevenueCat.

    Security:
      - MUST have `REVENUECAT_WEBHOOK_SECRET` set in env, else all events
        are ACKed but DROPPED (fail-secure).
      - Validates the Authorization header against the shared secret using
        a constant-time comparison. The user configures the exact string
        in RevenueCat dashboard → Integrations → Webhooks.
    """
    if not REVENUECAT_WEBHOOK_SECRET:
        logger.error(
            "RevenueCat webhook received but REVENUECAT_WEBHOOK_SECRET is "
            "not set — ignoring event. Configure it from the Emergent "
            "secrets panel + RevenueCat dashboard."
        )
        raise HTTPException(status_code=503, detail="Purchase verification is not configured")

    provided = (authorization or "").strip()
    expected = REVENUECAT_WEBHOOK_SECRET
    # Also accept "Bearer <secret>" since that's what people usually paste.
    if provided.lower().startswith("bearer "):
        provided = provided[len("bearer "):].strip()
    if not hmac.compare_digest(provided, expected):
        logger.warning("RevenueCat webhook: bad Authorization header; rejecting.")
        raise HTTPException(status_code=401, detail="Invalid webhook authorization")

    try:
        payload = await request.json()
    except Exception as e:
        logger.warning(f"RevenueCat webhook: unparsable JSON: {e}")
        raise HTTPException(status_code=400, detail="Invalid payload")

    if not isinstance(payload, dict):
        logger.warning("RevenueCat webhook: payload is not an object")
        raise HTTPException(status_code=400, detail="Payload must be a JSON object")

    event = payload.get("event")
    if event is None:
        # Legacy "flat" test payloads: the whole body IS the event.
        event = {}
    # Must be an object. Anything else — list, string, number — is malformed.
    if not isinstance(event, dict):
        raise HTTPException(status_code=400, detail="event must be an object")
    if not isinstance(event.get("type"), str):
        raise HTTPException(status_code=400, detail="event.type must be a string")
    event_type = event["type"].upper()
    if APP_ENV == "production" and event.get("store") == "TEST_STORE":
        return {"received": True, "verified": True, "processed": False, "reason": "test_store_not_allowed"}
    app_user_id = event.get("app_user_id")
    if not app_user_id:
        logger.warning(f"RC webhook: missing app_user_id in {event_type}")
        return {"received": True, "verified": True, "processed": False, "reason": "no_user_id"}
    if not isinstance(app_user_id, str) or not app_user_id.strip():
        raise HTTPException(status_code=400, detail="Invalid app_user_id")
    if not isinstance(event.get("product_id", ""), str):
        raise HTTPException(status_code=400, detail="Invalid product_id")
    entitlement_ids = event.get("entitlement_ids")
    if entitlement_ids is not None and (not isinstance(entitlement_ids, list) or not all(isinstance(x, str) for x in entitlement_ids)):
        raise HTTPException(status_code=400, detail="Invalid entitlement_ids")
    # RevenueCat may retain an original anonymous ID after login/restore.
    # Resolve only authenticated webhook aliases, never client-supplied IDs.
    if app_user_id.startswith("$RCAnonymousID:"):
        aliases = event.get("aliases") or []
        if not isinstance(aliases, list) or not all(isinstance(x, str) for x in aliases):
            raise HTTPException(status_code=400, detail="Invalid aliases")
        users = await db.users.find({"user_id": {"$in": aliases[:50]}}, {"_id": 0, "user_id": 1}).to_list(length=2)
        if len(users) != 1:
            raise HTTPException(status_code=503, detail="Purchase identity needs reconciliation")
        app_user_id = users[0]["user_id"]

    new_catalog_result = await fulfill(event, app_user_id)
    if new_catalog_result is not None:
        result = new_catalog_result
    elif event_type in ACTIVATE_EVENTS:
        result = await _apply_entitlement(app_user_id, active=True, event=event)
    elif event_type in DEACTIVATE_EVENTS:
        result = await _apply_entitlement(app_user_id, active=False, event=event)
    elif event_type in TOKEN_EVENTS:
        result = await _grant_tokens(app_user_id, event)
    elif event_type == "CANCELLATION" and event.get("product_id") in TOKEN_PACKS:
        result = await _refund_tokens(app_user_id, event)
    else:
        # TEST events and other informational types we just ACK.
        logger.info(f"RC webhook: ignored event type {event_type} for {app_user_id}")
        return {"received": True, "verified": True, "processed": False, "reason": "ignored_type"}

    return {"received": True, "verified": True, "processed": True, **result}
