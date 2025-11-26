from uuid import uuid4
import time
import base64
from typing import Dict, List, Optional, Any # Ensure 'Any' is imported

from fastapi import HTTPException
from google.cloud import firestore, storage # firestore.ArrayUnion and firestore.ArrayRemove are part of the firestore module

from config import get_logger
from models.pack_schema import AddPackRequest, CardPack, AddCardToPackRequest,PaginationInfo,AppliedFilters,PaginatedPacksResponse,CollectionItem
from models.schemas import StoredCardInfo
from utils.storage_utils import upload_image as upload_to_r2, parse_base64_image, get_file_extension

from google.cloud.firestore_v1 import AsyncClient, ArrayUnion, ArrayRemove, Increment

from config import settings

# DB_PACKS import is removed as we are moving to Firestore for these functions
# from service.data import DB_PACKS 

logger = get_logger(__name__)

GCS_BUCKET_NAME = settings.PACKS_BUCKET



async def create_pack_in_firestore(
    pack_data: AddPackRequest, 
    db_client: firestore.AsyncClient, 
    storage_client: storage.Client, 
    image_file: Optional[str] = None,  # Base64 encoded image string
    file_upload: Optional[Any] = None,  # Direct file upload (UploadFile object)
) -> str:
    """
    Creates a new pack in Firestore within a collection structure.
    First creates a document for the collection_id under the 'packs' collection if it doesn't exist.
    Then creates the pack document in a subcollection named after the collection_id.
    Optionally uploads an image for the pack to Google Cloud Storage.
    Stores the GCS URI (gs://...) of the image in Firestore.

    Args:
        pack_data: The AddPackRequest model containing pack details and collection_id
        db_client: Firestore client
        storage_client: GCS client for image upload
        image_file: Optional base64 encoded image string for the pack (format: "data:image/jpeg;base64,...")
        file_upload: Optional direct file upload (UploadFile object)

    Returns:
        str: The ID of the created pack

    Raises:
        HTTPException: If there's an error creating the pack
    """
    if not db_client:
        logger.error("Firestore client not provided to create_pack_in_firestore.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")
    if not storage_client and (image_file or file_upload): 
        logger.error("Storage client not provided to create_pack_in_firestore, but an image was supplied.")
        raise HTTPException(status_code=500, detail="Cloud Storage service not configured (client missing for image upload).")

    pack_name = pack_data.pack_name
    collection_id = pack_data.collection_id
    price = pack_data.price
    win_rate = pack_data.win_rate
    max_win = pack_data.max_win
    min_win = pack_data.min_win
    is_active = pack_data.is_active
    popularity = pack_data.popularity
    separation = pack_data.separation
    pack_type = pack_data.type if pack_data.type else "US"

    if not pack_name:
        raise HTTPException(status_code=400, detail="Pack name cannot be empty.")
    if '/' in pack_name:
        raise HTTPException(status_code=400, detail="Pack name cannot contain '/' characters.")
    if not collection_id:
        raise HTTPException(status_code=400, detail="Collection ID cannot be empty.")
    if '/' in collection_id:
        raise HTTPException(status_code=400, detail="Collection ID cannot contain '/' characters.")

    # Generate a unique ID for the pack using UUID (similar to card creation)
    # This avoids issues with special characters and non-ASCII characters in pack names
    pack_id = str(uuid4())
    logger.info(f"Generated unique pack ID '{pack_id}' for pack '{pack_name}'")

    image_gcs_uri_for_firestore = None
    if image_file or file_upload:
        if not storage_client: 
            logger.error("Storage client is None inside image processing block.")
            raise HTTPException(status_code=500, detail="Storage client error during image processing.")
        try:
            # Handle base64 format
            if image_file:
                # Parse the base64 image string
                content_type, image_data = parse_base64_image(image_file)

                # Get the file extension from the content type
                file_extension = get_file_extension(content_type)
            
            # Handle file upload format
            elif file_upload:
                # Read the uploaded file
                import asyncio
                if asyncio.iscoroutinefunction(file_upload.read):
                    image_data = await file_upload.read()
                else:
                    image_data = file_upload.read()
                
                content_type = getattr(file_upload, 'content_type', 'image/jpeg')
                
                # Get file extension from filename or content type
                filename = getattr(file_upload, 'filename', None)
                if filename and '.' in filename:
                    file_extension = filename.split('.')[-1].lower()
                else:
                    file_extension = get_file_extension(content_type)

            # Include collection_id in the blob path
            unique_blob_name = f"packs/{collection_id}/{pack_id}.{file_extension}"

            # Upload to R2
            image_url = await upload_to_r2(
                image_data=image_data,
                object_key=unique_blob_name,
                bucket_type='pack',
                content_type=content_type
            )
            
            image_gcs_uri_for_firestore = image_url
            logger.info(f"Pack image uploaded to R2. URL: {image_gcs_uri_for_firestore}")
        except ValueError as ve:
            logger.error(f"Invalid base64 image format: {ve}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Invalid base64 image format: {str(ve)}")
        except Exception as e:
            logger.error(f"Error uploading pack image to GCS: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Could not upload pack image: {str(e)}")

    try:
        # First, check if the collection document exists
        collection_doc_ref = db_client.collection('packs').document(collection_id)
        collection_doc = await collection_doc_ref.get()

        # If collection document doesn't exist, create it
        if not collection_doc.exists:
            logger.info(f"Creating new collection document '{collection_id}'")
            await collection_doc_ref.set({
                'name': collection_id,
                'created_at': firestore.SERVER_TIMESTAMP
            })

        # Now create the pack in the subcollection
        subcollection_ref = collection_doc_ref.collection(collection_id)
        pack_doc_ref = subcollection_ref.document(pack_id)

        # No need to check if pack with this ID already exists since we're using UUID
        # UUID guarantees uniqueness

        # Create pack document data
        pack_doc_data = {
            "name": pack_name,
            "id": pack_id,
            "created_at": firestore.SERVER_TIMESTAMP,
            "price": price,
            "win_rate": win_rate,
            "max_win": max_win,
            "min_win": min_win,
            "is_active": is_active,
            "popularity": popularity,
            "separation": separation,
            "type": pack_type,
        }
        if image_gcs_uri_for_firestore:
            pack_doc_data["image_url"] = image_gcs_uri_for_firestore

        # Set the pack document
        await pack_doc_ref.set(pack_doc_data)
        logger.info(f"Created pack document '{pack_name}' (ID: {pack_id}) in collection '{collection_id}'. Image URI: {image_gcs_uri_for_firestore or 'None'}")

        # Create empty rarities subcollection
        # Rarities will be populated when cards are added to the pack

        # Clear cache for this collection to ensure the new pack appears immediately
        clear_pack_cache(collection_id)

        return pack_id
    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error creating pack in Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error creating pack in Firestore: {str(e)}")

