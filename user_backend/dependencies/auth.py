"""
Authentication dependencies for FastAPI routes.
This module provides easy-to-use dependencies for protecting routes with Firebase authentication.
"""

from typing import Optional
from fastapi import Depends, HTTPException, status
from middleware.firebase_auth import firebase_bearer, get_current_user_id as _get_current_user_id, get_current_user as _get_current_user

# Re-export the main authentication dependencies for easier imports
get_current_user_id = _get_current_user_id
get_current_user = _get_current_user

# Optional: Create a dependency that validates user_id in path matches token
async def validate_user_id_match(
    user_id_from_path: str,
    user_id_from_token: str = Depends(get_current_user_id)
) -> str:
    """
    Validate that the user_id in the path matches the user_id from the token.
    This is useful for endpoints where users should only access their own resources.
    
    Args:
        user_id_from_path: The user_id from the URL path parameter
        user_id_from_token: The user_id extracted from the Firebase token
        
    Returns:
        str: The validated user_id
        
    Raises:
        HTTPException: If the user_ids don't match
    """
    if user_id_from_path != user_id_from_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access your own resources."
        )
    return user_id_from_token


# Create a separate FirebaseBearer instance for optional authentication
from middleware.firebase_auth import FirebaseBearer
optional_firebase_bearer = FirebaseBearer(auto_error=False)

# Optional: Create a dependency for optional authentication
async def get_optional_user_id(
    decoded_token: Optional[dict] = Depends(optional_firebase_bearer)
) -> Optional[str]:
    """
    Get the current user ID if a valid token is provided, otherwise return None.
    Useful for endpoints that have different behavior for authenticated vs anonymous users.
    
    Args:
        decoded_token: The decoded Firebase ID token (optional)
        
    Returns:
        Optional[str]: The user ID if authenticated, None otherwise
    """
    if decoded_token:
        return decoded_token.get("uid")
    return None