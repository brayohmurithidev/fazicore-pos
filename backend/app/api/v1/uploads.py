from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.core.deps import get_current_active_user
from app.core.minio import upload_file, get_file_url, delete_file
from app.models.product import Product
from app.repositories.user import UserRepository
from app.models.user import User

router = APIRouter(prefix="/uploads", tags=["uploads"])

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"}
MAX_IMAGE_SIZE = 10 * 1024 * 1024  # 10 MB


class UploadResult(BaseModel):
    url: str
    object_name: str


@router.post("/product-image/{product_id}", response_model=UploadResult)
async def upload_product_image(
    product_id: int,
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UploadResult:
    product = await session.get(Product, product_id)
    if not product or product.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="Product not found")

    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                        "webp": "image/webp", "gif": "image/gif", "avif": "image/avif"}.get(ext, content_type)
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, GIF, or AVIF images allowed")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    # Remove old image if present
    if product.image_url:
        old_name = product.image_url.rsplit("/", 1)[-1]
        delete_file(old_name)

    try:
        object_name = upload_file(data, file.filename or "image.jpg", content_type)
        url = get_file_url(object_name)
    except Exception:
        raise HTTPException(status_code=503, detail="File storage unavailable")

    product.image_url = url
    await session.commit()

    return UploadResult(url=url, object_name=object_name)


@router.post("/avatar", response_model=UploadResult)
async def upload_avatar(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
    current_user: User = Depends(get_current_active_user),
) -> UploadResult:
    content_type = file.content_type or ""
    if content_type not in ALLOWED_IMAGE_TYPES and file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
                        "webp": "image/webp", "avif": "image/avif"}.get(ext, content_type)
    if content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Only JPEG, PNG, WebP, or AVIF images allowed")

    data = await file.read()
    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="Image must be under 5 MB")

    if current_user.photo_url:
        old_name = current_user.photo_url.rsplit("/", 1)[-1]
        delete_file(old_name)

    try:
        object_name = upload_file(data, file.filename or "avatar.jpg", content_type)
        url = get_file_url(object_name)
    except Exception:
        raise HTTPException(status_code=503, detail="File storage unavailable")

    repo = UserRepository(session)
    user = await repo.get(current_user.id)
    if user:
        user.photo_url = url
        await session.commit()

    return UploadResult(url=url, object_name=object_name)
