from fastapi import APIRouter, HTTPException, Depends, Path, Query, Body
from typing import Optional, List
from google.cloud import firestore
from pydantic import BaseModel

from models.schemas import (UserCard, UserCardsResponse, UserCardListResponse, DrawnCard, CardReferencesRequest,
                            PackOpeningHistoryResponse, DestroyCardsRequest, DrawMultipleCardsResponse)
from models.pack_schemas import StoredCardInfo
from service.card_service import (
    draw_card_from_pack,
    draw_multiple_cards_from_pack_optimized,
    demo_draw_multiple_cards_from_pack,
    draw_daily_free_box,
    get_user_cards,
    destroy_card,
    destroy_multiple_cards,
    perform_fusion,
    perform_random_fusion,
    get_user_card,
    check_card_missing,
    add_card_to_highlights,
    delete_card_from_highlights,
    add_to_top_hits,
    get_user_highlights,
    get_card_by_id,
)
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id

logger = get_logger(__name__)

router = APIRouter(
    prefix="/cards",
    tags=["cards"],
)


@router.get("/cards", response_model=UserCardsResponse)
async def get_user_cards_route(
    collection_id: str = Query(..., description="The ID of the collection to get cards from"),
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("date_got", description="Field to sort by (default: date_got)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    search_query: Optional[str] = Query(None, description="Optional search query to filter cards by name"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all cards for a user with pagination.

    This endpoint:
    1. Takes a user ID as a path parameter
    2. Requires a collection_id query parameter to specify which subcollection to get cards from
    3. Supports pagination with page and per_page query parameters
    4. Supports sorting with sort_by and sort_order query parameters
    5. Supports searching with search_query query parameter
    6. Returns a list of cards grouped by subcollection
    """
    try:
        cards_response = await get_user_cards(
            user_id=user_id,
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query,
            subcollection_name=collection_id
        )
        return cards_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting cards for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the cards")

# @router.post("/{user_id}/draw-card", response_model=DrawnCard)
# async def draw_card_route(
#     user_id: str = Path(...),
#     pack_id: str = Query(..., description="The ID of the pack to draw from"),
#     db: firestore.AsyncClient = Depends(get_firestore_client)
# ):
#     """
#     Draw a card from a pack for a user.
#
#     This endpoint:
#     1. Takes a user ID and pack ID as arguments
#     2. Draws a random card from the pack based on the pack's probabilities
#     3. Adds the card to the user's collection
#     4. Returns the drawn card
#     """
#     try:
#         drawn_card = await draw_card_from_pack(
#             user_id=user_id,
#             pack_id=pack_id,
#             db_client=db
#         )
#         return drawn_card
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error drawing card for user: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail="An error occurred while drawing the card")

@router.post("/draw-multiple-cards", response_model=DrawMultipleCardsResponse)
async def draw_multiple_cards_route(
    pack_id: str = Query(..., description="The ID of the pack to draw from"),
    collection_id: str = Query(..., description="The ID of the collection containing the pack"),
    count: int = Query(..., description="The number of cards to draw"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Draw multiple cards from a pack for a user.

    This endpoint:
    1. Takes a user ID, pack ID, collection ID, and count as arguments
    2. Draws the specified number of random cards from the pack based on the pack's probabilities
    3. Adds the cards to the user's collection
    4. Returns the drawn cards
    """
    try:
        result = await draw_multiple_cards_from_pack_optimized(
            collection_id=collection_id,
            pack_id=pack_id,
            user_id=user_id,
            db_client=db,
            count=count
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error drawing multiple cards for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while drawing the cards")

@router.post("/demo-draw-multiple-cards", response_model=DrawMultipleCardsResponse)
async def demo_draw_multiple_cards_route(
    pack_id: str = Query(..., description="The ID of the pack to draw from"),
    collection_id: str = Query(..., description="The ID of the collection containing the pack"),
    count: int = Query(5, description="The number of cards to draw (1, 5, or 10)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Demo endpoint to draw multiple cards from a pack without authentication or point deduction.

    This endpoint:
    1. Takes pack ID, collection ID, and count as arguments
    2. Draws the specified number of random cards from the pack based on the pack's probabilities
    3. Does NOT require authentication
    4. Does NOT deduct points
    5. Does NOT add cards to any user's collection
    6. Returns the drawn cards with demo flags
    """
    try:
        result = await demo_draw_multiple_cards_from_pack(
            collection_id=collection_id,
            pack_id=pack_id,
            db_client=db,
            count=count
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in demo draw: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred during the demo draw")


@router.post("/daily-free-box", response_model=dict)
async def draw_daily_free_box_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Claim and draw the daily free box for the current user.
    
    This endpoint:
    1. Checks if the user has already claimed their daily free box today (using US Central timezone)
    2. If not claimed, draws a card from the daily free box pack based on predefined probabilities
    3. Adds points equivalent to the card's worth to the user's balance
    4. Creates a claim record to prevent duplicate claims
    5. Returns success message and drawn card information
    
    Authentication: Required (Firebase token)
    
    The daily free box contains cards with these probabilities:
    - Common cards: 40% chance
    - Uncommon cards: 50% chance 
    - Rare cards: 10% chance
    
    Note: Only one claim per day is allowed per user (based on US Central timezone).
    """
    try:
        result = await draw_daily_free_box(user_id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error drawing daily free box for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while drawing the daily free box")

@router.delete("/cards/{card_id}", response_model=dict)
async def destroy_card_route(
    card_id: str = Path(...),
    quantity: int = Query(1, description="The quantity of the card to destroy (default: 1)"),
    subcollection_name: str = Query(..., description="The name of the subcollection where the card is stored"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Destroy a card in a user's collection.

    This endpoint:
    1. Takes a user ID, card ID, and subcollection name as arguments
    2. Deletes the card from the user's collection
    3. Returns a success message

    Note: For destroying multiple cards at once, use the POST /users/{user_id}/cards/destroy endpoint.
    """
    try:
        result = await destroy_card(
            user_id=user_id,
            card_id=card_id,
            subcollection_name=subcollection_name,
            db_client=db,
            quantity = quantity
        )
        return {"message": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error destroying card for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while destroying the card")

@router.delete("/batch-destroy-cards", response_model=dict)
async def destroy_multiple_cards_route(
    destroy_request: DestroyCardsRequest = Body(..., description="The cards to destroy"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Destroy multiple cards from a user's collection.

    This endpoint:
    1. Takes a user ID and a list of cards to destroy (each with card_id, quantity, and optional subcollection_name)
    2. If subcollection_name is not provided for a card, it will auto-detect the correct subcollection
    3. Destroys the specified quantity of each card from their respective subcollections
    4. Adds the point_worth of each destroyed card to the user's pointsBalance
    5. For each card, if quantity is less than the card's quantity, only destroys the specified quantity
    6. Only removes a card from the collection if the remaining quantity is 0
    7. Returns information about the destroyed cards and updated user balance
    """
    try:
        # Convert the CardToDestroy objects to dictionaries, preserving individual subcollection_name
        cards_to_destroy = [{"card_id": card.card_id, "quantity": card.quantity, "subcollection_name": card.subcollection_name} for card in destroy_request.cards]

        result = await destroy_multiple_cards(
            user_id=user_id,
            cards_to_destroy=cards_to_destroy,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error destroying multiple cards for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while destroying the cards")


@router.get("/cards/{collection_id}/{card_id}", response_model=UserCard)
async def get_user_card_route(
    collection_id: str = Path(..., description="The collection ID of the card (e.g., 'pokemon')"),
    card_id: str = Path(..., description="The ID of the card to retrieve"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get a specific card from a user's collection.

    This endpoint:
    1. Takes a user ID, collection ID, and card ID as path parameters
    2. Retrieves the card from the user's collection
    3. Returns the card details
    """
    try:
        card = await get_user_card(
            user_id=user_id,
            collection_id=collection_id,
            card_id=card_id,
            db_client=db
        )
        return card
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting card for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the card")

@router.post("/cards/{card_collection_id}/{card_id}/highlights", response_model=UserCard)
async def add_card_to_highlights_route(
    card_collection_id: str = Path(..., description="The collection ID of the card (e.g., 'pokemon')"),
    card_id: str = Path(..., description="The ID of the card to add to highlights"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Add a card to the user's highlights subcollection.

    This endpoint:
    1. Takes a user ID, card collection ID, and card ID as path parameters
    2. Finds the card in the user's collection
    3. Adds the card to the highlights subcollection
    4. Returns the card that was added to highlights
    """
    try:
        card = await add_card_to_highlights(
            user_id=user_id,
            card_collection_id=card_collection_id,
            card_id=card_id,
            db_client=db
        )
        return card
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding card to highlights for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while adding the card to highlights")

@router.delete("/highlights/{card_id}", response_model=dict)
async def delete_card_from_highlights_route(
    card_id: str = Path(..., description="The ID of the card to delete from highlights"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Delete a card from the user's highlights collection.

    This endpoint:
    1. Takes a user ID and card ID as path parameters
    2. Checks if the card exists in the user's highlights collection
    3. Deletes the card from the highlights collection
    4. Returns a success message
    """
    try:
        result = await delete_card_from_highlights(
            user_id=user_id,
            card_id=card_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting card from highlights for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while deleting the card from highlights")

@router.get("/highlights", response_model=UserCardListResponse)
async def get_user_highlights_route(
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("date_got", description="Field to sort by (default: date_got)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    search_query: Optional[str] = Query(None, description="Optional search query to filter cards by name"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all cards in the user's highlights collection with pagination.

    This endpoint:
    1. Takes a user ID as a path parameter
    2. Supports pagination with page and per_page query parameters
    3. Supports sorting with sort_by and sort_order query parameters
    4. Supports searching with search_query query parameter
    5. Returns a list of highlighted cards with pagination info
    """
    try:
        highlights_response = await get_user_highlights(
            user_id=user_id,
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        return highlights_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting highlights for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the highlights")

class TopHitsRequest(BaseModel):
    """Request model for adding a card to top hits"""
    user_id: str
    display_name: str
    card_reference: str

@router.post("/top_hits", response_model=dict)
async def add_to_top_hits_route(
    request: TopHitsRequest = Body(..., description="Request body containing user_id, display_name, and card_reference"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Add a card to the top_hits collection.

    This endpoint:
    1. Takes user_id, display_name, and card_reference in the request body
    2. Parses the card_reference to get collection_id and card_id
    3. Fetches the card details from the master collection
    4. Creates a document in the top_hits collection with the required structure
    5. Returns a success message and the document ID
    """
    try:
        result = await add_to_top_hits(
            user_id=request.user_id,
            display_name=request.display_name,
            card_reference=request.card_reference,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding card to top_hits: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while adding the card to top_hits")


@router.get("/card/{card_id}", response_model=StoredCardInfo)
async def get_card_by_id_route(
    card_id: str = Path(..., description="The ID of the card to retrieve"),
    collection_name: Optional[str] = Query(None, description="Optional collection name to fetch from"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get detailed information about a specific card by its ID.
    
    This endpoint:
    1. Takes a card ID and optional collection name
    2. Fetches the card data from Firestore
    3. Generates signed URLs for card images
    4. Returns complete card information
    
    Note: This endpoint does not require authentication as card information is public.
    """
    try:
        card_info = await get_card_by_id(
            document_id=card_id,
            collection_name=collection_name,
            db_client=db
        )
        return card_info
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving card {card_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the card")


# @router.post("/{user_id}/fusion", response_model=PerformFusionResponse)
# async def perform_fusion_route(
#     user_id: str = Path(..., description="The ID of the user performing the fusion"),
#     fusion_request: PerformFusionRequest = Body(..., description="The fusion recipe to use"),
#     db: firestore.AsyncClient = Depends(get_firestore_client)
# ):
#     """
#     Perform a fusion operation for a user.
#
#     This endpoint:
#     1. Takes a user ID and fusion recipe ID as arguments
#     2. Checks if the user has all required ingredients for the fusion
#     3. If yes, performs the fusion by removing ingredient cards and adding the result card
#     4. If no, returns an error message about missing cards
#     5. Returns a success/failure message and the resulting card if successful
#     """
#     try:
#         fusion_result = await perform_fusion(
#             user_id=user_id,
#             result_card_id=fusion_request.result_card_id,
#             db_client=db
#         )
#         return fusion_result
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error performing fusion for user: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail="An error occurred while performing the fusion")




