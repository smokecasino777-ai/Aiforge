"""Pydantic request / response models shared across routes."""
from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    name: Optional[str] = None
    referral_code: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleSessionRequest(BaseModel):
    session_id: str


class UserOut(BaseModel):
    id: str
    email: str
    name: Optional[str] = None
    picture: Optional[str] = None
    plan: str = "free"
    daily_used: int = 0
    daily_limit: int = 5
    referral_code: Optional[str] = None
    bonus_until: Optional[str] = None
    bonus_amount: int = 0


class AuthResponse(BaseModel):
    token: str
    user: UserOut


class GenerateRequest(BaseModel):
    type: Literal["image", "video", "model3d", "chat"]
    prompt: str
    title: Optional[str] = None
    duration: Optional[int] = 4
    size: Optional[str] = "1280x720"


class ChatRequest(BaseModel):
    prompt: str
    session_id: Optional[str] = None


class ScadRequest(BaseModel):
    prompt: str


class CreationOut(BaseModel):
    id: str
    type: str
    title: str
    prompt: str
    status: str  # "ready" | "processing" | "failed"
    media_data: Optional[str] = None
    media_mime: Optional[str] = None
    preview_image: Optional[str] = None
    error: Optional[str] = None
    created_at: str
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[int] = None


class CheckoutRequest(BaseModel):
    plan: Literal["spark", "forge", "neon", "quantum", "singularity"]
    origin_url: str


class CheckoutResponse(BaseModel):
    url: str
    session_id: str


class StripeKeyRequest(BaseModel):
    key: str  # "sk_live_..." or "sk_test_..."
