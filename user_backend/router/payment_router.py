from typing import Optional, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, Path, Header, Body, Request
from google.cloud import firestore
from models.payment_schemas import CreatePaymentIntentRequest, PaymentIntentResponse, StripeOnboardingResponse, StripeDashboardLinkResponse, PaginatedRechargeHistoryResponse, AttachPaymentMethodRequest, PaymentMethodResponse, ListPaymentMethodsResponse, DeletePaymentMethodResponse, PaymentStatusResponse, StripeStatusResponse, WebhookResponse, SetDefaultPaymentMethodResponse, OfficialShopCheckoutRequest
from service.payment_service import create_payment_intent, create_stripe_connect_account, create_stripe_dashboard_link, create_marketplace_intent, attach_payment_method, list_payment_methods, delete_payment_method, check_payment_status, check_stripe_connect_status, handle_stripe_webhook, set_default_payment_method, create_official_shop_checkout_session
from config import get_firestore_client, get_logger
from utils.payment_validation import validate_payment_amount
from config import settings
from dependencies.auth import get_current_user_id

logger = get_logger(__name__)

router = APIRouter(
    prefix="/payments",
    tags=["payments"],
)

@router.post("/payment/create-intent", response_model=PaymentIntentResponse)
async def create_payment_intent_route(
    request: CreatePaymentIntentRequest = Body(..., description="Payment intent request details"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a payment intent for a user with enhanced security.

    This endpoint:
    1. Takes a user ID and payment details
    2. Validates payment amount and performs risk assessment
    3. Creates a payment intent using Stripe
    4. Returns the payment intent details including client_secret

    Security features:
    - Payment amount validation
    - Risk assessment and fraud detection
    - Server-side webhook idempotency protection
    
    The client_secret can be used on the frontend to complete the payment using Stripe Elements or other Stripe libraries.
    """
    try:
        # Log request for audit trail
        logger.info(f"Payment intent request: user={user_id}, amount={request.amount}")
        
        # Validate payment amount
        await validate_payment_amount(request.amount, request.currency)
        
        # Create payment intent
        response_dict = await create_payment_intent(
            user_id=user_id,
            amount=request.amount,
            currency=request.currency,
            metadata=request.metadata,
            db_client=db,
            refer_code=request.refer_code
        )
        response = PaymentIntentResponse(**response_dict)
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating payment intent for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the payment intent")

@router.post("/payment/create-setup-intent")
async def create_setup_intent_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a Setup Intent for adding payment methods without immediate payment.
    
    This endpoint:
    1. Takes a user ID
    2. Creates or retrieves the user's Stripe customer
    3. Creates a Setup Intent to save payment methods for future use
    4. Returns the client_secret for frontend confirmation
    
    Use this when you want to:
    - Add a payment method without charging immediately
    - Save cards for future payments
    - Support wallet payment methods (Apple Pay, Google Pay)
    """
    try:
        import stripe
        from service.payment_service import get_or_create_stripe_customer
        
        # Get or create Stripe customer
        customer_id = await get_or_create_stripe_customer(user_id, db)
        
        # Create setup intent
        setup_intent = stripe.SetupIntent.create(
            customer=customer_id,
            payment_method_types=['card'],
            usage='off_session',  # Allow future off-session usage
            metadata={'user_id': user_id}
        )
        
        logger.info(f"Created setup intent {setup_intent.id} for user {user_id}")
        
        return {
            "client_secret": setup_intent.client_secret,
            "id": setup_intent.id,
            "status": setup_intent.status
        }
        
    except Exception as e:
        logger.error(f"Error creating setup intent for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the setup intent")

@router.post("/payment/create-marketplace-intent", response_model=PaymentIntentResponse)
async def create_marketplace_intent_route(
    listing_id: str = Body(..., description="The ID of the listing"),
    buyer_address_id: str = Body(..., description="The ID of the buyer's address"),
    offer_id: Optional[str] = Body(None, description="The ID of the offer (optional - if not provided, uses listing price)"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a marketplace payment intent for a user with enhanced security.

    This endpoint supports two modes:
    1. **Buy with Offer**: Provide offer_id to use negotiated price (validates offer is accepted)
    2. **Buy Now**: Omit offer_id to use listing's priceCash

    This endpoint:
    1. Takes a user ID, listing ID, buyer address ID, and optional offer ID
    2. Validates the listing exists and has appropriate pricing
    3. If offer_id provided: validates offer exists, is accepted, and matches listing's highest offer
    4. If offer_id omitted: uses listing's priceCash for direct purchase
    5. Creates a marketplace payment intent using Stripe Connect
    6. Returns the payment intent details including client_secret

    Security features:
    - Offer acceptance validation
    - Automatic amount validation
    - Server-side webhook idempotency protection

    The client_secret can be used on the frontend to complete the payment using Stripe Elements or other Stripe libraries.
    """
    try:
        # Log request for audit trail
        logger.info(f"Marketplace payment request: user={user_id}, listing={listing_id}, offer={offer_id}")
        
        # Get the listing first
        listing_ref = db.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")
        
        listing_data = listing_doc.to_dict()
        
        # If attempting Buy Now (no offer), disallow when listing already accepted
        if not offer_id and listing_data.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="This listing already has an accepted offer")
        
        # Get the amount - either from offer or listing price
        if offer_id:
            # Get amount from offer (negotiated price)
            offer_ref = db.collection('listings').document(listing_id).collection('cash_offers').document(offer_id)
            offer_doc = await offer_ref.get()

            if not offer_doc.exists:
                raise HTTPException(status_code=404, detail=f"Offer with ID {offer_id} not found")

            offer_data = offer_doc.to_dict()

            # Validate offer is accepted
            offer_status = offer_data.get("status")
            if offer_status != "accepted":
                raise HTTPException(
                    status_code=400,
                    detail=f"Offer {offer_id} is not accepted. Current status: {offer_status}"
                )

            # Use the service's dollars_to_cents function for consistency
            from service.payment_service import dollars_to_cents
            amount_cents = dollars_to_cents(offer_data.get('amount', 0))
        else:
            # Get amount from listing price (buy now) - use priceCash field
            price_cash = listing_data.get('priceCash')
            if price_cash is None:
                raise HTTPException(status_code=400, detail="Listing does not have a cash price set")

            # Use the service's dollars_to_cents function for consistency
            from service.payment_service import dollars_to_cents
            amount_cents = dollars_to_cents(price_cash)
        
        # Validate the amount
        await validate_payment_amount(amount_cents, "usd")
        
        # Create marketplace payment intent
        response_dict = await create_marketplace_intent(
            user_id=user_id,
            listing_id=listing_id,
            buyer_address_id=buyer_address_id,
            offer_id=offer_id,
            db_client=db
        )
        
        response = PaymentIntentResponse(
            id=response_dict["id"],
            client_secret=response_dict["client_secret"],
            amount=response_dict["amount"],
            currency=response_dict["currency"],
            status=response_dict["status"]
        )
        
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating marketplace payment intent for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the marketplace payment intent")

@router.post("/stripe/connect", response_model=StripeOnboardingResponse)
async def create_stripe_connect_account_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a Stripe Connect Express account for a seller and generate an onboarding link.

    This endpoint:
    1. Takes a user ID (seller)
    2. Creates a Stripe Connect Express account
    3. Generates an onboarding link for the seller to complete their account setup
    4. Returns the onboarding URL

    If the user already has a Stripe Connect account:
    - If fully onboarded, returns an empty URL
    - If incomplete, returns a new onboarding link
    """
    try:
        result = await create_stripe_connect_account(user_id, db)
        return StripeOnboardingResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating Stripe Connect account for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the Stripe Connect account")


@router.get("/stripe/dashboard", response_model=StripeDashboardLinkResponse)
async def create_stripe_dashboard_link_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a login link for a user's Stripe Express dashboard.

    This endpoint:
    1. Takes a user ID
    2. Checks if the user has a Stripe Connect account
    3. If they do, creates a login link for the Stripe Express dashboard
    4. Returns the login URL
    """
    try:
        result = await create_stripe_dashboard_link(user_id, db)
        return StripeDashboardLinkResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating Stripe dashboard link for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the Stripe dashboard link")


# Payment Method Management Endpoints

@router.post("/payment-methods", response_model=PaymentMethodResponse)
async def attach_payment_method_route(
    request: AttachPaymentMethodRequest = Body(..., description="Payment method attachment details"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Attach a payment method to a user's account.
    
    This endpoint:
    1. Takes a user ID and payment method ID from Stripe
    2. Creates a Stripe customer if user doesn't have one
    3. Attaches the payment method to the customer
    4. Optionally sets it as the default payment method
    5. Returns the payment method details
    """
    try:
        result = await attach_payment_method(
            user_id=user_id,
            payment_method_id=request.payment_method_id,
            set_as_default=request.set_as_default,
            db_client=db
        )
        return PaymentMethodResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error attaching payment method for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while attaching the payment method")

@router.get("/payment-methods", response_model=ListPaymentMethodsResponse)
async def list_payment_methods_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    List all payment methods for a user.
    
    This endpoint:
    1. Takes a user ID
    2. Retrieves all saved payment methods from Stripe
    3. Indicates which is the default payment method
    4. Returns the list of payment methods
    """
    try:
        result = await list_payment_methods(user_id, db)
        return ListPaymentMethodsResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing payment methods for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while listing payment methods")

@router.delete("/payment-methods/{payment_method_id}", response_model=DeletePaymentMethodResponse)
async def delete_payment_method_route(
    payment_method_id: str = Path(..., description="The ID of the payment method to delete"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Delete a payment method from a user's account.
    
    This endpoint:
    1. Takes a user ID and payment method ID
    2. Verifies the payment method belongs to the user
    3. Detaches it from the Stripe customer
    4. Returns success status
    """
    try:
        result = await delete_payment_method(
            user_id=user_id,
            payment_method_id=payment_method_id,
            db_client=db
        )
        return DeletePaymentMethodResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting payment method {payment_method_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while deleting the payment method")

@router.post("/payment-methods/{payment_method_id}/set-default", response_model=SetDefaultPaymentMethodResponse)
async def set_default_payment_method_route(
    payment_method_id: str = Path(..., description="The ID of the payment method to set as default"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Set a payment method as the default for the user.

    This endpoint:
    1. Verifies the payment method belongs to the user
    2. Updates the Stripe customer default payment method
    3. Stores the default in Firestore
    """
    try:
        result = await set_default_payment_method(
            user_id=user_id,
            payment_method_id=payment_method_id,
            db_client=db
        )
        return SetDefaultPaymentMethodResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting default payment method {payment_method_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while setting the default payment method")

@router.get("/payment-status/{payment_intent_id}", response_model=PaymentStatusResponse)
async def check_payment_status_route(
    payment_intent_id: str = Path(..., description="The Stripe payment intent ID"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Check the status of a payment intent and transaction completion.
    
    This endpoint:
    1. Takes a payment intent ID
    2. Retrieves the current status from Stripe
    3. Checks if the associated transaction (recharge or marketplace) was completed
    4. Returns status, payment details, and transaction completion status
    
    Useful for:
    - Checking if a payment succeeded
    - Verifying if points were added (for recharge)
    - Verifying if marketplace transaction completed
    - Debugging payment issues
    - Verifying webhook processing
    """
    try:
        result = await check_payment_status(payment_intent_id, db)
        return PaymentStatusResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking payment status for {payment_intent_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while checking payment status")

@router.post("/payment/create-official-shop-checkout")
async def create_official_shop_checkout_session(
    request: dict = Body(...),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a Stripe checkout session for official shop purchases.
    
    This endpoint:
    1. Takes a list of items (collection_id, card_id, quantity)
    2. Fetches card details and calculates totals
    3. Creates a Stripe checkout session with automatic tax calculation
    4. Returns the session URL and price breakdown
    
    The client should redirect to the session URL to complete payment.
    After payment, Stripe will redirect back to success_url or cancel_url.
    """
    try:
        from service.payment_service import create_official_shop_checkout_session
        
        # Extract items and address_id from request body
        items = request.get('items', [])
        address_id = request.get('address_id')
        
        if not items or not isinstance(items, list):
            raise HTTPException(status_code=400, detail="Items list is required")
        
        if not address_id:
            raise HTTPException(status_code=400, detail="Address ID is required")
        
        result = await create_official_shop_checkout_session(
            user_id=user_id,
            items=items,
            address_id=address_id,
            db_client=db
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating official shop checkout session for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the checkout session")

@router.get("/shop-orders")
async def get_shop_orders(
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all shop orders for the current user with pagination.
    
    This endpoint:
    1. Retrieves shop orders from users/{user_id}/shop_orders subcollection
    2. Supports pagination and sorting
    3. Returns order history with details
    """
    try:
        from datetime import datetime
        
        # Query user's shop_orders subcollection
        user_ref = db.collection('users').document(user_id)
        orders_ref = user_ref.collection('shop_orders')
        
        # Apply sorting
        if sort_order == 'desc':
            orders_query = orders_ref.order_by(sort_by, direction=firestore.Query.DESCENDING)
        else:
            orders_query = orders_ref.order_by(sort_by, direction=firestore.Query.ASCENDING)
        
        # Get total count
        all_orders = await orders_ref.get()
        total_items = len(all_orders)
        total_pages = (total_items + per_page - 1) // per_page
        
        # Apply pagination
        orders_query = orders_query.limit(per_page).offset((page - 1) * per_page)
        orders_docs = await orders_query.get()
        
        # Format orders
        orders = []
        for doc in orders_docs:
            order_data = doc.to_dict()
            order_data['id'] = doc.id
            # Convert datetime to ISO string if needed
            if 'created_at' in order_data and isinstance(order_data['created_at'], datetime):
                order_data['created_at'] = order_data['created_at'].isoformat()
            if 'order_date' in order_data and isinstance(order_data['order_date'], datetime):
                order_data['order_date'] = order_data['order_date'].isoformat()
            orders.append(order_data)
        
        return {
            "shop_orders": orders,
            "pagination": {
                "current_page": page,
                "per_page": per_page,
                "total_pages": total_pages,
                "total_items": total_items
            }
        }
        
    except Exception as e:
        logger.error(f"Error getting shop orders for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving shop orders")

@router.get("/shop-orders/{order_id}")
async def get_shop_order_detail(
    order_id: str,
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get details of a specific shop order.
    
    This endpoint:
    1. Retrieves a specific shop order by ID
    2. Returns full order details including items
    """
    try:
        from datetime import datetime
        
        # Get order from user's subcollection
        user_ref = db.collection('users').document(user_id)
        order_ref = user_ref.collection('shop_orders').document(order_id)
        order_doc = await order_ref.get()
        
        if not order_doc.exists:
            raise HTTPException(status_code=404, detail="Order not found")
        
        order_data = order_doc.to_dict()
        order_data['id'] = order_doc.id
        
        # Convert datetime to ISO string if needed
        if 'created_at' in order_data and isinstance(order_data['created_at'], datetime):
            order_data['created_at'] = order_data['created_at'].isoformat()
        if 'order_date' in order_data and isinstance(order_data['order_date'], datetime):
            order_data['order_date'] = order_data['order_date'].isoformat()
        
        return order_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shop order {order_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the order")

@router.post("/shop-orders/{order_id}/cancel")
async def cancel_shop_order_route(
    order_id: str,
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Cancel a shop order and release the Stripe authorization.
    
    This endpoint:
    1. Verifies the order belongs to the user
    2. Checks the order is in 'authorized' status
    3. Cancels the Stripe PaymentIntent (releases the hold)
    4. Updates order status to 'cancelled'
    5. Restores stock to official_listing
    """
    try:
        from service.payment_service import cancel_shop_order
        
        result = await cancel_shop_order(
            order_id=order_id,
            user_id=user_id,
            db_client=db
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling shop order {order_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while cancelling the order")

@router.get("/stripe/status", response_model=StripeStatusResponse)
async def check_stripe_connect_status_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Check the status of a user's Stripe Connect account.

    This endpoint:
    1. Takes a user ID
    2. Checks if the user has a Stripe Connect account
    3. Returns the account status (not_connected, incomplete, or ready)
    """
    try:
        result = await check_stripe_connect_status(user_id, db)
        return StripeStatusResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking Stripe Connect status for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while checking the Stripe Connect status")



# Webhook endpoint for Stripe events (standard account)
@router.post("/webhook", response_model=WebhookResponse)
async def stripe_webhook_route(
    request: Request,
    stripe_signature: str = Header(..., alias="Stripe-Signature"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Handle Stripe webhook events for standard account payments.

    Security note: This endpoint validates the Stripe signature to ensure
    the webhook is genuinely from Stripe.
    """
    try:
        result = await handle_stripe_webhook(request, stripe_signature, db, webhook_type="standard")
        return WebhookResponse(status=result.get("status", "success"), details=result)
    except HTTPException as e:
        if e.status_code == 500:
            logger.warning(f"Returning 500 to Stripe to trigger a retry: {e.detail}")
        else:
            logger.error(f"HTTP error processing Stripe webhook: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"Error processing Stripe webhook: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the webhook, Stripe should retry"
        )

# Webhook endpoint for Stripe Connect events
@router.post("/webhook/connect", response_model=WebhookResponse)
async def stripe_connect_webhook_route(
    request: Request,
    stripe_signature: str = Header(..., alias="Stripe-Signature"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Handle Stripe webhook events for connected accounts (marketplace payments).

    Security note: This endpoint validates the Stripe signature using the
    connect webhook secret to ensure the webhook is genuinely from Stripe.
    """
    try:
        result = await handle_stripe_webhook(request, stripe_signature, db, webhook_type="connect")
        return WebhookResponse(status=result.get("status", "success"), details=result)
    except HTTPException as e:
        if e.status_code == 500:
            logger.warning(f"Returning 500 to Stripe to trigger a retry: {e.detail}")
        else:
            logger.error(f"HTTP error processing Stripe webhook: {e.detail}")
        raise
    except Exception as e:
        logger.error(f"Error processing Stripe webhook: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail="An error occurred while processing the webhook, Stripe should retry"
        )