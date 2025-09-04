"""
Payment Idempotency Utilities

This module provides improved idempotency handling for payment operations
to prevent duplicate charges and ensure reliable processing.
"""

from typing import Dict, Any, Optional, Callable
from datetime import datetime, timedelta
import hashlib
import json
import asyncio
from functools import wraps
from enum import Enum

from config import get_logger, execute_query, db_connection

logger = get_logger(__name__)

class IdempotencyStatus(Enum):
    """Status of an idempotent operation."""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"

class PaymentIdempotencyManager:
    """
    Manages idempotency for payment operations using a distributed lock pattern.
    """
    
    def __init__(self, expiry_hours: int = 24):
        self.expiry_hours = expiry_hours
        self.ensure_tables_exist()
    
    def ensure_tables_exist(self):
        """Create idempotency tracking tables if they don't exist."""
        try:
            # Enhanced idempotency table with distributed lock support
            execute_query(
                """
                CREATE TABLE IF NOT EXISTS payment_idempotency_v2 (
                    idempotency_key VARCHAR(255) PRIMARY KEY,
                    operation_type VARCHAR(50) NOT NULL,
                    user_id VARCHAR(255) NOT NULL,
                    request_hash VARCHAR(64) NOT NULL,
                    status VARCHAR(20) NOT NULL,
                    response_data TEXT,
                    error_message TEXT,
                    attempt_count INTEGER DEFAULT 1,
                    locked_until TIMESTAMP,
                    locked_by VARCHAR(255),
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL
                )
                """,
                fetch=False
            )
            
            # Create indexes
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_idempotency_v2_user_id ON payment_idempotency_v2(user_id)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_idempotency_v2_status ON payment_idempotency_v2(status)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_idempotency_v2_expires_at ON payment_idempotency_v2(expires_at)",
                fetch=False
            )
            execute_query(
                "CREATE INDEX IF NOT EXISTS idx_idempotency_v2_locked_until ON payment_idempotency_v2(locked_until)",
                fetch=False
            )
            
            logger.info("Ensured payment_idempotency_v2 table exists")
        except Exception as e:
            logger.error(f"Error creating idempotency tables: {e}")
    
    def generate_request_hash(self, request_data: Dict[str, Any]) -> str:
        """Generate a hash of the request data for verification."""
        # Sort keys for consistent hashing
        sorted_data = json.dumps(request_data, sort_keys=True)
        return hashlib.sha256(sorted_data.encode()).hexdigest()
    
    async def acquire_lock(
        self, 
        idempotency_key: str,
        operation_type: str,
        user_id: str,
        request_data: Dict[str, Any],
        lock_duration_seconds: int = 300  # 5 minutes default
    ) -> Optional[Dict[str, Any]]:
        """
        Try to acquire a distributed lock for the idempotency key.
        
        Returns:
        - None if lock acquired successfully (new operation)
        - Dict with existing result if operation already completed
        - Raises exception if operation is in progress or failed
        """
        request_hash = self.generate_request_hash(request_data)
        expires_at = datetime.now() + timedelta(hours=self.expiry_hours)
        locked_until = datetime.now() + timedelta(seconds=lock_duration_seconds)
        worker_id = f"{asyncio.current_task().get_name()}_{datetime.now().timestamp()}"
        
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                conn.autocommit = False
                
                # First, try to insert a new record
                try:
                    cursor.execute(
                        """
                        INSERT INTO payment_idempotency_v2 
                        (idempotency_key, operation_type, user_id, request_hash, 
                         status, locked_until, locked_by, expires_at)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        """,
                        (idempotency_key, operation_type, user_id, request_hash,
                         IdempotencyStatus.PROCESSING.value, locked_until, worker_id, expires_at)
                    )
                    conn.commit()
                    logger.info(f"Acquired lock for new operation {idempotency_key}")
                    return None  # New operation, proceed
                    
                except Exception as insert_error:
                    # Record already exists, check its status
                    conn.rollback()
                    
                    # Get the existing record with lock
                    cursor.execute(
                        """
                        SELECT status, response_data, error_message, request_hash, 
                               locked_until, locked_by, attempt_count
                        FROM payment_idempotency_v2
                        WHERE idempotency_key = %s
                        FOR UPDATE
                        """,
                        (idempotency_key,)
                    )
                    
                    result = cursor.fetchone()
                    if not result:
                        # Race condition - record was deleted
                        conn.commit()
                        raise Exception("Idempotency record disappeared")
                    
                    status, response_data, error_message, existing_hash, existing_locked_until, locked_by, attempt_count = result
                    
                    # Verify request hash matches
                    if existing_hash != request_hash:
                        conn.commit()
                        raise ValueError(f"Request mismatch for idempotency key {idempotency_key}")
                    
                    # Check status
                    if status == IdempotencyStatus.COMPLETED.value:
                        conn.commit()
                        logger.info(f"Returning cached result for {idempotency_key}")
                        return json.loads(response_data) if response_data else {}
                    
                    elif status == IdempotencyStatus.PROCESSING.value:
                        # Check if lock expired
                        if existing_locked_until and datetime.now() > existing_locked_until:
                            # Lock expired, try to acquire it
                            cursor.execute(
                                """
                                UPDATE payment_idempotency_v2
                                SET locked_until = %s, locked_by = %s, 
                                    attempt_count = attempt_count + 1,
                                    updated_at = %s
                                WHERE idempotency_key = %s AND locked_until = %s
                                """,
                                (locked_until, worker_id, datetime.now(), 
                                 idempotency_key, existing_locked_until)
                            )
                            
                            if cursor.rowcount > 0:
                                conn.commit()
                                logger.info(f"Acquired expired lock for {idempotency_key} (attempt {attempt_count + 1})")
                                return None  # Proceed with operation
                            else:
                                # Someone else got the lock
                                conn.commit()
                                raise Exception(f"Operation {idempotency_key} is being processed by another worker")
                        else:
                            conn.commit()
                            raise Exception(f"Operation {idempotency_key} is currently being processed")
                    
                    elif status == IdempotencyStatus.FAILED.value:
                        # Previous attempt failed, allow retry with backoff
                        if attempt_count >= 3:
                            conn.commit()
                            raise Exception(f"Operation {idempotency_key} has failed too many times: {error_message}")
                        
                        # Update to processing status
                        cursor.execute(
                            """
                            UPDATE payment_idempotency_v2
                            SET status = %s, locked_until = %s, locked_by = %s,
                                attempt_count = attempt_count + 1, updated_at = %s
                            WHERE idempotency_key = %s
                            """,
                            (IdempotencyStatus.PROCESSING.value, locked_until, worker_id,
                             datetime.now(), idempotency_key)
                        )
                        conn.commit()
                        logger.info(f"Retrying failed operation {idempotency_key} (attempt {attempt_count + 1})")
                        return None  # Retry the operation
                    
                    else:
                        conn.commit()
                        raise Exception(f"Unknown status {status} for {idempotency_key}")
                    
            except Exception as e:
                conn.rollback()
                raise
            finally:
                cursor.close()
    
    async def complete_operation(
        self,
        idempotency_key: str,
        response_data: Dict[str, Any]
    ):
        """Mark an operation as completed with its result."""
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    UPDATE payment_idempotency_v2
                    SET status = %s, response_data = %s, 
                        locked_until = NULL, updated_at = %s
                    WHERE idempotency_key = %s
                    """,
                    (IdempotencyStatus.COMPLETED.value, json.dumps(response_data),
                     datetime.now(), idempotency_key)
                )
                conn.commit()
                logger.info(f"Marked operation {idempotency_key} as completed")
            finally:
                cursor.close()
    
    async def fail_operation(
        self,
        idempotency_key: str,
        error_message: str
    ):
        """Mark an operation as failed."""
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    UPDATE payment_idempotency_v2
                    SET status = %s, error_message = %s, 
                        locked_until = NULL, updated_at = %s
                    WHERE idempotency_key = %s
                    """,
                    (IdempotencyStatus.FAILED.value, error_message,
                     datetime.now(), idempotency_key)
                )
                conn.commit()
                logger.info(f"Marked operation {idempotency_key} as failed: {error_message}")
            finally:
                cursor.close()
    
    async def cleanup_expired_records(self):
        """Clean up expired idempotency records."""
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                cursor.execute(
                    """
                    DELETE FROM payment_idempotency_v2
                    WHERE expires_at < %s
                    """,
                    (datetime.now(),)
                )
                deleted = cursor.rowcount
                conn.commit()
                if deleted > 0:
                    logger.info(f"Cleaned up {deleted} expired idempotency records")
            finally:
                cursor.close()

