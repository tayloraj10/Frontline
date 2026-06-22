import uuid

import boto3
from botocore.config import Config
from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings

router = APIRouter(prefix="/upload", tags=["upload"])


def _r2_client():
    if not settings.r2_access_key_id or not settings.r2_secret_access_key:
        raise HTTPException(503, "R2 storage not configured")
    return boto3.client(
        "s3",
        endpoint_url=f"https://{settings.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=settings.r2_access_key_id,
        aws_secret_access_key=settings.r2_secret_access_key,
        config=Config(signature_version="s3v4"),
        region_name="auto",
    )


UPLOAD_KINDS = {"contributions", "groups", "profiles"}


@router.get("/presign")
async def get_presigned_url(
    filename: str = Query(...),
    content_type: str = Query("image/jpeg"),
    kind: str = Query("contributions"),
):
    if kind not in UPLOAD_KINDS:
        raise HTTPException(400, f"Invalid kind. Must be one of: {', '.join(sorted(UPLOAD_KINDS))}")
    ext = filename.rsplit(".", 1)[-1] if "." in filename else "jpg"
    prefix = "uploads" if settings.is_production else "dev/uploads"
    key = f"{prefix}/{kind}/{uuid.uuid4()}.{ext}"

    client = _r2_client()
    upload_url = client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": settings.r2_bucket_name,
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=300,
    )

    public_url = f"{settings.r2_public_url.rstrip('/')}/{key}"
    return {"upload_url": upload_url, "public_url": public_url, "key": key}
