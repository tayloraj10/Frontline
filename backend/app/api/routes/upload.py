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


UPLOAD_KINDS = {"contributions", "groups", "profiles", "events", "partners"}


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


def _key_from_public_url(public_url: str) -> str | None:
    prefix = f"{settings.r2_public_url.rstrip('/')}/"
    if not public_url.startswith(prefix):
        return None
    return public_url[len(prefix):]


def delete_r2_object(public_url: str) -> None:
    key = _key_from_public_url(public_url)
    if key is None:
        raise ValueError(f"URL {public_url!r} does not match configured r2_public_url prefix")
    _r2_client().delete_object(Bucket=settings.r2_bucket_name, Key=key)


def delete_r2_objects_batch(public_urls: list[str]) -> list[str]:
    """Best-effort batch delete. Returns a list of error strings (empty on full success)."""
    keys = {k for u in public_urls if (k := _key_from_public_url(u)) is not None}
    if not keys:
        return []
    errors: list[str] = []
    try:
        client = _r2_client()
    except HTTPException as e:
        return [str(e.detail)]
    keys_list = sorted(keys)
    for i in range(0, len(keys_list), 1000):
        batch = keys_list[i : i + 1000]
        try:
            result = client.delete_objects(
                Bucket=settings.r2_bucket_name,
                Delete={"Objects": [{"Key": k} for k in batch], "Quiet": True},
            )
            for err in result.get("Errors", []):
                errors.append(f"{err.get('Key')}: {err.get('Message')}")
        except Exception as e:
            errors.append(str(e))
    return errors
