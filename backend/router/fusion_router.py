from fastapi import APIRouter, HTTPException, Depends, Body, Query, Path
from typing import List, Dict, Optional, Any
import json

from models.fusion_schema import (
    FusionRecipe,
    CreateFusionRecipeRequest,
    UpdateFusionRecipeRequest,
    PaginationInfo,
    AppliedFilters,
    FusionRecipePack,
    FusionRecipeCollection,
    PaginatedFusionRecipesResponse
)
from pydantic import BaseModel
from service.fusion_service import (
    create_fusion_recipe,
    get_fusion_recipe_by_id,
    get_all_fusion_recipes,
    get_fusion_packs_in_collection,
    update_fusion_recipe,
    delete_fusion_recipe
)
from config import get_firestore_client, get_logger
from google.cloud import firestore

logger = get_logger(__name__)

router = APIRouter(
    prefix="/fusion_recipes",
    tags=["fusion_recipes"],
    responses={404: {"description": "Not found"}},
)

@router.post("/", response_model=Dict[str, str], status_code=201)
async def create_fusion_recipe_route(
    recipe: CreateFusionRecipeRequest = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Creates a new fusion recipe.

    Args:
        recipe: The CreateFusionRecipeRequest containing recipe details
        db: Firestore client dependency

    Returns:
        Dict with result_card_id and success message
    """
    try:
        result_card_id = await create_fusion_recipe(recipe, db)
        return {
            "result_card_id": result_card_id,
            "message": f"Fusion recipe for '{result_card_id}' created successfully"
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in create_fusion_recipe_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while creating the fusion recipe.")

@router.get("/{pack_collection_id}/{pack_id}/cards/{result_card_id}", response_model=FusionRecipe)
async def get_fusion_recipe_route(
    pack_collection_id: str,
    pack_id: str,
    result_card_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Retrieves a fusion recipe by its pack collection ID, pack ID, and result card ID.

    Args:
        pack_collection_id: The ID of the pack collection
        pack_id: The ID of the pack
        result_card_id: The ID of the result card
        db: Firestore client dependency

    Returns:
        FusionRecipe: The requested fusion recipe
    """
    try:
        return await get_fusion_recipe_by_id(pack_id, pack_collection_id, result_card_id, db)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in get_fusion_recipe_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while retrieving the fusion recipe.")

@router.get("/", response_model=Dict[str, Any])
async def get_all_fusion_recipes_route(
    collection_id: Optional[str] = Query(None, description="The collection ID to filter fusion recipes"),
    pack: Optional[str] = Query(None, description="The pack ID to filter fusion recipes"),
    user_id: Optional[str] = Query(None, description="The user ID to calculate cards needed for recipes"),
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("result_card_id", description="Field to sort by (default: result_card_id)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    search_query: Optional[str] = Query(None, description="Optional search query (deprecated)"),
    card_name_search: Optional[str] = Query(None, description="Search by result card name"),
    pack_name_search: Optional[str] = Query(None, description="Search by pack name"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all fusion recipes with optional filtering by collection and pack.

    This endpoint:
    1. Optionally filters by collection_id and/or pack
    2. Optionally includes user_id to calculate how many cards are needed for each recipe
    3. Supports pagination with page and per_page query parameters
    4. Supports sorting with sort_by and sort_order query parameters
    5. Supports searching with card_name_search and pack_name_search parameters
    6. Returns fusion recipes organized by collection and pack with pagination info

    Args:
        collection_id: Optional. Filter recipes by collection (e.g., "pokemon")
        pack: Optional. Filter recipes by pack ID
        user_id: Optional. Include cards_needed calculations for this user
        page: Page number for pagination
        per_page: Number of items per page
        sort_by: Field to sort by
        sort_order: Sort direction (asc or desc)
        search_query: Deprecated search parameter (for backward compatibility)
        card_name_search: Search by result card name
        pack_name_search: Search by pack name
        db: Firestore client

    Returns:
        Dict containing collections with their packs and fusion recipes,
        along with pagination and filter information
    """
    try:
        fusion_recipes = await get_all_fusion_recipes(
            db_client=db,
            collection_id=collection_id,
            pack=pack,
            user_id=user_id,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query,
            card_name_search=card_name_search,
            pack_name_search=pack_name_search
        )
        return fusion_recipes
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fusion recipes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving fusion recipes")

@router.get("/collections/{collection_id}/packs", response_model=Dict[str, Any])
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

@router.put("/{pack_collection_id}/{pack_id}/cards/{result_card_id}", response_model=Dict[str, str])
async def update_fusion_recipe_route(
    pack_collection_id: str,
    pack_id: str,
    result_card_id: str,
    updates: UpdateFusionRecipeRequest = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates an existing fusion recipe.

    Args:
        pack_collection_id: The ID of the pack collection
        pack_id: The ID of the pack
        result_card_id: The ID of the result card
        updates: The UpdateFusionRecipeRequest containing fields to update
        db: Firestore client dependency

    Returns:
        Dict with success message
    """
    try:
        await update_fusion_recipe(pack_id, pack_collection_id, result_card_id, updates, db)
        return {
            "message": f"Fusion recipe for result card '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' updated successfully"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in update_fusion_recipe_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the fusion recipe.")

@router.delete("/{pack_collection_id}/{pack_id}/cards/{result_card_id}", response_model=Dict[str, str])
async def delete_fusion_recipe_route(
    pack_collection_id: str,
    pack_id: str,
    result_card_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Deletes a fusion recipe.

    Args:
        pack_collection_id: The ID of the pack collection
        pack_id: The ID of the pack
        result_card_id: The ID of the result card
        db: Firestore client dependency

    Returns:
        Dict with success message
    """
    try:
        await delete_fusion_recipe(pack_id, pack_collection_id, result_card_id, db)
        return {
            "message": f"Fusion recipe for result card '{result_card_id}' in pack '{pack_id}' and collection '{pack_collection_id}' deleted successfully"
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in delete_fusion_recipe_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while deleting the fusion recipe.")
