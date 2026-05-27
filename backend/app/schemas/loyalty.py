from pydantic import BaseModel


class LoyaltySettingsOut(BaseModel):
    enabled: bool
    points_per_kes: float
    kes_per_point: float
    min_redeem_points: int

    model_config = {"from_attributes": True}


class LoyaltySettingsUpdate(BaseModel):
    enabled: bool | None = None
    points_per_kes: float | None = None
    kes_per_point: float | None = None
    min_redeem_points: int | None = None


class PointsTransactionOut(BaseModel):
    id: int
    customer_id: int
    order_id: int | None
    type: str
    points: int
    balance_before: int
    balance_after: int
    notes: str | None
    created_at: str

    model_config = {"from_attributes": True}
