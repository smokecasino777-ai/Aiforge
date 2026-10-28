"""One fixed quote per provider request; all AI routes share this choke point."""
import asyncio
from datetime import timedelta
from contextvars import ContextVar
from fastapi import HTTPException
from fastapi.routing import APIRoute
from fastapi.security import HTTPAuthorizationCredentials
from core import db, get_current_user, iso, now_utc
from credit_ledger import budget_change, reserve_wallet, settle_wallet, key
from routes.credits import fingerprint

current_quote = ContextVar("current_credit_quote", default=None)


async def recover_stale(user_id):
    # All provider calls are bounded to six minutes. After fifteen minutes
    # an interrupted operation can be settled conservatively without retrying AI.
    query = {"user_id": user_id, "status": {"$in": ["running", "reserving"]}, "created_at": {"$lt": iso(now_utc() - timedelta(minutes=15))}}
    async for quote in db.credit_quotes.find(query, {"_id": 0}).limit(20):
        reserved = await db.credit_funding.find_one({"_id": "pool", f"operations.{key('request:' + quote['quote_id'])}": True}, {"_id": 1})
        already_released = await db.credit_funding.find_one({"_id": "pool", f"operations.{key('reserve-failed:' + quote['quote_id'])}": True}, {"_id": 1})
        if reserved and not already_released:
            await settle(quote, False)
        else:
            await db.credit_quotes.update_one({"quote_id": quote["quote_id"]}, {"$set": {"status": "released"}})


async def provider_start():
    quote = current_quote.get()
    if not quote:
        raise HTTPException(428, "An accepted cost quote is required before contacting AI providers")
    await db.credit_quotes.update_one({"quote_id": quote["quote_id"]}, {"$set": {"provider_started": True}})
    quote["provider_started"] = True
    return quote


async def settle(quote, success):
    await db.credit_quotes.update_one({"quote_id": quote["quote_id"], "settlement_success": {"$exists": False}},
                                     {"$set": {"settlement_success": success}})
    stored = await db.credit_quotes.find_one({"quote_id": quote["quote_id"]}, {"_id": 0, "settlement_success": 1})
    success = stored["settlement_success"]
    used = quote["cost_micros"] if quote.get("provider_started") else 0
    credits = quote["credits"] if success else 0
    await budget_change(f"settle:{quote['quote_id']}", {"running_micros": -quote["cost_micros"],
        "spent_micros": used, "held_micros": -credits * 1000})
    await settle_wallet(quote["user_id"], quote["quote_id"], success)
    await db.credit_quotes.update_one({"quote_id": quote["quote_id"]}, {"$set": {
        "status": "completed" if success else "released", "settled_at": iso(now_utc()), "owner_cost_micros": used}})


class MeteredRoute(APIRoute):
    def get_route_handler(self):
        handler = super().get_route_handler()

        async def metered(request):
            if request.method != "POST" or request.url.path in {"/api/editor/save", "/api/avatar/set", "/api/avatar/clear"}:
                return await handler(request)
            path = request.url.path.removeprefix("/api")
            if path not in {"/generate", "/chat", "/generate/scad", "/editor/enhance", "/editor/style", "/editor/bg-remove", "/editor/caption", "/avatar/generate", "/voice/tts", "/voice/stt"}:
                return await handler(request)
            bearer = request.headers.get("authorization", "")
            user = await get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=bearer.removeprefix("Bearer ")))
            quote_id = request.headers.get("X-Credit-Quote", "")
            quote = await db.credit_quotes.find_one({"quote_id": quote_id, "user_id": user["user_id"]}, {"_id": 0})
            if not quote or quote["status"] != "quoted" or quote["expires_at"] <= iso(now_utc()):
                raise HTTPException(428, "Review and accept a current credit quote first")
            payload = {"seconds": 60} if path == "/voice/stt" else await request.json()
            if quote["fingerprint"] != fingerprint(path, payload):
                raise HTTPException(409, "Request changed after quoting. Review a new quote.")
            claimed = await db.credit_quotes.update_one({"quote_id": quote_id, "status": "quoted"}, {"$set": {"status": "reserving"}})
            if not claimed.modified_count:
                raise HTTPException(409, "This quote was already used")
            await budget_change(f"request:{quote_id}", {"running_micros": quote["cost_micros"]},
                require_funds=quote["cost_micros"], promo=quote["cost_micros"] if quote["owner_funded"] else 0)
            try:
                await reserve_wallet(user["user_id"], quote_id, quote["credits"])
            except Exception:
                await budget_change(f"reserve-failed:{quote_id}", {"running_micros": -quote["cost_micros"]})
                raise
            await db.credit_quotes.update_one({"quote_id": quote_id}, {"$set": {"status": "running"}})
            token = current_quote.set(quote)
            try:
                response = await asyncio.wait_for(handler(request), timeout=360)
                await settle(quote, response.status_code < 400)
                return response
            except BaseException:
                await asyncio.shield(settle(quote, False))
                raise
            finally:
                current_quote.reset(token)
        return metered