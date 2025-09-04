from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from google.cloud import firestore

from config.db_clients import get_firestore_client
from config.logging_utils import get_logger
from models.pack_schemas import (
    CardPack,
    PaginatedPacksResponse,
    StoredCardInfo
)
from service.packs_service import (
    get_all_packs_from_firestore,
    get_packs_collection_from_firestore,
    get_pack_by_id_from_firestore,
    get_all_cards_in_pack
)

logger = get_logger(__name__)

router = APIRouter(
    prefix="/packs",
    tags=["packs"],
)

@router.get("/packs_collection", response_model=List[CardPack])
async def list_packs_route(db: firestore.AsyncClient = Depends(get_firestore_client)):
    """Lists all available card packs from Firestore."""
    return await get_all_packs_from_firestore(db)

@router.get("/collection/{collection_id}", response_model=PaginatedPacksResponse)
async def get_packs_in_collection_route(
    collection_id: str,
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: Optional[str] = Query("popularity", description="Field to sort by (default: popularity)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    search_query: Optional[str] = Query(None, description="Optional search query to filter packs by name"),
    search_by_cards: bool = Query(False, description="Whether to search by cards in pack (default: False)"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination (ID of the last document in the previous page)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Lists packs under a specific collection in Firestore with pagination, filtering, sorting, and searching.

    Args:
        collection_id: The ID of the collection to get packs from
        page: Page number (default: 1)
        per_page: Items per page (default: 10)
        sort_by: Field to sort by (default: "popularity")
        sort_order: Sort order (asc or desc, default: desc)
        search_query: Optional search query to filter packs by name
        search_by_cards: Whether to search by cards in pack (default: False)
        cursor: Optional cursor for pagination (ID of the last document in the previous page)
        db: Firestore client dependency

    Returns:
        PaginatedPacksResponse containing:
            - packs: List of packs in the collection
            - pagination: Pagination information
            - filters: Applied filters
            - next_cursor: Cursor for the next page
    """
    result = await get_packs_collection_from_firestore(
        collection_id=collection_id,
        db_client=db,
        page=page,
        per_page=per_page,
        sort_by=sort_by,
        sort_order=sort_order,
        search_query=search_query,
        search_by_cards=search_by_cards,
        cursor=cursor
    )

    return PaginatedPacksResponse(
        packs=result["packs"],
        pagination=result["pagination"],
        filters=result["filters"],
        next_cursor=result["next_cursor"]
    )

@router.get("/{pack_id}", response_model=CardPack)
async def get_pack_details_route(
    pack_id: str, 
    collection_id: Optional[str] = None,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Gets details for a specific card pack from Firestore.

    Args:
        pack_id: The ID of the pack to retrieve
        collection_id: Optional ID of the collection containing the pack
        db: Firestore client dependency
    """
    return await get_pack_by_id_from_firestore(pack_id, db, collection_id)

@router.get("/{collection_id}/{pack_id}/cards", response_model=List[StoredCardInfo])
async def get_pack_cards_route(
    collection_id: str,
    pack_id: str,
    sort_by: str = "point_worth",
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Gets all cards in a pack, sorted by the specified field in descending order.
    Default sort is by point_worth in descending order.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to get cards from
        sort_by: Field to sort by, either "point_worth" (default) or "rarity"
        db: Firestore client dependency

    Returns:
        List of StoredCardInfo objects representing all cards in the pack, sorted by the specified field in descending order
    """
    try:
        cards = await get_all_cards_in_pack(
            collection_id=collection_id,
            pack_id=pack_id,
            db_client=db,
            sort_by=sort_by
        )
        return cards
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in get_pack_cards_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while retrieving cards from the pack.")