async def get_all_packs_from_firestore(db_client: firestore.AsyncClient) -> List[CollectionItem]:
    """
    Fetches all collections from the metadata collection.
    Works exactly like get_all_collection_metadata - uses same collection and document ID as name.
    """
    logger.info("Fetching all collections from metadata collection.")
    collections_list = []
    try:
        # Use the same collection as get_all_collection_metadata
        meta_collection_name = settings.meta_data_collection
        collections_stream = db_client.collection(meta_collection_name).stream()
        
        async for doc in collections_stream:
            doc_id = doc.id
            
            # Use document ID as name (exactly like get_all_collection_metadata)
            collections_list.append(CollectionItem(
                id=doc_id,
                name=doc_id  # Document ID is the name
            ))
        logger.info(f"Successfully fetched {len(collections_list)} collections from metadata collection.")
        return collections_list
    except Exception as e:
        logger.error(f"Error fetching collections from metadata collection: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve collections from database.")

_pack_cache = {}
CACHE_TTL_SECONDS = 5 * 60  # 缓存 5 分钟


def clear_pack_cache(collection_id: str) -> None:
    """
    Clear the cache for a specific collection.
    
    Args:
        collection_id: The ID of the collection to clear from cache
    """
    # Clear both active and all caches for the collection
    cache_keys_to_clear = [
        f"{collection_id}_active",
        f"{collection_id}_all",
        collection_id  # For backward compatibility
    ]
    
    for cache_key in cache_keys_to_clear:
        if cache_key in _pack_cache:
            del _pack_cache[cache_key]
            logger.info(f"Cleared cache for key '{cache_key}'")


async def get_cached_card_packs(collection_id: str, db_client: firestore.AsyncClient, force_refresh: bool = False, active_only: bool = True) -> list[CardPack]:
    """
    获取指定 collection_id 下的卡包列表，带本地缓存（TTL）。
    若 force_refresh=True，则跳过缓存并强制重新拉取 Firestore 数据。

    Args:
        collection_id: packs 子集合 ID（如 pokemon）
        db_client: Firestore 异步客户端
        force_refresh: 是否强制刷新缓存
        active_only: 是否只获取激活的卡包 (默认为 True 保持向后兼容)

    Returns:
        卡包列表（CardPack 实例）
    """
    now = time.time()
    cache_key = f"{collection_id}_{'active' if active_only else 'all'}"
    cache_entry = _pack_cache.get(cache_key)

    if cache_entry and not force_refresh and now - cache_entry["timestamp"] < CACHE_TTL_SECONDS:
        return cache_entry["data"]

    # 拉取数据
    collection_ref = db_client.collection("packs").document(collection_id)
    collection_doc = await collection_ref.get()
    if not collection_doc.exists:
        raise ValueError(f"Collection '{collection_id}' not found.")

    # 根据 active_only 参数决定是否过滤
    packs_ref = (
        db_client.collection("packs")
        .document(collection_id)
        .collection(collection_id)
    )
    
    if active_only:
        packs_ref = packs_ref.where("is_active", "==", True)
    
    docs = await packs_ref.get()
    packs = []

    for doc in docs:
        data = doc.to_dict()
        pack_id = doc.id
        name = data.get("name", pack_id)



        # 签名图片 URL
        image_url = data.get("image_url")
        signed_image_url = None
        # R2 URLs are public, no need to sign them
        signed_image_url = image_url if image_url else None

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
            type=data.get("type", "US")  # Default to "US" if not specified
        ))

    # 更新缓存
    _pack_cache[cache_key] = {
        "timestamp": now,
        "data": packs
    }

    return packs


async def get_packs_collection_from_firestore(
    collection_id: str,
    db_client: firestore.AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: Optional[str] = "popularity",
    sort_order: str = "desc",
    search_query: Optional[str] = None,
    search_by_cards: bool = False,
    cursor: Optional[str] = None,  # 保留参数但不使用（in-memory 不需要 cursor）
    min_price: Optional[float] = None,
    max_price: Optional[float] = None
) -> Dict[str, Any]:
    logger.info(f"[In-Memory] Fetching all packs from '{collection_id}'.")

    valid_sort_fields = ["name", "popularity", "win_rate", "max_win", "min_win"]
    if sort_by not in valid_sort_fields:
        sort_by = "popularity"

    reverse = sort_order.lower() == "desc"

    try:
        all_packs = await get_cached_card_packs(collection_id, db_client, force_refresh=False)

        # Search filtering
        if search_query:
            filtered = []
            for pack in all_packs:
                if search_by_cards:
                    card_names = pack.cards.keys() if hasattr(pack, "cards") else []
                    if any(search_query.lower() in card.lower() for card in card_names):
                        filtered.append(pack)
                else:
                    if search_query.lower() in pack.name.lower():
                        filtered.append(pack)
            all_packs = filtered

        # Price range filtering
        if min_price is not None:
            all_packs = [pack for pack in all_packs if pack.price is not None and pack.price >= min_price]
        if max_price is not None:
            all_packs = [pack for pack in all_packs if pack.price is not None and pack.price <= max_price]

        # Sort in memory
        all_packs.sort(key=lambda p: getattr(p, sort_by, 0) or 0, reverse=reverse)

        # Paginate
        total_items = len(all_packs)
        total_pages = (total_items + per_page - 1) // per_page
        start = (page - 1) * per_page
        end = start + per_page
        paginated_packs = all_packs[start:end]
        next_cursor = paginated_packs[-1].id if len(paginated_packs) == per_page else None

        pagination_info = PaginationInfo(
            total_items=total_items,
            total_pages=total_pages,
            current_page=page,
            per_page=per_page
        )

        filters_info = AppliedFilters(
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )

        logger.info(f"[In-Memory] Returned {len(paginated_packs)} packs (page {page}).")

        return {
            "packs": paginated_packs,
            "pagination": pagination_info,
            "filters": filters_info,
            "next_cursor": next_cursor
        }

    except Exception as e:
        logger.error(f"Failed to fetch packs (in-memory): {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error while retrieving packs.")


