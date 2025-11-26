from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient
from fastapi import HTTPException
from typing import Dict, Any, List, Optional
import httpx
import math

from config import get_logger, settings
from service.storage_service import get_all_official_listings
from models.schemas import CardListResponse, PaginationInfo, AppliedFilters, StoredCardInfo, OfficialListingResponse, OfficialListingCardInfo

logger = get_logger(__name__)

async def get_official_listings_with_filters(
    collection_id: str,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "pricePoints",
    sort_order: str = "asc",
    search_query: Optional[str] = None
) -> CardListResponse:
    """
    Retrieves all cards from the official_listing collection for a specific collection,
    and applies in-memory filtering, sorting, and pagination.

    Args:
        collection_id: The ID of the collection to get official listings for
        page: The page number to retrieve (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "pricePoints")
        sort_order: The sort order, either "asc" or "desc" (default: "asc")
        search_query: Optional search query to filter cards by name

    Returns:
        CardListResponse: A structured response containing the cards, pagination info, and applied filters

    Raises:
        HTTPException: 404 if collection not found, 500 for other errors
    """
    try:
        # Get all cards from the official listing
        all_cards = await get_all_official_listings(collection_id)

        # Apply search filter if provided
        filtered_cards = all_cards
        if search_query and search_query.strip():
            search_term = search_query.strip().lower()
            filtered_cards = [
                card for card in all_cards 
                if search_term in card.get('card_name', '').lower()
            ]

        # Apply sorting
        if sort_order.lower() not in ["asc", "desc"]:
            logger.warning(f"Invalid sort_order '{sort_order}'. Defaulting to 'asc'.")
            sort_order = "asc"

        reverse_sort = sort_order.lower() == "desc"

        # Handle case where the sort_by field might not exist in some cards
        def get_sort_key(card):
            # Default values for common sort fields
            if sort_by == "pricePoints":
                return card.get(sort_by, 0)
            elif sort_by == "card_name":
                return card.get(sort_by, "")
            else:
                return card.get(sort_by, None)

        sorted_cards = sorted(
            filtered_cards,
            key=get_sort_key,
            reverse=reverse_sort
        )

        # Calculate pagination
        total_items = len(sorted_cards)
        total_pages = math.ceil(total_items / per_page) if total_items > 0 else 0

        # Ensure page is within valid range
        current_page = max(1, min(page, total_pages)) if total_pages > 0 else 1

        # Apply pagination
        start_idx = (current_page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_cards = sorted_cards[start_idx:end_idx]

        # Convert to StoredCardInfo objects for response
        # Note: This assumes the structure of cards in official_listing is compatible with StoredCardInfo
        # If not, we would need to adapt the data or create a new model
        cards_response = []
        for card in paginated_cards:
            # Map the card data to StoredCardInfo fields
            # This is a best-effort mapping and might need adjustment based on actual data structure
            card_info = {
                "id": card.get("id", ""),
                "card_name": card.get("card_name", ""),
                "rarity": card.get("rarity", 0),
                "point_worth": card.get("pricePoints", 0),
                "date_got_in_stock": card.get("date_got_in_stock", ""),
                "image_url": card.get("image_url", ""),
                "quantity": card.get("quantity", 0),
                "condition": card.get("condition", "mint"),
                # Add any other fields needed for StoredCardInfo
            }

            # Add the original data as well for completeness
            for key, value in card.items():
                if key not in card_info:
                    card_info[key] = value

            cards_response.append(StoredCardInfo(**card_info))

        # Create and return the response
        return CardListResponse(
            cards=cards_response,
            pagination=PaginationInfo(
                total_items=total_items,
                total_pages=total_pages,
                current_page=current_page,
                per_page=per_page
            ),
            filters=AppliedFilters(
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in get_official_listings_with_filters: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve official listings with filters: {str(e)}")


async def get_official_listings_for_marketplace(
    collection_id: str,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "pricePoints",
    sort_order: str = "asc",
    search_query: Optional[str] = None
) -> OfficialListingResponse:
    """
    Retrieves official marketplace listings in the correct format without point_worth and used_in_fusion.
    
    Args:
        collection_id: The ID of the collection to get official listings for
        page: The page number to retrieve (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "pricePoints")
        sort_order: The sort order, either "asc" or "desc" (default: "asc")
        search_query: Optional search query to filter cards by name

    Returns:
        OfficialListingResponse: Response with the correct format for marketplace
    """
    try:
        # Get all cards from the official listing
        all_cards = await get_all_official_listings(collection_id)

        # Apply search filter if provided
        filtered_cards = all_cards
        if search_query and search_query.strip():
            search_term = search_query.strip().lower()
            filtered_cards = [
                card for card in all_cards 
                if search_term in card.get('card_name', '').lower()
            ]

        # Apply sorting
        if sort_order.lower() not in ["asc", "desc"]:
            logger.warning(f"Invalid sort_order '{sort_order}'. Defaulting to 'asc'.")
            sort_order = "asc"

        reverse_sort = sort_order.lower() == "desc"

        # Handle case where the sort_by field might not exist in some cards
        def get_sort_key(card):
            if sort_by == "pricePoints":
                return card.get(sort_by, 0)
            elif sort_by == "card_name":
                return card.get(sort_by, "")
            else:
                return card.get(sort_by, None)

        sorted_cards = sorted(
            filtered_cards,
            key=get_sort_key,
            reverse=reverse_sort
        )

        # Calculate pagination
        total_items = len(sorted_cards)
        total_pages = math.ceil(total_items / per_page) if total_items > 0 else 0

        # Ensure page is within valid range
        current_page = max(1, min(page, total_pages)) if total_pages > 0 else 1

        # Apply pagination
        start_idx = (current_page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_cards = sorted_cards[start_idx:end_idx]

        # Convert to OfficialListingCardInfo objects for response
        cards_response = []
        for card in paginated_cards:
            # Calculate priceCash if not present
            price_points = card.get("pricePoints", 0)
            price_cash = card.get("priceCash")
            
            # If priceCash is not set, calculate it from pricePoints
            if price_cash is None:
                price_cash = round(price_points / 100.0, 2) if price_points > 0 else 0.0
            
            # The image_url should already have a cached signed URL from get_all_official_listings
            card_info = OfficialListingCardInfo(
                id=card.get("id", ""),
                card_name=card.get("card_name", ""),
                card_reference=f"{collection_id}/{card.get('id', '')}",
                collection_id=collection_id,
                condition=card.get("condition", "mint"),
                date_got_in_stock=card.get("date_got_in_stock", ""),
                date_got_in_stock_unix=card.get("date_got_in_stock_unix"),
                image_url=card.get("image_url", ""),  # Already processed by storage service
                pricePoints=price_points,
                priceCash=price_cash,
                quantity=card.get("quantity", 0),
                rarity=card.get("rarity", 1)
            )
            cards_response.append(card_info)

        # Create and return the response
        return OfficialListingResponse(
            cards=cards_response,
            pagination=PaginationInfo(
                total_items=total_items,
                total_pages=total_pages,
                current_page=current_page,
                per_page=per_page
            ),
            filters=AppliedFilters(
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error in get_official_listings_for_marketplace_firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve official marketplace listings: {str(e)}")

