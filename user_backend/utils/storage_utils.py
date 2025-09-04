"""
Storage utilities for Cloudflare R2 storage.
R2 URLs are publicly accessible, no signed URLs needed.
"""

import os
import uuid
import boto3
from typing import Optional, Tuple
from fastapi import HTTPException
from config import get_logger, settings
import base64

logger = get_logger(__name__)

# R2 bucket domains (now configurable via settings)
R2_DOMAINS = {
    'achievement': settings.r2_public_domain_achievement,
    'pack': settings.r2_public_domain_pack,
    'card': settings.r2_public_domain_card,
    'avatar': settings.r2_public_domain_avatar,
}

# R2 bucket names from settings
R2_BUCKETS = {
    'achievement': settings.r2_bucket_achievement,
    'pack': settings.r2_bucket_pack,
    'card': settings.r2_bucket_card,
    'avatar': settings.r2_bucket_avatar,
}

# Initialize S3 client for R2
s3_client = boto3.client(
    's3',
    endpoint_url=settings.r2_endpoint,
    aws_access_key_id=settings.r2_access_key_id,
    aws_secret_access_key=settings.r2_secret_access_key,
    region_name='auto'  # R2 uses 'auto' region
)

def get_public_url(storage_path: str, bucket_type: str) -> str:
    """
    Get a public R2 URL for a storage path.
    
    Args:
        storage_path: The object path in the bucket
        bucket_type: Type of bucket ('achievement', 'pack', 'card', 'avatar')
        
    Returns:
        A publicly accessible R2 URL
    """
    domain = R2_DOMAINS.get(bucket_type)
    if not domain:
        raise ValueError(f"Unknown bucket type: {bucket_type}")
        
    # Remove leading slash if present
    if storage_path.startswith('/'):
        storage_path = storage_path[1:]
        
    return f"https://{domain}/{storage_path}"

async def upload_to_r2(
    data: bytes,
    object_key: str,
    bucket_type: str,
    content_type: str = 'application/octet-stream'
) -> str:
    """
    Upload data to R2 storage.
    
    Args:
        data: Binary data to upload
        object_key: The object key/path in the bucket
        bucket_type: Type of bucket ('achievement', 'pack', 'card', 'avatar')
        content_type: The content type of the data
        
    Returns:
        The public R2 URL
    """
    try:
        bucket_name = R2_BUCKETS.get(bucket_type)
        if not bucket_name:
            raise ValueError(f"Unknown bucket type: {bucket_type}")
            
        # Remove leading slash if present
        if object_key.startswith('/'):
            object_key = object_key[1:]
            
        # Upload to R2
        s3_client.put_object(
            Bucket=bucket_name,
            Key=object_key,
            Body=data,
            ContentType=content_type,
            # R2 automatically makes objects public if bucket is configured for public access
        )
        
        # Return the public URL
        public_url = get_public_url(object_key, bucket_type)
        logger.info(f"Successfully uploaded to R2: {public_url}")
        
        return public_url
        
    except Exception as e:
        logger.error(f"Error uploading to R2: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload to R2: {str(e)}")

async def upload_avatar(avatar_data: bytes, user_id: str, content_type: str = None) -> str:
    """
    Upload an avatar image to R2 storage.
    
    Args:
        avatar_data: Binary image data
        user_id: The ID of the user whose avatar is being uploaded
        content_type: The content type of the image (e.g., "image/jpeg")
        
    Returns:
        The public R2 URL of the uploaded avatar
        
    Raises:
        HTTPException: If there's an error uploading the avatar
    """
    try:
        # If content_type is not provided, default to jpeg
        if not content_type:
            content_type = 'image/jpeg'
            
        # Generate a unique filename for the avatar
        filename = f"avatars/{user_id}/{uuid.uuid4()}.{get_file_extension(content_type)}"
        
        # Upload to R2
        avatar_url = await upload_to_r2(
            data=avatar_data,
            object_key=filename,
            bucket_type='avatar',
            content_type=content_type
        )
        
        return avatar_url
        
    except Exception as e:
        logger.error(f"Error uploading avatar for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

async def upload_image(image_data: bytes, object_key: str, bucket_type: str, content_type: str = None) -> str:
    """
    Upload an image to R2 storage.
    
    Args:
        image_data: Binary image data
        object_key: The object key/path in the bucket
        bucket_type: Type of bucket ('achievement', 'pack', 'card', 'avatar')
        content_type: The content type of the image
        
    Returns:
        The public R2 URL
    """
    # Default content type: preserve transparency for achievement emblems
    if not content_type:
        content_type = 'image/png' if bucket_type == 'achievement' else 'image/jpeg'
        
    return await upload_to_r2(
        data=image_data,
        object_key=object_key,
        bucket_type=bucket_type,
        content_type=content_type
    )

def parse_base64_image(base64_image: str) -> Tuple[str, bytes]:
    """
    Parses a base64 encoded image string to extract content type and binary data.
    
    Args:
        base64_image: Base64 encoded image string (e.g., "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...")
        
    Returns:
        A tuple containing the content type and binary data
        
    Raises:
        ValueError: If the base64 image string is invalid
    """
    try:
        # Split the base64 image string into content type and data
        content_type_part, base64_data = base64_image.split(';base64,')
        content_type = content_type_part.split(':')[1]
        
        # Decode base64 to binary
        binary_data = base64.b64decode(base64_data)
        
        return content_type, binary_data
    except Exception as e:
        raise ValueError(f"Invalid base64 image format: {e}")

def get_file_extension(content_type: str) -> str:
    """
    Gets the file extension for a given content type.
    
    Args:
        content_type: The content type (e.g., "image/jpeg")
        
    Returns:
        The file extension (e.g., "jpg")
    """
    content_type_map = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'application/octet-stream': 'bin'
    }
    
    return content_type_map.get(content_type, 'bin')

async def delete_from_r2(object_key: str, bucket_type: str) -> bool:
    """
    Delete an object from R2 storage.
    
    Args:
        object_key: The object key/path in the bucket
        bucket_type: Type of bucket ('achievement', 'pack', 'card', 'avatar')
        
    Returns:
        True if successful, False otherwise
    """
    try:
        bucket_name = R2_BUCKETS.get(bucket_type)
        if not bucket_name:
            raise ValueError(f"Unknown bucket type: {bucket_type}")
            
        # Remove leading slash if present
        if object_key.startswith('/'):
            object_key = object_key[1:]
            
        # Delete from R2
        s3_client.delete_object(
            Bucket=bucket_name,
            Key=object_key
        )
        
        logger.info(f"Successfully deleted from R2: {bucket_name}/{object_key}")
        return True
        
    except Exception as e:
        logger.error(f"Error deleting from R2: {e}", exc_info=True)
        return False