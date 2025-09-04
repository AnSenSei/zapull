from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, Query
from fastapi import HTTPException
from typing import Dict, Any, List, Optional
import math
from datetime import datetime

from config import get_logger
from models.schemas import User, UserListResponse, PaginationInfo, UserFilters, Address

logger = get_logger(__name__)

async def get_all_users(
    db: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "pointsBalance",
    sort_order: str = "desc",
    search_query: Optional[str] = None
) -> UserListResponse:
    """
    Retrieves all users with pagination, search, and sorting capabilities using Firestore native queries.

    Args:
        db: Firestore async client instance
        page: The page number to retrieve (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "pointsBalance")
                Options: "pointsBalance", "totalCashRecharged", "totalPointsSpent"
        sort_order: The sort order, either "asc" or "desc" (default: "desc")
        search_query: Optional search query to filter users by displayName

    Returns:
        UserListResponse: A structured response containing the users, pagination info, and applied filters

    Raises:
        HTTPException: 500 for server errors
    """
    try:
        # Get reference to users collection
        users_ref = db.collection("users")
        
        # Validate sort_by field
        valid_sort_fields = ["pointsBalance", "totalCashRecharged", "totalPointsSpent", "createdAt", "displayName", "level"]
        if sort_by not in valid_sort_fields:
            logger.warning(f"Invalid sort_by field '{sort_by}'. Defaulting to 'pointsBalance'.")
            sort_by = "pointsBalance"
        
        # Validate sort order
        if sort_order.lower() not in ["asc", "desc"]:
            logger.warning(f"Invalid sort_order '{sort_order}'. Defaulting to 'desc'.")
            sort_order = "desc"
        
        # Build the query
        query = users_ref
        
        # Note: Firestore doesn't support text search natively
        # For search functionality, we need to either:
        # 1. Use a search service like Algolia or Elasticsearch
        # 2. Create a searchable field (e.g., displayName_lowercase) and use range queries
        # 3. Fetch all and filter in memory (not recommended for large datasets)
        
        # For now, if search is provided, we'll need to fetch all and filter
        # This is a limitation of Firestore
        if search_query and search_query.strip():
            logger.info("Search query provided. Firestore doesn't support text search natively.")
            # For production, consider using Algolia or creating searchable fields
        
        # Apply ordering
        direction = Query.ASCENDING if sort_order.lower() == "asc" else Query.DESCENDING
        query = query.order_by(sort_by, direction=direction)
        
        # Calculate offset for pagination
        offset = (page - 1) * per_page
        
        # Apply offset and limit for pagination
        query = query.offset(offset).limit(per_page)
        
        # Execute the query to get paginated results
        paginated_docs = []
        async for doc in query.stream():
            paginated_docs.append(doc)
        
        # For total count, we need a separate query without limit/offset
        # Note: This is expensive for large collections. Consider:
        # 1. Maintaining a counter document
        # 2. Using Firestore's count() aggregation (if available in your SDK version)
        # 3. Implementing cursor-based pagination instead
        
        # Get total count
        if search_query and search_query.strip():
            # If search is provided, we need to count filtered results
            # This requires fetching all documents (expensive)
            # Firestore doesn't support text search with aggregations
            search_term = search_query.strip().lower()
            total_items = 0
            filtered_docs = []
            
            # Remove limit and offset for counting
            count_query = users_ref.order_by(sort_by, direction=direction)
            async for doc in count_query.stream():
                user_data = doc.to_dict()
                display_name = user_data.get('displayName', '')
                if search_term in display_name.lower():
                    total_items += 1
                    # Only keep docs that are in the current page
                    if total_items > offset and len(filtered_docs) < per_page:
                        filtered_docs.append(doc)
            
            paginated_docs = filtered_docs
        else:
            # Without search, use aggregation for efficient counting
            count_query = users_ref.count()
            count_result = await count_query.get()
            total_items = count_result[0][0].value
        
        # Calculate total pages
        total_pages = math.ceil(total_items / per_page) if total_items > 0 else 0
        
        # Ensure page is within valid range
        current_page = page if page <= total_pages else total_pages if total_pages > 0 else 1
        
        # Convert to User objects
        users = []
        for doc in paginated_docs:
            user_data = doc.to_dict()
            user_data['id'] = doc.id
            
            try:
                # Convert addresses if they exist
                addresses = []
                if 'addresses' in user_data and isinstance(user_data['addresses'], list):
                    for addr in user_data['addresses']:
                        if isinstance(addr, dict):
                            addresses.append(Address(**addr))
                
                # Create User object
                user = User(
                    id=user_data['id'],
                    createdAt=user_data.get('createdAt', datetime.now()),
                    displayName=user_data.get('displayName', ''),
                    email=user_data.get('email', ''),
                    addresses=addresses,
                    avatar=user_data.get('avatar'),
                    level=user_data.get('level', 1),
                    pointsBalance=user_data.get('pointsBalance', 0),
                    totalCashRecharged=user_data.get('totalCashRecharged', 0),
                    totalPointsSpent=user_data.get('totalPointsSpent', 0),
                    totalFusion=user_data.get('totalFusion', 0),
                    clientSeed=user_data.get('clientSeed'),
                    referred_by=user_data.get('referred_by'),
                    total_point_refered=user_data.get('total_point_refered', 0),
                    stripe_account_id=user_data.get('stripe_account_id')
                )
                users.append(user)
            except Exception as e:
                logger.error(f"Error parsing user {user_data.get('id', 'unknown')}: {str(e)}")
                continue
        
        # Create response
        pagination_info = PaginationInfo(
            total_items=total_items,
            total_pages=total_pages,
            current_page=current_page,
            per_page=per_page
        )
        
        filters = UserFilters(
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        
        return UserListResponse(
            users=users,
            pagination=pagination_info,
            filters=filters
        )
        
    except Exception as e:
        logger.error(f"Error retrieving users: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to retrieve users: {str(e)}"
        )

async def get_user_by_id(user_id: str, db: AsyncClient) -> Optional[User]:
    """
    Get a user by ID from Firestore.

    Args:
        user_id: The ID of the user to get
        db: Firestore async client instance

    Returns:
        The user if found, None otherwise

    Raises:
        HTTPException: If there's an error getting the user
    """
    try:
        user_ref = db.collection("users").document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            return None

        user_data = user_doc.to_dict()
        user_data['id'] = user_doc.id

        # Convert addresses if they exist
        addresses = []
        if 'addresses' in user_data and isinstance(user_data['addresses'], list):
            for addr in user_data['addresses']:
                if isinstance(addr, dict):
                    addresses.append(Address(**addr))

        # Create User object
        user = User(
            id=user_data['id'],
            createdAt=user_data.get('createdAt', datetime.now()),
            displayName=user_data.get('displayName', ''),
            email=user_data.get('email', ''),
            addresses=addresses,
            avatar=user_data.get('avatar'),
            level=user_data.get('level', 1),
            pointsBalance=user_data.get('pointsBalance', 0),
            totalCashRecharged=user_data.get('totalCashRecharged', 0),
            totalPointsSpent=user_data.get('totalPointsSpent', 0),
            totalFusion=user_data.get('totalFusion', 0),
            clientSeed=user_data.get('clientSeed'),
            referred_by=user_data.get('referred_by'),
            total_point_refered=user_data.get('total_point_refered', 0),
            stripe_account_id=user_data.get('stripe_account_id'),
            totalAchievements=user_data.get('totalAchievements', 0)
        )

        return user

    except Exception as e:
        logger.error(f"Error getting user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get user: {str(e)}"
        )

async def check_user_admin(user_id: str, db: AsyncClient) -> bool:
    """
    Check if a user has admin privileges.

    Args:
        user_id: The ID of the user to check
        db: Firestore async client instance

    Returns:
        True if the user is an admin, False otherwise

    Raises:
        HTTPException: If there's an error checking the user
    """
    try:
        user_ref = db.collection("users").document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            return False

        user_data = user_doc.to_dict()
        return user_data.get('admin', False)

    except Exception as e:
        logger.error(f"Error checking admin status for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to check admin status: {str(e)}"
        )