from typing import Dict, Any, Optional, List, Tuple
from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient
import math
from datetime import datetime, timedelta
import asyncio
from functools import lru_cache

from config import get_logger, settings
from models.schemas import Achievement, UserAchievement, UserAchievementSimple, AchievementWithProgress, AchievementResponse, PaginationInfo
# No need for storage utils - R2 URLs are public

logger = get_logger(__name__)

# Cache for grouped achievements (TTL: 5 minutes)
_grouped_achievements_cache = {
    'data': None,
    'timestamp': None,
    'lock': asyncio.Lock()
}
CACHE_TTL_SECONDS = 300  # 5 minutes

def get_condition_attr(condition, attr_name, default=None):
    """
    Helper function to safely get attributes from condition objects
    that can be either dicts or Pydantic models.
    
    Args:
        condition: The condition object (dict or Pydantic model)
        attr_name: The attribute name to get
        default: Default value if attribute doesn't exist
    
    Returns:
        The attribute value or default
    """
    if not condition:
        return default
    
    if isinstance(condition, dict):
        return condition.get(attr_name, default)
    else:
        return getattr(condition, attr_name, default)

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

async def get_user_achievements(
    user_id: str, 
    db_client: AsyncClient, 
    page: int = 1, 
    per_page: int = 10,
    sort_by: str = "awardedAt",
    sort_order: str = "desc"
) -> Tuple[List[UserAchievementSimple], PaginationInfo]:
    """
    Get all achievements for a specific user with pagination and sorting.

    Args:
        user_id: The ID of the user
        db_client: Firestore client
        page: The page number (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "updated_at")
        sort_order: The sort order, "asc" or "desc" (default: "desc")

    Returns:
        A tuple containing:
        - A list of AchievementWithProgress objects
        - PaginationInfo object with pagination details

    Raises:
        HTTPException: If there's an error getting the user achievements
    """
    try:
        # Calculate offset
        offset = (page - 1) * per_page

        # Determine sort direction
        direction = firestore.Query.DESCENDING if sort_order.lower() == "desc" else firestore.Query.ASCENDING

        # Reference to the user's achievements subcollection
        user_achievements_ref = db_client.collection(settings.firestore_collection_users).document(user_id).collection('achievements')

        # Apply sorting
        query = user_achievements_ref.order_by(sort_by, direction=direction)

        # Get total count
        total_count_docs = await user_achievements_ref.get()
        total_count = len(total_count_docs)

        # Calculate total pages
        total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1

        # Apply pagination (Firestore doesn't have direct offset/limit pagination, so we need to use limit and start_after)
        # For simplicity, we'll get all documents and then slice them
        all_docs = await query.get()

        # Slice the documents based on pagination
        paginated_docs = all_docs[offset:offset + per_page]

        # Convert to AchievementWithProgress objects
        user_achievements = []
        for doc in paginated_docs:
            user_achievement_data = doc.to_dict()
            achievement_id = user_achievement_data.get('achievement_id', doc.id)

            # Get the achievement details from the achievements collection
            achievement_ref = db_client.collection('achievements').document(achievement_id)
            achievement_doc = await achievement_ref.get()

            if achievement_doc.exists:
                achievement_data = achievement_doc.to_dict()

                # Process condition
                condition = None
                if 'condition' in achievement_data:
                    condition = achievement_data.get('condition')
                elif 'criteria' in achievement_data:
                    criteria = achievement_data.get('criteria')
                    if criteria and isinstance(criteria, dict):
                        condition = {
                            'type': criteria.get('type', 'level_reached'),
                            'target': criteria.get('target', 1)
                        }

                # Process reward - validate and fix malformed data
                reward = []
                if 'reward' in achievement_data:
                    raw_rewards = achievement_data.get('reward')
                    if raw_rewards and isinstance(raw_rewards, list):
                        for raw_reward in raw_rewards:
                            if isinstance(raw_reward, dict):
                                reward_type = raw_reward.get('type')
                                if reward_type == 'emblem':
                                    # Ensure emblem reward has all required fields
                                    emblem_id = raw_reward.get('emblemId')
                                    url = raw_reward.get('url')
                                    
                                    if emblem_id and url:
                                        reward.append({
                                            'type': 'emblem',
                                            'emblemId': emblem_id,
                                            'url': url
                                        })
                                    else:
                                        logger.warning(f"Skipping malformed emblem reward in achievement {achievement_id}: emblemId={emblem_id}, url={url}")
                                elif reward_type == 'point':
                                    # Ensure point reward has all required fields
                                    amount = raw_reward.get('amount')
                                    if amount is not None:
                                        reward.append({
                                            'type': 'point',
                                            'amount': amount
                                        })
                                    else:
                                        logger.warning(f"Skipping malformed point reward in achievement {achievement_id}: amount={amount}")
                                else:
                                    # Keep other reward types as-is
                                    reward.append(raw_reward)

                # Get emblem information from processed rewards
                emblem_id = None
                emblem_url = None
                for r in reward:
                    if isinstance(r, dict) and r.get('type') == 'emblem':
                        emblem_id = r.get('emblemId')
                        emblem_url = r.get('url')
                        break

                # Create the achievement object with only the required fields
                achievement = UserAchievementSimple(
                    id=achievement_id,
                    name=achievement_data.get('name'),
                    description=achievement_data.get('description'),
                    awardedAt=user_achievement_data.get('awardedAt'),
                    emblemId=emblem_id,
                    emblemUrl=emblem_url,
                    condition=condition,
                    reward=reward
                )

                user_achievements.append(achievement)
            else:
                # Achievement was deleted from main collection but user still has it
                logger.warning(f"User {user_id} has orphaned achievement {achievement_id} that no longer exists in main collection")

        # Create pagination info
        pagination_info = PaginationInfo(
            total_items=total_count,
            items_per_page=per_page,
            current_page=page,
            total_pages=total_pages
        )

        return user_achievements, pagination_info
    except Exception as e:
        logger.error(f"Error getting achievements for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get user achievements: {str(e)}")

