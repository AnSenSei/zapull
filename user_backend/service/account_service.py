from typing import Optional, Dict, List, Tuple, Any
from uuid import UUID
import random
import re
import secrets
import requests
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from shippo import Shippo
from shippo.models import components
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, SERVER_TIMESTAMP, Increment
from firebase_admin import auth

from config import get_logger, settings
from models.schemas import User, Address, CreateAccountRequest
from utils.storage_utils import upload_avatar, parse_base64_image
from utils.google_avatar_utils import (
    download_and_upload_google_avatar, 
    extract_google_avatar_from_user_data, 
    enhance_google_avatar_url
)

logger = get_logger(__name__)

# Helper to normalize Firestore user documents before constructing the Pydantic User model
# This is critical in production where legacy or inconsistent data may exist.
from datetime import datetime

def normalize_user_data_for_model(user_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normalize/clean user_data fetched from Firestore so it can be safely parsed by the
    Pydantic User model. Handles legacy shapes, missing fields, and type coercions.
    """
    data: Dict[str, Any] = dict(user_data or {})

    # Ensure required primitives exist with safe defaults
    if not data.get("displayName"):
        data["displayName"] = "Unknown User"

    if data.get("createdAt") is None:
        data["createdAt"] = datetime.now()

    # Coerce numeric fields to int with defaults
    def _coerce_int(key: str, default: int = 0) -> None:
        val = data.get(key)
        if val is None:
            data[key] = default
            return
        if isinstance(val, int):
            return
        try:
            # handle float/str -> int
            data[key] = int(val) if not isinstance(val, str) else int(float(val))
        except Exception:
            try:
                data[key] = int(float(val))
            except Exception:
                data[key] = default

    for k in [
        "pointsBalance",
        "totalCashRecharged",
        "totalPointsSpent",
        "totalFusion",
        "total_point_refered",
        "totalAchievements",
    ]:
        _coerce_int(k, 0)
    _coerce_int("level", 1)

    # Normalize addresses into a list[Address-like dict]
    def _build_addr(addr: Dict[str, Any], default_id: Optional[str] = None) -> Dict[str, Any]:
        street = (
            addr.get("street")
            or addr.get("line1")
            or addr.get("address_line_1")
            or addr.get("address_line1")
            or addr.get("address1")
            or ""
        )
        postal = addr.get("zip") or addr.get("postal_code") or addr.get("zipcode") or ""
        return {
            "id": addr.get("id", default_id),
            "name": addr.get("name") or data.get("displayName", ""),
            "street": street,
            "city": addr.get("city", ""),
            "state": addr.get("state", ""),
            "zip": postal,
            "country": addr.get("country") or addr.get("country_code") or "US",
        }

    raw_addresses = data.get("addresses")
    addresses_list: List[Dict[str, Any]] = []
    if isinstance(raw_addresses, list):
        for item in raw_addresses:
            if isinstance(item, dict):
                addresses_list.append(_build_addr(item))
    elif isinstance(raw_addresses, dict):
        # Could be a single address dict or a mapping id -> address dict
        keys = set(raw_addresses.keys())
        if any(k in keys for k in ("street", "line1", "postal_code", "zip", "city", "state", "country", "country_code", "name")):
            addresses_list.append(_build_addr(raw_addresses))
        else:
            for key, value in raw_addresses.items():
                if isinstance(value, dict):
                    addresses_list.append(_build_addr(value, default_id=str(key)))
    else:
        # None or unexpected types -> empty list
        addresses_list = []

    data["addresses"] = addresses_list

    # Ensure strings are strings (avatar/clientSeed/ids)
    avatar = data.get("avatar")
    if avatar is not None and not isinstance(avatar, str):
        try:
            data["avatar"] = str(avatar)
        except Exception:
            data["avatar"] = None

    if "clientSeed" in data and data["clientSeed"] is not None and not isinstance(data["clientSeed"], str):
        try:
            data["clientSeed"] = str(data["clientSeed"])
        except Exception:
            data["clientSeed"] = None

    if "referred_by" in data and data["referred_by"] is not None and not isinstance(data["referred_by"], str):
        try:
            data["referred_by"] = str(data["referred_by"])
        except Exception:
            data["referred_by"] = None
    else:
        data.setdefault("referred_by", None)

    if "stripe_account_id" in data and data["stripe_account_id"] is not None and not isinstance(data["stripe_account_id"], str):
        try:
            data["stripe_account_id"] = str(data["stripe_account_id"])
        except Exception:
            data["stripe_account_id"] = None

    # Only keep keys that are part of our User model to avoid validation errors
    allowed_keys = {
        "createdAt", "displayName", "email", "addresses", "avatar", "level",
        "pointsBalance", "totalCashRecharged", "totalPointsSpent", "totalFusion",
        "clientSeed", "referred_by", "total_point_refered", "stripe_account_id",
        "totalAchievements", "new_account"
    }
    filtered = {k: data.get(k) for k in allowed_keys}
    return filtered

async def validate_address_with_shippo(address: Address) -> Dict[str, Any]:
    """
    Validate an address using Shippo's validation endpoint.

    Args:
        address: The address object to validate (including name)

    Returns:
        Dict containing validation status, recommended address, and analysis

    Raises:
        HTTPException: If there's an error validating the address
    """
    try:
        # Configure Shippo API
        if not hasattr(settings, 'shippo_api_key') or not settings.shippo_api_key:
            logger.error("Shippo API key not configured")
            raise HTTPException(status_code=500, detail="Address validation service not configured")

        # Use Shippo's validation endpoint directly
        import requests
        
        logger.info(f"Validating address for {address.name}: {address.street}, {address.city}, {address.state}, {address.zip}, {address.country}")
        
        # Prepare validation request
        validation_url = "https://api.goshippo.com/v2/addresses/validate"
        
        # Map country code (handle both full names and codes)
        country_code = address.country
        if len(country_code) > 2:
            # Map common country names to codes
            country_map = {
                "United States": "US",
                "United States of America": "US",
                "USA": "US",
                "Canada": "CA",
                "United Kingdom": "GB",
                "UK": "GB",
                "Mexico": "MX",
                "Germany": "DE",
                "France": "FR",
                "Australia": "AU",
                "Italy": "IT"
            }
            country_code = country_map.get(address.country, "US")
        
        params = {
            "name": address.name,
            "address_line_1": address.street,
            "city_locality": address.city,
            "state_province": address.state,
            "postal_code": address.zip,
            "country_code": country_code
        }
        
        headers = {
            "Authorization": f"ShippoToken {settings.shippo_api_key}"
        }
        
        response = requests.get(validation_url, params=params, headers=headers)
        
        if response.status_code != 200:
            logger.error(f"Shippo validation failed with status {response.status_code}: {response.text}")
            raise HTTPException(status_code=400, detail="Address validation failed")
        
        validation_data = response.json()
        logger.info(f"Shippo validation response for {address.name}: {validation_data}")

        # Build result dictionary
        result = {
            "is_valid": True,
            "validated_address": None,
            "messages": [],
            "changed_attributes": []
        }
        
        # Extract recommended address if available
        if "recommended_address" in validation_data:
            recommended = validation_data["recommended_address"]
            result["validated_address"] = {
                "name": address.name,  # Keep original name
                "street": recommended.get("address_line_1", address.street),
                "street2": recommended.get("address_line_2", ""),
                "city": recommended.get("city_locality", address.city),
                "state": recommended.get("state_province", address.state),
                "zip": recommended.get("postal_code", address.zip),
                "country": country_code
            }
        
        # Check validation result and changed attributes
        if "analysis" in validation_data:
            analysis = validation_data["analysis"]
            
            # Get changed attributes
            if "changed_attributes" in analysis and analysis["changed_attributes"]:
                result["changed_attributes"] = analysis["changed_attributes"]
                # If there are changes, we should show them to the user
                result["has_corrections"] = True
            
            # Check validation result
            if "validation_result" in analysis:
                validation_result = analysis["validation_result"]
                
                # Check if address is deliverable
                if validation_result.get("is_deliverable") == False:
                    result["is_valid"] = False
                    result["messages"].append({
                        "code": "UNDELIVERABLE",
                        "text": "Address appears to be undeliverable"
                    })
                
                # Check for any validation errors
                if validation_result.get("errors"):
                    result["is_valid"] = False
                    for error in validation_result["errors"]:
                        result["messages"].append({
                            "code": error.get("code", "ERROR"),
                            "text": error.get("message", "Validation error")
                        })
        
        logger.info(f"Address validation completed for {address.name}, is_valid: {result['is_valid']}, has_corrections: {result.get('has_corrections', False)}")
        return result

    except HTTPException:
        # Re-raise HTTP exceptions as-is
        raise
    except Exception as e:
        # Handle other errors
        logger.error(f"Unexpected error validating address: {e}", exc_info=True)
        error_msg = str(e)

        # Check if it's a Shippo-specific error
        if "shippo" in error_msg.lower() or "api" in error_msg.lower():
            raise HTTPException(status_code=400, detail=f"Address validation failed: {error_msg}")

        # Check if it's a network/connection error
        if any(keyword in error_msg.lower() for keyword in ['connection', 'timeout', 'network', 'dns']):
            raise HTTPException(status_code=503, detail="Address validation service temporarily unavailable")

        # Check if it's an authentication error
        if any(keyword in error_msg.lower() for keyword in ['unauthorized', 'forbidden', 'authentication', 'api key']):
            raise HTTPException(status_code=500, detail="Address validation service configuration error")

        raise HTTPException(status_code=500, detail=f"Failed to validate address: {error_msg}")

async def check_user_referred(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Check if a user has been referred (has the referred_by field).
    Also returns true if the user has their own referral code to prevent self-referral.

    Args:
        user_id: The ID of the user to check
        db_client: Firestore client

    Returns:
        Dict containing user_id, is_referred status, and referer_id if referred

    Raises:
        HTTPException: If there's an error checking the user
    """
    try:
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()
        
        # Check if user has already been referred by someone else
        # Look for both 'referred_by' and 'refered_by' fields (handling typo in field name)
        has_referred_by = False
        referer_id = None
        
        if 'referred_by' in user_data and user_data['referred_by'] is not None:
            has_referred_by = True
            referer_id = user_data['referred_by']
        elif 'refered_by' in user_data and user_data['refered_by'] is not None:
            # Handle the typo in field name that might exist in some documents
            has_referred_by = True
            referer_id = user_data['refered_by']
        
        # User is considered "referred" ONLY if they have been referred by someone else
        # Having their own referral code does NOT mean they've been referred
        is_referred = has_referred_by
        
        # Get the user's total points referred
        total_point_refered = user_data.get('total_point_refered', 0)

        return {
            "user_id": user_id,
            "is_referred": is_referred,
            "referer_id": referer_id,
            "total_point_refered": total_point_refered
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking if user {user_id} has been referred: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check user referral status: {str(e)}")

async def get_user_referrals(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Get referral statistics for a specific user.

    Args:
        user_id: The ID of the user to get referrals for
        db_client: Firestore client

    Returns:
        Dict containing user_id, total_referred, and total_point_refered

    Raises:
        HTTPException: If there's an error getting the referrals
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()
        
        # Get total points earned from referrals
        total_point_refered = user_data.get("total_point_refered", 0)

        # Use Firestore count aggregation for better performance
        refers_ref = user_ref.collection("refers")
        count_query = refers_ref.count()
        count_result = await count_query.get()
        total_referred = count_result[0][0].value if count_result and count_result[0] else 0

        return {
            "user_id": user_id,
            "total_referred": total_referred,
            "total_point_refered": total_point_refered
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting referrals for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user referrals: {str(e)}")

async def get_user_refer_code(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Get a user's referral code.

    Args:
        user_id: The ID of the user to get the referral code for
        db_client: Firestore client

    Returns:
        Dict containing user_id and refer_code

    Raises:
        HTTPException: If there's an error getting the referral code
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()
        
        # Check if user has refer_code field (newer users)
        if 'refer_code' in user_data and user_data['refer_code']:
            return {
                "user_id": user_id,
                "refer_code": user_data['refer_code']
            }

        # For older users, query the refer_codes collection
        refer_codes_ref = db_client.collection('refer_codes')
        query = refer_codes_ref.where('referer_id', '==', user_id)
        refer_codes_docs = await query.get()

        # If no referral code is found, return an error
        if not refer_codes_docs:
            raise HTTPException(status_code=404, detail=f"No referral code found for user with ID {user_id}")

        # Get the first document (there should only be one)
        refer_code_doc = refer_codes_docs[0]
        refer_code = refer_code_doc.id

        return {
            "user_id": user_id,
            "refer_code": refer_code
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting referral code for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user referral code: {str(e)}")

async def get_user_by_id(user_id: str, db_client: AsyncClient) -> Optional[User]:
    """
    Get a user by ID from Firestore.

    Args:
        user_id: The ID of the user to get
        db_client: Firestore client

    Returns:
        The user if found, None otherwise

    Raises:
        HTTPException: If there's an error getting the user
    """
    try:
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            return None

        user_data = user_doc.to_dict()
        
        # Count total achievements for the user
        try:
            achievements_ref = user_ref.collection('achievements')
            count_agg_query = achievements_ref.count()
            count_snapshot = await count_agg_query.get()
            total_achievements = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0
            
            # If count returns 0, let's manually check if there are any documents
            if total_achievements == 0:
                achievements_docs = await achievements_ref.limit(1).get()
                if achievements_docs:
                    # If we find documents but count returns 0, fallback to manual count
                    all_achievements = await achievements_ref.get()
                    total_achievements = len(all_achievements)
            
            user_data['totalAchievements'] = total_achievements
        except Exception as e:
            logger.error(f"Failed to count achievements for user {user_id}: {e}")
            user_data['totalAchievements'] = 0

        # Generate a signed URL for the avatar if it exists
        avatar_url = user_data.get('avatar')
        # R2 URLs are public, no need to sign them

        return User(**normalize_user_data_for_model(user_data))
    except Exception as e:
        logger.error(f"Error getting user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user: {str(e)}")

async def get_user_points_balance(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Get only the points balance for a user.
    This is more efficient than fetching the entire user profile.

    Args:
        user_id: The ID of the user
        db_client: Firestore client

    Returns:
        Dict containing pointsBalance and optionally other minimal fields

    Raises:
        HTTPException: If there's an error getting the user points
    """
    try:
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        user_data = user_doc.to_dict()
        
        # Return only the essential fields for points display
        return {
            "pointsBalance": user_data.get("pointsBalance", 0),
            "totalPointsSpent": user_data.get("totalPointsSpent", 0),
            "totalCashRecharged": user_data.get("totalCashRecharged", 0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user points balance for {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user points balance: {str(e)}")

async def update_user_profile(user_id: str, display_name: Optional[str] = None, db_client: AsyncClient = None, avatar: Optional[Any] = None) -> User:
    """
    Update a user's display name and avatar.

    Args:
        user_id: The ID of the user to update
        display_name: Optional display name to update
        db_client: Firestore client
        avatar: Optional image data for user's avatar (can be base64 encoded string or binary data as bytes)

    Returns:
        The updated User object with a signed URL for the avatar if it exists

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get user data
        user_data = user_doc.to_dict()

        # Prepare update data
        update_data = {}

        # Only update display name if provided
        if display_name is not None:
            # Validate display name (basic validation)
            if len(display_name.strip()) == 0:
                raise HTTPException(status_code=400, detail="Display name cannot be empty")
            if len(display_name) > 100:
                raise HTTPException(status_code=400, detail="Display name is too long (max 100 characters)")
            update_data["displayName"] = display_name.strip()

        # Handle avatar upload if provided
        if avatar is not None:
            try:
                import base64

                if isinstance(avatar, str) and avatar.strip():  # String avatar
                    if avatar.startswith('data:'):
                        # Handle base64 encoded data URI
                        logger.info(f"Received base64 avatar for user {user_id}, first 100 chars: {avatar[:100]}")
                        content_type, avatar_bytes = parse_base64_image(avatar)
                        logger.info(f"Parsed avatar for user {user_id}: content_type={content_type}, size={len(avatar_bytes)} bytes")
                        
                        # Log a sample of the binary data to check if it's valid
                        if len(avatar_bytes) > 10:
                            logger.debug(f"First 10 bytes of avatar data: {avatar_bytes[:10].hex()}")
                        
                        avatar_gcs_uri = await upload_avatar(avatar_bytes, user_id, content_type)
                        update_data["avatar"] = avatar_gcs_uri
                        logger.info(f"Avatar uploaded successfully to GCS: {avatar_gcs_uri}")
                    else:
                        # Assume it's a base64 string without data URI prefix
                        try:
                            avatar_bytes = base64.b64decode(avatar)
                            avatar_gcs_uri = await upload_avatar(avatar_bytes, user_id)
                            update_data["avatar"] = avatar_gcs_uri
                        except Exception:
                            # If it's not base64, treat it as a URL/string
                            logger.warning(f"Avatar is not base64 encoded, skipping upload: {avatar[:50]}...")
                            # Don't update avatar if it's not valid base64
                elif isinstance(avatar, bytes):  # Binary data
                    # Handle bytes directly
                    avatar_gcs_uri = await upload_avatar(avatar, user_id)
                    update_data["avatar"] = avatar_gcs_uri
                else:
                    # Unsupported avatar type
                    logger.warning(f"Unsupported avatar type: {type(avatar)}")
                    raise HTTPException(status_code=400, detail="Unsupported avatar format")
            except HTTPException as e:
                # Re-raise the exception from upload_avatar
                raise e
            except Exception as e:
                logger.error(f"Error uploading avatar for user {user_id}: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

        # Update the document
        if update_data:
            await user_ref.update(update_data)

        # Get the updated user document
        updated_doc = await user_ref.get()
        updated_data = updated_doc.to_dict()

        # R2 URLs are public, no need to sign them

        return User(**normalize_user_data_for_model(updated_data))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user profile for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update user profile: {str(e)}")

async def update_user_email(user_id: str, new_email: str, db_client: AsyncClient) -> User:
    """
    Update a user's email in both Firebase Auth and Firestore.

    Args:
        user_id: The ID of the user to update
        new_email: The new email address
        db_client: Firestore client

    Returns:
        The updated User object

    Raises:
        HTTPException: If there's an error updating the user email
    """
    try:
        # Validate email format
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, new_email):
            raise HTTPException(status_code=400, detail="Invalid email format")

        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Update email in Firebase Auth
        try:
            auth.update_user(user_id, email=new_email)
            logger.info(f"Successfully updated email in Firebase Auth for user {user_id}")
        except auth.EmailAlreadyExistsError:
            raise HTTPException(status_code=400, detail="Email already in use by another account")
        except auth.UserNotFoundError:
            raise HTTPException(status_code=404, detail="User not found in Firebase Auth")
        except Exception as e:
            logger.error(f"Error updating email in Firebase Auth for user {user_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to update email in Firebase Auth: {str(e)}")

        # Update email in Firestore
        try:
            await user_ref.update({"email": new_email})
            logger.info(f"Successfully updated email in Firestore for user {user_id}")
        except Exception as e:
            # Try to rollback Firebase Auth update
            user_data = user_doc.to_dict()
            old_email = user_data.get("email", "")
            try:
                auth.update_user(user_id, email=old_email)
                logger.info(f"Rolled back Firebase Auth email update for user {user_id}")
            except Exception as rollback_error:
                logger.error(f"Failed to rollback Firebase Auth email update: {rollback_error}")
            
            logger.error(f"Error updating email in Firestore for user {user_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to update email in Firestore: {str(e)}")

        # Get the updated user document
        updated_doc = await user_ref.get()
        updated_data = updated_doc.to_dict()

        # R2 URLs are public, no need to sign them

        return User(**updated_data)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating user email for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update user email: {str(e)}")

async def update_user_email_and_address(user_id: str, email: Optional[str] = None, db_client: AsyncClient = None, avatar: Optional[Any] = None, addresses: Optional[List[Address]] = None) -> User:
    """
    Update a user's email and avatar fields.

    Args:
        user_id: The ID of the user to update
        email: Optional email address to update
        db_client: Firestore client
        avatar: Optional image data for user's avatar (can be base64 encoded string or binary data as bytes)
        addresses: Optional list of address objects with id, street, city, state, zip, and country

    Returns:
        The updated User object with a signed URL for the avatar if it exists

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get user data for display name
        user_data = user_doc.to_dict()
        user_name = user_data.get("displayName", "User")

        # Prepare update data
        update_data = {}

        # Only update email if provided
        if email is not None:
            # Validate email format
            email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_pattern, email):
                raise HTTPException(status_code=400, detail="Invalid email format")
            update_data["email"] = email

        # Convert Address objects to dictionaries for Firestore if provided
        if addresses is not None:
            # Validate each address with Shippo before updating
            validated_addresses = []
            for address in addresses:
                validation_result = await validate_address_with_shippo(address)
                
                # Check if address is valid
                if not validation_result["is_valid"]:
                    # Build error messages
                    error_messages = []
                    for msg in validation_result["messages"]:
                        if msg["code"]:
                            error_messages.append(f"{msg['code']}: {msg['text']}")
                        else:
                            error_messages.append(msg["text"])
                    
                    error_detail = "; ".join(error_messages) if error_messages else "Address validation failed"
                    
                    # Include suggested address in error if available
                    error_response = {
                        "error": f"Address validation failed: {error_detail}",
                        "validation_messages": validation_result["messages"],
                        "address_index": addresses.index(address)
                    }
                    
                    if validation_result.get("validated_address"):
                        error_response["suggested_address"] = validation_result["validated_address"]
                    
                    raise HTTPException(status_code=400, detail=error_response)
                
                # Use the cleaned address if available
                address_dict = address.model_dump()
                if validation_result.get("validated_address"):
                    validated_addr = validation_result["validated_address"]
                    address_dict.update({
                        "name": validated_addr["name"],
                        "street": validated_addr["street"],
                        "city": validated_addr["city"],
                        "state": validated_addr["state"],
                        "zip": validated_addr["zip"],
                        "country": validated_addr["country"]
                    })
                
                validated_addresses.append(address_dict)

            update_data["addresses"] = validated_addresses

        # Handle avatar upload if provided
        if avatar is not None:
            try:
                import base64

                if isinstance(avatar, str) and avatar.strip():  # String avatar
                    if avatar.startswith('data:'):
                        # Handle base64 encoded data URI
                        content_type, avatar_bytes = parse_base64_image(avatar)
                        avatar_gcs_uri = await upload_avatar(avatar_bytes, user_id, content_type)
                    else:
                        # Assume it's a base64 string without data URI prefix
                        try:
                            avatar_bytes = base64.b64decode(avatar)
                            avatar_gcs_uri = await upload_avatar(avatar_bytes, user_id)
                        except Exception:
                            # If it's not base64, treat it as a URL/string
                            update_data["avatar"] = avatar
                            avatar_gcs_uri = None
                elif isinstance(avatar, bytes):  # Binary data
                    # Handle bytes directly
                    avatar_gcs_uri = await upload_avatar(avatar, user_id)
                else:
                    # Unsupported avatar type
                    logger.warning(f"Unsupported avatar type: {type(avatar)}")
                    raise HTTPException(status_code=400, detail="Unsupported avatar format")

                if avatar_gcs_uri:
                    update_data["avatar"] = avatar_gcs_uri
            except HTTPException as e:
                # Re-raise the exception from upload_avatar
                raise e
            except Exception as e:
                logger.error(f"Error uploading avatar for user {user_id}: {e}", exc_info=True)
                raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

        # Only update if there's something to update
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields provided to update")

        # Update the user's fields
        await user_ref.update(update_data)

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()

        # R2 URLs are public, no need to sign them

        updated_user = User(**updated_user_data)

        logger.info(f"Updated user {user_id} with fields: {list(update_data.keys())}")
        return updated_user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

async def add_user_address(user_id: str, address: Address, db_client: AsyncClient, skip_validation: bool = False) -> Dict[str, Any]:
    """
    Add a new address to a user's addresses.

    Args:
        user_id: The ID of the user to update
        address: The Address object to add
        db_client: Firestore client
        skip_validation: If True, saves the address even if validation fails

    Returns:
        Dict containing the updated User object and suggested address if validation fails

    Raises:
        HTTPException: If there's an error adding the address
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()
        current_addresses = user_data.get("addresses", [])

        # Convert Address object to dictionary for Firestore
        address_dict = address.model_dump()

        # If address doesn't have an ID, generate one
        if not address_dict.get("id"):
            address_dict["id"] = f"address_{len(current_addresses) + 1}"

        # Validate address with Shippo unless skip_validation is True
        validation_result = None
        suggested_address = None
        
        if not skip_validation:
            validation_result = await validate_address_with_shippo(address)

            # Check if address is valid
            if not validation_result["is_valid"]:
                # Build error response with suggested address
                error_messages = []
                for msg in validation_result["messages"]:
                    if msg["code"]:
                        error_messages.append(f"{msg['code']}: {msg['text']}")
                    else:
                        error_messages.append(msg["text"])
                
                error_detail = "; ".join(error_messages) if error_messages else "Address validation failed"
                
                # Return validation error with suggested address
                response = {
                    "error": f"Address validation failed: {error_detail}",
                    "validation_messages": validation_result["messages"]
                }
                
                # Include the suggested address if available
                if validation_result.get("validated_address"):
                    response["suggested_address"] = validation_result["validated_address"]
                
                # If skip_validation is False, raise the error
                raise HTTPException(
                    status_code=400, 
                    detail=response
                )

            # Check if Shippo found corrections (even if address is valid)
            if validation_result.get("has_corrections") or validation_result.get("changed_attributes"):
                # Shippo found a better version of the address
                response = {
                    "error": "Address validation found suggested corrections",
                    "validation_messages": [{
                        "code": "ADDRESS_CORRECTED", 
                        "text": "We found a suggested address that may be more accurate for delivery"
                    }],
                    "changed_attributes": validation_result.get("changed_attributes", [])
                }
                
                if validation_result.get("validated_address"):
                    response["suggested_address"] = validation_result["validated_address"]
                
                raise HTTPException(
                    status_code=400,
                    detail=response
                )
            
            # If no corrections and address is valid, use it as-is

        # Add the new address to the list
        current_addresses.append(address_dict)

        # Update the user's addresses field
        await user_ref.update({"addresses": current_addresses})

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**updated_user_data)

        logger.info(f"Added address with ID {address_dict['id']} to user {user_id}")
        
        # Return response with user and validated address
        return {
            "user": updated_user,
            "validated_address": validation_result.get("validated_address")
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding address for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add address: {str(e)}")

async def update_user_address(user_id: str, address_id: str, address: Address, db_client: AsyncClient, skip_validation: bool = False) -> Dict[str, Any]:
    """
    Update an existing address for a user.

    Args:
        user_id: The ID of the user to update
        address_id: The ID of the address to update
        address: The updated Address object
        db_client: Firestore client
        skip_validation: If True, saves the address even if validation fails

    Returns:
        Dict containing the updated User object and suggested address if validation fails

    Raises:
        HTTPException: If there's an error updating the address
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()
        current_addresses = user_data.get("addresses", [])

        # Find the address to update
        address_found = False
        address_index = -1
        for i, addr in enumerate(current_addresses):
            if addr.get("id") == address_id:
                address_found = True
                address_index = i
                break

        if not address_found:
            raise HTTPException(status_code=404, detail=f"Address with ID {address_id} not found for user {user_id}")

        # Convert Address object to dictionary for Firestore
        address_dict = address.model_dump()
        # Preserve the original ID
        address_dict["id"] = address_id

        # Validate address with Shippo unless skip_validation is True
        validation_result = None
        suggested_address = None
        
        if not skip_validation:
            validation_result = await validate_address_with_shippo(address)

            # Check if address is valid
            if not validation_result["is_valid"]:
                # Build error response with suggested address
                error_messages = []
                for msg in validation_result["messages"]:
                    if msg["code"]:
                        error_messages.append(f"{msg['code']}: {msg['text']}")
                    else:
                        error_messages.append(msg["text"])
                
                error_detail = "; ".join(error_messages) if error_messages else "Address validation failed"
                
                # Return validation error with suggested address
                response = {
                    "error": f"Address validation failed: {error_detail}",
                    "validation_messages": validation_result["messages"]
                }
                
                # Include the suggested address if available
                if validation_result.get("validated_address"):
                    response["suggested_address"] = validation_result["validated_address"]
                
                # If skip_validation is False, raise the error
                raise HTTPException(
                    status_code=400, 
                    detail=response
                )

            # Check if Shippo found corrections (even if address is valid)
            if validation_result.get("has_corrections") or validation_result.get("changed_attributes"):
                # Shippo found a better version of the address
                response = {
                    "error": "Address validation found suggested corrections",
                    "validation_messages": [{
                        "code": "ADDRESS_CORRECTED", 
                        "text": "We found a suggested address that may be more accurate for delivery"
                    }],
                    "changed_attributes": validation_result.get("changed_attributes", [])
                }
                
                if validation_result.get("validated_address"):
                    response["suggested_address"] = validation_result["validated_address"]
                
                raise HTTPException(
                    status_code=400,
                    detail=response
                )
            
            # If no corrections and address is valid, use it as-is

        # Update the address in the list
        current_addresses[address_index] = address_dict

        # Update the user's addresses field
        await user_ref.update({"addresses": current_addresses})

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**updated_user_data)

        logger.info(f"Updated address with ID {address_id} for user {user_id}")
        
        # Return response with user and validated address
        return {
            "user": updated_user,
            "validated_address": validation_result.get("validated_address") if validation_result else None
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating address for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update address: {str(e)}")

async def add_points_to_user(user_id: str, points: int, db_client: AsyncClient) -> User:
    """
    Add points to a user's pointsBalance.
    
    WARNING: This function should NEVER be exposed as a public API endpoint!
    Points should only be added through legitimate means:
    - Payment/recharge transactions
    - Card destruction (returning point worth)
    - Marketplace transactions
    - Referral bonuses
    
    This function may be used internally for admin operations or testing only.

    Args:
        user_id: The ID of the user to update
        points: The number of points to add (must be greater than 0)
        db_client: Firestore client

    Returns:
        The updated User object

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Validate points
        if points <= 0:
            raise HTTPException(status_code=400, detail="Points must be greater than 0")

        # Update the user's pointsBalance
        await user_ref.update({
            "pointsBalance": firestore.Increment(points)
        })

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**normalize_user_data_for_model(updated_user_data))

        logger.info(f"Added {points} points to user {user_id}. New balance: {updated_user.pointsBalance}")
        return updated_user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding points to user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add points to user: {str(e)}")

async def add_points_and_update_cash_recharged(user_id: str, points: int, amount_dollars: float, db_client: AsyncClient) -> User:
    """
    Add points to a user's pointsBalance and update totalCashRecharged.

    Args:
        user_id: The ID of the user to update
        points: The number of points to add (must be greater than 0)
        amount_dollars: The amount of cash recharged in dollars
        db_client: Firestore client

    Returns:
        The updated User object

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Validate points
        if points <= 0:
            raise HTTPException(status_code=400, detail="Points must be greater than 0")

        # Validate amount
        if amount_dollars <= 0:
            raise HTTPException(status_code=400, detail="Amount must be greater than 0")

        # Convert amount_dollars to int for totalCashRecharged
        amount_int = int(amount_dollars)

        # Update the user's pointsBalance and totalCashRecharged
        await user_ref.update({
            "pointsBalance": firestore.Increment(points),
            "totalCashRecharged": firestore.Increment(amount_int)
        })

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**normalize_user_data_for_model(updated_user_data))

        logger.info(f"Added {points} points to user {user_id}. New balance: {updated_user.pointsBalance}")
        logger.info(f"Updated totalCashRecharged for user {user_id} by ${amount_int}. New total: {updated_user.totalCashRecharged}")
        return updated_user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")

async def update_seed(user_id: str, db_client: AsyncClient) -> User:
    """
    Update a user's clientSeed with a new random value.

    Args:
        user_id: The ID of the user to update
        db_client: Firestore client

    Returns:
        The updated User object

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Generate a new clientSeed
        new_seed = secrets.token_hex(16)

        # Update the user's clientSeed
        await user_ref.update({
            "clientSeed": new_seed
        })

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**normalize_user_data_for_model(updated_user_data))

        logger.info(f"Updated clientSeed for user {user_id}")
        return updated_user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating clientSeed for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update clientSeed: {str(e)}")

async def create_account(request: CreateAccountRequest, db_client: AsyncClient, user_id: Optional[str] = None) -> User:
    """
    Create a new user account with the specified fields and default values.

    Args:
        request: The CreateAccountRequest object containing user data
        db_client: Firestore client
        user_id: Optional user ID. If not provided, a new UUID will be generated.

    Returns:
        The created User object

    Raises:
        HTTPException: If there's an error creating the user
    """
    try:
        # Generate a unique user ID if not provided
        if not user_id:
            user_id = str(UUID.uuid4())

        # Validate email format
        email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
        if not re.match(email_pattern, request.email):
            raise HTTPException(status_code=400, detail="Invalid email format")

        # Get current timestamp
        now = datetime.now()

        # No need to generate month keys anymore

        # Handle avatar upload if provided
        avatar_url = request.avatar
        if avatar_url:
            # Check if it's a Google avatar URL that needs to be downloaded and re-uploaded
            if avatar_url.startswith('https://') and ('googleusercontent.com' in avatar_url or 'lh3.google.com' in avatar_url):
                try:
                    from utils.google_avatar_utils import download_and_upload_google_avatar, enhance_google_avatar_url
                    # Enhance the Google avatar URL for better quality
                    enhanced_url = enhance_google_avatar_url(avatar_url, size=400)
                    # Download and upload to our storage
                    avatar_url = await download_and_upload_google_avatar(enhanced_url, user_id)
                    if avatar_url:
                        logger.info(f"Successfully processed Google avatar for user {user_id}: {avatar_url}")
                    else:
                        logger.warning(f"Failed to process Google avatar for user {user_id}, using original URL")
                        avatar_url = request.avatar  # Fallback to original URL
                except Exception as e:
                    logger.error(f"Error processing Google avatar for user {user_id}: {e}", exc_info=True)
                    # Continue with account creation using original Google URL as fallback
                    avatar_url = request.avatar
            elif not avatar_url.startswith(('http://', 'https://', 'gs://')):
                # Handle base64 or other non-URL avatar data
                try:
                    # Upload avatar to storage
                    avatar_url = await upload_avatar(avatar_url, user_id)
                except Exception as e:
                    logger.error(f"Error uploading avatar for user {user_id}: {e}", exc_info=True)
                    # Continue with account creation even if avatar upload fails
                    avatar_url = None

        # Validate addresses with Shippo if any are provided
        addresses = []
        if request.addresses:
            for address in request.addresses:
                validation_result = await validate_address_with_shippo(address)
                
                # Check if address is valid
                if not validation_result["is_valid"]:
                    # Build error messages
                    error_messages = []
                    for msg in validation_result["messages"]:
                        if msg["code"]:
                            error_messages.append(f"{msg['code']}: {msg['text']}")
                        else:
                            error_messages.append(msg["text"])
                    
                    error_detail = "; ".join(error_messages) if error_messages else "Address validation failed"
                    
                    # Include suggested address in error if available
                    error_response = {
                        "error": f"Address validation failed: {error_detail}",
                        "validation_messages": validation_result["messages"],
                        "address_index": request.addresses.index(address)
                    }
                    
                    if validation_result.get("validated_address"):
                        error_response["suggested_address"] = validation_result["validated_address"]
                    
                    raise HTTPException(status_code=400, detail=error_response)
                
                # Use the cleaned address if available
                address_dict = address.model_dump()
                if validation_result.get("validated_address"):
                    validated_addr = validation_result["validated_address"]
                    address_dict.update({
                        "name": validated_addr["name"],
                        "street": validated_addr["street"],
                        "city": validated_addr["city"],
                        "state": validated_addr["state"],
                        "zip": validated_addr["zip"],
                        "country": validated_addr["country"]
                    })
                
                addresses.append(address_dict)

        # Generate clientSeed
        clientSeed = secrets.token_hex(16)

        # Generate a random 6-8 character referral code (including numbers and letters)
        code_length = random.randint(6, 8)
        refer_code = ''.join(random.choices('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', k=code_length))

        # Create user data
        user_data = {
            "createdAt": now,
            "displayName": request.displayName,
            "email": request.email,
            "addresses": addresses,
            "avatar": avatar_url,
            "level": 1,
            "pointsBalance": 500,
            "totalCashRecharged": 0,
            "totalPointsSpent": 0,
            "totalFusion": request.totalFusion,
            "clientSeed": clientSeed,
            "total_point_refered": 0,
            "refer_code": refer_code,
            "new_account": True
        }

        # Create user document in Firestore
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        await user_ref.set(user_data)

        # Create a document in the refer_codes collection with the referral code as the document ID
        refer_code_data = {
            "user": user_id,
            "referer_id": user_id
        }

        # Create refer_codes document in Firestore
        refer_code_ref = db_client.collection('refer_codes').document(refer_code)
        await refer_code_ref.set(refer_code_data)
        logger.info(f"Created referral code {refer_code} for user {user_id}")

        # Get the created user
        user_doc = await user_ref.get()
        user_data = user_doc.to_dict()
        user = User(**normalize_user_data_for_model(user_data))

        logger.info(f"Created new user account with ID {user_id}")
        return user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error creating user account: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create user account: {str(e)}")


async def get_user_addresses(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Get all addresses for a user.

    Args:
        user_id: The ID of the user
        db_client: Firestore client

    Returns:
        Dict containing the user's addresses

    Raises:
        HTTPException: If there's an error getting the addresses
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get user data
        user_data = user_doc.to_dict()
        
        # Get addresses
        addresses = user_data.get("addresses", [])
        
        # Transform addresses to ensure they have proper structure
        formatted_addresses = []
        for i, addr in enumerate(addresses):
            formatted_address = {
                "id": addr.get("id", f"address_{i}"),
                "name": addr.get("name", ""),
                "line1": addr.get("street", addr.get("line1", "")),
                "line2": addr.get("line2", ""),
                "city": addr.get("city", ""),
                "state": addr.get("state", ""),
                "postal_code": addr.get("zip", addr.get("postal_code", "")),
                "country": addr.get("country", ""),
                "is_default": i == 0  # First address is default
            }
            formatted_addresses.append(formatted_address)

        return {
            "addresses": formatted_addresses
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting addresses for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get addresses: {str(e)}")


async def get_user_address_by_id(user_id: str, address_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Get a specific address by ID for a user.

    Args:
        user_id: The ID of the user
        address_id: The ID of the address to get
        db_client: Firestore client

    Returns:
        Dict containing the address information

    Raises:
        HTTPException: If the address is not found or there's an error
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get user data
        user_data = user_doc.to_dict()
        
        # Get addresses
        addresses = user_data.get("addresses", [])
        
        # Find the address with the given ID
        for addr in addresses:
            if addr.get("id") == address_id:
                # Format the address
                formatted_address = {
                    "id": addr.get("id"),
                    "name": addr.get("name", ""),
                    "line1": addr.get("street", addr.get("line1", "")),
                    "line2": addr.get("line2", ""),
                    "city": addr.get("city", ""),
                    "state": addr.get("state", ""),
                    "postal_code": addr.get("zip", addr.get("postal_code", "")),
                    "country": addr.get("country", "")
                }
                return formatted_address
        
        # Address not found
        raise HTTPException(status_code=404, detail=f"Address with ID {address_id} not found for user {user_id}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting address {address_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get address: {str(e)}")


async def delete_user_address(user_id: str, address_id: str, db_client: AsyncClient) -> str:
    """
    Delete an address from a user's addresses list.

    Args:
        user_id: The ID of the user to update
        address_id: The ID of the address to delete
        db_client: Firestore client

    Returns:
        A success message

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get current user data
        user_data = user_doc.to_dict()

        # Get current addresses
        current_addresses = user_data.get("addresses", [])

        # Find the address with the given ID
        address_found = False
        updated_addresses = []
        for addr in current_addresses:
            if addr.get("id") != address_id:
                updated_addresses.append(addr)
            else:
                address_found = True

        if not address_found:
            raise HTTPException(status_code=404, detail=f"Address with ID {address_id} not found for user {user_id}")

        # Update the user's addresses field
        await user_ref.update({"addresses": updated_addresses})

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**normalize_user_data_for_model(updated_user_data))

        logger.info(f"Deleted address with ID {address_id} from user {user_id}")
        return f"Successfully deleted address with ID {address_id} from user {user_id}"
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting address for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete address: {str(e)}")


async def update_user_avatar(user_id: str, avatar: bytes, content_type: str, db_client: AsyncClient) -> User:
    """
    Update a user's avatar.

    Args:
        user_id: The ID of the user to update
        avatar: Binary image data for user's avatar
        content_type: The content type of the image (e.g., "image/jpeg")
        db_client: Firestore client

    Returns:
        The updated User object

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Handle avatar upload
        try:
            # Upload avatar to GCS
            avatar_gcs_uri = await upload_avatar(avatar, user_id, content_type)

            # Update the user's avatar field
            await user_ref.update({"avatar": avatar_gcs_uri})
        except HTTPException as e:
            # Re-raise the exception from upload_avatar
            raise e
        except Exception as e:
            logger.error(f"Error uploading avatar for user {user_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to upload avatar: {str(e)}")

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()

        # R2 URLs are public, no need to sign them

        updated_user = User(**normalize_user_data_for_model(updated_user_data))

        logger.info(f"Updated avatar for user {user_id}")
        return updated_user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating avatar for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update avatar: {str(e)}")


async def like_user(user_id: str, target_user_id: str, db_client: AsyncClient) -> dict:
    """
    Like another user.

    Args:
        user_id: The ID of the user who is liking another user
        target_user_id: The ID of the user being liked
        db_client: Firestore client

    Returns:
        A dictionary with information about the like action

    Raises:
        HTTPException: If there's an error liking the user
    """
    try:
        # Check if both users exist
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        target_user_ref = db_client.collection(settings.firestore_collection_users).document(target_user_id)
        target_user_doc = await target_user_ref.get()

        if not target_user_doc.exists:
            raise HTTPException(status_code=404, detail=f"Target user with ID {target_user_id} not found")

        # Create a timestamp for the like action
        liked_at = datetime.now()

        # Add the target user to the user's likes subcollection
        likes_ref = user_ref.collection("likes").document(target_user_id)
        await likes_ref.set({
            "target_user_id": target_user_id,
            "liked_at": liked_at
        })

        logger.info(f"User {user_id} liked user {target_user_id}")

        # Return information about the like action
        return {
            "success": True,
            "message": f"Successfully liked user {target_user_id}",
            "user_id": user_id,
            "target_user_id": target_user_id,
            "liked_at": liked_at
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error liking user {target_user_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to like user: {str(e)}")


async def get_user_public_profile(
    user_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Get public profile information for a user.
    
    Args:
        user_id: The ID of the user to get public profile for
        db_client: Firestore client
    
    Returns:
        A dictionary containing displayName, avatar, totalAchievements, and highlights
    
    Raises:
        HTTPException: If user not found or error fetching profile
    """
    try:
        # Get user basic info
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        user_data = user_doc.to_dict()
        
        # Get user highlights (cards) - simplified version
        highlights = []
        try:
            # Get highlights subcollection
            highlights_ref = user_ref.collection('highlights')
            highlights_query = highlights_ref.order_by('date_got', direction=firestore.Query.DESCENDING).limit(5)
            highlights_docs = await highlights_query.get()
            
            for doc in highlights_docs:
                card_data = doc.to_dict()
                if card_data:
                    # R2 URLs are public, no need to sign them
                    
                    highlights.append({
                        "id": doc.id,
                        "card_name": card_data.get("card_name", ""),
                        "image_url": card_data.get("image_url", ""),
                        "point_worth": card_data.get("point_worth", 0),
                        "rarity": card_data.get("rarity", 1),
                        "subcollection_name": card_data.get("card_collection_id", card_data.get("subcollection_name", "")),
                        "condition": card_data.get("condition", "Mint")  # Card condition (Mint, Near Mint, etc.)
                    })
        except Exception as e:
            logger.warning(f"Failed to get highlights for user {user_id}: {e}")
        
        # Get achievement highlights
        achievement_highlights = []
        try:
            # Get achievement highlights subcollection
            achievement_highlights_ref = user_ref.collection('achievement_highlights')
            achievement_highlights_query = achievement_highlights_ref.limit(10)
            achievement_highlights_docs = await achievement_highlights_query.get()
            
            for doc in achievement_highlights_docs:
                achievement_data = doc.to_dict()
                if achievement_data:
                    # R2 URLs are public, no need to sign them
                    
                    achievement_highlights.append({
                        "id": doc.id,
                        "name": achievement_data.get("name", ""),
                        "description": achievement_data.get("description", ""),
                        "emblemUrl": achievement_data.get("emblemUrl", ""),
                        "emblemId": achievement_data.get("emblemId", ""),
                        "condition": achievement_data.get("condition"),
                        "reward": achievement_data.get("reward"),
                        "awardedAt": achievement_data.get("awardedAt")
                    })
        except Exception as e:
            logger.warning(f"Failed to get achievement highlights for user {user_id}: {e}")
        
        # Count total achievements for the user
        total_achievements = 0
        try:
            achievements_ref = user_ref.collection('achievements')
            count_agg_query = achievements_ref.count()
            count_snapshot = await count_agg_query.get()
            total_achievements = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0
            
            # If count returns 0, let's manually check if there are any documents
            if total_achievements == 0:
                achievements_docs = await achievements_ref.limit(1).get()
                if achievements_docs:
                    # If we find documents but count returns 0, fallback to manual count
                    all_achievements = await achievements_ref.get()
                    total_achievements = len(all_achievements)
        except Exception as e:
            logger.warning(f"Failed to count achievements for user {user_id}: {e}")
            total_achievements = 0
        
        # Build public profile response - with level and achievements
        public_profile = {
            "displayName": user_data.get("displayName", "Unknown User"),
            "avatar": user_data.get("avatar", "/avatars/default.jpg"),
            "level": user_data.get("level", 1),
            "totalAchievements": total_achievements,
            "highlights": highlights,
            "achievementHighlights": achievement_highlights
        }
        
        return public_profile
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting public profile for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An error occurred while retrieving the public profile")


async def validate_referral_code(referral_code: str, current_user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Validate a referral code and return the owner's information.
    
    Args:
        referral_code: The referral code to validate
        current_user_id: The ID of the user trying to use the referral code
        db_client: Firestore client
    
    Returns:
        Dict containing:
        - is_valid: Whether the referral code is valid
        - owner_id: The ID of the user who owns this referral code
        - owner_name: The display name of the referral code owner
        - error: Error message if validation fails
    
    Raises:
        HTTPException: If there's an error validating the referral code
    """
    try:
        # Check if referral code exists
        refer_code_ref = db_client.collection('refer_codes').document(referral_code)
        refer_code_doc = await refer_code_ref.get()
        
        if not refer_code_doc.exists:
            return {
                "is_valid": False,
                "owner_id": None,
                "owner_name": None,
                "error": "Invalid referral code"
            }
        
        refer_code_data = refer_code_doc.to_dict()
        referer_id = refer_code_data.get('referer_id') or refer_code_data.get('user')
        
        # Check if user is trying to use their own referral code
        if referer_id == current_user_id:
            return {
                "is_valid": False,
                "owner_id": referer_id,
                "owner_name": None,
                "error": "You cannot use your own referral code"
            }
        
        # Check if the current user has already been referred
        user_ref = db_client.collection(settings.firestore_collection_users).document(current_user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            return {
                "is_valid": False,
                "owner_id": None,
                "owner_name": None,
                "error": "User not found"
            }
        
        user_data = user_doc.to_dict()
        
        # Check if user already has a referrer (check both field name variations)
        if user_data.get('referred_by') or user_data.get('refered_by'):
            return {
                "is_valid": False,
                "owner_id": referer_id,
                "owner_name": None,
                "error": "You have already been referred by another user"
            }
        
        # Get the referrer's information
        referer_ref = db_client.collection(settings.firestore_collection_users).document(referer_id)
        referer_doc = await referer_ref.get()
        
        if not referer_doc.exists:
            logger.warning(f"Referral code {referral_code} points to non-existent user {referer_id}")
            return {
                "is_valid": False,
                "owner_id": referer_id,
                "owner_name": None,
                "error": "Referral code owner not found"
            }
        
        referer_data = referer_doc.to_dict()
        referer_name = referer_data.get('displayName', 'Unknown User')
        
        return {
            "is_valid": True,
            "owner_id": referer_id,
            "owner_name": referer_name,
            "error": None
        }
        
    except Exception as e:
        logger.error(f"Error validating referral code {referral_code}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to validate referral code")


async def check_daily_reward_claimed(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Check if a user has already claimed their daily reward today.
    Uses US Central timezone to determine today's date.

    Args:
        user_id: The ID of the user to check
        db_client: Firestore client

    Returns:
        Dict containing:
        - has_claimed: Whether the user has claimed today's reward
        - today_date: Today's date in YYYYMMDD format (US Central timezone)
        - claim_id: The claim document ID if claimed, None otherwise

    Raises:
        HTTPException: If there's an error checking the claim status
    """
    try:
        # Get today's date in US Central timezone
        central_tz = ZoneInfo("America/Chicago")
        today_central = datetime.now(central_tz)
        today_date_str = today_central.strftime("%Y%m%d")
        
        # Create claim document ID using user_id and today's date
        claim_doc_id = f"{user_id}_{today_date_str}"
        
        # Check if claim document exists in dailyDrawClaims collection
        claim_ref = db_client.collection("dailyDrawClaims").document(claim_doc_id)
        claim_doc = await claim_ref.get()
        
        has_claimed = claim_doc.exists
        
        logger.info(f"Daily reward claim check for user {user_id}: has_claimed={has_claimed}, today={today_date_str}")
        
        return {
            "has_claimed": has_claimed,
            "today_date": today_date_str,
            "claim_id": claim_doc_id if has_claimed else None
        }
        
    except Exception as e:
        logger.error(f"Error checking daily reward claim for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check daily reward claim status: {str(e)}")


async def update_user_new_account(user_id: str, new_account: bool, db_client: AsyncClient) -> User:
    """
    Update a user's new_account field.

    Args:
        user_id: The ID of the user to update
        new_account: The new value for the new_account field
        db_client: Firestore client

    Returns:
        The updated User object

    Raises:
        HTTPException: If there's an error updating the user
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Update the user's new_account field
        await user_ref.update({
            "new_account": new_account
        })

        # Get the updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict()
        updated_user = User(**normalize_user_data_for_model(updated_user_data))

        logger.info(f"Updated new_account field to {new_account} for user {user_id}")
        return updated_user
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating new_account for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update new_account field: {str(e)}")
