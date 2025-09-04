from fastapi import HTTPException, Request
from typing import Tuple
import time
from datetime import datetime, timedelta
from config import settings, get_logger, execute_query

logger = get_logger(__name__)

class CloudSQLRateLimiter:
    """
    Rate limiter using Cloud SQL for Cloud Run deployments.
    Uses a sliding window algorithm with PostgreSQL.
    """
    
    def __init__(self):
        self.ensure_table_exists()
    
    def ensure_table_exists(self):
        """Create rate limit table if it doesn't exist."""
        try:
            execute_query(
                """
                CREATE TABLE IF NOT EXISTS rate_limits (
                    id SERIAL PRIMARY KEY,
                    key VARCHAR(255) NOT NULL,
                    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_key_timestamp (key, timestamp)
                );
                
                -- Create a cleanup function
                CREATE OR REPLACE FUNCTION cleanup_old_rate_limits()
                RETURNS void AS $$
                BEGIN
                    DELETE FROM rate_limits 
                    WHERE timestamp < NOW() - INTERVAL '1 hour';
                END;
                $$ LANGUAGE plpgsql;
                """,
                fetch=False
            )
            logger.info("Ensured rate_limits table exists")
        except Exception as e:
            logger.error(f"Error creating rate limits table: {e}")
    
    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check if request is within rate limits using sliding window.
        
        Returns:
            Tuple[bool, int]: (is_allowed, remaining_requests)
        """
        try:
            window_start = datetime.now() - timedelta(seconds=window_seconds)
            
            # Clean up old entries (do this periodically, not every request in production)
            if hash(key) % 100 == 0:  # Only 1% of requests trigger cleanup
                execute_query(
                    "DELETE FROM rate_limits WHERE timestamp < %s",
                    (datetime.now() - timedelta(hours=1),),
                    fetch=False
                )
            
            # Count requests in current window
            result = execute_query(
                """
                SELECT COUNT(*) as count
                FROM rate_limits
                WHERE key = %s AND timestamp >= %s
                """,
                (key, window_start)
            )
            
            request_count = result[0][0] if result else 0
            
            if request_count >= max_requests:
                return False, 0
            
            # Add current request
            execute_query(
                "INSERT INTO rate_limits (key, timestamp) VALUES (%s, %s)",
                (key, datetime.now()),
                fetch=False
            )
            
            return True, max_requests - request_count - 1
            
        except Exception as e:
            logger.error(f"Rate limit check failed: {e}")
            # On error, allow the request (fail open)
            # In production, you might want to fail closed for payment endpoints
            return True, 0

# Global rate limiter instance
rate_limiter = CloudSQLRateLimiter()

async def payment_rate_limit_middleware(request: Request, call_next):
    """
    Middleware to rate limit payment endpoints for Cloud Run.
    """
    if request.url.path.startswith("/users/") and "payment" in request.url.path:
        # Skip rate limiting for webhooks
        if "webhook" in request.url.path:
            return await call_next(request)
        
        # Extract user ID from path
        path_parts = request.url.path.split("/")
        if len(path_parts) >= 3:
            user_id = path_parts[2]
            
            # Get client IP for additional rate limiting
            # Cloud Run provides the original IP in X-Forwarded-For
            client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
            if not client_ip:
                client_ip = request.client.host if request.client else "unknown"
            
            # Different rate limits for different endpoints
            if "create-intent" in request.url.path:
                max_requests = getattr(settings, 'payment_create_rate_limit', 5)
                window = getattr(settings, 'payment_create_window_seconds', 60)
                endpoint_type = "create_intent"
            elif "create-marketplace-intent" in request.url.path:
                max_requests = getattr(settings, 'marketplace_payment_rate_limit', 10)
                window = getattr(settings, 'marketplace_payment_window_seconds', 60)
                endpoint_type = "marketplace_intent"
            else:
                max_requests = getattr(settings, 'default_payment_rate_limit', 20)
                window = getattr(settings, 'default_payment_window_seconds', 60)
                endpoint_type = "other"
            
            # Check both user-based and IP-based rate limits
            user_key = f"payment:{user_id}:{endpoint_type}"
            ip_key = f"payment_ip:{client_ip}:{endpoint_type}"
            
            # Check user rate limit
            user_allowed, user_remaining = rate_limiter.check_rate_limit(
                user_key, max_requests, window
            )
            
            # Check IP rate limit (stricter for IPs to prevent abuse)
            ip_max_requests = max_requests * 2  # Allow 2x for IP (multiple users behind NAT)
            ip_allowed, ip_remaining = rate_limiter.check_rate_limit(
                ip_key, ip_max_requests, window
            )
            
            if not user_allowed or not ip_allowed:
                logger.warning(
                    f"Rate limit exceeded - User: {user_id}, IP: {client_ip}, "
                    f"Endpoint: {endpoint_type}, User allowed: {user_allowed}, IP allowed: {ip_allowed}"
                )
                raise HTTPException(
                    status_code=429,
                    detail="Too many payment requests. Please try again later.",
                    headers={
                        "X-RateLimit-Limit": str(max_requests),
                        "X-RateLimit-Remaining": str(min(user_remaining, ip_remaining)),
                        "X-RateLimit-Reset": str(int(time.time() + window)),
                        "Retry-After": str(window)
                    }
                )
            
            # Add rate limit headers to response
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(max_requests)
            response.headers["X-RateLimit-Remaining"] = str(min(user_remaining, ip_remaining))
            response.headers["X-RateLimit-Reset"] = str(int(time.time() + window))
            return response
    
    return await call_next(request)