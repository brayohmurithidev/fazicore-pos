from collections.abc import AsyncGenerator

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from starlette.requests import Request

from app.core.config import settings

engine = create_async_engine(
    settings.app_database_url,
    echo=settings.APP_ENV == "development",
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    async with AsyncSessionLocal() as session:
        org_id: int | None = getattr(request.state, "org_id", None)
        # Always set the GUC (even to empty string) so connection-pool reuse
        # can never bleed a previous tenant's org_id into this request.
        # is_local=true resets the value at transaction end.
        await session.execute(
            text("SELECT set_config('app.current_org_id', :v, true)"),
            {"v": str(org_id) if org_id is not None else ""},
        )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
