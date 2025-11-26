from fastapi import APIRouter, HTTPException, Depends, Query, Path, Body
from typing import Optional
from google.cloud import firestore

from models.schemas import AllWithdrawRequestsResponse, WithdrawRequestDetail, UpdateWithdrawRequestStatusRequest
from service.shipping_service import get_all_withdraw_requests_with_cursor, update_withdraw_request_status, get_withdraw_request_by_id
from config import get_firestore_client, get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/shipping",
    tags=["shipping"],
)

@router.get("/withdraw-requests", response_model=AllWithdrawRequestsResponse)
async def get_all_withdraw_requests_with_cursor_route(
    limit: int = Query(10, description="Maximum number of items to return (default: 10)"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination (optional)"),
    sort_by: str = Query("created_at", description="Field to sort by (default: created_at)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    status: Optional[str] = Query(None, description="Filter by status (optional)"),
    card_status: Optional[str] = Query(None, description="Filter by card status (optional)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    List all withdraw requests across all users with cursor-based pagination.

    This endpoint:
    1. Retrieves withdraw requests from the card_shipping collection
    2. Supports cursor-based pagination with limit and cursor query parameters
    3. Supports sorting with sort_by and sort_order query parameters
    4. Returns a response with withdraw requests and cursor pagination information

    The cursor parameter is optional for the first request. For subsequent requests,
    use the next_cursor value from the previous response to get the next page.
    """
    try:
        withdraw_requests_response = await get_all_withdraw_requests_with_cursor(
            db_client=db,
            limit=limit,
            cursor=cursor,
            sort_by=sort_by,
            sort_order=sort_order,
            status=status,
            card_status=card_status
        )
        return withdraw_requests_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting all withdraw requests with cursor pagination: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving withdraw requests")


@router.put("/withdraw-requests/{user_id}/{request_id}/status", response_model=WithdrawRequestDetail)
async def update_withdraw_request_status_route(
    user_id: str = Path(..., description="The ID of the user who made the withdraw request"),
    request_id: str = Path(..., description="The ID of the withdraw request to update"),
    request: UpdateWithdrawRequestStatusRequest = Body(..., description="Request body containing new status values"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update the status of a withdraw request and its corresponding card_shipping document.

    This endpoint:
    1. Takes a user ID and request ID as path parameters
    2. Takes a request body with new status and shipping_status values
    3. Updates the status and shipping_status in both the withdraw request document and the card_shipping document
    4. Returns the updated withdraw request details

    The status field represents the overall status of the withdraw request (e.g., 'pending', 'processing', 'completed').
    The shipping_status field represents the status of the shipment (e.g., 'label_created', 'shipped', 'delivered').
    """
    try:
        updated_withdraw_request = await update_withdraw_request_status(
            user_id=user_id,
            request_id=request_id,
            status=request.status,
            card_status=request.card_status,
            db_client=db
        )
        return updated_withdraw_request
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the withdraw request status")



@router.get("/withdraw-requests/{user_id}/{request_id}", response_model=WithdrawRequestDetail)
async def get_withdraw_request_detail_route(
    user_id: str = Path(..., description="The ID of the user who made the withdraw request"),
    request_id: str = Path(..., description="The ID of the withdraw request to retrieve"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get detailed information about a specific withdraw request.
    
    This endpoint:
    1. Retrieves the withdraw request details including all card information
    2. Checks and updates shipping status from Shippo if applicable
    3. Returns complete withdraw request information
    """
    try:
        withdraw_request = await get_withdraw_request_by_id(
            request_id=request_id,
            user_id=user_id,
            db_client=db
        )
        return withdraw_request
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the withdraw request")


@router.get("/shop-orders")
async def get_all_shop_orders_route(
    limit: int = Query(10, description="Maximum number of items to return (default: 10)"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination (optional)"),
    sort_by: str = Query("created_at", description="Field to sort by (default: created_at)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    status: Optional[str] = Query(None, description="Filter by status (optional)"),
    card_status: Optional[str] = Query(None, description="Filter by card status (optional)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    List all shop orders across all users with cursor-based pagination.

    This endpoint:
    1. Retrieves shop orders from the card_shipping collection where purchase_type = 'official_shop'
    2. Supports cursor-based pagination with limit and cursor query parameters
    3. Supports sorting with sort_by and sort_order query parameters
    4. Returns a response with shop orders and cursor pagination information

    The cursor parameter is optional for the first request. For subsequent requests,
    use the next_cursor value from the previous response to get the next page.
    """
    try:
        from service.shipping_service import get_all_shop_orders_with_cursor
        
        shop_orders_response = await get_all_shop_orders_with_cursor(
            db_client=db,
            limit=limit,
            cursor=cursor,
            sort_by=sort_by,
            sort_order=sort_order,
            status=status,
            card_status=card_status
        )
        return shop_orders_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting all shop orders with cursor pagination: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving shop orders")


@router.get("/shop-orders/{user_id}/{order_id}", response_model=WithdrawRequestDetail)
async def get_shop_order_detail_route(
    user_id: str = Path(..., description="The ID of the user who made the shop order"),
    order_id: str = Path(..., description="The ID of the shop order to retrieve"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get detailed information about a specific shop order.
    
    This endpoint:
    1. Retrieves the shop order details from the shop_orders collection
    2. Returns complete shop order information including items
    """
    try:
        from service.shipping_service import get_shop_order_by_id
        
        shop_order = await get_shop_order_by_id(
            order_id=order_id,
            user_id=user_id,
            db_client=db
        )
        return shop_order
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shop order {order_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the shop order")


@router.put("/shop-orders/{user_id}/{order_id}/status", response_model=WithdrawRequestDetail)
async def update_shop_order_status_route(
    user_id: str = Path(..., description="The ID of the user who made the shop order"),
    order_id: str = Path(..., description="The ID of the shop order to update"),
    request: UpdateWithdrawRequestStatusRequest = Body(..., description="Request body containing new status values"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update the status of a shop order.

    This endpoint:
    1. Takes a user ID and order ID as path parameters
    2. Takes a request body with new status and shipping_status values
    3. Updates the status and shipping_status in the shop order document
    4. Returns the updated shop order details

    The status field represents the overall status of the order (e.g., 'pending', 'processing', 'completed').
    The shipping_status field represents the status of the shipment (e.g., 'label_created', 'shipped', 'delivered').
    """
    try:
        from service.shipping_service import update_shop_order_status
        
        updated_shop_order = await update_shop_order_status(
            user_id=user_id,
            order_id=order_id,
            status=request.status,
            card_status=request.card_status,
            db_client=db
        )
        return updated_shop_order
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating shop order {order_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the shop order status")

@router.post("/withdraw-requests/{user_id}/{request_id}/archive")
async def archive_withdraw_request_route(
    user_id: str = Path(..., description="The ID of the user who made the withdraw request"),
    request_id: str = Path(..., description="The ID of the withdraw request to archive"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Archive a withdraw request.

    This endpoint:
    1. Moves the shipping request from 'card_shipping' to 'card_shipping_archived'
    2. Updates the status in the user's withdraw_requests collection to 'archived'
    """
    try:
        from service.shipping_service import archive_withdraw_request
        
        result = await archive_withdraw_request(
            user_id=user_id,
            request_id=request_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error archiving withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while archiving the withdraw request")


@router.post("/withdraw-requests/{user_id}/{request_id}/unarchive")
async def unarchive_withdraw_request_route(
    user_id: str = Path(..., description="The ID of the user who made the withdraw request"),
    request_id: str = Path(..., description="The ID of the withdraw request to unarchive"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Unarchive a withdraw request.

    This endpoint:
    1. Moves the shipping request from 'card_shipping_archived' back to 'card_shipping'
    """
    try:
        from service.shipping_service import unarchive_withdraw_request
        
        result = await unarchive_withdraw_request(
            user_id=user_id,
            request_id=request_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unarchiving withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while unarchiving the withdraw request")


@router.get("/withdraw-requests/archived", response_model=AllWithdrawRequestsResponse)
async def get_all_archived_withdraw_requests_route(
    limit: int = Query(10, description="Maximum number of items to return (default: 10)"),
    cursor: Optional[str] = Query(None, description="Cursor for pagination (optional)"),
    sort_by: str = Query("archived_at", description="Field to sort by (default: archived_at)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    status: Optional[str] = Query(None, description="Filter by status (optional)"),
    card_status: Optional[str] = Query(None, description="Filter by card status (optional)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    List all archived withdraw requests with cursor-based pagination.
    """
    try:
        from service.shipping_service import get_all_archived_withdraw_requests_with_cursor
        
        response = await get_all_archived_withdraw_requests_with_cursor(
            db_client=db,
            limit=limit,
            cursor=cursor,
            sort_by=sort_by,
            sort_order=sort_order,
            status=status,
            card_status=card_status
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting archived withdraw requests: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving archived withdraw requests")
