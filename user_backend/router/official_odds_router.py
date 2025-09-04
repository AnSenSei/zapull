from fastapi import APIRouter, HTTPException, Depends, Path, Query, Body
from typing import Dict, Any, List, Optional
from google.cloud import firestore
from pydantic import BaseModel
import asyncio
from datetime import datetime, timedelta

from service.official_odds_service import draw_official_odds, demo_draw_official_odds, PackCardsCache, get_pack_info
from config import get_firestore_client, get_logger
from dependencies.auth import get_current_user_id
from utils.challenger_validation import validate_not_challenger_account

logger = get_logger(__name__)

router = APIRouter(
    prefix="/official-odds",
    tags=["official-odds"],
)

class DrawOfficialOddsResponse(BaseModel):
    """Response model for official odds draw"""
    cards: list
    total_drawn: int
    packs_drawn: int
    total_cost: int
    user_points_balance: int
    opening_id: int = None
    provably_fair: Dict[str, Any]
    draw_structure: Dict[str, str]


class PackInfo(BaseModel):
    """Model for pack information"""
    id: str
    name: str = None
    description: str = None
    price: int = 0
    popularity: int = 0
    image_url: str = None
    card_count: int = 0


class GetPacksResponse(BaseModel):
    """Response model for getting all packs"""
    packs: List[PackInfo]
    total_count: int


class CardInfo(BaseModel):
    """Model for card information"""
    id: str = None
    document_id: str = None
    card_name: str = None
    name: str = None
    color: str = None
    rarity: int = None
    probability: Optional[float] = None
    point_worth: int = None
    image_url: str = None
    card_type: str = None
    condition: str = None


class ColorSection(BaseModel):
    """Model for cards grouped by color"""
    color: str
    slot_info: str
    cards_per_pack: int
    probability_info: str
    cards: List[CardInfo]
    total_available: int


class GetCardsResponse(BaseModel):
    """Response model for getting pack cards organized by color"""
    pack_id: str
    sections: List[ColorSection]
    total_cards_shown: int
    cached: bool = False