def idempotent_payment_operation(
    operation_type: str,
    get_idempotency_key: Callable[[Dict[str, Any]], str],
    get_user_id: Callable[[Dict[str, Any]], str]
):
    """
    Decorator for making payment operations idempotent.
    
    Args:
        operation_type: Type of operation (e.g., "recharge", "marketplace_payment")
        get_idempotency_key: Function to extract idempotency key from kwargs
        get_user_id: Function to extract user_id from kwargs
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            manager = PaymentIdempotencyManager()
            
            # Extract required data
            idempotency_key = get_idempotency_key(kwargs)
            user_id = get_user_id(kwargs)
            
            # Create request data for hashing
            request_data = {
                k: v for k, v in kwargs.items()
                if k not in ['db_client']  # Exclude non-serializable objects
            }
            
            # Try to acquire lock
            existing_result = await manager.acquire_lock(
                idempotency_key=idempotency_key,
                operation_type=operation_type,
                user_id=user_id,
                request_data=request_data
            )
            
            if existing_result is not None:
                # Operation already completed, return cached result
                return existing_result
            
            try:
                # Execute the operation
                result = await func(*args, **kwargs)
                
                # Mark as completed
                await manager.complete_operation(idempotency_key, result)
                
                return result
                
            except Exception as e:
                # Mark as failed
                await manager.fail_operation(idempotency_key, str(e))
                raise
        
        return wrapper
    return decorator

# Global instance
payment_idempotency_manager = PaymentIdempotencyManager()