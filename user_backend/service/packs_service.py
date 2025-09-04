import time
from typing import Dict, List, Optional, Any
from fastapi import HTTPException
from google.cloud import firestore
from config.logging_utils import get_logger
from models.pack_schemas import CardPack, PaginationInfo, AppliedFilters, PaginatedPacksResponse, StoredCardInfo
# No need for storage utils - R2 URLs are public

logger = get_logger(__name__)

# Cache implementation
_pack_cache = {}
CACHE_TTL_SECONDS = 5 * 60  # Cache for 5 minutes


def clear_pack_cache(collection_id: str) -> None:
    """
    Clear the cache for a specific collection.
    
    Args:
        collection_id: The ID of the collection to clear from cache
    """
    if collection_id in _pack_cache:
        del _pack_cache[collection_id]
        logger.info(f"Cleared cache for collection '{collection_id}'")


async def get_cached_card_packs(collection_id: str, db_client: firestore.AsyncClient, force_refresh: bool = False) -> list[CardPack]:
    """
    Get card packs list under specific collection_id with local cache (TTL).
    If force_refresh=True, skip cache and force re-fetch from Firestore.

    Args:
        collection_id: packs subcollection ID (e.g., pokemon)
        db_client: Firestore async client
        force_refresh: Whether to force refresh cache

    Returns:
        List of CardPack instances
    """
    now = time.time()
    cache_entry = _pack_cache.get(collection_id)

    if cache_entry and not force_refresh and now - cache_entry["timestamp"] < CACHE_TTL_SECONDS:
        return cache_entry["data"]

    # Fetch data
    collection_ref = db_client.collection("packs").document(collection_id)
    collection_doc = await collection_ref.get()
    if not collection_doc.exists:
        raise ValueError(f"Collection '{collection_id}' not found.")

    packs_ref = (
        db_client.collection("packs")
        .document(collection_id)
        .collection(collection_id)
        .where("is_active", "==", True)  # Only get active packs
    )
    docs = await packs_ref.get()

    # Prefetch fusion pack IDs for this collection (assume existence implies >=1 recipe)
    try:
        fusion_packs_ref = (
            db_client.collection("fusion_recipes")
            .document(collection_id)
            .collection(collection_id)
        )
        fusion_docs = await fusion_packs_ref.get()
        fusion_pack_ids = {d.id for d in fusion_docs}
    except Exception as e:
        logger.debug(f"Could not fetch fusion packs for collection '{collection_id}': {e}")
        fusion_pack_ids = set()

    packs = []

    for doc in docs:
        data = doc.to_dict()
        pack_id = doc.id
        name = data.get("name", pack_id)

        # Sign image URL
        image_url = data.get("image_url")
        signed_image_url = None
        if image_url:
            try:
                # R2 URLs are public, no need to sign them

                signed_image_url = image_url
            except Exception as e:
                logger.warning(f"Failed to generate signed URL for pack image {image_url}: {e}")
                signed_image_url = image_url

        # Determine fusion flag based on pre-fetched fusion_pack_ids
        fusion_count = 0
        has_fusion_recipes = pack_id in fusion_pack_ids
        
        packs.append(CardPack(
            id=pack_id,
            name=name,
            image_url=signed_image_url,
            win_rate=data.get("win_rate"),
            max_win=data.get("max_win"),
            min_win=data.get("min_win"),
            popularity=data.get("popularity", 0),
            price=data.get("price"),
            created_at=data.get("created_at"),
            is_active=data.get("is_active", True),
            separation=data.get("separation", "other"),  # Default to "other" if not specified
            fusion_count=fusion_count,
            has_fusion_recipes=has_fusion_recipes
        ))

    # Update cache
    _pack_cache[collection_id] = {
        "data": packs,
        "timestamp": now
    }

    return packs


