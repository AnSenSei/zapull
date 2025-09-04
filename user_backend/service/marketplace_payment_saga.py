"""
Marketplace Payment Saga Implementation

This module implements a saga pattern for marketplace payments to ensure
data consistency between Firestore and PostgreSQL.
"""

from typing import Dict, Any, Optional
from datetime import datetime
from enum import Enum
import json
import uuid
from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient
from google.cloud.firestore_v1._helpers import DatetimeWithNanoseconds
import stripe

from config import get_logger, execute_query, db_connection, settings
from service.card_service import add_card_to_user
from service.account_service import get_user_by_id
from service.marketplace_service import send_item_sold_email

# Initialize Stripe
stripe.api_key = settings.stripe_api_key

logger = get_logger(__name__)

def firestore_json_serializer(obj):
    """Custom JSON serializer for Firestore objects"""
    if isinstance(obj, DatetimeWithNanoseconds):
        return obj.isoformat()
    elif isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

class PaymentSagaStatus(Enum):
    """Status of a payment saga."""
    PENDING = "pending"
    FIRESTORE_UPDATED = "firestore_updated"
    SQL_UPDATED = "sql_updated"
    CARD_TRANSFERRED = "card_transferred"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATED = "compensated"

class MarketplacePaymentSaga:
    """
    Implements a saga pattern for marketplace payments to ensure consistency
    between Firestore and PostgreSQL.
    """
    
    def __init__(self):
        self.ensure_saga_table_exists()
    
    def ensure_saga_table_exists(self):
        """Create saga tracking table if it doesn't exist."""
        try:
            # Create the table
            execute_query(
                """
                CREATE TABLE IF NOT EXISTS payment_sagas (
                    saga_id VARCHAR(255) PRIMARY KEY,
                    payment_id VARCHAR(255) NOT NULL,
                    listing_id VARCHAR(255) NOT NULL,
                    buyer_id VARCHAR(255) NOT NULL,
                    seller_id VARCHAR(255) NOT NULL,
                    offer_id VARCHAR(255),
                    amount_cents INTEGER NOT NULL,
                    status VARCHAR(50) NOT NULL,
                    firestore_snapshot TEXT,
                    error_message TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """,
                fetch=False
            )

            # Create indexes separately for PostgreSQL compatibility
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_payment_sagas_payment_id ON payment_sagas(payment_id)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_payment_sagas_status ON payment_sagas(status)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_payment_sagas_created_at ON payment_sagas(created_at)",
                fetch=False
            )

            logger.info("Ensured payment_sagas table exists")
        except Exception as e:
            logger.error(f"Error creating payment_sagas table: {e}")
    
    async def execute_marketplace_payment(
        self,
        payment_id: str,
        amount: int,
        amount_dollars: float,
        currency: str,
        listing_id: str,
        buyer_id: str,
        offer_id: Optional[str],
        db_client: AsyncClient
    ) -> Dict[str, Any]:
        """
        Execute a marketplace payment with saga pattern for consistency.
        """
        saga_id = f"saga_{payment_id}_{uuid.uuid4().hex[:8]}"
        seller_id = None
        card_reference = None
        collection_id = None
        
        try:
            logger.info(f"Starting payment saga {saga_id} for payment {payment_id}")
            
            # 1. Create saga record
            self._create_saga_record(
                saga_id, payment_id, listing_id, buyer_id, 
                offer_id, amount
            )
            
            # 2. Get listing and validate
            listing_data, seller_id, card_reference, collection_id = await self._validate_listing(
                listing_id, db_client
            )
            
            # Update saga with seller info
            self._update_saga_seller(saga_id, seller_id)
            
            # 3. Create Firestore snapshot for potential rollback
            firestore_snapshot = await self._create_firestore_snapshot(
                listing_id, buyer_id, seller_id, offer_id, db_client
            )
            self._update_saga_snapshot(saga_id, firestore_snapshot)
            
            # 4. Execute Firestore updates
            firestore_updates = await self._execute_firestore_updates(
                listing_id, buyer_id, seller_id, offer_id, 
                card_reference, collection_id, listing_data,
                db_client
            )
            self._update_saga_status(saga_id, PaymentSagaStatus.FIRESTORE_UPDATED)
            
            # 5. Execute SQL updates
            sql_transaction_id = self._execute_sql_updates(
                listing_id, seller_id, buyer_id, 
                card_reference, amount_dollars
            )
            self._update_saga_status(saga_id, PaymentSagaStatus.SQL_UPDATED)
            
            # 6. Transfer card to buyer
            await add_card_to_user(
                user_id=buyer_id,
                card_reference=card_reference,
                db_client=db_client,
                collection_metadata_id=collection_id,
                from_marketplace=True,
            )
            self._update_saga_status(saga_id, PaymentSagaStatus.CARD_TRANSFERRED)
            
            # 7. Send notification email (non-critical)
            try:
                await self._send_notification_email(
                    seller_id, buyer_id, listing_data, 
                    amount_dollars, db_client
                )
            except Exception as e:
                logger.error(f"Failed to send notification email: {e}")
                # Don't fail the transaction for email errors
            
            # 8. Payment is automatically captured by Stripe
            # Order processing completed successfully
            logger.info(f"Payment {payment_id} was automatically captured - order processing completed")
            
            # 9. Mark saga as completed
            self._update_saga_status(saga_id, PaymentSagaStatus.COMPLETED)
            
            logger.info(f"Payment saga {saga_id} completed successfully")
            
            return {
                "status": "success",
                "saga_id": saga_id,
                "payment_id": payment_id,
                "transaction_id": f"tx_{listing_id}_{offer_id or 'direct'}_{datetime.now().strftime('%Y%m%d%H%M%S')}",
                "listing_id": listing_id,
                "offer_id": offer_id,
                "buyer_id": buyer_id,
                "seller_id": seller_id,
                "amount": amount,
                "currency": currency
            }
            
        except Exception as e:
            logger.error(f"Payment saga {saga_id} failed: {str(e)}", exc_info=True)
            
            # Record failure
            self._update_saga_error(saga_id, str(e))
            
            # Cancel the payment if it hasn't been captured yet
            try:
                payment_intent = stripe.PaymentIntent.retrieve(payment_id)
                if payment_intent.status == "requires_capture":
                    stripe.PaymentIntent.cancel(payment_id)
                    logger.info(f"Cancelled uncaptured payment {payment_id} due to processing failure")
                elif payment_intent.status == "succeeded":
                    # Payment was already captured (shouldn't happen with manual capture)
                    # Consider refunding here if needed
                    logger.warning(f"Payment {payment_id} already captured, cannot cancel. Manual refund may be needed.")
            except stripe.error.StripeError as cancel_error:
                logger.error(f"Failed to cancel payment {payment_id}: {str(cancel_error)}")
            
            # Attempt compensation
            try:
                await self._compensate_saga(
                    saga_id, firestore_snapshot if 'firestore_snapshot' in locals() else None,
                    db_client
                )
                self._update_saga_status(saga_id, PaymentSagaStatus.COMPENSATED)
            except Exception as comp_error:
                logger.error(f"Compensation failed for saga {saga_id}: {comp_error}")
            
            # Re-raise the original error
            raise HTTPException(
                status_code=500,
                detail=f"Payment processing failed: {str(e)}"
            )
    
    def _create_saga_record(
        self, saga_id: str, payment_id: str, 
        listing_id: str, buyer_id: str, 
        offer_id: Optional[str], amount: int
    ):
        """Create initial saga record."""
        execute_query(
            """
            INSERT INTO payment_sagas 
            (saga_id, payment_id, listing_id, buyer_id, seller_id, offer_id, amount_cents, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (saga_id, payment_id, listing_id, buyer_id, "", offer_id or "", amount, PaymentSagaStatus.PENDING.value),
            fetch=False
        )
    
    def _update_saga_status(self, saga_id: str, status: PaymentSagaStatus):
        """Update saga status."""
        execute_query(
            """
            UPDATE payment_sagas 
            SET status = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (status.value, datetime.now(), saga_id),
            fetch=False
        )
    
    def _update_saga_seller(self, saga_id: str, seller_id: str):
        """Update saga with seller information."""
        execute_query(
            """
            UPDATE payment_sagas 
            SET seller_id = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (seller_id, datetime.now(), saga_id),
            fetch=False
        )
    
    def _update_saga_snapshot(self, saga_id: str, snapshot: Dict[str, Any]):
        """Update saga with Firestore snapshot."""
        execute_query(
            """
            UPDATE payment_sagas
            SET firestore_snapshot = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (json.dumps(snapshot, default=firestore_json_serializer), datetime.now(), saga_id),
            fetch=False
        )
    
    def _update_saga_error(self, saga_id: str, error_message: str):
        """Update saga with error information."""
        execute_query(
            """
            UPDATE payment_sagas 
            SET status = %s, error_message = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (PaymentSagaStatus.FAILED.value, error_message, datetime.now(), saga_id),
            fetch=False
        )
    
    async def _validate_listing(
        self, listing_id: str, db_client: AsyncClient
    ) -> tuple:
        """Validate listing exists and get details."""
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing {listing_id} not found")
        
        listing_data = listing_doc.to_dict()
        seller_ref_path = listing_data.get("owner_reference", "")
        
        if not seller_ref_path:
            raise HTTPException(status_code=500, detail="Invalid listing: missing owner reference")
        
        seller_id = seller_ref_path.split('/')[-1]
        card_reference = listing_data.get("card_reference", "")
        collection_id = listing_data.get("collection_id", "")
        
        if not card_reference or not collection_id:
            raise HTTPException(status_code=500, detail="Invalid listing: missing card information")
        
        return listing_data, seller_id, card_reference, collection_id
    
    async def _create_firestore_snapshot(
        self, listing_id: str, buyer_id: str, 
        seller_id: str, offer_id: str, 
        db_client: AsyncClient
    ) -> Dict[str, Any]:
        """Create snapshot of current Firestore state for rollback."""
        snapshot = {
            "timestamp": datetime.now().isoformat(),
            "listing_id": listing_id,
            "buyer_id": buyer_id,
            "seller_id": seller_id,
            "offer_id": offer_id
        }
        
        # Snapshot listing
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        if listing_doc.exists:
            snapshot["listing"] = listing_doc.to_dict()
            snapshot["listing"]["quantity"] = snapshot["listing"].get("quantity", 0)
        
        # Snapshot buyer stats
        buyer_ref = db_client.collection('users').document(buyer_id)
        buyer_doc = await buyer_ref.get()
        if buyer_doc.exists:
            buyer_data = buyer_doc.to_dict()
            snapshot["buyer_buy_deal"] = buyer_data.get("buy_deal", 0)
        
        # Snapshot seller stats
        seller_ref = db_client.document(f"users/{seller_id}")
        seller_doc = await seller_ref.get()
        if seller_doc.exists:
            seller_data = seller_doc.to_dict()
            snapshot["seller_sell_deal"] = seller_data.get("sell_deal", 0)
        
        # Snapshot offer if it exists
        if offer_id:
            offer_ref = listing_ref.collection('cash_offers').document(offer_id)
            offer_doc = await offer_ref.get()
            if offer_doc.exists:
                snapshot["offer"] = offer_doc.to_dict()
        
        return snapshot
    
    async def _execute_firestore_updates(
        self, listing_id: str, buyer_id: str, seller_id: str,
        offer_id: str, card_reference: str, collection_id: str,
        listing_data: Dict[str, Any], db_client: AsyncClient
    ) -> Dict[str, Any]:
        """Execute all Firestore updates in a transaction."""
        
        @firestore.async_transactional
        async def update_firestore(transaction: firestore.AsyncTransaction):
            updates = {}
            
            # Update buyer and seller deal counts
            buyer_ref = db_client.collection('users').document(buyer_id)
            transaction.update(buyer_ref, {"buy_deal": firestore.Increment(1)})
            updates["buyer_deal_incremented"] = True
            
            seller_ref = db_client.document(f"users/{seller_id}")
            transaction.update(seller_ref, {"sell_deal": firestore.Increment(1)})
            updates["seller_deal_incremented"] = True
            
            # Delete the offer (only if this was an offer-based purchase)
            if offer_id:
                offer_ref = db_client.collection('listings').document(listing_id).collection('cash_offers').document(offer_id)
                transaction.delete(offer_ref)
                updates["offer_deleted"] = True
                
                # Delete from buyer's my_cash_offers
                my_offers_query = buyer_ref.collection('my_cash_offers').where("listingId", "==", listing_id)
                my_offers_docs = await my_offers_query.get()
                for doc in my_offers_docs:
                    if doc.to_dict().get("offerreference") == offer_id:
                        transaction.delete(doc.reference)
                        updates["buyer_offer_deleted"] = True
                        break
            else:
                # For buy-now, just record it
                updates["payment_type"] = "buy_now"
            
            # Update listing quantity
            listing_ref = db_client.collection('listings').document(listing_id)
            current_quantity = listing_data.get("quantity", 0)
            new_quantity = current_quantity - 1
            
            if new_quantity <= 0:
                # Delete all offers and the listing
                point_offers = await listing_ref.collection('point_offers').get()
                for offer in point_offers:
                    transaction.delete(listing_ref.collection('point_offers').document(offer.id))
                
                cash_offers = await listing_ref.collection('cash_offers').get()
                for offer in cash_offers:
                    if offer.id != offer_id:  # Skip already deleted offer
                        transaction.delete(listing_ref.collection('cash_offers').document(offer.id))
                
                transaction.delete(listing_ref)
                updates["listing_deleted"] = True
            else:
                transaction.update(listing_ref, {"quantity": new_quantity})
                updates["quantity_updated"] = new_quantity
            
            # Update seller's card locked_quantity
            card_id = card_reference.split('/')[-1]
            seller_card_ref = seller_ref.collection('cards').document('cards').collection(collection_id).document(card_id)
            seller_card_doc = await seller_card_ref.get()
            
            if seller_card_doc.exists:
                seller_card_data = seller_card_doc.to_dict()
                current_locked = seller_card_data.get('locked_quantity', 0)
                new_locked = max(0, current_locked - 1)
                
                if seller_card_data.get('quantity', 0) == 0 and new_locked == 0:
                    transaction.delete(seller_card_ref)
                    updates["seller_card_deleted"] = True
                else:
                    transaction.update(seller_card_ref, {'locked_quantity': new_locked})
                    updates["seller_card_updated"] = True
            
            # Create marketplace transaction record
            transaction_id = f"tx_{listing_id}_{offer_id or 'direct'}_{datetime.now().strftime('%Y%m%d%H%M%S')}"
            transaction_ref = db_client.collection('marketplace_transactions').document(transaction_id)
            transaction_data = {
                "id": transaction_id,
                "listing_id": listing_id,
                "seller_id": seller_id,
                "buyer_id": buyer_id,
                "card_id": card_id,
                "quantity": 1,
                "price_points": None,
                "price_cash": listing_data.get("price", 0),
                "payment_type": "offer" if offer_id else "buy_now",
                "traded_at": datetime.now()
            }
            if offer_id:
                transaction_data["offer_id"] = offer_id
            transaction.set(transaction_ref, transaction_data)
            updates["transaction_created"] = transaction_id
            
            return updates
        
        # Execute the transaction
        transaction = db_client.transaction()
        return await update_firestore(transaction)
    
    def _execute_sql_updates(
        self, listing_id: str, seller_id: str, 
        buyer_id: str, card_reference: str, 
        amount_dollars: float
    ) -> int:
        """Execute PostgreSQL updates."""
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                conn.autocommit = False
                
                # Insert marketplace transaction
                cursor.execute(
                    """
                    INSERT INTO marketplace_transactions 
                    (listing_id, seller_id, buyer_id, card_id, quantity, 
                     price_points, price_cash, price_card_id, price_card_qty, traded_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (listing_id, seller_id, buyer_id, card_reference, 
                     1, None, int(amount_dollars), None, None, datetime.now())
                )
                sql_transaction_id = cursor.fetchone()[0]
                
                conn.commit()
                logger.info(f"SQL transaction {sql_transaction_id} committed successfully")
                return sql_transaction_id
                
            except Exception as e:
                conn.rollback()
                logger.error(f"SQL transaction failed: {str(e)}")
                raise
            finally:
                cursor.close()
    
    async def _send_notification_email(
        self, seller_id: str, buyer_id: str, 
        listing_data: Dict[str, Any], amount_dollars: float,
        db_client: AsyncClient
    ):
        """Send notification email to seller."""
        seller = await get_user_by_id(seller_id, db_client)
        buyer = await get_user_by_id(buyer_id, db_client)
        
        if seller and seller.email:
            await send_item_sold_email(
                to_email=seller.email,
                to_name=seller.displayName,
                listing_data=listing_data,
                offer_type="cash",
                offer_amount=amount_dollars,
                buyer_name=buyer.displayName if buyer else "a user",
                is_buy_now=not offer_id  # Indicate if this was a direct purchase
            )
    
    async def _compensate_saga(
        self, saga_id: str, snapshot: Optional[Dict[str, Any]], 
        db_client: AsyncClient
    ):
        """Attempt to compensate/rollback a failed saga."""
        if not snapshot:
            logger.error(f"No snapshot available for saga {saga_id} compensation")
            return
        
        logger.info(f"Attempting compensation for saga {saga_id}")
        
        # This is a simplified compensation - in production, you'd want more sophisticated rollback
        # For now, we just log the failure for manual intervention
        logger.error(
            f"MANUAL INTERVENTION REQUIRED: Saga {saga_id} failed. "
            f"Snapshot: {json.dumps(snapshot, indent=2, default=firestore_json_serializer)}"
        )

# Global saga instance
marketplace_payment_saga = MarketplacePaymentSaga()