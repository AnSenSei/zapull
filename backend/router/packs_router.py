from fastapi import APIRouter, HTTPException, Depends, Form, Body, Query, File, UploadFile, Request
from typing import List, Dict, Optional, Any, Union
import json
from pydantic import BaseModel
from models.pack_schema import (
    CardPack,
    CollectionItem,
    AddPackRequest,
    UpdatePackRequest,
    AddCardToPackRequest,
    AddCardToPackDirectRequest,
    DeleteCardFromPackRequest,
    BatchAddCardsToPackRequest,
    BatchAddCardsToPackResponse,
    UpdateCardInPackRequest,
    PaginatedPacksResponse,
    PaginationInfo,
    AppliedFilters
)
from models.schemas import StoredCardInfo
from service.packs_service import (
    create_pack_in_firestore,
    get_all_packs_from_firestore,
    get_pack_by_id_from_firestore,
    update_pack_in_firestore,
    update_pack_name,
    add_card_from_storage_to_pack,
    get_packs_collection_from_firestore,
    add_card_direct_to_pack,
    batch_add_cards_direct_to_pack,
    delete_card_from_pack,
    update_card_in_pack,
    activate_pack_in_firestore,
    inactivate_pack_in_firestore,
    delete_pack_in_firestore,
    get_all_cards_in_pack,
    get_inactive_packs_from_collection,
    get_inactive_packs_from_collection_paginated
)
from config import get_firestore_client, get_storage_client, settings, get_logger
from google.cloud import firestore, storage



logger = get_logger(__name__)

router = APIRouter(
    prefix="/packs",
    tags=["packs"],
)

@router.get("/packs_collection", response_model=List[CollectionItem])
async def list_packs_route(db: firestore.AsyncClient = Depends(get_firestore_client)):
    """Lists all available collections from metadata collection (same as collection metadata endpoint)."""
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
    Lists ACTIVE packs under a specific collection in Firestore with pagination, filtering, sorting, and searching.

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
            - packs: List of ACTIVE packs in the collection
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

