from fastapi import APIRouter, File, UploadFile, Form, HTTPException, Query, Body, Depends, Request
from typing import Annotated, List, Optional

from models.schemas import StoredCardInfo, UpdateQuantityRequest, UpdateCardRequest, CardListResponse, CollectionMetadata, Base64UploadCardRequest
from models.fusion_schema import CardFusionsResponse
from service.storage_service import (
    process_new_card_submission,
    get_all_stored_cards,
    update_card_quantity,
    update_card_information,
    delete_card_from_firestore,
    add_collection_metadata,
    get_collection_metadata,
    get_all_collection_metadata,
    delete_collection_metadata,
    get_card_by_id,
    process_base64_card_submission,
    update_card_image,
)
from service.fusion_service import get_card_fusions
from config import get_logger, get_firestore_client, settings
from google.cloud import firestore

# Hardcoded file size limit: 2.5MB
MAX_FILE_SIZE_BYTES = int(2.5 * 1024 * 1024)  # 2.5MB in bytes

logger = get_logger(__name__)

router = APIRouter(
    prefix="/storage",
    tags=["storage"],
)

@router.post("/upload_card", response_model=StoredCardInfo)
async def upload_card_endpoint(request: Request):
    """
    Endpoint to upload a card image and its information.
    Supports both file upload and base64 encoded images.
    
    For file upload:
    - **image_file**: The card image to upload as multipart form data.
    
    For base64 upload:
    - **image_base64**: Base64 encoded image data (with or without data URL prefix like "data:image/jpeg;base64,...")
    
    Common fields:
    - **card_name**: Name of the card.
    - **rarity**: Rarity of the card.
    - **point_worth**: How many points the card is worth.
    - **collection_metadata_id** (FORM FIELD, required): The ID of the collection metadata to use. 
       MUST be submitted as a form field, not as a URL parameter.
    - **quantity**: Number of cards in stock (defaults to 0).
    - **condition**: Condition of the card (defaults to "mint").
    - **date_got_in_stock** (optional): Kept for backward compatibility but not used. Today's date is used automatically.

    NOTE: You must provide either image_file OR image_base64, but not both.
    """

    # CRITICAL: Parse form data with custom larger limits to bypass Starlette's 1MB restriction
    logger.info("Parsing form data with increased size limits...")
    
    try:
        # Use request.form() with custom limits for 2.5MB
        form_data = await request.form(
            max_files=100,  # Allow up to 100 files
            max_fields=1000,  # Allow up to 1000 form fields 
            max_part_size=MAX_FILE_SIZE_BYTES  # Set to 2.5MB
        )
        logger.info(f"Successfully parsed form data with {len(form_data)} fields")
    except Exception as e:
        logger.error(f"Failed to parse form data: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Failed to parse form data: {str(e)}")
    
    # Extract form fields
    card_name = form_data.get('card_name')
    rarity = form_data.get('rarity')
    point_worth = form_data.get('point_worth')
    collection_metadata_id = form_data.get('collection_metadata_id')
    image_file = form_data.get('image_file')
    image_base64 = form_data.get('image_base64')
    quantity = form_data.get('quantity', '0')
    condition = form_data.get('condition', 'mint')
    
    # Validate required fields
    if not card_name:
        raise HTTPException(status_code=400, detail="Field required: card_name")
    if not rarity:
        raise HTTPException(status_code=400, detail="Field required: rarity")
    if not point_worth:
        raise HTTPException(status_code=400, detail="Field required: point_worth")
    if not collection_metadata_id:
        raise HTTPException(status_code=400, detail="Field required: collection_metadata_id")
    
    # Convert string values to appropriate types
    try:
        point_worth = int(point_worth)
        quantity = int(quantity)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="point_worth and quantity must be integers")
    
    logger.info(f"Received request to upload card: {card_name}. Collection metadata ID: {collection_metadata_id}")
    
    # Validate that we have exactly one image source
    if image_file and image_base64:
        raise HTTPException(status_code=400, detail="Provide either image_file or image_base64, not both")
    
    if not image_file and not image_base64:
        raise HTTPException(status_code=400, detail="Either image_file or image_base64 must be provided")

    # Validate file size for both image_file and image_base64 uploads
    MAX_FILE_SIZE = MAX_FILE_SIZE_BYTES
    
    if image_file:
        # Check file size from the UploadFile object
        file_size = 0
        if hasattr(image_file, 'size') and image_file.size:
            file_size = image_file.size
        else:
            # Read the file to get its size
            content = await image_file.read()
            file_size = len(content)
            # Reset file pointer
            await image_file.seek(0)
        
        if file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size allowed is {MAX_FILE_SIZE // (1024*1024)}MB, but received {file_size // (1024*1024)}MB."
            )
        
        logger.info(f"File size validation passed: {file_size} bytes ({file_size / (1024*1024):.2f}MB)")
    
    elif image_base64:
        # Validate base64 image size
        # Remove data URL prefix if present (e.g., "data:image/jpeg;base64,")
        base64_data = image_base64
        if base64_data.startswith('data:'):
            # Extract just the base64 part after the comma
            comma_index = base64_data.find(',')
            if comma_index != -1:
                base64_data = base64_data[comma_index + 1:]
        
        # Calculate approximate decoded size (base64 is ~33% larger than original)
        # Each 4 base64 characters represent 3 bytes of original data
        base64_length = len(base64_data)
        # Remove padding characters for accurate size calculation
        padding = base64_data.count('=')
        estimated_file_size = (base64_length * 3) // 4 - padding
        
        if estimated_file_size > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413, 
                detail=f"File too large. Maximum size allowed is {MAX_FILE_SIZE // (1024*1024)}MB, but received approximately {estimated_file_size // (1024*1024)}MB."
            )
        
        logger.info(f"Base64 file size validation passed: estimated {estimated_file_size} bytes ({estimated_file_size / (1024*1024):.2f}MB) from {base64_length} base64 characters")

    try:
        if image_base64:
            # Handle base64 upload
            logger.info(f"Processing base64 image upload for {card_name}")
            base64_request = Base64UploadCardRequest(
                image_base64=image_base64,
                card_name=card_name,
                rarity=rarity,
                point_worth=point_worth,
                collection_metadata_id=collection_metadata_id,
                quantity=quantity,
                condition=condition
            )
            stored_card = await process_base64_card_submission(base64_request)
        else:
            # Handle file upload
            logger.info(f"Processing file upload for {card_name}")
            stored_card = await process_new_card_submission(
                image_file=image_file,
                card_name=card_name,
                rarity=rarity,
                point_worth=point_worth,
                collection_metadata_id=collection_metadata_id,
                quantity=quantity,
                condition=condition
            )
        return stored_card
    except HTTPException as e:
        # Log the exception details if needed, then re-raise
        logger.error(f"HTTPException in upload_card_endpoint for {card_name}: {e.detail}")
        raise e
    except Exception as e:
        # Catch any other unexpected errors and return a generic 500
        logger.error(f"Unexpected error in upload_card_endpoint for {card_name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred processing the card: {str(e)}")

