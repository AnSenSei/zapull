
from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient

from config import get_logger, settings
from config.db_connection import db_connection
from models.schemas import RankEntry, LevelRankEntry, ChallengerRankEntry, TopCard
# No need for storage utils - R2 URLs are public

logger = get_logger(__name__)

async def get_weekly_spending_rank(db_client: AsyncClient, week_id: Optional[str] = None, page: int = 1, per_page: int = 10, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get the top 100 users by weekly spending for a specific week with pagination.

    Args:
        db_client: Firestore async client
        week_id: The week ID in the format 'YYYY-MM-DD' (default: current week in US Central timezone)
        page: The page number (default: 1)
        per_page: The number of items per page (default: 10)
        user_id: Optional user ID to get their rank and spent amount

    Returns:
        Dict[str, Any]: A dictionary containing:
            - 'rankings': List[RankEntry] of top users (paginated from top 100)
            - 'pagination': Dict with 'page', 'per_page', 'total_items', 'total_pages'
            - 'user_rank': Optional dict with 'rank' and 'spent' if user_id is provided

    Raises:
        HTTPException: If there's an error getting the weekly spending rank
    """
    try:
        # If week_id is not provided, calculate the current week's ID using Eastern timezone
        if not week_id:
            # Use Eastern timezone to match the frontend EDT display
            eastern_tz = ZoneInfo("America/New_York")
            today = datetime.now(eastern_tz)
            start_of_week = today - timedelta(days=today.weekday())
            week_id = start_of_week.strftime("%Y-%m-%d")

        # Reference to the weekly_spent collection for the specified week
        weekly_spent_ref = db_client.collection('weekly_spent').document('weekly_spent').collection(week_id)

        # Get the top 100 users by spending (frontend will handle tie-breaking)
        top_100_query = weekly_spent_ref.order_by('spent', direction=firestore.Query.DESCENDING).limit(100)
        top_100_docs = await top_100_query.get()
        
        # Total items is the minimum of 100 or the actual count
        total_items = len(top_100_docs)
        
        # Calculate pagination for top 100
        total_pages = (min(total_items, 100) + per_page - 1) // per_page if per_page > 0 else 0
        offset = (page - 1) * per_page
        
        # Get the slice of documents for the current page
        start_idx = offset
        end_idx = min(offset + per_page, total_items)
        docs = top_100_docs[start_idx:end_idx] if start_idx < total_items else []

        # Convert the documents to RankEntry objects and fetch user details
        rankings = []
        user_rank_info = None
        processed_urls = {}  # Cache to avoid regenerating the same URL multiple times in this request
        
        for index, doc in enumerate(docs):
            data = doc.to_dict()
            spent = data.get('spent', 0)
            updated_at = data.get('updatedAt', None)
            
            # Get display name and avatar from the weekly_spent document itself
            display_name = data.get('displayName', None)
            avatar = data.get('avatar', None)
            
            # If display name or avatar are not in weekly_spent doc, fetch from users collection
            if display_name is None or avatar is None:
                user_doc = await db_client.collection(settings.firestore_collection_users).document(doc.id).get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    if display_name is None:
                        display_name = user_data.get('displayName', None)
                    if avatar is None:
                        avatar = user_data.get('avatar', None)
            
            # Generate and cache signed URL for avatar if it exists
            if avatar:
                # Check if we've already processed this avatar in this request
                if avatar in processed_urls:
                    avatar = processed_urls[avatar]
                else:
                    try:
                        # R2 URLs are public; no signing required. Just reuse the URL.
                        signed_avatar = avatar
                        processed_urls[avatar] = signed_avatar
                        avatar = signed_avatar
                        logger.debug(f"Using public avatar URL for user {doc.id}")
                    except Exception as e:
                        logger.error(f"Failed to process avatar URL for user {doc.id}: {e}")
                        processed_urls[avatar] = avatar
                        # Keep the original avatar URL if processing fails
            
            entry = RankEntry(user_id=doc.id, spent=spent, display_name=display_name, avatar=avatar, updated_at=updated_at)
            rankings.append(entry)
            
            # Calculate the actual rank (accounting for pagination)
            actual_rank = offset + index + 1
            
            # Check if this is the requested user
            if user_id and doc.id == user_id:
                user_rank_info = {'rank': actual_rank, 'spent': spent}
        
        # If user_id is provided but not found in top rankings, check if they exist in the collection
        if user_id and not user_rank_info:
            user_doc = await weekly_spent_ref.document(user_id).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                user_spent = user_data.get('spent', 0)
                
                # Count how many users have more points to determine rank
                count_query = weekly_spent_ref.where('spent', '>', user_spent)
                count_docs = await count_query.get()
                user_rank = len(count_docs) + 1
                
                user_rank_info = {'rank': user_rank, 'spent': user_spent}

        result = {
            'rankings': rankings,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_items': total_items,
                'total_pages': total_pages
            }
        }
        if user_rank_info:
            result['user_rank'] = user_rank_info
            
        return result
    except Exception as e:
        logger.error(f"Error getting weekly spending rank for week {week_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get weekly spending rank: {str(e)}")

async def get_top_level_users(db_client: AsyncClient, page: int = 1, per_page: int = 10, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get the top 100 users by level, sorted by total_drawn with pagination.

    Args:
        db_client: Firestore async client
        page: The page number (default: 1)
        per_page: The number of items per page (default: 10)
        user_id: Optional user ID to get their rank and level information

    Returns:
        Dict[str, Any]: A dictionary containing:
            - 'rankings': List[LevelRankEntry] of top users (paginated from top 100)
            - 'pagination': Dict with 'page', 'per_page', 'total_items', 'total_pages'
            - 'user_rank': Optional dict with 'rank' and 'level' if user_id is provided

    Raises:
        HTTPException: If there's an error getting the top level users
    """
    try:
        # Reference to the users collection
        users_ref = db_client.collection(settings.firestore_collection_users)

        # First, get the top 100 users
        top_100_query = users_ref.order_by('total_drawn', direction=firestore.Query.DESCENDING).limit(100)
        top_100_docs = await top_100_query.get()
        
        # Total items is the minimum of 100 or the actual count
        total_items = len(top_100_docs)
        
        # Calculate pagination for top 100
        total_pages = (min(total_items, 100) + per_page - 1) // per_page if per_page > 0 else 0
        offset = (page - 1) * per_page
        
        # Get the slice of documents for the current page
        start_idx = offset
        end_idx = min(offset + per_page, total_items)
        docs = top_100_docs[start_idx:end_idx] if start_idx < total_items else []

        # Convert the documents to LevelRankEntry objects
        rankings = []
        user_rank_info = None
        processed_urls = {}  # Cache to avoid regenerating the same URL multiple times in this request
        
        for index, doc in enumerate(docs):
            data = doc.to_dict()
            total_drawn = data.get('total_drawn', 0)
            level = data.get('level', 1)
            display_name = data.get('displayName', None)
            avatar = data.get('avatar', None)

            # Generate and cache signed URL for avatar if it exists
            if avatar:
                # Check if we've already processed this avatar in this request
                if avatar in processed_urls:
                    avatar = processed_urls[avatar]
                else:
                    try:
                        # R2 URLs are public; no signing required. Just reuse the URL.
                        signed_avatar = avatar
                        processed_urls[avatar] = signed_avatar
                        avatar = signed_avatar
                        logger.debug(f"Using public avatar URL for user {doc.id}")
                    except Exception as e:
                        logger.error(f"Failed to process avatar URL for user {doc.id}: {e}")
                        processed_urls[avatar] = avatar
                        # Keep the original avatar URL if processing fails

            entry = LevelRankEntry(
                user_id=doc.id, 
                total_drawn=total_drawn, 
                level=level,
                display_name=display_name,
                avatar=avatar
            )
            rankings.append(entry)
            
            # Calculate the actual rank (accounting for pagination)
            actual_rank = offset + index + 1
            
            # Check if this is the requested user
            if user_id and doc.id == user_id:
                user_rank_info = {'rank': actual_rank, 'level': level}
        
        # If user_id is provided but not found in top rankings, check if they exist in the collection
        if user_id and not user_rank_info:
            user_doc = await users_ref.document(user_id).get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                user_total_drawn = user_data.get('total_drawn', 0)
                user_level = user_data.get('level', 1)
                
                # Count how many users have more total_drawn to determine rank
                count_query = users_ref.where('total_drawn', '>', user_total_drawn)
                count_docs = await count_query.get()
                user_rank = len(count_docs) + 1
                
                user_rank_info = {'rank': user_rank, 'level': user_level}

        result = {
            'rankings': rankings,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_items': total_items,
                'total_pages': total_pages
            }
        }
        if user_rank_info:
            result['user_rank'] = user_rank_info
            
        return result
    except Exception as e:
        logger.error(f"Error getting top level users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get top level users: {str(e)}")

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
            SELECT id, user_id, pack_type, pack_count, price_points, 
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
                    "user_id": row[1],
                    "pack_type": row[2],
                    "pack_count": row[3],
                    "price_points": row[4],
                    "client_seed": row[5],
                    "nonce": row[6],
                    "server_seed_hash": row[7],
                    "server_seed": row[8],
                    "random_hash": row[9],
                    "opened_at": row[10]
                }
                pack_openings.append(pack_opening)

        logger.info(f"Found {len(pack_openings)} pack openings for user {user_id} (total: {total_count})")

        return {
            "pack_openings": pack_openings,
            "total_count": total_count
        }
    except Exception as e:
        logger.error(f"Error getting pack opening history for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get pack opening history: {str(e)}")

