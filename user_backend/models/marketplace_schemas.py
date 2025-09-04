from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from models.schemas import CardListing, PaginationInfo, AppliedFilters




class PaginatedListingsResponse(BaseModel):
    """Response model for paginated listings"""
    listings: List[CardListing]
    pagination: PaginationInfo
    filters: AppliedFilters


class OfficialListingCardInfo(BaseModel):
    """Model for official marketplace card listings - excludes point_worth and used_in_fusion"""
    id: str
    card_name: str
    card_reference: str
    collection_id: str
    condition: str
    date_got_in_stock: str
    image_url: str
    pricePoints: int
    quantity: int
    rarity: int


class OfficialListingResponse(BaseModel):
    """Response model for official marketplace listings"""
    cards: List[OfficialListingCardInfo]
    pagination: PaginationInfo
    filters: AppliedFilters