@router.get("/cards", response_model=CardListResponse)
async def get_all_cards_endpoint(
    collectionName: str | None = Query("one_piece", description="Collection name to retrieve cards from"),
    page: int = Query(1, ge=1, description="Page number to retrieve"),
    per_page: int = Query(10, ge=1, le=100, description="Number of items per page"),
    sort_by: str = Query("point_worth", description="Field to sort by (e.g., point_worth, card_name, date_got_in_stock, quantity, rarity)"),
    sort_order: str = Query("desc", description="Sort order: 'asc' or 'desc'"),
    search_query: str | None = Query(None, description="Search query for card name (prefix match)"),
    card_id: str | None = Query(None, description="Filter by specific card ID"),
    rarity_min: int | None = Query(None, ge=0, le=7, description="Filter by minimum rarity value (inclusive, 0-7)"),
    rarity_max: int | None = Query(None, ge=0, le=7, description="Filter by maximum rarity value (inclusive, 0-7)"),
    point_worth_min: int | None = Query(None, ge=0, description="Filter by minimum point worth value (inclusive)"),
    point_worth_max: int | None = Query(None, ge=0, description="Filter by maximum point worth value (inclusive)")
):
    """
    Endpoint to retrieve all stored card information with pagination, sorting, and search capabilities.
    - **collectionName**: Optional Firestore collection name.
    - **page**: Page number to retrieve (default: 1).
    - **per_page**: Number of items per page (default: 10, max: 100).
    - **sort_by**: Field to sort cards by (default: point_worth). Valid fields: point_worth, card_name, date_got_in_stock, quantity, rarity.
    - **sort_order**: Sort order, 'asc' or 'desc' (default: desc).
    - **search_query**: Optional search term for card name (searches will be sorted by relevance).
    - **card_id**: Optional filter to search for a specific card by ID.
    - **rarity_min**: Optional filter for minimum rarity value (inclusive, 0-7).
    - **rarity_max**: Optional filter for maximum rarity value (inclusive, 0-7).
    - **point_worth_min**: Optional filter for minimum point worth value (inclusive).
    - **point_worth_max**: Optional filter for maximum point worth value (inclusive).
    
    Note: Search results are limited to 200 hits to prevent excessive results. Results are sorted by relevance when searching.
    """
    logger.info(
        f"Received request to get all stored cards. Collection: {collectionName if collectionName else 'default'}, "
        f"Page: {page}, PerPage: {per_page}, SortBy: {sort_by}, SortOrder: {sort_order}, "
        f"Search: {search_query}, CardID: {card_id}, "
        f"RarityMin: {rarity_min}, RarityMax: {rarity_max}, "
        f"PointWorthMin: {point_worth_min}, PointWorthMax: {point_worth_max}"
    )
    try:
        # Pass all parameters to the service function
        card_list_response = await get_all_stored_cards(
            collection_name=collectionName,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query,
            card_id=card_id,
            rarity_min=rarity_min,
            rarity_max=rarity_max,
            point_worth_min=point_worth_min,
            point_worth_max=point_worth_max
        )
        return card_list_response
    except HTTPException as e:
        logger.error(f"HTTPException in get_all_cards_endpoint: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_all_cards_endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while fetching cards: {str(e)}")


