from typing import Optional, Dict, Any
from google.cloud.firestore_v1 import AsyncClient

from config import get_logger
from service.card_service import (
    get_all_fusion_recipes,
    get_fusion_packs_in_collection,
    perform_fusion,
    perform_random_fusion,
    check_card_missing,
    get_fusion_recipe_with_user_info
)

logger = get_logger(__name__)

# Re-export functions from card_service for fusion-specific use
__all__ = [
    "get_all_fusion_recipes",
    "get_fusion_packs_in_collection", 
    "perform_fusion",
    "perform_random_fusion",
    "check_card_missing",
    "get_fusion_recipe_with_user_info"
]