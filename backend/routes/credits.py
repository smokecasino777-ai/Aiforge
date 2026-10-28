"""Authenticated credit catalog, action quotes and owner reserve controls."""
import json
import math
import uuid
from datetime import timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field, field_validator
from core import db, ensure_admin, get_current_user, iso, now_utc, daily_used, PLAN_LIMITS
from credit_catalog import ACTIONS, CATALOG, CREDIT_MICROS, UNAVAILABLE
from credit_ledger import budget_change, key, pool, starter, wallet
from routes.admin import ensure_sudo

router = APIRouter(tags=["credits"])
PATH_ACTIONS = {"/chat": "chat", "/generate/scad": "scad", "/editor/caption": "caption",
                "/avatar/generate": "avatar", "/editor/enhance": "image_edit", "/editor/style": "image_edit",
                "/editor/bg-remove": "image_edit", "/voice/tts": "tts", "/voice/stt": "stt"}


def action_for(path, payload):
    return payload.get("type", "image") if path == "/generate" else PATH_ACTIONS.get(path)


def fingerprint(path, payload):
    return key(path + json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=True))


async def balances(user):
    from metering import recover_stale
    await recover_stale(user["user_id"])
    await starter(user)
    doc = await wallet(user["user_id"])
    lots = [{"id": k, **v} for k, v in doc.get("lots", {}).items() if v.get("remaining", 0) > 0]
    current = iso(now_utc())
    usable = [x for x in lots if not x.get("expires_at") or x["expires_at"] > current]
    totals = {kind: sum(x["remaining"] for x in usable if x["kind"] == kind) for kind in ("promo", "monthly", "purchased")}
    return {**totals, "total": sum(totals.values()), "lots": usable, "active_quote": doc.get("active_quote"),
            "legacy_tokens": user.get("tokens_balance", 0), "legacy_plan": user.get("plan", "free"),
            "credit_plan": user.get("credit_plan"), "starter_pending": user.get("credit_catalog_version") == "credits_v1" and not doc.get("lots")}


@router.get("/credits/wallet")
async def get_wallet(user: dict = Depends(get_current_user)):
    return await balances(user)


@router.get("/credits/catalog")
async def catalog(user: dict = Depends(get_current_user)):
    funds = await pool()
    headroom = funds["funded_micros"] - funds["held_micros"] - funds["spent_micros"] - funds["running_micros"]
    mappings = {x["catalog_id"]: x async for x in db.credit_products.find({}, {"_id": 0})}
    rates = await db.credit_rates.find({"verified": True, "valid_until": {"$gt": iso(now_utc())}}, {"_id": 0}).to_list(30)
    products = []
    for item in CATALOG.values():
        mapping = mappings.get(item["id"], {})
        ready = bool(rates and mapping.get("verified") and funds.get("sales_enabled") and headroom >= item["credits"] * CREDIT_MICROS)
        products.append({**item, "available": ready, "package_id": mapping.get("package_id"),
                         "offering_id": mapping.get("offering_id"), "product_id": mapping.get("product_id"),
                         "minimum_local_prices": mapping.get("minimum_local_prices", {}),
                         "reason": None if ready else "Store setup and funded reserves must be verified before purchase."})
    examples = [{"action": r["action"], "quality": r["quality"], "credits": math.ceil(r["max_cost_micros"] * 1.25 / CREDIT_MICROS)} for r in rates]
    return {"version": "credits_v1", "products": products, "free": {"credits": 100, "days": 30, "once": True},
            "examples": examples, "unavailable_services": UNAVAILABLE,
            "disclosure": "Monthly credits expire at the billing-period end. Purchased credits do not expire. Credits have no cash value."}


class QuoteRequest(BaseModel):
    path: str
    payload: dict = Field(default_factory=dict)
    quality: str = "economy"


