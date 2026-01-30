"""
Admin router for administrative operations.
Provides endpoints for simulating card draws and other admin tasks.
"""

from fastapi import APIRouter, HTTPException, Query, Depends, Body
from google.cloud.firestore_v1 import AsyncClient
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from config import get_logger, get_firestore_client
from service.admin_service import (
    simulate_draw_for_user,
    get_user_by_email,
    automated_simulate_draw,
    add_points_to_user,
    add_card_to_user_highlights,
    get_user_highlights,
    remove_card_from_user_highlights,
    create_admin_user,
    get_admin_created_users,
    get_all_achievements,
    get_user_achievements,
    grant_achievement_to_user,
    revoke_achievement_from_user,
    update_admin_user,
)

logger = get_logger(__name__)

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    responses={404: {"description": "Not found"}},
)


class SimulateDrawRequest(BaseModel):
    """Request model for simulating card draws"""
    email: str = Field(..., description="Email of the user to simulate draw for")
    collection_id: str = Field(..., description="The ID of the collection containing the pack")
    pack_id: str = Field(..., description="The ID of the pack to draw from")
    count: int = Field(5, description="Number of cards to draw (1, 3, or 5)")
    add_to_collection: bool = Field(False, description="Whether to add cards to user's collection")


class SimulateDrawResponse(BaseModel):
    """Response model for simulated draw"""
    success: bool
    user: Dict[str, Any]
    pack: Dict[str, Any]
    draw_count: int
    total_simulated_spent: int
    drawn_cards: List[Dict[str, Any]]
    high_rarity_cards_count: int
    weekly_spent_updated: Dict[str, Any]
    top_hits_added: int
    cards_added_to_collection: bool


class UserLookupResponse(BaseModel):
    """Response model for user lookup"""
    found: bool
    user_id: Optional[str] = None
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar: Optional[str] = None
    points_balance: Optional[int] = None


@router.post("/simulate-draw", response_model=SimulateDrawResponse)
async def simulate_draw_endpoint(
    request: SimulateDrawRequest = Body(..., description="Simulate draw request body"),
    db: AsyncClient = Depends(get_firestore_client)
) -> SimulateDrawResponse:
    """
    Simulate drawing cards for a user by email.
    
    This endpoint allows administrators to simulate a card draw for a user.
    The simulation will:
    - Draw random cards from the specified pack based on probabilities
    - Update the user's weekly_spent (for leaderboard)
    - Add high rarity cards (purple, orange, red) to top_hits
    - Optionally add the cards to the user's collection
    
    Note: This does NOT deduct points from the user's balance.
    
    Args:
        request: SimulateDrawRequest containing:
            - email: User's email address
            - collection_id: Pack collection ID
            - pack_id: Pack ID to draw from
            - count: Number of cards to draw (1, 3, or 5)
            - add_to_collection: Whether to add cards to user's collection
        db: Firestore database client (injected)
    
    Returns:
        SimulateDrawResponse with drawn cards and update status
    
    Raises:
        HTTPException: 400 for invalid input, 404 if user/pack not found, 500 for server errors
    """
    try:
        logger.info(f"Admin simulate draw request for user {request.email}")
        
        result = await simulate_draw_for_user(
            email=request.email,
            collection_id=request.collection_id,
            pack_id=request.pack_id,
            count=request.count,
            db_client=db,
            add_to_collection=request.add_to_collection
        )
        
        logger.info(f"Successfully simulated {request.count} draws for user {request.email}")
        return SimulateDrawResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in simulate draw: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.get("/lookup-user", response_model=UserLookupResponse)
async def lookup_user_by_email(
    email: str = Query(..., description="Email address to look up"),
    db: AsyncClient = Depends(get_firestore_client)
) -> UserLookupResponse:
    """
    Look up a user by email address.
    
    This endpoint allows administrators to find a user by their email
    to verify they exist before simulating draws.
    
    Args:
        email: The email address to look up
        db: Firestore database client (injected)
    
    Returns:
        UserLookupResponse with user info if found
    
    Raises:
        HTTPException: 500 for server errors
    """
    try:
        logger.info(f"Admin lookup user by email: {email}")
        
        user_data = await get_user_by_email(email, db)
        
        if user_data:
            return UserLookupResponse(
                found=True,
                user_id=user_data.get('id'),
                email=user_data.get('email'),
                display_name=user_data.get('displayName'),
                avatar=user_data.get('avatar'),
                points_balance=user_data.get('pointsBalance', 0)
            )
        else:
            return UserLookupResponse(found=False)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in user lookup: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.post("/batch-simulate-draw")
