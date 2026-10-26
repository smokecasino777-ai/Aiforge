"""Token balance + ledger endpoints.

Tokens are the one-time, consumable alternative to a Pro subscription. Users
earn them two ways:
  1. Free gift at signup — 5 free_gens that expire 30 days later.
  2. Buying a token pack via RevenueCat (NON_RENEWING_PURCHASE webhook, see
     routes/subscription.py → _grant_tokens).

Spending happens inside routes/generation.py via consume_capacity_free().

These endpoints are READ-ONLY — the client cannot credit tokens itself.
"""
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends

from core import (
    FREE_SIGNUP_GENS,
    TOKEN_COSTS,
    db,
    get_current_user,
    iso,
    now_utc,
)

router = APIRouter(tags=["tokens"])


@router.get("/tokens/balance")
async def tokens_balance(user: dict = Depends(get_current_user)):
    """Current free_gens + paid tokens balance for the authenticated user."""
    expires_at = user.get("free_gens_expires_at") or ""
    try:
        free_valid = (
            bool(expires_at)
            and datetime.fromisoformat(expires_at) > now_utc()
        )
    except Exception:
        free_valid = False

    free_remaining = int(user.get("free_gens_remaining", 0) or 0) if free_valid else 0
    tokens_balance = int(user.get("tokens_balance", 0) or 0)
    tokens_total_purchased = int(user.get("tokens_total_purchased", 0) or 0)

    return {
        "free_gens_remaining": free_remaining,
        "free_gens_expires_at": expires_at if free_valid else None,
        "tokens_balance": tokens_balance,
        "tokens_total_purchased": tokens_total_purchased,
        "total_available": free_remaining + tokens_balance,
        "costs": TOKEN_COSTS,
        "signup_gens": FREE_SIGNUP_GENS,
    }


@router.get("/tokens/history")
async def tokens_history(user: dict = Depends(get_current_user)):
    """Last 20 purchased token packs for this user (newest first)."""
    cursor = (
        db.token_ledger.find({"user_id": user["user_id"]}, {"_id": 0})
        .sort("created_at", -1)
        .limit(20)
    )
    entries: List[dict] = []
    async for row in cursor:
        entries.append(
            {
                "product_id": row.get("product_id"),
                "tokens": int(row.get("tokens", 0)),
                "store": row.get("store"),
                "environment": row.get("environment"),
                "created_at": row.get("created_at"),
                "transaction_id": row.get("transaction_id"),
            }
        )
    return {"entries": entries, "count": len(entries)}