@router.post("/demo-draw/{pack_id}", response_model=DrawOfficialOddsResponse)
async def demo_draw_official_odds_route(
    pack_id: str = Path(..., description="The ID of the pack to draw from (from offcial collection)"),
    count: int = Query(1, description="Number of packs to draw (1=10 cards, 3=30 cards, 5=50 cards)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Demo draw cards from a pack using official odds structure - NO COST, NO BALANCE DEDUCTION
    - count=1: Draw 10 cards (1 pack)
    - count=3: Draw 30 cards (3 packs) 
    - count=5: Draw 50 cards (5 packs)
    
    Each pack follows official odds structure:
    - Slots 1-4: 4 green (common) cards, probability = 1
    - Slots 5-7: 3 blue (uncommon) cards, probability = 1  
    - Slots 8-9: 2 purple (reverse holo) cards, probabilities 5-4-1
    - Slot 10: 1 orange (rare+) card, total probability 100%
    
    This is a DEMO endpoint - no points are deducted and no balance changes occur.
    Pack is drawn from the fixed offcial collection (/packs/offcial/offcial).
    """
    try:
        logger.info(f"DEMO Official odds draw request (no auth) for {count} packs from {pack_id} in offcial collection")
        
        result = await demo_draw_official_odds(
            pack_id=pack_id,
            db_client=db,
            count=count
        )
        
        logger.info(f"DEMO draw completed - Found {len(result['cards'])} cards")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in demo_draw_official_odds_route: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred while processing the demo official odds draw: {str(e)}"
        )


@router.post("/draw/{pack_id}", response_model=DrawOfficialOddsResponse)
async def draw_official_odds_route(
    pack_id: str = Path(..., description="The ID of the pack to draw from (from offcial collection)"),
    count: int = Query(1, description="Number of packs to draw (1=10 cards, 3=30 cards, 5=50 cards)"),
    user_id: str = Depends(get_current_user_id),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Draw cards from a pack using official odds structure:
    - count=1: Draw 10 cards (1 pack)
    - count=3: Draw 30 cards (3 packs) 
    - count=5: Draw 50 cards (5 packs)
    
    Each pack follows official odds structure:
    - Slots 1-4: 4 green (common) cards, probability = 1
    - Slots 5-7: 3 blue (uncommon) cards, probability = 1  
    - Slots 8-9: 2 purple (reverse holo) cards, probabilities 5-4-1
    - Slot 10: 1 orange (rare+) card, total probability 100%
    
    Pack is drawn from the fixed offcial collection (/packs/offcial/offcial).
    This endpoint requires authentication and will deduct the total pack price from the user's balance.
    """
    try:
        # Validate that challenger accounts cannot draw official packs
        validate_not_challenger_account(user_id, "official pack drawing")
        
        logger.info(f"Official odds draw request from user {user_id} for {count} packs from {pack_id} in offcial collection")
        
        result = await draw_official_odds(
            pack_id=pack_id, 
            user_id=user_id,
            db_client=db,
            count=count
        )
        
        logger.info(f"Found {len(result['cards'])} cards")
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in draw_official_odds_route: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"An unexpected error occurred while processing the official odds draw: {str(e)}"
        )


@router.get("/packs", response_model=GetPacksResponse)
async def get_all_official_packs(
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all available packs in the offcial collection.
    
    Returns a list of all packs with their basic information including:
    - Pack ID, name, description
    - Price and popularity
    - Image URL and card count
    """
    try:
        logger.info("Fetching all packs from offcial collection")
        
        # Get all packs from offcial collection
        packs_ref = db.collection('packs').document('offcial').collection('offcial')
        packs_docs = await packs_ref.get()
        
        if not packs_docs:
            logger.warning("No packs found in offcial collection")
            return GetPacksResponse(packs=[], total_count=0)
        
        packs = []
        for pack_doc in packs_docs:
            try:
                pack_data = pack_doc.to_dict()
                pack_id = pack_doc.id
                
                # Create pack info
                pack_info = PackInfo(
                    id=pack_id,
                    name=pack_data.get('name', pack_id),
                    description=pack_data.get('description', ''),
                    price=pack_data.get('price', 0),
                    popularity=pack_data.get('popularity', 0),
                    image_url=pack_data.get('image_url', ''),
                    card_count=0
                )
                packs.append(pack_info)
                
            except Exception as e:
                logger.error(f"Error processing pack {pack_doc.id}: {e}")
                continue
        
        logger.info(f"Found {len(packs)} packs in offcial collection")
        return GetPacksResponse(packs=packs, total_count=len(packs))
        
        
    except Exception as e:
        logger.error(f"Error fetching packs from offcial collection: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch packs: {str(e)}"
        )


@router.get("/packs/{pack_id}", response_model=PackInfo)
async def get_official_pack(
    pack_id: str,
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get details of a specific official pack by its ID.
    
    Returns pack information including:
    - Pack ID, name, description
    - Price and popularity
    - Image URL and card count
    """
    try:
        logger.info(f"Fetching pack {pack_id} from offcial collection")
        
        pack_info_dict = await get_pack_info(pack_id, db)
        
        # Convert dict to PackInfo model
        pack_info = PackInfo(**pack_info_dict)
        
        logger.info(f"Found pack {pack_id}: {pack_info.name}")
        return pack_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pack {pack_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch pack {pack_id}: {str(e)}"
        )


async def get_official_pack_cards_cached(pack_id: str, db: firestore.AsyncClient) -> GetCardsResponse:
    """
    Get cards from an official pack organized by color sections.
    
    Returns structured data with cards grouped by color/slot type:
    - Orange: All cards with individual probabilities (1 per pack)  
    - Purple: Top 10 cards by value (2 per pack, 5-4-1 weighted)
    - Blue: Top 10 cards by value (3 per pack, evenly distributed)
    - Green: Top 10 cards by value (4 per pack, evenly distributed)
    """
    try:
        # Get organized cards from the shared memory cache
        pack_cards = await PackCardsCache.get_pack_cards(pack_id, db)
        
        sections = []
        total_cards_shown = 0
        
        # Color configuration for sections - correct 10-slot structure
        color_configs = {
            "green": {
                "cards_per_pack": 4,
                "slot_info": "Slots 1-4",
                "max_display": 20,
                "show_probability": False,
                "probability_info": "Common cards - probability = 1, guaranteed 4 per pack"
            },
            "blue": {
                "cards_per_pack": 3,
                "slot_info": "Slots 5-7", 
                "max_display": 20,
                "show_probability": False,
                "probability_info": "Uncommon cards - probability = 1, guaranteed 3 per pack"
            },
            "purple": {
                "cards_per_pack": 2,
                "slot_info": "Slots 8-9",
                "max_display": 15,
                "show_probability": True,
                "probability_info": "Reverse holo cards - probabilities 5-4-1, guaranteed 2 per pack"
            },
            "orange": {
                "cards_per_pack": 1,
                "slot_info": "Slot 10",
                "max_display": None,  # Show all orange cards
                "show_probability": True,
                "probability_info": "Rare+ cards - total probability 100%, guaranteed 1 per pack"
            }
        }
        
        # Process colors in order: orange, purple, blue, green (orange first for display)
        color_order = ["orange", "purple", "blue", "green"]
        
        # Process each color in the specified order
        for color in color_order:
            color_cards_data = pack_cards.get(color, [])
            if not color_cards_data:
                continue
                
            # Get config for this color
            config = color_configs.get(color, color_configs["green"])
                
            # Determine which cards to show
            if config.get("max_display") is None:
                # Show all cards (orange)
                selected_cards = color_cards_data
            else:
                # Show top cards by point worth (purple/blue/green)
                max_display = config.get("max_display", 10)
                sorted_cards = sorted(color_cards_data, key=lambda x: x["data"].get("point_worth", 0), reverse=True)
                selected_cards = sorted_cards[:max_display]
            
            # Convert to CardInfo objects
            cards = []
            for card_info in selected_cards:
                card_data = card_info["data"]
                card_id = card_info["id"]
                card = CardInfo(
                    id=card_data.get('id', card_id),
                    document_id=card_id,
                    card_name=card_data.get('card_name', card_data.get('name', '')),
                    name=card_data.get('name', card_data.get('card_name', '')),
                    color=color,
                    rarity=card_data.get('rarity', 1),
                    probability=card_data.get('probability', 0.0) if config["show_probability"] else None,
                    point_worth=card_data.get('point_worth', 0),
                    image_url=card_data.get('image_url', ''),
                    card_type=card_data.get('card_type', card_data.get('type', '')),
                    condition=card_data.get('condition', 'near_mint')
                )
                cards.append(card)
            
            # Sort cards within section by point worth
            cards.sort(key=lambda x: x.point_worth or 0, reverse=True)
            
            # Create color section
            section = ColorSection(
                color=color,
                slot_info=config["slot_info"],
                cards_per_pack=config["cards_per_pack"],
                probability_info=config["probability_info"],
                cards=cards,
                total_available=len(color_cards_data)
            )
            sections.append(section)
            total_cards_shown += len(cards)
        
        # Create structured response
        response = GetCardsResponse(
            pack_id=pack_id,
            sections=sections,
            total_cards_shown=total_cards_shown,
            cached=True
        )
        
        logger.info(f"Returned structured cards for pack {pack_id}: {total_cards_shown} cards in {len(sections)} sections")
        return response
        
    except Exception as e:
        logger.error(f"Error fetching cards for pack {pack_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch cards for pack {pack_id}: {str(e)}"
        )


@router.get("/packs/{pack_id}/cards", response_model=GetCardsResponse)
async def get_official_pack_cards(
    pack_id: str = Path(..., description="The ID of the pack to get cards from (from offcial collection)"),
    color: Optional[str] = Query(None, description="Filter by card color (green, blue, purple, orange)"),
    db: firestore.AsyncClient = Depends(get_firestore_client)
):
    """
    Get all cards from a specific pack in the offcial collection.
    
    Returns a list of all cards with their information including:
    - Card ID, name, color, rarity
    - Probability, point worth, image URL
    - Card type and other metadata
    
    Supports optional color filtering to get only cards of a specific color.
    Results are cached for 30 minutes for better performance.
    """
    try:
        logger.info(f"Fetching cards for pack {pack_id}" + (f" with color filter: {color}" if color else ""))
        
        # Get cards from cache or database
        response = await get_official_pack_cards_cached(pack_id, db)
        
        # Apply color filter if specified
        if color:
            filtered_cards = [card for card in response.cards if card.color and card.color.lower() == color.lower()]
            response.cards = filtered_cards
            response.total_count = len(filtered_cards)
            logger.info(f"Applied color filter '{color}', returning {len(filtered_cards)} cards")
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in get_official_pack_cards: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while fetching cards: {str(e)}"
        )


@router.delete("/cache/{pack_id}")
async def clear_pack_cache(
    pack_id: str = Path(..., description="The ID of the pack to clear from cache")
):
    """
    Clear the memory cache for a specific pack's cards.
    Useful for forcing fresh data retrieval after pack updates.
    """
    PackCardsCache.clear_pack_cache(pack_id)
    return {"message": f"Memory cache cleared for pack {pack_id}"}


@router.delete("/cache")
async def clear_all_cache():
    """
    Clear all cached pack cards from memory.
    Useful for forcing fresh data retrieval for all packs.
    """
    stats = PackCardsCache.get_cache_stats()
    cache_count = stats["total_cached"]
    
    PackCardsCache.clear_pack_cache()  # Clear all when no pack_id provided
    
    return {"message": f"Cleared all memory cache entries ({cache_count} packs)"}


@router.get("/cache/stats")
async def get_cache_stats():
    """
    Get statistics about the current memory cache state.
    Shows which packs are cached and when they were last updated.
    """
    return PackCardsCache.get_cache_stats()


@router.get("/info")
async def get_official_odds_info():
    """
    Get information about the official odds draw structure.
    """
    return {
        "description": "Official odds draws 10 cards with guaranteed structure",
        "structure": {
            "slots_1_4": {
                "count": 4,
                "color": "green",
                "type": "common",
                "rule": "Cards with probability = 1, guaranteed 4 per pack"
            },
            "slots_5_7": {
                "count": 3,
                "color": "blue", 
                "type": "uncommon",
                "rule": "Cards with probability = 1, guaranteed 3 per pack"
            },
            "slots_8_9": {
                "count": 2,
                "color": "purple",
                "type": "reverse_holo", 
                "rule": "Cards weighted by probabilities 5-4-1, guaranteed 2 per pack"
            },
            "slot_10": {
                "count": 1,
                "color": "orange",
                "type": "rare_plus",
                "rule": "Cards weighted by probability, total 100%, guaranteed 1 per pack"
            }
        },
        "total_cards": 10,
        "cost_multiplier": "1x pack price per pack",
        "provably_fair": True
    }
