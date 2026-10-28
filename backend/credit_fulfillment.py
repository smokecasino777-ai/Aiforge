"""Verified RevenueCat events for the NEW credit catalog; legacy handlers stay intact."""
from datetime import datetime, timezone
from fastapi import HTTPException
from core import db, iso, now_utc
from credit_catalog import CATALOG
from credit_ledger import budget_change, grant, revoke


async def fulfill(event: dict, user_id: str):
    # Disabling NEW sales must not stop fulfillment of already-paid renewals.
    product = await db.credit_products.find_one({"product_id": event.get("product_id")}, {"_id": 0})
    if not product:
        return None
    item = CATALOG.get(product["catalog_id"])
    if not item:
        raise HTTPException(503, "Product configuration needs reconciliation")
    typ = event["type"].upper()
    if event.get("store") not in {"PLAY_STORE", "APP_STORE", "TEST_STORE", "MAC_APP_STORE"}:
        raise HTTPException(400, "Unsupported store for this catalog")
    transaction = event.get("transaction_id")
    if not isinstance(transaction, str) or not transaction:
        raise HTTPException(400, "A verified store transaction is required")
    reference = f"{event.get('store', 'unknown')}:{transaction}"
    if typ == "CANCELLATION" and (item["kind"] == "purchased" or event.get("cancel_reason") == "CUSTOMER_SUPPORT"):
        await revoke(user_id, reference)
        return {"status": "credits_refunded"}
    eligible = {"NON_RENEWING_PURCHASE"} if item["kind"] == "purchased" else {"INITIAL_PURCHASE", "RENEWAL"}
    if typ not in eligible:
        return {"status": "recorded_without_new_credits"}
    if event.get("period_type") == "TRIAL":
        return {"status": "awaiting_paid_renewal"}
    expires = None
    if item["kind"] == "monthly":
        if "pro" not in (event.get("entitlement_ids") or []):
            raise HTTPException(400, "Monthly product is not attached to the required entitlement")
        expiry = event.get("expiration_at_ms")
        if isinstance(expiry, bool) or not isinstance(expiry, (int, float)) or not 0 < expiry < 253402300799000:
            raise HTTPException(400, "Verified subscription period is required")
        expires = iso(datetime.fromtimestamp(expiry / 1000, tz=timezone.utc))
    if not await db.users.find_one({"user_id": user_id}, {"_id": 1}):
        raise HTTPException(503, "Purchase account is unavailable; retry notification")
    await db.credit_receipts.update_one({"_id": reference}, {"$setOnInsert": {
        "user_id": user_id, "catalog_id": item["id"], "created_at": iso(now_utc()), "expires_at": expires}}, upsert=True)
    receipt = await db.credit_receipts.find_one({"_id": reference}, {"_id": 0})
    if receipt["user_id"] != user_id or receipt["catalog_id"] != item["id"]:
        raise HTTPException(409, "Receipt belongs to another account or product")
    paid = event.get("environment") == "PRODUCTION" and event.get("store") != "TEST_STORE"
    await grant(user_id, reference, item["credits"], item["kind"], expires, paid=paid)
    if item["kind"] == "monthly":
        event_ms = event.get("event_timestamp_ms", 0)
        if not isinstance(event_ms, (int, float)) or isinstance(event_ms, bool):
            raise HTTPException(400, "Invalid event timestamp")
        await db.users.update_one({"user_id": user_id, "$or": [
            {"credit_event_ms": {"$exists": False}}, {"credit_event_ms": {"$lt": event_ms}}]},
            {"$set": {"credit_plan": item["id"], "credit_renewal_at": expires, "credit_event_ms": event_ms}})
    intent = await db.credit_purchase_intents.find_one({"user_id": user_id, "product_id": product["product_id"], "state": "held"}, {"_id": 0})
    if intent:
        await budget_change(f"intent-release:{intent['intent_id']}", {"running_micros": -intent["amount"]})
        await db.credit_purchase_intents.update_one({"intent_id": intent["intent_id"]}, {"$set": {"state": "fulfilled"}})
    await db.credit_receipts.update_one({"_id": reference}, {"$set": {"status": "fulfilled"}})
    return {"status": "credits_verified", "catalog_id": item["id"], "credits": item["credits"]}