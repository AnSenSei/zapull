from typing import Dict, Any
from google.cloud.firestore_v1 import AsyncClient
from fastapi import HTTPException
from config import get_logger
from config.db_connection import db_connection
# No need for storage utils - R2 URLs are public

logger = get_logger(__name__)

async def get_user_pack_opening_history(user_id: str, page: int = 1, per_page: int = 10) -> Dict[str, Any]:
    """
    Get a user's pack opening history.
    
    Args:
        user_id: The ID of the user
        page: The page number (default: 1)
        per_page: The number of items per page (default: 10)
    
    Returns:
        A dictionary containing the pack opening history and total count
    """
    try:
        logger.info(f"Getting pack opening history for user {user_id}, page {page}, per_page {per_page}")
        
        # Calculate offset
        offset = (page - 1) * per_page
        
        # Query to get total count
        count_query = "SELECT COUNT(*) FROM pack_openings WHERE user_id = %s"
        
        # Query to get pack openings with pagination
        query = """
            SELECT id, pack_type, pack_count, price_points, 
                   client_seed, nonce, server_seed_hash, server_seed, random_hash, 
                   opened_at
            FROM pack_openings 
            WHERE user_id = %s
            ORDER BY opened_at DESC
            LIMIT %s OFFSET %s
        """
        
        # Execute queries
        with db_connection() as conn:
            cursor = conn.cursor()
            
            # Get total count
            cursor.execute(count_query, (user_id,))
            total_count = cursor.fetchone()[0]
            
            # Get pack openings
            cursor.execute(query, (user_id, per_page, offset))
            
            pack_openings = []
            for row in cursor.fetchall():
                pack_opening = {
                    "id": row[0],
                    "pack_type": row[1],
                    "pack_count": row[2],
                    "price_points": row[3],
                    "client_seed": row[4],
                    "nonce": row[5],
                    "server_seed_hash": row[6],
                    "server_seed": row[7],
                    "random_hash": row[8],
                    "opened_at": row[9].isoformat() if row[9] else None
                }
                pack_openings.append(pack_opening)
            
            cursor.close()
        
        logger.info(f"Retrieved {len(pack_openings)} pack openings for user {user_id}")
        
        return {
            "total_count": total_count,
            "pack_openings": pack_openings
        }
    
    except Exception as e:
        logger.error(f"Error getting pack opening history for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get pack opening history: {str(e)}")


