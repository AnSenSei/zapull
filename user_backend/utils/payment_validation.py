from typing import Optional, Tuple
from fastapi import HTTPException
from datetime import datetime, timedelta
from config import settings, get_logger, execute_query

logger = get_logger(__name__)

class PaymentValidator:
    """
    Validates payment amounts and detects potential fraud.
    """
    
    # Payment limits (in cents)
    MIN_PAYMENT_AMOUNT = 100  # $1.00
    MAX_PAYMENT_AMOUNT = 999999  # $9,999.99
    
    # Velocity limits
    MAX_DAILY_AMOUNT = 50000000  # $500,000
    MAX_DAILY_TRANSACTIONS = 200
    MAX_HOURLY_TRANSACTIONS = 50
    
    @staticmethod
    def validate_amount(amount: int, currency: str = "usd") -> Tuple[bool, Optional[str]]:
        """
        Validate payment amount.
        
        Returns:
            Tuple[bool, Optional[str]]: (is_valid, error_message)
        """
        # Check if amount is positive integer
        if not isinstance(amount, int) or amount <= 0:
            return False, "Amount must be a positive integer"
        
        # Check minimum amount
        if amount < PaymentValidator.MIN_PAYMENT_AMOUNT:
            return False, f"Amount must be at least ${PaymentValidator.MIN_PAYMENT_AMOUNT/100:.2f}"
        
        # Check maximum amount
        if amount > PaymentValidator.MAX_PAYMENT_AMOUNT:
            return False, f"Amount cannot exceed ${PaymentValidator.MAX_PAYMENT_AMOUNT/100:.2f}"
        
        # Check currency
        supported_currencies = ["usd"]  # Add more as needed
        if currency.lower() not in supported_currencies:
            return False, f"Currency '{currency}' is not supported"
        
        return True, None
    
    @staticmethod
    async def check_velocity_limits(user_id: str, amount: int) -> Tuple[bool, Optional[str]]:
        """
        Check if user is within velocity limits.
        
        Returns:
            Tuple[bool, Optional[str]]: (is_within_limits, error_message)
        """
        try:
            # Check daily limits
            daily_stats = execute_query(
                """
                SELECT COUNT(*) as count, COALESCE(SUM(amount_cash * 100), 0) as total
                FROM cash_recharges
                WHERE user_id = %s AND created_at >= %s
                """,
                (user_id, datetime.now() - timedelta(days=1))
            )
            
            if daily_stats:
                daily_count, daily_total = daily_stats[0]
                
                # Check daily transaction count
                if daily_count >= PaymentValidator.MAX_DAILY_TRANSACTIONS:
                    return False, "Daily transaction limit exceeded"
                
                # Check daily amount limit
                if daily_total + amount > PaymentValidator.MAX_DAILY_AMOUNT:
                    return False, "Daily payment amount limit exceeded"
            
            # Check hourly limits
            hourly_stats = execute_query(
                """
                SELECT COUNT(*) as count
                FROM cash_recharges
                WHERE user_id = %s AND created_at >= %s
                """,
                (user_id, datetime.now() - timedelta(hours=1))
            )
            
            if hourly_stats:
                hourly_count = hourly_stats[0][0]
                
                if hourly_count >= PaymentValidator.MAX_HOURLY_TRANSACTIONS:
                    return False, "Too many transactions in the last hour"
            
            return True, None
            
        except Exception as e:
            logger.error(f"Error checking velocity limits: {e}")
            # In case of error, allow the transaction (fail open)
            return True, None
    
    


# Standalone validation functions for direct use

async def validate_payment_amount(amount: int, currency: str = "usd") -> None:
    """
    Validate payment amount and raise HTTPException if invalid.
    """
    is_valid, error_msg = PaymentValidator.validate_amount(amount, currency)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)


async def check_payment_velocity(user_id: str, amount: int) -> None:
    """
    Check velocity limits and raise HTTPException if exceeded.
    """
    is_within_limits, error_msg = await PaymentValidator.check_velocity_limits(user_id, amount)
    if not is_within_limits:
        raise HTTPException(status_code=429, detail=error_msg)