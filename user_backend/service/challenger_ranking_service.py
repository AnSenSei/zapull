from typing import Optional, Dict, List, Any
from datetime import datetime

from fastapi import HTTPException
from google.cloud.firestore_v1 import AsyncClient
from google.cloud import firestore

from config import get_logger, settings
from models.schemas import RankEntry

logger = get_logger(__name__)

class ChallengerRankEntry:
    """Data class for challenger ranking entries"""
    def __init__(self, user_id: str, display_name: str, avatar: str, rank: int, 
                 total_value: int, card_count: int, top_cards: List[Dict], updated_at: Any = None):
        self.user_id = user_id
        self.display_name = display_name
        self.avatar = avatar
        self.rank = rank
        self.total_value = total_value
        self.card_count = card_count
        self.top_cards = top_cards
        self.updated_at = updated_at

async def get_challenger_rankings(
    db_client: AsyncClient, 
    page: int = 1, 
    per_page: int = 10, 
    user_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get challenger rankings based on the three most expensive cards.
    
    Args:
        db_client: Firestore async client
        page: The page number (default: 1)
        per_page: The number of items per page (default: 10)
        user_id: Optional user ID to get their specific rank
        
    Returns:
        Dict[str, Any]: A dictionary containing:
            - 'rankings': List[ChallengerRankEntry] of challengers (paginated)
            - 'pagination': Dict with 'page', 'per_page', 'total_items', 'total_pages'
            - 'user_rank': Optional dict with 'rank' and 'total_value' if user_id is provided
            - 'metadata': Information about when rankings were last generated
            
    Raises:
        HTTPException: If there's an error getting the challenger rankings
    """
    try:
        logger.info(f"Getting challenger rankings - page: {page}, per_page: {per_page}")
        
        challenger_ranking_ref = db_client.collection('challenger_ranking')
        
        # Get metadata first
        metadata_doc = await challenger_ranking_ref.document('metadata').get()
        metadata = {}
        if metadata_doc.exists:
            metadata = metadata_doc.to_dict()
            if not metadata.get('generation_successful', False):
                raise HTTPException(
                    status_code=503, 
                    detail=f"Challenger rankings not available: {metadata.get('error', 'Unknown error')}"
                )
        else:
            raise HTTPException(
                status_code=404, 
                detail="Challenger rankings not found. Please generate rankings first."
            )
        
        # Get all challenger ranking documents
        challenger_docs = []
        challenger_query = challenger_ranking_ref.stream()
        async for doc in challenger_query:
            if doc.id != 'metadata':  # Skip metadata document
                doc_data = doc.to_dict()
                if doc_data:
                    challenger_docs.append(doc_data)
        
        # Sort by rank (should already be sorted, but ensure it)
        challenger_docs.sort(key=lambda x: x.get('rank', float('inf')))
        
        total_items = len(challenger_docs)
        total_pages = (total_items + per_page - 1) // per_page if per_page > 0 else 0
        
        # Calculate pagination
        offset = (page - 1) * per_page
        start_idx = offset
        end_idx = min(offset + per_page, total_items)
        paginated_docs = challenger_docs[start_idx:end_idx] if start_idx < total_items else []
        
        # Convert to ChallengerRankEntry objects
        rankings = []
        user_rank_info = None
        processed_urls = {}  # Cache for avatar URLs
        
        for doc_data in paginated_docs:
            # Process avatar URL if it exists
            avatar = doc_data.get('avatar', '')
            if avatar and avatar not in processed_urls:
                try:
                    # R2 URLs are public; no signing required
                    processed_urls[avatar] = avatar
                except Exception as e:
                    logger.error(f"Failed to process avatar URL for user {doc_data.get('user_id')}: {e}")
                    processed_urls[avatar] = avatar
            
            processed_avatar = processed_urls.get(avatar, avatar)
            
            entry = ChallengerRankEntry(
                user_id=doc_data.get('user_id', ''),
                display_name=doc_data.get('display_name', ''),
                avatar=processed_avatar,
                rank=doc_data.get('rank', 0),
                total_value=doc_data.get('total_value', 0),
                card_count=doc_data.get('card_count', 0),
                top_cards=doc_data.get('top_cards', []),
                updated_at=doc_data.get('updated_at')
            )
            rankings.append(entry)
            
            # Check if this is the requested user
            if user_id and doc_data.get('user_id') == user_id:
                user_rank_info = {
                    'rank': doc_data.get('rank', 0),
                    'total_value': doc_data.get('total_value', 0)
                }
        
        # If user_id is provided but not found in paginated results, search all docs
        if user_id and not user_rank_info:
            for doc_data in challenger_docs:
                if doc_data.get('user_id') == user_id:
                    user_rank_info = {
                        'rank': doc_data.get('rank', 0),
                        'total_value': doc_data.get('total_value', 0)
                    }
                    break
        
        result = {
            'rankings': rankings,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total_items': total_items,
                'total_pages': total_pages
            },
            'metadata': {
                'last_generated': metadata.get('generated_at'),
                'total_challengers': metadata.get('total_users', 0)
            }
        }
        
        if user_rank_info:
            result['user_rank'] = user_rank_info
            
        logger.info(f"Retrieved {len(rankings)} challenger rankings")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challenger rankings: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get challenger rankings: {str(e)}")

async def get_challenger_user_details(db_client: AsyncClient, user_id: str) -> Dict[str, Any]:
    """
    Get detailed information about a specific challenger user including their top cards.
    
    Args:
        db_client: Firestore async client
        user_id: The challenger user ID to get details for
        
    Returns:
        Dict containing the challenger's detailed information
        
    Raises:
        HTTPException: If there's an error getting the user details
    """
    try:
        # Validate that this is a challenger user
        if not (user_id.startswith('challenger') and user_id[10:].isdigit()):
            raise HTTPException(status_code=400, detail="Invalid challenger user ID")
        
        challenger_num = int(user_id[10:])
        if not (1 <= challenger_num <= 100):
            raise HTTPException(status_code=400, detail="Challenger number must be between 1 and 100")
        
        # Get challenger ranking data
        challenger_ranking_ref = db_client.collection('challenger_ranking')
        challenger_doc = await challenger_ranking_ref.document(user_id).get()
        
        if not challenger_doc.exists:
            raise HTTPException(status_code=404, detail=f"Challenger {user_id} not found in rankings")
        
        challenger_data = challenger_doc.to_dict()
        
        # Process avatar URL
        avatar = challenger_data.get('avatar', '')
        if avatar:
            try:
                # R2 URLs are public; no signing required
                processed_avatar = avatar
                challenger_data['avatar'] = processed_avatar
            except Exception as e:
                logger.error(f"Failed to process avatar URL for challenger {user_id}: {e}")
        
        # Process card image URLs in top_cards
        top_cards = challenger_data.get('top_cards', [])
        for card in top_cards:
            image_url = card.get('image_url', '')
            if image_url:
                try:
                    # R2 URLs are public; no signing required
                    card['image_url'] = image_url
                except Exception as e:
                    logger.error(f"Failed to process card image URL: {e}")
        
        return challenger_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting challenger user details for {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get challenger details: {str(e)}")

async def trigger_challenger_ranking_generation(db_client: AsyncClient) -> Dict[str, str]:
    """
    Trigger the generation of challenger rankings by calling the cloud function.
    Note: This would typically call the cloud function HTTP endpoint.
    
    Args:
        db_client: Firestore async client
        
    Returns:
        Dict with status message
    """
    try:
        # This is a placeholder. In practice, you would call the HTTP endpoint of your cloud function
        # For now, we'll just update a trigger document that the cloud function can watch
        
        trigger_ref = db_client.collection('challenger_ranking').document('trigger')
        await trigger_ref.set({
            'requested_at': firestore.SERVER_TIMESTAMP,
            'status': 'pending'
        })
        
        return {
            'status': 'success',
            'message': 'Challenger ranking generation triggered. Check back in a few minutes.'
        }
        
    except Exception as e:
        logger.error(f"Error triggering challenger ranking generation: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to trigger ranking generation: {str(e)}")
