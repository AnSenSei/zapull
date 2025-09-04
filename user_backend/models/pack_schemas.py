from pydantic import BaseModel
from typing import List, Dict, Optional, Any

class CardPack(BaseModel):
    """
    Represents a card pack, typically fetched from Firestore.
    The main pack document in Firestore might only store id, name, image_url.
    Other fields like description, rarity_probabilities, cards_by_rarity
    might be compiled from subcollections or other related data if needed for a full view.
    """
    id: str
    name: str
    image_url: Optional[str] = None
    win_rate: Optional[int] = None
    max_win: Optional[int] = None
    min_win: Optional[int] = None
    popularity: Optional[int] = 0
    price: Optional[int] = None
    created_at: Optional[Any] = None
    is_active: Optional[bool] = None
    separation: Optional[str] = "other"  # Can be "hunt", "feature", "special", or "other" (default)
    fusion_count: Optional[int] = 0  # Number of fusion recipes using cards from this pack
    has_fusion_recipes: Optional[bool] = False  # Whether this pack has fusion recipes

class PaginationInfo(BaseModel):
    """Pagination information for list responses"""
    total_items: int
    total_pages: int
    current_page: int
    per_page: int

class AppliedFilters(BaseModel):
    """Filters applied to a pack list query"""
    sort_by: Optional[str] = None
    sort_order: str = "desc"
    search_query: Optional[str] = None

class PaginatedPacksResponse(BaseModel):
    """Response model for paginated packs"""
    packs: List[CardPack]
    pagination: PaginationInfo
    filters: AppliedFilters
    next_cursor: Optional[str] = None  # Cursor for the next page

class StoredCardInfo(BaseModel):
    """
    Represents stored card information from a pack.
    This model matches the backend's StoredCardInfo for consistency.
    """
    id: str
    card_name: str
    rarity: int
    point_worth: int
    date_got_in_stock: str  # Can use date or datetime if specific format is needed
    date_got_in_stock_unix: Optional[int] = None  # Unix timestamp for date_got_in_stock
    image_url: str
    quantity: int = 0  # Default
    condition: str = "near_mint"  # Default condition is "near_mint"
    used_in_fusion: Optional[List[Dict[str, Any]]] = None
    probability: Optional[float] = None  # Probability for cards in packs
    color: Optional[str] = None  # Color of the card

    class Config:
        arbitrary_types_allowed = True