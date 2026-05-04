from pydantic import BaseModel

from app.schemas.user import UserOut


class PinLoginRequest(BaseModel):
    org_slug: str
    user_id: int
    pin: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


class RefreshRequest(BaseModel):
    refresh_token: str


class VerifyPinRequest(BaseModel):
    org_slug: str
    user_id: int
    pin: str
