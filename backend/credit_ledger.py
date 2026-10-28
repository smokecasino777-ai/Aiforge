"""Credit liabilities, prefunded budget, idempotent grants and bounded usage.

All monetary accounting uses integer USD microdollars, never floats.
Cross-document operations are retryable sagas. Financial reference markers
prevent double-credit/release. No customer balance is silently migrated.
"""
import hashlib
from datetime import timedelta
from fastapi import HTTPException
from pymongo import ReturnDocument
from core import db, iso, now_utc
from credit_catalog import CREDIT_MICROS, PROMO_MONTHLY_CEILING


def key(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def pool():
    await db.credit_funding.update_one({"_id": "pool"}, {"$setOnInsert": {
        "funded_micros": 0, "held_micros": 0, "spent_micros": 0,
        "running_micros": 0, "sales_enabled": False,
    }}, upsert=True)
    return await db.credit_funding.find_one({"_id": "pool"}, {"_id": 0})


async def budget_change(ref: str, changes: dict, require_funds: int = 0, promo: int = 0):
    """One global atomic write per reference, safe to replay after a crash."""
    await pool()
    marker = f"operations.{key(ref)}"
    query = {"_id": "pool", marker: {"$exists": False}}
    if require_funds:
        query["$expr"] = {"$gte": [{"$subtract": ["$funded_micros", {"$add": ["$held_micros", "$spent_micros", "$running_micros"]}]}, require_funds]}
    if promo:
        field = f"promo.{now_utc().strftime('%Y-%m')}"
        query["$or"] = [{field: {"$exists": False}}, {field: {"$lte": PROMO_MONTHLY_CEILING - promo}}]
        changes = {**changes, field: promo}
    result = await db.credit_funding.update_one(query, {"$inc": changes, "$set": {marker: True}})
    if not result.matched_count:
        done = await db.credit_funding.find_one({"_id": "pool", marker: True}, {"_id": 1})
        if not done:
            raise HTTPException(503, "The funded AI reserve is unavailable. No new charge was made.")


async def wallet(user_id: str):
    await db.credit_wallets.update_one({"_id": user_id}, {"$setOnInsert": {"lots": {}, "active_quote": None}}, upsert=True)
    doc = await db.credit_wallets.find_one({"_id": user_id}, {"_id": 0})
    for lot_id, lot in doc.get("lots", {}).items():
        if lot.get("expires_at") and lot["expires_at"] <= iso(now_utc()) and lot.get("remaining", 0) > 0:
            # Do not alter an account while a generation reservation is active.
            result = await db.credit_wallets.update_one(
                {"_id": user_id, "active_quote": None, f"lots.{lot_id}.remaining": lot["remaining"]},
                {"$set": {f"lots.{lot_id}.remaining": 0, f"lots.{lot_id}.expired_amount": lot["remaining"]}},
            )
            if result.modified_count:
                lot["expired_amount"] = lot["remaining"]
                lot["remaining"] = 0
        if lot.get("expired_amount"):
            await budget_change(f"expire:{user_id}:{lot_id}", {"held_micros": -lot["expired_amount"] * CREDIT_MICROS})
    return doc


async def grant(user_id: str, reference: str, credits: int, kind: str, expires_at=None, paid=False):
    """Paid receipts always become obligations, even if a renewal creates a deficit."""
    await db.credit_grant_owners.update_one({"_id": reference}, {"$setOnInsert": {"user_id": user_id, "credits": credits, "kind": kind}}, upsert=True)
    owner = await db.credit_grant_owners.find_one({"_id": reference}, {"_id": 0})
    if owner != {"user_id": user_id, "credits": credits, "kind": kind}:
        raise HTTPException(409, "Credit grant ownership or amount mismatch")
    amount = credits * CREDIT_MICROS
    await budget_change(f"grant:{reference}", {"held_micros": amount},
                        require_funds=0 if paid else amount, promo=amount if not paid else 0)
    await wallet(user_id)
    lot_id = key(reference)
    await db.credit_wallets.update_one(
        {"_id": user_id, f"lots.{lot_id}": {"$exists": False}},
        {"$set": {f"lots.{lot_id}": {"reference": reference, "kind": kind, "granted": credits,
                                    "remaining": credits, "expires_at": expires_at}}},
    )


async def starter(user: dict):
    if user.get("credit_catalog_version") != "credits_v1":
        return
    # Stable hash prevents deletion/re-registration using the same email
    # from producing unlimited introductory grants. No email in the ledger.
    ref = "starter:" + key(user["email"].strip().lower())
    existing = await db.credit_grants.find_one({"_id": ref}, {"_id": 0})
    if existing and existing.get("user_id") != user["user_id"]:
        return
    expiry = existing["expires_at"] if existing and existing.get("status") == "granted" else iso(now_utc() + timedelta(days=30))
    try:
        await db.credit_grants.update_one({"_id": ref}, {"$setOnInsert": {"user_id": user["user_id"]}, "$set": {"expires_at": expiry}}, upsert=True)
        await grant(user["user_id"], ref, 100, "promo", expiry)
        await db.credit_grants.update_one({"_id": ref}, {"$set": {"status": "granted"}})
    except HTTPException:
        # No funded reserve means no invented free money/allowance.
        return


async def reserve_wallet(user_id: str, quote_id: str, credits: int):
    doc = await wallet(user_id)
    if doc.get("active_quote"):
        raise HTTPException(409, "One AI request can run per account. Check the previous request first.")
    lots = doc.get("lots", {})
    ordered = sorted(lots.items(), key=lambda pair: pair[1].get("expires_at") or "9999")
    remaining, allocation, updates, query = credits, [], {}, {"_id": user_id, "active_quote": None}
    for lot_id, lot in ordered:
        if lot.get("expires_at") and lot["expires_at"] <= iso(now_utc()):
            continue
        count = min(remaining, lot.get("remaining", 0))
        if count:
            allocation.append({"lot": lot_id, "credits": count})
            field = f"lots.{lot_id}.remaining"
            query[field] = lot["remaining"]
            updates[field] = lot["remaining"] - count
            remaining -= count
    if remaining:
        raise HTTPException(402, "Not enough available credits for this quote.")
    updates.update({"active_quote": quote_id, f"reservations.{quote_id}": {"allocation": allocation, "credits": credits, "status": "reserved"}})
    if not (await db.credit_wallets.update_one(query, {"$set": updates})).matched_count:
        raise HTTPException(409, "Your balance changed. Please request a new quote.")


async def settle_wallet(user_id: str, quote_id: str, success: bool):
    doc = await db.credit_wallets.find_one({"_id": user_id}, {"_id": 0})
    reservation = (doc or {}).get("reservations", {}).get(quote_id, {})
    if reservation.get("status") != "reserved":
        return
    update = {"$set": {"active_quote": None, f"reservations.{quote_id}.status": "spent" if success else "released"}}
    if not success:
        update["$inc"] = {f"lots.{x['lot']}.remaining": x["credits"] for x in reservation["allocation"]}
    await db.credit_wallets.update_one({"_id": user_id, f"reservations.{quote_id}.status": "reserved"}, update)


async def revoke(user_id: str, reference: str):
    lot_id = key(reference)
    doc = await wallet(user_id)
    if doc.get("active_quote"):
        raise HTTPException(503, "Retry refund after the active request settles")
    lot = doc.get("lots", {}).get(lot_id)
    if not lot:
        raise HTTPException(503, "Purchase grant not yet recorded; retry refund")
    before = await db.credit_wallets.find_one_and_update(
        {"_id": user_id, "active_quote": None, f"lots.{lot_id}.revoked": {"$ne": True}},
        [{"$set": {f"lots.{lot_id}.revoked_amount": f"$lots.{lot_id}.remaining", f"lots.{lot_id}.remaining": 0, f"lots.{lot_id}.revoked": True}}],
        projection={"_id": 0}, return_document=ReturnDocument.AFTER,
    )
    latest = (before or doc).get("lots", {}).get(lot_id, {})
    await budget_change(f"revoke:{reference}", {"held_micros": -int(latest.get("revoked_amount", 0)) * CREDIT_MICROS})