@router.post("/credits/quote")
async def quote(req: QuoteRequest, user: dict = Depends(get_current_user)):
    action = action_for(req.path, req.payload)
    if action not in ACTIONS:
        raise HTTPException(503, UNAVAILABLE.get(action, "This action is not available for AI quoting."))
    if req.quality not in {"economy", "higher"}:
        raise HTTPException(400, "Unknown quality option")
    if req.quality == "higher" and action not in {"chat", "caption", "scad"}:
        raise HTTPException(503, "Higher-quality output is not priced for this tool yet.")
    raw = json.dumps(req.payload)
    if len(raw) > 8_500_000 or len(str(req.payload.get("prompt", "")).encode()) > 16000:
        raise HTTPException(413, "Request exceeds the quoted input limit")
    rate = await db.credit_rates.find_one({"action": action, "quality": req.quality, "verified": True}, {"_id": 0})
    if not rate:
        raise HTTPException(503, "This model is paused until its connected-provider cost is verified. Local editing remains free.")
    # A rate attestation has a bounded lifetime; stale prices cannot keep selling.
    if rate["valid_until"] <= iso(now_utc()):
        raise HTTPException(503, "Provider pricing needs re-verification before a new quote can be accepted.")
    cost = math.ceil(rate["max_cost_micros"] * 1.25)
    credits = math.ceil(cost / CREDIT_MICROS)
    old_plan = user.get("plan", "free")
    old_paid = old_plan != "free" and await daily_used(user["user_id"]) < PLAN_LIMITS.get(old_plan, 5)
    gift = user.get("free_gens_remaining", 0) > 0 and (user.get("free_gens_expires_at") or "") > iso(now_utc())
    old_capacity = req.path in {"/generate", "/chat", "/generate/scad"} and (user.get("tokens_balance", 0) > 0 or gift)
    legacy = user.get("credit_catalog_version") != "credits_v1" and (old_paid or old_capacity)
    try:
        await ensure_admin(user)
        owner = True
    except HTTPException:
        owner = False
    if legacy or owner:
        credits = 0  # legacy gates are still enforced inside their original routes
    balance = await balances(user)
    funds = await pool()
    if funds["funded_micros"] - funds["spent_micros"] - funds["held_micros"] - funds["running_micros"] < cost:
        raise HTTPException(503, "AI is paused while the prepaid reserve is verified or replenished. No charge was made.")
    if credits > balance["total"]:
        raise HTTPException(402, f"This action needs {credits} credits; your available balance is {balance['total']}.")
    model = ACTIONS[action]
    if req.quality == "higher":
        model = {**model, "provider": "anthropic", "model": "claude-sonnet-4-6", "max_output_tokens": 2048}
    doc = {"quote_id": uuid.uuid4().hex, "user_id": user["user_id"], "action": action,
           "quality": req.quality, "model": model, "credits": credits, "cost_micros": cost,
           "owner_funded": owner or legacy, "legacy": legacy and not owner,
           "fingerprint": fingerprint(req.path, req.payload), "path": req.path,
           "status": "quoted", "created_at": iso(now_utc()), "expires_at": iso(now_utc() + timedelta(minutes=5))}
    await db.credit_quotes.insert_one(doc.copy())
    return {k: doc[k] for k in ("quote_id", "action", "quality", "model", "credits", "expires_at", "legacy")}


@router.get("/credits/history")
async def history(user: dict = Depends(get_current_user)):
    await db.credit_quotes.update_many({"user_id": user["user_id"], "status": "quoted", "expires_at": {"$lte": iso(now_utc())}}, {"$set": {"status": "expired"}})
    rows = await db.credit_quotes.find({"user_id": user["user_id"]}, {"_id": 0, "fingerprint": 0, "cost_micros": 0}).sort("created_at", -1).to_list(30)
    return {"requests": rows}


class IntentRequest(BaseModel):
    catalog_id: str


@router.post("/credits/purchase-intent")
async def intent(req: IntentRequest, user: dict = Depends(get_current_user)):
    data = await catalog(user)
    product = next((x for x in data["products"] if x["id"] == req.catalog_id and x["available"]), None)
    if not product:
        raise HTTPException(503, "This product is not available for purchase.")
    ref = uuid.uuid4().hex
    amount = product["credits"] * CREDIT_MICROS
    # Holds are NOT automatically discarded on timeout: Play may still finish
    # a pending payment. Explicit cancellation/verified receipt releases them.
    await db.credit_purchase_intents.insert_one({"intent_id": ref, "user_id": user["user_id"],
        "catalog_id": req.catalog_id, "product_id": product["product_id"], "amount": amount,
        "state": "preparing", "created_at": iso(now_utc())})
    await budget_change(f"intent:{ref}", {"running_micros": amount}, require_funds=amount)
    await db.credit_purchase_intents.update_one({"intent_id": ref}, {"$set": {"state": "held"}})
    return {"intent_id": ref}


class CancelIntent(BaseModel):
    intent_id: str


