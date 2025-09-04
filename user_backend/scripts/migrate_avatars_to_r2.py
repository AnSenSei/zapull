#!/usr/bin/env python3
import os
import sys
import time
import argparse
import logging
import mimetypes
from typing import Optional, Tuple
from uuid import uuid4

import requests
import boto3
from botocore.config import Config as BotoConfig
from botocore.exceptions import ClientError
from google.cloud import firestore

# --- Config via environment variables ---
# Required
R2_ENDPOINT = "https://10c5a6603c2479b5ee449179b5877db5.r2.cloudflarestorage.com" # e.g. https://<accountid>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID = "4efb72bd0c675eaef34bcac66113062f"
R2_SECRET_ACCESS_KEY = "9c4df4f314dd939cf0277c4d962db9b6c7aaceb1284ccfb5687654ad69909a1c"
# Default to the production bucket name you provided
R2_BUCKET = os.environ.get("R2_BUCKET", "user-avator-production")
# Public base URL (CDN/custom domain for the bucket)
R2_PUBLIC_BASE_URL = os.environ.get("R2_PUBLIC_BASE_URL", "https://avator.zapull.fun")
# Optional
GOOGLE_AVATAR_HOST = os.environ.get("GOOGLE_AVATAR_HOST", "lh3.googleusercontent.com")
HTTP_TIMEOUT = float(os.environ.get("HTTP_TIMEOUT", 15))
MAX_RETRIES = int(os.environ.get("MAX_RETRIES", 5))
INITIAL_BACKOFF = float(os.environ.get("INITIAL_BACKOFF", 0.5))
LOG_LEVEL = os.environ.get("LOG_LEVEL", "INFO")

logging.basicConfig(level=LOG_LEVEL, format='[%(levelname)s] %(message)s')
logger = logging.getLogger("migrate_avatars")


# def ensure_env() -> None:
#     missing = [
#         name for name in ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_PUBLIC_BASE_URL"]
#         if not os.environ.get(name)
#     ]
#     if missing:
#         logger.error("Missing required environment variables: %s", ", ".join(missing))
#         sys.exit(2)
#

def make_s3_client():
    # Cloudflare R2 is S3-compatible
    session = boto3.session.Session()
    client = session.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=BotoConfig(signature_version="s3v4"),
    )
    return client


def is_google_avatar(url: Optional[str]) -> bool:
    if not url or not isinstance(url, str):
        return False
    return GOOGLE_AVATAR_HOST in url


def guess_extension(content_type: Optional[str]) -> str:
    if not content_type:
        return ""
    ext = mimetypes.guess_extension(content_type.split(";")[0].strip()) or ""
    # Normalize some common types
    if ext == ".jpe":
        ext = ".jpg"
    return ext


def fetch_image(url: str) -> Tuple[bytes, str]:
    headers = {
        "User-Agent": "ZapullAvatarMigrator/1.0 (+https://zapull.com)",
        "Accept": "image/avif,image/webp,image/*;q=0.8,*/*;q=0.5",
    }
    backoff = INITIAL_BACKOFF
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            resp = requests.get(url, headers=headers, timeout=HTTP_TIMEOUT)
            # Handle rate limiting/backoff
            if resp.status_code in (429, 503):
                logger.warning("Got %s from %s (attempt %d/%d)", resp.status_code, url, attempt, MAX_RETRIES)
                time.sleep(backoff)
                backoff = min(backoff * 2, 10.0)
                continue
            resp.raise_for_status()
            content_type = resp.headers.get("Content-Type", "application/octet-stream")
            return resp.content, content_type
        except requests.RequestException as e:
            logger.warning("HTTP error fetching %s: %s (attempt %d/%d)", url, e, attempt, MAX_RETRIES)
            time.sleep(backoff)
            backoff = min(backoff * 2, 10.0)
    raise RuntimeError(f"Failed to fetch image after {MAX_RETRIES} attempts: {url}")


def build_object_key(user_id: str, ext: str) -> str:
    ext = (ext or '').lower()
    if not ext.startswith('.'):
        ext = f".{ext}" if ext else ''
    # Key structure: avatars/<user_id>/<uuid>.<ext>
    return f"avatars/{user_id}/{uuid4().hex}{ext}"


def upload_to_r2(s3, key: str, data: bytes, content_type: str) -> None:
    try:
        s3.put_object(
            Bucket=R2_BUCKET,
            Key=key,
            Body=data,
            ContentType=content_type or "application/octet-stream",
            # ACL is governed by bucket policy on R2; omit if using public bucket with custom domain
        )
    except ClientError as e:
        logger.error("Failed to upload to R2 s3://%s/%s: %s", R2_BUCKET, key, e)
        raise


def to_public_url(key: str) -> str:
    base = R2_PUBLIC_BASE_URL.rstrip('/')
    # Safety: correct common typo if present in env
    if 'avatar.zapull.fun' in base:
        base = base.replace('avatar.zapull.fun', 'avator.zapull.fun')
    return f"{base}/{key}"


def migrate_one_user(s3, db, user_id: str, dry_run: bool = False) -> Optional[str]:
    doc_ref = db.collection("users").document(user_id)
    doc = doc_ref.get()
    if not doc.exists:
        logger.warning("User doc not found: %s", user_id)
        return None
    data = doc.to_dict() or {}
    avatar = data.get("avatar")

    if not is_google_avatar(avatar):
        logger.info("Skip %s: avatar not Google (%s)", user_id, avatar)
        return None

    logger.info("Migrating %s", user_id)
    if dry_run:
        logger.info("Dry-run: would fetch and upload %s", avatar)
        return None

    img_bytes, content_type = fetch_image(avatar)
    ext = guess_extension(content_type) or ".jpg"
    key = build_object_key(user_id, ext)
    upload_to_r2(s3, key, img_bytes, content_type)
    new_url = to_public_url(key)

    # Update Firestore
    doc_ref.update({"avatar": new_url})
    logger.info("Updated user %s avatar => %s", user_id, new_url)
    return new_url


def migrate_batch(s3, db, limit: Optional[int] = None, dry_run: bool = False) -> None:
    # Firestore cannot do startsWith; stream and filter client-side.
    # If your collection is large, consider storing a flag/index or running this in chunks with cursors.
    count = 0
    for doc in db.collection("users").stream():
        user_id = doc.id
        data = doc.to_dict() or {}
        avatar = data.get("avatar")
        if not is_google_avatar(avatar):
            continue
        migrate_one_user(s3, db, user_id, dry_run=dry_run)
        count += 1
        if limit and count >= limit:
            break


def parse_args():
    p = argparse.ArgumentParser(description="Migrate user avatars from Google to Cloudflare R2 and update Firestore.")
    p.add_argument("--user-id", help="Migrate a single user by ID")
    p.add_argument("--limit", type=int, help="Max number of users to migrate in batch mode")
    p.add_argument("--dry-run", action="store_true", help="Do not upload or update Firestore; just log actions")
    return p.parse_args()


def main():
    # ensure_env()

    args = parse_args()

    # Firestore client (uses GOOGLE_APPLICATION_CREDENTIALS or default creds)
    db = firestore.Client()

    s3 = make_s3_client()

    if args.user_id:
        migrate_one_user(s3, db, args.user_id, dry_run=args.dry_run)
    else:
        migrate_batch(s3, db, limit=args.limit, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
