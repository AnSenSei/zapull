from fastapi import APIRouter, Depends, HTTPException, Query
from google.cloud import firestore
from models.schemas import PackOpeningHistoryResponse
from models.payment_schemas import PaginatedRechargeHistoryResponse
from service.history_service import (
    get_user_pack_opening_history,
    get_user_marketplace_transactions_as_buyer,
    get_user_marketplace_transactions_as_seller,
    get_user_recharge_history
)
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id

logger = get_logger(__name__)
router = APIRouter(prefix="/history", tags=["History"])

@router.get("/pack-opening", response_model=PackOpeningHistoryResponse)
async def get_pack_opening_history_route(
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Get a user's pack opening history.

    This endpoint:
    1. Takes a user ID, page number, and items per page as arguments
    2. Retrieves the user's pack opening history from the database
    3. Returns the pack opening history with pagination information
    """
    try:
        history = await get_user_pack_opening_history(
            user_id=user_id,
            page=page,
            per_page=per_page
        )
        return history
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting pack opening history: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting pack opening history")


@router.get("/marketplace/buyer")
async def get_marketplace_transactions_buyer_route(
    page: int = Query(1, ge=1, description="Page number to retrieve"),
    per_page: int = Query(10, ge=1, le=100, description="Number of items per page"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get marketplace transactions where the user is a buyer with pagination.
    
    This endpoint:
    1. Takes a user ID as an argument
    2. Retrieves all marketplace transactions where the user is a buyer
    3. Returns paginated results sorted by traded_at (newest first)
    4. Includes pagination metadata
    """
    try:
        result = await get_user_marketplace_transactions_as_buyer(
            user_id=user_id,
            db_client=db,
            page=page,
            per_page=per_page
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user marketplace transactions as buyer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting marketplace transactions as buyer")


@router.get("/marketplace/seller")
async def get_marketplace_transactions_seller_route(
    page: int = Query(1, ge=1, description="Page number to retrieve"),
    per_page: int = Query(10, ge=1, le=100, description="Number of items per page"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get marketplace transactions where the user is a seller with pagination.
    
    This endpoint:
    1. Takes a user ID as an argument
    2. Retrieves all marketplace transactions where the user is a seller
    3. Returns paginated results sorted by traded_at (newest first)
    4. Includes pagination metadata
    """
    try:
        result = await get_user_marketplace_transactions_as_seller(
            user_id=user_id,
            db_client=db,
            page=page,
            per_page=per_page
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user marketplace transactions as seller: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting marketplace transactions as seller")


@router.get("/recharge")
async def get_recharge_history_route(
    page: int = Query(1, ge=1, description="Page number to retrieve"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get a user's recharge history with pagination.
    
    This endpoint:
    1. Takes a user ID, page number, and page size
    2. Retrieves the user's total cash recharged from Firestore
    3. Retrieves a paginated list of recharge records from the cash_recharges table
    4. Returns the paginated results with metadata
    """
    try:
        result = await get_user_recharge_history(
            user_id=user_id,
            db_client=db,
            page=page,
            page_size=page_size
        )
        
        # Convert to PaginatedRechargeHistoryResponse format
        return PaginatedRechargeHistoryResponse(
            user_id=result["user_id"],
            total_cash_recharged=result["total_cash_recharged"],
            recharge_history=result["recharge_history"],
            total_count=result["pagination"]["total_count"],
            page=result["pagination"]["current_page"],
            page_size=result["pagination"]["page_size"],
            has_next=result["pagination"]["has_next"]
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving paginated recharge history for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the recharge history")