"""
Utility functions for challenger account validation.
"""

import re
from fastapi import HTTPException


def is_challenger_account(user_id: str) -> bool:
    """
    Check if a user_id is a challenger account (challenger1 to challenger100).
    
    Args:
        user_id: The user ID to check
        
    Returns:
        True if the user_id matches challenger1 to challenger100 pattern, False otherwise
    """
    if not user_id:
        return False
    
    # Check if user_id matches challenger1 to challenger100 pattern
    pattern = r'^challenger([1-9]|[1-9][0-9]|100)$'
    return bool(re.match(pattern, user_id, re.IGNORECASE))


def validate_not_challenger_account(user_id: str, feature_name: str = "this feature") -> None:
    """
    Validate that the user is not a challenger account. Raises HTTPException if they are.
    
    Args:
        user_id: The user ID to validate
        feature_name: Name of the feature being accessed (for error message)
        
    Raises:
        HTTPException: If the user is a challenger account
    """
    if is_challenger_account(user_id):
        raise HTTPException(
            status_code=403, 
            detail=f"Challenger accounts are not allowed to use {feature_name}"
        )
