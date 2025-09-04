from fastapi import APIRouter, HTTPException, Depends, Path, Body, Query
from google.cloud import firestore
from typing import List, Optional

from models.schemas import CardListing, CreateCardListingRequest, OfferPointsRequest, OfferCashRequest, UpdatePointOfferRequest, UpdateCashOfferRequest, AcceptOfferRequest, AcceptedOffersResponse, AllOffersResponse, PayPointOfferRequest, PayPricePointRequest, MarketplaceTransaction, SimpleMarketplaceTransaction, CreateListingResponse
from models.marketplace_schemas import PaginatedListingsResponse, OfficialListingResponse, OfficialListingCardInfo
from service.marketplace_service import create_card_listing, withdraw_listing, offer_points, withdraw_offer, get_user_listings, get_listing_by_id, offer_cash, withdraw_cash_offer, update_point_offer, update_cash_offer, accept_offer, get_accepted_offers, get_all_offers, pay_point_offer, pay_price_point, get_all_listings, buy_from_official_listing
from config import get_firestore_client, get_logger, settings
# No need for storage utils - R2 URLs are public
from dependencies.auth import get_current_user_id
from utils.challenger_validation import validate_not_challenger_account

logger = get_logger(__name__)

router = APIRouter(
    prefix="/marketplace",
    tags=["marketplace"],
)

