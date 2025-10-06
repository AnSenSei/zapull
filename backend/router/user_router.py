from fastapi import APIRouter, HTTPException, Query, Path, Depends
from google.cloud.firestore_v1 import AsyncClient
from typing import Optional

from config import get_logger, get_firestore_client
from service.user_service import get_all_users, get_user_by_id, check_user_admin, add_points_to_user
from service.achievement_service import award_achievement_to_user, get_user_achievements
from models.schemas import UserListResponse, User, AddPointsRequest, AddPointsResponse
from models.achievement_schemas import AwardAchievementRequest, AwardAchievementResponse

logger = get_logger(__name__)

router = APIRouter(
    prefix="/users",
    tags=["users"],
    responses={404: {"description": "Not found"}},
)

@router.get("/", response_model=UserListResponse)
async def get_all_users_endpoint(
    page: int = Query(1, description="Page number to retrieve", ge=1),
    per_page: int = Query(10, description="Number of items per page", ge=1, le=100),
    sort_by: str = Query("pointsBalance", description="Field to sort by (pointsBalance, totalCashRecharged, totalPointsSpent, createdAt, displayName, level)"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
    search_query: Optional[str] = Query(None, description="Search query to filter users by displayName"),
    db: AsyncClient = Depends(get_firestore_client)
) -> UserListResponse:
    """
    Get all users with pagination, sorting, and search capabilities.
    
    This endpoint allows you to:
    - Paginate through users with customizable page size
    - Sort by various fields (pointsBalance, totalCashRecharged, totalPointsSpent, etc.)
    - Search users by displayName
    
    Args:
        page: Page number (starting from 1)
        per_page: Number of users per page (max 100)
        sort_by: Field to sort by
        sort_order: Sort order (asc or desc)
        search_query: Optional search term to filter users by displayName
        db: Firestore database client (injected)
    
    Returns:
        UserListResponse containing users, pagination info, and applied filters
    """
    try:
        logger.info(f"Getting users - page: {page}, per_page: {per_page}, sort_by: {sort_by}, sort_order: {sort_order}, search: {search_query}")
        
        # Validate per_page
        if per_page > 100:
            per_page = 100
        
        # Call the service function
        result = await get_all_users(
            db=db,
            page=page,
            per_page=per_page,
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        
        logger.info(f"Successfully retrieved {len(result.users)} users (total: {result.pagination.total_items})")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting users: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.get("/{user_id}", response_model=User)
async def get_user_by_id_endpoint(
    user_id: str = Path(..., description="The ID of the user to retrieve"),
    db: AsyncClient = Depends(get_firestore_client)
) -> User:
    """
    Get a user by their ID.
    
    Args:
        user_id: The ID of the user to retrieve
        db: Firestore database client (injected)
    
    Returns:
        User object containing all user information
        
    Raises:
        HTTPException: 404 if user not found, 500 for server errors
    """
    try:
        logger.info(f"Getting user by ID: {user_id}")
        
        # Call the service function
        user = await get_user_by_id(user_id, db)
        
        if not user:
            logger.info(f"User with ID {user_id} not found")
            raise HTTPException(
                status_code=404,
                detail=f"User with ID {user_id} not found"
            )
        
        logger.info(f"Successfully retrieved user {user_id}")
        return user
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.get("/{user_id}/is-admin")
async def check_user_admin_endpoint(
    user_id: str = Path(..., description="The ID of the user to check"),
    db: AsyncClient = Depends(get_firestore_client)
) -> dict:
    """
    Check if a user has admin privileges.
    
    Args:
        user_id: The ID of the user to check
        db: Firestore database client (injected)
    
    Returns:
        JSON object with 'is_admin' boolean field
        
    Raises:
        HTTPException: 500 for server errors
    """
    try:
        logger.info(f"Checking admin status for user: {user_id}")
        
        # Call the service function
        is_admin = await check_user_admin(user_id, db)
        
        logger.info(f"User {user_id} admin status: {is_admin}")
        return {"is_admin": is_admin}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error checking admin status for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.post("/{user_id}/award-achievement", response_model=AwardAchievementResponse)
async def award_achievement_endpoint(
    user_id: str = Path(..., description="The ID of the user to award the achievement to"),
    achievement_id: str = Query(..., description="The ID of the achievement to award"),
    notes: Optional[str] = Query(None, description="Optional notes about the award")
) -> AwardAchievementResponse:
    """
    Award an achievement to a user.
    
    Args:
        user_id: The ID of the user to award the achievement to
        achievement_id: The ID of the achievement to award
        notes: Optional notes about the award
    
    Returns:
        AwardAchievementResponse: Response containing success status and user achievement data
    
    Raises:
        HTTPException: 400 if user already has achievement, 404 if user or achievement not found, 500 for server errors
    """
    try:
        logger.info(f"Awarding achievement {achievement_id} to user {user_id}")
        
        # Create the award request
        award_request = AwardAchievementRequest(
            user_id=user_id,
            achievement_id=achievement_id,
            notes=notes
        )
        
        # Call the service function
        result = await award_achievement_to_user(award_request)
        
        logger.info(f"Successfully awarded achievement {achievement_id} to user {user_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error awarding achievement {achievement_id} to user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.get("/{user_id}/achievements")
async def get_user_achievements_endpoint(
    user_id: str = Path(..., description="The ID of the user to get achievements for"),
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(10, ge=1, le=100, description="Items per page")
) -> dict:
    """
    Get achievements earned by a specific user.
    
    Args:
        user_id: The ID of the user to get achievements for
        page: Page number (starts from 1)
        size: Number of items per page (between 1 and 100)
    
    Returns:
        Dictionary containing user achievements and pagination info
    
    Raises:
        HTTPException: 500 for server errors
    """
    try:
        logger.info(f"Getting achievements for user {user_id} - page: {page}, size: {size}")
        
        # Call the service function
        result = await get_user_achievements(user_id, page, size)
        
        logger.info(f"Successfully retrieved {len(result['achievements'])} achievements for user {user_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting achievements for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.get("/{user_id}/cards")
async def get_user_cards_endpoint(
    user_id: str = Path(..., description="The ID of the user to get cards for"),
    page: int = Query(1, ge=1, description="Page number"),
    per_page: int = Query(20, ge=1, le=100, description="Items per page"),
    collection_id: Optional[str] = Query(None, description="Filter by collection ID (subcollection name)"),
    search_query: Optional[str] = Query(None, description="Search cards by name"),
    sort_by: str = Query("date_got", description="Field to sort by"),
    sort_order: str = Query("desc", description="Sort order (asc or desc)"),
    db: AsyncClient = Depends(get_firestore_client)
) -> dict:
    """
    Get all cards for a specific user with pagination and filtering.
    
    This endpoint allows administrators to view a user's card collection with:
    - Pagination support
    - Collection filtering
    - Search by card name
    - Sorting options
    
    Args:
        user_id: The ID of the user to get cards for
        page: Page number (starts from 1)
        per_page: Number of cards per page (max 100)
        collection_id: Optional filter by collection/subcollection name
        search_query: Optional search term to filter cards by name
        sort_by: Field to sort by (date_got, card_name, point_worth, rarity)
        sort_order: Sort order (asc or desc)
        db: Firestore database client (injected)
    
    Returns:
        Dictionary containing cards, pagination info, and total counts
        
    Raises:
        HTTPException: 404 if user not found, 500 for server errors
    """
    try:
        logger.info(f"Getting cards for user {user_id} - page: {page}, per_page: {per_page}")
        
        # Import here to avoid circular imports
        from service.user_service import get_user_cards
        
        # Call the service function
        result = await get_user_cards(
            user_id=user_id,
            db=db,
            page=page,
            per_page=per_page,
            collection_id=collection_id,
            search_query=search_query,
            sort_by=sort_by,
            sort_order=sort_order
        )
        
        logger.info(f"Successfully retrieved {len(result.get('cards', []))} cards for user {user_id}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting cards for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )

@router.post("/{user_id}/add-points", response_model=AddPointsResponse)
async def add_points_to_user_endpoint(
    user_id: str = Path(..., description="The ID of the user to add points to"),
    request: AddPointsRequest = ...,
    db: AsyncClient = Depends(get_firestore_client)
) -> AddPointsResponse:
    """
    Add points to a user's balance.
    
    This endpoint allows administrators to add points to a user's account.
    The operation is performed using a Firestore transaction to ensure consistency.
    
    Args:
        user_id: The ID of the user to add points to
        request: Request containing the number of points and optional reason
        db: Firestore database client (injected)
    
    Returns:
        AddPointsResponse: Response containing operation details and new balance
    
    Raises:
        HTTPException: 400 for invalid input, 404 if user not found, 500 for server errors
    """
    try:
        logger.info(f"Adding {request.points} points to user {user_id}")
        
        # Call the service function
        result = await add_points_to_user(
            user_id=user_id,
            points=request.points,
            db=db,
            reason=request.reason
        )
        
        logger.info(f"Successfully added {request.points} points to user {user_id}. New balance: {result['new_balance']}")
        
        return AddPointsResponse(
            success=result['success'],
            message=result['message'],
            user_id=result['user_id'],
            points_added=result['points_added'],
            new_balance=result['new_balance'],
            previous_balance=result['previous_balance']
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error adding points to user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )
