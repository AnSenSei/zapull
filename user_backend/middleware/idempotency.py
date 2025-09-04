from fastapi import Request, Response, HTTPException
from typing import Dict, Optional, Any
import json
import hashlib
import time
from datetime import datetime, timedelta
from config import get_logger, execute_query

logger = get_logger(__name__)

class IdempotencyManager:
    """
    Manages idempotency for payment requests to prevent duplicate charges.
    Stores idempotency keys and their results in PostgreSQL.
    """
    
    def __init__(self):
        self.ensure_table_exists()
    
    def ensure_table_exists(self):
        """Create idempotency table if it doesn't exist."""
        try:
            execute_query(
                """
                CREATE TABLE IF NOT EXISTS payment_idempotency (
                    idempotency_key VARCHAR(255) PRIMARY KEY,
                    user_id VARCHAR(255) NOT NULL,
                    request_hash VARCHAR(64) NOT NULL,
                    response_data TEXT,
                    status_code INT,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    expires_at TIMESTAMP NOT NULL,
                    INDEX idx_user_id (user_id),
                    INDEX idx_expires_at (expires_at)
                )
                """,
                fetch=False
            )
            logger.info("Ensured payment_idempotency table exists")
        except Exception as e:
            logger.error(f"Error creating idempotency table: {e}")
    
    def _generate_request_hash(self, request_data: Dict[str, Any]) -> str:
        """Generate a hash of the request data for comparison."""
        # Sort keys for consistent hashing
        sorted_data = json.dumps(request_data, sort_keys=True)
        return hashlib.sha256(sorted_data.encode()).hexdigest()
    
    async def check_idempotency(
        self,
        idempotency_key: str,
        user_id: str,
        request_data: Dict[str, Any],
        ttl_hours: int = 24
    ) -> Optional[Dict[str, Any]]:
        """
        Check if this is a duplicate request.
        
        Returns:
            None if this is a new request
            Dict with previous response data if this is a duplicate
        """
        try:
            # Clean up expired entries
            execute_query(
                "DELETE FROM payment_idempotency WHERE expires_at < %s",
                (datetime.now(),),
                fetch=False
            )
            
            # Check for existing idempotency key
            result = execute_query(
                """
                SELECT request_hash, response_data, status_code, created_at
                FROM payment_idempotency
                WHERE idempotency_key = %s AND user_id = %s AND expires_at > %s
                """,
                (idempotency_key, user_id, datetime.now())
            )
            
            if result:
                stored_hash, response_data, status_code, created_at = result[0]
                current_hash = self._generate_request_hash(request_data)
                
                # Check if the request data matches
                if stored_hash != current_hash:
                    logger.warning(
                        f"Idempotency key {idempotency_key} reused with different request data"
                    )
                    raise HTTPException(
                        status_code=422,
                        detail="Idempotency key used with different request parameters"
                    )
                
                # Return the previous response
                logger.info(f"Returning cached response for idempotency key {idempotency_key}")
                return {
                    "response_data": json.loads(response_data) if response_data else None,
                    "status_code": status_code,
                    "cached": True,
                    "original_timestamp": created_at.isoformat()
                }
            
            # Store the idempotency key (without response yet)
            request_hash = self._generate_request_hash(request_data)
            expires_at = datetime.now() + timedelta(hours=ttl_hours)
            
            execute_query(
                """
                INSERT INTO payment_idempotency 
                (idempotency_key, user_id, request_hash, expires_at)
                VALUES (%s, %s, %s, %s)
                """,
                (idempotency_key, user_id, request_hash, expires_at),
                fetch=False
            )
            
            return None
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error checking idempotency: {e}")
            # In case of database errors, allow the request to proceed
            # Better to risk a duplicate than to block all payments
            return None
    
    async def store_response(
        self,
        idempotency_key: str,
        user_id: str,
        response_data: Any,
        status_code: int
    ):
        """Store the response for an idempotency key."""
        try:
            response_json = json.dumps(response_data) if response_data else None
            
            execute_query(
                """
                UPDATE payment_idempotency
                SET response_data = %s, status_code = %s
                WHERE idempotency_key = %s AND user_id = %s
                """,
                (response_json, status_code, idempotency_key, user_id),
                fetch=False
            )
        except Exception as e:
            logger.error(f"Error storing idempotency response: {e}")

# Global idempotency manager
idempotency_manager = IdempotencyManager()

async def idempotency_middleware(request: Request, call_next):
    """
    Middleware to handle idempotency for payment endpoints.
    """
    # Only apply to payment creation endpoints
    if request.url.path.endswith("/create-intent") or request.url.path.endswith("/create-marketplace-intent"):
        # Get idempotency key from header
        idempotency_key = request.headers.get("Idempotency-Key")
        
        if idempotency_key:
            # Extract user ID from path
            path_parts = request.url.path.split("/")
            if len(path_parts) >= 3:
                user_id = path_parts[2]
                
                # Get request body
                body = await request.body()
                request_data = json.loads(body) if body else {}
                
                # Check for duplicate request
                cached_response = await idempotency_manager.check_idempotency(
                    idempotency_key, user_id, request_data
                )
                
                if cached_response:
                    # Return cached response
                    return Response(
                        content=json.dumps(cached_response["response_data"]),
                        status_code=cached_response["status_code"],
                        headers={
                            "Content-Type": "application/json",
                            "X-Idempotent-Replayed": "true",
                            "X-Original-Timestamp": cached_response["original_timestamp"]
                        }
                    )
                
                # Reconstruct request with body
                request._body = body
                
                # Process the request
                response = await call_next(request)
                
                # Store the response if successful
                if 200 <= response.status_code < 300:
                    response_body = b""
                    async for chunk in response.body_iterator:
                        response_body += chunk
                    
                    # Store response
                    await idempotency_manager.store_response(
                        idempotency_key,
                        user_id,
                        json.loads(response_body),
                        response.status_code
                    )
                    
                    # Return response with idempotency header
                    return Response(
                        content=response_body,
                        status_code=response.status_code,
                        headers=dict(response.headers) | {"X-Idempotent-Key": idempotency_key}
                    )
                
                return response
    
    return await call_next(request)