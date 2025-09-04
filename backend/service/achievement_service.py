from typing import Optional, Dict, List, Any
import base64
import uuid
from datetime import datetime
import json

from fastapi import HTTPException, UploadFile
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient

from config import get_logger, settings, get_firestore_client, get_storage_client
from models.achievement_schemas import Achievement, AchievementCreate, AchievementResponse, AchievementCreateForm, UploadAchievementSchema, PaginatedAchievementResponse, GroupedAchievementResponse, AwardAchievementRequest, UserAchievement, AwardAchievementResponse
from utils.storage_utils import parse_base64_image, get_file_extension, upload_image
from io import BytesIO
try:
    from PIL import Image
except Exception:
    Image = None

logger = get_logger(__name__)

def convert_legacy_rarity_to_int(rarity_value) -> Optional[int]:
    """
    Convert legacy string rarity values to integers.

    Args:
        rarity_value: The rarity value (can be string, int, or None)

    Returns:
        Optional[int]: The rarity as an integer, or None if invalid
    """
    if rarity_value is None:
        return None

    # If it's already an integer, return it
    if isinstance(rarity_value, int):
        return rarity_value

    # If it's a string, convert it to integer
    if isinstance(rarity_value, str):
        # Define mapping for legacy string values
        rarity_mapping = {
            'common': 1,
            'normal': 1,
            'uncommon': 2,
            'rare': 3,
            'epic': 4,
            'legendary': 5,
            'mythic': 6,
            'divine': 7
        }

        # Try direct mapping first
        lower_rarity = rarity_value.lower().strip()
        if lower_rarity in rarity_mapping:
            return rarity_mapping[lower_rarity]

        # Try to parse as integer string
        try:
            parsed_int = int(rarity_value)
            # Validate range (1-7)
            if 1 <= parsed_int <= 7:
                return parsed_int
        except (ValueError, TypeError):
            pass

    # If we can't convert it, log a warning and return None
    logger.warning(f"Could not convert rarity value '{rarity_value}' to integer. Using None.")
    return None

async def process_achievement_rewards(rewards: Optional[List[Dict[str, Any]]]) -> Optional[List[Dict[str, Any]]]:
    """
    Process achievement rewards and convert emblem URLs to signed URLs.

    Args:
        rewards: List of reward dictionaries

    Returns:
        List of processed rewards with signed URLs for emblems
    """
    if not rewards or not isinstance(rewards, list):
        return rewards

    processed_rewards = []
    for reward in rewards:
        if not isinstance(reward, dict):
            processed_rewards.append(reward)
            continue

        # Create a copy of the reward to avoid modifying the original
        processed_reward = reward.copy()

        # Check if this is an emblem reward and convert URL to signed URL
        if reward.get('type') == 'emblem' and 'url' in reward:
            # R2 URLs are public, no need to sign them
            emblem_url = reward.get('url')
            if emblem_url:
                processed_reward['url'] = emblem_url

        processed_rewards.append(processed_reward)

    return processed_rewards