@router.get("/cards/{document_id}", response_model=StoredCardInfo)
async def get_card_by_id_endpoint(
    document_id: str,
    collection_metadata_id: str
):
    """
    Retrieve a specific card by its document ID.
    - **document_id**: The Firestore document ID of the card.
    - **collectionName** (query param, optional): The Firestore collection to target.
    """
    logger.info(f"Received request to get card {document_id}. Collection: {collection_metadata_id if collection_metadata_id else 'default'}")
    try:
        card = await get_card_by_id(document_id, collection_name=collection_metadata_id)
        return card
    except HTTPException as e:
        logger.error(f"HTTPException in get_card_by_id_endpoint for {document_id}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_card_by_id_endpoint for {document_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred retrieving card: {str(e)}")

@router.get("/cards/{collection_id}/{card_id}/fusions", response_model=CardFusionsResponse)
async def get_card_fusions_route(
    collection_id: str,
    card_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Retrieves information about what fusions a card is used in.

    Args:
        collection_id: The ID of the collection the card belongs to
        card_id: The ID of the card
        db: Firestore client dependency

    Returns:
        CardFusionsResponse: Information about the fusions the card is used in
    """
    try:
        return await get_card_fusions(collection_id, card_id, db)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in get_card_fusions_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An internal error occurred while retrieving fusion information for card '{card_id}' in collection '{collection_id}'.")


@router.patch("/cards/{document_id}/quantity", response_model=StoredCardInfo)
async def update_card_quantity_endpoint(
    document_id: str,
    request: UpdateQuantityRequest,
    collection_metadata_id: str
):
    """
    Update the quantity of a card by adding or subtracting the specified amount.
    - **document_id**: The Firestore document ID of the card
    - **request.quantity_change**: The amount to change the quantity by (positive to add, negative to subtract)
    - **request.collectionName** (optional): The Firestore collection to target.
    """
    logger.info(f"Received request to update quantity for card {document_id} by {request.quantity_change}. Collection: {collection_metadata_id if collection_metadata_id else 'default'}")
    try:
        updated_card = await update_card_quantity(document_id, request.quantity_change, collection_name=collection_metadata_id)
        return updated_card
    except HTTPException as e:
        logger.error(f"HTTPException in update_card_quantity_endpoint for {document_id}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in update_card_quantity_endpoint for {document_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred updating card quantity: {str(e)}")

@router.put("/cards/{document_id}", response_model=StoredCardInfo)
async def update_card_endpoint(
    document_id: str,
    card_update: UpdateCardRequest,
    collection_metadata_id: str
):
    """
    Update card information, including the ability to update the card image.
    - **document_id**: The Firestore document ID of the card
    - **card_update**: The fields to update (only provided fields will be updated)
    - **card_update.image_base64**: Optional base64 encoded image to update the card image
    - **collectionName** (query param, optional): The Firestore collection to target.
    """
    logger.info(f"Received request to update card {document_id}. Collection: {collection_metadata_id if collection_metadata_id else 'default'}")
    try:
        # Convert Pydantic model to dict, excluding None values
        update_data = {k: v for k, v in card_update.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No update data provided")

        # Handle image update if image_base64 is provided and not empty
        if card_update.image_base64 is not None and card_update.image_base64.strip():
            # Remove image_base64 from update_data as we'll process it separately
            image_base64 = update_data.pop('image_base64', None)
            
            # Process the image upload and get the new image URL
            new_image_url = await update_card_image(
                document_id=document_id,
                image_base64=image_base64,
                collection_name=collection_metadata_id
            )
            
            # Add the new image URL to the update data
            update_data['image_url'] = new_image_url

        updated_card = await update_card_information(document_id, update_data, collection_name=collection_metadata_id)
        return updated_card
    except HTTPException as e:
        logger.error(f"HTTPException in update_card_endpoint for {document_id}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in update_card_endpoint for {document_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred updating card: {str(e)}")

@router.delete("/cards/{document_id}", status_code=204) # 204 No Content is typical for successful DELETE
async def delete_card_endpoint(
        document_id: str,
        collection_metadata_id: str
):
    """
    Delete a card from Firestore.
    - **document_id**: The Firestore document ID of the card.
    - **collection_data.collectionName** (optional): The Firestore collection to target.
    """
    try:
        await delete_card_from_firestore(document_id, collection_name=collection_metadata_id)
        # No content to return, FastAPI handles the 204 response code
    except HTTPException as e:
        logger.error(f"HTTPException in delete_card_endpoint for {document_id}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in delete_card_endpoint for {document_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred while deleting card: {str(e)}")

@router.post("/collection-metadata", response_model=CollectionMetadata)
async def add_collection_metadata_endpoint(
    metadata: CollectionMetadata = Body(...)
):
    """
    Add metadata for a collection to the metadata collection.
    - **metadata**: The metadata for the collection, including name, firestoreCollection, and storagePrefix.
    """
    logger.info(f"Received request to add metadata for collection: {metadata.name}")
    try:
        saved_metadata = await add_collection_metadata(metadata)
        return saved_metadata
    except HTTPException as e:
        logger.error(f"HTTPException in add_collection_metadata_endpoint for {metadata.name}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in add_collection_metadata_endpoint for {metadata.name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred adding collection metadata: {str(e)}")

@router.get("/collection-metadata/{collection_name}", response_model=CollectionMetadata)
async def get_collection_metadata_endpoint(
    collection_name: str
):
    """
    Retrieve metadata for a specific collection from the metadata collection.
    - **collection_name**: The name of the collection to retrieve metadata for.
    """
    logger.info(f"Received request to get metadata for collection: {collection_name}")
    try:
        metadata = await get_collection_metadata(collection_name)
        return metadata
    except HTTPException as e:
        logger.error(f"HTTPException in get_collection_metadata_endpoint for {collection_name}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_collection_metadata_endpoint for {collection_name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred retrieving collection metadata: {str(e)}")

@router.get("/collection-metadata", response_model=List[CollectionMetadata])
async def get_all_collection_metadata_endpoint():
    """
    Retrieve metadata for all collections from the metadata collection.
    """
    logger.info("Received request to get metadata for all collections")
    try:
        metadata_list = await get_all_collection_metadata()
        return metadata_list
    except HTTPException as e:
        logger.error(f"HTTPException in get_all_collection_metadata_endpoint: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in get_all_collection_metadata_endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred retrieving collection metadata: {str(e)}")

@router.delete("/collection-metadata/{collection_name}", status_code=204)
async def delete_collection_metadata_endpoint(
    collection_name: str
):
    """
    Delete metadata for a specific collection from the metadata collection.
    - **collection_name**: The name of the collection metadata to delete.
    """
    logger.info(f"Received request to delete metadata for collection: {collection_name}")
    try:
        await delete_collection_metadata(collection_name)
        # No content to return, FastAPI handles the 204 response code
    except HTTPException as e:
        logger.error(f"HTTPException in delete_collection_metadata_endpoint for {collection_name}: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Unexpected error in delete_collection_metadata_endpoint for {collection_name}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred deleting collection metadata: {str(e)}")
