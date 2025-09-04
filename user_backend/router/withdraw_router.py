from fastapi import APIRouter, HTTPException, Depends, Path, Query, Body
from typing import Optional, List
from google.cloud import firestore

from models.schemas import (
    WithdrawCardsRequest, WithdrawCardsResponse,
    WithdrawRequestsResponse, WithdrawRequestDetail, UpdateWithdrawCardsRequest
)
from pydantic import BaseModel
from service.withdraw_service import (
    withdraw_ship_multiple_cards,
    get_all_withdraw_requests,
    get_withdraw_request_by_id,
    update_withdraw_request,
    withdraw_pending_ship_request
)
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id
from utils.challenger_validation import validate_not_challenger_account

logger = get_logger(__name__)

router = APIRouter(
    prefix="/withdrawals",
    tags=["withdrawals"],
)


@router.post("/cards/withdraw", response_model=WithdrawCardsResponse)
async def withdraw_multiple_cards_route(
    withdraw_request: WithdrawCardsRequest = Body(..., description="The cards to withdraw"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a withdraw request for multiple cards from a user's collection.

    This endpoint:
    1. Takes a user ID and a list of cards to withdraw (each with card_id and quantity)
    2. Creates a new withdraw request with fields for request date and status
    3. Creates a "cards" subcollection under the withdraw request to store all withdrawn cards
    4. For each card, if quantity is less than the card's quantity, only withdraws the specified quantity
    5. Only removes a card from the original subcollection if the remaining quantity is 0
    6. Returns a list of the updated cards from the withdraw request
    """
    try:
        # Validate that challenger accounts cannot use withdraw
        validate_not_challenger_account(user_id, "withdraw")
        # Convert the CardToWithdraw objects to dictionaries
        cards_to_withdraw = [{"card_id": card.card_id, "quantity": card.quantity, "subcollection_name": card.subcollection_name} for card in withdraw_request.cards]

        withdrawn_cards = await withdraw_ship_multiple_cards(
            user_id=user_id,
            cards_to_withdraw=cards_to_withdraw,
            address_id=withdraw_request.address_id,
            phone_number=withdraw_request.phone_number,
            db_client=db
        )
        return WithdrawCardsResponse(cards=withdrawn_cards)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating withdraw request for multiple cards for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the withdraw request")


@router.get("/withdraw-requests", response_model=WithdrawRequestsResponse)
async def get_all_withdraw_requests_route(
    page: int = Query(1, description="Page number (default: 1)"),
    per_page: int = Query(10, description="Items per page (default: 10)"),
    sort_by: str = Query("created_at", description="Field to sort by (default: created_at)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc, default: desc)"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    List all withdraw requests for a specific user with pagination.

    This endpoint:
    1. Takes a user ID as a path parameter
    2. Supports pagination with page and per_page query parameters
    3. Supports sorting with sort_by and sort_order query parameters
    4. Retrieves withdraw requests for the user with pagination and sorting
    5. Returns a response with withdraw requests and pagination information
    """
    try:
        # Validate that challenger accounts cannot use withdraw
        validate_not_challenger_account(user_id, "withdraw")
        withdraw_requests_response = await get_all_withdraw_requests(
            user_id=user_id, 
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return withdraw_requests_response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting withdraw requests for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving withdraw requests")


@router.get("/withdraw-requests/{request_id}", response_model=WithdrawRequestDetail)
async def get_withdraw_request_by_id_route(
    request_id: str = Path(..., description="The ID of the withdraw request to retrieve"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get details of a specific withdraw request by ID for a specific user.

    This endpoint:
    1. Takes a user ID and request ID as path parameters
    2. Retrieves the withdraw request with the specified ID for the specified user
    3. Returns the withdraw request details, including:
       - created_at: timestamp when the request was created
       - request_date: timestamp when the request was made
       - status: string indicating the status of the request (e.g., 'pending')
       - user_id: string identifying the user who made the request
       - cards: list of cards included in the withdraw request
    """
    try:
        # Validate that challenger accounts cannot use withdraw
        validate_not_challenger_account(user_id, "withdraw")
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


@router.put("/withdraw-requests/{request_id}", response_model=WithdrawRequestDetail)
async def update_withdraw_request_route(
    request_id: str = Path(..., description="The ID of the withdraw request to update"),
    update_request: UpdateWithdrawCardsRequest = Body(..., description="The updated shipping information"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update an existing withdraw request's phone number and/or address.

    This endpoint:
    1. Takes a user ID and request ID as path parameters
    2. Takes an UpdateWithdrawCardsRequest in the request body containing:
       - address_id: (optional) ID of the address to ship the cards to
       - phone_number: (optional) phone number of the recipient
    3. Updates only the shipping address and/or phone number of the withdraw request
    4. Returns the updated withdraw request details

    Note: Only withdraw requests with status 'pending' can be updated.
    Note: You cannot modify the cards in the withdraw request, only the shipping information.
    """
    try:
        # Validate that challenger accounts cannot use withdraw
        validate_not_challenger_account(user_id, "withdraw")
        # Prepare kwargs for the update_withdraw_request function
        kwargs = {
            "request_id": request_id,
            "user_id": user_id,
            "db_client": db
        }

        # Only include address_id and phone_number if they are provided
        if update_request.address_id is not None:
            kwargs["address_id"] = update_request.address_id
        if update_request.phone_number is not None:
            kwargs["phone_number"] = update_request.phone_number

        updated_withdraw_request = await update_withdraw_request(**kwargs)
        return updated_withdraw_request
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the withdraw request")


@router.delete("/withdraw-requests/{request_id}", response_model=WithdrawRequestDetail)
async def withdraw_pending_ship_request_route(
    request_id: str = Path(..., description="The ID of the withdraw request to withdraw"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Withdraw (cancel) a pending ship request and return the cards back to the user's collection.

    This endpoint:
    1. Takes a user ID and request ID as path parameters
    2. Validates that the withdraw request has a status of 'pending'
    3. Returns the cards in the withdraw request back to the user's collection
    4. Marks the withdraw request as 'canceled'
    5. Returns the updated withdraw request details

    Note: Only withdraw requests with status 'pending' can be withdrawn.
    """
    try:
        # Validate that challenger accounts cannot use withdraw
        validate_not_challenger_account(user_id, "withdraw")
        withdrawn_request = await withdraw_pending_ship_request(
            request_id=request_id,
            user_id=user_id,
            db_client=db
        )
        return withdrawn_request
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error withdrawing pending ship request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while withdrawing the pending ship request")


class WithdrawFeeRequest(BaseModel):
    country: str
    total_value: int


class WithdrawFeeResponse(BaseModel):
    zone: int
    fee: int
    free_shipping_threshold: int
    is_free_shipping: bool
    country: str
    total_value: int


@router.post("/withdraw/calculate-fee", response_model=WithdrawFeeResponse)
async def calculate_withdraw_fee_route(
    fee_request: WithdrawFeeRequest = Body(..., description="Country and total value to calculate fee")
):
    """
    Calculate withdrawal shipping fee based on country zone.
    
    Zone 1: All US states and territories
    - Fee: $5.50 (550 points)
    - Free shipping on orders over $150 (15000 points)
    
    Zone 2: Canada, Mexico, UK
    - Fee: $10 (1000 points)
    - Free shipping on orders over $300 (30000 points)
    
    Zone 3: Germany, France, Australia, Italy
    - Fee: $15 (1500 points)
    - Free shipping on orders over $450 (45000 points)
    
    Countries not listed will return zone 0 with a message indicating shipping is not available.
    """
    # Zone definitions
    ZONE_1_COUNTRIES = ["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"]
    ZONE_2_COUNTRIES = ["CA", "CANADA", "MX", "MEXICO", "GB", "UK", "UNITED KINGDOM"]
    ZONE_3_COUNTRIES = ["DE", "GERMANY", "FR", "FRANCE", "AU", "AUSTRALIA", "IT", "ITALY"]
    
    # Fee configuration by zone
    ZONE_CONFIG = {
        1: {"fee": 550, "threshold": 15000},
        2: {"fee": 1000, "threshold": 30000},
        3: {"fee": 1500, "threshold": 45000}
    }
    
    # Normalize country input
    country_upper = fee_request.country.upper().strip()
    
    # Determine zone
    zone = 0
    if country_upper in ZONE_1_COUNTRIES:
        zone = 1
    elif country_upper in ZONE_2_COUNTRIES:
        zone = 2
    elif country_upper in ZONE_3_COUNTRIES:
        zone = 3
    
    # Handle unsupported countries
    if zone == 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Shipping to {fee_request.country} is not currently supported"
        )
    
    # Get zone configuration
    zone_config = ZONE_CONFIG[zone]
    
    # Calculate if free shipping applies
    is_free_shipping = fee_request.total_value >= zone_config["threshold"]
    fee = 0 if is_free_shipping else zone_config["fee"]
    
    return WithdrawFeeResponse(
        zone=zone,
        fee=fee,
        free_shipping_threshold=zone_config["threshold"],
        is_free_shipping=is_free_shipping,
        country=fee_request.country,
        total_value=fee_request.total_value
    )