async def batch_simulate_draw_endpoint(
    email: str = Query(..., description="Email of the user to simulate draws for"),
    collection_id: str = Query(..., description="The ID of the collection containing the pack"),
    pack_id: str = Query(..., description="The ID of the pack to draw from"),
    iterations: int = Query(1, description="Number of draw sessions to simulate (each draws 5 cards)"),
    add_to_collection: bool = Query(False, description="Whether to add cards to user's collection"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Batch simulate multiple draw sessions for a user.
    
    This endpoint allows simulating multiple draw sessions at once.
    Each iteration draws 5 cards and updates weekly_spent accordingly.
    
    Args:
        email: User's email address
        collection_id: Pack collection ID
        pack_id: Pack ID to draw from
        iterations: Number of draw sessions (each draws 5 cards)
        add_to_collection: Whether to add cards to user's collection
        db: Firestore database client (injected)
    
    Returns:
        Summary of all iterations with total cards drawn and weekly_spent updated
    
    Raises:
        HTTPException: 400 for invalid input, 404 if user/pack not found, 500 for server errors
    """
    try:
        if iterations < 1 or iterations > 100:
            raise HTTPException(status_code=400, detail="Iterations must be between 1 and 100")
        
        logger.info(f"Admin batch simulate {iterations} draw sessions for user {email}")
        
        results = []
        total_spent = 0
        total_cards = 0
        total_high_rarity = 0
        
        for i in range(iterations):
            result = await simulate_draw_for_user(
                email=email,
                collection_id=collection_id,
                pack_id=pack_id,
                count=5,  # Always draw 5 cards per iteration
                db_client=db,
                add_to_collection=add_to_collection
            )
            
            total_spent += result['total_simulated_spent']
            total_cards += len(result['drawn_cards'])
            total_high_rarity += result['high_rarity_cards_count']
            
            results.append({
                'iteration': i + 1,
                'cards_drawn': len(result['drawn_cards']),
                'high_rarity_count': result['high_rarity_cards_count'],
                'spent': result['total_simulated_spent']
            })
        
        logger.info(f"Completed {iterations} batch draw sessions for user {email}. Total cards: {total_cards}, Total spent: {total_spent}")
        
        return {
            'success': True,
            'email': email,
            'iterations_completed': iterations,
            'total_cards_drawn': total_cards,
            'total_simulated_spent': total_spent,
            'total_high_rarity_cards': total_high_rarity,
            'cards_added_to_collection': add_to_collection,
            'iteration_details': results
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in batch simulate draw: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


class AutomatedDrawRequest(BaseModel):
    """Request model for fully automated draw"""
    email: str = Field(..., description="Email of the user to simulate draw for")
    collection_id: str = Field(..., description="The ID of the collection containing the pack")
    pack_id: str = Field(..., description="The ID of the pack to draw from")
    draw_count: int = Field(5, description="Number of cards to draw (1, 3, or 5)")


@router.post("/automated-draw")
async def automated_draw_endpoint(
    request: AutomatedDrawRequest = Body(..., description="Automated draw request"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Fully automated draw simulation with one button.
    
    This endpoint:
    - Looks up the user by email
    - Auto top-up points if insufficient
    - Draws cards from the pack
    - Updates weekly_spent (leaderboard)
    - Adds high rarity cards to top_hits
    - Adds cards to user's collection
    - Highlights the most expensive card drawn
    
    Args:
        request: AutomatedDrawRequest with email, collection_id, pack_id, draw_count
        db: Firestore database client
    
    Returns:
        Complete operation summary with all actions taken
    """
    try:
        logger.info(f"Automated draw for {request.email}")
        
        result = await automated_simulate_draw(
            email=request.email,
            collection_id=request.collection_id,
            pack_id=request.pack_id,
            draw_count=request.draw_count,
            db_client=db
        )
        
        logger.info(f"Automated draw completed for {request.email}")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in automated draw: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.post("/add-points")
async def add_points_endpoint(
    email: str = Query(..., description="Email of the user"),
    points: int = Query(..., description="Number of points to add"),
    reason: Optional[str] = Query(None, description="Reason for adding points"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Add points to a user's balance by email.
    
    Args:
        email: User's email address
        points: Number of points to add
        reason: Optional reason
        db: Firestore database client
    
    Returns:
        Operation result with balance info
    """
    try:
        user_data = await get_user_by_email(email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")
        
        result = await add_points_to_user(
            user_id=user_data['id'],
            points=points,
            db_client=db,
            reason=reason
        )
        
        result['email'] = email
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error adding points: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


class HighlightCardRequest(BaseModel):
    """Request model for manually highlighting a card for a user"""
    email: str = Field(..., description="Email of the user")
    card_collection_id: str = Field(..., description="Collection ID of the card (e.g. 'pokemon')")
    card_id: str = Field(..., description="ID of the card to highlight")
    card_data: Dict[str, Any] = Field(..., description="Card data from the draw result")


@router.post("/highlight-card")
async def highlight_card_endpoint(
    request: HighlightCardRequest = Body(..., description="Highlight card request"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Add a specific card to a user's highlights after a simulated draw.

    This allows admins to choose exactly which drawn card should be highlighted
    on the user's profile, without requiring the card to exist in inventory.
    """
    try:
        user_data = await get_user_by_email(request.email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{request.email}' not found")

        result = await add_card_to_user_highlights(
            user_id=user_data['id'],
            card_collection_id=request.card_collection_id,
            card_id=request.card_id,
            card_data=request.card_data,
            db_client=db
        )
        result['email'] = request.email
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error highlighting card: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.get("/user-highlights")
async def get_user_highlights_endpoint(
    email: str = Query(..., description="Email of the user"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Get all highlights for a user by email.
    """
    try:
        user_data = await get_user_by_email(email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")

        highlights = await get_user_highlights(
            user_id=user_data['id'],
            db_client=db
        )
        return {
            'success': True,
            'email': email,
            'user_id': user_data['id'],
            'highlights': highlights
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting highlights: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.delete("/highlight-card")
async def remove_highlight_card_endpoint(
    email: str = Query(..., description="Email of the user"),
    card_id: str = Query(..., description="ID of the card to remove"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Remove a card from user's highlights.
    """
    try:
        user_data = await get_user_by_email(email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")

        result = await remove_card_from_user_highlights(
            user_id=user_data['id'],
            card_id=card_id,
            db_client=db
        )
        result['email'] = email
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error removing highlight: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


class CreateAdminUserRequest(BaseModel):
    """Request model for creating an admin user"""
    email: str = Field(..., description="Email address for the new user")
    display_name: str = Field(..., description="Display name for the new user")
    initial_points: int = Field(10000, description="Initial points balance")
    avatar: Optional[str] = Field(None, description="Avatar URL or base64 data")


@router.post("/create-user")
async def create_admin_user_endpoint(
    request: CreateAdminUserRequest = Body(..., description="Create user request"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Create a new user via admin panel.
    """
    try:
        result = await create_admin_user(
            email=request.email,
            display_name=request.display_name,
            db_client=db,
            initial_points=request.initial_points,
            avatar=request.avatar
        )
        return {
            'success': True,
            'user': result
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error creating admin user: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.get("/admin-users")
async def get_admin_users_endpoint(
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Get all users created via admin panel.
    """
    try:
        users = await get_admin_created_users(db)
        return {
            'success': True,
            'users': users
        }

    except Exception as e:
        logger.error(f"Unexpected error getting admin users: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.get("/achievements")
async def get_all_achievements_endpoint(
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Get all achievements available in the system.
    """
    try:
        achievements = await get_all_achievements(db)
        return {
            'success': True,
            'achievements': achievements
        }
    except Exception as e:
        logger.error(f"Unexpected error getting achievements: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.get("/user-achievements")
async def get_user_achievements_endpoint(
    email: str = Query(..., description="Email of the user"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Get all achievements for a user by email.
    """
    try:
        user_data = await get_user_by_email(email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")

        achievements = await get_user_achievements(
            user_id=user_data['id'],
            db_client=db
        )
        return {
            'success': True,
            'email': email,
            'user_id': user_data['id'],
            'achievements': achievements
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error getting user achievements: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


class GrantAchievementRequest(BaseModel):
    """Request model for granting an achievement"""
    email: str = Field(..., description="Email of the user")
    achievement_id: str = Field(..., description="ID of the achievement to grant")


@router.post("/grant-achievement")
async def grant_achievement_endpoint(
    request: GrantAchievementRequest = Body(..., description="Grant achievement request"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Grant an achievement to a user.
    """
    try:
        user_data = await get_user_by_email(request.email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{request.email}' not found")

        result = await grant_achievement_to_user(
            user_id=user_data['id'],
            achievement_id=request.achievement_id,
            db_client=db
        )
        result['email'] = request.email
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error granting achievement: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


@router.delete("/revoke-achievement")
async def revoke_achievement_endpoint(
    email: str = Query(..., description="Email of the user"),
    achievement_id: str = Query(..., description="ID of the achievement to revoke"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Revoke an achievement from a user.
    """
    try:
        user_data = await get_user_by_email(email, db)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")

        result = await revoke_achievement_from_user(
            user_id=user_data['id'],
            achievement_id=achievement_id,
            db_client=db
        )
        result['email'] = email
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error revoking achievement: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )


class UpdateAdminUserRequest(BaseModel):
    """Request model for updating an admin user"""
    user_id: str = Field(..., description="ID of the user to update")
    display_name: Optional[str] = Field(None, description="New display name")
    avatar: Optional[str] = Field(None, description="New avatar URL")
    points_balance: Optional[int] = Field(None, description="New points balance")


@router.put("/admin-user")
async def update_admin_user_endpoint(
    request: UpdateAdminUserRequest = Body(..., description="Update user request"),
    db: AsyncClient = Depends(get_firestore_client)
) -> Dict[str, Any]:
    """
    Update an admin-created user's profile.
    """
    try:
        result = await update_admin_user(
            user_id=request.user_id,
            db_client=db,
            display_name=request.display_name,
            avatar=request.avatar,
            points_balance=request.points_balance
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error updating admin user: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred: {str(e)}"
        )
