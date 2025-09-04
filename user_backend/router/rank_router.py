from fastapi import APIRouter, HTTPException, Depends, Path, Query
from typing import List, Optional, Dict, Any
from google.cloud import firestore
from datetime import datetime, timedelta

from models.schemas import RankEntry, LevelRankEntry, ChallengerRankEntry
from service.rank_service import get_weekly_spending_rank, get_top_level_users, get_challenger_rankings, get_challenger_only_rankings
from config import get_firestore_client, get_logger

logger = get_logger(__name__)

router = APIRouter(
    prefix="/rank",
    tags=["rank"],
)

@router.get("/weekly_spent/weekly_spent", response_model=Dict[str, Any])
async def get_weekly_spending_rank_route(
    page: int = Query(1, description="The page number (default: 1)"),
    per_page: int = Query(10, description="The number of items per page (default: 10)"),
    user_id: Optional[str] = Query(None, description="Optional user ID to get their rank and spent amount"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get the top 100 users by weekly spending for the current week with pagination.

    This endpoint:
    1. Automatically calculates the current week ID (no input required)
    2. Returns a dictionary containing:
       - 'rankings': List of RankEntry objects with user_id, spent, display_name, and avatar (paginated from top 100)
       - 'pagination': Dict with 'page', 'per_page', 'total_items', 'total_pages'
       - 'user_rank': Optional dict with 'rank' and 'spent' if user_id is provided

    The week ID is calculated as the start of the week (Monday) using:
    ```python
    today = datetime.now()
    start_of_week = today - timedelta(days=today.weekday())
    week_id = start_of_week.strftime("%Y-%m-%d")
    ```
    """
    try:
        # Get the top users by weekly spending for the current week
        rank_data = await get_weekly_spending_rank(db, None, page, per_page, user_id)

        # Return the data directly without converting to strings
        # This will include user_id, spent, display_name, and avatar for each entry
        return rank_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting weekly spending rank: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting the weekly spending rank")

@router.get("/top_level", response_model=Dict[str, Any])
async def get_top_level_users_route(
    page: int = Query(1, description="The page number (default: 1)"),
    per_page: int = Query(10, description="The number of items per page (default: 10)"),
    user_id: Optional[str] = Query(None, description="Optional user ID to get their rank and level"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get the top 100 users by level, sorted by total_drawn with pagination.

    This endpoint:
    1. Queries the users collection
    2. Orders the users by total_drawn in descending order
    3. Returns a dictionary containing:
       - 'rankings': List of LevelRankEntry objects with user_id, total_drawn, level, display_name, and avatar (paginated from top 100)
       - 'pagination': Dict with 'page', 'per_page', 'total_items', 'total_pages'
       - 'user_rank': Optional dict with 'rank' and 'level' if user_id is provided
    """
    try:
        # Get the top users by level
        rank_data = await get_top_level_users(db, page, per_page, user_id)

        return rank_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting top level users: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting the top level users")

@router.get("/challenger_rankings", response_model=Dict[str, Any])
async def get_challenger_rankings_route(
    user_id: Optional[str] = Query(None, description="Optional user ID to get their rank and total value"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all challenger rankings based on their top 3 most expensive cards.
    
    This endpoint reads from the challenger_ranking collection that is populated by the cloud function.

    This endpoint:
    1. Queries the challenger_ranking collection
    2. Returns a dictionary containing:
       - 'rankings': List of ChallengerRankEntry objects with user_id, display_name, avatar, total_value, rank, updated_at (all results)
       - 'user_rank': Optional dict with 'rank' and 'total_value' if user_id is provided
    """
    try:
        # Get the challenger rankings
        rank_data = await get_challenger_rankings(db, user_id)

        return rank_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challenger rankings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting the challenger rankings")

@router.get("/challenger", response_model=Dict[str, Any])
async def get_challenger_only_rankings_route(
    user_id: Optional[str] = Query(None, description="Optional challenger user ID (challenger1-challenger100) to get their specific rank"),
    limit: Optional[int] = Query(None, description="Maximum number of challenger rankings to return", ge=1, le=100),
    offset: int = Query(0, description="Number of challenger rankings to skip for pagination", ge=0),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get challenger rankings specifically for challenger1-challenger100 users only.
    
    This dedicated endpoint is for challenger accounts and includes detailed top cards information.
    It only returns data for users with IDs from challenger1 to challenger100.

    Args:
        user_id: Optional specific challenger user ID (challenger1-challenger100)
        limit: Maximum number of rankings to return (1-100)
        offset: Number of rankings to skip for pagination
        db: Firestore database client (injected)

    Returns:
        Dict containing:
        - 'rankings': List of ChallengerRankEntry objects with detailed top cards
        - 'metadata': Information about the ranking generation process
        - 'total_challengers': Total number of challengers with rankings
        - 'returned_count': Number of rankings returned in this response
        - 'user_rank': Optional dict with specific user's rank if user_id provided

    Raises:
        HTTPException: 400 for invalid challenger user_id format, 500 for server errors
    """
    try:
        # Validate user_id format if provided
        if user_id and not user_id.startswith('challenger'):
            raise HTTPException(
                status_code=400,
                detail="user_id must be in format 'challenger1' to 'challenger100'"
            )
        
        if user_id and user_id.startswith('challenger'):
            try:
                challenger_num = int(user_id.replace('challenger', ''))
                if not (1 <= challenger_num <= 100):
                    raise HTTPException(
                        status_code=400,
                        detail="user_id must be between challenger1 and challenger100"
                    )
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail="Invalid challenger user_id format. Must be 'challenger' followed by a number 1-100"
                )

        logger.info(f"Getting challenger-only rankings - user_id: {user_id}, limit: {limit}, offset: {offset}")
        
        # Get the challenger rankings
        rank_data = await get_challenger_only_rankings(db, user_id, limit, offset)

        return rank_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challenger-only rankings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting the challenger rankings")