async def get_pack_by_id_from_firestore(
    pack_id: str, 
    db_client: firestore.AsyncClient, 
    collection_id: Optional[str] = None
) -> CardPack:
    """
    Fetches a specific pack by its ID from Firestore.
    If collection_id is provided, looks in that specific collection.
    Otherwise, searches across all collections.
    Generates a signed URL for the pack image if available.
    Includes rarity configurations from the 'rarities' subcollection.

    Args:
        pack_id: The ID of the pack to retrieve
        db_client: Firestore client
        collection_id: Optional ID of the collection containing the pack

    Returns:
        CardPack: The requested pack with all its details

    Raises:
        HTTPException: If pack not found or on database error
    """
    logger.info(f"Fetching pack by ID '{pack_id}'{f' in collection {collection_id}' if collection_id else ''} from Firestore.")

    try:
        # If collection_id is provided, directly get the pack from that collection
        if collection_id:
            doc_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
            # Just log the basic info without accessing potentially non-existent properties
            logger.info(f"Fetching pack '{pack_id}' from collection '{collection_id}'")
            doc_snapshot = await doc_ref.get()

            if not doc_snapshot.exists:
                logger.warning(f"Pack with ID '{pack_id}' not found in collection '{collection_id}'.")
                raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

            # Get pack data and process it
            return await _process_pack_document(doc_snapshot, db_client, collection_id)

        else:
            # If no collection_id provided, need to search across all collections
            logger.info(f"No collection ID provided, searching for pack '{pack_id}' across all collections.")
            collections_ref = db_client.collection('packs')
            collections_docs = await collections_ref.list_documents()

            for collection_doc in collections_docs:
                try:
                    curr_collection_id = collection_doc.id
                    doc_ref = collection_doc.collection(curr_collection_id).document(pack_id)
                    doc_snapshot = await doc_ref.get()

                    if doc_snapshot.exists:
                        logger.info(f"Found pack '{pack_id}' in collection '{curr_collection_id}'.")
                        return await _process_pack_document(doc_snapshot, db_client, curr_collection_id)

                except Exception as e:
                    logger.error(f"Error checking collection '{collection_doc.id}' for pack '{pack_id}': {e}", exc_info=True)
                    continue

            # If we get here, the pack wasn't found in any collection
            logger.warning(f"Pack with ID '{pack_id}' not found in any collection.")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in any collection")

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error fetching pack '{pack_id}' from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve pack '{pack_id}' from database.")

async def _process_pack_document(doc_snapshot, db_client, collection_id):
    """
    Helper function to process a pack document and create a CardPack object.
    """
    try:
        pack_data = doc_snapshot.to_dict()
        doc_id = doc_snapshot.id
        pack_data['id'] = doc_id
        pack_data['collection_id'] = collection_id

        pack_name = pack_data.get('name')
        if not pack_name:
            logger.warning(f"Pack document with ID '{doc_id}' is missing a name. Using default.")
            pack_name = "Unnamed Pack"

        # Generate signed URL if image URL exists
        image_url = pack_data.get('image_url')
        signed_image_url = None
        # R2 URLs are public, no need to sign them
        signed_image_url = image_url if image_url else None

        # Fetch rarities subcollection
        rarity_configurations = {}
        rarities_col_ref = doc_snapshot.reference.collection('rarities')
        async for rarity_doc in rarities_col_ref.stream():
            rarity_configurations[rarity_doc.id] = rarity_doc.to_dict()

        logger.info(f"Fetched {len(rarity_configurations)} rarities for pack '{doc_id}' in collection '{collection_id}'.")

        return CardPack(
            id=doc_id,
            name=pack_name,
            image_url=signed_image_url, # Use signed URL
            description=pack_data.get('description'),
            rarity_probabilities=pack_data.get('rarity_probabilities'),
            cards_by_rarity=pack_data.get('cards_by_rarity'),
            win_rate=pack_data.get('win_rate'),
            max_win=pack_data.get('max_win'),
            min_win=pack_data.get('min_win'),
            popularity=pack_data.get('popularity', 0),
            price=pack_data.get('price'),
            created_at=pack_data.get('created_at'),
            is_active=pack_data.get('is_active'),
            separation=pack_data.get('separation', 'other'),  # Default to "other" if not specified
            type=pack_data.get('type', 'US'),  # Default to "US" if not specified
            rarity_configurations=rarity_configurations # Add fetched rarities
        )
    except Exception as e:
        logger.error(f"Error processing pack document: {e}", exc_info=True)
        raise

async def add_card_to_pack_rarity(
    pack_id: str,
    rarity_id: str,
    card_id: str,
    card_data: AddCardToPackRequest,
    db_client: AsyncClient
) -> bool:
    """
    Adds a card to a specific rarity in a pack.
    The card is stored as a document under /packs/{packId}/rarities/{rarityId}/cards/{cardId}
    with fields:
    - globalRef: DocumentReference pointing to the global card
    - name: Card name
    - quantity: Card quantity (updated after each draw)
    - point: Card point value (updated after each draw)
    - image_url: URL to the card image
    - condition: Card condition (e.g., "mint", "near mint", etc.)
    """
    try:
        # Check if pack exists
        pack_ref = db_client.collection('packs').document(pack_id)
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Check if rarity exists
        rarity_ref = pack_ref.collection('rarities').document(rarity_id)
        rarity_snap = await rarity_ref.get()
        if not rarity_snap.exists:
            raise HTTPException(status_code=404, detail=f"Rarity '{rarity_id}' not found in pack '{pack_id}'")

        # Create global card reference
        global_card_ref = db_client.collection('GlobalCards').document(card_id)

        # Prepare card data
        card_doc_data = {
            "globalRef": global_card_ref,
            "name": card_data.name,
            "quantity": card_data.quantity,
            "point": card_data.point,
            "image_url": card_data.image_url,
            "condition": getattr(card_data, "condition", "new")  # Default to "mint" if not provided
        }

        # Add card to the rarity
        card_ref = rarity_ref.collection('cards').document(card_id)
        await card_ref.set(card_doc_data)

        # Optionally, update card list in rarity document if needed
        # This would depend on your specific requirements
        # We're not doing this here as cards are now stored in a subcollection

        logger.info(f"Successfully added card '{card_id}' to rarity '{rarity_id}' in pack '{pack_id}'")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding card to pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add card to pack: {str(e)}")