async def upload_achievement_json(achievement_data: UploadAchievementSchema) -> AchievementResponse:
    """
    Process achievement data with optional emblem image and create an achievement.

    Args:
        achievement_data: The achievement data with optional emblem image

    Returns:
        AchievementResponse: The created achievement with emblem ID and URL if applicable

    Raises:
        HTTPException: If there's an error processing the achievement data
    """
    try:
        # Generate a unique ID for the achievement
        achievement_id = str(uuid.uuid4())

        # Process and validate the condition
        condition = {
            "type": achievement_data.condition.type,
            "target": achievement_data.condition.target
        }

        # For draw_by_rarity, add the point_worth field to indicate the threshold
        if achievement_data.condition.type == "draw_by_rarity" and hasattr(achievement_data.condition, 'point_worth'):
            condition["point_worth"] = achievement_data.condition.point_worth

        # Validate condition type
        valid_condition_types = [
            "level_reached",
            "fusion_reached",
            "draw_by_rarity",
            "buy_deal_reached",
            "sell_deal_reached",
            "withdraw_reached",
            "special"
        ]
        if condition["type"] not in valid_condition_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid condition type '{condition['type']}'. Valid types are: {', '.join(valid_condition_types)}"
            )

        # Validate target requirement based on condition type
        if condition["type"] == "special":
            # Special achievements don't require a target
            condition.pop("target", None)  # Remove target if provided
        else:
            # All other achievement types require a target
            if not achievement_data.condition.target or achievement_data.condition.target < 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"Target value is required and must be at least 1 for condition type '{condition['type']}'"
                )

        # Process the rewards
        processed_rewards = []

        # Handle case where reward is None or empty
        if achievement_data.reward:
            for reward in achievement_data.reward:
                if reward.type == "point":
                    # Process point reward
                    processed_rewards.append({
                        "type": "point",
                        "amount": reward.amount
                    })
                elif reward.type == "emblem":
                    # Process emblem reward - image is required
                    image_base64 = reward.image
                    if not image_base64:
                        raise HTTPException(
                            status_code=400,
                            detail="Image data is required for emblem rewards"
                        )

                    if image_base64:
                        # Generate emblem ID
                        emblem_id = str(uuid.uuid4())

                        # Parse base64 image (returns content_type and already decoded binary data)
                        try:
                            content_type, image_data = parse_base64_image(image_base64)
                        except ValueError as e:
                            logger.error(f"Invalid base64 image: {e}")
                            raise HTTPException(status_code=400, detail=f"Invalid base64 image: {e}")

                        # If PNG, ensure transparency. If the PNG has no alpha or has a solid white background,
                        # try to convert white to transparent to avoid white boxes.
                        if content_type == 'image/png' and Image is not None:
                            try:
                                img = Image.open(BytesIO(image_data))
                                # If no alpha channel, add one
                                if img.mode not in ('RGBA', 'LA'):
                                    img = img.convert('RGBA')
                                # Heuristic: make near-white pixels transparent
                                px = img.load()
                                w, h = img.size
                                threshold = 240  # 0-255; consider >240 as white-ish
                                changed = False
                                for y in range(h):
                                    for x in range(w):
                                        r, g, b, a = px[x, y]
                                        if a == 0:
                                            continue
                                        if r >= threshold and g >= threshold and b >= threshold:
                                            px[x, y] = (r, g, b, 0)
                                            changed = True
                                if changed:
                                    buf = BytesIO()
                                    img.save(buf, format='PNG')
                                    image_data = buf.getvalue()
                                    # Ensure we still mark as PNG
                                    content_type = 'image/png'
                            except Exception as e:
                                logger.warning(f"Transparency enforcement skipped due to error: {e}")

                        # Upload image to R2
                        # Create a unique filename
                        file_extension = get_file_extension(content_type)
                        blob_name = f"emblems/{emblem_id}.{file_extension}"

                        # Upload to R2
                        image_url = await upload_image(
                            image_data=image_data,
                            object_key=blob_name,
                            bucket_type='achievement',
                            content_type=content_type
                        )

                        # Use the R2 URL
                        gcs_uri = image_url

                        # Create emblem document in Firestore
                        firestore_client = get_firestore_client()
                        emblem_ref = firestore_client.collection("emblems").document(emblem_id)

                        await emblem_ref.set({
                            "id": emblem_id,
                            "gcs_uri": gcs_uri,
                            "created_at": firestore.SERVER_TIMESTAMP,
                            "achievement_id": achievement_id
                        })

                        # Add emblem to processed rewards
                        processed_rewards.append({
                            "type": "emblem",
                            "emblemId": emblem_id,
                            "url": gcs_uri  # This will be converted to a signed URL in the response
                        })
                else:
                    # Unknown reward type
                    raise HTTPException(
                        status_code=400,
                        detail=f"Invalid reward type '{reward.type}'. Valid types are: 'point', 'emblem'"
                    )

        # Create achievement document in Firestore
        firestore_client = get_firestore_client()
        achievement_ref = firestore_client.collection("achievements").document(achievement_id)

        achievement_data_dict = {
            "id": achievement_id,
            "name": achievement_data.name,
            "description": achievement_data.description,
            "condition": condition,
            "reward": processed_rewards,
            "rarity": achievement_data.rarity,
            "rank": achievement_data.rank,
            "created_at": firestore.SERVER_TIMESTAMP
        }

        await achievement_ref.set(achievement_data_dict)

        # Convert rarity to integer if needed
        converted_rarity = convert_legacy_rarity_to_int(achievement_data.rarity)

        # Process rewards to convert emblem URLs to signed URLs
        processed_rewards_with_signed_urls = await process_achievement_rewards(processed_rewards)

        # Create response
        response = AchievementResponse(
            id=achievement_id,
            name=achievement_data.name,
            description=achievement_data.description,
            condition=condition,
            reward=processed_rewards_with_signed_urls,
            rarity=converted_rarity,
            rank=achievement_data.rank
        )

        return response

    except Exception as e:
        logger.error(f"Error processing achievement data: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to process achievement: {str(e)}")