@router.get("/collection/{collection_id}/inactive", response_model=PaginatedPacksResponse)
async def get_inactive_packs_in_collection_route(
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
    Lists inactive packs (where is_active == False) under a specific collection in Firestore with pagination, filtering, sorting, and searching.

    Args:
        collection_id: The ID of the collection to get inactive packs from
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
            - packs: List of inactive packs in the collection
            - pagination: Pagination information
            - filters: Applied filters
            - next_cursor: Cursor for the next page
    """
    result = await get_inactive_packs_from_collection_paginated(
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

@router.post("/", response_model=Dict[str, str], status_code=201)
async def add_pack_route(
    request: Request,
    db: firestore.AsyncClient = Depends(get_firestore_client),
    storage_client: storage.Client = Depends(get_storage_client)
):
    """
    Adds a new card pack to Firestore, optionally including an image.
    Uses centralized Firestore and Storage clients from the config module.

    - **pack_name**: Name of the new pack (sent as form field).
    - **collection_id**: ID of the pack collection (sent as form field).
    - **price**: Price of the pack (sent as form field).
    - **win_rate**: Optional win rate for the pack (sent as form field).
    - **max_win**: Optional maximum win value for the pack (sent as form field).
    - **popularity**: Optional popularity value for the pack (sent as form field). Defaults to 0 if not provided.
    - **image_file**: Optional base64 encoded image string for the pack (format: "data:image/jpeg;base64,...").
    - **file**: Optional direct file upload (multipart/form-data).
    """
    try:
        # Define file size limit (2.5MB)
        MAX_FILE_SIZE = 2.5 * 1024 * 1024  # 2.5MB in bytes
        
        # Parse multipart form data with increased size limits to handle larger uploads
        try:
            form_data = await request.form(
                max_files=100,
                max_fields=1000,
                max_part_size=MAX_FILE_SIZE  # 2.5MB per part
            )
        except ValueError as e:
            if "Part exceeded maximum size" in str(e) or "maximum size" in str(e):
                raise HTTPException(
                    status_code=413,
                    detail="File size exceeds the maximum allowed size of 2.5MB"
                )
            else:
                raise HTTPException(status_code=400, detail=f"Invalid form data: {str(e)}")
        
        # Extract form fields
        pack_name = form_data.get('pack_name')
        collection_id = form_data.get('collection_id')
        price = form_data.get('price')
        win_rate = form_data.get('win_rate')
        max_win = form_data.get('max_win')
        popularity = form_data.get('popularity')
        pack_type = form_data.get('type')  # Pack type: CN, JP, or US
        image_file = form_data.get('image_file')  # Base64 encoded image string
        file = form_data.get('file')  # Direct file upload
        
        # Validate required fields
        if not pack_name:
            raise HTTPException(status_code=400, detail="pack_name is required")
        if not collection_id:
            raise HTTPException(status_code=400, detail="collection_id is required")
        if not price:
            raise HTTPException(status_code=400, detail="price is required")
            
        # Convert string values to appropriate types
        try:
            price = int(price)
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="price must be a valid integer")
            
        try:
            win_rate = int(win_rate) if win_rate else None
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="win_rate must be a valid integer or null")
            
        try:
            max_win = int(max_win) if max_win else None
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="max_win must be a valid integer or null")
            
        try:
            popularity = int(popularity) if popularity else None
        except (ValueError, TypeError):
            raise HTTPException(status_code=400, detail="popularity must be a valid integer or null")
        
        # Validate file size for base64 upload
        if image_file and isinstance(image_file, str):
            # Estimate base64 decoded size (base64 is ~33% larger than binary)
            estimated_size = (len(image_file) * 3) / 4
            if estimated_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Base64 image size ({estimated_size/1024/1024:.1f}MB) exceeds the maximum allowed size of 2.5MB"
                )
        
        # Validate file size for multipart upload
        if file and hasattr(file, 'size') and file.size:
            if file.size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File size ({file.size/1024/1024:.1f}MB) exceeds the maximum allowed size of 2.5MB"
                )
        
        pack_request_model = AddPackRequest(
            pack_name=pack_name,
            collection_id=collection_id,
            price=price,
            win_rate=win_rate,
            max_win=max_win,
            is_active=False,
            popularity=popularity,
            type=pack_type if pack_type else "US"  # Default to US if not provided
        )

        pack_id = await create_pack_in_firestore(pack_request_model, db, storage_client, image_file, file)
        return {
            "pack_id": pack_id, 
            "pack_name": pack_name,
            "collection_id": collection_id,
            "price": str(price),
            "win_rate": str(win_rate if win_rate is not None else "None"),
            "max_win": str(max_win if max_win is not None else "None"),
            "popularity": str(popularity if popularity is not None else 0),
            "message": f"Pack '{pack_name}' created successfully in collection '{collection_id}'"
        }
    except ValueError as e:
        # This could be from Pydantic validation (e.g. not 7 rarities)
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException as e:
        # Re-raise HTTPExceptions from the service layer or dependency
        raise e
    except Exception as e:
        logger.error(f"Unhandled error in add_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while creating the pack.") 


@router.post("/{collection_id}/{pack_id}/cards", response_model=Dict[str, str], status_code=201)
async def add_card_to_pack_direct_route(
    collection_id: str,
    pack_id: str,
    request: AddCardToPackDirectRequest,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Adds a card directly to a pack with its own probability.

    The card information is fetched from the storage service using the collection_id
    and document_id provided in the request.

    The card is stored as a document under /packs/{collection_id}/{packId}/cards/{cardId}
    with the following fields:
    - globalRef: Reference to the global card document (DocumentReference)
    - name: Card name
    - quantity: Card quantity (updated after each draw)
    - point: Card point value (updated after each draw)
    - probability: The probability value for the card as a percentage (0 to 100)
    - condition: The condition of the card (taken from the card data in storage)
    - color: The color of the card

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to add the card to
        request: AddCardToPackDirectRequest containing document_id, probability, and condition
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        await add_card_direct_to_pack(
            collection_metadata_id=collection_id,
            document_id=request.document_id,
            pack_id=pack_path,
            probability=request.probability,
            db_client=db,
            color=request.color
        )
        return {
            "message": f"Successfully added card '{request.document_id}' directly to pack '{pack_id}' in collection '{collection_id}' with probability {request.probability}",
            "card_id": request.document_id,
            "pack_id": pack_id,
            "collection_id": collection_id,
            "probability": str(request.probability)
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in add_card_to_pack_direct_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while adding the card to the pack.")


@router.post("/{collection_id}/{pack_id}/cards/batch", response_model=BatchAddCardsToPackResponse, status_code=201)
async def batch_add_cards_to_pack_route(
    collection_id: str,
    pack_id: str,
    request: BatchAddCardsToPackRequest,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Adds multiple cards directly to a pack with their own probabilities in a batch operation.

    The card information for each card is fetched from the storage service using the collection_id
    from the path and document_id provided in each card request.

    Each card is stored as a document under /packs/{collection_id}/{packId}/cards/{cardId}
    with the following fields:
    - globalRef: Reference to the global card document (DocumentReference)
    - name: Card name
    - quantity: Card quantity (updated after each draw)
    - point: Card point value (updated after each draw)
    - probability: The probability value for the card as a percentage (0 to 100)
    - condition: The condition of the card (taken from the card data in storage)
    - color: The color of the card

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to add the cards to
        request: BatchAddCardsToPackRequest containing a list of cards to add
        db: Firestore client dependency

    Returns:
        BatchAddCardsToPackResponse with detailed results for each card and summary statistics
    """
    try:
        # Validate that we have cards to add
        if not request.cards:
            raise HTTPException(status_code=400, detail="No cards provided in the batch request")

        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Convert Pydantic models to dictionaries for the service function
        cards_data = [
            {
                "collection_metadata_id": collection_id,
                "document_id": card.document_id,
                "probability": card.probability,
                "color": card.color
            }
            for card in request.cards
        ]

        # Call the batch service function
        results = await batch_add_cards_direct_to_pack(
            cards_data=cards_data,
            pack_id=pack_path,
            db_client=db
        )

        # Calculate summary statistics
        total_cards = len(results)
        successful_cards = sum(1 for result in results if result["success"])
        failed_cards = total_cards - successful_cards

        # Convert results to Pydantic models
        from models.pack_schema import BatchAddCardsResult
        formatted_results = [
            BatchAddCardsResult(
                document_id=result["document_id"],
                success=result["success"],
                error_message=result["error_message"]
            )
            for result in results
        ]

        logger.info(f"Batch add completed for pack '{pack_id}' in collection '{collection_id}': {successful_cards}/{total_cards} successful")

        return BatchAddCardsToPackResponse(
            total_cards=total_cards,
            successful_cards=successful_cards,
            failed_cards=failed_cards,
            results=formatted_results,
            pack_id=pack_id,
            collection_id=collection_id
        )

    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in batch_add_cards_to_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while batch adding cards to the pack.")


@router.delete("/{collection_id}/{pack_id}/cards", response_model=Dict[str, str])
async def delete_card_from_pack_route(
    collection_id: str,
    pack_id: str,
    request: DeleteCardFromPackRequest,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Deletes a card directly from a pack.

    The card is identified by the document_id provided in the request.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack containing the card
        request: DeleteCardFromPackRequest containing document_id
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        await delete_card_from_pack(
            collection_metadata_id=collection_id,
            document_id=request.document_id,
            pack_id=pack_path,
            db_client=db
        )
        return {
            "message": f"Successfully deleted card '{request.document_id}' from pack '{pack_id}' in collection '{collection_id}'",
            "card_id": request.document_id,
            "pack_id": pack_id,
            "collection_id": collection_id
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in delete_card_from_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while deleting the card from the pack.")

@router.patch("/{collection_id}/{pack_id}/activate", response_model=Dict[str, str])
async def activate_pack_route(
    collection_id: str,
    pack_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Activates a pack by setting its is_active field to True.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to activate
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        await activate_pack_in_firestore(
            pack_id=pack_path,
            db_client=db
        )
        return {
            "message": f"Successfully activated pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in activate_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while activating the pack.")

@router.patch("/{collection_id}/{pack_id}/inactivate", response_model=Dict[str, str])
async def inactivate_pack_route(
    collection_id: str,
    pack_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Inactivates a pack by setting its is_active field to False.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to inactivate
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        await inactivate_pack_in_firestore(
            pack_id=pack_path,
            db_client=db
        )
        return {
            "message": f"Successfully inactivated pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in inactivate_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while inactivating the pack.")

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

@router.patch("/{collection_id}/{pack_id}/max_win", response_model=Dict[str, str])
async def update_max_win_route(
    collection_id: str,
    pack_id: str,
    max_win: int = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the max_win value for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        max_win: The new max_win value for the pack
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Create an updates dictionary with just the max_win field
        updates = {"max_win": max_win}

        # Use the existing update_pack_in_firestore function to update the pack
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        return {
            "message": f"Successfully updated max_win to {max_win} for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "max_win": str(max_win)
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_max_win_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's max_win value.")

@router.patch("/{collection_id}/{pack_id}/min_win", response_model=Dict[str, str])
async def update_min_win_route(
    collection_id: str,
    pack_id: str,
    min_win: int = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the min_win value for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        min_win: The new min_win value for the pack
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Create an updates dictionary with just the min_win field
        updates = {"min_win": min_win}

        # Use the existing update_pack_in_firestore function to update the pack
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        return {
            "message": f"Successfully updated min_win to {min_win} for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "min_win": str(min_win)
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_min_win_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's min_win value.")

@router.patch("/{collection_id}/{pack_id}/price", response_model=Dict[str, str])
async def update_price_route(
    collection_id: str,
    pack_id: str,
    price: int = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the price value for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        price: The new price value for the pack
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Create an updates dictionary with just the price field
        updates = {"price": price}

        # Use the existing update_pack_in_firestore function to update the pack
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        return {
            "message": f"Successfully updated price to {price} for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "price": str(price)
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_price_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's price value.")

@router.patch("/{collection_id}/{pack_id}/win_rate", response_model=Dict[str, str])
async def update_win_rate_route(
    collection_id: str,
    pack_id: str,
    win_rate: int = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the win_rate value for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        win_rate: The new win_rate value for the pack
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Create an updates dictionary with just the win_rate field
        updates = {"win_rate": win_rate}

        # Use the existing update_pack_in_firestore function to update the pack
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        return {
            "message": f"Successfully updated win_rate to {win_rate} for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "win_rate": str(win_rate)
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_win_rate_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's win_rate value.")

@router.patch("/{collection_id}/{pack_id}/popularity", response_model=Dict[str, str])
async def update_popularity_route(
    collection_id: str,
    pack_id: str,
    popularity: int = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the popularity value for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        popularity: The new popularity value for the pack
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Create an updates dictionary with just the popularity field
        updates = {"popularity": popularity}

        # Use the existing update_pack_in_firestore function to update the pack
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        return {
            "message": f"Successfully updated popularity to {popularity} for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "popularity": str(popularity)
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_popularity_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's popularity value.")

@router.patch("/{collection_id}/{pack_id}/separation", response_model=Dict[str, str])
async def update_separation_route(
    collection_id: str,
    pack_id: str,
    separation: str = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the separation value for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        separation: The new separation value for the pack (can be "hunt", "feature", "special", or "other")
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Validate separation value
        valid_separations = ["hunt", "feature", "special", "other"]
        if separation not in valid_separations:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid separation value. Must be one of: {', '.join(valid_separations)}"
            )
        
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # Create an updates dictionary with just the separation field
        updates = {"separation": separation}

        # Use the existing update_pack_in_firestore function to update the pack
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        return {
            "message": f"Successfully updated separation to '{separation}' for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "separation": separation
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_separation_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's separation value.")

@router.patch("/{collection_id}/{pack_id}/name", response_model=Dict[str, str])
async def update_pack_name_route(
    collection_id: str,
    pack_id: str,
    name: str = Form(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates the name of a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        name: The new name for the pack
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        result = await update_pack_name(
            collection_id=collection_id,
            pack_id=pack_id,
            new_name=name,
            db_client=db
        )
        return result
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_pack_name_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's name.")

@router.patch("/{collection_id}/{pack_id}/image", response_model=Dict[str, str])
async def update_pack_image_route(
    collection_id: str,
    pack_id: str,
    request: Request,
    db: firestore.AsyncClient = Depends(get_firestore_client),
    storage_client: storage.Client = Depends(get_storage_client)
):
    """
    Updates the cover image for a specific pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to update
        request: FastAPI Request object containing the multipart form data
        db: Firestore client dependency
        storage_client: Google Cloud Storage client dependency

    Returns:
        Dictionary with success message and new image URL (if updated)
    """
    try:
        # Define file size limit (2.5MB)
        MAX_FILE_SIZE = 2.5 * 1024 * 1024  # 2.5MB in bytes
        
        # Parse multipart form data with increased size limits to handle larger uploads
        try:
            form_data = await request.form(
                max_files=100,
                max_fields=1000,
                max_part_size=MAX_FILE_SIZE  # 2.5MB per part
            )
        except ValueError as e:
            if "Part exceeded maximum size" in str(e) or "maximum size" in str(e):
                raise HTTPException(
                    status_code=413,
                    detail="File size exceeds the maximum allowed size of 2.5MB"
                )
            else:
                raise HTTPException(status_code=400, detail=f"Invalid form data: {str(e)}")
        
        # Extract form fields
        image_file = form_data.get('image_file')  # Base64 encoded image string
        file = form_data.get('file')  # Direct file upload
        
        # Validate file size for base64 upload
        if image_file and isinstance(image_file, str):
            # Estimate base64 decoded size (base64 is ~33% larger than binary)
            estimated_size = (len(image_file) * 3) / 4
            if estimated_size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"Base64 image size ({estimated_size/1024/1024:.1f}MB) exceeds the maximum allowed size of 2.5MB"
                )
        
        # Validate file size for multipart upload
        if file and hasattr(file, 'size') and file.size:
            if file.size > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File size ({file.size/1024/1024:.1f}MB) exceeds the maximum allowed size of 2.5MB"
                )
        
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        # First, check if the pack exists
        parts = pack_path.split('/', 1)
        if len(parts) > 1:
            coll_id, actual_pack_id = parts
            pack_ref = db.collection('packs').document(coll_id).collection(coll_id).document(actual_pack_id)
        else:
            pack_ref = db.collection('packs').document(pack_path)
        
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Check if neither image_file nor file is provided
        if not image_file and not file:
            logger.info(f"No image provided, skipping image update for pack '{pack_id}' in collection '{collection_id}'")
            return {
                "message": f"No image update for pack '{pack_id}' in collection '{collection_id}' (no image provided)",
                "pack_id": pack_id,
                "collection_id": collection_id
            }

        # Upload the new image to R2
        try:
            from utils.storage_utils import parse_base64_image, get_file_extension, upload_image
            
            # Handle base64 format
            if image_file and image_file.strip():
                # Parse the base64 image string (returns content_type and already decoded binary data)
                content_type, image_data = parse_base64_image(image_file)
                
                # Get the file extension from the content type
                file_extension = get_file_extension(content_type)
            
            # Handle file upload format
            elif file:
                # Read the uploaded file
                image_data = await file.read()
                content_type = file.content_type or "image/jpeg"
                
                # Get file extension from filename or content type
                if file.filename and '.' in file.filename:
                    file_extension = file.filename.split('.')[-1].lower()
                else:
                    file_extension = get_file_extension(content_type)
            
            # Include collection_id and UUID in the blob path to avoid cache issues
            import uuid
            unique_id = str(uuid.uuid4())
            unique_blob_name = f"packs/{collection_id}/{pack_id}_{unique_id}.{file_extension}"
            
            # Upload to R2
            image_url = await upload_image(
                image_data=image_data,
                object_key=unique_blob_name,
                bucket_type='pack',
                content_type=content_type
            )
            
            image_gcs_uri = image_url
            logger.info(f"Pack image updated in R2. URL: {image_gcs_uri}")
            
        except ValueError as ve:
            logger.error(f"Invalid image format: {ve}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"Invalid image format: {str(ve)}")
        except Exception as e:
            logger.error(f"Error uploading pack image to R2: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Could not upload pack image: {str(e)}")

        # Update the pack document with the new image URL
        updates = {"image_url": image_gcs_uri}
        logger.info(f"About to update Firestore with image_url: {image_gcs_uri}")
        
        await update_pack_in_firestore(
            pack_id=pack_path,
            updates=updates,
            db_client=db
        )
        
        # Verify the update by fetching the pack again
        logger.info(f"Verifying update for pack {pack_path}")
        if len(parts) > 1:
            coll_id, actual_pack_id = parts
            verify_ref = db.collection('packs').document(coll_id).collection(coll_id).document(actual_pack_id)
        else:
            verify_ref = db.collection('packs').document(pack_path)
        
        verify_snap = await verify_ref.get()
        if verify_snap.exists:
            verify_data = verify_snap.to_dict()
            logger.info(f"After update, pack image_url in Firestore: {verify_data.get('image_url')}")
        
        return {
            "message": f"Successfully updated image for pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id,
            "image_url": image_gcs_uri
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_pack_image_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the pack's image.")

@router.patch("/{collection_id}/{pack_id}/cards/{document_id}", response_model=Dict[str, str])
async def update_card_in_pack_route(
    collection_id: str,
    pack_id: str,
    document_id: str,
    request: UpdateCardInPackRequest,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Updates a card's probability and/or color in a pack.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack containing the card
        document_id: The ID of the card to update (from URL)
        request: UpdateCardInPackRequest containing optional probability and/or color
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Build updates dictionary with only the fields that are provided
        updates = {}
        if request.probability is not None:
            updates['probability'] = request.probability
        if request.color is not None:
            updates['color'] = request.color
            
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update. Provide either probability or color.")
        
        await update_card_in_pack(
            collection_id=collection_id,
            pack_id=pack_id,
            document_id=document_id,
            updates=updates,
            db_client=db
        )
        
        response = {
            "message": f"Successfully updated card '{document_id}' in pack '{pack_id}'",
            "card_id": document_id,
            "pack_id": pack_id,
            "collection_id": collection_id
        }
        
        # Add updated fields to response
        if 'probability' in updates:
            response["probability"] = str(updates['probability'])
        if 'color' in updates:
            response["color"] = updates['color']
            
        return response
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in update_card_in_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while updating the card.")

@router.delete("/{collection_id}/{pack_id}", response_model=Dict[str, str])
async def delete_pack_route(
    collection_id: str,
    pack_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Deletes a pack and all its cards from Firestore.

    Args:
        collection_id: The ID of the pack collection containing the pack
        pack_id: The ID of the pack to delete
        db: Firestore client dependency

    Returns:
        Dictionary with success message
    """
    try:
        # Pass the collection_id as part of the pack_id path parameter
        # Format: collection_id/pack_id
        pack_path = f"{collection_id}/{pack_id}"

        await delete_pack_in_firestore(
            pack_id=pack_path,
            db_client=db
        )
        return {
            "message": f"Successfully deleted pack '{pack_id}' in collection '{collection_id}'",
            "pack_id": pack_id,
            "collection_id": collection_id
        }
    except HTTPException:
        # Re-raise HTTPExceptions from the service layer
        raise
    except Exception as e:
        logger.error(f"Unhandled error in delete_pack_route: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal error occurred while deleting the pack.")