async def add_card_from_storage_to_pack(
    pack_id: str,
    rarity_id: str,
    card_id: str, 
    card_collection: str,
    db_client: AsyncClient
) -> bool:
    """
    Adds a card from the storage service to a specific rarity in a pack.
    Fetches card details from storage_service and creates a document in 
    /packs/{packId}/rarities/{rarityId}/cards/{cardId} with fields:
    - globalRef: DocumentReference to the global card
    - name, quantity, point, image_url: copied from the storage card
    - condition: Card condition (e.g., "mint", "near mint", etc.)
    """
    from service.storage_service import get_card_by_id

    try:
        # Check if pack exists
        pack_ref = db_client.collection('packs').document(pack_id)
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Check if rarity exists
        rarity_ref = pack_ref.collection('rarities').document(rarity_id)
        rarity_snap = await rarity_ref.get()
        if not rarity_snap.exists:
            raise HTTPException(status_code=404, detail=f"Rarity '{rarity_id}' not found in pack '{pack_id}'")

        # Fetch card data from storage service
        try:
            card_data = await get_card_by_id(card_id, collection_name=card_collection)
        except HTTPException as e:
            logger.error(f"Failed to fetch card '{card_id}' from collection '{card_collection}': {str(e)}")
            raise HTTPException(
                status_code=e.status_code, 
                detail=f"Failed to fetch card details: {e.detail}"
            )

            # Log the card collection for debugging
            logger.info(f"Fetching card from collection '{card_collection}' for pack '{pack_id}'")

        # Create global card reference
        global_card_ref = db_client.collection('GlobalCards').document(card_id)

        # Prepare card data
        card_doc_data = {
            "globalRef": global_card_ref,
            "name": card_data.card_name,
            "quantity": card_data.quantity,
            "point": card_data.point_worth,
            "image_url": card_data.image_url,
            "condition": getattr(card_data, "condition", "new")  # Default to "mint" if not provided
        }

        # Add card to the rarity
        card_ref = rarity_ref.collection('cards').document(card_id)
        await card_ref.set(card_doc_data)

        logger.info(f"Successfully added card '{card_id}' to rarity '{rarity_id}' in pack '{pack_id}'")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding card to pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add card to pack: {str(e)}")

async def add_card_direct_to_pack(
    collection_metadata_id: str,
    document_id: str,
    pack_id: str,
    probability: float,
    db_client: AsyncClient,
    color: str = "white"
) -> bool:
    """
    Adds a card directly to a pack with its own probability.
    Fetches card details from storage_service using the provided document_id and collection_metadata_id.
    The card's condition is taken from the card data in storage.

    Args:
        collection_metadata_id: The ID of the collection metadata to use for fetching card
        document_id: The ID of the card to add
        pack_id: The ID of the pack to add the card to (can include collection_id, formatted as 'collection_id/pack_id')
        probability: The probability value for the card as a percentage (0 to 100)
        db_client: Firestore client
        color: The color of the card (default: "white")

    Returns:
        bool: True if successfully added

    Raises:
        HTTPException: If pack doesn't exist, or if card fetch fails, or other errors
    """
    if probability < 0 or probability > 100:
        raise HTTPException(status_code=400, detail="Probability must be between 0 and 100 (representing 0% to 100%)")
    from service.storage_service import get_card_by_id

    try:
        # Parse the pack_id which may include collection_id (format: 'collection_id/pack_id')
        parts = pack_id.split('/')

        if len(parts) == 2:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Fetch card information from storage_service
        try:
            card_info = await get_card_by_id(document_id, collection_name=collection_metadata_id)
        except HTTPException as e:
            logger.error(f"Failed to fetch card '{document_id}' from collection '{collection_metadata_id}': {str(e)}")
            raise HTTPException(
                status_code=e.status_code, 
                detail=f"Failed to fetch card details: {e.detail}"
            )

        # Create global card reference using the actual collection path from collection_metadata_id
        # The actual path comes from the collection metadata's firestoreCollection
        from service.storage_service import get_collection_metadata

        try:
            metadata = await get_collection_metadata(collection_metadata_id)
            global_card_collection = metadata.firestoreCollection
            logger.info(f"Using metadata firestoreCollection path: '{global_card_collection}'")
        except HTTPException as e:
            # Default to collection_metadata_id if metadata not found
            global_card_collection = collection_metadata_id
            logger.warning(f"Metadata for '{collection_metadata_id}' not found, using it directly: '{global_card_collection}'")

        global_card_ref = db_client.collection(global_card_collection).document(document_id)

        # Prepare card data with probability
        card_doc_data = {
            "card_reference": global_card_ref,
            "card_name": card_info.card_name,
            "quantity": card_info.quantity,
            "point_worth": card_info.point_worth,
            "rarity": card_info.rarity,
            "probability": probability,
            "condition": getattr(card_info, "condition", "new"),  # Default to "mint" if not provided
            "color": color
        }

        # Add image_url if available
        if hasattr(card_info, 'image_url') and card_info.image_url:
            card_doc_data["image_url"] = card_info.image_url

        # Add card directly to the cards subcollection under the pack
        card_ref = pack_ref.collection('cards').document(document_id)
        await card_ref.set(card_doc_data)

        # Update the pack document to include this card in its cards map if needed
        # This is optional and depends on whether you want to maintain a map of cards in the pack document
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})

        # Add the card ID to the map with its probability
        # Convert probability from percentage to decimal (e.g., 50 -> 0.5) for storage
        # Round to 4 decimal places to avoid floating-point precision issues
        cards_map[document_id] = round(probability / 100, 4)
        await pack_ref.set({
            'cards': cards_map
        }, merge=True)

        logger.info(f"Successfully added card '{document_id}' directly to pack '{pack_id}' with probability {probability}")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding card to pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add card to pack: {str(e)}")


async def batch_add_cards_direct_to_pack(
    cards_data: List[dict],
    pack_id: str,
    db_client: AsyncClient
) -> List[dict]:
    """
    Adds multiple cards directly to a pack with their own probabilities in a batch operation.
    The card's condition is taken from the card data in storage.

    Args:
        cards_data: List of dictionaries containing card information:
            - collection_metadata_id: The ID of the collection metadata to use for fetching card
            - document_id: The ID of the card to add
            - probability: The probability value for the card (0.0 to 1.0)
            - color: The color of the card (default: "white")
        pack_id: The ID of the pack to add the cards to (can include collection_id, formatted as 'collection_id/pack_id')
        db_client: Firestore client

    Returns:
        List of dictionaries containing the result for each card:
            - document_id: The ID of the card that was processed
            - success: Whether the card was successfully added
            - error_message: Error message if the card failed to be added (None if successful)
    """
    results = []

    # Check if pack exists first (fail fast if pack doesn't exist)
    try:
        # Parse the pack_id which may include collection_id (format: 'collection_id/pack_id')
        parts = pack_id.split('/')

        if len(parts) == 2:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            error_msg = f"Pack with ID '{pack_id}' does not exist"
            logger.error(error_msg)
            # Return failure for all cards if pack doesn't exist
            return [
                {
                    "document_id": card_data["document_id"],
                    "success": False,
                    "error_message": error_msg
                }
                for card_data in cards_data
            ]
    except Exception as e:
        error_msg = f"Failed to check pack existence: {str(e)}"
        logger.error(error_msg, exc_info=True)
        # Return failure for all cards if we can't check pack existence
        return [
            {
                "document_id": card_data["document_id"],
                "success": False,
                "error_message": error_msg
            }
            for card_data in cards_data
        ]

    # Process each card individually
    for card_data in cards_data:
        try:
            success = await add_card_direct_to_pack(
                collection_metadata_id=card_data["collection_metadata_id"],
                document_id=card_data["document_id"],
                pack_id=pack_id,
                probability=card_data["probability"],
                db_client=db_client,
                color=card_data.get("color", "white")
            )

            results.append({
                "document_id": card_data["document_id"],
                "success": True,
                "error_message": None
            })

        except Exception as e:
            error_msg = f"Error adding card '{card_data['document_id']}': {str(e)}"
            logger.error(error_msg, exc_info=True)
            results.append({
                "document_id": card_data["document_id"],
                "success": False,
                "error_message": error_msg
            })

    return results


async def delete_card_from_pack(
    collection_metadata_id: str,
    document_id: str,
    pack_id: str,
    db_client: AsyncClient
) -> bool:
    """
    Deletes a card directly from a pack.

    Args:
        collection_metadata_id: The ID of the collection metadata for identifying the card
        document_id: The ID of the card to delete
        pack_id: The ID of the pack containing the card (can include collection_id, formatted as 'collection_id/pack_id')
        db_client: Firestore client

    Returns:
        bool: True if successfully deleted

    Raises:
        HTTPException: If pack doesn't exist, or if card doesn't exist, or other errors
    """
    try:
        # Parse the pack_id which may include collection_id (format: 'collection_id/pack_id')
        parts = pack_id.split('/')

        if len(parts) == 2:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Check if card exists in the pack
        card_ref = pack_ref.collection('cards').document(document_id)
        card_snap = await card_ref.get()
        if not card_snap.exists:
            logger.error(f"Card '{document_id}' not found in pack '{pack_id}'")
            raise HTTPException(status_code=404, detail=f"Card '{document_id}' not found in pack '{pack_id}'")

        # Log before any operations
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})
        
        logger.info(f"BEFORE DELETION - Current cards map: {cards_map}")
        logger.info(f"BEFORE DELETION - Attempting to delete card with document_id: '{document_id}'")
        logger.info(f"BEFORE DELETION - Card exists in map: {document_id in cards_map}")
        
        # Delete the card from the cards subcollection
        await card_ref.delete()
        logger.info(f"DELETED card from subcollection: '{document_id}'")

        # Now update the pack document to remove this card from its cards map
        
        # Remove the card ID from the map if it's there
        if document_id in cards_map:
            del cards_map[document_id]
            # Update the entire cards map
            await pack_ref.update({
                'cards': cards_map
            })
            logger.info(f"Successfully removed card '{document_id}' from cards map")
        else:
            # Try using DELETE_FIELD as fallback
            try:
                from google.cloud.firestore_v1 import DELETE_FIELD
                await pack_ref.update({
                    f'cards.{document_id}': DELETE_FIELD
                })
                logger.info(f"Used DELETE_FIELD to remove card '{document_id}' from cards map")
            except Exception as e:
                logger.warning(f"DELETE_FIELD approach failed: {e}")
                logger.warning(f"Card '{document_id}' was not found in cards map: {list(cards_map.keys())}")
                
        # Verify the card was removed by reading the document again
        updated_pack_snap = await pack_ref.get()
        updated_pack_data = updated_pack_snap.to_dict()
        updated_cards_map = updated_pack_data.get('cards', {})
        
        if document_id in updated_cards_map:
            logger.error(f"Card '{document_id}' still exists in cards map after deletion attempt")
        else:
            logger.info(f"Confirmed: Card '{document_id}' successfully removed from cards map")

        # Clear cache for this collection to ensure fresh data
        parts = pack_id.split('/')
        if len(parts) > 1:
            collection_id = parts[0]
            clear_pack_cache(collection_id)
            logger.info(f"Cleared cache for collection '{collection_id}'")
            
        logger.info(f"Successfully deleted card '{document_id}' from pack '{pack_id}'")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting card from pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete card from pack: {str(e)}")