async def get_all_packs_from_firestore(db_client: firestore.AsyncClient) -> List[CardPack]:
    """
    Fetches all packs from Firestore 'packs' collection.
    Generates signed URLs for pack images if available.
    """
    logger.info("Fetching all packs from Firestore.")
    packs_list = []
    try:
        packs_stream = db_client.collection('packs').stream()
        async for doc in packs_stream:
            pack_data = doc.to_dict()
            doc_id = doc.id
            pack_data['id'] = doc_id

            pack_name = pack_data.get('name')
            if not pack_name:
                logger.warning(f"Pack document with ID '{doc_id}' is missing a name. Using default.")
                pack_name = "Unnamed Pack"

            # Generate signed URL if image URL exists
            image_url = pack_data.get('image_url')
            signed_image_url = None
            if image_url:
                try:
                    # R2 URLs are public, no need to sign them

                    signed_image_url = image_url
                except Exception as e:
                    logger.warning(f"Failed to generate signed URL for pack image {image_url}: {e}")
                    signed_image_url = image_url

            packs_list.append(CardPack(
                id=doc_id,
                name=pack_name, 
                image_url=signed_image_url,
                win_rate=pack_data.get('win_rate'),
                max_win=pack_data.get('max_win'),
                min_win=pack_data.get('min_win'),
                popularity=pack_data.get('popularity', 0),
                fusion_count=pack_data.get('fusion_count', 0),
                has_fusion_recipes=pack_data.get('has_fusion_recipes', False)
            ))
        logger.info(f"Successfully fetched {len(packs_list)} packs from Firestore.")
        return packs_list
    except Exception as e:
        logger.error(f"Error fetching all packs from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve packs from database.")


async def get_packs_collection_from_firestore(
    collection_id: str,
    db_client: firestore.AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "popularity",
    sort_order: str = "desc",
    search_query: Optional[str] = None,
    search_by_cards: bool = False,
    cursor: Optional[str] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
) -> Dict[str, Any]:
    """
    Lists packs under a specific collection in Firestore with pagination, filtering, sorting, and searching.
    """
    logger.info(f"Fetching packs from collection '{collection_id}' with filters: page={page}, per_page={per_page}, sort_by={sort_by}, sort_order={sort_order}, search_query={search_query}")
    
    try:
        # Get cached packs for this collection
        all_packs = await get_cached_card_packs(collection_id, db_client)
        
        # Apply search filter if provided
        if search_query:
            search_lower = search_query.lower()
            filtered_packs = []
            
            if search_by_cards:
                # Search by cards in pack - would need to query cards subcollection
                # For now, just search by pack name
                logger.warning("Search by cards not yet implemented, falling back to name search")
                filtered_packs = [p for p in all_packs if search_lower in p.name.lower()]
            else:
                # Search by pack name
                filtered_packs = [p for p in all_packs if search_lower in p.name.lower()]
            
            all_packs = filtered_packs
        
        # Sort packs
        reverse = (sort_order == "desc")
        if sort_by == "popularity":
            all_packs.sort(key=lambda x: x.popularity or 0, reverse=reverse)
        elif sort_by == "price":
            all_packs.sort(key=lambda x: x.price or 0, reverse=reverse)
        elif sort_by == "name":
            all_packs.sort(key=lambda x: x.name.lower(), reverse=reverse)
        elif sort_by == "created_at":
            all_packs.sort(key=lambda x: x.created_at or 0, reverse=reverse)
        elif sort_by == "win_rate":
            all_packs.sort(key=lambda x: (x.win_rate or 0), reverse=reverse)
        elif sort_by == "max_win":
            all_packs.sort(key=lambda x: (x.max_win or 0), reverse=reverse)
        elif sort_by == "min_win":
            all_packs.sort(key=lambda x: (x.min_win or 0), reverse=reverse)
        
        # Apply pagination
        total_items = len(all_packs)
        total_pages = (total_items + per_page - 1) // per_page
        start_idx = (page - 1) * per_page
        end_idx = start_idx + per_page
        
        paginated_packs = all_packs[start_idx:end_idx]
        
        # Determine next cursor (ID of last item in current page)
        next_cursor = None
        if end_idx < total_items and paginated_packs:
            next_cursor = paginated_packs[-1].id
        
        return {
            "packs": paginated_packs,
            "pagination": PaginationInfo(
                total_items=total_items,
                total_pages=total_pages,
                current_page=page,
                per_page=per_page
            ),
            "filters": AppliedFilters(
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            ),
            "next_cursor": next_cursor
        }
        
    except ValueError as e:
        logger.error(f"Collection not found: {e}")
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"Error fetching packs from collection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve packs from collection.")


