from typing import Dict, Any, Optional, Tuple, Union
from fastapi import HTTPException, Request
import stripe
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, async_transactional
import json
import hashlib
from datetime import datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from shippo import Shippo
from shippo.models import components

from config import get_logger, settings, execute_query
from service.card_service import add_card_to_user
from service.account_service import add_points_and_update_cash_recharged, get_user_by_id
from service.marketplace_service import send_item_sold_email
from config.db_connection import test_connection, db_connection
from service.recharge_payment_saga import recharge_payment_saga
from service.shop_email_service import send_shop_order_receipt_email


# Initialize Stripe with the API key from settings
stripe.api_key = settings.stripe_api_key

# Define the points conversion rate (e.g., $1 = 100 points)
POINTS_PER_DOLLAR = 100

logger = get_logger(__name__)

async def get_or_create_stripe_customer(user_id: str, db_client: AsyncClient) -> str:
    """
    Get or create a Stripe customer for a user.
    
    Args:
        user_id: The user's ID
        db_client: Firestore client
        
    Returns:
        Stripe customer ID
    """
    try:
        # Get the user document
        user_ref = db_client.collection("users").document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            
        user_data = user_doc.to_dict()
        
        # Check if user already has a Stripe customer ID
        stripe_customer_id = user_data.get("stripe_customer_id")
        
        if stripe_customer_id:
            # Verify the customer still exists in Stripe
            try:
                stripe.Customer.retrieve(stripe_customer_id)
                return stripe_customer_id
            except stripe.error.StripeError:
                # Customer doesn't exist in Stripe, create a new one
                logger.warning(f"Stripe customer {stripe_customer_id} not found, creating new one")
        
        # Create a new Stripe customer
        email = user_data.get("email")
        name = user_data.get("displayName", user_data.get("name", ""))
        
        if not email:
            raise HTTPException(
                status_code=400,
                detail="User email is required for creating a Stripe customer"
            )
        
        customer = stripe.Customer.create(
            email=email,
            name=name,
            metadata={"user_id": user_id}
        )
        
        # Update user document with Stripe customer ID
        await user_ref.update({
            "stripe_customer_id": customer.id,
            "updatedAt": datetime.now()
        })
        
        logger.info(f"Created Stripe customer {customer.id} for user {user_id}")
        return customer.id
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating customer for user {user_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting/creating Stripe customer for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

def dollars_to_cents(dollar_amount: Union[str, Decimal, float]) -> int:
    """
    Convert dollar amount to cents with proper decimal precision.
    
    Handles string, Decimal, or float input to avoid float precision issues.
    Strings are preferred for exact decimal representation.

    Args:
        dollar_amount: Amount in dollars (e.g., "30.25", Decimal("30.25"), or 30.25)

    Returns:
        Amount in cents as integer (e.g., 3025)
        
    Raises:
        ValueError: If the input cannot be converted to a valid decimal amount
    """
    logger.info(f"dollars_to_cents input: {dollar_amount} (type: {type(dollar_amount)})")

    # Validate input
    if dollar_amount is None:
        raise ValueError("Dollar amount cannot be None")
    
    try:
        # Convert to Decimal for precise arithmetic
        if isinstance(dollar_amount, Decimal):
            decimal_amount = dollar_amount
        elif isinstance(dollar_amount, str):
            # Remove any whitespace and validate the string
            dollar_amount = dollar_amount.strip()
            if not dollar_amount:
                raise ValueError("Dollar amount cannot be empty string")
            decimal_amount = Decimal(dollar_amount)
        else:
            # Handle float or other numeric types
            decimal_amount = Decimal(str(dollar_amount))
            
        logger.info(f"Decimal amount: {decimal_amount}")
        
        # Validate that the amount is non-negative
        if decimal_amount < 0:
            raise ValueError(f"Dollar amount cannot be negative: {decimal_amount}")
        
        # Validate reasonable limits (e.g., max $1 million per transaction)
        if decimal_amount > Decimal('1000000'):
            raise ValueError(f"Dollar amount exceeds maximum limit: {decimal_amount}")

        cents = decimal_amount * 100
        logger.info(f"Cents before quantize: {cents}")

        # Round to nearest cent (should be exact for valid currency amounts)
        result = int(cents.quantize(Decimal('1'), rounding=ROUND_HALF_UP))
        logger.info(f"Final result: {result}")

        return result
        
    except (ValueError, TypeError, OverflowError) as e:
        logger.error(f"Error converting dollar amount to cents: {dollar_amount}, error: {str(e)}")
        raise ValueError(f"Invalid dollar amount: {dollar_amount}. Error: {str(e)}")

# Verify database connection on module load
try:
    if test_connection():
        logger.info("Payment service successfully connected to the database")
    else:
        logger.error("Payment service could not connect to the database")
except Exception as e:
    logger.error(f"Error testing database connection: {str(e)}", exc_info=True)

def ensure_payment_tables_exist():
    """
    Ensure that the necessary database tables for payment processing exist.
    This function should be called during application startup.
    """
    try:
        # Create cash_recharges table if it doesn't exist
        execute_query(
            """
            CREATE TABLE IF NOT EXISTS cash_recharges (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                amount_cash DECIMAL(10, 2) NOT NULL,
                points_granted INTEGER NOT NULL,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            fetch=False
        )
        logger.info("Ensured cash_recharges table exists")

        # Check if transactions table exists, and if not, create it
        # Note: This table might already exist for other transaction types
        execute_query(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id SERIAL PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                type VARCHAR(50) NOT NULL,
                amount_cash DECIMAL(10, 2),
                points_delta INTEGER NOT NULL,
                reference_id VARCHAR(255),
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """,
            fetch=False
        )
        logger.info("Ensured transactions table exists")
        
        # Create payment_idempotency table for preventing duplicate charges
        execute_query(
            """
            CREATE TABLE IF NOT EXISTS payment_idempotency (
                idempotency_key VARCHAR(255) PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                request_hash VARCHAR(64) NOT NULL,
                response_data TEXT,
                status_code INT,
                created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at TIMESTAMP NOT NULL
            )
            """,
            fetch=False
        )
        logger.info("Ensured payment_idempotency table exists")
        
        # Create indexes for performance
        execute_query(
            "CREATE INDEX IF NOT EXISTS idx_payment_idempotency_user_id ON payment_idempotency(user_id)",
            fetch=False
        )
        execute_query(
            "CREATE INDEX IF NOT EXISTS idx_payment_idempotency_expires_at ON payment_idempotency(expires_at)",
            fetch=False
        )
        logger.info("Ensured payment_idempotency indexes exist")

        return True
    except Exception as e:
        logger.error(f"Error ensuring payment tables exist: {str(e)}", exc_info=True)
        return False

async def check_and_store_webhook_idempotency(
    webhook_id: str, 
    request_body: bytes,
    payment_intent_id: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """
    Check if webhook has already been processed using idempotency key.
    
    Args:
        webhook_id: Stripe webhook event ID (primary idempotency key)
        request_body: Raw webhook request body for generating hash
        payment_intent_id: Optional payment intent ID for reference
        
    Returns:
        Existing response data if webhook was already processed, None if new
    """
    try:
        # Create a hash of the request body for additional verification
        request_hash = hashlib.sha256(request_body).hexdigest()
        
        # Check if this webhook has already been processed
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                # Look for existing record
                cursor.execute(
                    """
                    SELECT response_data, status_code, created_at
                    FROM payment_idempotency 
                    WHERE idempotency_key = %s AND request_hash = %s
                    """,
                    (webhook_id, request_hash)
                )
                
                result = cursor.fetchone()
                if result:
                    response_data, status_code, created_at = result
                    logger.info(f"Webhook {webhook_id} already processed at {created_at}")
                    
                    # Return the stored response
                    if response_data:
                        return {
                            "cached": True,
                            "response": json.loads(response_data),
                            "status_code": status_code
                        }
                    else:
                        return {"cached": True, "response": {}, "status_code": status_code}
                
                # Store new idempotency record (we'll update with response later)
                expires_at = datetime.now() + timedelta(hours=24)  # 24 hour expiry
                # Use webhook_id as user_id if payment_intent_id is not provided
                # This maintains backward compatibility with the existing schema
                user_id_value = payment_intent_id if payment_intent_id else webhook_id
                cursor.execute(
                    """
                    INSERT INTO payment_idempotency 
                    (idempotency_key, user_id, request_hash, response_data, status_code, created_at, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (webhook_id, user_id_value, request_hash, None, None, datetime.now(), expires_at)
                )
                conn.commit()
                
                logger.info(f"Created new idempotency record for webhook {webhook_id}")
                return None  # This is a new webhook
                
            except Exception as e:
                conn.rollback()
                logger.error(f"Error checking webhook idempotency: {str(e)}", exc_info=True)
                # If idempotency check fails, proceed with processing to avoid blocking payments
                return None
            finally:
                cursor.close()
                
    except Exception as e:
        logger.error(f"Error in idempotency check: {str(e)}", exc_info=True)
        # If idempotency check fails, proceed with processing
        return None

async def update_webhook_idempotency_response(
    webhook_id: str, 
    response_data: Dict[str, Any], 
    status_code: int
) -> None:
    """
    Update the idempotency record with the response data.
    
    Args:
        webhook_id: Stripe webhook event ID
        response_data: Response data to store
        status_code: HTTP status code
    """
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    UPDATE payment_idempotency 
                    SET response_data = %s, status_code = %s
                    WHERE idempotency_key = %s
                    """,
                    (json.dumps(response_data), status_code, webhook_id)
                )
                conn.commit()
                
                # Clean up expired records while we're here
                cursor.execute(
                    "DELETE FROM payment_idempotency WHERE expires_at < %s",
                    (datetime.now(),)
                )
                conn.commit()
                
                logger.debug(f"Updated idempotency record for webhook {webhook_id}")
                
            except Exception as e:
                conn.rollback()
                logger.error(f"Error updating webhook idempotency: {str(e)}", exc_info=True)
            finally:
                cursor.close()
                
    except Exception as e:
        logger.error(f"Error updating idempotency response: {str(e)}", exc_info=True)

async def create_payment_intent(
    user_id: str,
    amount: int,
    currency: str = "usd",
    metadata: Optional[Dict[str, Any]] = None,
    db_client: AsyncClient = None,
    refer_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a payment intent using Stripe.

    Args:
        user_id: The ID of the user making the payment
        amount: The amount to charge in cents (e.g., 1000 for $10.00)
        currency: The currency to use (default: usd)
        metadata: Additional metadata to attach to the payment intent
        db_client: Firestore client (optional, for future use)
        refer_code: Optional referral code to apply to this payment

    Returns:
        Dict containing the payment intent details including client_secret

    Raises:
        HTTPException: If there's an error creating the payment intent
    """
    try:
        # Validate input parameters
        if not user_id or not user_id.strip():
            raise HTTPException(status_code=400, detail="User ID is required")
        
        # Validate amount is positive and within reasonable limits
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
        
        # Set reasonable limits: minimum $0.50, maximum $100,000
        if amount < 50:  # $0.50 in cents
            raise HTTPException(status_code=400, detail="Payment amount must be at least $0.50")
        
        if amount > 10000000:  # $100,000 in cents
            raise HTTPException(status_code=400, detail="Payment amount exceeds maximum limit of $100,000")
        
        # Validate currency
        if currency not in ["usd", "cad", "eur", "gbp"]:  # Add supported currencies
            raise HTTPException(status_code=400, detail="Unsupported currency")
        
        logger.info(f"Creating payment intent for user {user_id}, amount: {amount} {currency}")
        # Get the user to ensure they exist and have required data
        if db_client:
            user_ref = db_client.collection("users").document(user_id)
            user_doc = await user_ref.get()

            if not user_doc.exists:
                raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            
            # Validate user has email for payment operations
            user_data = user_doc.to_dict()
            email = user_data.get("email")
            if not email or not email.strip():
                raise HTTPException(
                    status_code=400, 
                    detail="User email is required for payment operations"
                )

        # Prepare metadata
        payment_metadata = {"user_id": user_id}
        if metadata:
            payment_metadata.update(metadata)
            
        # Note: Marketplace payment validation is done in create_marketplace_intent
        # This function is also used for regular recharges, so we don't validate here

        # Process referral code if provided
        if refer_code and db_client:
            try:
                # Look up the referral code in the refer_codes collection
                refer_code_ref = db_client.collection('refer_codes').document(refer_code)
                refer_code_doc = await refer_code_ref.get()

                if refer_code_doc.exists:
                    refer_code_data = refer_code_doc.to_dict()
                    referer_id = refer_code_data.get('referer_id')

                    # Add referral information to payment metadata
                    payment_metadata["refer_code"] = refer_code
                    payment_metadata["referer_id"] = referer_id

                    logger.info(f"Applied referral code {refer_code} from user {referer_id} to payment for user {user_id}")
                else:
                    logger.warning(f"Invalid referral code {refer_code} provided for payment by user {user_id}")
            except Exception as e:
                logger.error(f"Error processing referral code {refer_code}: {str(e)}", exc_info=True)
                # Continue with payment even if referral code processing fails

        # Get or create Stripe customer for the user
        customer_id = await get_or_create_stripe_customer(user_id, db_client)
        
        # Create the payment intent with automatic capture
        # This provides immediate payment confirmation and good user experience
        logger.info(f"Creating payment intent for user {user_id} with customer {customer_id}")

        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency=currency,
            customer=customer_id,  # Include the customer ID
            metadata=payment_metadata,
            # Using automatic capture for immediate payment processing
            automatic_payment_methods={
                "enabled": True,
                "allow_redirects": "never"
            },
        )

        logger.info(f"Payment intent created with automatic capture: {payment_intent.id}")

        # Log the payment intent creation
        logger.info(f"Created payment intent {payment_intent.id} for user {user_id} with amount {amount} {currency} (automatic capture)")

        # Return the payment intent details
        return {
            "id": payment_intent.id,
            "client_secret": payment_intent.client_secret,
            "amount": payment_intent.amount,
            "currency": payment_intent.currency,
            "status": payment_intent.status
        }

    except stripe.error.StripeError as e:
        # Handle Stripe-specific errors
        logger.error(f"Stripe error creating payment intent for user {user_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException as e:
        # Re-raise HTTP exceptions
        logger.error(f"HTTP error in create_payment_intent: {e.detail}")
        raise e
    except Exception as e:
        # Handle other exceptions
        logger.error(f"Error in create_payment_intent: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


async def create_marketplace_intent(
    user_id: str,
    listing_id: str,
    buyer_address_id: str,
    offer_id: Optional[str] = None,
    db_client: AsyncClient = None
) -> Dict[str, Any]:
    """
    Create a marketplace payment intent using Stripe Connect.

    Args:
        user_id: The ID of the user making the payment (buyer)
        offer_id: The ID of the offer
        listing_id: The ID of the listing
        buyer_address_id: The ID of the buyer's address
        db_client: Firestore client

    Returns:
        Dict containing the payment intent details including client_secret

    Raises:
        HTTPException: If there's an error creating the payment intent
    """
    try:
        # Validate input parameters
        if not user_id or not user_id.strip():
            raise HTTPException(status_code=400, detail="User ID is required")
        
        if not listing_id or not listing_id.strip():
            raise HTTPException(status_code=400, detail="Listing ID is required")
        
        if not buyer_address_id or not buyer_address_id.strip():
            raise HTTPException(status_code=400, detail="Buyer address ID is required")
        
        logger.info(f"Creating marketplace payment intent for user {user_id}, listing {listing_id}")
        # Get the buyer to ensure they exist
        if not db_client:
            raise HTTPException(status_code=500, detail="Database client is required")

        buyer_ref = db_client.collection("users").document(user_id)
        buyer_doc = await buyer_ref.get()

        if not buyer_doc.exists:
            raise HTTPException(status_code=404, detail=f"Buyer with ID {user_id} not found")

        buyer_data = buyer_doc.to_dict()
        
        # Validate buyer has email for payment operations
        buyer_email = buyer_data.get("email")
        if not buyer_email or not buyer_email.strip():
            raise HTTPException(
                status_code=400, 
                detail="Buyer email is required for payment operations"
            )

        # Get the listing to ensure it exists and to get the seller information
        listing_ref = db_client.collection("listings").document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()
        seller_ref_path = listing_data.get("owner_reference")

        # Get the seller to ensure they exist and to get their Stripe account ID
        # The owner_reference might be just the user ID or a full path
        if seller_ref_path and "/" not in seller_ref_path:
            # If it's just the user ID, prepend the users collection path
            seller_ref_path = f"users/{seller_ref_path}"
        
        seller_ref = db_client.document(seller_ref_path)
        seller_doc = await seller_ref.get()

        if not seller_doc.exists:
            raise HTTPException(status_code=404, detail=f"Seller with path {seller_ref_path} not found")

        seller_data = seller_doc.to_dict()
        stripe_account_id = seller_data.get("stripe_account_id")

        if not stripe_account_id:
            raise HTTPException(status_code=400, detail="Seller does not have a Stripe Connect account")

        # Get the amount - either from offer or listing price
        if offer_id:
            # Check 1: Get amount from offer (negotiated price)
            offer_ref = db_client.collection("listings").document(listing_id).collection("cash_offers").document(offer_id)
            offer_doc = await offer_ref.get()

            if not offer_doc.exists:
                raise HTTPException(status_code=404, detail=f"Offer with ID {offer_id} not found")

            offer_data = offer_doc.to_dict()

            # Check 2: Verify this is the accepted offer
            offer_status = offer_data.get("status")
            if offer_status != "accepted":
                raise HTTPException(
                    status_code=400,
                    detail=f"Offer {offer_id} is not accepted. Current status: {offer_status}"
                )

            # Verify this offer matches the listing's highest offer
            highest_offer_cash = listing_data.get("highestOfferCash", {})
            if highest_offer_cash.get("offerreference") != offer_id:
                raise HTTPException(
                    status_code=400,
                    detail=f"Offer {offer_id} is not the current highest accepted offer for this listing"
                )

            amount = dollars_to_cents(offer_data.get("amount", 0))
            payment_type = "offer_accepted"
            logger.info(f"Using accepted offer {offer_id} with amount ${offer_data.get('amount', 0)}")
        else:
            # Disallow Buy Now when the listing already has an accepted offer
            if listing_data.get("status") == "accepted":
                raise HTTPException(status_code=400, detail="This listing already has an accepted offer")
            # Check 1: Use listing price for direct purchase (buy now)
            price_cash = listing_data.get("priceCash")
            if price_cash is None:
                raise HTTPException(status_code=400, detail="Listing does not have a cash price set")

            logger.info(f"Converting priceCash {price_cash} to cents")
            amount = dollars_to_cents(price_cash)
            payment_type = "buy_now"
            logger.info(f"Using listing price ${price_cash} for direct purchase (amount in cents: {amount})")

        # Validate amount is positive and within reasonable limits
        if amount <= 0:
            raise HTTPException(status_code=400, detail="Payment amount must be greater than 0")
        
        # Set reasonable limits for marketplace transactions: minimum $1.00, maximum $50,000
        if amount < 100:  # $1.00 in cents
            raise HTTPException(status_code=400, detail="Payment amount must be at least $1.00")
        
        if amount > 5000000:  # $50,000 in cents
            raise HTTPException(status_code=400, detail="Payment amount exceeds maximum limit of $50,000")

        # Calculate application fee (platform fee)
        application_fee_percentage = 0.10  # 10% platform fee
        application_fee_amount = int(amount * application_fee_percentage)

        # Prepare metadata
        metadata = {
            "buyer_id": user_id,
            "listing_id": listing_id,
            "payment_type": payment_type
        }
        
        # Only include offer_id if it exists
        if offer_id:
            metadata["offer_id"] = offer_id

        # Get or create Stripe customer for the buyer
        buyer_customer_id = await get_or_create_stripe_customer(user_id, db_client)
        
        # Create the payment intent with automatic capture for marketplace
        # Using destination charges instead of direct charges for simpler frontend integration
        payment_intent = stripe.PaymentIntent.create(
            amount=amount,
            currency="usd",
            customer=buyer_customer_id,  # Now we can use the platform customer
            metadata=metadata,
            # Using destination charges - simpler for frontend
            transfer_data={
                "destination": stripe_account_id,
                "amount": amount - application_fee_amount  # Platform keeps the fee
            },
            # Using automatic capture for immediate payment processing
            automatic_payment_methods={
                "enabled": True,
                "allow_redirects": "never"
            }
        )

        # Log the payment intent creation
        logger.info(f"Created marketplace payment intent {payment_intent.id} for user {user_id} with amount {amount} USD (automatic capture)")

        # Return the payment intent details
        result = {
            "id": payment_intent.id,
            "client_secret": payment_intent.client_secret,
            "amount": payment_intent.amount,
            "currency": payment_intent.currency,
            "status": payment_intent.status,
            "listing_id": listing_id,
            "payment_type": payment_type
        }
        
        # Only include offer_id if it exists
        if offer_id:
            result["offer_id"] = offer_id
            
        return result

    except stripe.error.StripeError as e:
        # Handle Stripe-specific errors
        logger.error(f"Stripe error creating marketplace payment intent: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException as e:
        # Re-raise HTTP exceptions
        logger.error(f"HTTP error in create_marketplace_intent: {e.detail}")
        raise e
    except Exception as e:
        # Handle other exceptions
        logger.error(f"Error in create_marketplace_intent: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")




async def handle_stripe_webhook(request: Request, signature: str, db_client: AsyncClient, webhook_type: str = "standard") -> Dict[str, Any]:
    """
    Handle Stripe webhook events, particularly payment_intent.succeeded.

    Args:
        request: The FastAPI request object containing the webhook payload
        signature: The Stripe signature from the request headers
        db_client: Firestore client

    Returns:
        Dict containing information about the processed webhook

    Raises:
        HTTPException: If there's an error processing the webhook. Status codes:
            - 400: For permanent failures (invalid payload, signature, etc.) - Stripe won't retry
            - 500: For temporary failures (database issues, etc.) - Stripe will retry up to 3 times
    """
    try:
        # Get the request body as bytes
        payload = await request.body()

        # Check if this is a retry from Stripe
        # Stripe adds a Stripe-Signature header with a timestamp and a signature
        # We can check if the signature has a 'retry-count' parameter
        is_retry = False
        if 'retry-count' in signature:
            retry_count = int(signature.split('retry-count=')[1].split(',')[0])
            logger.info(f"Processing a Stripe webhook retry attempt #{retry_count}")
            is_retry = True

        # Verify the webhook signature (skip in development mode)
        if settings.development_mode:
            logger.warning("Development mode: Skipping webhook signature verification")
            try:
                event = json.loads(payload.decode('utf-8'))
            except json.JSONDecodeError as e:
                logger.error(f"Invalid JSON payload in development mode: {str(e)}")
                raise HTTPException(status_code=400, detail="Invalid JSON payload")
        else:
            try:
                # Choose the appropriate webhook secret based on the webhook type
                webhook_secret = settings.stripe_connect_webhook_secret if webhook_type == "connect" else settings.stripe_webhook_secret
                
                event = stripe.Webhook.construct_event(
                    payload, signature, webhook_secret
                )
            except ValueError as e:
                # Invalid payload - this is a permanent failure
                logger.error(f"Invalid Stripe webhook payload: {str(e)}")
                raise HTTPException(status_code=400, detail="Invalid payload")
            except stripe.error.SignatureVerificationError as e:
                # Invalid signature - this is a permanent failure
                logger.error(f"Invalid Stripe webhook signature: {str(e)}")
                raise HTTPException(status_code=400, detail="Invalid signature")

        # Extract webhook ID and payment intent ID for idempotency
        webhook_id = event['id']
        payment_intent_id = None
        if event['type'] == 'payment_intent.succeeded':
            payment_intent_id = event['data']['object']['id']

        # Check idempotency - if this webhook was already processed, return cached response
        cached_response = await check_and_store_webhook_idempotency(
            webhook_id, 
            payload,
            payment_intent_id=payment_intent_id
        )
        
        if cached_response:
            cached_status = cached_response.get("status_code")
            response_data = cached_response.get("response", {})
            
            # Log detailed information about the cached response
            logger.info(f"Found cached response for webhook {webhook_id}")
            logger.info(f"  Event type: {event['type']}")
            if payment_intent_id:
                logger.info(f"  Payment Intent ID: {payment_intent_id}")
            logger.info(f"  Cached status code: {cached_status}")
            logger.info(f"  Cached response type: {type(response_data)}")
            
            # Ensure we have a valid status code
            if cached_status is None:
                logger.warning(f"Cached response for webhook {webhook_id} has no status_code, defaulting to 500")
                cached_status = 500
            
            if cached_status == 200:
                logger.info(f"Returning successful cached response for webhook {webhook_id}")
                return response_data
            else:
                # Get the error detail safely
                if isinstance(response_data, dict):
                    detail = response_data.get("detail", "Cached error response")
                else:
                    detail = "Cached error response"
                
                logger.warning(f"Returning cached error response for webhook {webhook_id}: {detail}")
                
                # Return the original error response with validated status code
                raise HTTPException(
                    status_code=int(cached_status),  # Ensure it's an integer
                    detail=detail
                )

        # Log webhook event details
        logger.info(f"Received Stripe webhook event: {event['type']}, ID: {event['id']}")

        # Handle the event
        response_data = {}
        status_code = 200
        
        try:
            if event['type'] == 'payment_intent.succeeded':
                # Handle automatically captured payments
                # If this is a retry, log it
                if is_retry:
                    logger.info(f"Processing a retry for payment_intent.succeeded event. ID: {event['id']}")

                payment_intent = event['data']['object']
                logger.info(f"Processing successful payment {payment_intent['id']} - executing business logic")

                response_data = await handle_payment_succeeded(payment_intent, db_client)
            
            elif event['type'] == 'checkout.session.completed':
                # Handle checkout session completion (for manual capture/authorized payments)
                # If this is a retry, log it
                if is_retry:
                    logger.info(f"Processing a retry for checkout.session.completed event. ID: {event['id']}")

                session = event['data']['object']
                logger.info(f"Processing completed checkout session {session['id']}")
                
                # Get the payment intent from the session
                payment_intent_id = session.get('payment_intent')
                if payment_intent_id:
                    # Retrieve the full payment intent details
                    payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
                    logger.info(f"Retrieved payment intent {payment_intent_id} with status {payment_intent.status}")
                    
                    # Handle the payment based on its status
                    if payment_intent.status == 'requires_capture':
                        # Manual capture payment - create order in authorized state
                        logger.info(f"Processing authorized payment {payment_intent.id} - executing business logic")
                        response_data = await handle_payment_succeeded(payment_intent, db_client)
                    elif payment_intent.status == 'succeeded':
                        # Already captured payment - handle normally
                        logger.info(f"Processing succeeded payment {payment_intent.id} - executing business logic")
                        response_data = await handle_payment_succeeded(payment_intent, db_client)
                    else:
                        logger.warning(f"Payment intent {payment_intent.id} has unexpected status: {payment_intent.status}")
                        response_data = {"status": "ignored", "reason": f"Unexpected payment status: {payment_intent.status}"}
                else:
                    logger.error(f"Checkout session {session['id']} has no payment_intent")
                    response_data = {"status": "error", "reason": "No payment_intent in session"}
            
            else:
                # Unhandled event type - this is not an error, just an event we don't process
                logger.info(f"Unhandled event type: {event['type']}")
                response_data = {"status": "ignored", "type": event['type']}
            
            # Store successful response in idempotency table
            await update_webhook_idempotency_response(webhook_id, response_data, status_code)
            
            return response_data
            
        except HTTPException as http_err:
            # Store error response in idempotency table
            error_response = {"detail": http_err.detail}
            await update_webhook_idempotency_response(webhook_id, error_response, http_err.status_code)
            raise http_err
        except Exception as e:
            # Store error response in idempotency table
            error_response = {"detail": f"An unexpected error occurred: {str(e)}"}
            await update_webhook_idempotency_response(webhook_id, error_response, 500)
            raise e

    except HTTPException:
        # Re-raise HTTP exceptions to be handled by the route handler
        raise
    except Exception as e:
        logger.error(f"Error handling Stripe webhook: {str(e)}", exc_info=True)
        # Return 500 to trigger a Stripe retry
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred, Stripe should retry this webhook: {str(e)}"
        )


async def create_stripe_connect_account(user_id: str, db_client: AsyncClient) -> Dict[str, str]:
    """
    Create a Stripe Connect Express account for a seller and generate an onboarding link.

    Args:
        user_id: The ID of the user (seller)
        db_client: Firestore client

    Returns:
        Dict containing the onboarding URL

    Raises:
        HTTPException: If there's an error creating the account or generating the link
    """
    try:
        # Validate user_id by checking if user exists in Firestore
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            logger.error(f"User with ID {user_id} not found when creating Stripe Connect account")
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()

        # Check if user already has a Stripe Connect account
        if user_data.get("stripe_account_id"):
            # If the user already has an account, retrieve it to check its status
            try:
                account = stripe.Account.retrieve(user_data["stripe_account_id"])

                # If the account exists and is not rejected, create a new account link
                if account.get("charges_enabled") and account.get("payouts_enabled"):
                    logger.info(f"User {user_id} already has a fully onboarded Stripe Connect account")
                    return {"onboarding_url": ""}  # Return empty URL for fully onboarded accounts

                # Create a new account link for incomplete accounts
                stripe_complete_url = getattr(settings, 'stripe_complete_url', 'https://zapull.fun/stripe/complete')
                account_link = stripe.AccountLink.create(
                    account=user_data["stripe_account_id"],
                    type="account_onboarding",
                    refresh_url=stripe_complete_url,
                    return_url=stripe_complete_url
                )

                logger.info(f"Created new onboarding link for existing Stripe Connect account for user {user_id}")
                return {"onboarding_url": account_link.url}

            except stripe.error.StripeError as e:
                # If the account doesn't exist anymore or there's another issue, create a new one
                logger.warning(f"Error retrieving Stripe account for user {user_id}: {str(e)}")
                # Continue to create a new account

        # Create a new Stripe Connect Express account
        account = stripe.Account.create(
            type="express",
            country="US",
            capabilities={"card_payments": {"requested": True},"transfers": {"requested": True}},
            metadata={"user_id": user_id}
        )

        logger.info(f"Created Stripe Connect account {account.id} for user {user_id}")

        # Save the account ID to the user's document in Firestore
        await user_ref.update({"stripe_account_id": account.id})

        # Create an account link for onboarding
        stripe_complete_url = getattr(settings, 'stripe_complete_url', 'https://zapull.fun/stripe/complete')
        account_link = stripe.AccountLink.create(
            account=account.id,
            type="account_onboarding",
            refresh_url=stripe_complete_url,
            return_url=stripe_complete_url
        )

        logger.info(f"Created onboarding link for Stripe Connect account for user {user_id}")

        return {"onboarding_url": account_link.url}

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error creating Connect account for user {user_id}: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error creating Stripe Connect account for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

async def check_stripe_tax_enabled(user_id: str, db_client: AsyncClient) -> Dict[str, bool]:
    """
    Check if automatic tax is enabled for a user's Stripe Connect account.

    Args:
        user_id: The ID of the user (seller)
        db_client: Firestore client

    Returns:
        Dict containing whether automatic tax is enabled for the Stripe account

    Raises:
        HTTPException: If there's an error checking the tax status
    """
    try:
        user_ref = db_client.collection("users").document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="User not found")

        user_data = user_doc.to_dict()
        stripe_account_id = user_data.get("stripe_account_id")

        if not stripe_account_id:
            raise HTTPException(status_code=400, detail="User does not have a Stripe Connect account")

        try:
            account = stripe.Account.retrieve(stripe_account_id)
            tax_settings = account.get("settings", {}).get("tax", {})
            automatic_tax_enabled = tax_settings.get("automatic_tax", {}).get("enabled", False)

            # Optionally update the user document with the tax status
            if automatic_tax_enabled:
                await user_ref.update({"stripe_tax_enabled": True})

            return {
                "stripe_tax_enabled": automatic_tax_enabled
            }
        except stripe.error.StripeError as e:
            raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error checking Stripe tax status for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

async def create_stripe_dashboard_link(user_id: str, db_client: AsyncClient) -> Dict[str, str]:
    """
    Create a login link for a user's Stripe Express dashboard.

    Args:
        user_id: The ID of the user (seller)
        db_client: Firestore client

    Returns:
        Dict containing the login URL for the Stripe Express dashboard

    Raises:
        HTTPException: If there's an error creating the login link
    """
    try:
        user_ref = db_client.collection("users").document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="User not found")

        user_data = user_doc.to_dict()
        stripe_account_id = user_data.get("stripe_account_id")

        if not stripe_account_id:
            raise HTTPException(status_code=400, detail="User does not have a Stripe Connect account")

        try:
            # Create a login link for the Stripe Express dashboard
            login_link = stripe.Account.create_login_link(stripe_account_id)

            return {
                "login_url": login_link.url
            }
        except stripe.error.StripeError as e:
            raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error creating Stripe dashboard link for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

async def handle_marketplace_payment(
    payment_id: str,
    amount: int,
    amount_dollars: float,
    currency: str,
    listing_id: str,
    buyer_id: str,
    offer_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Handle a successful marketplace payment intent event.
    This is similar to pay_point_offer but for cash payments.

    Args:
        payment_id: The payment intent ID from Stripe
        amount: The amount in cents
        amount_dollars: The amount in dollars
        currency: The currency code
        listing_id: The ID of the listing
        buyer_id: The ID of the buyer
        offer_id: The ID of the offer
        db_client: Firestore client

    Returns:
        Dict containing information about the processed payment

    Raises:
        HTTPException: If there's an error processing the payment
    """
    try:
        logger.info(f"Processing marketplace payment for listing {listing_id}, buyer {buyer_id}, offer {offer_id}")

        # 1. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 2. Get the seller information
        seller_ref_path = listing_data.get("owner_reference", "")
        if not seller_ref_path:
            raise HTTPException(status_code=500, detail="Invalid listing data: missing owner reference")

        seller_id = seller_ref_path.split('/')[-1]

        # 3. Get card information
        card_reference = listing_data.get("card_reference", "")
        collection_id = listing_data.get("collection_id", "")

        if not card_reference or not collection_id:
            raise HTTPException(status_code=500, detail="Invalid listing data: missing card reference or collection ID")

        # 4. Get the quantity to deduct from the listing
        quantity_to_deduct = 1  # Default to 1

        # 5. Create a transaction ID
        transaction_id = f"tx_{listing_id}_{offer_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        # Get all point offers for this listing
        point_offers_ref = listing_ref.collection('point_offers')
        point_offers = await point_offers_ref.get()

        # Get all cash offers for this listing
        cash_offers_ref = listing_ref.collection('cash_offers')
        cash_offers = await cash_offers_ref.get()

        # 6. Execute the transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Update buyer and seller deal counts
            buyer_ref = db_client.collection('users').document(buyer_id)
            tx.update(buyer_ref, {
                "buy_deal": firestore.Increment(1)
            })

            seller_ref = db_client.document(seller_ref_path)
            tx.update(seller_ref, {
                "sell_deal": firestore.Increment(1)
            })

            # Delete the offer from the listing's cash_offers collection
            if offer_id:
                offer_ref = listing_ref.collection('cash_offers').document(offer_id)
                tx.delete(offer_ref)

                # e. Delete the user's offer from their my_cash_offers collection if it exists
                try:
                    buyer_ref = db_client.collection('users').document(buyer_id)
                    my_cash_offers_ref = buyer_ref.collection('my_cash_offers')
                    my_cash_offers_query = my_cash_offers_ref.where("listingId", "==", listing_id)
                    my_cash_offers_docs = await my_cash_offers_query.get()

                    for doc in my_cash_offers_docs:
                        my_offer_data = doc.to_dict()
                        # Check if this is the same offer by comparing offerreference
                        if my_offer_data.get("offerreference") == offer_id:
                            tx.delete(doc.reference)
                            break
                except Exception as e:
                    logger.error(f"Error deleting user's offer: {e}", exc_info=True)
                    # Continue with the transaction even if deleting the user's offer fails

            # a. Update the listing quantity
            current_quantity = listing_data.get("quantity", 0)
            new_quantity = current_quantity - quantity_to_deduct

            if new_quantity <= 0:
                # Delete all point offers for this listing
                for offer in point_offers:
                    tx.delete(point_offers_ref.document(offer.id))

                # Delete all cash offers for this listing
                for offer in cash_offers:
                    # We've already deleted the current offer above, so we can skip it here
                    if offer_id and offer.id == offer_id:
                        continue
                    tx.delete(cash_offers_ref.document(offer.id))

                # Delete the listing if quantity becomes zero
                tx.delete(listing_ref)
            else:
                # Update the listing quantity
                tx.update(listing_ref, {
                    "quantity": new_quantity
                })

            # b. Deduct locked_quantity from the seller's card
            try:
                # Parse card_reference to get card_id
                card_id = card_reference.split('/')[-1]

                # Get reference to the seller's card
                seller_ref = db_client.document(seller_ref_path)
                seller_card_ref = seller_ref.collection('cards').document('cards').collection(collection_id).document(card_id)

                # Get the seller's card to check current values
                seller_card_doc = await seller_card_ref.get()

                if seller_card_doc.exists:
                    seller_card_data = seller_card_doc.to_dict()
                    current_locked_quantity = seller_card_data.get('locked_quantity', 0)
                    current_card_quantity = seller_card_data.get('quantity', 0)

                    # Ensure we don't go below zero for locked_quantity
                    new_locked_quantity = max(0, current_locked_quantity - quantity_to_deduct)

                    # Check if both quantity and locked_quantity will be zero
                    if current_card_quantity == 0 and new_locked_quantity == 0:
                        # Delete the card from the seller's collection
                        tx.delete(seller_card_ref)
                        logger.info(f"Deleted card {card_id} from seller {seller_id}'s collection as both quantity and locked_quantity are zero")
                    else:
                        # Update the card with decremented locked_quantity
                        tx.update(seller_card_ref, {
                            'locked_quantity': new_locked_quantity
                        })
                        logger.info(f"Updated locked_quantity for card {card_id} in seller {seller_id}'s collection to {new_locked_quantity}")
            except Exception as e:
                logger.error(f"Error updating seller's card: {e}", exc_info=True)
                # Continue with the transaction even if updating the seller's card fails
                # This ensures the main transaction still completes

            # c. Create a marketplace transaction record
            transaction_ref = db_client.collection('marketplace_transactions').document(transaction_id)
            transaction_data = {
                "id": transaction_id,
                "listing_id": listing_id,
                "seller_id": seller_id,
                "buyer_id": buyer_id,
                "card_id": card_reference.split('/')[-1],
                "quantity": quantity_to_deduct,
                "price_points": None,
                "price_cash": amount_dollars,
                "price_card_id": None,
                "price_card_qty": None,
                "traded_at": datetime.now()
            }
            tx.set(transaction_ref, transaction_data)

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 7. Insert data into the marketplace_transactions SQL table
        # Use a single database connection for the SQL operation to ensure transaction integrity
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                # Begin transaction
                conn.autocommit = False

                # Record the transaction in marketplace_transactions table
                cursor.execute(
                    """
                    INSERT INTO marketplace_transactions (listing_id, seller_id, buyer_id, card_id, quantity, price_points, price_cash, price_card_id, price_card_qty, traded_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (listing_id, seller_id, buyer_id, card_reference, quantity_to_deduct, None, int(amount_dollars), None, None, datetime.now())
                )
                sql_transaction_id = cursor.fetchone()[0]
                logger.info(f"Created marketplace transaction record with ID {sql_transaction_id}")

                # Commit the transaction
                conn.commit()
                logger.info(f"Successfully committed SQL database transaction for marketplace transaction {transaction_id}")
                logger.info(f"Recorded marketplace transaction: listing {listing_id}, seller {seller_id}, buyer {buyer_id}, cash {amount_dollars}")

            except Exception as e:
                # Rollback on error
                conn.rollback()
                logger.error(f"SQL database transaction failed, rolling back: {str(e)}", exc_info=True)
                # Continue with the response - we've already completed the Firestore transaction,
                # so we don't want to fail the whole operation just because of a database issue
                logger.warning("SQL database transaction failed but Firestore transaction was successful")

            finally:
                # Close cursor (connection will be closed by context manager)
                cursor.close()

        # 8. Add the card to the user's collection
        try:
            await add_card_to_user(
                user_id=buyer_id,
                card_reference=card_reference,
                db_client=db_client,
                collection_metadata_id=collection_id,
                from_market_place = True,
            )
        except Exception as e:
            logger.error(f"Error adding card to user {buyer_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Transaction completed but failed to add card to user: {str(e)}")

        # 9. Send email notification to the seller
        try:
            # Get the seller's user details
            seller = await get_user_by_id(seller_id, db_client)

            # Get the buyer's user details
            buyer = await get_user_by_id(buyer_id, db_client)

            if seller and seller.email:
                # Send the email notification
                await send_item_sold_email(
                    to_email=seller.email,
                    to_name=seller.displayName or "Seller",
                    listing_data=listing_data,
                    offer_type="cash",
                    offer_amount=amount_dollars,
                    buyer_name=(buyer.displayName if buyer and buyer.displayName else "a user")
                )
                logger.info(f"Sent item sold email to {seller.email}")
            else:
                logger.warning(f"Could not send email notification: Seller {seller_id} not found or has no email")
        except Exception as e:
            # Log the error but don't fail the whole operation if email sending fails
            logger.error(f"Error sending item sold email: {e}", exc_info=True)

        logger.info(f"Successfully processed marketplace payment for listing {listing_id}, buyer {buyer_id}, offer {offer_id}")
        return {
            "status": "success",
            "payment_id": payment_id,
            "transaction_id": transaction_id,
            "listing_id": listing_id,
            "offer_id": offer_id,
            "buyer_id": buyer_id,
            "seller_id": seller_id,
            "amount": amount,
            "currency": currency
        }

    except HTTPException as e:
        # Re-raise HTTP exceptions to be handled by the FastAPI exception handler
        raise
    except Exception as e:
        logger.error(f"Error handling marketplace payment: {str(e)}", exc_info=True)
        # Return a 500 status code which will cause Stripe to retry the webhook
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred, Stripe should retry this webhook: {str(e)}"
        )

async def handle_official_shop_purchase(
    payment_id: str,
    user_id: str,
    amount: int,
    amount_dollars: float,
    metadata: Dict[str, Any],
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Handle a successful official shop purchase payment.
    
    Args:
        payment_id: The payment intent ID from Stripe
        user_id: The ID of the user making the purchase
        amount: The amount in cents
        amount_dollars: The amount in dollars
        metadata: Payment metadata containing items, address_id, shipping info
        db_client: Firestore client
        
    Returns:
        Dict containing information about the processed purchase
        
    Raises:
        HTTPException: If there's an error processing the purchase
    """
    try:
        import ast
        
        logger.info(f"Processing official shop purchase for payment {payment_id}, user {user_id}")
        
        # Parse items from metadata
        items_str = metadata.get('items', '[]')
        try:
            items = ast.literal_eval(items_str)
        except Exception as e:
            logger.error(f"Failed to parse items from metadata: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Invalid items format in payment metadata: {str(e)}"
            )
        
        if not items or not isinstance(items, list):
            raise HTTPException(
                status_code=400,
                detail="No items found in payment metadata"
            )
        
        address_id = metadata.get('address_id')
        shipping_cost_cents = int(metadata.get('shipping_cost_cents', 0))
        shippo_rate_id = metadata.get('shippo_rate_id', '')
        
        logger.info(f"Processing {len(items)} items for user {user_id}")
        
        # Track cards added for response
        cards_added = []
        
        # Process each item
        for item in items:
            collection_id = item.get('collection_id')
            card_id = item.get('card_id')
            quantity = item.get('quantity', 1)
            
            if not collection_id or not card_id:
                logger.error(f"Invalid item in purchase: {item}")
                continue
            
            # Get card from official listing
            card_ref = db_client.collection('official_listing').document(collection_id).collection('cards').document(card_id)
            card_doc = await card_ref.get()
            
            if not card_doc.exists:
                logger.error(f"Card {card_id} not found in official listing {collection_id}")
                raise HTTPException(
                    status_code=404,
                    detail=f"Card {card_id} not found in collection {collection_id}"
                )
            
            card_data = card_doc.to_dict()
            card_reference = card_data.get('card_reference')
            
            if not card_reference:
                logger.error(f"Card {card_id} has no card_reference field")
                raise HTTPException(
                    status_code=500,
                    detail=f"Invalid card data: missing card_reference"
                )
            
            # Reduce stock in official_listing
            current_quantity = card_data.get('quantity', 0)
            new_quantity = current_quantity - quantity
            
            if new_quantity < 0:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for card {card_id}"
                )
            
            # Update or delete the listing based on remaining quantity
            if new_quantity == 0:
                await card_ref.delete()
                logger.info(f"Deleted card {card_id} from official listing (quantity reached 0)")
            else:
                await card_ref.update({'quantity': new_quantity})
                logger.info(f"Updated card {card_id} quantity from {current_quantity} to {new_quantity}")
            
            # Update quantity_in_offical_marketplace on the original card
            # Parse card_reference to get the path (e.g., "pokemon/card-id")
            card_ref_parts = card_reference.split('/')
            if len(card_ref_parts) == 2:
                ref_collection = card_ref_parts[0]
                ref_card_id = card_ref_parts[1]
                
                # Get reference to the card in the main collection
                main_card_ref = db_client.collection(ref_collection).document(ref_card_id)
                main_card_doc = await main_card_ref.get()
                
                if main_card_doc.exists:
                    main_card_data = main_card_doc.to_dict()
                    current_marketplace_qty = main_card_data.get('quantity_in_offical_marketplace', 0)
                    new_marketplace_qty = max(0, current_marketplace_qty - quantity)
                    
                    await main_card_ref.update({
                        'quantity_in_offical_marketplace': new_marketplace_qty
                    })
                    logger.info(f"Updated quantity_in_offical_marketplace for {card_reference} from {current_marketplace_qty} to {new_marketplace_qty}")
            
            # Track cards for order record
            cards_added.append({
                'card_id': card_id,
                'collection_id': collection_id,
                'card_reference': card_reference,
                'card_name': card_data.get('card_name', ''),
                'quantity': quantity,
                'image_url': card_data.get('image_url', ''),
                'rarity': card_data.get('rarity', 1),
                'point_worth': card_data.get('point_worth', 0),
                'type': card_data.get('type', 'card'),
                'price': card_data.get('priceCash', 0)
            })
        
        # Get user data for order records
        user_ref = db_client.collection('users').document(user_id)
        user_doc = await user_ref.get()
        user_data = user_doc.to_dict() if user_doc.exists else {}
        addresses = user_data.get('addresses', [])
        
        shipping_address = None
        for addr in addresses:
            if addr.get('id') == address_id:
                shipping_address = addr
                break
        
        # Create a unique order ID
        order_id = f"order_{user_id}_{datetime.now().strftime('%Y%m%d%H%M%S%f')[:17]}"
        
        # Calculate totals
        total_cards = sum(card['quantity'] for card in cards_added)
        subtotal = sum(card['price'] * card['quantity'] for card in cards_added)
        shipping_cost_dollars = shipping_cost_cents / 100.0
        tax_amount = amount_dollars - subtotal - shipping_cost_dollars
        
        # Prepare common order data
        order_data = {
            'order_id': order_id,
            'payment_id': payment_id,
            'user_id': user_id,
            'user_email': user_data.get('email', ''),
            'purchase_type': 'official_shop',
            'status': 'authorized',  # Payment is authorized but not captured yet
            'payment_status': 'authorized',  # Explicit payment status
            'shipping_status': 'pending',
            'created_at': datetime.now(),
            'order_date': datetime.now(),
            'subtotal': subtotal,
            'shipping_cost': shipping_cost_dollars,
            'tax_amount': tax_amount,
            'amount_paid': amount_dollars,
            'currency': 'usd',
            'card_count': total_cards,
            'items_count': len(items),
            'shipping_address': shipping_address,
            'shippo_rate_id': shippo_rate_id,
            'total_weight_grams': int(metadata.get('total_weight_grams', 0)),
            'parcel_length': metadata.get('parcel_length', '6'),
            'parcel_width': metadata.get('parcel_width', '4'),
            'parcel_height': metadata.get('parcel_height', '1'),
            'parcel_weight_oz': metadata.get('parcel_weight_oz', '1'),
            'cards': cards_added
        }
        
        # 1. Create record in user's shop_orders subcollection
        try:
            user_shop_order_ref = user_ref.collection('shop_orders').document(order_id)
            await user_shop_order_ref.set(order_data)
            logger.info(f"Created shop order {order_id} in user {user_id}'s subcollection")
        except Exception as e:
            logger.error(f"Error creating user shop order record: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create order record: {str(e)}"
            )
        
        # 2. Create record in global shop_orders collection (Cloud Function will process from here)
        try:
            global_shop_order_ref = db_client.collection('shop_orders').document(order_id)
            await global_shop_order_ref.set(order_data)
            logger.info(f"Created shop order {order_id} in global shop_orders collection for Cloud Function processing")
        except Exception as e:
            logger.error(f"Error creating global shop order record: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to create shop order record: {str(e)}"
            )
        
        logger.info(f"Successfully processed official shop purchase {payment_id}: Order {order_id} created with {total_cards} cards for user {user_id}")
        
        # 3. Send order receipt email to the user
        try:
            user_email = user_data.get('email')
            user_name = user_data.get('displayName', 'Customer')
            if user_email:
                await send_shop_order_receipt_email(
                    to_email=user_email,
                    to_name=user_name,
                    order_id=order_id,
                    order_data=order_data,
                    cards_added=cards_added
                )
                logger.info(f"Sent order receipt email to {user_email}")
            else:
                logger.warning(f"User {user_id} has no email address")
        except Exception as e:
            # Log the error but don't fail the whole operation if email sending fails
            logger.error(f"Error sending order receipt email: {e}", exc_info=True)
        
        return {
            "status": "success",
            "payment_id": payment_id,
            "order_id": order_id,
            "user_id": user_id,
            "amount": amount,
            "amount_dollars": amount_dollars,
            "subtotal": subtotal,
            "shipping_cost_cents": shipping_cost_cents,
            "shipping_cost": shipping_cost_dollars,
            "tax_amount": tax_amount,
            "items_count": len(items),
            "cards_ordered": total_cards,
            "address_id": address_id,
            "shippo_rate_id": shippo_rate_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error handling official shop purchase: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred processing the purchase: {str(e)}"
        )

async def cancel_shop_order(
    order_id: str,
    user_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Cancel a shop order and release the Stripe authorization.
    
    Args:
        order_id: The order ID
        user_id: The user ID (for verification)
        db_client: Firestore client
        
    Returns:
        Dict containing cancellation status
        
    Raises:
        HTTPException: If there's an error cancelling the order
    """
    try:
        logger.info(f"Cancelling shop order {order_id} for user {user_id}")
        
        # Get order from user's subcollection
        user_ref = db_client.collection('users').document(user_id)
        order_ref = user_ref.collection('shop_orders').document(order_id)
        order_doc = await order_ref.get()
        
        if not order_doc.exists:
            raise HTTPException(
                status_code=404,
                detail="Order not found"
            )
        
        order_data = order_doc.to_dict()
        
        # Verify order belongs to user
        if order_data.get('user_id') != user_id:
            raise HTTPException(
                status_code=403,
                detail="You don't have permission to cancel this order"
            )
        
        # Check if order can be cancelled
        payment_status = order_data.get('payment_status', '')
        if payment_status != 'authorized':
            raise HTTPException(
                status_code=400,
                detail=f"Order cannot be cancelled. Current status: {payment_status}"
            )
        
        payment_id = order_data.get('payment_id')
        if not payment_id:
            raise HTTPException(
                status_code=400,
                detail="Order has no payment_id"
            )
        
        # Cancel the Stripe PaymentIntent
        try:
            payment_intent = stripe.PaymentIntent.cancel(payment_id)
            logger.info(f"Cancelled Stripe PaymentIntent {payment_id}")
        except stripe.error.StripeError as e:
            logger.error(f"Stripe error cancelling payment {payment_id}: {e}")
            raise HTTPException(
                status_code=400,
                detail=f"Failed to cancel payment: {str(e)}"
            )
        
        # Restore stock to official_listing
        cards = order_data.get('cards', [])
        for card_item in cards:
            collection_id = card_item.get('collection_id')
            card_id = card_item.get('card_id')
            quantity = card_item.get('quantity', 1)
            
            if not collection_id or not card_id:
                logger.warning(f"Skipping card restoration - missing collection_id or card_id: {card_item}")
                continue
            
            try:
                # Get the card from official_listing
                card_ref = db_client.collection('official_listing').document(collection_id).collection('cards').document(card_id)
                card_doc = await card_ref.get()
                
                if card_doc.exists:
                    # Card still exists in listing, just increment quantity
                    current_quantity = card_doc.to_dict().get('quantity', 0)
                    await card_ref.update({'quantity': current_quantity + quantity})
                    logger.info(f"Restored {quantity} units to card {card_id} in official listing")
                else:
                    # Card was removed from listing, recreate it
                    card_reference = card_item.get('card_reference')
                    if card_reference:
                        # Get original card data
                        ref_parts = card_reference.split('/')
                        if len(ref_parts) == 2:
                            ref_collection, ref_card_id = ref_parts
                            main_card_ref = db_client.collection(ref_collection).document(ref_card_id)
                            main_card_doc = await main_card_ref.get()
                            
                            if main_card_doc.exists:
                                main_card_data = main_card_doc.to_dict()
                                # Recreate the listing
                                listing_data = {
                                    'card_name': card_item.get('card_name', ''),
                                    'card_reference': card_reference,
                                    'collection_id': collection_id,
                                    'image_url': card_item.get('image_url', ''),
                                    'priceCash': card_item.get('price', 0),
                                    'type': card_item.get('type', 'card'),
                                    'quantity': quantity,
                                    'rarity': card_item.get('rarity', 1),
                                    'point_worth': card_item.get('point_worth', 0),
                                    'condition': main_card_data.get('condition', 'near_mint'),
                                    'date_got_in_stock': main_card_data.get('date_got_in_stock', ''),
                                    'used_in_fusion': main_card_data.get('used_in_fusion', [])
                                }
                                await card_ref.set(listing_data)
                                logger.info(f"Recreated listing for card {card_id} with quantity {quantity}")
                
                # Update quantity_in_offical_marketplace on original card
                card_reference = card_item.get('card_reference')
                if card_reference:
                    ref_parts = card_reference.split('/')
                    if len(ref_parts) == 2:
                        ref_collection, ref_card_id = ref_parts
                        main_card_ref = db_client.collection(ref_collection).document(ref_card_id)
                        main_card_doc = await main_card_ref.get()
                        
                        if main_card_doc.exists:
                            main_card_data = main_card_doc.to_dict()
                            current_marketplace_qty = main_card_data.get('quantity_in_offical_marketplace', 0)
                            await main_card_ref.update({
                                'quantity_in_offical_marketplace': current_marketplace_qty + quantity
                            })
                            logger.info(f"Restored {quantity} to quantity_in_offical_marketplace for {card_reference}")
                            
            except Exception as e:
                logger.error(f"Error restoring stock for card {card_id}: {e}", exc_info=True)
                # Continue with cancellation even if stock restoration fails
        
        # Delete order from both collections (cancelled orders should not be in history)
        # Delete from user's order subcollection
        await order_ref.delete()
        logger.info(f"Deleted shop order {order_id} from user {user_id}'s subcollection")
        
        # Delete from global shop_orders collection
        global_order_ref = db_client.collection('shop_orders').document(order_id)
        global_order_doc = await global_order_ref.get()
        if global_order_doc.exists:
            await global_order_ref.delete()
            logger.info(f"Deleted shop order {order_id} from global shop_orders collection")
        
        logger.info(f"Successfully cancelled and deleted shop order {order_id} for user {user_id}")
        
        return {
            "status": "success",
            "order_id": order_id,
            "message": "Order cancelled successfully. Payment authorization has been released."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error handling official shop purchase: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred processing the purchase: {str(e)}"
        )

async def update_tax_user_consent(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Update a user's tax consent status to true.

    Args:
        user_id: The ID of the user
        db_client: Firestore client

    Returns:
        Dict containing success status and user ID

    Raises:
        HTTPException: If there's an error updating the user's tax consent
    """
    try:
        user_ref = db_client.collection("users").document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail="User not found")

        # Update the user document with tax_user_consented=True
        await user_ref.update({"tax_user_consented": True})

        logger.info(f"Updated tax consent for user {user_id}")

        return {
            "success": True,
            "user_id": user_id
        }
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error updating tax consent for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

async def get_or_create_stripe_customer(user_id: str, db_client: AsyncClient) -> str:
    """
    Get or create a Stripe customer for a user.
    
    Args:
        user_id: The ID of the user
        db_client: Firestore client
    
    Returns:
        Stripe customer ID
    
    Raises:
        HTTPException: If there's an error creating/retrieving the customer
    """
    try:
        # Get user from Firestore
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        user_data = user_doc.to_dict()
        
        # Check if user already has a Stripe customer ID
        stripe_customer_id = user_data.get("stripe_customer_id")
        
        if stripe_customer_id:
            # Verify the customer still exists in Stripe
            try:
                stripe.Customer.retrieve(stripe_customer_id)
                return stripe_customer_id
            except stripe.error.StripeError:
                # Customer doesn't exist anymore, create a new one
                logger.warning(f"Stripe customer {stripe_customer_id} not found, creating new one")
        
        # Validate required user data
        email = user_data.get("email")
        if not email or not email.strip():
            raise HTTPException(
                status_code=400, 
                detail="User email is required for payment operations"
            )
        
        # Create new Stripe customer with validated data
        customer_data = {
            "metadata": {"user_id": user_id},
            "email": email.strip()
        }
        
        # Only add name if it exists and is not empty  
        display_name = user_data.get("displayName")
        if display_name and display_name.strip():
            customer_data["name"] = display_name.strip()
        
        customer = stripe.Customer.create(**customer_data)
        
        # Save customer ID to Firestore
        await user_ref.update({"stripe_customer_id": customer.id})
        
        logger.info(f"Created Stripe customer {customer.id} for user {user_id}")
        return customer.id
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting/creating Stripe customer for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

async def attach_payment_method(
    user_id: str,
    payment_method_id: str,
    set_as_default: bool,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Attach a payment method to a user's Stripe customer.
    
    Args:
        user_id: The ID of the user
        payment_method_id: The Stripe payment method ID
        set_as_default: Whether to set as default payment method
        db_client: Firestore client
    
    Returns:
        Dict with payment method details
    
    Raises:
        HTTPException: If there's an error attaching the payment method
    """
    try:
        # Get or create Stripe customer
        customer_id = await get_or_create_stripe_customer(user_id, db_client)
        
        # Attach payment method to customer
        payment_method = stripe.PaymentMethod.attach(
            payment_method_id,
            customer=customer_id
        )
        
        # Set as default if requested
        if set_as_default:
            stripe.Customer.modify(
                customer_id,
                invoice_settings={
                    "default_payment_method": payment_method_id
                }
            )
            
            # Update user's default payment method in Firestore
            user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
            await user_ref.update({"default_payment_method_id": payment_method_id})
        
        logger.info(f"Attached payment method {payment_method_id} to user {user_id}")
        
        return {
            "id": payment_method.id,
            "type": payment_method.type,
            "card": payment_method.card.to_dict() if payment_method.card else None,
            "created": payment_method.created
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error attaching payment method: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error attaching payment method: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

async def list_payment_methods(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    List all payment methods for a user.
    
    Args:
        user_id: The ID of the user
        db_client: Firestore client
    
    Returns:
        Dict with list of payment methods and default method ID
    
    Raises:
        HTTPException: If there's an error listing payment methods
    """
    try:
        # Get or create Stripe customer
        customer_id = await get_or_create_stripe_customer(user_id, db_client)
        
        # Get customer details to find default payment method
        customer = stripe.Customer.retrieve(customer_id)
        default_payment_method_id = customer.invoice_settings.default_payment_method if customer.invoice_settings else None
        
        # List all payment methods
        payment_methods = stripe.PaymentMethod.list(
            customer=customer_id,
            type="card"  # Can be extended to other types
        )
        
        # Format payment methods
        formatted_methods = []
        for pm in payment_methods.data:
            formatted_methods.append({
                "id": pm.id,
                "type": pm.type,
                "card": pm.card.to_dict() if pm.card else None,
                "is_default": pm.id == default_payment_method_id,
                "created_at": datetime.fromtimestamp(pm.created).isoformat()
            })
        
        return {
            "payment_methods": formatted_methods,
            "default_payment_method_id": default_payment_method_id
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error listing payment methods: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error listing payment methods: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

async def delete_payment_method(
    user_id: str,
    payment_method_id: str,
    db_client: AsyncClient
) -> Dict[str, bool]:
    """
    Delete a payment method.
    
    Args:
        user_id: The ID of the user
        payment_method_id: The Stripe payment method ID to delete
        db_client: Firestore client
    
    Returns:
        Dict with success status
    
    Raises:
        HTTPException: If there's an error deleting the payment method
    """
    try:
        # Verify ownership by checking if method belongs to user's customer
        customer_id = await get_or_create_stripe_customer(user_id, db_client)
        
        # Retrieve payment method to verify ownership
        payment_method = stripe.PaymentMethod.retrieve(payment_method_id)
        
        if payment_method.customer != customer_id:
            raise HTTPException(status_code=403, detail="Payment method does not belong to this user")
        
        # Detach payment method
        stripe.PaymentMethod.detach(payment_method_id)
        
        # If this was the default, clear it from Firestore
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        user_data = user_doc.to_dict()
        
        if user_data.get("default_payment_method_id") == payment_method_id:
            await user_ref.update({"default_payment_method_id": None})
        
        logger.info(f"Deleted payment method {payment_method_id} for user {user_id}")
        
        return {"success": True}
        
    except stripe.error.StripeError as e:
        logger.error(f"Stripe error deleting payment method: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting payment method: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

async def set_default_payment_method(
    user_id: str,
    payment_method_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Set a user's default payment method.

    - Verifies the payment method belongs to the user
    - Updates Stripe Customer invoice_settings.default_payment_method
    - Stores default_payment_method_id in Firestore
    """
    try:
        # Ensure the user has a Stripe customer and retrieve ID
        customer_id = await get_or_create_stripe_customer(user_id, db_client)

        # Verify the payment method exists and belongs to the customer
        pm = stripe.PaymentMethod.retrieve(payment_method_id)
        if pm.customer != customer_id:
            raise HTTPException(status_code=403, detail="Payment method does not belong to this user")

        # Update Stripe customer default payment method
        stripe.Customer.modify(
            customer_id,
            invoice_settings={"default_payment_method": payment_method_id}
        )

        # Persist default in Firestore
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        await user_ref.update({"default_payment_method_id": payment_method_id})

        logger.info(f"Set default payment method {payment_method_id} for user {user_id}")
        return {"success": True, "default_payment_method_id": payment_method_id}

    except stripe.error.StripeError as e:
        logger.error(f"Stripe error setting default payment method: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error setting default payment method: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

async def check_payment_status(payment_intent_id: str, db_client: AsyncClient = None) -> Dict[str, Any]:
    """
    Check the status of a payment intent and whether the transaction was completed.
    
    Args:
        payment_intent_id: The Stripe payment intent ID
        db_client: Optional Firestore client for checking transaction completion
    
    Returns:
        Dict with payment intent status, details, and transaction completion status
    
    Raises:
        HTTPException: If there's an error checking the payment status
    """
    try:
        # Retrieve payment intent from Stripe
        payment_intent = stripe.PaymentIntent.retrieve(payment_intent_id)
        
        result = {
            "payment_intent_id": payment_intent.id,
            "status": payment_intent.status,
            "amount": payment_intent.amount,
            "currency": payment_intent.currency,
            "created_at": datetime.fromtimestamp(payment_intent.created).isoformat(),
            "metadata": payment_intent.metadata,
            "transaction_completed": False,
            "transaction_type": None,
            "transaction_details": {}
        }
        
        # If payment succeeded and we have a db_client, check transaction completion
        if payment_intent.status == "succeeded" and db_client:
            metadata = payment_intent.metadata
            
            # Check if this is a marketplace transaction
            if metadata.get("listing_id") and metadata.get("buyer_id"):
                result["transaction_type"] = "marketplace"
                
                # Check marketplace transaction completion
                listing_id = metadata.get("listing_id")
                buyer_id = metadata.get("buyer_id")
                
                # Query marketplace_transactions collection
                marketplace_txn_query = db_client.collection("marketplace_transactions") \
                    .where("listing_id", "==", listing_id) \
                    .where("buyer_id", "==", buyer_id) \
                    .where("price_cash", "!=", None) \
                    .order_by("traded_at", direction=firestore.Query.DESCENDING) \
                    .limit(1)
                
                marketplace_txns = await marketplace_txn_query.get()
                
                if marketplace_txns:
                    txn_data = marketplace_txns[0].to_dict()
                    result["transaction_completed"] = True
                    result["transaction_details"] = {
                        "transaction_id": txn_data.get("id"),
                        "seller_id": txn_data.get("seller_id"),
                        "card_id": txn_data.get("card_id"),
                        "quantity": txn_data.get("quantity"),
                        "traded_at": txn_data.get("traded_at").isoformat() if txn_data.get("traded_at") else None
                    }
                
            # Check if this is a point recharge transaction
            elif metadata.get("user_id") and not metadata.get("listing_id"):
                result["transaction_type"] = "recharge"
                user_id = metadata.get("user_id")
                
                # Check if points were added by querying cash_recharges table
                with db_connection() as conn:
                    cursor = conn.cursor()
                    try:
                        # Look for a recharge record with this payment intent ID
                        cursor.execute(
                            """
                            SELECT id, amount_cash, points_granted, created_at 
                            FROM cash_recharges 
                            WHERE user_id = %s 
                            AND created_at >= %s
                            ORDER BY created_at DESC
                            LIMIT 1
                            """,
                            (user_id, datetime.fromtimestamp(payment_intent.created))
                        )
                        
                        recharge_record = cursor.fetchone()
                        
                        if recharge_record:
                            # Verify the amount matches
                            recharge_id, amount_cash, points_granted, created_at = recharge_record
                            expected_amount = float(payment_intent.amount) / 100.0
                            
                            if abs(float(amount_cash) - expected_amount) < 0.01:  # Allow for small floating point differences
                                result["transaction_completed"] = True
                                result["transaction_details"] = {
                                    "recharge_id": recharge_id,
                                    "amount_cash": float(amount_cash),
                                    "points_granted": points_granted,
                                    "created_at": created_at.isoformat() if created_at else None
                                }
                                
                                # Also check if user's points were updated in Firestore
                                if db_client:
                                    user_ref = db_client.collection("users").document(user_id)
                                    user_doc = await user_ref.get()
                                    if user_doc.exists:
                                        user_data = user_doc.to_dict()
                                        result["transaction_details"]["current_points"] = user_data.get("points", 0)
                                        result["transaction_details"]["total_cash_recharged"] = user_data.get("totalCashRecharged", 0)
                    
                    except Exception as db_error:
                        logger.error(f"Error checking recharge status: {str(db_error)}")
                        # Don't fail the whole request, just log the error
                        result["transaction_details"]["error"] = "Could not verify recharge completion"
                    finally:
                        cursor.close()
        
        return result
        
    except stripe.error.StripeError as e:
        if e.code == 'resource_missing':
            raise HTTPException(status_code=404, detail="Payment intent not found")
        logger.error(f"Stripe error checking payment status: {str(e)}")
        raise HTTPException(status_code=400, detail=f"Stripe error: {str(e)}")
    except Exception as e:
        logger.error(f"Error checking payment status: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")

async def check_stripe_connect_status(user_id: str, db_client: AsyncClient) -> Dict[str, str]:
    """
    Check the status of a user's Stripe Connect account.

    Args:
        user_id: The ID of the user (seller)
        db_client: Firestore client

    Returns:
        Dict containing the status of the Stripe Connect account

    Raises:
        HTTPException: If there's an error checking the account status
    """
    try:
        # Validate user_id by checking if user exists in Firestore
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            logger.error(f"User with ID {user_id} not found when checking Stripe Connect status")
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()

        # Check if user has a Stripe Connect account
        stripe_account_id = user_data.get("stripe_account_id")

        if not stripe_account_id:
            logger.info(f"User {user_id} does not have a Stripe Connect account")
            return {"status": "not_connected"}

        # Retrieve the Stripe account to check its status
        try:
            account = stripe.Account.retrieve(stripe_account_id)

            # Check if the account is fully onboarded (can accept charges and receive payouts)
            if account.charges_enabled and account.payouts_enabled:
                logger.info(f"User {user_id} has a fully onboarded Stripe Connect account")
                return {"status": "ready"}
            else:
                logger.info(f"User {user_id} has an incomplete Stripe Connect account")
                return {"status": "incomplete"}

        except stripe.error.StripeError as e:
            logger.error(f"Stripe error retrieving Connect account for user {user_id}: {str(e)}")
            # If the account doesn't exist or there's another issue, consider it not connected
            return {"status": "not_connected"}

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error checking Stripe Connect status for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

async def handle_payment_succeeded(payment_intent: Dict[str, Any], db_client: AsyncClient) -> Dict[str, Any]:
    """
    Handle a successful payment intent event.

    Args:
        payment_intent: The payment intent object from Stripe
        db_client: Firestore client

    Returns:
        Dict containing information about the processed payment

    Raises:
        HTTPException: If there's an error processing the payment
    """
    try:
        # Extract payment details
        payment_id = payment_intent['id']
        amount = payment_intent['amount']  # Amount in cents
        amount_dollars = amount / 100.0    # Convert to dollars for readability
        currency = payment_intent['currency']
        metadata = payment_intent.get('metadata', {})
        user_id = metadata.get('user_id')

        # Check purchase type from metadata
        purchase_type = metadata.get('purchase_type')
        
        # Check if this is an official shop purchase
        if purchase_type == 'official_shop':
            logger.info(f"Processing official shop purchase for payment {payment_id}")
            return await handle_official_shop_purchase(
                payment_id=payment_id,
                user_id=user_id,
                amount=amount,
                amount_dollars=amount_dollars,
                metadata=metadata,
                db_client=db_client
            )
        
        # Check if this is a marketplace payment
        listing_id = metadata.get('listing_id')
        buyer_id = metadata.get('buyer_id')
        offer_id = metadata.get('offer_id')
        
        # IMPORTANT: Strict validation to protect users from losing money
        # Use HTTP 400 for validation errors that won't be fixed by retrying
        # Use HTTP 500 only for transient issues like database connectivity
        
        if listing_id and not buyer_id:
            logger.error(f"Payment {payment_id} has listing_id '{listing_id}' but missing buyer_id")
            # This is a data integrity issue that won't be fixed by retrying
            raise HTTPException(
                status_code=400,
                detail=f"Invalid marketplace payment metadata: has listing_id but missing buyer_id. Manual reconciliation required."
            )
        
        if buyer_id and not listing_id:
            logger.error(f"Payment {payment_id} has buyer_id '{buyer_id}' but missing listing_id")
            # This is a data integrity issue that won't be fixed by retrying
            raise HTTPException(
                status_code=400,
                detail=f"Invalid marketplace payment metadata: has buyer_id but missing listing_id. Manual reconciliation required."
            )

        # If this is a marketplace payment, use the saga implementation for consistency
        if listing_id and buyer_id:
            from service.marketplace_payment_saga import marketplace_payment_saga
            
            return await marketplace_payment_saga.execute_marketplace_payment(
                payment_id=payment_id,
                amount=amount,
                amount_dollars=amount_dollars,
                currency=currency,
                listing_id=listing_id,
                buyer_id=buyer_id,
                offer_id=offer_id,
                db_client=db_client
            )

        # Validate user_id
        if not user_id:
            logger.error(f"Payment {payment_id} has no user_id in metadata")
            # Return 400 which will cause Stripe to mark this as a permanent failure
            raise HTTPException(status_code=400, detail="Payment has no user_id in metadata")

        # Calculate points to add with tiered bonuses (but keep affiliate based on base points)
        base_points = int(amount_dollars * POINTS_PER_DOLLAR)

        # Determine bonus percentage based on dollar amount
        if amount_dollars >= 500:
            bonus_percentage = 0.10  # 10% bonus for $500+
        elif amount_dollars >= 250:
            bonus_percentage = 0.075  # 7.5% bonus for $250+
        elif amount_dollars >= 100:
            bonus_percentage = 0.05  # 5% bonus for $100+
        else:
            bonus_percentage = 0.0  # No bonus for amounts under $100

        tier_bonus_points = int(base_points * bonus_percentage)
        points_to_add = base_points + tier_bonus_points
        logger.info(
            f"Recharge points calc: amount_cents={amount}, amount_dollars={amount_dollars}, "
            f"base_points={base_points}, bonus_percentage={bonus_percentage:.1%}, "
            f"tier_bonus_points={tier_bonus_points}, total_points_to_add={points_to_add}"
        )
        
        # Get referral information from metadata
        referer_id = metadata.get('referer_id')
        refer_code = metadata.get('refer_code')
        
        # Use the recharge payment saga for regular payments
        return await recharge_payment_saga.execute_recharge_payment(
            payment_id=payment_id,
            user_id=user_id,
            amount_cents=amount,  # amount is already in cents
            amount_dollars=amount_dollars,
            points_to_add=points_to_add,
            base_points_for_referral=base_points,
            referer_id=referer_id,
            refer_code=refer_code,
            db_client=db_client
        )

    except HTTPException:
        # Re-raise HTTP exceptions to be handled by the FastAPI exception handler
        raise
    except Exception as e:
        logger.error(f"Error handling payment succeeded event: {str(e)}", exc_info=True)
        # Return a 500 status code which will cause Stripe to retry the webhook
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred, Stripe should retry this webhook: {str(e)}"
        )

async def create_official_shop_checkout_session(
    user_id: str,
    items: list[dict],
    address_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Create a Stripe checkout session for official shop purchases.
    
    Args:
        user_id: The ID of the user making the purchase
        items: List of items with collection_id, card_id, and quantity
        address_id: The ID of the user's selected shipping address
        db_client: Firestore async client
        
    Returns:
        Dict containing checkout session URL and price breakdown
        
    Raises:
        HTTPException: If there's an error creating the session
    """
    try:
        # Fetch the user document to get addresses array
        user_ref = db_client.collection('users').document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(
                status_code=404,
                detail=f"User {user_id} not found"
            )
        
        user_data = user_doc.to_dict()
        addresses = user_data.get('addresses', [])
        
        # Find the address with the given ID
        address_data = None
        for addr in addresses:
            if addr.get('id') == address_id:
                address_data = addr
                break
        
        if not address_data:
            raise HTTPException(
                status_code=404,
                detail=f"Address {address_id} not found"
            )
        
        # Fetch card details and build line items
        line_items = []
        total_amount_cents = 0
        total_weight_grams = 0  # Track total weight for shipping calculation
        
        # Count items by type for dimension calculation
        item_counts = {'box': 0, 'pack': 0, 'card': 0}
        
        # Weight mapping based on item type
        WEIGHT_MAP = {
            'box': 320,   # grams
            'pack': 10,   # grams
            'card': 10    # grams
        }
        
        for item in items:
            collection_id = item.get('collection_id')
            card_id = item.get('card_id')
            quantity = item.get('quantity', 1)
            
            # Get card from official listing
            card_ref = db_client.collection('official_listing').document(collection_id).collection('cards').document(card_id)
            card_doc = await card_ref.get()
            
            if not card_doc.exists:
                raise HTTPException(
                    status_code=404,
                    detail=f"Card {card_id} not found in collection {collection_id}"
                )
            
            card_data = card_doc.to_dict()
            price_cash = card_data.get('priceCash', 0)
            card_name = card_data.get('card_name', 'Unknown Card')
            item_type = card_data.get('type', 'card')  # Get type field (box, pack, or card)
            
            # Track item counts by type
            if item_type in item_counts:
                item_counts[item_type] += quantity
            else:
                item_counts['card'] += quantity  # Default to card if unknown type
            
            # Calculate weight for this item
            item_weight = WEIGHT_MAP.get(item_type, 10)  # Default to 10g if type not recognized
            total_weight_grams += item_weight * quantity
            
            # Convert price to cents
            price_cents = dollars_to_cents(price_cash)
            
            # Check if there's enough stock
            available_quantity = card_data.get('quantity', 0)
            if available_quantity < quantity:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for {card_name}. Available: {available_quantity}, Requested: {quantity}"
                )
            
            # Add to line items
            line_items.append({
                'price_data': {
                    'currency': 'usd',
                    'unit_amount': price_cents,
                    'product_data': {
                        'name': card_name,
                        'description': f"Collection: {collection_id}",
                        'metadata': {
                            'collection_id': collection_id,
                            'card_id': card_id,
                            'type': item_type
                        },
                        'tax_code': 'txcd_99999999'  # General tangible goods - trading cards are taxable in Ohio
                    },
                    'tax_behavior': 'exclusive'  # Tax is added on top of the price
                },
                'quantity': quantity
            })
            
            total_amount_cents += price_cents * quantity
        
        if not line_items:
            raise HTTPException(status_code=400, detail="No items to purchase")
        
        logger.info(f"Total weight for shipment: {total_weight_grams}g for {len(items)} items")
        
        # Calculate shipping cost using Shippo
        shipping_cost_cents = 0
        shippo_rate_id = None
        
        try:
            # Initialize Shippo SDK
            shippo_sdk = Shippo(api_key_header=settings.shippo_api_key)
            
            # From address (zapull.fun warehouse)
            from_address = components.AddressCreateRequest(
                name='zapull.fun',
                street1='10716 Pearl Creek Drive',
                city='Plain City',
                state='OH',
                zip='43064',
                country='US',
                phone='2202461193',
                email='andy@zapull.fun'
            )
            
            # To address (customer's address)
            to_address = components.AddressCreateRequest(
                name=address_data.get('name', ''),
                street1=address_data.get('street', address_data.get('line1', '')),
                street2=address_data.get('street2', address_data.get('line2', '')),
                city=address_data.get('city', ''),
                state=address_data.get('state', ''),
                zip=address_data.get('zip', address_data.get('postal_code', '')),
                country=address_data.get('country', 'US'),
                phone=address_data.get('phone', ''),
                email=user_data.get('email', '')
            )
            
            # Convert grams to ounces for Shippo (1 oz = 28.3495 grams)
            weight_oz = max(1, round(total_weight_grams / 28.3495))  # Minimum 1 oz
            
            # Calculate parcel dimensions based on item types
            # Priority: boxes > packs > cards
            if item_counts['box'] > 0:
                # Box orders need larger dimensions
                if item_counts['box'] == 1:
                    # Single box: 8" x 6" x 4"
                    length, width, height = '8', '6', '4'
                elif item_counts['box'] <= 3:
                    # 2-3 boxes: Medium box 11" x 8.5" x 5.5"
                    length, width, height = '11', '8.5', '5.5'
                else:
                    # 4+ boxes: Large box 12" x 12" x 6"
                    length, width, height = '12', '12', '6'
            elif item_counts['pack'] > 0:
                # Pack orders
                if item_counts['pack'] <= 5:
                    # Few packs: Small padded envelope 8" x 6" x 2"
                    length, width, height = '8', '6', '2'
                elif item_counts['pack'] <= 15:
                    # Medium pack order: 9" x 6" x 3"
                    length, width, height = '9', '6', '3'
                else:
                    # Large pack order: 10" x 8" x 4"
                    length, width, height = '10', '8', '4'
            else:
                # Card-only orders: Standard card mailer
                if item_counts['card'] <= 10:
                    # Few cards: 6" x 4" x 1"
                    length, width, height = '6', '4', '1'
                elif item_counts['card'] <= 30:
                    # Medium card order: 8" x 6" x 1.5"
                    length, width, height = '8', '6', '1.5'
                else:
                    # Large card order: 9" x 6" x 2"
                    length, width, height = '9', '6', '2'
            
            logger.info(f"Parcel dimensions: {length}\"L x {width}\"W x {height}\"H for {item_counts['box']} boxes, {item_counts['pack']} packs, {item_counts['card']} cards")
            
            # Store dimensions for later use
            parcel_length = length
            parcel_width = width
            parcel_height = height
            parcel_weight_oz = weight_oz
            
            # Create parcel based on calculated dimensions and weight
            parcel = components.ParcelCreateRequest(
                length=length,
                width=width,
                height=height,
                distance_unit='in',
                weight=str(weight_oz),
                mass_unit='oz'
            )
            
            # Create shipment to get rates
            shipment = shippo_sdk.shipments.create(
                components.ShipmentCreateRequest(
                    address_from=from_address,
                    address_to=to_address,
                    parcels=[parcel],
                    async_=False
                )
            )
            
            # Get the cheapest rate
            if shipment.rates and len(shipment.rates) > 0:
                cheapest_rate = min(shipment.rates, key=lambda r: float(r.amount))
                base_shipping_cost = float(cheapest_rate.amount)
                shippo_rate_id = cheapest_rate.object_id
                
                # Use base shipping cost without markup
                shipping_cost_dollars = base_shipping_cost
                shipping_cost_cents = dollars_to_cents(shipping_cost_dollars)
                
                logger.info(f"Shipping cost: ${shipping_cost_dollars:.2f} ({shipping_cost_cents} cents) using rate {shippo_rate_id}")
                
                # Add shipping as a line item
                line_items.append({
                    'price_data': {
                        'currency': 'usd',
                        'unit_amount': shipping_cost_cents,
                        'product_data': {
                            'name': 'Shipping',
                            'description': f'Shipping via {cheapest_rate.provider} {cheapest_rate.servicelevel.name}',
                            'metadata': {
                                'shippo_rate_id': shippo_rate_id,
                                'weight_grams': str(total_weight_grams),
                                'weight_oz': str(weight_oz)
                            },
                            'tax_code': 'txcd_92010001'  # Shipping charges are taxable in Ohio
                        },
                        'tax_behavior': 'exclusive'  # Tax is added on top of the price
                    },
                    'quantity': 1
                })
            else:
                logger.warning(f"No shipping rates available for address {address_id}")
                raise HTTPException(
                    status_code=400,
                    detail="Unable to calculate shipping cost for this address"
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error calculating shipping cost: {e}", exc_info=True)
            raise HTTPException(
                status_code=500,
                detail=f"Failed to calculate shipping cost: {str(e)}"
            )
        
        # Get or create Stripe customer
        customer_id = await get_or_create_stripe_customer(user_id, db_client)
        
        # Update customer with address for tax calculation
        # Map address fields: backend uses 'street', 'zip' but Stripe uses 'line1', 'postal_code'
        try:
            stripe.Customer.modify(
                customer_id,
                address={
                    'line1': address_data.get('street', address_data.get('line1', '')),
                    'line2': address_data.get('street2', address_data.get('line2', '')),
                    'city': address_data.get('city', ''),
                    'state': address_data.get('state', ''),
                    'postal_code': address_data.get('zip', address_data.get('postal_code', '')),
                    'country': address_data.get('country', 'US')
                }
            )
        except Exception as e:
            logger.warning(f"Failed to update customer address: {e}")
        
        # Create checkout session with automatic tax
        # Note: Cannot use payment_intent_data[shipping] with automatic_tax enabled
        # Instead, we use the customer's address which we already updated above
        session = stripe.checkout.Session.create(
            customer=customer_id,
            line_items=line_items,
            mode='payment',
            automatic_tax={'enabled': True},
            success_url=f"{settings.frontend_url}/shop?success=true&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{settings.frontend_url}/shop?canceled=true",
            metadata={
                'user_id': user_id,
                'purchase_type': 'official_shop',
                'address_id': address_id,
                'items': str(items),  # Store items for webhook processing
                'shippo_rate_id': shippo_rate_id or '',
                'total_weight_grams': str(total_weight_grams),
                'shipping_cost_cents': str(shipping_cost_cents),
                'parcel_length': parcel_length,
                'parcel_width': parcel_width,
                'parcel_height': parcel_height,
                'parcel_weight_oz': str(parcel_weight_oz)
            },
            payment_intent_data={
                'capture_method': 'manual',  # Authorize but don't capture yet
                'metadata': {
                    'user_id': user_id,
                    'purchase_type': 'official_shop',
                    'address_id': address_id,
                    'items': str(items),
                    'shippo_rate_id': shippo_rate_id or '',
                    'total_weight_grams': str(total_weight_grams),
                    'shipping_cost_cents': str(shipping_cost_cents),
                    'parcel_length': parcel_length,
                    'parcel_width': parcel_width,
                    'parcel_height': parcel_height,
                    'parcel_weight_oz': str(parcel_weight_oz)
                }
            }
        )
        
        logger.info(f"Created checkout session {session.id} for user {user_id} with {len(items)} items, shipping: ${shipping_cost_cents/100.0}")
        
        return {
            'session_id': session.id,
            'session_url': session.url,
            'subtotal_cents': total_amount_cents,
            'subtotal': total_amount_cents / 100.0,
            'shipping_cents': shipping_cost_cents,
            'shipping': shipping_cost_cents / 100.0,
            'total_weight_grams': total_weight_grams,
            'message': 'Checkout session created successfully'
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating official shop checkout session for user {user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An error occurred while creating the checkout session: {str(e)}"
        )