@router.post("/listings", response_model=CreateListingResponse)
async def create_card_listing_route(
    listing_request: CreateCardListingRequest = Body(..., description="The listing details"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a listing for a card that a user wants to sell.

    This endpoint:
    1. Takes a user ID and listing details as arguments
    2. Verifies the user has the card and enough quantity
    3. If priceCash is set, checks Stripe Connect status
    4. Creates a new document in the "listings" collection
    5. Reduces the quantity of the card in the user's collection
    6. Returns the created listing with Stripe Connect status
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        response = await create_card_listing(
            user_id=user_id,
            listing_request=listing_request,
            db_client=db
        )
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating listing for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the listing")

@router.delete("/listings/{listing_id}", response_model=dict)
async def withdraw_listing_route(
    listing_id: str = Path(..., description="The ID of the listing to withdraw"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Withdraw a listing for a card that a user has put up for sale.

    This endpoint:
    1. Takes a user ID and listing ID as arguments
    2. Verifies the listing exists and the user is the owner
    3. Updates the user's card by decreasing locked_quantity and increasing quantity
    4. Deletes the listing
    5. Returns a success message
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await withdraw_listing(
            user_id=user_id,
            listing_id=listing_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error withdrawing listing for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while withdrawing the listing")

@router.post("/listings/{listing_id}/offers/points", response_model=CardListing)
async def offer_points_route(
    listing_id: str = Path(..., description="The ID of the listing to offer points for"),
    offer_request: OfferPointsRequest = Body(..., description="The points to offer"),
    expired: int = 7,
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Offer points for a listing.

    This endpoint:
    1. Takes a user ID, listing ID, and points to offer as arguments
    2. Verifies the user exists and has enough points
    3. Verifies the listing exists
    4. Creates a new offer document in the "offers" subcollection under the listing
    5. If it's the highest offer, updates the highestOfferPoints field in the listing document
    6. Returns the updated listing

    Args:
        user_id: The ID of the user making the offer
        listing_id: The ID of the listing to offer points for
        offer_request: The points to offer
        expired: Number of days until the offer expires (default: 7)
        db: Firestore async client
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        listing = await offer_points(
            user_id=user_id,
            listing_id=listing_id,
            offer_request=offer_request,
            db_client=db,
            expired=expired
        )
        return listing
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error offering points for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while offering points for the listing")

@router.get("/listings")
async def get_user_listings_route(
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    sort_by: Optional[str] = Query(None, description="Sort by field (createdAt, pricePoints, priceCash)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
    filter_type: Optional[str] = Query(None, description="Filter type (all, has_offers, accepted)"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all listings for a user with pagination and sorting.

    This endpoint:
    1. Takes a user ID as a path parameter
    2. Retrieves all listings where the user is the owner
    3. Checks if each listing has offers
    4. Returns paginated results with listings and pagination info
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await get_user_listings(
            user_id=user_id,
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            filter_type=filter_type
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting listings for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the listings")

@router.get("/listings/{listing_id}", response_model=CardListing)
async def get_listing_route(
    listing_id: str = Path(..., description="The ID of the listing to retrieve"),
    user_id: str = Depends(get_current_user_id),  # Still included for consistency but not used
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get information about a specific listing.

    This endpoint:
    1. Takes a user ID and listing ID as path parameters
    2. Retrieves the listing from the database
    3. Returns the listing details

    Args:
        user_id: The ID of the user (not used in the function but required for consistent API pattern)
        listing_id: The ID of the listing to retrieve
        db: Firestore async client

    Returns:
        CardListing: The listing object with all its details
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        listing = await get_listing_by_id(
            listing_id=listing_id,
            db_client=db
        )
        return listing
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting listing {listing_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the listing")

@router.delete("/listings/{listing_id}/offers/points/{offer_id}", response_model=dict)
async def withdraw_point_offer_route(
    listing_id: str = Path(..., description="The ID of the listing the offer was made for"),
    offer_id: str = Path(..., description="The ID of the offer to withdraw"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Withdraw a point offer for a listing.

    This endpoint:
    1. Takes a user ID, listing ID, and offer ID as arguments
    2. Verifies the offer exists and belongs to the user
    3. Deletes the offer from the listing's "point_offers" subcollection
    4. Deletes the corresponding offer from the user's "my_offers" subcollection
    5. If it was the highest offer, updates the listing's highestOfferPoints field
    6. Returns a success message
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await withdraw_offer(
            user_id=user_id,
            listing_id=listing_id,
            offer_id=offer_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error withdrawing point offer for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while withdrawing the point offer")

@router.post("/listings/{listing_id}/offers/cash", response_model=CardListing)
async def offer_cash_route(
    listing_id: str = Path(..., description="The ID of the listing to offer cash for"),
    offer_request: OfferCashRequest = Body(..., description="The cash amount to offer"),
    expired: int = 7,
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Offer cash for a listing.

    This endpoint:
    1. Takes a user ID, listing ID, and cash amount to offer as arguments
    2. Verifies the user exists
    3. Verifies the listing exists
    4. Creates a new offer document in the "cash_offers" subcollection under the listing
    5. If it's the highest offer, updates the highestOfferCash field in the listing document
    6. Returns the updated listing

    Args:
        user_id: The ID of the user making the offer
        listing_id: The ID of the listing to offer cash for
        offer_request: The cash amount to offer
        expired: Number of days until the offer expires (default: 7)
        db: Firestore async client
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        listing = await offer_cash(
            user_id=user_id,
            listing_id=listing_id,
            offer_request=offer_request,
            db_client=db,
            expired=expired
        )
        return listing
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error offering cash for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while offering cash for the listing")

@router.delete("/listings/{listing_id}/offers/cash/{offer_id}", response_model=dict)
async def withdraw_cash_offer_route(
    listing_id: str = Path(..., description="The ID of the listing the offer was made for"),
    offer_id: str = Path(..., description="The ID of the offer to withdraw"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Withdraw a cash offer for a listing.

    This endpoint:
    1. Takes a user ID, listing ID, and offer ID as arguments
    2. Verifies the offer exists and belongs to the user
    3. Deletes the offer from the listing's "cash_offers" subcollection
    4. Deletes the corresponding offer from the user's "my_offers" subcollection
    5. If it was the highest offer, updates the listing's highestOfferCash field
    6. Returns a success message
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await withdraw_cash_offer(
            user_id=user_id,
            listing_id=listing_id,
            offer_id=offer_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error withdrawing cash offer for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while withdrawing the cash offer")

@router.put("/listings/{listing_id}/offers/points/{offer_id}", response_model=CardListing)
async def update_point_offer_route(
    listing_id: str = Path(..., description="The ID of the listing the offer was made for"),
    offer_id: str = Path(..., description="The ID of the offer to update"),
    update_request: UpdatePointOfferRequest = Body(..., description="The new points to offer"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update a point offer for a listing with a higher amount.

    This endpoint:
    1. Takes a user ID, listing ID, offer ID, and new points to offer as arguments
    2. Verifies the user exists
    3. Verifies the listing exists
    4. Verifies the offer exists and belongs to the user
    5. Verifies the new amount is higher than the current amount
    6. Updates the offer with the new amount
    7. If it becomes the highest offer, updates the listing's highestOfferPoints field
    8. Returns the updated listing
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        listing = await update_point_offer(
            user_id=user_id,
            listing_id=listing_id,
            offer_id=offer_id,
            update_request=update_request,
            db_client=db
        )
        return listing
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating point offer for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the point offer")

@router.put("/listings/{listing_id}/offers/cash/{offer_id}", response_model=CardListing)
async def update_cash_offer_route(
    listing_id: str = Path(..., description="The ID of the listing the offer was made for"),
    offer_id: str = Path(..., description="The ID of the offer to update"),
    update_request: UpdateCashOfferRequest = Body(..., description="The new cash amount to offer"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update a cash offer for a listing with a higher amount.

    This endpoint:
    1. Takes a user ID, listing ID, offer ID, and new cash amount to offer as arguments
    2. Verifies the user exists
    3. Verifies the listing exists
    4. Verifies the offer exists and belongs to the user
    5. Verifies the new amount is higher than the current amount
    6. Updates the offer with the new amount
    7. If it becomes the highest offer, updates the listing's highestOfferCash field
    8. Returns the updated listing
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        listing = await update_cash_offer(
            user_id=user_id,
            listing_id=listing_id,
            offer_id=offer_id,
            update_request=update_request,
            db_client=db
        )
        return listing
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating cash offer for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the cash offer")

@router.post("/listings/{listing_id}/accept", response_model=CardListing)
async def accept_offer_route(
    listing_id: str = Path(..., description="The ID of the listing"),
    accept_request: AcceptOfferRequest = Body(..., description="The type of offer to accept"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Accept the highest offer (cash or point) for a listing.

    This endpoint:
    1. Takes a user ID, listing ID, and offer type as arguments
    2. Verifies the listing exists and belongs to the user
    3. Finds the highest offer of the specified type
    4. Updates the status of the offer to "accepted"
    5. Sets the payment_due date to 2 days after the accept time
    6. Returns the updated listing
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        listing = await accept_offer(
            user_id=user_id,
            listing_id=listing_id,
            offer_type=accept_request.offer_type,
            db_client=db
        )
        return listing
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error accepting offer for listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while accepting the offer")

@router.get("/my_offers/{offer_type}", response_model=AcceptedOffersResponse)
async def get_accepted_offers_route(
    offer_type: str = Path(..., description="The type of offer to get (cash or point)"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all accepted offers for a specific user.

    This endpoint:
    1. Takes a user ID and offer type as arguments
    2. Retrieves all accepted offers of the specified type for the user
    3. Returns a list of accepted offers with details including amount, timestamps, card reference, etc.
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        accepted_offers = await get_accepted_offers(
            user_id=user_id,
            offer_type=offer_type,
            db_client=db
        )

        # Convert the list of dictionaries to the response model
        return AcceptedOffersResponse(offers=accepted_offers)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting accepted offers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting accepted offers")


@router.get("/all_offers/{offer_type}")
async def get_all_offers_route(
    offer_type: str = Path(..., description="The type of offer to get (cash or point)"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    sort_by: Optional[str] = Query(None, description="Sort by field (amount, at, card_name)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
    search_query: Optional[str] = Query(None, description="Search by card name"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all offers for a specific user with pagination, sorting, and search.

    This endpoint:
    1. Takes a user ID and offer type as arguments
    2. Retrieves all offers of the specified type for the user
    3. Supports pagination, sorting by amount/date/card_name, and card name search
    4. Returns offers with pagination info and applied filters
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await get_all_offers(
            user_id=user_id,
            offer_type=offer_type,
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting all offers: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting all offers")


# Create a separate router for endpoints that don't require a user_id
listings_router = APIRouter(
    prefix="/marketplace",
    tags=["marketplace"],
)

@listings_router.get("/test")
async def test_no_auth():
    """Test endpoint that requires no authentication"""
    return {"message": "This endpoint works without authentication"}

@listings_router.get("/all-listings", response_model=PaginatedListingsResponse)
async def get_all_listings_route(
    collection_id: Optional[str] = Query(None, description="Filter listings by collection ID"),
    per_page: int = Query(10, ge=1, le=100, description="Items per page"),
    sort_by: Optional[str] = Query(None, description="Sort by field (priceCash or pricePoints)"),
    sort_order: str = Query("desc", description="Sort direction (asc or desc)"),
    search_query: Optional[str] = Query(None, description="Search by card name"),
    page: int = Query(1, ge=1, description="Page number for pagination"),
    filter_out_accepted: bool = Query(True, description="Filter out listings with status 'accepted'"),
    min_price_cash: Optional[float] = Query(None, ge=0, description="Minimum cash price filter"),
    max_price_cash: Optional[float] = Query(None, ge=0, description="Maximum cash price filter"),
    min_price_points: Optional[int] = Query(None, ge=0, description="Minimum points price filter"),
    max_price_points: Optional[int] = Query(None, ge=0, description="Maximum points price filter"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all listings in the marketplace with filtering, pagination, and sorting.

    This endpoint:
    1. Retrieves listings from the marketplace with optional filtering by collection_id
    2. Filters listings by card_name if search_query is provided
    3. Applies sorting by priceCash or pricePoints if specified
    4. Applies page-based pagination
    5. Returns a paginated list of listings with pagination info and applied filters

    Args:
        collection_id: Optional filter by collection ID
        per_page: Number of items per page (between 1 and 100)
        sort_by: Field to sort by (priceCash or pricePoints)
        sort_order: Sort direction (asc or desc)
        search_query: Optional search query to filter listings by card name
        page: Page number for pagination (starts at 1)
        filter_out_accepted: Whether to filter out listings with status 'accepted' (default: True)
    """
    try:
        result = await get_all_listings(
            db_client=db,  # Still pass db_client for backward compatibility
            collection_id=collection_id,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query,
            page=page,
            filter_out_accepted=filter_out_accepted,  # Pass the filter_out_accepted parameter
            min_price_cash=min_price_cash,
            max_price_cash=max_price_cash,
            min_price_points=min_price_points,
            max_price_points=max_price_points
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting all listings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting all listings")

@router.post("/listings/{listing_id}/offers/{offer_id}/pay")
async def pay_point_offer_route(
    listing_id: str = Path(..., description="The ID of the listing"),
    offer_id: str = Path(..., description="The ID of the offer to pay"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Pay for a point offer, which will:
    1. Deduct points from the user's account
    2. Add points to the seller's account
    3. Add the card to the user's collection
    4. Deduct quantity from the listing
    5. Delete the listing if quantity becomes zero
    6. Deduct locked_quantity from the seller's card
    7. Delete the seller's card if both quantity and locked_quantity are zero
    8. Insert data into the marketplace_transactions Firestore collection
    9. Insert data into the marketplace_transactions SQL table
    10. Delete the user's offer from their my_point_offers collection

    This endpoint:
    1. Takes a user ID, listing ID, and offer ID as arguments
    2. Verifies the user exists and is the offer creator
    3. Verifies the listing exists
    4. Verifies the offer exists
    5. Verifies the user has enough points
    6. Deducts points from the user
    7. Adds points to the seller
    8. Adds the card to the user's collection
    9. Deducts quantity from the listing (or deletes it if quantity becomes zero)
    10. Deducts locked_quantity from the seller's card
    11. Deletes the seller's card if both quantity and locked_quantity are zero
    12. Inserts data into the marketplace_transactions Firestore collection
    13. Inserts data into the marketplace_transactions SQL table
    14. Deletes the user's offer from their my_point_offers collection
    15. Returns a success message with details
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await pay_point_offer(
            user_id=user_id,
            listing_id=listing_id,
            offer_id=offer_id,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error paying for point offer: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while paying for the point offer")


@router.post("/listings/{listing_id}/pay_price_point")
async def pay_price_point_route(
    listing_id: str = Path(..., description="The ID of the listing"),
    request: PayPricePointRequest = Body(..., description="The request containing the quantity of cards to buy"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Pay for a price point directly, which will:
    1. Deduct points from the user's account
    2. Add points to the seller's account
    3. Add the card to the user's collection
    4. Deduct quantity from the listing
    5. Delete the listing if quantity becomes zero
    6. Deduct locked_quantity from the seller's card
    7. Delete the seller's card if both quantity and locked_quantity are zero
    8. Insert data into the marketplace_transactions Firestore collection
    9. Insert data into the marketplace_transactions SQL table

    This endpoint:
    1. Takes a user ID, listing ID, and quantity as arguments
    2. Verifies the user exists
    3. Verifies the listing exists
    4. Verifies the listing has a pricePoints field
    5. Verifies the user has enough points
    6. Deducts points from the user
    7. Adds points to the seller
    8. Adds the card to the user's collection
    9. Deducts quantity from the listing (or deletes it if quantity becomes zero)
    10. Deducts locked_quantity from the seller's card
    11. Deletes the seller's card if both quantity and locked_quantity are zero
    12. Inserts data into the marketplace_transactions Firestore collection
    13. Inserts data into the marketplace_transactions SQL table
    14. Returns a success message with details
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await pay_price_point(
            user_id=user_id,
            listing_id=listing_id,
            quantity=request.quantity,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error paying for price point: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while paying for the price point")



@listings_router.get("/official_listings", response_model=OfficialListingResponse)
async def get_official_listings_route(
    collection_id: str = Query(..., description="Collection ID to get official listings for"),
    page: int = Query(1, ge=1, description="Page number to retrieve"),
    per_page: int = Query(10, ge=1, le=100, description="Number of items per page"),
    sort_by: str = Query("pricePoints", description="Field to sort by"),
    sort_order: str = Query("asc", description="Sort order (asc or desc)"),
    search_query: Optional[str] = Query(None, description="Search query to filter cards by name"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get official marketplace listings for a specific collection with pagination, sorting, and search.
    
    This endpoint retrieves cards from the official_listing collection and generates signed URLs
    for their images.
    
    Args:
        collection_id: The ID of the collection to get official listings for
        page: The page number to retrieve (default: 1)
        per_page: The number of items per page (default: 10, max: 100)
        sort_by: The field to sort by (default: "pricePoints")
        sort_order: The sort order, either "asc" or "desc" (default: "asc")
        search_query: Optional search query to filter cards by name
        
    Returns:
        OfficialListingResponse: Response containing cards with signed URLs, pagination info, and filters
    """
    try:
        from service.marketplace_service import get_official_listings
        
        result = await get_official_listings(
            collection_id=collection_id,
            db_client=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting official listings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting official listings")


@router.post("/official_listings/buy")
async def buy_from_official_listing_route(
    collection_id: str = Query(..., description="Collection ID the card belongs to"),
    card_id: str = Query(..., description="Card ID to buy from the official listing"),
    quantity: int = Query(1, description="Quantity of cards to buy (default: 1)"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Buy a card from the official listing.
    
    This endpoint handles the purchase of cards from the official marketplace:
    1. Verifies the user and card availability
    2. Checks if the user has enough points
    3. Deducts points from the user
    4. Adds the card to the user's collection
    5. Updates the official listing inventory
    
    All operations are performed atomically through the backend service.
    
    Args:
        user_id: The ID of the user buying the card
        collection_id: The ID of the collection the card belongs to
        card_id: The ID of the card to buy from the official listing
        quantity: The quantity of cards to buy (default: 1)
        
    Returns:
        Success response with transaction details
    """
    try:
        # Validate that challenger accounts cannot use marketplace
        validate_not_challenger_account(user_id, "marketplace")
        result = await buy_from_official_listing(
            user_id=user_id,
            collection_id=collection_id,
            card_id=card_id,
            quantity=quantity,
            db_client=db
        )
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error buying from official listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while buying from official listing")
