"""
Admin router for administrative operations.
Provides endpoints for simulating card draws and other admin tasks.
"""

from fastapi import APIRouter, HTTPException, Query, Depends, Body
from google.cloud.firestore_v1 import AsyncClient
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any

from config import get_logger, get_firestore_client
from service.admin_service import simulate_draw_for_user, get_user_by_email, automated_simulate_draw, add_points_to_user

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