@router.post("/credits/purchase-intent/cancel")
async def cancel_intent(req: CancelIntent, user: dict = Depends(get_current_user)):
    doc = await db.credit_purchase_intents.find_one({"intent_id": req.intent_id, "user_id": user["user_id"], "state": "held"}, {"_id": 0})
    if doc:
        await budget_change(f"intent-release:{req.intent_id}", {"running_micros": -doc["amount"]})
        await db.credit_purchase_intents.update_one({"intent_id": req.intent_id}, {"$set": {"state": "cancelled"}})
    return {"ok": True}


@router.get("/credits/admin/budget")
async def admin_budget(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    funds = await pool()
    return {k: funds.get(k, 0) for k in ("funded_micros", "held_micros", "spent_micros", "running_micros", "sales_enabled")} | {
        "promo_ceiling_usd": 25, "rates": await db.credit_rates.find({}, {"_id": 0}).to_list(30),
        "products": await db.credit_products.find({}, {"_id": 0}).to_list(30),
        "warning": "Funds must be existing purchased provider credit, not pending store payouts. No automatic top-ups. Costs are conservative estimates, not an external bill."}


class FundingRequest(BaseModel):
    funded_usd: Decimal = Field(ge=0, le=100000)
    evidence: str = Field(min_length=10, max_length=500)
    existing_prepaid_only: bool
    sales_enabled: bool = False


@router.put("/credits/admin/budget")
async def set_budget(req: FundingRequest, user: dict = Depends(get_current_user), x_admin_unlock: str | None = Header(None)):
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    if not req.existing_prepaid_only:
        raise HTTPException(400, "Only existing purchased funds are authorized")
    await pool()
    await db.credit_funding.update_one({"_id": "pool"}, {"$set": {"funded_micros": int(req.funded_usd * 1000000), "evidence": req.evidence,
        "sales_enabled": req.sales_enabled, "verified_by": user["user_id"], "verified_at": iso(now_utc())}})
    return {"ok": True}


class RateRequest(BaseModel):
    action: str
    quality: str = "economy"
    max_cost_usd: Decimal = Field(gt=0, le=1)
    evidence: str = Field(min_length=10, max_length=500)
    includes_all_inputs_outputs_and_surcharges: bool


@router.put("/credits/admin/rate")
async def set_rate(req: RateRequest, user: dict = Depends(get_current_user), x_admin_unlock: str | None = Header(None)):
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    if req.action not in ACTIONS or req.quality not in {"economy", "higher"} or not req.includes_all_inputs_outputs_and_surcharges:
        raise HTTPException(400, "Supported model and complete bounded-cost evidence required")
    doc = {"action": req.action, "quality": req.quality, "max_cost_micros": math.ceil(req.max_cost_usd * 1000000),
           "evidence": req.evidence, "verified": True, "valid_until": iso(now_utc() + timedelta(days=7))}
    await db.credit_rates.update_one({"action": req.action, "quality": req.quality}, {"$set": doc}, upsert=True)
    return {"ok": True}


class ProductRequest(BaseModel):
    catalog_id: str
    offering_id: str = Field(min_length=1, max_length=100)
    package_id: str = Field(min_length=1, max_length=100)
    product_id: str = Field(min_length=1, max_length=200)
    verified: bool = False
    evidence: str = Field(min_length=10, max_length=500)
    minimum_local_prices: dict[str, float] = Field(default_factory=dict)

    @field_validator("minimum_local_prices")
    @classmethod
    def valid_market_floors(cls, value):
        if len(value) > 180 or any(len(k) != 3 or not k.isalpha() or k != k.upper() or not math.isfinite(v) or v <= 0 for k, v in value.items()):
            raise ValueError("Use uppercase currency codes and verified positive local price floors")
        return value


@router.put("/credits/admin/product")
async def set_product(req: ProductRequest, user: dict = Depends(get_current_user), x_admin_unlock: str | None = Header(None)):
    await ensure_admin(user)
    ensure_sudo(user, x_admin_unlock)
    if req.catalog_id not in CATALOG:
        raise HTTPException(400, "Unknown catalog entry")
    other = await db.credit_products.find_one({"product_id": req.product_id, "catalog_id": {"$ne": req.catalog_id}}, {"_id": 1})
    if other:
        raise HTTPException(409, "A store product cannot grant two catalog entries")
    # This records independently verified store configuration; it does not
    # provision products or claim the managed service supports consumables.
    await db.credit_products.update_one({"catalog_id": req.catalog_id}, {"$set": req.model_dump()}, upsert=True)
    return {"ok": True}