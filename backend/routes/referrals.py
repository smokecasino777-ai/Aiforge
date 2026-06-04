"""Referral routes."""
from fastapi import APIRouter, Depends

from core import db, get_current_user, make_referral_code, user_to_out

router = APIRouter(tags=["referrals"])


@router.get("/referrals/me")
async def referrals_me(user: dict = Depends(get_current_user)):
    code = user.get("referral_code") or make_referral_code(user["user_id"])
    if not user.get("referral_code"):
        await db.users.update_one(
            {"user_id": user["user_id"]}, {"$set": {"referral_code": code}}
        )
    count = await db.users.count_documents({"referred_by": user["user_id"]})
    out = await user_to_out({**user, "referral_code": code})
    return {
        "code": code,
        "referred_count": count,
        "bonus_amount": out.bonus_amount,
        "bonus_until": out.bonus_until,
        "share_text": (
            f"Join me on AiForge \u2014 use code {code} when you sign up and we both get "
            f"+20 generations/day for a week! https://aiforge.app"
        ),
    }
