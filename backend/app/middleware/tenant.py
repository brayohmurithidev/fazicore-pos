from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import settings

_BYPASS_PREFIXES = ("/docs", "/openapi.json", "/redoc", "/health")
_BYPASS_PATHS = {"/api/v1/auth/login", "/api/v1/auth/refresh"}


class TenantMiddleware(BaseHTTPMiddleware):
    """
    Peeks at the Bearer JWT to populate request.state before the endpoint runs.

    request.state.org_id            — int | None  (None for platform admins / unauthenticated)
    request.state.org_slug          — str | None  (from X-Org-Slug header)
    request.state.is_platform_admin — bool

    The database dependency reads request.state.org_id and issues
    SET LOCAL app.current_org_id = <value> so PostgreSQL RLS policies fire.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        request.state.org_id = None
        request.state.org_slug = request.headers.get("X-Org-Slug")
        request.state.is_platform_admin = False

        path = request.url.path
        if path in _BYPASS_PATHS or any(path.startswith(p) for p in _BYPASS_PREFIXES):
            return await call_next(request)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return await call_next(request)

        token = auth[7:]
        try:
            payload = jwt.decode(
                token,
                settings.SECRET_KEY,
                algorithms=[settings.ALGORITHM],
                options={"verify_exp": False},  # expiry enforced by the endpoint dependency
            )
        except JWTError:
            return await call_next(request)

        if payload.get("platform"):
            request.state.is_platform_admin = True
            return await call_next(request)

        org_id = payload.get("org_id")
        if org_id is not None:
            request.state.org_id = int(org_id)

        return await call_next(request)
