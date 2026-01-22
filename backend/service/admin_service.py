"""
Admin service for simulating card draws.
This allows administrators to simulate draws for users (by email) which updates
weekly_spent and top_hits without requiring payment.
"""

import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import List, Dict, Any, Optional
from collections import defaultdict

from google.cloud.firestore_v1 import AsyncClient, Increment, SERVER_TIMESTAMP
from fastapi import HTTPException

from config import get_logger

logger = get_logger(__name__)


async def get_user_by_email(email: str, db_client: AsyncClient) -> Optional[Dict[str, Any]]:
    """
    Look up a user by email address.
    
    Args:
        email: The email address to look up
        db_client: Firestore client
        
    Returns:
        User data dict if found, None otherwise
    """
    try:
        users_ref = db_client.collection('users')
        query = users_ref.where('email', '==', email).limit(1)
        docs = await query.get()
        
        for doc in docs:
            user_data = doc.to_dict()
            user_data['id'] = doc.id
            return user_data
            
        return None
    except Exception as e:
        logger.error(f"Error looking up user by email {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to look up user: {str(e)}")


async def simulate_draw_for_user(
    email: str,
    collection_id: str,
    pack_id: str,
    count: int,
    db_client: AsyncClient,
    add_to_collection: bool = False
) -> Dict[str, Any]:
    """
    Simulate drawing cards for a user by email.
    
    This function:
    1. Looks up user by email
    2. Draws random cards from the specified pack
    3. Updates weekly_spent for the user
    4. Adds high rarity cards (purple, orange, red) to top_hits
    5. Optionally adds cards to user's collection
    
    Args:
        email: User's email address
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to draw from
        count: Number of cards to draw (1, 3, or 5)
        db_client: Firestore client
        add_to_collection: Whether to add cards to user's collection
        
    Returns:
        Dict with drawn cards, weekly_spent update status, and top_hits entries
    """
    try:
        # Validate count
        if count not in [1, 3, 5]:
            raise HTTPException(status_code=400, detail=f"Invalid count: {count}. Must be 1, 3, or 5.")
        
        # Look up user by email
        user_data = await get_user_by_email(email, db_client)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")
        
        user_id = user_data['id']
        display_name = user_data.get('displayName', user_id)
        avatar = user_data.get('avatar', '')
        
        logger.info(f"Simulating draw for user {user_id} ({email}) from pack {pack_id} in collection {collection_id}")
        
        # Get pack data
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
        pack_snap = await pack_ref.get()
        
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")
        
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})
        pack_price = pack_data.get('price', 0)
        total_price = pack_price * count
        
        if not cards_map:
            raise HTTPException(status_code=404, detail=f"No cards found in pack '{pack_id}'")
        
        # Draw random cards based on probabilities
        card_ids = list(cards_map.keys())
        probabilities = list(cards_map.values())
        
        chosen_card_ids = random.choices(card_ids, weights=probabilities, k=count)
        logger.info(f"Randomly selected {count} cards: {chosen_card_ids}")
        
        # Get card details
        drawn_cards = []
        high_rarity_cards = []
        
        for index, card_id in enumerate(chosen_card_ids, 1):
            card_ref = pack_ref.collection('cards').document(card_id)
            card_doc = await card_ref.get()
            
            if not card_doc.exists:
                logger.warning(f"Card '{card_id}' not found in pack")
                continue
            
            card_data = card_doc.to_dict()
            
            # Convert card_reference if needed
            card_reference = card_data.get('card_reference', '')
            if hasattr(card_reference, 'path'):
                card_reference = card_reference.path
            if card_reference.startswith('/'):
                card_reference = card_reference[1:]
            
            drawn_card = {
                'id': card_id,
                'collection_id': collection_id,
                'card_reference': card_reference,
                'image_url': card_data.get('image_url', ''),
                'card_name': card_data.get('card_name', ''),
                'point_worth': card_data.get('point_worth', 0),
                'rarity': card_data.get('rarity', 0),
                'num_draw': index,
                'color': card_data.get('color', 'white')
            }
            drawn_cards.append(drawn_card)
            
            # Track high rarity cards for top_hits
            card_color = str(drawn_card.get('color', '')).lower()
            if card_color in {'purple', 'orange', 'red'}:
                high_rarity_cards.append(drawn_card)
        
        # Update weekly_spent
        weekly_spent_result = await update_weekly_spent_for_user(
            user_id=user_id,
            display_name=display_name,
            avatar=avatar,
            spent_amount=total_price,
            db_client=db_client
        )
        
        # Add high rarity cards to top_hits
        top_hits_results = []
        for card in high_rarity_cards:
            result = await add_card_to_top_hits(
                user_id=user_id,
                display_name=display_name,
                card_reference=card.get('card_reference'),
                pack_id=pack_id,
                collection_id=collection_id,
                db_client=db_client
            )
            top_hits_results.append(result)
        
        # Optionally add cards to user's collection
        cards_added_to_collection = False
        if add_to_collection:
            await add_cards_to_user_collection(
                user_id=user_id,
                collection_id=collection_id,
                drawn_cards=drawn_cards,
                db_client=db_client
            )
            cards_added_to_collection = True
        
        return {
            'success': True,
            'user': {
                'id': user_id,
                'email': email,
                'display_name': display_name
            },
            'pack': {
                'id': pack_id,
                'collection_id': collection_id,
                'price': pack_price
            },
            'draw_count': count,
            'total_simulated_spent': total_price,
            'drawn_cards': drawn_cards,
            'high_rarity_cards_count': len(high_rarity_cards),
            'weekly_spent_updated': weekly_spent_result,
            'top_hits_added': len(top_hits_results),
            'cards_added_to_collection': cards_added_to_collection
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error simulating draw for user {email}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to simulate draw: {str(e)}")


async def update_weekly_spent_for_user(
    user_id: str,
    display_name: str,
    avatar: str,
    spent_amount: int,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Update the weekly_spent collection for a user.
    
    Args:
        user_id: The user's ID
        display_name: The user's display name
        avatar: The user's avatar URL
        spent_amount: Amount to add to weekly spent
        db_client: Firestore client
        
    Returns:
        Dict with update status
    """
    try:
        # Calculate current week ID (Eastern timezone to match production)
        eastern_tz = ZoneInfo("America/New_York")
        today = datetime.now(eastern_tz)
        start_of_week = today - timedelta(days=today.weekday())
        week_id = start_of_week.strftime("%Y-%m-%d")
        
        weekly_spent_ref = db_client.collection('weekly_spent').document('weekly_spent').collection(week_id).document(user_id)
        weekly_doc = await weekly_spent_ref.get()
        
        if weekly_doc.exists:
            await weekly_spent_ref.update({
                "spent": Increment(spent_amount),
                "displayName": display_name,
                "avatar": avatar,
                "updatedAt": SERVER_TIMESTAMP
            })
            previous_spent = weekly_doc.to_dict().get('spent', 0)
            action = 'updated'
        else:
            await weekly_spent_ref.set({
                "spent": spent_amount,
                "displayName": display_name,
                "avatar": avatar,
                "updatedAt": SERVER_TIMESTAMP
            })
            previous_spent = 0
            action = 'created'
        
        logger.info(f"Weekly spent {action} for user {user_id}: +{spent_amount} (previous: {previous_spent})")
        
        return {
            'success': True,
            'week_id': week_id,
            'action': action,
            'amount_added': spent_amount,
            'previous_spent': previous_spent,
            'new_spent': previous_spent + spent_amount
        }
        
    except Exception as e:
        logger.error(f"Failed to update weekly_spent for user {user_id}: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def add_card_to_top_hits(
    user_id: str,
    display_name: str,
    card_reference: str,
    pack_id: str,
    collection_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Add a card to the top_hits collection.
    
    Args:
        user_id: The user's ID
        display_name: The user's display name
        card_reference: Reference to master card (collection/card_id)
        pack_id: The pack ID
        collection_id: The collection ID
        db_client: Firestore client
        
    Returns:
        Dict with the created document info
    """
    try:
        # Parse card_reference
        if '/' in card_reference:
            card_collection_id, card_id = card_reference.split('/')[-2:]
        else:
            raise HTTPException(status_code=400, detail=f"Invalid card reference: {card_reference}")
        
        # Fetch master card data
        card_ref = db_client.collection(card_collection_id).document(card_id)
        card_doc = await card_ref.get()
        
        if not card_doc.exists:
            raise HTTPException(status_code=404, detail=f"Card '{card_reference}' not found")
        
        card_data = card_doc.to_dict()
        
        # Prepare the document data
        top_hit_data = {
            "user_id": user_id,
            "display_name": display_name,
            "card": {
                "id": card_id,
                "name": card_data.get("card_name", ""),
                "rarity": card_data.get("rarity", 1),
                "image_url": card_data.get("image_url", ""),
                "point_worth": card_data.get("point_worth", 0)
            },
            "pack_id": pack_id,
            "pack_collection_id": collection_id,
            "timestamp": SERVER_TIMESTAMP,
            "simulated": True  # Mark as simulated draw
        }
        
        # Add the document to the top_hits collection
        top_hits_ref = db_client.collection('top_hits').document()
        await top_hits_ref.set(top_hit_data)
        
        logger.info(f"Added card {card_id} to top_hits for user {user_id} (simulated)")
        
        return {
            'success': True,
            'document_id': top_hits_ref.id,
            'card_name': card_data.get("card_name", ""),
            'card_id': card_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add card to top_hits: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def add_cards_to_user_collection(
    user_id: str,
    collection_id: str,
    drawn_cards: List[Dict[str, Any]],
    db_client: AsyncClient
) -> None:
    """
    Add drawn cards to user's collection.
    
    Args:
        user_id: The user's ID
        collection_id: The collection ID
        drawn_cards: List of drawn card data
        db_client: Firestore client
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        
        # Aggregate cards by ID
        card_counts = defaultdict(int)
        card_data_map = {}
        
        for card in drawn_cards:
            card_id = card['id']
            card_counts[card_id] += 1
            if card_id not in card_data_map:
                card_data_map[card_id] = card
        
        # Add each unique card
        for card_id, quantity in card_counts.items():
            card = card_data_map[card_id]
            user_card_ref = user_ref.collection('cards').document('cards').collection(collection_id).document(card_id)
            
            user_card_doc = await user_card_ref.get()
            
            if user_card_doc.exists:
                await user_card_ref.update({
                    "quantity": Increment(quantity)
                })
            else:
                await user_card_ref.set({
                    "card_reference": card.get('card_reference', ''),
                    "card_name": card.get('card_name', ''),
                    "date_got": SERVER_TIMESTAMP,
                    "id": card_id,
                    "image_url": card.get('image_url', ''),
                    "point_worth": card.get('point_worth', 0),
                    "quantity": quantity,
                    "rarity": card.get('rarity', 1)
                })
        
        logger.info(f"Added {len(drawn_cards)} cards to user {user_id}'s collection")
        
    except Exception as e:
        logger.error(f"Failed to add cards to user collection: {e}")
        raise


async def add_points_to_user(
    user_id: str,
    points: int,
    db_client: AsyncClient,
    reason: Optional[str] = None
) -> Dict[str, Any]:
    """
    Add points to a user's balance.
    
    Args:
        user_id: The user's ID
        points: Number of points to add
        db_client: Firestore client
        reason: Optional reason for adding points
        
    Returns:
        Dict with operation details
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        user_data = user_doc.to_dict()
        previous_balance = user_data.get('pointsBalance', 0)
        
        await user_ref.update({
            'pointsBalance': Increment(points)
        })
        
        new_balance = previous_balance + points
        logger.info(f"Added {points} points to user {user_id}. Previous: {previous_balance}, New: {new_balance}. Reason: {reason}")
        
        return {
            'success': True,
            'user_id': user_id,
            'points_added': points,
            'previous_balance': previous_balance,
            'new_balance': new_balance
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to add points to user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to add points: {str(e)}")


async def add_card_to_user_highlights(
    user_id: str,
    card_collection_id: str,
    card_id: str,
    card_data: Dict[str, Any],
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Add a card to the user's highlights subcollection.
    
    Args:
        user_id: The user's ID
        card_collection_id: The collection ID of the card
        card_id: The ID of the card
        card_data: The card data to add
        db_client: Firestore client
        
    Returns:
        Dict with operation status
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        highlights_ref = user_ref.collection('highlights').document(card_id)
        
        # Check if already in highlights
        highlights_doc = await highlights_ref.get()
        if highlights_doc.exists:
            return {
                'success': True,
                'action': 'already_exists',
                'card_id': card_id
            }
        
        # Add card to highlights
        highlight_data = {
            **card_data,
            'card_collection_id': card_collection_id,
            'added_at': SERVER_TIMESTAMP
        }
        await highlights_ref.set(highlight_data)
        
        logger.info(f"Added card {card_id} to highlights for user {user_id}")
        
        return {
            'success': True,
            'action': 'added',
            'card_id': card_id,
            'card_name': card_data.get('card_name', '')
        }
        
    except Exception as e:
        logger.error(f"Failed to add card to highlights: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def automated_simulate_draw(
    email: str,
    collection_id: str,
    pack_id: str,
    draw_count: int,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Fully automated draw simulation that:
    1. Looks up user by email
    2. Checks if user has enough points, auto top-up if needed
    3. Draws cards from the pack
    4. Updates weekly_spent
    5. Adds high rarity cards to top_hits
    6. Adds cards to user's collection
    7. Adds most expensive card to user's highlights
    
    Args:
        email: User's email address
        collection_id: Pack collection ID
        pack_id: Pack ID to draw from
        draw_count: Number of cards to draw per session (1, 3, or 5)
        db_client: Firestore client
        
    Returns:
        Dict with complete operation summary
    """
    try:
        # Validate draw count
        if draw_count not in [1, 3, 5]:
            raise HTTPException(status_code=400, detail="draw_count must be 1, 3, or 5")
        
        # Look up user
        user_data = await get_user_by_email(email, db_client)
        if not user_data:
            raise HTTPException(status_code=404, detail=f"User with email '{email}' not found")
        
        user_id = user_data['id']
        display_name = user_data.get('displayName', user_id)
        avatar = user_data.get('avatar', '')
        current_balance = user_data.get('pointsBalance', 0)
        
        # Get pack price
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
        pack_snap = await pack_ref.get()
        
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")
        
        pack_data = pack_snap.to_dict()
        pack_price = pack_data.get('price', 0)
        total_cost = pack_price * draw_count
        
        # Auto top-up if needed
        points_added = 0
        if current_balance < total_cost:
            points_needed = total_cost - current_balance + 10000  # Add extra buffer
            await add_points_to_user(
                user_id=user_id,
                points=points_needed,
                db_client=db_client,
                reason="Auto top-up for simulated draw"
            )
            points_added = points_needed
            logger.info(f"Auto topped up {points_needed} points for user {user_id}")
        
        # Perform the draw simulation
        result = await simulate_draw_for_user(
            email=email,
            collection_id=collection_id,
            pack_id=pack_id,
            count=draw_count,
            db_client=db_client,
            add_to_collection=True  # Always add to collection
        )
        
        # Find and highlight the most expensive card
        most_expensive_card = None
        if result.get('drawn_cards'):
            most_expensive_card = max(result['drawn_cards'], key=lambda c: c.get('point_worth', 0))
            
            if most_expensive_card.get('point_worth', 0) > 0:
                highlight_result = await add_card_to_user_highlights(
                    user_id=user_id,
                    card_collection_id=collection_id,
                    card_id=most_expensive_card['id'],
                    card_data=most_expensive_card,
                    db_client=db_client
                )
                result['highlight_added'] = highlight_result
        
        # Add automation summary
        result['automation_summary'] = {
            'points_auto_topped_up': points_added,
            'cards_added_to_collection': True,
            'most_expensive_card': {
                'id': most_expensive_card['id'] if most_expensive_card else None,
                'name': most_expensive_card.get('card_name', '') if most_expensive_card else None,
                'point_worth': most_expensive_card.get('point_worth', 0) if most_expensive_card else 0,
                'highlighted': result.get('highlight_added', {}).get('success', False)
            } if most_expensive_card else None
        }
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in automated simulate draw: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Automated simulation failed: {str(e)}")