async def get_pack_by_id_from_firestore(
    pack_id: str, 
    db_client: firestore.AsyncClient, 
    collection_id: Optional[str] = None
) -> CardPack:
    """
    Fetches a specific pack by ID from Firestore.
    Generates signed URL for pack image if available.
    
    Args:
        pack_id: The ID of the pack to retrieve
        db_client: Firestore client
        collection_id: Optional ID of the collection containing the pack
        
    Returns:
        CardPack: The pack data
        
    Raises:
        HTTPException: If pack not found or error occurs
    """
    logger.info(f"Fetching pack with ID '{pack_id}' from collection '{collection_id or 'all'}'")
    
    try:
        if collection_id:
            # If collection_id is provided, look in specific collection
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
        else:
            # Otherwise, we'd need to search all collections (not recommended)
            raise HTTPException(status_code=400, detail="Collection ID is required to fetch pack details")
        
        pack_doc = await pack_ref.get()
        
        if not pack_doc.exists:
            logger.warning(f"Pack with ID '{pack_id}' not found in collection '{collection_id}'")
            raise HTTPException(status_code=404, detail=f"Pack with ID '{pack_id}' not found")
        
        pack_data = pack_doc.to_dict()
        
        # Generate signed URL if image URL exists
        image_url = pack_data.get('image_url')
        signed_image_url = None
        if image_url:
            try:
                # R2 URLs are public, no need to sign them

                signed_image_url = image_url
            except Exception as e:
                logger.warning(f"Failed to generate signed URL for pack image {image_url}: {e}")
                signed_image_url = image_url
        
        return CardPack(
            id=pack_id,
            name=pack_data.get('name', 'Unnamed Pack'),
            image_url=signed_image_url,
            win_rate=pack_data.get('win_rate'),
            max_win=pack_data.get('max_win'),
            min_win=pack_data.get('min_win'),
            popularity=pack_data.get('popularity', 0),
            price=pack_data.get('price'),
            created_at=pack_data.get('created_at'),
            is_active=pack_data.get('is_active', True),
            separation=pack_data.get('separation', 'other'),  # Default to "other" if not specified
            fusion_count=pack_data.get('fusion_count', 0),
            has_fusion_recipes=pack_data.get('has_fusion_recipes', False)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pack by ID from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve pack from database.")


async def get_all_cards_in_pack(
    collection_id: str,
    pack_id: str,
    db_client: firestore.AsyncClient,
    sort_by: str = "point_worth"
) -> List[StoredCardInfo]:
    """
    Gets all cards in a pack, sorted by the specified field in descending order.
    
    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to get cards from
        db_client: Firestore client dependency
        sort_by: Field to sort by, either "point_worth" (default) or "rarity"
        
    Returns:
        List of StoredCardInfo objects representing all cards in the pack
    """
    logger.info(f"Fetching all cards from pack '{pack_id}' in collection '{collection_id}', sorted by {sort_by}")
    
    try:
        # Get the cards subcollection reference
        cards_ref = (
            db_client.collection("packs")
            .document(collection_id)
            .collection(collection_id)
            .document(pack_id)
            .collection("cards")
        )
        
        # Get all cards
        cards_docs = await cards_ref.get()
        cards = []
        
        for doc in cards_docs:
            card_data = doc.to_dict()
            card_id = doc.id
            
            # Generate signed URL for image if exists
            image_url = card_data.get("image_url")
            signed_image_url = None
            if image_url:
                try:
                    # R2 URLs are public, no need to sign them

                    signed_image_url = image_url
                except Exception as e:
                    logger.warning(f"Failed to generate signed URL for card image {image_url}: {e}")
                    signed_image_url = image_url
            
            cards.append(StoredCardInfo(
                id=card_id,
                card_name=card_data.get("card_name", ""),
                rarity=card_data.get("rarity", 0),
                point_worth=card_data.get("point_worth", 0),
                date_got_in_stock=card_data.get("date_got_in_stock", ""),
                date_got_in_stock_unix=card_data.get("date_got_in_stock_unix"),
                image_url=signed_image_url or "",
                quantity=card_data.get("quantity", 0),
                condition=card_data.get("condition", "near_mint"),
                used_in_fusion=card_data.get("used_in_fusion"),
                probability=card_data.get("probability"),
                color=card_data.get("color")
            ))
        
        # Sort cards by specified field
        if sort_by == "rarity":
            cards.sort(key=lambda x: x.rarity, reverse=True)
        else:  # Default to point_worth
            cards.sort(key=lambda x: x.point_worth, reverse=True)
        
        logger.info(f"Successfully fetched {len(cards)} cards from pack '{pack_id}'")
        return cards
        
    except Exception as e:
        logger.error(f"Error fetching cards from pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve cards from pack.")