async def update_pack_name(
    collection_id: str,
    pack_id: str,
    new_name: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Updates the name of a pack in Firestore and also updates it in fusion_recipes collection.

    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to update
        new_name: The new name for the pack
        db_client: Firestore client

    Returns:
        Dict containing success message and updated pack information

    Raises:
        HTTPException: If the pack doesn't exist or there's an error updating it
    """
    try:
        # Validate new name
        if not new_name:
            raise HTTPException(status_code=400, detail="Pack name cannot be empty.")
        if '/' in new_name:
            raise HTTPException(status_code=400, detail="Pack name cannot contain '/' characters.")

        # Construct the reference to the pack document
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {collection_id}/{pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Update both the canonical name field and legacy pack_name for compatibility
        await pack_ref.update({
            "name": new_name,
            "pack_name": new_name
        })

        # Also update the pack name in fusion_recipes collection if it exists
        try:
            fusion_pack_ref = db_client.collection('fusion_recipes').document(collection_id).collection(collection_id).document(pack_id)
            fusion_pack_snap = await fusion_pack_ref.get()
            
            if fusion_pack_snap.exists:
                # Update the pack_name in fusion_recipes collection
                await fusion_pack_ref.update({
                    "pack_name": new_name,
                    "last_updated": firestore.SERVER_TIMESTAMP
                })
                logger.info(f"Also updated pack_name in fusion_recipes collection for pack '{pack_id}'")
        except Exception as e:
            # Log but don't fail if fusion pack doesn't exist or can't be updated
            logger.info(f"Pack '{pack_id}' not found in fusion_recipes or error updating: {e}")

        # Clear cache for this collection
        clear_pack_cache(collection_id)

        logger.info(f"Successfully updated name to '{new_name}' for pack '{pack_id}' in collection '{collection_id}'")
        
        return {
            "message": f"Successfully updated name to '{new_name}' for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "name": new_name
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating pack name: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update pack name: {str(e)}")

async def update_pack_in_firestore(
    pack_id: str, 
    updates: Dict[str, Any],
    db_client: AsyncClient
) -> bool:
    try:
        # Check if pack_id contains a slash (indicating collection_id/pack_id format)
        parts = pack_id.split('/', 1)
        if len(parts) > 1:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")
    except Exception as e:
        logger.error(f"Error accessing pack '{pack_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error accessing pack: {str(e)}")

    batch = db_client.batch()

    # Handle updates to top-level pack document fields (e.g., name, description, popularity, max_win)
    pack_level_updates = {}
    if "name" in updates: # Client might send None if they want to clear a field (if allowed)
        # Firestore behavior with None: can store as null or might be an issue depending on rules/schema.
        # Assuming for now that if 'name' key is present, we try to update it.
        # If None means "delete field", specific logic would be needed.
        # The router currently only adds to updates_dict_for_service if not None.
        pack_level_updates["name"] = updates["name"]
    if "description" in updates:
        pack_level_updates["description"] = updates["description"]
    if "popularity" in updates:
        pack_level_updates["popularity"] = updates["popularity"]
    if "max_win" in updates:
        pack_level_updates["max_win"] = updates["max_win"]
    if "min_win" in updates:
        pack_level_updates["min_win"] = updates["min_win"]
    if "price" in updates:
        pack_level_updates["price"] = updates["price"]
    if "win_rate" in updates:
        pack_level_updates["win_rate"] = updates["win_rate"]
    if "image_url" in updates:
        pack_level_updates["image_url"] = updates["image_url"]
    if "separation" in updates:
        pack_level_updates["separation"] = updates["separation"]

    if pack_level_updates: # If there are any top-level fields to update
        # Log the update info
        logger.info(f"Updating pack '{pack_id}' with fields: {list(pack_level_updates.keys())}")
        
        batch.update(pack_ref, pack_level_updates)
        logger.info(f"Scheduled top-level updates for pack '{pack_id}': {pack_level_updates}")

    rarities_ref = pack_ref.collection('rarities')
    card_list_field = "cards"  # Or "cardIds", ensure this matches your Firestore field name

    # 1️⃣ Update (set/overwrite) fields in rarity documents
    # The 'updates["rarities"]' is expected to be Dict[rarity_level_str, Dict_of_fields_to_set]
    # where Dict_of_fields_to_set comes from RarityDetail.data
    for level, data_to_set in updates.get("rarities", {}).items():
        if not isinstance(level, str) or not isinstance(data_to_set, dict) or not data_to_set:
            logger.warning(f"Skipping rarity update for level '{level}' due to invalid data structure or empty data.")
            continue
        rar_doc_ref = rarities_ref.document(level)
        # merge=True ensures this is an upsert, creating the rarity if it doesn't exist
        # or updating existing fields and adding new ones from data_to_set.
        batch.set(rar_doc_ref, data_to_set, merge=True) 
        logger.info(f"Scheduled set/overwrite for rarity '{level}' in pack '{pack_id}' with data: {data_to_set}")

    # 2️⃣ Add cards to a rarity's card list (atomic array union)
    for level, cards_to_add_list in updates.get("cards_to_add", {}).items():
        if not isinstance(cards_to_add_list, list) or not cards_to_add_list:
            continue
        rar_doc_ref = rarities_ref.document(level)
        batch.update(rar_doc_ref, {
            card_list_field: ArrayUnion(cards_to_add_list),
            # Synchronize cardCount if this field exists in your rarity document
            'cardCount': Increment(len(cards_to_add_list))
        })
        logger.info(f"Scheduled to add {len(cards_to_add_list)} cards to rarity '{level}' in pack '{pack_id}'.")

    # 3️⃣ Delete cards from a rarity's card list (atomic array remove)
    for level, cards_to_delete_list in updates.get("cards_to_delete", {}).items():
        if not isinstance(cards_to_delete_list, list) or not cards_to_delete_list:
            continue
        rar_doc_ref = rarities_ref.document(level)
        batch.update(rar_doc_ref, {
            card_list_field: ArrayRemove(cards_to_delete_list),
            # Synchronize cardCount if this field exists
            'cardCount': Increment(-len(cards_to_delete_list))
        })
        logger.info(f"Scheduled to delete {len(cards_to_delete_list)} cards from rarity '{level}' in pack '{pack_id}'.")

    # 4️⃣ Commit all batched writes
    try:
        await batch.commit()
        logger.info(f"Successfully committed all updates for pack '{pack_id}'.")
        
        # Clear cache for this collection if we have the collection_id
        if len(parts) > 1:
            clear_pack_cache(collection_id)
        
        return True
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update pack: {e}")

async def activate_pack_in_firestore(
    pack_id: str,
    db_client: AsyncClient
) -> bool:
    """
    Activates a pack by setting its is_active field to True.

    Args:
        pack_id: The ID of the pack to activate
        db_client: Firestore client

    Returns:
        bool: True if the pack was successfully activated

    Raises:
        HTTPException: If the pack doesn't exist or there's an error activating it
    """
    try:
        # Check if pack_id contains a slash (indicating collection_id/pack_id format)
        parts = pack_id.split('/', 1)
        if len(parts) > 1:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Update the is_active field to True
        await pack_ref.update({"is_active": True})

        # Clear cache for this collection if we have the collection_id
        if len(parts) > 1:
            clear_pack_cache(collection_id)

        logger.info(f"Successfully activated pack '{pack_id}'")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error activating pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to activate pack: {str(e)}")

async def inactivate_pack_in_firestore(
    pack_id: str,
    db_client: AsyncClient
) -> bool:
    """
    Inactivates a pack by setting its is_active field to False.

    Args:
        pack_id: The ID of the pack to inactivate
        db_client: Firestore client

    Returns:
        bool: True if the pack was successfully inactivated

    Raises:
        HTTPException: If the pack doesn't exist or there's an error inactivating it
    """
    try:
        # Check if pack_id contains a slash (indicating collection_id/pack_id format)
        parts = pack_id.split('/', 1)
        if len(parts) > 1:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Update the is_active field to False
        await pack_ref.update({"is_active": False})

        # Clear cache for this collection if we have the collection_id
        if len(parts) > 1:
            clear_pack_cache(collection_id)

        logger.info(f"Successfully inactivated pack '{pack_id}'")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error inactivating pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to inactivate pack: {str(e)}")

async def delete_pack_in_firestore(
    pack_id: str,
    db_client: AsyncClient
) -> bool:
    """
    Deletes a pack from Firestore.

    Args:
        pack_id: The ID of the pack to delete
        db_client: Firestore client

    Returns:
        bool: True if the pack was successfully deleted

    Raises:
        HTTPException: If the pack doesn't exist or there's an error deleting it
    """
    try:
        # Check if pack_id contains a slash (indicating collection_id/pack_id format)
        parts = pack_id.split('/', 1)
        if len(parts) > 1:
            # If pack_id includes collection_id (collection_id/pack_id format)
            collection_id, actual_pack_id = parts
            logger.info(f"Parsed pack_id '{pack_id}' into collection_id='{collection_id}' and pack_id='{actual_pack_id}'")

            # Construct the reference to the pack document
            pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(actual_pack_id)
        else:
            # If just a simple pack_id
            logger.warning(f"No collection_id found in pack_id '{pack_id}', using it directly as document ID")
            pack_ref = db_client.collection('packs').document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")

        # Delete all cards in the pack's cards subcollection
        cards_collection = pack_ref.collection('cards')
        cards = await cards_collection.get()

        # Use a batch to delete all cards
        batch = db_client.batch()
        for card in cards:
            batch.delete(card.reference)

        # Delete the pack document itself
        batch.delete(pack_ref)

        # Commit the batch
        await batch.commit()

        # Clear cache for this collection if we have the collection_id
        if len(parts) > 1:
            clear_pack_cache(collection_id)

        logger.info(f"Successfully deleted pack '{pack_id}' and all its cards")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete pack: {str(e)}")

async def get_inactive_packs_from_collection(collection_id: str, db_client: firestore.AsyncClient) -> list[CardPack]:
    """
    Gets all inactive packs (where is_active == False) from a specific collection in Firestore.

    Args:
        collection_id: The ID of the collection to fetch inactive packs from
        db_client: Firestore client

    Returns:
        List of inactive CardPack objects in the collection

    Raises:
        HTTPException: If collection not found or on database error
    """
    logger.info(f"Fetching all inactive packs from collection '{collection_id}' in Firestore.")

    try:
        # Check if the collection exists
        collection_ref = db_client.collection("packs").document(collection_id)
        collection_doc = await collection_ref.get()
        if not collection_doc.exists:
            logger.error(f"Collection '{collection_id}' not found.")
            raise HTTPException(status_code=404, detail=f"Collection '{collection_id}' not found.")

        # Get all inactive packs in the collection
        packs_ref = (
            db_client.collection("packs")
            .document(collection_id)
            .collection(collection_id)
            .where("is_active", "==", False)  # Only get inactive packs
        )
        docs = await packs_ref.get()
        inactive_packs = []

        for doc in docs:
            data = doc.to_dict()
            pack_id = doc.id
            name = data.get("name", pack_id)

            # R2 URLs are public, no need to sign them
            image_url = data.get("image_url")
            signed_image_url = image_url

            inactive_packs.append(CardPack(
                id=pack_id,
                name=name,
                image_url=signed_image_url,
                win_rate=data.get("win_rate"),
                max_win=data.get("max_win"),
                min_win=data.get("min_win"),
                popularity=data.get("popularity", 0),
                price=data.get("price"),
                created_at=data.get("created_at"),
                is_active=data.get("is_active", False)
            ))

        logger.info(f"Successfully fetched {len(inactive_packs)} inactive packs from collection '{collection_id}'.")
        return inactive_packs

    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error fetching inactive packs from collection '{collection_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve inactive packs from collection '{collection_id}'.")

async def get_inactive_packs_from_collection_paginated(
    collection_id: str,
    db_client: firestore.AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: Optional[str] = "popularity",
    sort_order: str = "desc",
    search_query: Optional[str] = None,
    search_by_cards: bool = False,
    cursor: Optional[str] = None
) -> Dict[str, Any]:
    """
    Gets inactive packs (where is_active == False) from a specific collection in Firestore with pagination, sorting, and filtering.
    Uses the same in-memory approach as active packs for consistency and to leverage caching.

    Args:
        collection_id: The ID of the collection to fetch inactive packs from
        db_client: Firestore client
        page: Page number (default: 1)
        per_page: Items per page (default: 10)
        sort_by: Field to sort by (default: "popularity")
        sort_order: Sort order (asc or desc, default: desc)
        search_query: Optional search query to filter packs by name
        search_by_cards: Whether to search by cards in pack (default: False)
        cursor: Optional cursor for pagination (ID of the last document in the previous page)

    Returns:
        Dictionary containing:
            - packs: List of inactive packs in the collection
            - pagination: Pagination information
            - filters: Applied filters
            - next_cursor: Cursor for the next page

    Raises:
        HTTPException: If collection not found or on database error
    """
    logger.info(f"[In-Memory] Fetching inactive packs from collection '{collection_id}' with pagination.")

    valid_sort_fields = ["name", "popularity", "win_rate", "max_win", "min_win"]
    if sort_by not in valid_sort_fields:
        sort_by = "popularity"

    reverse = sort_order.lower() == "desc"

    try:
        # Get all packs (both active and inactive) - this leverages the cache
        all_packs = await get_cached_card_packs(collection_id, db_client, force_refresh=False, active_only=False)
        
        # Filter for inactive packs only
        all_inactive_packs = [pack for pack in all_packs if not pack.is_active]

        # Search filtering
        if search_query:
            filtered = []
            for pack in all_inactive_packs:
                if search_by_cards:
                    card_names = pack.cards.keys() if hasattr(pack, "cards") else []
                    if any(search_query.lower() in card.lower() for card in card_names):
                        filtered.append(pack)
                else:
                    if search_query.lower() in pack.name.lower():
                        filtered.append(pack)
            all_inactive_packs = filtered

        # Sort in memory
        all_inactive_packs.sort(key=lambda p: getattr(p, sort_by, 0) or 0, reverse=reverse)

        # Paginate
        total_items = len(all_inactive_packs)
        total_pages = (total_items + per_page - 1) // per_page if total_items > 0 else 1
        start = (page - 1) * per_page
        end = start + per_page
        paginated_packs = all_inactive_packs[start:end]
        next_cursor = paginated_packs[-1].id if len(paginated_packs) == per_page else None

        pagination_info = PaginationInfo(
            total_items=total_items,
            total_pages=total_pages,
            current_page=page,
            per_page=per_page
        )

        filters_info = AppliedFilters(
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )

        logger.info(f"Returned {len(paginated_packs)} inactive packs (page {page}).")

        return {
            "packs": paginated_packs,
            "pagination": pagination_info,
            "filters": filters_info,
            "next_cursor": next_cursor
        }

    except HTTPException:
        # Re-raise HTTPExceptions
        raise
    except Exception as e:
        logger.error(f"Error fetching inactive packs from collection '{collection_id}' with pagination: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve inactive packs from collection '{collection_id}'.")

async def update_card_in_pack(
    collection_id: str,
    pack_id: str,
    document_id: str,
    updates: Dict[str, Any],
    db_client: AsyncClient
) -> bool:
    """
    Updates a card's fields in a pack (probability and/or color).

    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack containing the card
        document_id: The ID of the card to update
        updates: Dictionary containing fields to update (probability and/or color)
        db_client: Firestore client

    Returns:
        bool: True if successfully updated

    Raises:
        HTTPException: If pack doesn't exist, card doesn't exist, or other errors
    """
    try:
        # Construct the reference to the pack document
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {collection_id}/{pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Check if card exists in the pack
        card_ref = pack_ref.collection('cards').document(document_id)
        card_snap = await card_ref.get()
        if not card_snap.exists:
            logger.error(f"Card '{document_id}' not found in pack '{pack_id}'")
            raise HTTPException(status_code=404, detail=f"Card '{document_id}' not found in pack '{pack_id}'")

        # Update the card document
        if updates:
            await card_ref.update(updates)
            logger.info(f"Updated card '{document_id}' in pack '{pack_id}' with updates: {updates}")

        # If probability is being updated, also update it in the pack's cards map
        if 'probability' in updates:
            pack_data = pack_snap.to_dict()
            cards_map = pack_data.get('cards', {})
            
            # Update the probability in the cards map (convert from percentage to decimal)
            cards_map[document_id] = round(updates['probability'] / 100, 4)
            await pack_ref.update({'cards': cards_map})
            logger.info(f"Updated probability in pack's cards map for card '{document_id}'")

        # Clear cache for this collection to ensure fresh data
        clear_pack_cache(collection_id)

        logger.info(f"Successfully updated card '{document_id}' in pack '{pack_id}'")
        return True
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating card in pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update card in pack: {str(e)}")


async def get_all_cards_in_pack(
    collection_id: str,
    pack_id: str,
    db_client: AsyncClient,
    sort_by: str = "point_worth"
) -> List[StoredCardInfo]:
    """
    Retrieves all cards in a pack and sorts them by the specified field in descending order.
    Default sort is by point_worth in descending order.

    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to get cards from
        db_client: Firestore client
        sort_by: Field to sort by, either "point_worth" (default) or "rarity"

    Returns:
        List[StoredCardInfo]: List of all cards in the pack, sorted by the specified field in descending order

    Raises:
        HTTPException: If the pack doesn't exist or there's an error retrieving the cards
    """
    try:
        # Construct the reference to the pack document
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {collection_id}/{pack_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Get all cards in the pack's cards subcollection
        cards_collection = pack_ref.collection('cards')
        cards = await cards_collection.get()

        # Convert the cards to StoredCardInfo objects
        card_list = []
        for card in cards:
            card_data = card.to_dict()
            card_data['id'] = card.id  # Add the document ID as the card ID

            # R2 URLs are public, no need to sign them

            # Create a StoredCardInfo object from the card data
            # Map the fields from the card document to the StoredCardInfo model
            stored_card = StoredCardInfo(
                id=card.id,
                card_name=card_data.get('card_name', ''),
                rarity=card_data.get('rarity', 0),
                point_worth=card_data.get('point_worth', 0),
                date_got_in_stock=card_data.get('date_got_in_stock', ''),
                image_url=card_data.get('image_url', ''),
                quantity=card_data.get('quantity', 0),
                probability=card_data.get('probability', None),
                color=card_data.get('color', None)
            )
            card_list.append(stored_card)

        # Sort the cards by the specified field in descending order
        if sort_by.lower() == "rarity":
            card_list.sort(key=lambda x: x.rarity, reverse=True)
            logger.info(f"Sorting cards by rarity in descending order")
        else:
            # Default to point_worth
            card_list.sort(key=lambda x: x.point_worth, reverse=True)
            logger.info(f"Sorting cards by point_worth in descending order")

        logger.info(f"Successfully retrieved {len(card_list)} cards from pack '{pack_id}' in collection '{collection_id}'")
        return card_list
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error retrieving cards from pack: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to retrieve cards from pack: {str(e)}")
