from fastapi import HTTPException, Request
from typing import Dict, Tuple
import time
from collections import defaultdict
from datetime import datetime, timedelta
from config import settings, get_logger

logger = get_logger(__name__)

class InMemoryRateLimiter:
    """
    Token bucket rate limiter using in-memory storage.
    Simple implementation suitable for single-instance deployments.
    """
    
    def __init__(self):
        # Store: key -> (tokens_remaining, last_refill_time)
        self.buckets: Dict[str, Tuple[float, float]] = defaultdict(lambda: (0.0, time.time()))
        self._cleanup_interval = 300  # Clean up old entries every 5 minutes
        self._last_cleanup = time.time()
    
    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> Tuple[bool, int]:
        """
        Check if request is within rate limits using token bucket algorithm.
        
        Args:
            key: Unique identifier for rate limiting (e.g., user_id)
            max_requests: Maximum requests allowed in the window
            window_seconds: Time window in seconds
            
        Returns:
            Tuple[bool, int]: (is_allowed, remaining_requests)
        """
        current_time = time.time()
        
        # Periodic cleanup of old entries
        if current_time - self._last_cleanup > self._cleanup_interval:
            self._cleanup_old_entries(current_time)
        
        tokens, last_refill = self.buckets[key]
        
        # Calculate time passed since last refill
        time_passed = current_time - last_refill
        
        # Calculate tokens to add (refill rate = max_requests / window_seconds)
        refill_rate = max_requests / window_seconds
        tokens_to_add = time_passed * refill_rate
        
        # Update tokens (capped at max_requests)
        tokens = min(max_requests, tokens + tokens_to_add)
        
        if tokens >= 1:
            # Consume a token
            tokens -= 1
            self.buckets[key] = (tokens, current_time)
            return True, int(tokens)
        
        # Calculate when the next token will be available
        self.buckets[key] = (tokens, current_time)
        return False, 0
    
    def _cleanup_old_entries(self, current_time: float):
        """Remove entries that haven't been accessed in over an hour."""
        cutoff_time = current_time - 3600  # 1 hour
        keys_to_remove = [
            key for key, (_, last_time) in self.buckets.items()
            if last_time < cutoff_time
        ]
        for key in keys_to_remove:
            del self.buckets[key]
        self._last_cleanup = current_time

# Global rate limiter instance
rate_limiter = InMemoryRateLimiter()

async def payment_rate_limit_middleware(request: Request, call_next):
    """
    Middleware to rate limit payment endpoints.
    """
    if request.url.path.startswith("/users/") and "payment" in request.url.path:
        # Skip rate limiting for webhooks (they come from Stripe, not users)
        if "webhook" in request.url.path:
            return await call_next(request)
        
        # Extract user ID from path
        path_parts = request.url.path.split("/")
        if len(path_parts) >= 3:
            user_id = path_parts[2]
            
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
            
            # Check rate limit with endpoint-specific key
            key = f"payment_rate_limit:{user_id}:{endpoint_type}"
            is_allowed, remaining = rate_limiter.check_rate_limit(
                key, max_requests, window
            )
            
            if not is_allowed:
                logger.warning(f"Rate limit exceeded for user {user_id} on {request.url.path}")
                raise HTTPException(
                    status_code=429,
                    detail="Too many payment requests. Please try again later.",
                    headers={
                        "X-RateLimit-Limit": str(max_requests),
                        "X-RateLimit-Remaining": "0",
                        "X-RateLimit-Reset": str(int(time.time() + window))
                    }
                )
            
            # Add rate limit headers to response
            response = await call_next(request)
            response.headers["X-RateLimit-Limit"] = str(max_requests)
            response.headers["X-RateLimit-Remaining"] = str(remaining)
            response.headers["X-RateLimit-Reset"] = str(int(time.time() + window))
            return response
    
    return await call_next(request)