async def get_all_achievements_grouped(
    db_client: AsyncClient,
    user_id: Optional[str] = None
) -> Dict[str, List[AchievementResponse]]:
    """
    Get all achievements in the system grouped by condition type.
    If user_id is provided, include the user's progress for each achievement.
    
    Uses caching to avoid repeated database queries for the achievement structure.

    Args:
        db_client: Firestore client
        user_id: Optional user ID to get progress for

    Returns:
        A dictionary with condition types as keys and lists of achievements as values

    Raises:
        HTTPException: If there's an error getting the achievements
    """
    try:
        global _grouped_achievements_cache
        
        # Check if we need to refresh the cache
        async with _grouped_achievements_cache['lock']:
            cache_expired = (
                _grouped_achievements_cache['data'] is None or
                _grouped_achievements_cache['timestamp'] is None or
                datetime.now() - _grouped_achievements_cache['timestamp'] > timedelta(seconds=CACHE_TTL_SECONDS)
            )
            
            if cache_expired:
                logger.info("Achievement cache expired or empty, fetching from database")
                
                # Reference to the achievements collection
                achievements_ref = db_client.collection('achievements')
                
                # Get all achievements (no deduplication needed since we don't have duplicates)
                all_docs = await achievements_ref.get()
                
                # Store the raw documents in cache
                _grouped_achievements_cache['data'] = all_docs
                _grouped_achievements_cache['timestamp'] = datetime.now()
            else:
                logger.debug("Using cached achievements data")
                all_docs = _grouped_achievements_cache['data']

        # Get user achievements and user data if user_id is provided
        user_achievements_dict = {}
        user_stats = {}  # Pre-computed user stats for efficiency
        
        if user_id:
            logger.info(f"Getting achievements for user_id: {user_id}")
            
            # Fetch user achievements and user data in parallel for better performance
            user_achievements_ref = db_client.collection(settings.firestore_collection_users).document(user_id).collection('achievements')
            user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
            
            # Parallel fetch
            user_achievements_task = user_achievements_ref.get()
            user_doc_task = user_ref.get()
            
            user_achievements_docs, user_doc = await asyncio.gather(user_achievements_task, user_doc_task)
            
            logger.info(f"Found {len(user_achievements_docs)} achievements for user {user_id}")

            for doc in user_achievements_docs:
                data = doc.to_dict()
                achievement_id = data.get('achievement_id', doc.id)
                user_achievements_dict[achievement_id] = {
                    'acquired': data.get('acquired', False),
                    'progress': data.get('progress'),
                    'acquired_at': data.get('acquired_at')
                }

            # Pre-compute user stats for efficient lookup
            if user_doc.exists:
                user_data = user_doc.to_dict()
                user_stats = {
                    'level': user_data.get('level', 0),
                    'totalFusion': user_data.get('totalFusion', 0),
                    'buy_deal': user_data.get('buy_deal', 0),
                    'sell_deal': user_data.get('sell_deal', 0),
                    'total_withdraw': user_data.get('total_withdraw', 0),
                    # Include all point-based draw fields from user data
                    **{k: v for k, v in user_data.items() if k.startswith('total_drawn_')}
                }
                logger.debug(f"Pre-computed user stats: {user_stats}")
            else:
                logger.warning(f"User not found: {user_id}")
                user_stats = {}

        # Group achievements by condition type
        grouped_achievements = {}
        
        # Define the order of achievement types
        ordered_types = [
            "level_reached",
            "fusion_reached",
            "draw_by_rarity",
            "buy_deal_reached",
            "sell_deal_reached",
            "withdraw_reached",
            "special"
        ]
        
        # Initialize the groups in the desired order
        for achievement_type in ordered_types:
            grouped_achievements[achievement_type] = []

        # Process each achievement
        for doc in all_docs:
            data = doc.to_dict()
            achievement_id = doc.id

            # Process condition
            condition = None
            if 'condition' in data:
                condition = data.get('condition')
            elif 'criteria' in data:
                criteria = data.get('criteria')
                if criteria and isinstance(criteria, dict):
                    condition = {
                        'type': criteria.get('type', 'level_reached'),
                        'target': criteria.get('target', 1)
                    }

            # Skip if no condition or unknown type
            if not condition:
                continue
            
            # Use helper function to get condition type
            condition_type = get_condition_attr(condition, 'type')
            
            if condition_type not in ordered_types:
                continue

            # Process reward - validate and fix malformed data
            reward = []
            if 'reward' in data:
                raw_rewards = data.get('reward')
                if raw_rewards and isinstance(raw_rewards, list):
                    for raw_reward in raw_rewards:
                        if isinstance(raw_reward, dict):
                            reward_type = raw_reward.get('type')
                            if reward_type == 'emblem':
                                # Ensure emblem reward has all required fields
                                emblem_id = raw_reward.get('emblemId')
                                url = raw_reward.get('url')
                                
                                if emblem_id and url:
                                    reward.append({
                                        'type': 'emblem',
                                        'emblemId': emblem_id,
                                        'url': url
                                    })
                                else:
                                    logger.warning(f"Skipping malformed emblem reward in achievement {achievement_id}: emblemId={emblem_id}, url={url}")
                            elif reward_type == 'point':
                                # Ensure point reward has all required fields
                                amount = raw_reward.get('amount')
                                if amount is not None:
                                    reward.append({
                                        'type': 'point',
                                        'amount': amount
                                    })
                                else:
                                    logger.warning(f"Skipping malformed point reward in achievement {achievement_id}: amount={amount}")
                            else:
                                # Keep other reward types as-is
                                reward.append(raw_reward)

            # Get emblem information
            emblem_id = None
            emblem_url = None

            # Check if there's an emblem reward
            if reward and isinstance(reward, list):
                for r in reward:
                    if isinstance(r, dict) and r.get('type') == 'emblem':
                        emblem_id = r.get('emblemId')
                        emblem_url = r.get('url')
                        # Update the reward array with the URL
                        r['url'] = emblem_url
                        break

            # Create base achievement with only the required fields
            achievement = AchievementResponse(
                id=achievement_id,
                name=data.get('name'),
                description=data.get('description'),
                created_at=data.get('created_at', datetime.now()),
                emblemId=emblem_id,
                emblemUrl=emblem_url,
                condition=condition,
                reward=reward,
                progress=None,
                achieved=False
            )

            # Check if the user already has this achievement
            logger.debug(f"Checking achievement {achievement_id} for user {user_id}, user_achievements_dict keys: {list(user_achievements_dict.keys())}")
            if user_id and achievement_id in user_achievements_dict:
                user_achievement = user_achievements_dict[achievement_id]
                logger.info(f"Found user achievement for {achievement_id}: {user_achievement}")

                # If user has the achievement, set achieved to True
                achievement.achieved = True

                # If user has the achievement, set progress to the target value
                target = get_condition_attr(condition, 'target')
                if target:
                    achievement.progress = target
                    logger.info(f"User '{user_id}' already has achievement '{achievement_id}', setting progress to target: {achievement.progress}")
            # If user doesn't have the achievement yet, check the user's field based on the condition type
            elif user_id and condition and user_stats:
                ach_type = get_condition_attr(condition, 'type')
                target = get_condition_attr(condition, 'target', 0)

                # Get user's current value from pre-computed stats
                user_value = 0
                
                # Map achievement types to pre-computed user stats
                if ach_type == "level_reached":
                    user_value = user_stats.get('level', 0)
                elif ach_type == "draw_by_rarity":
                    # Check for point-based field names like total_drawn_10000, total_drawn_2000, etc.
                    point_worth = get_condition_attr(condition, 'point_worth')
                    # Use the point_worth value (e.g., point_worth: 5000 -> total_drawn_5000)
                    field_name = f'total_drawn_{point_worth}'
                    user_value = user_stats.get(field_name, 0)
                elif ach_type == "buy_deal_reached":
                    user_value = user_stats.get('buy_deal', 0)
                elif ach_type == "sell_deal_reached":
                    user_value = user_stats.get('sell_deal', 0)
                elif ach_type == "fusion_reached":
                    user_value = user_stats.get('totalFusion', 0)
                elif ach_type == "withdraw_reached":
                    user_value = user_stats.get('total_withdraw', 0)
                elif ach_type == "special":
                    # Special achievements don't have targets or progress - they are manually awarded
                    # Only mark as achieved if user actually has it (already handled above in user_achievements_dict check)
                    user_value = 0
                
                # Early skip: If user has 0 progress and target is high, skip detailed logging
                # Only log if user has made some progress or is close to achieving
                if user_value > 0 or target <= 5:  # Log for early achievements or when user has progress
                    logger.debug(f"Progress for {ach_type} achievement '{achievement_id}': {user_value}/{target}")
                
                # Set progress
                achievement.progress = user_value
                
                # Check if the condition is met (special achievements don't have targets)
                if ach_type == "special":
                    # Special achievements are only achieved if manually awarded (handled by user_achievements_dict check above)
                    pass
                elif user_value >= target:
                    achievement.achieved = True

            # Add to the appropriate group
            grouped_achievements[condition_type].append(achievement)

        # Sort achievements within each group by rank (assuming rank is stored in condition.target)
        # Special achievements without targets are sorted to the end
        for achievement_type in grouped_achievements:
            def sort_key(x):
                if achievement_type == "special":
                    # For special achievements, sort by name since they don't have targets
                    return x.name or ""
                else:
                    # For other achievements, sort by target
                    return get_condition_attr(x.condition, 'target', 0)
            
            grouped_achievements[achievement_type].sort(key=sort_key)

        return grouped_achievements
    except Exception as e:
        logger.error(f"Error getting grouped achievements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get grouped achievements: {str(e)}")

