from functools import lru_cache
from typing import Annotated

from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    APP_ENV: str = "development"
    SECRET_KEY: str = "dev-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Superuser URL — used only by Alembic migrations (bypasses RLS intentionally).
    DATABASE_URL: str = "postgresql+asyncpg://fazipos:fazipos_secret@localhost:5432/fazipos"
    # Restricted app-user URL — no BYPASSRLS, no superuser. RLS policies apply.
    # Falls back to DATABASE_URL when not set (e.g. local dev before migration runs).
    DATABASE_URL_APP: str | None = None

    @property
    def app_database_url(self) -> str:
        return self.DATABASE_URL_APP or self.DATABASE_URL

    REDIS_URL: str = "redis://localhost:6379/0"

    MINIO_ENDPOINT: str = "localhost:9002"
    MINIO_PUBLIC_ENDPOINT: str = ""  # browser-reachable host:port; falls back to MINIO_ENDPOINT
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin123"
    MINIO_BUCKET_NAME: str = "fazipos"
    MINIO_SECURE: bool = False

    CORS_ORIGINS: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    BUSINESS_NAME: str = "Fazi POS"
    CURRENCY: str = "USD"
    TAX_RATE: float = 0.08

    # Platform-level M-Pesa credentials used to collect subscription payments.
    # Leave unset to disable the self-serve upgrade flow (users see "Contact sales").
    MPESA_PLATFORM_SHORTCODE: str | None = None
    MPESA_PLATFORM_CONSUMER_KEY: str | None = None
    MPESA_PLATFORM_CONSUMER_SECRET: str | None = None
    MPESA_PLATFORM_PASSKEY: str | None = None
    MPESA_PLATFORM_ENV: str = "sandbox"  # "sandbox" or "production"

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v: str | list) -> list:
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
