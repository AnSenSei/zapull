from pydantic import BaseModel, validator
from typing import List, Dict, Optional, Any

class CollectionItem(BaseModel):
    """
    Simple model for collection list endpoints - returns only id and name.
    Used by list_packs_route to match collection metadata endpoint behavior.
    """
    id: str
    name: str

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

class AddPackRequest(BaseModel):
    """
    Request model for creating a new card pack.
    """
    pack_name: str
    collection_id: str
    price: int
    win_rate: Optional[int] = None
    max_win: Optional[int] = None
    min_win: Optional[int] = None
    is_active: bool = False
    popularity: Optional[int] = 0
    separation: Optional[str] = "other"  # Can be "hunt", "feature", "special", or "other" (default)

class CardInPack(BaseModel):
    """
    Represents a card added to a pack.
    This is stored as a document under /packs/{packId}/cards/{cardId}
    """
    name: str
    quantity: Optional[int] = 0
    point: Optional[int] = 0
    image_url: Optional[str] = None
    probability: Optional[float] = 0.0
    condition: Optional[str] = "new"

    class Config:
        arbitrary_types_allowed = True

class AddCardToPackRequest(BaseModel):
    """
    Request model for adding a card directly to a pack with its own probability.
    """
    name: str
    quantity: Optional[int] = 0
    point: Optional[int] = 0
    image_url: Optional[str] = None
    probability: Optional[float] = 0.0
    condition: Optional[str] = "new"

class UpdatePackRequest(BaseModel):
    """
    Request model for updating an existing card pack.

    Fields:
    - pack_name: Optional new name for the pack.
    - description: Optional new description for the pack.
    - rarities: Optional. Updates to rarity configurations. For each rarity level (e.g., "common"),
      provide a dictionary. To overwrite the entire card list for a rarity, 
      include a "cards": ["card_id1", "card_id2", ...] entry in the dictionary.
      Example: `{"common": {"probability": 0.75, "cards": ["new_card_x", "new_card_y"]}}`
    - cards_to_add: Atomically adds cards to specific rarities without overwriting existing cards.
    - cards_to_delete: Atomically removes cards from specific rarities.

    At least one field (pack_name, description, rarities, cards_to_add, or cards_to_delete)
    must be provided to make an update.
    """
    pack_name: Optional[str] = None
    description: Optional[str] = None
    rarities: Optional[Dict[str, Dict[str, Any]]] = None
    win_rate: Optional[int] = None
    max_win: Optional[int] = None
    min_win: Optional[int] = None
    popularity: Optional[int] = None
    separation: Optional[str] = None


class AddCardToPackDirectRequest(BaseModel):
    """
    Request model for adding a card directly to a pack with its own probability.
    This card will be stored as a document under /packs/{packId}/cards/{cardId}
    The card's condition is taken from the card data in storage.

    Fields:
    - document_id: The ID of the card to add (card name)
    - probability: The probability value for the card as a percentage (0 to 100)
    - color: The color of the card (default: "white")
    """
    document_id: str
    probability: float
    color: Optional[str] = "white"
    
    @validator('probability')
    def validate_probability(cls, v):
        if v < 0 or v > 100:
            raise ValueError('Probability must be between 0 and 100 (representing 0% to 100%)')
        return v

class DeleteCardFromPackRequest(BaseModel):
    """
    Request model for deleting a card directly from a pack.
    This identifies the card to be deleted from /packs/{packId}/cards/{cardId}

    Fields:
    - document_id: The ID of the card to delete (card name)
    """
    document_id: str

class BatchAddCardsToPackRequest(BaseModel):
    """
    Request model for adding multiple cards directly to a pack in a batch operation.

    Fields:
    - cards: List of AddCardToPackDirectRequest objects, each containing:
      - document_id: The ID of the card to add (card name)
      - probability: The probability value for the card as a percentage (0 to 100)
      - color: The color of the card (default: "white")
    """
    cards: List[AddCardToPackDirectRequest]

class BatchAddCardsResult(BaseModel):
    """
    Result model for a single card in a batch add operation.

    Fields:
    - document_id: The ID of the card that was processed
    - success: Whether the card was successfully added
    - error_message: Error message if the card failed to be added (None if successful)
    """
    document_id: str
    success: bool
    error_message: Optional[str] = None

class BatchAddCardsToPackResponse(BaseModel):
    """
    Response model for batch adding cards to a pack.

    Fields:
    - total_cards: Total number of cards in the batch
    - successful_cards: Number of cards successfully added
    - failed_cards: Number of cards that failed to be added
    - results: List of individual card results
    - pack_id: The ID of the pack that cards were added to
    - collection_id: The ID of the collection containing the pack
    """
    total_cards: int
    successful_cards: int
    failed_cards: int
    results: List[BatchAddCardsResult]
    pack_id: str
    collection_id: str

class UpdateCardInPackRequest(BaseModel):
    """
    Request model for updating a card's probability and/or color in a pack.
    
    Fields:
    - probability: Optional new probability value for the card as a percentage (0 to 100)
    - color: Optional new color for the card
    """
    probability: Optional[float] = None
    color: Optional[str] = None
    
    @validator('probability')
    def validate_probability(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Probability must be between 0 and 100 (representing 0% to 100%)')
        return v
    
    @validator('color')
    def validate_color(cls, v):
        if v is not None and v.strip() == "":
            raise ValueError('Color cannot be empty string')
        return v

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
