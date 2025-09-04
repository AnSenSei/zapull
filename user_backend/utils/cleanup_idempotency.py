"""
Cleanup utility for expired webhook idempotency records.

This module provides functions to clean up old idempotency records
to prevent the database table from growing indefinitely.
"""

import logging
from datetime import datetime
from config.db_connection import db_connection

logger = logging.getLogger(__name__)

def cleanup_expired_idempotency_records() -> int:
    """
    Delete expired idempotency records from the payment_idempotency table.
    
    Returns:
        Number of records deleted
    """
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            
            # Delete records that have expired
            cursor.execute(
                """
                DELETE FROM payment_idempotency 
                WHERE expires_at < %s
                """,
                (datetime.now(),)
            )
            
            deleted_count = cursor.rowcount
            conn.commit()
            
            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} expired idempotency records")
            
            return deleted_count
            
    except Exception as e:
        logger.error(f"Error cleaning up idempotency records: {str(e)}", exc_info=True)
        return 0

def get_idempotency_stats() -> dict:
    """
    Get statistics about the idempotency table.
    
    Returns:
        Dictionary with statistics
    """
    try:
        with db_connection() as conn:
            cursor = conn.cursor()
            
            # Get total count
            cursor.execute("SELECT COUNT(*) FROM payment_idempotency")
            total_count = cursor.fetchone()[0]
            
            # Get expired count
            cursor.execute(
                "SELECT COUNT(*) FROM payment_idempotency WHERE expires_at < %s",
                (datetime.now(),)
            )
            expired_count = cursor.fetchone()[0]
            
            # Get count by status code
            cursor.execute(
                """
                SELECT status_code, COUNT(*) 
                FROM payment_idempotency 
                GROUP BY status_code
                """
            )
            status_counts = dict(cursor.fetchall())
            
            # Get recent failures
            cursor.execute(
                """
                SELECT idempotency_key, status_code, created_at
                FROM payment_idempotency 
                WHERE status_code != 200 AND status_code IS NOT NULL
                ORDER BY created_at DESC
                LIMIT 10
                """
            )
            recent_failures = cursor.fetchall()
            
            return {
                "total_records": total_count,
                "expired_records": expired_count,
                "status_code_counts": status_counts,
                "recent_failures": [
                    {
                        "webhook_id": failure[0],
                        "status_code": failure[1],
                        "created_at": failure[2].isoformat() if failure[2] else None
                    }
                    for failure in recent_failures
                ]
            }
            
    except Exception as e:
        logger.error(f"Error getting idempotency stats: {str(e)}", exc_info=True)
        return {}