async def get_all_achievements(
    db_client: AsyncClient, 
    user_id: Optional[str] = None,
    page: int = 1, 
    per_page: int = 10,
    sort_by: str = "created_at",
    sort_order: str = "desc"
) -> Tuple[List[AchievementResponse], PaginationInfo]:
    """
    Get all achievements in the system with pagination and sorting.
    If user_id is provided, include the user's progress for each achievement.

    Args:
        db_client: Firestore client
        user_id: Optional user ID to get progress for
        page: The page number (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "created_at")
        sort_order: The sort order, "asc" or "desc" (default: "desc")

    Returns:
        A tuple containing:
        - A list of AchievementWithProgress objects
        - PaginationInfo object with pagination details

    Raises:
        HTTPException: If there's an error getting the achievements
    """
    try:
        # Reference to the achievements collection
        achievements_ref = db_client.collection('achievements')

        # Get all achievements
        all_docs = await achievements_ref.get()

        # Deduplicate achievements by name, keeping only the most recent one
        name_to_achievement = {}
        for doc in all_docs:
            data = doc.to_dict()
            achievement_id = doc.id
            name = data.get('name')
            created_at = data.get('created_at', datetime.now())

            # If we haven't seen this name before, or this achievement is newer than the one we've seen
            if name not in name_to_achievement or created_at > name_to_achievement[name]['created_at']:
                name_to_achievement[name] = {
                    'id': achievement_id,
                    'data': data,
                    'created_at': created_at,
                    'doc': doc
                }

        # Convert the deduplicated dictionary back to a list
        deduplicated_docs = [item['doc'] for item in name_to_achievement.values()]

        # Sort the deduplicated list
        direction = firestore.Query.DESCENDING if sort_order.lower() == "desc" else firestore.Query.ASCENDING
        if sort_by == "created_at":
            # Sort by created_at
            if direction == firestore.Query.DESCENDING:
                deduplicated_docs.sort(key=lambda doc: doc.to_dict().get('created_at', datetime.now()), reverse=True)
            else:
                deduplicated_docs.sort(key=lambda doc: doc.to_dict().get('created_at', datetime.now()))
        else:
            # Sort by other fields
            if direction == firestore.Query.DESCENDING:
                deduplicated_docs.sort(key=lambda doc: doc.to_dict().get(sort_by, ""), reverse=True)
            else:
                deduplicated_docs.sort(key=lambda doc: doc.to_dict().get(sort_by, ""))

        # Get total count after deduplication
        total_count = len(deduplicated_docs)

        # Calculate total pages
        total_pages = math.ceil(total_count / per_page) if total_count > 0 else 1

        # Calculate offset
        offset = (page - 1) * per_page

        # Apply pagination
        paginated_docs = deduplicated_docs[offset:offset + per_page]

        # Get user achievements and user data if user_id is provided
        user_achievements_dict = {}
        user_data = {}
        logger.info(f"Processing achievements with user_id: {user_id}")
        if user_id:
            logger.info(f"Getting achievements for user_id: {user_id}")
            # Get user achievements from the user's subcollection
            user_achievements_ref = db_client.collection(settings.firestore_collection_users).document(user_id).collection('achievements')
            user_achievements_docs = await user_achievements_ref.get()
            
            logger.info(f"Found {len(user_achievements_docs)} achievements for user {user_id}")

            for doc in user_achievements_docs:
                data = doc.to_dict()
                achievement_id = data.get('achievement_id', doc.id)
                logger.debug(f"User achievement doc.id: {doc.id}, achievement_id: {achievement_id}, data: {data}")
                user_achievements_dict[achievement_id] = {
                    'acquired': data.get('acquired', False),
                    'progress': data.get('progress'),
                    'acquired_at': data.get('acquired_at')
                }

            # Get user data to check achievement progress
            user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
            user_doc = await user_ref.get()
            if user_doc.exists:
                user_data = user_doc.to_dict()
                logger.info(f"Fetched user data for '{user_id}': {user_data}")
            else:
                logger.warning(f"User not found: {user_id}")
                user_data = {}

        # Convert to AchievementWithProgress objects
        achievements_with_progress = []
        for doc in paginated_docs:
            data = doc.to_dict()
            achievement_id = doc.id

            # Process condition
            condition = None
            if 'condition' in data:
                condition = data.get('condition')
            elif 'criteria' in data:
                criteria = data.get('criteria')
                if criteria and isinstance(criteria, dict):
                    condition = {
                        'type': criteria.get('type', 'level_reached'),
                        'target': criteria.get('target', 1)
                    }

            # Process reward - validate and fix malformed data
            reward = []
            if 'reward' in data:
                raw_rewards = data.get('reward')
                if raw_rewards and isinstance(raw_rewards, list):
                    for raw_reward in raw_rewards:
                        if isinstance(raw_reward, dict):
                            reward_type = raw_reward.get('type')
                            if reward_type == 'emblem':
                                # Ensure emblem reward has all required fields
                                emblem_id = raw_reward.get('emblemId')
                                url = raw_reward.get('url')
                                
                                if emblem_id and url:
                                    reward.append({
                                        'type': 'emblem',
                                        'emblemId': emblem_id,
                                        'url': url
                                    })
                                else:
                                    logger.warning(f"Skipping malformed emblem reward in achievement {achievement_id}: emblemId={emblem_id}, url={url}")
                            elif reward_type == 'point':
                                # Ensure point reward has all required fields
                                amount = raw_reward.get('amount')
                                if amount is not None:
                                    reward.append({
                                        'type': 'point',
                                        'amount': amount
                                    })
                                else:
                                    logger.warning(f"Skipping malformed point reward in achievement {achievement_id}: amount={amount}")
                            else:
                                # Keep other reward types as-is
                                reward.append(raw_reward)

            # Get emblem information
            emblem_id = None
            emblem_url = None

            # Check if there's an emblem reward and convert URL to signed URL
            if reward and isinstance(reward, list):
                for r in reward:
                    if isinstance(r, dict) and r.get('type') == 'emblem':
                        emblem_id = r.get('emblemId')
                        emblem_url = r.get('url')
                        # Convert emblem URL to signed URL if it's a GCS URI
                        if emblem_url and emblem_url.startswith('gs://'):
                            try:
                                # R2 URLs are public, no need to sign them

                                # emblem_url is already public
                                # Update the reward array with the signed URL
                                r['url'] = emblem_url
                            except Exception as sign_error:
                                logger.error(f"Failed to generate signed URL for emblem {emblem_url}: {sign_error}")
                                # Keep the original URL if signing fails
                        break

            # Create base achievement with only the required fields
            achievement = AchievementResponse(
                id=achievement_id,
                name=data.get('name'),
                description=data.get('description'),
                created_at=data.get('created_at', datetime.now()),
                emblemId=emblem_id,
                emblemUrl=emblem_url,
                condition=condition,
                reward=reward,
                progress=None,
                achieved=False
            )

            # Check if the user already has this achievement
            logger.debug(f"Checking achievement {achievement_id} for user {user_id}, user_achievements_dict keys: {list(user_achievements_dict.keys())}")
            if user_id and achievement_id in user_achievements_dict:
                user_achievement = user_achievements_dict[achievement_id]
                logger.info(f"Found user achievement for {achievement_id}: {user_achievement}")

                # If user has the achievement, set achieved to True regardless of 'acquired' field
                achievement.achieved = True

                # If user has the achievement, set progress to the target value
                if condition:
                    if isinstance(condition, dict):
                        target = condition.get('target')
                    else:
                        target = condition.target
                    if target:
                        achievement.progress = target
                        logger.info(f"User '{user_id}' already has achievement '{achievement_id}', setting progress to target: {achievement.progress}")
            # If user doesn't have the achievement yet, check the user's field based on the condition type
            elif user_id and condition and user_data:
                if isinstance(condition, dict):
                    ach_type = condition.get('type')
                    target = condition.get('target', 0)
                else:
                    ach_type = condition.type
                    target = condition.target if hasattr(condition, 'target') else 0

                # Initialize progress
                progress = 0

                # Check level_reached type
                if ach_type == "level_reached":
                    user_level = user_data.get('level', 0)
                    progress = user_level
                    logger.info(f"Setting progress for level_reached achievement '{achievement_id}' to user level: {user_level} (target: {target})")

                # Check draw_by_rarity type
                elif ach_type == "draw_by_rarity":
                    if isinstance(condition, dict):
                        point_worth = condition.get('point_worth')
                    else:
                        point_worth = condition.point_worth if hasattr(condition, 'point_worth') else None
                    # Use point-based field names like total_drawn_10000, total_drawn_2000, etc.
                    field_name = f"total_drawn_{point_worth}"
                    user_drawn = user_data.get(field_name, 0)
                    progress = user_drawn
                    logger.info(f"Setting progress for draw_by_rarity achievement '{achievement_id}' to user drawn: {user_drawn} (target: {target})")

                # Check buy_deal_reached type
                elif ach_type == "buy_deal_reached":
                    user_buy_deal = user_data.get('buy_deal', 0)
                    progress = user_buy_deal
                    logger.info(f"Setting progress for buy_deal_reached achievement '{achievement_id}' to user buy_deal: {user_buy_deal} (target: {target})")

                # Check sell_deal_reached type
                elif ach_type == "sell_deal_reached":
                    user_sell_deal = user_data.get('sell_deal', 0)
                    progress = user_sell_deal
                    logger.info(f"Setting progress for sell_deal_reached achievement '{achievement_id}' to user sell_deal: {user_sell_deal} (target: {target})")

                # Check fusion_reached type
                elif ach_type == "fusion_reached":
                    user_total_fusion = user_data.get('totalFusion', 0)
                    progress = user_total_fusion
                    logger.info(f"Setting progress for fusion_reached achievement '{achievement_id}' to user totalFusion: {user_total_fusion} (target: {target})")

                # Check withdraw_reached type
                elif ach_type == "withdraw_reached":
                    user_total_withdraw = user_data.get('total_withdraw', 0)
                    progress = user_total_withdraw
                    logger.info(f"Setting progress for withdraw_reached achievement '{achievement_id}' to user total_withdraw: {user_total_withdraw} (target: {target})")

                # Check special type
                elif ach_type == "special":
                    # Special achievements don't have targets or progress - they are manually awarded
                    progress = 0
                    logger.info(f"Special achievement '{achievement_id}' - no progress calculation needed")

                # Set progress
                achievement.progress = progress

                # Check if the condition is met (special achievements don't have targets)
                if ach_type == "special":
                    # Special achievements are only achieved if manually awarded (handled above)
                    pass
                elif progress >= target:
                    achievement.achieved = True

            achievements_with_progress.append(achievement)

        # Create pagination info
        pagination_info = PaginationInfo(
            total_items=total_count,
            items_per_page=per_page,
            current_page=page,
            total_pages=total_pages
        )

        return achievements_with_progress, pagination_info
    except Exception as e:
        logger.error(f"Error getting all achievements: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get achievements: {str(e)}")

async def get_user_achievement_by_id(
    user_id: str,
    achievement_id: str,
    db_client: AsyncClient
) -> AchievementWithProgress:
    """
    Get a specific achievement for a user by achievement ID.

    Args:
        user_id: The ID of the user
        achievement_id: The ID of the achievement
        db_client: Firestore client

    Returns:
        AchievementWithProgress object containing the achievement details and user progress

    Raises:
        HTTPException: If there's an error getting the achievement or if it doesn't exist
    """
    try:
        # Get the achievement from the achievements collection
        achievement_ref = db_client.collection('achievements').document(achievement_id)
        achievement_doc = await achievement_ref.get()

        if not achievement_doc.exists:
            raise HTTPException(status_code=404, detail=f"Achievement with ID {achievement_id} not found")

        # Get the achievement data
        achievement_data = achievement_doc.to_dict()

        # Process condition
        condition = None
        if 'condition' in achievement_data:
            condition = achievement_data.get('condition')
        elif 'criteria' in achievement_data:
            criteria = achievement_data.get('criteria')
            if criteria and isinstance(criteria, dict):
                condition = {
                    'type': criteria.get('type', 'level_reached'),
                    'target': criteria.get('target', 1)
                }

        # Process reward
        reward = []
        if 'reward' in achievement_data:
            reward = achievement_data.get('reward')

        # Get emblem information
        emblem_id = None
        emblem_url = None

        # Check if there's an emblem reward and convert URL to signed URL
        if reward and isinstance(reward, list):
            for r in reward:
                if isinstance(r, dict) and r.get('type') == 'emblem':
                    emblem_id = r.get('emblemId')
                    emblem_url = r.get('url')
                    # Convert emblem URL to signed URL if it's a GCS URI
                    if emblem_url and emblem_url.startswith('gs://'):
                        try:
                            # R2 URLs are public, no need to sign them

                            # emblem_url is already public
                            # Update the reward array with the signed URL
                            r['url'] = emblem_url
                        except Exception as sign_error:
                            logger.error(f"Failed to generate signed URL for emblem {emblem_url}: {sign_error}")
                            # Keep the original URL if signing fails
                    break

        # Create the base achievement object with only the required fields
        achievement = AchievementWithProgress(
            id=achievement_id,
            name=achievement_data.get('name'),
            description=achievement_data.get('description'),
            image_url=achievement_data.get('image_url'),
            criteria=achievement_data.get('criteria'),
            created_at=achievement_data.get('created_at', datetime.now()),
            updated_at=achievement_data.get('updated_at'),
            emblemId=emblem_id,
            emblemUrl=emblem_url,
            condition=condition,
            reward=reward,
            awardedAt=None
        )

        # Get the user's progress for this achievement from the user's achievements subcollection
        user_achievement_ref = db_client.collection(settings.firestore_collection_users).document(user_id).collection('achievements').document(achievement_id)
        user_achievement_doc = await user_achievement_ref.get()

        # If the user has progress for this achievement, update the awardedAt and progress fields
        if user_achievement_doc.exists:
            user_achievement_data = user_achievement_doc.to_dict()
            achievement.awardedAt = user_achievement_data.get('awardedAt')  # Set awardedAt field

            # If user has the achievement, set achieved to True regardless of 'acquired' field
            achievement.achieved = True

            # If user has the achievement, set progress to the target value
            if condition and condition.get('target'):
                achievement.progress = condition.get('target')
                logger.info(f"User '{user_id}' already has achievement '{achievement_id}', setting progress to target: {achievement.progress}")
        # If user doesn't have the achievement yet, check the user's field based on the condition type
        elif condition:
            # Get user data to check achievement progress
            user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
            user_doc = await user_ref.get()

            if user_doc.exists:
                user_data = user_doc.to_dict()
                logger.info(f"Fetched user data for '{user_id}': {user_data}")

                ach_type = condition.get('type')
                target = condition.get('target', 0)

                # Check level_reached type
                if ach_type == "level_reached":
                    user_level = user_data.get('level', 0)
                    achievement.progress = user_level
                    logger.info(f"Setting progress for level_reached achievement '{achievement_id}' to user level: {user_level} (target: {target})")

                # Check draw_by_rarity type
                elif ach_type == "draw_by_rarity":
                    point_worth = condition.get('point_worth')
                    # Use point-based field names like total_drawn_10000, total_drawn_2000, etc.
                    field_name = f"total_drawn_{point_worth}"
                    user_drawn = user_data.get(field_name, 0)
                    achievement.progress = user_drawn
                    logger.info(f"Setting progress for draw_by_rarity achievement '{achievement_id}' to user drawn: {user_drawn} (target: {target})")

                # Check buy_deal_reached type
                elif ach_type == "buy_deal_reached":
                    user_buy_deal = user_data.get('buy_deal', 0)
                    achievement.progress = user_buy_deal
                    logger.info(f"Setting progress for buy_deal_reached achievement '{achievement_id}' to user buy_deal: {user_buy_deal} (target: {target})")

                # Check sell_deal_reached type
                elif ach_type == "sell_deal_reached":
                    user_sell_deal = user_data.get('sell_deal', 0)
                    achievement.progress = user_sell_deal
                    logger.info(f"Setting progress for sell_deal_reached achievement '{achievement_id}' to user sell_deal: {user_sell_deal} (target: {target})")

                # Check fusion_reached type
                elif ach_type == "fusion_reached":
                    user_total_fusion = user_data.get('totalFusion', 0)
                    achievement.progress = user_total_fusion
                    logger.info(f"Setting progress for fusion_reached achievement '{achievement_id}' to user totalFusion: {user_total_fusion} (target: {target})")

                # Check withdraw_reached type
                elif ach_type == "withdraw_reached":
                    user_total_withdraw = user_data.get('total_withdraw', 0)
                    achievement.progress = user_total_withdraw
                    logger.info(f"Setting progress for withdraw_reached achievement '{achievement_id}' to user total_withdraw: {user_total_withdraw} (target: {target})")

                # Check special type  
                elif ach_type == "special":
                    # Special achievements don't have targets or progress - they are manually awarded
                    achievement.progress = 0
                    logger.info(f"Special achievement '{achievement_id}' - no progress calculation needed")
            else:
                logger.warning(f"User not found: {user_id}")

        return achievement
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting achievement {achievement_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get achievement: {str(e)}")

async def get_user_achievement_highlights(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    search_query: str | None = None
) -> Tuple[List[UserAchievementSimple], PaginationInfo]:
    """
    Get all achievements in the user's achievement highlights subcollection with pagination.

    Args:
        user_id: The ID of the user to get achievement highlights for
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "created_at")
        sort_order: The sort order ("asc" or "desc", default: "desc")
        search_query: Optional search query to filter achievements by name

    Returns:
        A tuple containing:
        - List of AchievementWithProgress objects
        - PaginationInfo object

    Raises:
        HTTPException: If there's an error getting the achievement highlights
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the achievement highlights collection reference
        highlights_ref = user_ref.collection('achievement_highlights')

        # Create the base query
        query = highlights_ref

        # Apply search query if provided
        if search_query and search_query.strip():
            stripped_search_query = search_query.strip()
            logger.info(f"Applying search filter for name: >='{stripped_search_query}' and <='{stripped_search_query}\uf8ff'")
            query = query.where("name", ">=", stripped_search_query)
            query = query.where("name", "<=", stripped_search_query + "\uf8ff")

        # Count total items matching the query
        count_agg_query = query.count()
        count_snapshot = await count_agg_query.get()
        total_items = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0

        if total_items == 0:
            logger.info(f"No achievement highlights found for user {user_id}")
            return [], PaginationInfo(
                total_items=0,
                items_per_page=per_page,
                current_page=page,
                total_pages=0
            )

        # Determine sort direction
        if sort_order.lower() == "desc":
            direction = firestore.Query.DESCENDING
        elif sort_order.lower() == "asc":
            direction = firestore.Query.ASCENDING
        else:
            logger.warning(f"Invalid sort_order '{sort_order}'. Defaulting to DESCENDING.")
            direction = firestore.Query.DESCENDING
            sort_order = "desc"  # Ensure applied filter reflects actual sort

        # Apply sorting
        query_with_filters = query  # query already has search filters if any

        if search_query and search_query.strip() and sort_by != "name":
            # If searching and sorting by a different field, ensure name is the first sort key
            logger.warning(f"Search query on 'name' is active while sorting by '{sort_by}'. Firestore requires ordering by 'name' first.")
            query_with_sort = query_with_filters.order_by("name").order_by(sort_by, direction=direction)
        else:
            query_with_sort = query_with_filters.order_by(sort_by, direction=direction)

        # Apply pagination
        current_page_query = max(1, page)
        per_page_query = max(1, per_page)
        offset = (current_page_query - 1) * per_page_query

        paginated_query = query_with_sort.limit(per_page_query).offset(offset)

        # Execute the query
        logger.info(f"Executing Firestore query for user {user_id} achievement highlights with pagination and sorting")
        stream = paginated_query.stream()

        # Process the results
        achievements_list = []
        async for doc in stream:
            try:
                achievement_data = doc.to_dict()
                if not achievement_data:  # Skip empty documents
                    logger.warning(f"Skipping empty document with ID: {doc.id} in achievement highlights")
                    continue

                # Ensure ID is part of the data
                if 'id' not in achievement_data:
                    achievement_data['id'] = doc.id

                # Generate signed URL for the achievement image if it exists
                if 'image_url' in achievement_data and achievement_data['image_url']:
                    try:
                        # R2 URLs are public, no need to sign them
                        pass  # achievement_data['image_url'] is already public
                    except Exception as sign_error:
                        logger.error(f"Failed to generate signed URL for {achievement_data['image_url']}: {sign_error}")
                        # Keep the original URL if signing fails

                # Generate signed URL for emblem if it exists
                emblem_url = achievement_data.get('emblemUrl')
                if emblem_url and emblem_url.startswith('gs://'):
                    try:
                        # R2 URLs are public, no need to sign them
                        pass  # emblem_url is already public
                    except Exception as sign_error:
                        logger.error(f"Failed to generate signed URL for emblem {emblem_url}: {sign_error}")
                        # Keep the original URL if signing fails

                # Create a UserAchievementSimple object
                achievement = UserAchievementSimple(
                    id=achievement_data.get('id'),
                    name=achievement_data.get('name'),
                    description=achievement_data.get('description'),
                    emblemId=achievement_data.get('emblemId'),
                    emblemUrl=emblem_url,
                    condition=achievement_data.get('condition'),
                    reward=achievement_data.get('reward'),
                    awardedAt=achievement_data.get('awardedAt')
                )

                achievements_list.append(achievement)
            except Exception as e:
                logger.error(f"Error processing achievement highlight document {doc.id}: {e}", exc_info=True)
                # Continue processing other documents

        # Calculate total pages
        total_pages = math.ceil(total_items / per_page_query) if total_items > 0 else 0

        # Create pagination info
        pagination = PaginationInfo(
            total_items=total_items,
            items_per_page=per_page_query,
            current_page=current_page_query,
            total_pages=total_pages
        )

        logger.info(f"Retrieved {len(achievements_list)} achievement highlights for user {user_id} (page {current_page_query} of {total_pages})")

        return achievements_list, pagination

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting achievement highlights for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get achievement highlights: {str(e)}")


async def delete_achievement_from_highlights(
    user_id: str,
    achievement_id: str,
    db_client: AsyncClient
) -> dict:
    """
    Delete an achievement from the user's achievement highlights subcollection.

    Args:
        user_id: The ID of the user who owns the achievement
        achievement_id: The ID of the achievement to delete from highlights
        db_client: Firestore client

    Returns:
        A dictionary with a success message

    Raises:
        HTTPException: If there's an error deleting the achievement from highlights
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Set up the achievement highlights reference
        highlights_ref = user_ref.collection('achievement_highlights').document(achievement_id)

        # Check if the achievement exists in highlights
        highlights_doc = await highlights_ref.get()

        if not highlights_doc.exists:
            raise HTTPException(status_code=404, detail=f"Achievement with ID {achievement_id} not found in highlights")

        # Get the achievement data before deleting it (for logging or returning)
        highlights_data = highlights_doc.to_dict()

        # Delete the achievement from highlights
        await highlights_ref.delete()

        logger.info(f"Deleted achievement {achievement_id} from highlights for user {user_id}")

        # Return a success message
        return {"message": f"Achievement {achievement_id} successfully deleted from highlights for user {user_id}"}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting achievement {achievement_id} from highlights for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete achievement from highlights: {str(e)}")


async def add_achievement_to_highlights(
    user_id: str,
    achievement_id: str,
    db_client: AsyncClient
) -> AchievementWithProgress:
    """
    Add an achievement to the user's achievement highlights subcollection.
    This function finds the achievement in the user's achievements and adds it to the achievement highlights subcollection.

    Args:
        user_id: The ID of the user who owns the achievement
        achievement_id: The ID of the achievement to add to highlights
        db_client: Firestore client

    Returns:
        The achievement that was added to highlights as an AchievementWithProgress object

    Raises:
        HTTPException: If there's an error adding the achievement to highlights
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the achievement details from the achievements collection
        achievement_ref = db_client.collection('achievements').document(achievement_id)
        achievement_doc = await achievement_ref.get()

        if not achievement_doc.exists:
            raise HTTPException(status_code=404, detail=f"Achievement with ID {achievement_id} not found")

        # Get the achievement data
        achievement_data = achievement_doc.to_dict()

        # Check if the user has this achievement
        user_achievement_ref = user_ref.collection('achievements').document(achievement_id)
        user_achievement_doc = await user_achievement_ref.get()

        if not user_achievement_doc.exists:
            raise HTTPException(status_code=404, detail=f"User {user_id} has not acquired achievement {achievement_id}")

        # Get the user achievement data
        user_achievement_data = user_achievement_doc.to_dict()

        # Set up the achievement highlights subcollection reference
        highlights_ref = user_ref.collection('achievement_highlights').document(achievement_id)

        # Check if the achievement already exists in highlights
        highlights_doc = await highlights_ref.get()

        if highlights_doc.exists:
            # Achievement already exists in highlights, just return it
            highlights_data = highlights_doc.to_dict()

            # Generate signed URL for the achievement image if it exists
            if 'image_url' in highlights_data and highlights_data['image_url']:
                try:
                    # R2 URLs are public, no need to sign them
                    pass  # highlights_data['image_url'] is already public
                except Exception as sign_error:
                    logger.error(f"Failed to generate signed URL for {highlights_data['image_url']}: {sign_error}")
                    # Keep the original URL if signing fails

            # Create an AchievementWithProgress object
            achievement_with_progress = AchievementWithProgress(
                id=highlights_data.get('id'),
                name=highlights_data.get('name'),
                description=highlights_data.get('description'),
                image_url=highlights_data.get('image_url'),
                criteria=highlights_data.get('criteria'),
                created_at=highlights_data.get('created_at'),
                updated_at=highlights_data.get('updated_at'),
                emblemId=highlights_data.get('emblemId'),
                emblemUrl=highlights_data.get('emblemUrl'),
                condition=highlights_data.get('condition'),
                reward=highlights_data.get('reward'),
                awardedAt=user_achievement_data.get('awardedAt'),
                progress=user_achievement_data.get('progress'),
                achieved=user_achievement_data.get('acquired', False)
            )

            return achievement_with_progress

        # Combine achievement data with user achievement data
        # Only include the fields we want in highlights
        combined_data = {
            'id': achievement_id,
            'name': achievement_data.get('name'),
            'description': achievement_data.get('description'),
            'emblemId': achievement_data.get('emblemId'),
            'emblemUrl': achievement_data.get('emblemUrl'),
            'condition': achievement_data.get('condition'),
            'reward': achievement_data.get('reward'),
            'awardedAt': user_achievement_data.get('awardedAt')
        }

        # Add the achievement to the highlights subcollection
        await highlights_ref.set(combined_data)

        logger.info(f"Added achievement {achievement_id} to highlights for user {user_id}")

        # Generate signed URL for the achievement image if it exists
        if 'image_url' in achievement_data and achievement_data['image_url']:
            try:
                # R2 URLs are public, no need to sign them
                pass  # achievement_data['image_url'] is already public
            except Exception as sign_error:
                logger.error(f"Failed to generate signed URL for {achievement_data['image_url']}: {sign_error}")
                # Keep the original URL if signing fails

        # Create an AchievementWithProgress object
        achievement_with_progress = AchievementWithProgress(
            id=achievement_data.get('id'),
            name=achievement_data.get('name'),
            description=achievement_data.get('description'),
            image_url=achievement_data.get('image_url'),
            criteria=achievement_data.get('criteria'),
            created_at=achievement_data.get('created_at'),
            updated_at=achievement_data.get('updated_at'),
            emblemId=achievement_data.get('emblemId'),
            emblemUrl=achievement_data.get('emblemUrl'),
            condition=achievement_data.get('condition'),
            reward=achievement_data.get('reward'),
            awardedAt=user_achievement_data.get('awardedAt'),
            progress=user_achievement_data.get('progress'),
            achieved=user_achievement_data.get('acquired', False)
        )

        return achievement_with_progress

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding achievement {achievement_id} to highlights for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add achievement to highlights: {str(e)}")


async def calculate_and_update_level(user_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Calculate and update a user's level based on their total_drawn value.
    The level is calculated as floor(total_drawn/10000) + 1.
    
    Level progression:
    - 0-9,999 points = Level 1
    - 10,000-19,999 points = Level 2
    - 20,000-29,999 points = Level 3
    - etc.

    Args:
        user_id: The ID of the user to update
        db_client: Firestore client

    Returns:
        A dictionary containing the user's current level, previous level, and total_drawn value

    Raises:
        HTTPException: If there's an error calculating or updating the level
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the user data
        user_data = user_doc.to_dict()

        # Get the total_drawn value (default to 0 if not present)
        total_drawn = user_data.get('total_drawn', 0)

        # Calculate the new level based on total_drawn/10000
        # Level starts at 1, so we add 1 to the floor division result
        new_level = math.floor(total_drawn / 10000) + 1

        # Get the current level
        current_level = user_data.get('level', 1)

        # Only update if the level has changed
        if new_level != current_level:
            # Update the user's level
            await user_ref.update({"level": new_level})
            logger.info(f"Updated level for user {user_id} from {current_level} to {new_level} (total_drawn: {total_drawn})")
        else:
            logger.info(f"Level for user {user_id} remains at {current_level} (total_drawn: {total_drawn})")

        # Return the result
        return {
            "user_id": user_id,
            "previous_level": current_level,
            "current_level": new_level,
            "total_drawn": total_drawn
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error calculating and updating level for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to calculate and update level: {str(e)}")
