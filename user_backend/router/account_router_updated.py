from fastapi import APIRouter, HTTPException, Depends, Path, Query, Body, File, UploadFile
from typing import Optional, List
from google.cloud import firestore

from models.schemas import User, Address, CreateAccountRequest, UserEmailAddressUpdate, AddPointsRequest, CheckReferResponse, GetReferralsResponse, GetReferCodeResponse, LikeUserRequest, LikeUserResponse, AddUserAddressResponse
from service.account_service import (
    get_user_by_id,
    update_user_email_and_address,
    add_user_address,
    delete_user_address,
    add_points_to_user,
    create_account,
    update_user_avatar,
    update_seed,
    check_user_referred,
    get_user_referrals,
    get_user_refer_code,
    like_user
)
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id, get_optional_user_id

logger = get_logger(__name__)

router = APIRouter(
    prefix="/users",
    tags=["accounts"],
)

@router.post("/create-account", response_model=User, status_code=201)
async def create_account_route(
    request: CreateAccountRequest = Body(..., description="User account data"),
    # Changed: user_id is now extracted from token instead of query parameter
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a new user account with the specified fields and default values.

    This endpoint:
    1. Takes user account data as input
    2. Creates a new user document in Firestore with the specified fields and default values
    3. Returns the created User object
    
    The user_id is extracted from the Firebase auth token.

    The following fields are required:
    - email: User's email address

    The following fields have default values if not provided:
    - displayName: "AnSenSei"
    - addresses: [] (empty array)
    - avatar: null
    - totalFusion: 0

    The following fields are automatically set:
    - createdAt: Current timestamp
    - level: 1
    - pointsBalance: 0
    - totalCashRecharged: 0
    - totalPointsSpent: 0
    """
    try:
        # Pass the user_id from the token
        user = await create_account(request, db, user_id)
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user account: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the user account")

@router.get("/profile", response_model=User)
async def get_current_user_profile_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get the current user's profile.
    
    The user is identified by their Firebase auth token.
    """
    try:
        user = await get_user_by_id(user_id, db)
        if not user:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the user")

# Example of an endpoint that still allows viewing other users' profiles
@router.get("/{user_id}", response_model=User)
async def get_user_route(
    user_id: str = Path(...),
    # Optional auth - can view other users' profiles even if not authenticated
    current_user_id: Optional[str] = Depends(get_optional_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get a user by ID.
    
    This endpoint allows viewing any user's profile, even without authentication.
    """
    try:
        user = await get_user_by_id(user_id, db)
        if not user:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the user")

@router.put("/email-and-avatar", response_model=User)
async def update_user_email_and_avatar_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    update_data: UserEmailAddressUpdate = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update the current user's email and avatar.
    
    The user is identified by their Firebase auth token.
    """
    try:
        updated_user = await update_user_email_and_address(
            user_id=user_id, 
            email=update_data.email, 
            db_client=db,
            avatar=update_data.avatar
        )
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user email and avatar: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the user email and avatar")

@router.post("/addresses", response_model=AddUserAddressResponse)
async def add_user_address_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    address: Address = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Add a new address to the current user's addresses.
    
    Returns the updated user and the validated/cleaned address from Shippo.
    If address validation fails, returns suggested address in the error response.
    
    The user is identified by their Firebase auth token.
    """
    try:
        result = await add_user_address(user_id, address, db)
        return AddUserAddressResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding user address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while adding the address")

@router.delete("/addresses/{address_id}", response_model=str)
async def delete_user_address_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    address_id: str = Path(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Delete an address from the current user's addresses.
    
    The user is identified by their Firebase auth token.
    """
    try:
        result = await delete_user_address(user_id, address_id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while deleting the address")

@router.post("/points", response_model=dict)
async def add_points_to_user_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    points_request: AddPointsRequest = Body(..., description="The points to add"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Add points to the current user's pointsBalance.

    This endpoint:
    1. Takes points to add as argument
    2. Validates that the points to add are greater than 0
    3. Adds the points to the user's pointsBalance
    4. Returns a success message with the updated points balance
    
    The user is identified by their Firebase auth token.
    """
    try:
        updated_user = await add_points_to_user(
            user_id=user_id,
            points=points_request.points,
            db_client=db
        )
        return {
            "message": f"Successfully added {points_request.points} points to user {user_id}",
            "new_balance": updated_user.pointsBalance
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding points to user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while adding points to the user")

@router.post("/avatar", response_model=User)
async def upload_avatar_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    avatar: UploadFile = File(..., description="The avatar image file"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Upload a new avatar image for the current user.

    This endpoint:
    1. Takes an avatar image file as input
    2. Uploads the avatar image to cloud storage
    3. Updates the user's avatar field with the URL
    4. Returns the updated User object
    
    The user is identified by their Firebase auth token.
    """
    try:
        # Read the file content
        file_content = await avatar.read()

        # Get the content type
        content_type = avatar.content_type

        updated_user = await update_user_avatar(
            user_id=user_id,
            avatar=file_content,
            content_type=content_type,
            db_client=db
        )
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading avatar for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while uploading the avatar")

@router.put("/seed", response_model=User)
async def update_seed_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update the current user's clientSeed with a new random value.

    This endpoint:
    1. Generates a new random clientSeed
    2. Updates the user's clientSeed field
    3. Returns the updated User object
    
    The user is identified by their Firebase auth token.
    """
    try:
        updated_user = await update_seed(
            user_id=user_id,
            db_client=db
        )
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating seed for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the user's seed")

@router.get("/check-refer", response_model=CheckReferResponse)
async def check_refer_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Check if the current user has been referred (has the referred_by field).

    This endpoint:
    1. Checks if the user has the referred_by field
    2. Returns a response indicating whether the user has been referred and the referer_id if available

    This is used to determine if the user is using a referral code for the first time.
    The user is identified by their Firebase auth token.
    """
    try:
        result = await check_user_referred(user_id, db)
        return CheckReferResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking user referral status: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while checking the user referral status")

@router.get("/referrals", response_model=GetReferralsResponse)
async def get_user_referrals_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all users referred by the current user.

    This endpoint:
    1. Gets all users referred by this user from the "refers" subcollection
    2. Returns a response with the total count and details of each referred user

    This is used to track how many users have been referred by the current user.
    The user is identified by their Firebase auth token.
    """
    try:
        result = await get_user_referrals(user_id, db)
        return GetReferralsResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user referrals: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting the user referrals")

@router.get("/refer-code", response_model=GetReferCodeResponse)
async def get_user_refer_code_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get the current user's referral code.

    This endpoint:
    1. Gets the user's referral code from the refer_codes collection
    2. Returns a response with the user ID and referral code

    This is used to get the current user's referral code for sharing with others.
    The user is identified by their Firebase auth token.
    """
    try:
        result = await get_user_refer_code(user_id, db)
        return GetReferCodeResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user referral code: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting the user referral code")

@router.post("/like", response_model=LikeUserResponse)
async def like_user_route(
    # Changed: No user_id in path, extracted from token
    user_id: str = Depends(get_current_user_id),
    like_request: LikeUserRequest = Body(..., description="The request containing the target user ID to like"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Like another user.

    This endpoint:
    1. Takes a target user ID
    2. Creates a record in the current user's 'likes' subcollection
    3. Returns a response with information about the like action

    This is used to allow the current user to like other users.
    The user is identified by their Firebase auth token.
    """
    try:
        result = await like_user(user_id, like_request.target_user_id, db)
        return LikeUserResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error liking user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while liking the user")