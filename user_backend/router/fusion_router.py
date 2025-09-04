from fastapi import APIRouter, HTTPException, Depends, Path, Query, Body
from typing import Optional, Dict, Any
from google.cloud import firestore

from models.schemas import (
    PerformFusionResponse, RandomFusionRequest, CheckCardMissingRequest, 
    CheckCardMissingResponse, FusionRecipeWithUserInfo
)
from service.fusion_service import (
    get_all_fusion_recipes,
    get_fusion_packs_in_collection,
    perform_fusion,
    perform_random_fusion,
    check_card_missing,
    get_fusion_recipe_with_user_info
)
from service.card_service import get_user_fusion_eligible_cards
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id, get_optional_user_id

logger = get_logger(__name__)

router = APIRouter(
    prefix="/fusion",
    tags=["fusion"],
)


@router.get("/all-fusion-recipes", response_model=Dict[str, Any])
async def get_all_fusion_recipes_route(
    collection_id: Optional[str] = Query(None, description="The collection ID to filter fusion recipes"),
    pack: Optional[str] = Query(None, description="The pack ID to filter fusion recipes"),
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("result_card_id", description="Field to sort by (default: result_card_id)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    search_query: Optional[str] = Query(None, description="Optional search query to filter recipes by result card ID"),
    user_id_from_token: Optional[str] = Depends(get_optional_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all fusion recipes with optional filtering by collection and pack.

    This endpoint:
    1. Optionally filters by collection_id and/or pack
    2. If authenticated, automatically includes cards_needed calculations for the logged-in user
    3. Supports pagination with page and per_page query parameters
    4. Supports sorting with sort_by and sort_order query parameters
    5. Supports searching with search_query query parameter
    6. Returns fusion recipes organized by collection and pack with pagination info

    Args:
        collection_id: Optional. Filter recipes by collection (e.g., "pokemon")
        pack: Optional. Filter recipes by pack ID
        page: Page number for pagination
        per_page: Number of items per page
        sort_by: Field to sort by
        sort_order: Sort direction (asc or desc)
        search_query: Search query to filter by result card ID
        user_id_from_token: Automatically extracted from auth token if provided
        db: Firestore client

    Returns:
        Dict containing collections with their packs and fusion recipes,
        along with pagination and filter information.
        If authenticated, includes cards_needed and total_cards_needed for each recipe.
    """
    try:
        # Use the user_id from token if available
        fusion_recipes = await get_all_fusion_recipes(
            db_client=db,
            collection_id=collection_id,
            pack=pack,
            user_id=user_id_from_token,  # Use the ID from token instead of query param
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        return fusion_recipes
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fusion recipes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving fusion recipes")


@router.get("/all-fusion-recipes/collections/{collection_id}/packs", response_model=Dict[str, Any])
async def get_fusion_packs_in_collection_route(
    collection_id: str = Path(..., description="The collection ID to get packs from"),
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("pack_id", description="Sort field: pack_id, pack_name, or fusion_count (default: pack_id)"),
    sort_order: str = Query("asc", description="Sort order: asc or desc (default: asc)"),
    search_query: Optional[str] = Query(None, description="Search query to filter packs by pack name"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all packs in a collection that have fusion recipes with pagination, sorting, and search.

    This endpoint:
    1. Takes a collection_id as a path parameter
    2. Queries the fusion_recipes collection to find all packs with fusion recipes
    3. Supports pagination with page and per_page parameters
    4. Supports sorting by pack_id, pack_name, or fusion_count
    5. Supports searching packs by pack name
    6. Returns pack information including fusion count for each pack
    7. Only returns packs that actually have fusion recipes

    Args:
        collection_id: The collection ID to get packs from (e.g., "pokemon")
        page: Page number for pagination
        per_page: Number of items per page
        sort_by: Sort field (pack_id, pack_name, or fusion_count)
        sort_order: Sort direction (asc or desc)
        search_query: Search query to filter by pack name
        db: Firestore client

    Returns:
        Dict containing collection_id, paginated list of packs with their fusion counts, and pagination info
    """
    try:
        fusion_packs = await get_fusion_packs_in_collection(
            db_client=db,
            collection_id=collection_id,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        return fusion_packs
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fusion packs for collection {collection_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving fusion packs")


@router.get("/fusion_recipes/{pack_collection_id}/{pack_id}/cards/{result_card_id}", response_model=FusionRecipeWithUserInfo)
async def get_fusion_recipe_with_user_info_route(
    pack_collection_id: str = Path(..., description="The ID of the pack collection"),
    pack_id: str = Path(..., description="The ID of the pack"),
    result_card_id: str = Path(..., description="The ID of the result card (recipe ID)"),
    user_id: Optional[str] = Depends(get_optional_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get a single fusion recipe with optional user card availability information.
    
    This endpoint:
    1. Takes pack_collection_id, pack_id, and result_card_id as path parameters
    2. Optionally uses the authenticated user's ID from the token if provided
    3. Fetches the fusion recipe from the backend service
    4. If authenticated, checks the user's card inventory for each ingredient
    5. Returns the recipe with basic info and user-specific availability info if authenticated:
       - Each ingredient's user_quantity and has_enough status (if authenticated)
       - Total cards_needed and total_cards_needed counts (if authenticated)
       - can_perform_fusion boolean indicating if the user has all ingredients (if authenticated)
    
    Args:
        pack_collection_id: The ID of the pack collection
        pack_id: The ID of the pack
        result_card_id: The ID of the result card (recipe ID)
        user_id: The authenticated user's ID (from token) - optional
        db: Firestore client
        
    Returns:
        FusionRecipeWithUserInfo with complete recipe details and user card availability if authenticated
    """
    try:
        recipe = await get_fusion_recipe_with_user_info(
            pack_collection_id=pack_collection_id,
            pack_id=pack_id,
            result_card_id=result_card_id,
            user_id=user_id,
            db_client=db
        )
        return recipe
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fusion recipe with user info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the fusion recipe")


@router.post("/fusion_recipes/{result_card_id}", response_model=PerformFusionResponse)
async def perform_fusion_by_recipe_id_route(
    result_card_id: str = Path(..., description="The ID of the fusion recipe to use"),
    collection_id: Optional[str] = Query(None, description="The ID of the collection containing the fusion recipe"),
    pack_id: Optional[str] = Query(None, description="The ID of the pack containing the fusion recipe"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Perform a fusion operation for a user using a specific recipe ID in the URL path.

    This endpoint:
    1. Takes a user ID and fusion recipe ID as path parameters
    2. Optionally takes collection_id and pack_id as query parameters for direct recipe access
    3. Checks if the user has all required ingredients for the fusion
    4. If yes, performs the fusion by removing ingredient cards and adding the result card
    5. If no, returns an error message about missing cards
    6. Returns a success/failure message and the resulting card if successful

    Args:
        user_id: The ID of the user performing the fusion
        result_card_id: The ID of the fusion recipe to use
        collection_id: Optional. The ID of the collection containing the fusion recipe
        pack_id: Optional. The ID of the pack containing the fusion recipe
        db: Firestore client
    """
    try:
        fusion_result = await perform_fusion(
            user_id=user_id,
            result_card_id=result_card_id,
            db_client=db,
            collection_id=collection_id,
            pack_id=pack_id
        )
        return fusion_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error performing fusion for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while performing the fusion")


@router.post("/random-fusion", response_model=PerformFusionResponse)
async def perform_random_fusion_route(
    fusion_request: RandomFusionRequest = Body(..., description="The cards to fuse"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Perform a random fusion operation for a user.

    This endpoint:
    1. Takes a user ID and two card IDs with their collection
    2. Verifies both cards have point_worth < 3000
    3. Calculates the combined point_worth and determines the valid range (0.75-0.90)
    4. Randomly selects a card from the same collection with point_worth in that range
    5. Removes the ingredient cards from the user's collection
    6. Adds the result card to the user's collection
    7. Returns a success/failure message and the resulting card if successful
    """
    try:
        fusion_result = await perform_random_fusion(
            user_id=user_id,
            fusion_request=fusion_request,
            db_client=db
        )
        return fusion_result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error performing random fusion for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while performing the random fusion")


@router.post("/check-missing-cards", response_model=CheckCardMissingResponse)
async def check_missing_cards_route(
    request: CheckCardMissingRequest = Body(..., description="The fusion recipe IDs to check"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Check which cards are missing for a user to perform fusion with specified recipes.

    This endpoint:
    1. Takes a user ID and a list of fusion recipe IDs
    2. For each recipe, checks which ingredients the user is missing
    3. Returns detailed information about missing cards for each recipe
    4. Includes card names, images, and quantities where available

    Args:
        user_id: The ID of the user to check cards for
        request: The CheckCardMissingRequest containing fusion recipe IDs to check
        db: Firestore client

    Returns:
        CheckCardMissingResponse with details about missing cards for each recipe
    """
    try:
        result = await check_card_missing(
            user_id=user_id,
            fusion_recipe_ids=request.fusion_recipe_ids,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking missing cards for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while checking missing cards")


@router.get("/fusion-eligible-cards")
async def get_fusion_eligible_cards_route(
    user_id: str = Depends(get_current_user_id),
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("date_got", description="Field to sort by (default: date_got)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    search_query: Optional[str] = Query(None, description="Optional search query to filter cards by name"),
    subcollection_name: Optional[str] = Query(None, description="Optional subcollection name to filter by"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all cards for a user that are eligible for random fusion (point_worth < 3000).

    This endpoint:
    1. Filters the user's cards to only show those with point_worth < 3000
    2. Supports pagination with page and per_page query parameters
    3. Supports sorting with sort_by and sort_order query parameters
    4. Supports searching with search_query query parameter
    5. Optionally filters by subcollection name
    6. Returns cards organized by subcollection with pagination info

    Args:
        user_id: The ID of the user (from authentication)
        page: Page number for pagination
        per_page: Number of items per page
        sort_by: Field to sort by (date_got, card_name, point_worth, etc.)
        sort_order: Sort direction (asc or desc)
        search_query: Search query to filter by card name
        subcollection_name: Optional subcollection to filter by
        db: Firestore client

    Returns:
        UserCardsResponse containing cards eligible for fusion with pagination info
    """
    try:
        cards_response = await get_user_fusion_eligible_cards(
            user_id=user_id,
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query,
            subcollection_name=subcollection_name
        )
        return cards_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fusion eligible cards for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving fusion eligible cards")