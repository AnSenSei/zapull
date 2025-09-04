"""
Recharge Payment Saga Implementation

This module implements a saga pattern for point recharge payments to ensure
data consistency between Firestore and PostgreSQL, with proper handling of
referral bonuses and idempotency.
"""

from typing import Dict, Any, Optional, Tuple
from datetime import datetime, timedelta
from enum import Enum
import json
import uuid
import asyncio
from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, AsyncTransaction, Increment
from google.cloud.firestore_v1._helpers import DatetimeWithNanoseconds
import stripe

from config import get_logger, execute_query, db_connection, settings
from service.account_service import get_user_by_id
from service.marketplace_service import send_recharge_confirmation_email
from models.schemas import User
from utils.payment_idempotency import idempotent_payment_operation

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

class RechargeSagaStatus(Enum):
    """Status of a recharge saga."""
    PENDING = "pending"
    USER_VALIDATED = "user_validated"
    REFERRAL_VALIDATED = "referral_validated"
    FIRESTORE_UPDATED = "firestore_updated"
    SQL_UPDATED = "sql_updated"
    REFERRAL_BONUS_APPLIED = "referral_bonus_applied"
    COMPLETED = "completed"
    FAILED = "failed"
    COMPENSATED = "compensated"

class RechargePaymentSaga:
    """
    Implements a saga pattern for recharge payments to ensure consistency
    between Firestore and PostgreSQL, with proper referral handling.
    """
    
    def __init__(self):
        self.ensure_saga_table_exists()
    
    def ensure_saga_table_exists(self):
        """Create saga tracking table if it doesn't exist."""
        try:
            # Create the recharge saga table
            execute_query(
                """
                CREATE TABLE IF NOT EXISTS recharge_sagas (
                    saga_id VARCHAR(255) PRIMARY KEY,
                    payment_id VARCHAR(255) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    amount_cents INTEGER NOT NULL,
                    points_to_add INTEGER NOT NULL,
                    referer_id VARCHAR(255),
                    refer_code VARCHAR(255),
                    referral_bonus_points INTEGER,
                    referrer_points INTEGER,
                    status VARCHAR(50) NOT NULL,
                    firestore_snapshot TEXT,
                    error_message TEXT,
                    compensation_details TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """,
                fetch=False
            )

            # Create indexes
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_recharge_sagas_payment_id ON recharge_sagas(payment_id)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_recharge_sagas_user_id ON recharge_sagas(user_id)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_recharge_sagas_status ON recharge_sagas(status)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_recharge_sagas_created_at ON recharge_sagas(created_at)",
                fetch=False
            )

            logger.info("Ensured recharge_sagas table exists")
        except Exception as e:
            logger.error(f"Error creating recharge_sagas table: {e}")
    
    @idempotent_payment_operation(
        operation_type="recharge",
        get_idempotency_key=lambda kwargs: kwargs['payment_id'],
        get_user_id=lambda kwargs: kwargs['user_id']
    )
    async def execute_recharge_payment(
        self,
        payment_id: str,
        user_id: str,
        amount_cents: int,
        amount_dollars: float,
        points_to_add: int,
        base_points_for_referral: Optional[int] = None,
        referer_id: Optional[str] = None,
        refer_code: Optional[str] = None,
        db_client: AsyncClient = None
    ) -> Dict[str, Any]:
        """
        Execute a recharge payment with saga pattern for consistency.
        
        This method ensures that all operations either complete successfully
        or are rolled back, preventing partial updates that could lead to
        inconsistent state or lost money.
        """
        saga_id = f"recharge_saga_{payment_id}_{uuid.uuid4().hex[:8]}"
        referral_bonus_points = 0
        referrer_points = 0
        
        try:
            logger.info(f"Starting recharge saga {saga_id} for payment {payment_id}")
            
            # 1. Create saga record
            self._create_saga_record(
                saga_id, payment_id, user_id, amount_cents, 
                points_to_add, referer_id, refer_code
            )
            
            # 2. Validate user exists
            user = await self._validate_user(user_id, db_client)
            self._update_saga_status(saga_id, RechargeSagaStatus.USER_VALIDATED)
            
            # 3. Calculate referral bonuses if applicable
            if referer_id and refer_code:
                # IMPORTANT: Affiliate bonus is based on original base points, not after tier bonus
                effective_base_points = base_points_for_referral if base_points_for_referral is not None else points_to_add
                referral_bonus_points, referrer_points = await self._validate_and_calculate_referral(
                    user_id, referer_id, refer_code, effective_base_points, db_client
                )
                points_to_add += referral_bonus_points
                self._update_saga_referral_info(saga_id, referral_bonus_points, referrer_points)
                self._update_saga_status(saga_id, RechargeSagaStatus.REFERRAL_VALIDATED)
            
            # 4. Create Firestore snapshot for potential rollback
            firestore_snapshot = await self._create_firestore_snapshot(
                user_id, referer_id, db_client
            )
            self._update_saga_snapshot(saga_id, firestore_snapshot)
            
            # 5. Execute Firestore updates in a transaction
            firestore_updates = await self._execute_firestore_updates(
                user_id, points_to_add, amount_dollars, referer_id, 
                refer_code, referrer_points, db_client
            )
            self._update_saga_status(saga_id, RechargeSagaStatus.FIRESTORE_UPDATED)
            
            # 6. Execute SQL updates
            sql_transaction_id = self._execute_sql_updates(
                user_id, amount_dollars, points_to_add, payment_id
            )
            self._update_saga_status(saga_id, RechargeSagaStatus.SQL_UPDATED)
            
            # 7. Apply referral bonuses if applicable
            if referer_id and referrer_points > 0:
                await self._apply_referral_bonus(
                    referer_id, referrer_points, user_id, db_client
                )
                self._update_saga_status(saga_id, RechargeSagaStatus.REFERRAL_BONUS_APPLIED)
            
            # 8. Send recharge confirmation email
            try:
                # User email and name should be available from the user object
                if user.email:
                    await send_recharge_confirmation_email(
                        to_email=user.email,
                        to_name=user.displayName or user.username or "Valued Customer",
                        amount=amount_dollars,
                        points_granted=points_to_add,
                        transaction_id=payment_id
                    )
                    logger.info(f"Recharge confirmation email sent to {user.email} for payment {payment_id}")
            except Exception as email_error:
                # Don't fail the transaction if email fails, just log the error
                logger.error(f"Failed to send recharge confirmation email for payment {payment_id}: {email_error}")
            
            # 9. Mark saga as completed
            self._update_saga_status(saga_id, RechargeSagaStatus.COMPLETED)
            
            logger.info(f"Recharge saga {saga_id} completed successfully")
            
            return {
                "status": "success",
                "saga_id": saga_id,
                "payment_id": payment_id,
                "user_id": user_id,
                "points_added": points_to_add,
                "amount_cents": amount_cents,
                "referral_bonus": referral_bonus_points,
                "referrer_points": referrer_points,
                "sql_transaction_id": sql_transaction_id
            }
            
        except Exception as e:
            logger.error(f"Recharge saga {saga_id} failed: {str(e)}", exc_info=True)
            
            # Record failure
            self._update_saga_error(saga_id, str(e))
            
            # Attempt compensation
            try:
                compensation_result = await self._compensate_saga(
                    saga_id, 
                    firestore_snapshot if 'firestore_snapshot' in locals() else None,
                    db_client
                )
                self._update_saga_status(saga_id, RechargeSagaStatus.COMPENSATED)
                self._update_saga_compensation(saga_id, compensation_result)
            except Exception as comp_error:
                logger.error(f"Compensation failed for saga {saga_id}: {comp_error}")
            
            # Determine if this is a permanent or transient error
            if isinstance(e, HTTPException) and e.status_code == 400:
                # Permanent error - don't retry
                raise
            
            # Re-raise as 500 for transient errors that should be retried
            raise HTTPException(
                status_code=500,
                detail=f"Recharge processing failed: {str(e)}"
            )
    
    def _create_saga_record(
        self, saga_id: str, payment_id: str, user_id: str,
        amount_cents: int, points_to_add: int,
        referer_id: Optional[str], refer_code: Optional[str]
    ):
        """Create initial saga record."""
        execute_query(
            """
            INSERT INTO recharge_sagas 
            (saga_id, payment_id, user_id, amount_cents, points_to_add, 
             referer_id, refer_code, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (saga_id, payment_id, user_id, amount_cents, points_to_add,
             referer_id or "", refer_code or "", RechargeSagaStatus.PENDING.value),
            fetch=False
        )
    
    def _update_saga_status(self, saga_id: str, status: RechargeSagaStatus):
        """Update saga status."""
        execute_query(
            """
            UPDATE recharge_sagas 
            SET status = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (status.value, datetime.now(), saga_id),
            fetch=False
        )
    
    def _update_saga_referral_info(
        self, saga_id: str, referral_bonus_points: int, referrer_points: int
    ):
        """Update saga with referral calculation results."""
        execute_query(
            """
            UPDATE recharge_sagas 
            SET referral_bonus_points = %s, referrer_points = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (referral_bonus_points, referrer_points, datetime.now(), saga_id),
            fetch=False
        )
    
    def _update_saga_snapshot(self, saga_id: str, snapshot: Dict[str, Any]):
        """Update saga with Firestore snapshot."""
        execute_query(
            """
            UPDATE recharge_sagas
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
            UPDATE recharge_sagas 
            SET status = %s, error_message = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (RechargeSagaStatus.FAILED.value, error_message, datetime.now(), saga_id),
            fetch=False
        )
    
    def _update_saga_compensation(self, saga_id: str, compensation_details: Dict[str, Any]):
        """Update saga with compensation details."""
        execute_query(
            """
            UPDATE recharge_sagas 
            SET compensation_details = %s, updated_at = %s
            WHERE saga_id = %s
            """,
            (json.dumps(compensation_details), datetime.now(), saga_id),
            fetch=False
        )
    
    async def _validate_user(self, user_id: str, db_client: AsyncClient) -> User:
        """Validate user exists and return user object."""
        user = await get_user_by_id(user_id, db_client)
        if not user:
            raise HTTPException(status_code=400, detail=f"User {user_id} not found")
        return user
    
    async def _validate_and_calculate_referral(
        self, user_id: str, referer_id: str, refer_code: str,
        base_points_for_referral: int, db_client: AsyncClient
    ) -> Tuple[int, int]:
        """Validate referral and calculate bonus points."""
        # Verify referrer exists
        referrer = await get_user_by_id(referer_id, db_client)
        if not referrer:
            logger.warning(f"Referrer {referer_id} not found for user {user_id}")
            return 0, 0
        
        # Verify refer code is valid
        refer_code_ref = db_client.collection('refer_codes').document(refer_code)
        refer_code_doc = await refer_code_ref.get()
        
        if not refer_code_doc.exists:
            logger.warning(f"Invalid refer code {refer_code} for user {user_id}")
            return 0, 0
        
        refer_code_data = refer_code_doc.to_dict()
        if refer_code_data.get('referer_id') != referer_id:
            logger.warning(f"Refer code {refer_code} does not belong to referrer {referer_id}")
            return 0, 0
        
        # Calculate bonuses based on base points (no compounding with tier bonuses)
        referral_bonus = int(base_points_for_referral * 0.05)  # 5% bonus for referred user
        referrer_points = int(base_points_for_referral * 0.05)  # 5% bonus for referrer
        
        return referral_bonus, referrer_points
    
    async def _create_firestore_snapshot(
        self, user_id: str, referer_id: Optional[str], 
        db_client: AsyncClient
    ) -> Dict[str, Any]:
        """Create snapshot of current Firestore state for rollback."""
        snapshot = {
            "timestamp": datetime.now().isoformat(),
            "user_id": user_id,
            "referer_id": referer_id
        }
        
        # Snapshot user state
        user_ref = db_client.collection('users').document(user_id)
        user_doc = await user_ref.get()
        if user_doc.exists:
            user_data = user_doc.to_dict()
            snapshot["user"] = {
                "pointsBalance": user_data.get("pointsBalance", 0),
                "totalCashRecharged": user_data.get("totalCashRecharged", 0),
                "referred_by": user_data.get("referred_by")
            }
        
        # Snapshot referrer state if applicable
        if referer_id:
            referrer_ref = db_client.collection('users').document(referer_id)
            referrer_doc = await referrer_ref.get()
            if referrer_doc.exists:
                referrer_data = referrer_doc.to_dict()
                snapshot["referrer"] = {
                    "pointsBalance": referrer_data.get("pointsBalance", 0),
                    "total_point_refered": referrer_data.get("total_point_refered", 0)
                }
            
            # Check if referral relationship exists
            refers_ref = referrer_ref.collection("refers").document(user_id)
            refers_doc = await refers_ref.get()
            if refers_doc.exists:
                snapshot["referral_exists"] = True
                snapshot["referral_data"] = refers_doc.to_dict()
            else:
                snapshot["referral_exists"] = False
        
        return snapshot
    
    async def _execute_firestore_updates(
        self, user_id: str, points_to_add: int, amount_dollars: float,
        referer_id: Optional[str], refer_code: Optional[str],
        referrer_points: int, db_client: AsyncClient
    ) -> Dict[str, Any]:
        """Execute all Firestore updates in a transaction."""
        
        @firestore.async_transactional
        async def update_firestore(transaction: AsyncTransaction):
            updates = {}
            
            # 1. Update user's points and cash recharged
            user_ref = db_client.collection('users').document(user_id)
            amount_int = int(amount_dollars)
            
            transaction.update(user_ref, {
                "pointsBalance": Increment(points_to_add),
                "totalCashRecharged": Increment(amount_int)
            })
            updates["user_updated"] = {
                "points_added": points_to_add,
                "cash_recharged": amount_int
            }
            
            # 2. Update referred_by field if this is first recharge with referral
            if referer_id and refer_code:
                # Check if user already has referred_by set
                user_doc = await user_ref.get()
                user_data = user_doc.to_dict()
                
                if not user_data.get('referred_by') and not user_data.get('refered_by'):
                    # Only update referred_by, NOT the user's own refer_code!
                    transaction.update(user_ref, {
                        "referred_by": referer_id
                        # DO NOT update refer_code - that's the user's own code!
                    })
                    updates["referred_by_set"] = True
                    
                    # 3. Create or update referral relationship
                    referrer_ref = db_client.collection('users').document(referer_id)
                    refers_ref = referrer_ref.collection("refers").document(user_id)
                    
                    refers_doc = await refers_ref.get()
                    if not refers_doc.exists:
                        # First time referral
                        transaction.set(refers_ref, {
                            "user_id": user_id,
                            "points_recharged": points_to_add,
                            "first_recharge_at": datetime.now(),
                            "last_recharge_at": datetime.now()
                        })
                        updates["referral_created"] = True
                    else:
                        # Update existing referral
                        transaction.update(refers_ref, {
                            "points_recharged": Increment(points_to_add),
                            "last_recharge_at": datetime.now()
                        })
                        updates["referral_updated"] = True
            
            return updates
        
        # Execute the transaction
        transaction = db_client.transaction()
        return await update_firestore(transaction)
    
    def _execute_sql_updates(
        self, user_id: str, amount_dollars: float, 
        points_granted: int, payment_id: str
    ) -> int:
        """Execute PostgreSQL updates."""
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                conn.autocommit = False
                
                # Insert cash recharge record
                cursor.execute(
                    """
                    INSERT INTO cash_recharges 
                    (user_id, amount_cash, points_granted, created_at)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                    """,
                    (user_id, amount_dollars, points_granted, datetime.now())
                )
                recharge_id = cursor.fetchone()[0]
                
                # Insert transaction record
                cursor.execute(
                    """
                    INSERT INTO transactions 
                    (user_id, type, amount_cash, points_delta, reference_id, created_at)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (user_id, 'cash_recharge', amount_dollars, points_granted, 
                     payment_id, datetime.now())
                )
                transaction_id = cursor.fetchone()[0]
                
                conn.commit()
                logger.info(f"SQL transaction {transaction_id} committed successfully")
                return transaction_id
                
            except Exception as e:
                conn.rollback()
                logger.error(f"SQL transaction failed: {str(e)}")
                raise
            finally:
                cursor.close()
    
    async def _apply_referral_bonus(
        self, referer_id: str, referrer_points: int, 
        referred_user_id: str, db_client: AsyncClient
    ):
        """Apply referral bonus to the referrer."""
        referrer_ref = db_client.collection('users').document(referer_id)
        
        # Update referrer's points and total referred points
        await referrer_ref.update({
            "pointsBalance": Increment(referrer_points),
            "total_point_refered": Increment(referrer_points)
        })
        
        logger.info(f"Applied {referrer_points} referral bonus points to referrer {referer_id}")
    
    async def _compensate_saga(
        self, saga_id: str, snapshot: Optional[Dict[str, Any]], 
        db_client: AsyncClient
    ) -> Dict[str, Any]:
        """Attempt to compensate/rollback a failed saga."""
        compensation_result = {
            "saga_id": saga_id,
            "compensation_attempted": True,
            "actions": []
        }
        
        if not snapshot:
            logger.error(f"No snapshot available for saga {saga_id} compensation")
            compensation_result["error"] = "No snapshot available"
            return compensation_result
        
        logger.info(f"Attempting compensation for saga {saga_id}")
        
        try:
            # Get current saga state
            saga_data = execute_query(
                "SELECT * FROM recharge_sagas WHERE saga_id = %s",
                (saga_id,),
                fetch=True
            )
            
            if not saga_data:
                compensation_result["error"] = "Saga record not found"
                return compensation_result
            
            saga = saga_data[0]
            status = RechargeSagaStatus(saga['status'])
            
            # Determine what needs to be rolled back based on status
            if status.value in [RechargeSagaStatus.FIRESTORE_UPDATED.value, 
                              RechargeSagaStatus.SQL_UPDATED.value,
                              RechargeSagaStatus.REFERRAL_BONUS_APPLIED.value]:
                
                # Rollback Firestore changes
                if snapshot.get("user"):
                    user_ref = db_client.collection('users').document(saga['user_id'])
                    user_doc = await user_ref.get()
                    
                    if user_doc.exists:
                        current_data = user_doc.to_dict()
                        original_data = snapshot["user"]
                        
                        # Calculate differences
                        points_diff = current_data.get("pointsBalance", 0) - original_data.get("pointsBalance", 0)
                        cash_diff = current_data.get("totalCashRecharged", 0) - original_data.get("totalCashRecharged", 0)
                        
                        # Rollback user data
                        rollback_update = {}
                        if points_diff > 0:
                            rollback_update["pointsBalance"] = Increment(-points_diff)
                        if cash_diff > 0:
                            rollback_update["totalCashRecharged"] = Increment(-cash_diff)
                        
                        if rollback_update:
                            await user_ref.update(rollback_update)
                            compensation_result["actions"].append({
                                "type": "user_rollback",
                                "user_id": saga['user_id'],
                                "rolled_back": rollback_update
                            })
                
                # Rollback referrer changes if applicable
                if saga['referer_id'] and snapshot.get("referrer"):
                    referrer_ref = db_client.collection('users').document(saga['referer_id'])
                    referrer_doc = await referrer_ref.get()
                    
                    if referrer_doc.exists:
                        current_data = referrer_doc.to_dict()
                        original_data = snapshot["referrer"]
                        
                        # Calculate differences
                        points_diff = current_data.get("pointsBalance", 0) - original_data.get("pointsBalance", 0)
                        referred_diff = current_data.get("total_point_refered", 0) - original_data.get("total_point_refered", 0)
                        
                        # Rollback referrer data
                        rollback_update = {}
                        if points_diff > 0:
                            rollback_update["pointsBalance"] = Increment(-points_diff)
                        if referred_diff > 0:
                            rollback_update["total_point_refered"] = Increment(-referred_diff)
                        
                        if rollback_update:
                            await referrer_ref.update(rollback_update)
                            compensation_result["actions"].append({
                                "type": "referrer_rollback",
                                "referer_id": saga['referer_id'],
                                "rolled_back": rollback_update
                            })
                
                # Mark SQL records as compensated (we don't delete them for audit trail)
                if status.value in [RechargeSagaStatus.SQL_UPDATED.value, 
                                  RechargeSagaStatus.REFERRAL_BONUS_APPLIED.value]:
                    execute_query(
                        """
                        UPDATE cash_recharges 
                        SET amount_cash = -amount_cash, points_granted = -points_granted
                        WHERE user_id = %s AND created_at >= %s
                        """,
                        (saga['user_id'], saga['created_at']),
                        fetch=False
                    )
                    compensation_result["actions"].append({
                        "type": "sql_compensation",
                        "description": "Marked SQL records as compensated"
                    })
            
            compensation_result["success"] = True
            return compensation_result
            
        except Exception as e:
            logger.error(f"Error during compensation for saga {saga_id}: {e}")
            compensation_result["error"] = str(e)
            compensation_result["success"] = False
            return compensation_result

# Global saga instance
recharge_payment_saga = RechargePaymentSaga()