async def get_challenger_rankings(db_client: AsyncClient, user_id: Optional[str] = None) -> Dict[str, Any]:
    """
    Get all challenger rankings based on their top 3 most expensive cards.
    
    This reads from the challenger_ranking collection that is populated by the cloud function.

    Args:
        db_client: Firestore async client
        user_id: Optional user ID to get their rank and total value

    Returns:
        Dict[str, Any]: A dictionary containing:
            - 'rankings': List[ChallengerRankEntry] of all challenger users
            - 'user_rank': Optional dict with 'rank' and 'total_value' if user_id is provided

    Raises:
        HTTPException: If there's an error getting the challenger rankings
    """
    try:
        # Reference to the challenger_ranking collection
        challenger_ranking_ref = db_client.collection('challenger_ranking')
        
        # Get all challenger documents (excluding metadata)
        docs = await challenger_ranking_ref.get()
        
        # Filter out metadata document and convert to list
        challenger_docs = []
        for doc in docs:
            if doc.id != 'metadata':  # Skip metadata document
                doc_data = doc.to_dict()
                if doc_data:
                    challenger_docs.append(doc_data)
        
        # Sort by rank (should already be sorted from cloud function, but ensure it)
        challenger_docs.sort(key=lambda x: x.get('rank', 999))
        
        # Convert all documents to ChallengerRankEntry objects
        rankings = []
        user_rank_info = None
        processed_urls = {}  # Cache for avatars
        
        for doc_data in challenger_docs:
            # Process avatar URL if exists
            avatar = doc_data.get('avatar', '')
            if avatar and avatar not in processed_urls:
                # R2 URLs are public; no signing required
                processed_urls[avatar] = avatar
            elif avatar:
                avatar = processed_urls[avatar]
            
            # Process top cards data
            top_cards = []
            for card_data in doc_data.get('top_cards', []):
                top_card = TopCard(
                    card_name=card_data.get('card_name', ''),
                    point_worth=card_data.get('point_worth', 0),
                    collection_name=card_data.get('collection_name', ''),
                    card_doc_id=card_data.get('card_doc_id', ''),
                    image_url=card_data.get('image_url'),
                    rarity=card_data.get('rarity')
                )
                top_cards.append(top_card)
            
            entry = ChallengerRankEntry(
                user_id=doc_data.get('user_id', ''),
                display_name=doc_data.get('display_name', ''),
                avatar=avatar,
                total_value=doc_data.get('total_value', 0),
                rank=doc_data.get('rank', 0),
                card_count=doc_data.get('card_count', 0),
                top_cards=top_cards,
                updated_at=doc_data.get('updated_at')
            )
            rankings.append(entry)
            
            # Check if this is the requested user
            if user_id and doc_data.get('user_id') == user_id:
                user_rank_info = {
                    'rank': doc_data.get('rank', 0),
                    'total_value': doc_data.get('total_value', 0),
                    'card_count': doc_data.get('card_count', 0),
                    'top_cards': top_cards
                }
        
        result = {
            'rankings': rankings
        }
        if user_rank_info:
            result['user_rank'] = user_rank_info
            
        return result
        
    except Exception as e:
        logger.error(f"Error getting challenger rankings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get challenger rankings: {str(e)}")


