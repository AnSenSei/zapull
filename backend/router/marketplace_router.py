from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from service.storage_service import add_to_official_listing, withdraw_from_official_listing, get_all_official_listings, update_official_listing
from service.marketplace_service import get_official_listings_with_filters, get_official_listings_for_marketplace
from config import get_logger, get_firestore_client, settings

logger = get_logger(__name__)


router = APIRouter(
    prefix="/marketplace",
    tags=["marketplace"],
    responses={404: {"description": "Not found"}},
)

@router.post("/official_listing")
async def add_to_official_listing_endpoint(
    collection_id: str = Query(..., description="Collection ID the card belongs to"),
    card_id: str = Query(..., description="Card ID to add to the official listing"),
    quantity: int = Query(1, description="Quantity of cards to add to the official listing"),
    priceCash: float = Query(..., description="Price in USD for the card in the official listing"),
    type: str = Query("card", description="Type of item: card, pack, or box")
):
    """
    Adds a card to the official_listing collection.
    Creates a new collection called "official_listing" if it doesn't exist.
    Adds a subcollection with the provided collection_id.
    Adds the card under that subcollection with the specified fields.

    Parameters:
    - collection_id: The ID of the collection the card belongs to
    - card_id: The ID of the card to add to the official listing
    - quantity: The quantity of cards to add to the official listing (default: 1)
    - priceCash: The price in USD for the card in the official listing (required)
    - type: The type of item - card, pack, or box (default: card)
    """
    try:
        result = await add_to_official_listing(collection_id, card_id, quantity, priceCash, type)
        return {
            "status": "success",
            "message": f"Card {card_id} from collection {collection_id} added to official listing with quantity {quantity}, priceCash ${priceCash}, and type {type}",
            "data": result
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in add_to_official_listing_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.get("/official_listings")
async def get_official_listings_endpoint(
    collection_id: str = Query(..., description="Collection ID to get official listings for"),
    page: int = Query(1, description="Page number to retrieve", ge=1),
    per_page: int = Query(10, description="Number of items per page", ge=1, le=100),
    sort_by: str = Query("pricePoints", description="Field to sort by"),
    sort_order: str = Query("asc", description="Sort order (asc or desc)"),
    search_query: Optional[str] = Query(None, description="Search query to filter cards by name")
):
    """
    Retrieves cards from the official_listing collection for a specific collection,
    with support for search, sort, and pagination.

    Parameters:
    - collection_id: The ID of the collection to get official listings for
    - page: The page number to retrieve (default: 1)
    - per_page: The number of items per page (default: 10, max: 100)
    - sort_by: The field to sort by (default: "pricePoints")
    - sort_order: The sort order, either "asc" or "desc" (default: "asc")
    - search_query: Optional search query to filter cards by name
    """
    try:
        result = await get_official_listings_for_marketplace(
            collection_id=collection_id,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )

        # Extract the total number of items for the message
        total_items = result.pagination.total_items

        return {
            "status": "success",
            "message": f"Retrieved {len(result.cards)} cards from official listing for collection {collection_id} (total: {total_items})",
            "data": result
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in get_official_listings_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.delete("/official_listing")
async def withdraw_official_listing_endpoint(
    collection_id: str = Query(..., description="Collection ID the card belongs to"),
    card_id: str = Query(..., description="Card ID to withdraw from the official listing")
):
    """
    Withdraws a card completely from the official_listing collection.
    This endpoint removes the card from the official marketplace entirely:
    - Deletes the card document from the official_listing collection
    - Returns all quantity_in_offical_marketplace back to the original card's quantity field
    - Sets quantity_in_offical_marketplace to 0

    Parameters:
    - collection_id: The ID of the collection the card belongs to
    - card_id: The ID of the card to withdraw from the official listing
    """
    try:
        result = await withdraw_from_official_listing(collection_id, card_id)
        return {
            "status": "success",
            "message": f"Card {card_id} from collection {collection_id} completely withdrawn from official listing",
            "data": result
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in withdraw_official_listing_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

@router.put("/official_listing")
async def update_official_listing_endpoint(
    collection_id: str = Query(..., description="Collection ID the card belongs to"),
    card_id: str = Query(..., description="Card ID to update in the official listing"),
    priceCash: Optional[float] = Query(None, description="New price in USD for the card in the official listing"),
    type: Optional[str] = Query(None, description="New type for the item: card, pack, or box"),
    quantity: Optional[int] = Query(None, description="New quantity for the card in the official listing")
):
    """
    Updates a card in the official_listing collection.
    This endpoint updates the priceCash, type, and/or quantity of a card in the official marketplace.

    Parameters:
    - collection_id: The ID of the collection the card belongs to
    - card_id: The ID of the card to update in the official listing
    - priceCash: The new price in USD for the card in the official listing (optional)
    - type: The new type for the item - card, pack, or box (optional)
    - quantity: The new quantity for the card in the official listing (optional)
    """
    try:
        # Validate that at least one field is provided for update
        if priceCash is None and type is None and quantity is None:
            raise HTTPException(status_code=400, detail="At least one field (priceCash, type, or quantity) must be provided for update")
            
        result = await update_official_listing(collection_id, card_id, priceCash, type, quantity)
        
        # Build dynamic message based on what was updated
        update_parts = []
        if priceCash is not None:
            update_parts.append(f"priceCash ${priceCash}")
        if type is not None:
            update_parts.append(f"type {type}")
        if quantity is not None:
            update_parts.append(f"quantity {quantity}")
        update_message = " and ".join(update_parts)
        
        return {
            "status": "success",
            "message": f"Card {card_id} from collection {collection_id} updated in official listing with {update_message}",
            "data": result
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in update_official_listing_endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


