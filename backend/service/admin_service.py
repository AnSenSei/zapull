"""
Admin service for simulating card draws.
This allows administrators to simulate draws for users (by email) which updates
weekly_spent, top_hits, and user stats without actually consuming inventory.
"""

import random
import math
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


async def create_admin_user(
    email: str,
    display_name: str,
    db_client: AsyncClient,
    initial_points: int = 10000,
    avatar: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create a new user via admin panel.
    
    Args:
        email: User's email address
        display_name: User's display name
        db_client: Firestore client
        initial_points: Initial points balance (default 10000)
        avatar: Optional avatar URL or base64 data
        
    Returns:
        Created user data
    """
    try:
        # Check if user already exists
        existing_user = await get_user_by_email(email, db_client)
        if existing_user:
            raise HTTPException(status_code=400, detail=f"User with email '{email}' already exists")
        
        # Generate default avatar URL using UI Avatars if none provided
        if not avatar:
            # Use UI Avatars service for default avatar with initials (two characters)
            encoded_name = display_name.replace(' ', '+')
            avatar = f"https://ui-avatars.com/api/?name={encoded_name}&background=random&color=fff&size=128&length=1"
        
        # Create user document
        users_ref = db_client.collection('users')
        new_user_ref = users_ref.document()
        
        user_data = {
            'email': email,
            'displayName': display_name,
            'avatar': avatar,
            'pointsBalance': initial_points,
            'level': 1,
            'totalPointsSpent': 0,
            'totalCashRecharged': 0,
            'totalFusion': 0,
            'total_drawn': 0,
            'createdAt': SERVER_TIMESTAMP,
            'admin_created': True  # Mark as admin-created user
        }
        
        await new_user_ref.set(user_data)
        
        logger.info(f"Admin created new user: {email} with ID {new_user_ref.id}")
        
        # Return serializable data (exclude SERVER_TIMESTAMP)
        return {
            'id': new_user_ref.id,
            'email': email,
            'displayName': display_name,
            'avatar': avatar,
            'pointsBalance': initial_points,
            'level': 1,
            'admin_created': True
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating admin user {email}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {str(e)}")


async def get_admin_created_users(db_client: AsyncClient) -> List[Dict[str, Any]]:
    """
    Get all users created via admin panel, plus predefined test emails.
    
    Args:
        db_client: Firestore client
        
    Returns:
        List of admin-created users and predefined emails
    """
    # Predefined emails for simulate draw dropdown
    predefined_emails = [
        'g1003509461@gmail.com',
        'emilymillerzp@gmail.com',
        'luckyrollzp@gmail.com',
        'tacotacobday@gmail.com',
        'bubblebuble2018@gmail.com',
        'animetaleszp@gmail.com',
        'williamwilsonzp@gmail.com',
        'jacksonleezp@gmail.com',
        'zapullonepiece@gmail.com',
        'kybubuscloset@gmail.com',
        'brainddddzp@gmail.com',
        'kaia10035@hotmail.com',
        'junhaoandyqi@gmail.com'
    ]
    
    try:
        users_ref = db_client.collection('users')
        # Simple query without order_by to avoid composite index requirement
        query = users_ref.where('admin_created', '==', True).limit(100)
        docs = await query.get()
        
        users = []
        existing_emails = set()
        
        for doc in docs:
            user_data = doc.to_dict()
            user_data['id'] = doc.id
            email = user_data.get('email')
            existing_emails.add(email)
            users.append({
                'id': user_data.get('id'),
                'email': email,
                'display_name': user_data.get('displayName'),
                'avatar': user_data.get('avatar'),
                'points_balance': user_data.get('pointsBalance', 0),
                'level': user_data.get('level', 1)
            })
        
        # Add predefined emails that are not already in the list
        for email in predefined_emails:
            if email not in existing_emails:
                users.append({
                    'id': f'predefined-{email}',
                    'email': email,
                    'display_name': email.split('@')[0],
                    'avatar': None,
                    'points_balance': 0,
                    'level': 1
                })
        
        logger.info(f"Retrieved {len(users)} admin-created users (including predefined)")
        return users
        
    except Exception as e:
        logger.error(f"Error getting admin-created users: {e}")
        # Return predefined emails even if DB query fails
        return [
            {
                'id': f'predefined-{email}',
                'email': email,
                'display_name': email.split('@')[0],
                'avatar': None,
                'points_balance': 0,
                'level': 1
            }
            for email in predefined_emails
        ]


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


async def get_user_highlights(
    user_id: str,
    db_client: AsyncClient
) -> List[Dict[str, Any]]:
    """
    Get all cards in user's highlights subcollection.
    
    Args:
        user_id: The user's ID
        db_client: Firestore client
        
    Returns:
        List of highlight cards
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        highlights_ref = user_ref.collection('highlights')
        docs = await highlights_ref.get()
        
        highlights = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            highlights.append(data)
        
        logger.info(f"Retrieved {len(highlights)} highlights for user {user_id}")
        return highlights
        
    except Exception as e:
        logger.error(f"Failed to get highlights for user {user_id}: {e}")
        return []


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
        
        # Add card to highlights with all required fields for UserCard model
        highlight_data = {
            'id': card_id,
            'card_name': card_data.get('card_name', ''),
            'image_url': card_data.get('image_url', ''),
            'point_worth': card_data.get('point_worth', 0),
            'rarity': card_data.get('rarity', 1),
            'card_reference': f"{card_collection_id}/{card_id}",  # Required by UserCard
            'quantity': 1,  # Required by UserCard
            'locked_quantity': 0,
            'card_collection_id': card_collection_id,
            'date_got': SERVER_TIMESTAMP,  # Required for highlights query sorting
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


async def remove_card_from_user_highlights(
    user_id: str,
    card_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Remove a card from user's highlights subcollection.
    
    Args:
        user_id: The user's ID
        card_id: The ID of the card to remove
        db_client: Firestore client
        
    Returns:
        Dict with operation status
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        highlights_ref = user_ref.collection('highlights').document(card_id)
        
        # Check if exists
        highlights_doc = await highlights_ref.get()
        if not highlights_doc.exists:
            return {
                'success': True,
                'action': 'not_found',
                'card_id': card_id
            }
        
        # Delete from highlights
        await highlights_ref.delete()
        
        logger.info(f"Removed card {card_id} from highlights for user {user_id}")
        
        return {
            'success': True,
            'action': 'removed',
            'card_id': card_id
        }
        
    except Exception as e:
        logger.error(f"Failed to remove card from highlights: {e}")
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
    3. Draws cards from the pack (without adding to inventory)
    4. Updates weekly_spent
    5. Adds high rarity cards to top_hits
    6. Increments user's total_drawn and totalPointsSpent
    7. Recalculates and updates the user's level
    
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
        
        # Perform the draw simulation WITHOUT adding to inventory
        result = await simulate_draw_for_user(
            email=email,
            collection_id=collection_id,
            pack_id=pack_id,
            count=draw_count,
            db_client=db_client,
            add_to_collection=False
        )
        
        # Update user's total_drawn and totalPointsSpent (but DO NOT change pointsBalance)
        try:
            user_ref = db_client.collection('users').document(user_id)
            await user_ref.update({
                'total_drawn': Increment(result['total_simulated_spent']),
                'totalPointsSpent': Increment(result['total_simulated_spent'])
            })
            
            # Re-fetch user to calculate level
            user_doc_after = await user_ref.get()
            user_after = user_doc_after.to_dict() or {}
            total_drawn = user_after.get('total_drawn', 0)
            current_level = user_after.get('level', 1)
            new_level = math.floor(total_drawn / 10000) + 1
            
            if new_level != current_level:
                await user_ref.update({'level': new_level})
                logger.info(f"Updated level for user {user_id} from {current_level} to {new_level} (total_drawn: {total_drawn})")
            else:
                logger.info(f"Level for user {user_id} remains at {current_level} (total_drawn: {total_drawn})")
            
            result['level_update'] = {
                'user_id': user_id,
                'previous_level': current_level,
                'current_level': new_level,
                'total_drawn': total_drawn,
                'added_spent': result['total_simulated_spent']
            }
        except Exception as e:
            logger.error(f"Failed to update total_drawn/level for user {user_id}: {e}")
        
        # Determine the most expensive card (for UI selection only)
        most_expensive_card = None
        if result.get('drawn_cards'):
            most_expensive_card = max(result['drawn_cards'], key=lambda c: c.get('point_worth', 0))
        
        # Add automation summary (no inventory or highlight changes here)
        result['automation_summary'] = {
            'points_auto_topped_up': points_added,
            'cards_added_to_collection': False,
            'most_expensive_card': {
                'id': most_expensive_card['id'] if most_expensive_card else None,
                'name': most_expensive_card.get('card_name', '') if most_expensive_card else None,
                'point_worth': most_expensive_card.get('point_worth', 0) if most_expensive_card else 0,
                'highlighted': False
            } if most_expensive_card else None
        }
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in automated simulate draw: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Automated simulation failed: {str(e)}")


async def get_all_achievements(db_client: AsyncClient) -> List[Dict[str, Any]]:
    """
    Get all achievements from the achievements collection.
    
    Args:
        db_client: Firestore client
        
    Returns:
        List of achievement data
    """
    try:
        achievements_ref = db_client.collection('achievements')
        docs = await achievements_ref.get()
        
        achievements = []
        for doc in docs:
            data = doc.to_dict()
            data['id'] = doc.id
            achievements.append({
                'id': data.get('id'),
                'name': data.get('name', ''),
                'description': data.get('description', ''),
                'condition': data.get('condition', {}),
                'reward': data.get('reward', []),
                'rarity': data.get('rarity', 1),
                'rank': data.get('rank', 0)
            })
        
        logger.info(f"Retrieved {len(achievements)} achievements")
        return achievements
        
    except Exception as e:
        logger.error(f"Error getting achievements: {e}")
        return []


async def get_user_achievements(
    user_id: str,
    db_client: AsyncClient
) -> List[Dict[str, Any]]:
    """
    Get all achievements for a user.
    
    Args:
        user_id: The user's ID
        db_client: Firestore client
        
    Returns:
        List of user achievement data
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        achievements_ref = user_ref.collection('achievements')
        docs = await achievements_ref.get()
        
        achievements = []
        for doc in docs:
            data = doc.to_dict()
            # Get the achievement ID from the document data or use doc.id
            achievement_id = data.get('achievement_id', doc.id)
            achievements.append({
                'achievement_id': achievement_id,
                'acquired': data.get('acquired', False),
                'awardedAt': data.get('awardedAt'),
                'progress': data.get('progress')
            })
        
        logger.info(f"Retrieved {len(achievements)} achievements for user {user_id}")
        return achievements
        
    except Exception as e:
        logger.error(f"Error getting user achievements for {user_id}: {e}")
        return []


async def grant_achievement_to_user(
    user_id: str,
    achievement_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Grant an achievement to a user.
    
    Args:
        user_id: The user's ID
        achievement_id: The achievement ID to grant
        db_client: Firestore client
        
    Returns:
        Dict with operation status
    """
    try:
        # Verify the achievement exists
        achievement_ref = db_client.collection('achievements').document(achievement_id)
        achievement_doc = await achievement_ref.get()
        
        if not achievement_doc.exists:
            return {
                'success': False,
                'error': f"Achievement '{achievement_id}' not found"
            }
        
        achievement_data = achievement_doc.to_dict()
        
        # Verify the user exists
        user_ref = db_client.collection('users').document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            return {
                'success': False,
                'error': f"User '{user_id}' not found"
            }
        
        # Check if user already has this achievement
        user_achievement_ref = user_ref.collection('achievements').document(achievement_id)
        user_achievement_doc = await user_achievement_ref.get()
        
        if user_achievement_doc.exists:
            return {
                'success': True,
                'action': 'already_exists',
                'achievement_id': achievement_id,
                'achievement_name': achievement_data.get('name', '')
            }
        
        # Grant the achievement
        condition = achievement_data.get('condition', {})
        target = condition.get('target', 0) if isinstance(condition, dict) else 0
        
        await user_achievement_ref.set({
            'achievement_id': achievement_id,
            'acquired': True,
            'awardedAt': SERVER_TIMESTAMP,
            'progress': target  # Set progress to target value (completed)
        })
        
        logger.info(f"Granted achievement '{achievement_id}' to user {user_id}")
        
        return {
            'success': True,
            'action': 'granted',
            'achievement_id': achievement_id,
            'achievement_name': achievement_data.get('name', '')
        }
        
    except Exception as e:
        logger.error(f"Error granting achievement {achievement_id} to user {user_id}: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def revoke_achievement_from_user(
    user_id: str,
    achievement_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Revoke an achievement from a user.
    
    Args:
        user_id: The user's ID
        achievement_id: The achievement ID to revoke
        db_client: Firestore client
        
    Returns:
        Dict with operation status
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        user_achievement_ref = user_ref.collection('achievements').document(achievement_id)
        
        user_achievement_doc = await user_achievement_ref.get()
        
        if not user_achievement_doc.exists:
            return {
                'success': True,
                'action': 'not_found',
                'achievement_id': achievement_id
            }
        
        # Also remove from achievement_highlights if present
        achievement_highlight_ref = user_ref.collection('achievement_highlights').document(achievement_id)
        achievement_highlight_doc = await achievement_highlight_ref.get()
        if achievement_highlight_doc.exists:
            await achievement_highlight_ref.delete()
            logger.info(f"Removed achievement {achievement_id} from highlights for user {user_id}")
        
        await user_achievement_ref.delete()
        
        logger.info(f"Revoked achievement '{achievement_id}' from user {user_id}")
        
        return {
            'success': True,
            'action': 'revoked',
            'achievement_id': achievement_id
        }
        
    except Exception as e:
        logger.error(f"Error revoking achievement {achievement_id} from user {user_id}: {e}")
        return {
            'success': False,
            'error': str(e)
        }


async def update_admin_user(
    user_id: str,
    db_client: AsyncClient,
    display_name: Optional[str] = None,
    avatar: Optional[str] = None,
    points_balance: Optional[int] = None
) -> Dict[str, Any]:
    """
    Update an admin-created user's profile.
    
    Args:
        user_id: The user's ID
        db_client: Firestore client
        display_name: New display name (optional)
        avatar: New avatar URL (optional)
        points_balance: New points balance (optional)
        
    Returns:
        Dict with operation status and updated user data
    """
    try:
        user_ref = db_client.collection('users').document(user_id)
        user_doc = await user_ref.get()
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        user_data = user_doc.to_dict()
        
        # Only allow updating admin-created users
        if not user_data.get('admin_created', False):
            raise HTTPException(status_code=403, detail="Cannot update non-admin-created users")
        
        # Build update dict
        update_data = {}
        if display_name is not None:
            update_data['displayName'] = display_name
        if avatar is not None:
            update_data['avatar'] = avatar
        if points_balance is not None:
            update_data['pointsBalance'] = points_balance
        
        if not update_data:
            return {
                'success': True,
                'action': 'no_changes',
                'user_id': user_id
            }
        
        await user_ref.update(update_data)
        
        # Fetch updated user
        updated_doc = await user_ref.get()
        updated_data = updated_doc.to_dict()
        
        logger.info(f"Updated admin user {user_id}: {update_data}")
        
        return {
            'success': True,
            'action': 'updated',
            'user_id': user_id,
            'user': {
                'id': user_id,
                'email': updated_data.get('email'),
                'display_name': updated_data.get('displayName'),
                'avatar': updated_data.get('avatar'),
                'points_balance': updated_data.get('pointsBalance', 0),
                'level': updated_data.get('level', 1)
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating admin user {user_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update user: {str(e)}")