async def get_challenger_only_rankings(
    db_client: AsyncClient, 
    user_id: Optional[str] = None,
    limit: Optional[int] = None,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Get challenger rankings specifically for challenger1-challenger100 users only.
    This endpoint is dedicated for challenger accounts and includes detailed top cards information.

    Args:
        db_client: Firestore async client
        user_id: Optional specific challenger user ID to get their rank
        limit: Optional limit on number of results to return
        offset: Number of results to skip for pagination

    Returns:
        Dict[str, Any]: A dictionary containing:
            - 'rankings': List[ChallengerRankEntry] of challenger users with detailed cards
            - 'metadata': Information about the ranking generation
            - 'user_rank': Optional dict with user's rank if user_id provided
            - 'total_challengers': Total number of challengers with rankings

    Raises:
        HTTPException: If there's an error getting the challenger rankings
    """
    try:
        logger.info(f"Getting challenger-only rankings - user_id: {user_id}, limit: {limit}, offset: {offset}")
        
        # Reference to the challenger_ranking collection
        challenger_ranking_ref = db_client.collection('challenger_ranking')
        
        # Get metadata first
        metadata_doc = await challenger_ranking_ref.document('metadata').get()
        metadata = None
        if metadata_doc.exists:
            metadata = metadata_doc.to_dict()
        
        # Get all challenger documents (excluding metadata) with challenger filter
        query = challenger_ranking_ref
        
        # Filter to only include challenger users (challenger1 to challenger100)
        challenger_docs = []
        all_docs = await query.get()
        
        for doc in all_docs:
            if doc.id != 'metadata' and doc.id.startswith('challenger'):
                # Verify it's challenger1-challenger100 format
                try:
                    challenger_num = int(doc.id.replace('challenger', ''))
                    if 1 <= challenger_num <= 100:
                        doc_data = doc.to_dict()
                        if doc_data:
                            challenger_docs.append(doc_data)
                except ValueError:
                    # Skip if not a valid challenger ID format
                    continue
        
        # Sort by rank
        challenger_docs.sort(key=lambda x: x.get('rank', 999))
        
        # Apply pagination if specified
        total_challengers = len(challenger_docs)
        if offset > 0:
            challenger_docs = challenger_docs[offset:]
        if limit and limit > 0:
            challenger_docs = challenger_docs[:limit]
        
        # Convert documents to ChallengerRankEntry objects
        rankings = []
        user_rank_info = None
        processed_urls = {}  # Cache for avatars
        
        for doc_data in challenger_docs:
            # Process avatar URL if exists
            avatar = doc_data.get('avatar', '')
            if avatar and avatar not in processed_urls:
                # R2 URLs are public; no signing required
                processed_urls[avatar] = avatar
            elif avatar:
                avatar = processed_urls[avatar]
            
            # Process top cards data with detailed information
            top_cards = []
            for card_data in doc_data.get('top_cards', []):
                top_card = TopCard(
                    card_name=card_data.get('card_name', ''),
                    point_worth=card_data.get('point_worth', 0),
                    collection_name=card_data.get('collection_name', ''),
                    card_doc_id=card_data.get('card_doc_id', ''),
                    image_url=card_data.get('image_url'),
                    rarity=card_data.get('rarity')
                )
                top_cards.append(top_card)
            
            entry = ChallengerRankEntry(
                user_id=doc_data.get('user_id', ''),
                display_name=doc_data.get('display_name', ''),
                avatar=avatar,
                total_value=doc_data.get('total_value', 0),
                rank=doc_data.get('rank', 0),
                card_count=doc_data.get('card_count', 0),
                top_cards=top_cards,
                updated_at=doc_data.get('updated_at')
            )
            rankings.append(entry)
            
            # Only check for user rank if user_id is provided
            if user_id and doc_data.get('user_id') == user_id:
                user_rank_info = {
                    'rank': doc_data.get('rank', 0),
                    'total_value': doc_data.get('total_value', 0),
                    'card_count': doc_data.get('card_count', 0),
                    'top_cards': top_cards
                }
        
        # If user_id was provided but not found in results, try to find them specifically
        if user_id and not user_rank_info and user_id.startswith('challenger'):
            try:
                challenger_num = int(user_id.replace('challenger', ''))
                if 1 <= challenger_num <= 100:
                    user_doc = await challenger_ranking_ref.document(user_id).get()
                    if user_doc.exists:
                        user_data = user_doc.to_dict()
                        
                        # Process user's top cards
                        user_top_cards = []
                        for card_data in user_data.get('top_cards', []):
                            top_card = TopCard(
                                card_name=card_data.get('card_name', ''),
                                point_worth=card_data.get('point_worth', 0),
                                collection_name=card_data.get('collection_name', ''),
                                card_doc_id=card_data.get('card_doc_id', ''),
                                image_url=card_data.get('image_url'),
                                rarity=card_data.get('rarity')
                            )
                            user_top_cards.append(top_card)
                        
                        user_rank_info = {
                            'rank': user_data.get('rank', 0),
                            'total_value': user_data.get('total_value', 0),
                            'card_count': user_data.get('card_count', 0),
                            'top_cards': user_top_cards
                        }
            except ValueError:
                pass  # Invalid challenger format
        
        result = {
            'rankings': rankings,
            'total_challengers': total_challengers,
            'returned_count': len(rankings),
            'metadata': metadata or {
                'last_updated': None,
                'generation_successful': False,
                'message': 'No metadata available'
            }
        }
        
        if user_rank_info:
            result['user_rank'] = user_rank_info
            
        logger.info(f"Successfully retrieved {len(rankings)} challenger rankings out of {total_challengers} total")
        return result
        
    except Exception as e:
        logger.error(f"Error getting challenger-only rankings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get challenger rankings: {str(e)}")
