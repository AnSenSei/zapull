from fastapi import APIRouter, HTTPException, Depends, Path, Query, Body, File, UploadFile
from typing import Optional, List
from google.cloud import firestore

from models.schemas import User, Address, CreateAccountRequest, UserProfileUpdate, UserEmailUpdate, UserNewAccountUpdate, CheckReferResponse, GetReferralsResponse, GetReferCodeResponse, LikeUserRequest, LikeUserResponse, AddUserAddressResponse
from service.account_service import (
    get_user_by_id,
    get_user_points_balance,
    update_user_profile,
    update_user_email,
    add_user_address,
    update_user_address,
    delete_user_address,
    create_account,
    update_user_avatar,
    update_seed,
    check_user_referred,
    get_user_referrals,
    get_user_refer_code,
    like_user,
    get_user_public_profile,
    get_user_addresses,
    validate_referral_code,
    check_daily_reward_claimed,
    update_user_new_account
)
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id, get_optional_user_id

logger = get_logger(__name__)

router = APIRouter(
    prefix="/accounts",
    tags=["accounts"],
)

@router.post("/create-account", response_model=User, status_code=201)
async def create_account_route(
    request: CreateAccountRequest = Body(..., description="User account data"),
    user_id: str = Depends(get_current_user_id),  # Now extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Create a new user account with the specified fields and default values.

    This endpoint:
    1. Takes user account data as input
    2. Creates a new user document in Firestore with the specified fields and default values
    3. Returns the created User object
    
    Authentication: Required (Firebase token)
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
        user = await create_account(request, db, user_id)
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating user account: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while creating the user account")

@router.get("/profile", response_model=User)
async def get_current_user_profile_route(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
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

@router.get("/points-balance")
async def get_current_user_points_balance(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get only the current user's points balance.
    This is more efficient than fetching the entire profile when only points are needed.
    
    Returns:
        Dict containing pointsBalance, totalPointsSpent, and totalCashRecharged
    """
    try:
        points_data = await get_user_points_balance(user_id, db)
        return points_data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user points balance: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the points balance")

# Commented out - keeping this endpoint allows viewing other users' profiles
# If you want to allow viewing other users' profiles, uncomment this:
# @router.get("/{user_id}", response_model=User)
# async def get_user_route(
#     user_id: str = Path(...),
#     current_user_id: Optional[str] = Depends(get_optional_user_id),  # Optional auth
#     db: firestore.AsyncClient = Depends(get_firestore_client)
# ):
#     """
#     Get a user by ID.
#     This endpoint allows viewing any user's profile, even without authentication.
#     """
#     try:
#         user = await get_user_by_id(user_id, db)
#         if not user:
#             raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
#         return user
#     except HTTPException:
#         raise
#     except Exception as e:
#         logger.error(f"Error getting user: {e}", exc_info=True)
#         raise HTTPException(status_code=500, detail="An error occurred while retrieving the user")

@router.put("/profile")
async def update_user_profile_route(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    update_data: UserProfileUpdate = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update a user's display name and avatar.
    """
    try:
        updated_user = await update_user_profile(
            user_id=user_id, 
            display_name=update_data.displayName, 
            db_client=db,
            avatar=update_data.avatar
        )
        # Return only essential fields instead of entire user object
        return {
            "success": True,
            "message": "Profile updated successfully",
            "displayName": updated_user.displayName,
            "avatar": updated_user.avatar if hasattr(updated_user, 'avatar') else None
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user profile: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the user profile")

@router.put("/email", response_model=User)
async def update_user_email_route(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    update_data: UserEmailUpdate = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update a user's email address in both Firebase Auth and Firestore.
    
    This endpoint:
    1. Validates the new email format
    2. Updates the email in Firebase Authentication
    3. Updates the email in Firestore
    4. Returns the updated user object
    
    Note: The user will need to re-authenticate after email change.
    """
    try:
        updated_user = await update_user_email(
            user_id=user_id, 
            new_email=update_data.email, 
            db_client=db
        )
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user email: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the user email")


@router.get("/addresses")
async def get_user_addresses_route(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all addresses for the current user.
    
    Returns a list of addresses with proper formatting.
    """
    try:
        result = await get_user_addresses(user_id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user addresses: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while getting addresses")

@router.post("/addresses", response_model=AddUserAddressResponse)
async def add_user_address_route(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    address: Address = Body(...),
    skip_validation: bool = Query(False, description="Skip address validation and save as-is"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Add a new address to a user's addresses.
    
    Returns the updated user and the validated/cleaned address from Shippo.
    If address validation fails, returns suggested address in the error response.
    
    Query Parameters:
    - skip_validation: If true, saves the address without validation
    """
    try:
        result = await add_user_address(user_id, address, db, skip_validation)
        return AddUserAddressResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error adding user address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while adding the address")

@router.put("/addresses/{address_id}", response_model=AddUserAddressResponse)
async def update_user_address_route(
    address_id: str = Path(...),
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    address: Address = Body(...),
    skip_validation: bool = Query(False, description="Skip address validation and save as-is"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update an existing address for a user.
    
    Returns the updated user and the validated/cleaned address from Shippo.
    If address validation fails, returns suggested address in the error response.
    
    Query Parameters:
    - skip_validation: If true, saves the address without validation
    """
    try:
        result = await update_user_address(user_id, address_id, address, db, skip_validation)
        # Create response with explicit fields
        response = AddUserAddressResponse(user=result["user"])
        if result.get("validated_address"):
            response.validated_address = result["validated_address"]
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the address")

@router.delete("/addresses/{address_id}", response_model=str)
async def delete_user_address_route(
    address_id: str = Path(...),
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Delete an address from a user's addresses.
    """
    try:
        result = await delete_user_address(user_id, address_id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting user address: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while deleting the address")

# REMOVED: add_points_to_user_route - This was a security vulnerability
# Points should only be added through legitimate means:
# 1. Payment/recharge transactions
# 2. Destroying cards (returning their point worth)
# 3. Marketplace transactions
# 4. Referral bonuses
# Users should NEVER be able to arbitrarily add points to their own accounts

@router.post("/avatar", response_model=User)
async def upload_avatar_route(
    avatar: UploadFile = File(..., description="The avatar image file"),
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Upload a new avatar image for a user.

    This endpoint:
    1. Takes a user ID and avatar image file as input
    2. Uploads the avatar image to cloud storage
    3. Updates the user's avatar field with the URL
    4. Returns the updated User object
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
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update a user's clientSeed with a new random value.

    This endpoint:
    1. Takes a user ID as input
    2. Generates a new random clientSeed
    3. Updates the user's clientSeed field
    4. Returns the updated User object
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
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Check if a user has been referred (has the referred_by field).

    This endpoint:
    1. Takes a user ID
    2. Checks if the user has the referred_by field
    3. Returns a response indicating whether the user has been referred and the referer_id if available

    This is used to determine if the user is using a referral code for the first time.
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
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all users referred by a specific user.

    This endpoint:
    1. Takes a user ID
    2. Gets all users referred by this user from the "refers" subcollection
    3. Returns a response with the total count and details of each referred user

    This is used to track how many users have been referred by a specific user.
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
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get a user's referral code.

    This endpoint:
    1. Takes a user ID
    2. Gets the user's referral code from the refer_codes collection
    3. Returns a response with the user ID and referral code

    This is used to get a user's referral code for sharing with others.
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
    like_request: LikeUserRequest = Body(..., description="The request containing the target user ID to like"),
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Like another user.

    This endpoint:
    1. Takes a user ID and a target user ID
    2. Creates a record in the user's 'likes' subcollection
    3. Returns a response with information about the like action

    This is used to allow users to like other users.
    """
    try:
        result = await like_user(user_id, like_request.target_user_id, db)
        return LikeUserResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error liking user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while liking the user")


@router.get("/users/{user_id}/public-profile", response_model=dict)
async def get_user_public_profile_route(
    user_id: str = Path(..., description="The ID of the user to get public profile for"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get public profile data for a specific user.
    
    This endpoint returns minimal public information for displaying a user's profile:
    - displayName
    - avatar
    - totalAchievements
    - highlights (up to 5 cards)
    
    This is a public endpoint that doesn't require authentication.
    """
    try:
        public_profile = await get_user_public_profile(user_id, db)
        return public_profile
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting public profile for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the public profile")


@router.get("/validate-referral/{referral_code}", response_model=dict)
async def validate_referral_code_route(
    referral_code: str = Path(..., description="The referral code to validate"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Validate a referral code and check if the current user can use it.
    
    This endpoint:
    1. Checks if the referral code exists
    2. Verifies the code doesn't belong to the current user
    3. Checks if the current user has already been referred
    4. Returns the referral code owner's information if valid
    
    Returns:
    - is_valid: Whether the referral code can be used
    - owner_id: The ID of the user who owns this referral code
    - owner_name: The display name of the referral code owner
    - error: Error message if validation fails
    
    Authentication: Required (Firebase token)
    """
    try:
        result = await validate_referral_code(referral_code, user_id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating referral code {referral_code}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to validate referral code")


@router.get("/daily-reward-status", response_model=dict)
async def check_daily_reward_claimed_route(
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Check if the current user has already claimed their daily reward today.
    
    This endpoint:
    1. Gets today's date in US Central timezone
    2. Checks the dailyDrawClaims Firestore collection for an existing claim record
    3. Returns the claim status and related information
    
    Returns:
    - has_claimed: Whether the user has claimed today's reward
    - today_date: Today's date in YYYY-MM-DD format (US Central timezone)
    - claim_id: The claim document ID if claimed, None otherwise
    
    Authentication: Required (Firebase token)
    
    This is used to determine if a user is eligible to claim their daily reward.
    """
    try:
        result = await check_daily_reward_claimed(user_id, db)
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking daily reward claim status for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to check daily reward claim status")


@router.put("/new-account", response_model=User)
async def update_user_new_account_route(
    user_id: str = Depends(get_current_user_id),  # Extracted from Firebase token
    update_data: UserNewAccountUpdate = Body(...),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Update a user's new_account field.
    
    This endpoint:
    1. Takes the new_account boolean value
    2. Updates the user's new_account field in Firestore
    3. Returns the updated User object
    
    The user is identified by their Firebase auth token.
    
    Authentication: Required (Firebase token)
    """
    try:
        updated_user = await update_user_new_account(
            user_id=user_id,
            new_account=update_data.new_account,
            db_client=db
        )
        return updated_user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating new_account field for user: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while updating the new_account field")