async def get_user_marketplace_transactions_as_buyer(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10
) -> Dict[str, Any]:
    """
    Retrieve marketplace transactions where the user is a buyer with pagination.
    
    Args:
        user_id: The ID of the user
        db_client: Firestore async client (used for user verification)
        page: Page number (1-based)
        per_page: Number of transactions per page
        
    Returns:
        Dict containing transactions list and pagination info
        
    Raises:
        HTTPException: If there's an error retrieving the transactions
    """
    try:
        # Verify user exists in Firestore
        from config import settings
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        # Calculate offset for pagination
        offset = (page - 1) * per_page
        
        # Use SQL to query transactions where user is buyer
        with db_connection() as conn:
            cursor = conn.cursor()
            
            # Get total count for pagination
            cursor.execute(
                "SELECT COUNT(*) FROM marketplace_transactions WHERE buyer_id = %s",
                (user_id,)
            )
            total_items = cursor.fetchone()[0]
            
            # Get paginated transactions ordered by traded_at desc
            cursor.execute(
                """
                SELECT listing_id, seller_id, buyer_id, card_id, quantity, 
                       price_points, price_cash, traded_at
                FROM marketplace_transactions 
                WHERE buyer_id = %s 
                ORDER BY traded_at DESC 
                LIMIT %s OFFSET %s
                """,
                (user_id, per_page, offset)
            )
            
            transactions = []
            for row in cursor.fetchall():
                card_reference = row[3]  # This now contains the full card reference
                
                # Initialize transaction data
                transaction = {
                    "quantity": row[4],
                    "price_points": row[5],
                    "price_cash": float(row[6]) if row[6] else None,
                    "traded_at": row[7].isoformat() if row[7] else None,
                    "card_name": None,
                    "signed_url": None
                }
                
                # Fetch card information from Firestore using the card reference
                if card_reference:
                    try:
                        card_doc = await db_client.document(card_reference).get()
                        if card_doc.exists:
                            card_data = card_doc.to_dict()
                            transaction["card_name"] = card_data.get("card_name", "Unknown Card")
                            
                            # R2 URLs are public, no need to sign them
                            image_url = card_data.get("image_url")
                            if image_url:
                                transaction["signed_url"] = image_url
                    except Exception as e:
                        logger.warning(f"Failed to fetch card data for reference {card_reference}: {e}")
                
                transactions.append(transaction)
            
            cursor.close()
        
        # Calculate pagination info
        import math
        total_pages = math.ceil(total_items / per_page) if total_items > 0 else 0
        
        return {
            "transactions": transactions,
            "pagination": {
                "total_items": total_items,
                "total_pages": total_pages,
                "current_page": page,
                "per_page": per_page
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting buyer marketplace transactions for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get buyer marketplace transactions: {str(e)}")


async def get_user_marketplace_transactions_as_seller(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10
) -> Dict[str, Any]:
    """
    Retrieve marketplace transactions where the user is a seller with pagination.
    
    Args:
        user_id: The ID of the user
        db_client: Firestore async client (used for user verification)
        page: Page number (1-based)
        per_page: Number of transactions per page
        
    Returns:
        Dict containing transactions list and pagination info
        
    Raises:
        HTTPException: If there's an error retrieving the transactions
    """
    try:
        # Verify user exists in Firestore
        from config import settings
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        # Calculate offset for pagination
        offset = (page - 1) * per_page
        
        # Use SQL to query transactions where user is seller
        with db_connection() as conn:
            cursor = conn.cursor()
            
            # Get total count for pagination
            cursor.execute(
                "SELECT COUNT(*) FROM marketplace_transactions WHERE seller_id = %s",
                (user_id,)
            )
            total_items = cursor.fetchone()[0]
            
            # Get paginated transactions ordered by traded_at desc
            cursor.execute(
                """
                SELECT listing_id, seller_id, buyer_id, card_id, quantity, 
                       price_points, price_cash, traded_at
                FROM marketplace_transactions 
                WHERE seller_id = %s 
                ORDER BY traded_at DESC
                LIMIT %s OFFSET %s
                """,
                (user_id, per_page, offset)
            )
            
            transactions = []
            for row in cursor.fetchall():
                card_reference = row[3]  # This now contains the full card reference
                
                # Initialize transaction data
                transaction = {
                    "quantity": row[4],
                    "price_points": row[5],
                    "price_cash": float(row[6]) if row[6] else None,
                    "traded_at": row[7].isoformat() if row[7] else None,
                    "card_name": None,
                    "signed_url": None
                }
                
                # Fetch card information from Firestore using the card reference
                if card_reference:
                    try:
                        card_doc = await db_client.document(card_reference).get()
                        if card_doc.exists:
                            card_data = card_doc.to_dict()
                            transaction["card_name"] = card_data.get("card_name", "Unknown Card")
                            
                            # R2 URLs are public, no need to sign them
                            image_url = card_data.get("image_url")
                            if image_url:
                                transaction["signed_url"] = image_url
                    except Exception as e:
                        logger.warning(f"Failed to fetch card data for reference {card_reference}: {e}")
                
                transactions.append(transaction)
            
            cursor.close()
        
        # Calculate pagination info
        import math
        total_pages = math.ceil(total_items / per_page) if total_items > 0 else 0
        
        return {
            "transactions": transactions,
            "pagination": {
                "total_items": total_items,
                "total_pages": total_pages,
                "current_page": page,
                "per_page": per_page
            }
        }
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting seller marketplace transactions for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get seller marketplace transactions: {str(e)}")


async def get_user_recharge_history(user_id: str, db_client: AsyncClient, page: int = 1, page_size: int = 20) -> Dict[str, Any]:
    """
    Retrieve a user's recharge history with pagination.

    Args:
        user_id: The ID of the user
        db_client: Firestore client
        page: Page number (1-based)
        page_size: Number of items per page

    Returns:
        Dict containing the user's recharge history with pagination

    Raises:
        HTTPException: If there's an error retrieving the data or user not found
    """
    try:
        # Validate user_id by checking if user exists in Firestore
        from config import settings
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            logger.error(f"User with ID {user_id} not found when fetching recharge history")
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()

        # Get total amount recharged from Firestore
        total_cash_recharged = user_data.get("totalCashRecharged", 0)

        # Calculate offset
        offset = (page - 1) * page_size

        # Query the cash_recharges table in PostgreSQL
        recharge_history = []
        total_count = 0
        
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                # Get total count
                cursor.execute(
                    "SELECT COUNT(*) FROM cash_recharges WHERE user_id = %s",
                    (user_id,)
                )
                total_count = cursor.fetchone()[0]
                
                # Get paginated records
                cursor.execute(
                    """
                    SELECT id, amount_cash, points_granted, created_at 
                    FROM cash_recharges 
                    WHERE user_id = %s 
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                    """,
                    (user_id, page_size, offset)
                )

                # Convert query results to a list of dictionaries
                recharge_records = cursor.fetchall()

                # Create list of dictionaries from results
                for record in recharge_records:
                    recharge_dict = {
                        "id": record[0],
                        "amount_cash": float(record[1]) if record[1] else 0,
                        "points_granted": record[2],
                        "created_at": record[3].isoformat() if record[3] else None
                    }
                    recharge_history.append(recharge_dict)

            except Exception as db_error:
                logger.error(f"Database error when fetching recharge history for user {user_id}: {str(db_error)}")
                raise HTTPException(
                    status_code=500,
                    detail=f"Failed to retrieve recharge history: {str(db_error)}"
                )
            finally:
                cursor.close()

        # Calculate pagination info
        import math
        total_pages = math.ceil(total_count / page_size) if total_count > 0 else 0
        has_next = offset + page_size < total_count

        # Return the user's recharge information with pagination
        return {
            "user_id": user_id,
            "total_cash_recharged": total_cash_recharged,
            "recharge_history": recharge_history,
            "pagination": {
                "total_count": total_count,
                "total_pages": total_pages,
                "current_page": page,
                "page_size": page_size,
                "has_next": has_next
            }
        }

    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        logger.error(f"Error retrieving recharge history for user {user_id}: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )