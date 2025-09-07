from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, Query
from fastapi import HTTPException
from typing import Dict, Any, List, Optional
import math
from datetime import datetime

from config import get_logger, get_typesense_client, get_typesense_collection_name
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
    Retrieves all users with pagination, search, and sorting capabilities using Typesense.

    Args:
        db: Firestore async client instance (kept for compatibility, but Typesense is used for search)
        page: The page number to retrieve (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "pointsBalance")
                Options: "pointsBalance", "totalCashRecharged", "totalPointsSpent", "createdAt", "displayName", "level", "total_point_refered"
        sort_order: The sort order, either "asc" or "desc" (default: "desc")
        search_query: Optional search query to filter users by displayName and email

    Returns:
        UserListResponse: A structured response containing the users, pagination info, and applied filters

    Raises:
        HTTPException: 500 for server errors
    """
    
    log_params = {
        "page": page, "per_page": per_page, "sort_by": sort_by, 
        "sort_order": sort_order, "search_query": search_query
    }
    logger.info(f"Fetching users with parameters: {log_params}")
    
    try:
        # Get Typesense client and collection name
        client = get_typesense_client()
        typesense_collection = get_typesense_collection_name("users")
        
        # Validate sort_by field - map to Typesense field names
        # Only include fields that exist in the Typesense schema and have sort=true
        typesense_field_mapping = {
            "pointsBalance": "totalPointsSpent",  # Using totalPointsSpent as default based on schema
            "totalCashRecharged": "totalCashRecharged",
            "totalPointsSpent": "totalPointsSpent",
            "total_point_refered": "total_point_refered"
        }
        
        # Map sort field to Typesense field name, default to totalPointsSpent for unsupported fields
        typesense_sort_field = typesense_field_mapping.get(sort_by, "totalPointsSpent")
        
        # Log if an unsupported sort field was requested
        if sort_by not in typesense_field_mapping:
            logger.warning(f"Unsupported sort field '{sort_by}' requested. Falling back to 'totalPointsSpent'.")
        
        # Validate sort order
        if sort_order.lower() not in ["asc", "desc"]:
            logger.warning(f"Invalid sort_order '{sort_order}'. Defaulting to 'desc'.")
            sort_order = "desc"
        
        # Build search parameters for Typesense
        search_params = {
            'q': search_query or '*',  # Use '*' for empty search
            'query_by': 'displayName,email',  # Search by displayName and email
            'page': page,
            'per_page': per_page,
            'num_typos': 2,  # Allow up to 2 typos for better user experience
            'infix': 'always',  # Enable infix (substring) search
            'prefix': 'true',  # Enable prefix matching
            'highlight_full_fields': 'displayName,email',  # Highlight matching parts
        }
        
        # Handle sorting
        # If there's a search query, prioritize relevance sorting
        if search_query and search_query.strip():
            # First sort by relevance, then by the requested field
            sort_direction = 'desc' if sort_order.lower() == 'desc' else 'asc'
            # Combine relevance sorting with requested sorting
            search_params['sort_by'] = f'_text_match:desc,{typesense_sort_field}:{sort_direction}'
        else:
            # No search query, just use the requested sorting
            sort_direction = 'desc' if sort_order.lower() == 'desc' else 'asc'
            search_params['sort_by'] = f'{typesense_sort_field}:{sort_direction}'
        
        # Log the search params for debugging
        logger.info(f"Typesense search params for users: {search_params}")
        logger.info(f"Searching in Typesense collection: {typesense_collection}")
        
        # Execute search
        try:
            res = client.collections[typesense_collection].documents.search(search_params)
        except Exception as e:
            logger.error(f"Typesense search error: {e}")
            raise HTTPException(status_code=500, detail="Failed to get users from search service")
        
        logger.info(f"Typesense search returned {res['found']} results, showing {len(res['hits'])} hits")
        
        # Process results
        users = []
        for hit in res['hits']:
            try:
                hit_data = hit['document']
                
                # Typesense documents should have 'id' field
                if 'id' not in hit_data:
                    logger.warning(f"Skipping hit without id: {hit_data}")
                    continue
                
                # Convert Unix timestamp to datetime if needed
                created_at = hit_data.get('createdAt')
                if isinstance(created_at, (int, float)):
                    created_at = datetime.fromtimestamp(created_at)
                elif isinstance(created_at, str):
                    try:
                        created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
                    except:
                        created_at = datetime.now()
                else:
                    created_at = datetime.now()
                
                # Convert addresses if they exist
                addresses = []
                if 'addresses' in hit_data and isinstance(hit_data['addresses'], list):
                    for addr in hit_data['addresses']:
                        if isinstance(addr, dict):
                            try:
                                addresses.append(Address(**addr))
                            except Exception as e:
                                logger.warning(f"Error parsing address: {e}")
                                continue
                
                # Check for required fields
                required_fields = ["displayName", "email"]
                missing_fields = [f for f in required_fields if f not in hit_data or not hit_data[f]]
                if missing_fields:
                    logger.warning(f"Skipping due to missing fields {missing_fields}: {hit_data.get('id', 'unknown')}")
                    continue
                
                # Create User object
                user = User(
                    id=hit_data['id'],
                    createdAt=created_at,
                    displayName=hit_data.get('displayName', ''),
                    email=hit_data.get('email', ''),
                    addresses=addresses,
                    avatar=hit_data.get('avatar'),
                    level=hit_data.get('level', 1),
                    pointsBalance=hit_data.get('pointsBalance', 0),
                    totalCashRecharged=hit_data.get('totalCashRecharged', 0),
                    totalPointsSpent=hit_data.get('totalPointsSpent', 0),
                    totalFusion=hit_data.get('totalFusion', 0),
                    clientSeed=hit_data.get('clientSeed'),
                    referred_by=hit_data.get('referred_by'),
                    total_point_refered=hit_data.get('total_point_refered', 0),
                    stripe_account_id=hit_data.get('stripe_account_id'),
                    totalAchievements=hit_data.get('totalAchievements', 0)
                )
                users.append(user)
                
            except Exception as e:
                logger.warning(f"Failed to parse user from Typesense: {e}")
                continue
        
        # Create pagination info
        total_items = res['found']
        total_pages = math.ceil(total_items / per_page) if per_page > 0 else 1
        
        pagination_info = PaginationInfo(
            total_items=total_items,
            total_pages=total_pages,
            current_page=page,
            per_page=per_page
        )
        
        # Create filters info
        filters = UserFilters(
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )
        
        logger.info(f"Successfully fetched {len(users)} users using Typesense. Total items: {total_items}.")
        return UserListResponse(
            users=users,
            pagination=pagination_info,
            filters=filters
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error retrieving users using Typesense: {str(e)}", exc_info=True)
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