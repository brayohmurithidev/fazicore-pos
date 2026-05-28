import io
import logging
import uuid
from pathlib import Path

from minio import Minio
from minio.error import S3Error

from app.core.config import settings

log = logging.getLogger(__name__)

_client: Minio | None = None
_bucket_ready: bool = False


def _strip_scheme(endpoint: str) -> str:
    # Minio() only accepts host:port — strip any http(s):// prefix if misconfigured
    for prefix in ("https://", "http://"):
        if endpoint.startswith(prefix):
            endpoint = endpoint[len(prefix):]
    return endpoint.rstrip("/")


def get_minio() -> Minio:
    global _client
    if _client is None:
        _client = Minio(
            _strip_scheme(settings.MINIO_ENDPOINT),
            access_key=settings.MINIO_ACCESS_KEY,
            secret_key=settings.MINIO_SECRET_KEY,
            secure=settings.MINIO_SECURE,
        )
    return _client


def _ensure_bucket() -> None:
    """Idempotent bucket setup. Retries on each upload until successful."""
    global _bucket_ready
    if _bucket_ready:
        return
    client = get_minio()
    try:
        if not client.bucket_exists(settings.MINIO_BUCKET_NAME):
            client.make_bucket(settings.MINIO_BUCKET_NAME)
            policy = f'''{{
                "Version":"2012-10-17",
                "Statement":[{{
                    "Effect":"Allow",
                    "Principal":{{"AWS":["*"]}},
                    "Action":["s3:GetObject"],
                    "Resource":["arn:aws:s3:::{settings.MINIO_BUCKET_NAME}/*"]
                }}]
            }}'''
            client.set_bucket_policy(settings.MINIO_BUCKET_NAME, policy)
        _bucket_ready = True
    except Exception as exc:
        log.warning("MinIO bucket setup failed (will retry): %s", exc)
        raise


def upload_file(file_data: bytes, filename: str, content_type: str) -> str:
    _ensure_bucket()
    client = get_minio()
    ext = Path(filename).suffix
    object_name = f"{uuid.uuid4()}{ext}"
    client.put_object(
        settings.MINIO_BUCKET_NAME,
        object_name,
        io.BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )
    return object_name


def get_file_url(object_name: str) -> str:
    scheme = "https" if settings.MINIO_SECURE else "http"
    public = settings.MINIO_PUBLIC_ENDPOINT or settings.MINIO_ENDPOINT
    return f"{scheme}://{public}/{settings.MINIO_BUCKET_NAME}/{object_name}"


def delete_file(object_name: str) -> None:
    try:
        client = get_minio()
        client.remove_object(settings.MINIO_BUCKET_NAME, object_name)
    except Exception as exc:
        log.warning("MinIO delete failed for %s: %s", object_name, exc)