async def update_achievement(
    achievement_id: str,
    update_data: Dict[str, Any]
) -> AchievementResponse:
    """
    Update an achievement by ID.

    Args:
        achievement_id: The ID of the achievement to update
        update_data: Dictionary containing the fields to update

    Returns:
        AchievementResponse: The updated achievement

    Raises:
        HTTPException: If the achievement is not found or there's an error updating it
    """
    try:
        # Get Firestore client
        firestore_client = get_firestore_client()

        # Get a reference to the achievement document
        achievement_ref = firestore_client.collection("achievements").document(achievement_id)

        # Check if the achievement exists
        achievement_doc = await achievement_ref.get()
        if not achievement_doc.exists:
            raise HTTPException(status_code=404, detail=f"Achievement with ID {achievement_id} not found")

        # Get the current achievement data
        achievement_data = achievement_doc.to_dict()

        # Update the achievement document
        # Only update the fields that are provided in update_data
        update_fields = {}
        if "name" in update_data:
            update_fields["name"] = update_data["name"]
        if "description" in update_data:
            update_fields["description"] = update_data["description"]
        if "condition" in update_data:
            update_fields["condition"] = update_data["condition"]
        if "reward" in update_data:
            update_fields["reward"] = update_data["reward"]
        if "rarity" in update_data:
            update_fields["rarity"] = update_data["rarity"]
        if "rank" in update_data:
            update_fields["rank"] = update_data["rank"]

        # Add updated_at timestamp
        update_fields["updated_at"] = firestore.SERVER_TIMESTAMP

        # Update the document
        await achievement_ref.update(update_fields)

        # Get the updated achievement data
        updated_doc = await achievement_ref.get()
        updated_data = updated_doc.to_dict()

        # Convert rarity to integer if needed
        converted_rarity = convert_legacy_rarity_to_int(updated_data.get("rarity"))

        # Process rewards to convert emblem URLs to signed URLs
        processed_rewards = await process_achievement_rewards(updated_data.get("reward"))

        # Create response
        response = AchievementResponse(
            id=updated_data.get("id"),
            name=updated_data.get("name"),
            description=updated_data.get("description"),
            condition=updated_data.get("condition"),
            reward=processed_rewards,
            rarity=converted_rarity,
            rank=updated_data.get("rank")
        )

        return response

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating achievement {achievement_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update achievement: {str(e)}")

async def delete_achievement(achievement_id: str) -> Dict[str, Any]:
    """
    Delete an achievement by ID.

    Args:
        achievement_id: The ID of the achievement to delete

    Returns:
        Dict[str, Any]: Success message

    Raises:
        HTTPException: If the achievement is not found or there's an error deleting it
    """
    try:
        # Get Firestore client
        firestore_client = get_firestore_client()

        # Get a reference to the achievement document
        achievement_ref = firestore_client.collection("achievements").document(achievement_id)

        # Check if the achievement exists
        achievement_doc = await achievement_ref.get()
        if not achievement_doc.exists:
            raise HTTPException(status_code=404, detail=f"Achievement with ID {achievement_id} not found")

        # Delete the achievement document
        await achievement_ref.delete()

        return {
            "status": "success",
            "message": f"Achievement with ID {achievement_id} deleted successfully"
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting achievement {achievement_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete achievement: {str(e)}")

async def get_achievements(
    page: int, 
    size: int, 
    condition_type: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_direction: Optional[str] = "desc"
) -> PaginatedAchievementResponse:
    """
    Get achievements with pagination, optional filtering by condition type, and sorting.

    Args:
        page: Page number (starts from 1)
        size: Number of items per page
        condition_type: Optional filter by condition type
        sort_by: Field to sort by (rank, rarity, created_at)
        sort_direction: Sort direction (asc, desc)

    Returns:
        PaginatedAchievementResponse: Paginated list of achievements

    Raises:
        HTTPException: If there's an error fetching the achievements
    """
    try:
        # Calculate offset for pagination
        offset = (page - 1) * size

        # Get Firestore client
        firestore_client = get_firestore_client()

        # Create base query
        query = firestore_client.collection("achievements")

        # Apply condition type filter if provided
        if condition_type:
            query = query.where("condition.type", "==", condition_type)

        # Get total count for pagination
        total_query = query
        total_docs = [doc async for doc in total_query.stream()]
        total = len(total_docs)

        # Determine sort field and direction
        sort_field = "created_at"  # Default sort field
        if sort_by in ["rank", "rarity"]:
            sort_field = sort_by

        # Determine sort direction
        direction = firestore.Query.DESCENDING
        if sort_direction and sort_direction.lower() == "asc":
            direction = firestore.Query.ASCENDING

        # Apply sorting and pagination
        # Note: If filtering by condition.type and sorting by a different field,
        # a composite index may be required in Firestore
        try:
            query = query.order_by(sort_field, direction=direction)
            query = query.offset(offset).limit(size)
        except Exception as e:
            # If there's an error with the query (e.g., missing index),
            # fall back to sorting by created_at
            logger.warning(f"Error applying sort by {sort_field}: {e}. Falling back to created_at.")
            query = query.order_by("created_at", direction=firestore.Query.DESCENDING)
            query = query.offset(offset).limit(size)

        # Execute query
        achievements = []
        async for doc in query.stream():
            achievement_data = doc.to_dict()
            achievement_id = doc.id

            try:
                # Validate and process condition data
                condition_data = achievement_data.get("condition")
                if condition_data:
                    # Check if condition has required fields
                    if not isinstance(condition_data, dict):
                        logger.warning(f"Achievement {achievement_id} has invalid condition type: {type(condition_data)}")
                        continue

                    if "type" not in condition_data:
                        logger.warning(f"Achievement {achievement_id} has malformed condition data: {condition_data}")
                        continue

                    # Special achievements don't require a target, but all others do
                    condition_type = condition_data.get("type")
                    if condition_type != "special" and "target" not in condition_data:
                        logger.warning(f"Achievement {achievement_id} has malformed condition data - missing target: {condition_data}")
                        continue

                    # Validate condition fields
                    if not isinstance(condition_type, str):
                        logger.warning(f"Achievement {achievement_id} has invalid condition type: {condition_data}")
                        continue
                    
                    # Validate target field for non-special achievements
                    if condition_type != "special":
                        target = condition_data.get("target")
                        if not isinstance(target, (int, float)):
                            logger.warning(f"Achievement {achievement_id} has invalid target field type: {condition_data}")
                            continue

                # Convert legacy rarity to integer
                raw_rarity = achievement_data.get("rarity")
                converted_rarity = convert_legacy_rarity_to_int(raw_rarity)

                # Process rewards to convert emblem URLs to signed URLs
                processed_rewards = await process_achievement_rewards(achievement_data.get("reward"))

                # Convert to AchievementResponse
                achievement = AchievementResponse(
                    id=achievement_data.get("id"),
                    name=achievement_data.get("name"),
                    description=achievement_data.get("description"),
                    condition=condition_data,
                    reward=processed_rewards,
                    rarity=converted_rarity,
                    rank=achievement_data.get("rank")
                )

                achievements.append(achievement)

            except Exception as e:
                logger.error(f"Error processing achievement {achievement_id}: {e}", exc_info=True)
                # Skip this achievement and continue with others
                continue

        # Create paginated response
        response = PaginatedAchievementResponse(
            items=achievements,
            total=total,
            page=page,
            size=size
        )

        return response

    except Exception as e:
        logger.error(f"Error fetching achievements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch achievements: {str(e)}")


async def get_achievements_grouped(
    page: int = 1,
    size: int = 100
) -> GroupedAchievementResponse:
    """
    Get all achievements grouped by condition type and sorted by rank within each group.
    
    Args:
        page: Page number (starts from 1)
        size: Number of items per page (total across all groups)
    
    Returns:
        GroupedAchievementResponse: Achievements grouped by condition type
    
    Raises:
        HTTPException: If there's an error fetching the achievements
    """
    try:
        # Get Firestore client
        firestore_client = get_firestore_client()
        
        # Fetch all achievements (we need all to group properly)
        query = firestore_client.collection("achievements")
        
        # Get all achievements
        all_achievements = []
        async for doc in query.stream():
            achievement_data = doc.to_dict()
            achievement_id = doc.id
            
            try:
                # Validate and process condition data
                condition_data = achievement_data.get("condition")
                if condition_data:
                    # Check if condition has required fields
                    if not isinstance(condition_data, dict):
                        logger.warning(f"Achievement {achievement_id} has invalid condition type: {type(condition_data)}")
                        continue
                    
                    if "type" not in condition_data:
                        logger.warning(f"Achievement {achievement_id} has malformed condition data: {condition_data}")
                        continue
                    
                    # Special achievements don't require a target, but all others do
                    condition_type = condition_data.get("type")
                    if condition_type != "special" and "target" not in condition_data:
                        logger.warning(f"Achievement {achievement_id} has malformed condition data - missing target: {condition_data}")
                        continue
                    
                    # Validate condition fields
                    if not isinstance(condition_type, str):
                        logger.warning(f"Achievement {achievement_id} has invalid condition type: {condition_data}")
                        continue
                    
                    # Validate target field for non-special achievements
                    if condition_type != "special":
                        target = condition_data.get("target")
                        if not isinstance(target, (int, float)):
                            logger.warning(f"Achievement {achievement_id} has invalid target field type: {condition_data}")
                            continue
                
                # Convert legacy rarity to integer
                raw_rarity = achievement_data.get("rarity")
                converted_rarity = convert_legacy_rarity_to_int(raw_rarity)
                
                # Process rewards to convert emblem URLs to signed URLs
                processed_rewards = await process_achievement_rewards(achievement_data.get("reward"))
                
                # Convert to AchievementResponse
                achievement = AchievementResponse(
                    id=achievement_data.get("id"),
                    name=achievement_data.get("name"),
                    description=achievement_data.get("description"),
                    condition=condition_data,
                    reward=processed_rewards,
                    rarity=converted_rarity,
                    rank=achievement_data.get("rank", 999999)  # Default rank if not set
                )
                
                all_achievements.append(achievement)
                
            except Exception as e:
                logger.error(f"Error processing achievement {achievement_id}: {e}", exc_info=True)
                # Skip this achievement and continue with others
                continue
        
        # Group achievements by condition type
        grouped_achievements = {}
        for achievement in all_achievements:
            condition_type = achievement.condition.get("type") if achievement.condition else "unknown"
            
            if condition_type not in grouped_achievements:
                grouped_achievements[condition_type] = []
            
            grouped_achievements[condition_type].append(achievement)
        
        # Sort each group by rank (ascending order)
        for condition_type in grouped_achievements:
            grouped_achievements[condition_type].sort(key=lambda x: x.rank if x.rank is not None else 999999)
        
        # Order the groups in a specific order for display
        ordered_types = [
            "level_reached",
            "fusion_reached", 
            "draw_by_rarity",
            "buy_deal_reached",
            "sell_deal_reached",
            "withdraw_reached",
            "special"
        ]
        
        # Create ordered groups dictionary
        ordered_groups = {}
        for condition_type in ordered_types:
            if condition_type in grouped_achievements:
                ordered_groups[condition_type] = grouped_achievements[condition_type]
        
        # Add any remaining types not in the ordered list
        for condition_type, achievements in grouped_achievements.items():
            if condition_type not in ordered_types:
                ordered_groups[condition_type] = achievements
        
        # Apply pagination (slice the total achievements across all groups)
        offset = (page - 1) * size
        
        # Flatten all achievements to apply pagination
        all_flattened = []
        for condition_type in ordered_groups:
            all_flattened.extend(ordered_groups[condition_type])
        
        total = len(all_flattened)
        
        # Apply pagination
        paginated_achievements = all_flattened[offset:offset + size]
        
        # Rebuild groups with paginated data
        paginated_groups = {}
        for achievement in paginated_achievements:
            condition_type = achievement.condition.get("type") if achievement.condition else "unknown"
            
            if condition_type not in paginated_groups:
                paginated_groups[condition_type] = []
            
            paginated_groups[condition_type].append(achievement)
        
        # Create response
        response = GroupedAchievementResponse(
            groups=paginated_groups,
            total=total,
            page=page,
            size=size
        )
        
        return response
        
    except Exception as e:
        logger.error(f"Error fetching grouped achievements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch grouped achievements: {str(e)}")


async def award_achievement_to_user(
    award_request: AwardAchievementRequest
) -> AwardAchievementResponse:
    """
    Award an achievement to a user.
    
    Args:
        award_request: Request containing user_id, achievement_id, and optional notes
    
    Returns:
        AwardAchievementResponse: Response containing success status and user achievement data
    
    Raises:
        HTTPException: If there's an error awarding the achievement
    """
    try:
        # Get Firestore client
        firestore_client = get_firestore_client()
        
        # Check if user exists
        user_ref = firestore_client.collection("users").document(award_request.user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {award_request.user_id} not found")
        
        # Check if achievement exists
        achievement_ref = firestore_client.collection("achievements").document(award_request.achievement_id)
        achievement_doc = await achievement_ref.get()
        if not achievement_doc.exists:
            raise HTTPException(status_code=404, detail=f"Achievement with ID {award_request.achievement_id} not found")
        
        achievement_data = achievement_doc.to_dict()
        
        # Check if user already has this achievement using subcollection structure
        user_achievements_ref = user_ref.collection("achievements")
        existing_achievement_ref = user_achievements_ref.document(award_request.achievement_id)
        existing_doc = await existing_achievement_ref.get()
        
        if existing_doc.exists:
            raise HTTPException(
                status_code=400, 
                detail=f"User {award_request.user_id} already has achievement {award_request.achievement_id}"
            )
        
        # Get user data and achievement condition
        user_data = user_doc.to_dict()
        achievement_condition = achievement_data.get("condition", {})
        
        # Create user achievement record matching the Cloud Function structure
        current_time = datetime.now()
        user_achievement_data = {
            "achievement_id": award_request.achievement_id,
            "name": achievement_data.get("name"),
            "description": achievement_data.get("description"),
            "type": achievement_condition.get("type"),
            "condition": achievement_condition,
            "reward": achievement_data.get("reward", []),
            "rank": achievement_data.get("rank"),
            "rarity": achievement_data.get("rarity"),
            "acquired": True,
            "progress": achievement_condition.get("target", 0),  # Set progress to target when achieved
            "emblemId": None,
            "emblemUrl": None,
            "awardedAt": current_time,
            "notes": award_request.notes  # Add our custom notes field
        }
        
        # If there's an emblem reward, store its ID and URL
        rewards = achievement_data.get("reward", [])
        for reward in rewards:
            if reward.get("type") == "emblem":
                user_achievement_data["emblemId"] = reward.get("emblemId")
                user_achievement_data["emblemUrl"] = reward.get("url")
                break
        
        # Store in the user's achievements subcollection using achievement_id as document ID
        user_achievement_ref = user_achievements_ref.document(award_request.achievement_id)
        logger.info(f"Creating user achievement document at: users/{award_request.user_id}/achievements/{award_request.achievement_id}")
        logger.info(f"User achievement data: {user_achievement_data}")
        await user_achievement_ref.set(user_achievement_data)
        logger.info(f"Successfully created user achievement document")
        
        # Update user's totalAchievements count
        current_total = user_data.get("totalAchievements", 0)
        logger.info(f"Updating user's totalAchievements from {current_total} to {current_total + 1}")
        await user_ref.update({"totalAchievements": current_total + 1})
        logger.info(f"Successfully updated user's totalAchievements")
        
        # Process achievement rewards if they exist (matching Cloud Function logic)
        total_new_points = 0
        rewards = achievement_data.get("reward", [])
        if rewards:
            for reward in rewards:
                if reward.get("type") == "point":
                    point_amount = reward.get("amount", 0)
                    total_new_points += point_amount
                    logger.info(f"Achievement '{award_request.achievement_id}' grants {point_amount} points")
            
            # Update user's pointsBalance if there are any point rewards
            if total_new_points > 0:
                current_balance = user_data.get("pointsBalance", 0)
                new_balance = current_balance + total_new_points
                await user_ref.update({"pointsBalance": new_balance})
                logger.info(f"Updated user pointsBalance from {current_balance} to {new_balance}")
        
        # Create response (using achievement_id as the id since that's how it's stored)
        user_achievement = UserAchievement(
            id=award_request.achievement_id,  # Use achievement_id as document ID
            user_id=award_request.user_id,
            achievement_id=award_request.achievement_id,
            earned_at=current_time.isoformat(),
            notes=award_request.notes,
            achievement_name=achievement_data.get("name"),
            achievement_description=achievement_data.get("description")
        )
        
        response = AwardAchievementResponse(
            success=True,
            message=f"Successfully awarded achievement '{achievement_data.get('name')}' to user {award_request.user_id}",
            user_achievement=user_achievement
        )
        
        logger.info(f"Successfully awarded achievement {award_request.achievement_id} to user {award_request.user_id}")
        return response
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error awarding achievement {award_request.achievement_id} to user {award_request.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to award achievement: {str(e)}")


async def get_user_achievements(
    user_id: str,
    page: int = 1,
    size: int = 10
) -> Dict[str, Any]:
    """
    Get achievements earned by a specific user.
    
    Args:
        user_id: ID of the user
        page: Page number (starts from 1)
        size: Number of items per page
    
    Returns:
        Dictionary containing user achievements and pagination info
    
    Raises:
        HTTPException: If there's an error fetching user achievements
    """
    try:
        # Calculate offset for pagination
        offset = (page - 1) * size
        
        # Get Firestore client
        firestore_client = get_firestore_client()
        
        # Query user achievements from subcollection
        user_ref = firestore_client.collection("users").document(user_id)
        user_achievements_ref = user_ref.collection("achievements")
        query = user_achievements_ref.order_by("awardedAt", direction=firestore.Query.DESCENDING)
        
        # Get total count
        total_docs = [doc async for doc in query.stream()]
        total = len(total_docs)
        
        # Apply pagination
        paginated_query = query.offset(offset).limit(size)
        
        # Execute paginated query
        user_achievements = []
        async for doc in paginated_query.stream():
            achievement_data = doc.to_dict()
            # Convert awardedAt to ISO string if it's a datetime object
            awarded_at = achievement_data.get("awardedAt")
            if hasattr(awarded_at, 'isoformat'):
                awarded_at = awarded_at.isoformat()
            elif awarded_at:
                awarded_at = str(awarded_at)
            
            user_achievement = UserAchievement(
                id=doc.id,  # Document ID is the achievement_id
                user_id=user_id,
                achievement_id=achievement_data.get("achievement_id"),
                earned_at=awarded_at,
                notes=achievement_data.get("notes"),
                achievement_name=achievement_data.get("name"),
                achievement_description=achievement_data.get("description")
            )
            user_achievements.append(user_achievement)
        
        return {
            "achievements": user_achievements,
            "total": total,
            "page": page,
            "size": size
        }
        
    except Exception as e:
        logger.error(f"Error fetching user achievements for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to fetch user achievements: {str(e)}")
