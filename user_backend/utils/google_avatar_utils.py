"""
Utility functions for downloading Google avatars and uploading them to R2.
"""

import aiohttp
import asyncio
from typing import Optional, Tuple
from fastapi import HTTPException
from config import get_logger
from utils.storage_utils import upload_avatar

logger = get_logger(__name__)


async def download_and_upload_google_avatar(
    google_avatar_url: str, 
    user_id: str,
    timeout: int = 30
) -> Optional[str]:
    """
    Download a Google avatar image and upload it to R2.
    
    Args:
        google_avatar_url: The Google avatar URL (e.g., from Google OAuth)
        user_id: The ID of the user whose avatar is being uploaded
        timeout: Timeout in seconds for the HTTP request
        
    Returns:
        The R2 URL of the uploaded avatar, or None if failed
        
    Raises:
        HTTPException: If there's a critical error that should stop user creation
    """
    if not google_avatar_url or not google_avatar_url.startswith('http'):
        logger.warning(f"Invalid Google avatar URL: {google_avatar_url}")
        return None
        
    try:
        logger.info(f"Downloading Google avatar for user {user_id}: {google_avatar_url}")
        
        # Download the avatar image
        timeout_config = aiohttp.ClientTimeout(total=timeout)
        async with aiohttp.ClientSession(timeout=timeout_config) as session:
            async with session.get(google_avatar_url) as response:
                if response.status != 200:
                    logger.warning(f"Failed to download Google avatar for user {user_id}: HTTP {response.status}")
                    return None
                
                # Check content type
                content_type = response.headers.get('content-type', 'image/jpeg').lower()
                if not content_type.startswith('image/'):
                    logger.warning(f"Invalid content type for Google avatar: {content_type}")
                    return None
                
                # Read the image data
                avatar_data = await response.read()
                
                if len(avatar_data) == 0:
                    logger.warning(f"Empty avatar data downloaded for user {user_id}")
                    return None
                
                # Check file size (limit to 10MB)
                max_size = 10 * 1024 * 1024  # 10MB
                if len(avatar_data) > max_size:
                    logger.warning(f"Google avatar too large for user {user_id}: {len(avatar_data)} bytes")
                    return None
                
                logger.info(f"Downloaded Google avatar for user {user_id}: {len(avatar_data)} bytes, content-type: {content_type}")
                
                # Upload to R2
                r2_avatar_url = await upload_avatar(avatar_data, user_id, content_type)
                logger.info(f"Successfully uploaded Google avatar to R2 for user {user_id}: {r2_avatar_url}")
                
                return r2_avatar_url
                
    except asyncio.TimeoutError:
        logger.warning(f"Timeout downloading Google avatar for user {user_id}")
        return None
    except aiohttp.ClientError as e:
        logger.warning(f"HTTP error downloading Google avatar for user {user_id}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error downloading Google avatar for user {user_id}: {e}", exc_info=True)
        # Don't raise HTTPException here - we want user creation to continue even if avatar fails
        return None


def extract_google_avatar_from_user_data(user_data: dict) -> Optional[str]:
    """
    Extract Google avatar URL from user data (e.g., from Firebase token claims).
    
    This function looks for common Google avatar fields in user data and returns
    a processable avatar URL.
    
    Args:
        user_data: Dictionary containing user information from Google OAuth/Firebase
        
    Returns:
        Google avatar URL if found, None otherwise
    """
    # Common fields where Google avatar URLs might be stored
    avatar_fields = [
        'picture',  # Most common field in Google OAuth
        'avatar',
        'avatar_url', 
        'photo',
        'photoURL',
        'image_url'
    ]
    
    for field in avatar_fields:
        avatar_url = user_data.get(field)
        if avatar_url and isinstance(avatar_url, str) and avatar_url.startswith('http'):
            # Verify it's likely a Google avatar URL
            if 'googleusercontent.com' in avatar_url or 'lh3.google.com' in avatar_url:
                logger.info(f"Found Google avatar URL in field '{field}': {avatar_url}")
                return avatar_url
    
    logger.debug("No Google avatar URL found in user data")
    return None


def enhance_google_avatar_url(google_avatar_url: str, size: int = 400) -> str:
    """
    Enhance a Google avatar URL to request a higher resolution image.
    
    Google avatar URLs often have size parameters that can be modified to get
    better quality images.
    
    Args:
        google_avatar_url: The original Google avatar URL
        size: The desired size in pixels (default: 400)
        
    Returns:
        Enhanced Google avatar URL with higher resolution
    """
    if not google_avatar_url:
        return google_avatar_url
    
    try:
        # Google avatar URLs typically have size parameters like s96-c or =s96-c
        # We can modify these to request larger images
        
        # Pattern 1: URLs ending with =s{size}-c (most common)
        if '=s' in google_avatar_url and '-c' in google_avatar_url:
            # Replace the size parameter
            import re
            enhanced_url = re.sub(r'=s\d+-c', f'=s{size}-c', google_avatar_url)
            logger.debug(f"Enhanced Google avatar URL: {google_avatar_url} -> {enhanced_url}")
            return enhanced_url
            
        # Pattern 2: URLs with /s{size}-c/ in the path
        if '/s' in google_avatar_url and '-c/' in google_avatar_url:
            import re
            enhanced_url = re.sub(r'/s\d+-c/', f'/s{size}-c/', google_avatar_url)
            logger.debug(f"Enhanced Google avatar URL: {google_avatar_url} -> {enhanced_url}")
            return enhanced_url
            
        # If no size parameter found, try adding one
        if 'googleusercontent.com' in google_avatar_url:
            if '?' in google_avatar_url:
                enhanced_url = f"{google_avatar_url}&sz={size}"
            else:
                enhanced_url = f"{google_avatar_url}?sz={size}"
            logger.debug(f"Added size parameter to Google avatar URL: {google_avatar_url} -> {enhanced_url}")
            return enhanced_url
            
    except Exception as e:
        logger.warning(f"Error enhancing Google avatar URL: {e}")
    
    # Return original URL if enhancement fails
    return google_avatar_url
