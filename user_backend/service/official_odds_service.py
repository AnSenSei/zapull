import random
import secrets
import hashlib
import hmac
from typing import List, Dict, Any
from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient
from datetime import datetime, timedelta

from config import get_logger, settings
from config.db_connection import db_connection
from models.pack_schemas import StoredCardInfo
from service.achievements_service import calculate_and_update_level

logger = get_logger(__name__)

# Global memory cache for pack cards
_pack_cards_cache = {}
_cache_last_updated = {}

class PackCardsCache:
    """Memory cache for official pack cards"""
    
    @staticmethod
    async def get_pack_cards(pack_id: str, db_client: AsyncClient) -> Dict[str, List[Dict]]:
        """
        Get pack cards from memory cache or load from Firestore if not cached.
        Returns cards organized by color: green, blue, purple, orange
        """
        cache_key = f"pack_{pack_id}"
        current_time = datetime.now()
        
        # Check if we have cached data (cache for 1 hour since packs don't change frequently)
        if (cache_key in _pack_cards_cache and 
            cache_key in _cache_last_updated and 
            current_time - _cache_last_updated[cache_key] < timedelta(hours=1)):
            logger.info(f"Using cached cards for pack {pack_id}")
            return _pack_cards_cache[cache_key]
        
        logger.info(f"Loading pack cards from Firestore for pack {pack_id}")
        
        # Get pack data to verify it exists
        pack_ref = db_client.collection('packs').document('offcial').collection('offcial').document(pack_id)
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id} in offcial collection")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in offcial collection")
        
        # Get all cards in the pack
        cards_ref = pack_ref.collection("cards")
        cards_docs = await cards_ref.get()
        
        if not cards_docs:
            logger.error(f"No cards found in pack '{pack_id}' in offcial collection")
            raise HTTPException(status_code=404, detail=f"No cards found in pack '{pack_id}' in offcial collection")
        
        # Organize cards by color
        green_cards = []  # common
        blue_cards = []   # uncommon
        purple_cards = [] # reverse holo
        orange_cards = [] # rare+
        
        for doc in cards_docs:
            card_data = doc.to_dict()
            card_color = card_data.get("color", "").lower()
            probability = card_data.get("probability", 0)
            
            card_info = {
                "id": doc.id,
                "data": card_data,
                "probability": probability
            }
            
            if card_color == "green":
                green_cards.append(card_info)
            elif card_color == "blue":
                blue_cards.append(card_info)
            elif card_color == "purple":
                purple_cards.append(card_info)
            elif card_color == "orange":
                orange_cards.append(card_info)
        
        # Validate we have cards for each category
        if not green_cards:
            raise HTTPException(status_code=400, detail=f"No green (common) cards found in pack {pack_id}")
        if not blue_cards:
            raise HTTPException(status_code=400, detail=f"No blue (uncommon) cards found in pack {pack_id}")
        if not purple_cards:
            raise HTTPException(status_code=400, detail=f"No purple (reverse holo) cards found in pack {pack_id}")
        if not orange_cards:
            raise HTTPException(status_code=400, detail=f"No orange (rare+) cards found in pack {pack_id}")
        
        # Cache the organized cards
        organized_cards = {
            "green": green_cards,
            "blue": blue_cards,
            "purple": purple_cards,
            "orange": orange_cards
        }
        
        _pack_cards_cache[cache_key] = organized_cards
        _cache_last_updated[cache_key] = current_time
        
        logger.info(f"Cached {len(cards_docs)} cards for pack {pack_id}: "
                   f"{len(green_cards)} green, {len(blue_cards)} blue, "
                   f"{len(purple_cards)} purple, {len(orange_cards)} orange")
        
        return organized_cards
    
    @staticmethod
    def clear_pack_cache(pack_id: str = None):
        """Clear cache for specific pack or all packs"""
        if pack_id:
            cache_key = f"pack_{pack_id}"
            if cache_key in _pack_cards_cache:
                del _pack_cards_cache[cache_key]
            if cache_key in _cache_last_updated:
                del _cache_last_updated[cache_key]
            logger.info(f"Cleared cache for pack {pack_id}")
        else:
            _pack_cards_cache.clear()
            _cache_last_updated.clear()
            logger.info("Cleared all pack cards cache")
    
    @staticmethod
    def get_cache_stats():
        """Get cache statistics"""
        return {
            "cached_packs": list(_pack_cards_cache.keys()),
            "total_cached": len(_pack_cards_cache),
            "last_updated": {k: v.isoformat() for k, v in _cache_last_updated.items()}
        }


async def draw_official_odds(
    pack_id: str, 
    user_id: str, 
    db_client: AsyncClient,
    count: int = 1
) -> Dict[str, Any]:
    """
    Draw cards from a pack using official odds structure:
    - count=1: Draw 10 cards (1 pack)
    - count=3: Draw 30 cards (3 packs) 
    - count=5: Draw 50 cards (5 packs)
    
    Each pack follows official odds structure:
    - Slots 1-4: 4 green (common) cards weighted by their probability values
    - Slots 5-7: 3 blue (uncommon) cards weighted by their probability values  
    - Slots 8-9: 2 purple (reverse holo) cards weighted by their probability values
    - Slot 10: 1 orange (rare+) card weighted by their probability values
    
    Note: probability=1 means 0.01 (1%)
    
    Args:
        pack_id: The ID of the pack to draw from (always from /packs/offcial/offcial)
        user_id: The ID of the user
        db_client: Firestore client
        count: Number of packs to draw (1, 3, or 5)
        
    Returns:
        Dict containing drawn cards, user info, and provably fair data
        
    Raises:
        HTTPException: If there's an error drawing the cards
    """
    try:
        # Validate count parameter
        if count not in [1, 3, 5]:
            logger.error(f"Invalid count parameter: {count}. Must be 1, 3, or 5.")
            raise HTTPException(status_code=400, detail=f"Invalid count parameter: {count}. Must be 1, 3, or 5.")

        total_cards = count * 10
        logger.info(f"Drawing official odds ({total_cards} cards, {count} packs) from pack '{pack_id}' in offcial collection for user '{user_id}'")
        
        # Check if user exists and get user data
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        user_data = user_doc.to_dict()
        user_points_balance = user_data.get('pointsBalance', 0)
        
        # Get pack cards from memory cache (this will load and cache if not already cached)
        pack_cards = await PackCardsCache.get_pack_cards(pack_id, db_client)
        
        # Extract organized cards from cache
        green_cards = pack_cards["green"]
        blue_cards = pack_cards["blue"]
        purple_cards = pack_cards["purple"]
        orange_cards = pack_cards["orange"]
        
        # Get pack price and verify pack is active
        pack_ref = db_client.collection('packs').document('offcial').collection('offcial').document(pack_id)
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")
        
        pack_data = pack_snap.to_dict()
        
        # Check if pack is active - only allow draws from active packs
        is_active = pack_data.get('is_active', False)
        if not is_active:
            logger.warning(f"Attempted to draw from inactive pack {pack_id}")
            raise HTTPException(
                status_code=400,
                detail=f"Pack '{pack_id}' is not currently available for drawing"
            )
        
        pack_price = pack_data.get('price', 0)
        total_price = pack_price * count  # Multiply by number of packs
        
        # Check if user has enough points
        if user_points_balance < total_price:
            logger.error(f"User '{user_id}' has insufficient points balance ({user_points_balance}) to draw official odds (cost: {total_price})")
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient points balance. You have {user_points_balance} points, but need {total_price} points for official odds draw."
            )
        
        # Get provably fair seeds
        client_seed = user_data.get('clientSeed')
        old_nonce = user_data.get('nonceCounter', 0)
        nonce = old_nonce + 1
        
        # Update nonce counter
        @firestore.async_transactional
        async def _update_nonce(tx: firestore.AsyncTransaction):
            tx.update(user_ref, {'nonceCounter': firestore.Increment(count)})
        
        txn = db_client.transaction()
        await _update_nonce(txn)
        
        server_seed = secrets.token_hex(32)
        server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
        payload = f"{client_seed}{nonce}".encode()
        random_hash = hmac.new(server_seed.encode(), payload, hashlib.sha256).hexdigest()
        
        logger.info(f"Generated provably fair seeds - server_seed_hash: {server_seed_hash}, random_hash: {random_hash}")
        
        # Initialize RNG with the hash
        random.seed(int(random_hash, 16))
        
        # Draw cards according to official odds structure
        drawn_cards = []
        
        # Draw multiple packs (count times)
        for pack_num in range(count):
            pack_offset = pack_num * 10  # Each pack has 10 slots
            pack_drawn_card_ids = set()  # Track drawn cards in this pack to avoid duplicates
            
            # Helper function to draw unique card from a color group
            def draw_unique_card(card_group, card_type, max_attempts=100):
                attempts = 0
                while attempts < max_attempts:
                    probabilities = [card["data"].get("probability", 0) for card in card_group]
                    chosen_card = random.choices(card_group, weights=probabilities, k=1)[0]
                    
                    # Check if this card has already been drawn in this pack
                    if chosen_card["id"] not in pack_drawn_card_ids:
                        pack_drawn_card_ids.add(chosen_card["id"])
                        return chosen_card
                    
                    attempts += 1
                
                # If we can't find a unique card after max_attempts, just return the last chosen card
                # This handles edge cases where there aren't enough unique cards of a color
                logger.warning(f"Could not find unique {card_type} card after {max_attempts} attempts in pack {pack_num + 1}")
                pack_drawn_card_ids.add(chosen_card["id"])
                return chosen_card
            
            # Slots 1-4: Green (common) cards with probability=1 (means 1%)
            for slot in range(1, 5):
                chosen_card = draw_unique_card(green_cards, "green")
                drawn_cards.append({
                    "slot": pack_offset + slot,
                    "pack_number": pack_num + 1,
                    "card_id": chosen_card["id"],
                    "card_data": chosen_card["data"],
                    "color": "green",
                    "type": "common"
                })
            
            # Slots 5-7: Blue (uncommon) cards with probability=1 (means 1%)
            for slot in range(5, 8):
                chosen_card = draw_unique_card(blue_cards, "blue")
                drawn_cards.append({
                    "slot": pack_offset + slot,
                    "pack_number": pack_num + 1,
                    "card_id": chosen_card["id"],
                    "card_data": chosen_card["data"],
                    "color": "blue",
                    "type": "uncommon"
                })
            
            # Slots 8-9: Purple (reverse holo) cards with probabilities 5-4-1
            for slot in range(8, 10):
                chosen_card = draw_unique_card(purple_cards, "purple")
                drawn_cards.append({
                    "slot": pack_offset + slot,
                    "pack_number": pack_num + 1,
                    "card_id": chosen_card["id"],
                    "card_data": chosen_card["data"],
                    "color": "purple",
                    "type": "reverse_holo"
                })
            
            # Slot 10: Orange (rare+) card with total probability=100%
            chosen_card = draw_unique_card(orange_cards, "orange")
            drawn_cards.append({
                "slot": pack_offset + 10,
                "pack_number": pack_num + 1,
                "card_id": chosen_card["id"],
                "card_data": chosen_card["data"],
                "color": "orange",
                "type": "rare_plus"
            })
        
        # Convert drawn cards to StoredCardInfo format
        result_cards = []
        for drawn_card in drawn_cards:
            card_data = drawn_card["card_data"]
            
            # Generate signed URL for image if exists
            image_url = card_data.get("image_url", "")
            signed_image_url = image_url  # R2 URLs are public
            
            result_cards.append(StoredCardInfo(
                id=drawn_card["card_id"],
                card_name=card_data.get("card_name", ""),
                rarity=card_data.get("rarity", 0),
                point_worth=card_data.get("point_worth", 0),
                date_got_in_stock=card_data.get("date_got_in_stock", ""),
                date_got_in_stock_unix=card_data.get("date_got_in_stock_unix"),
                image_url=signed_image_url,
                quantity=card_data.get("quantity", 0),
                condition=card_data.get("condition", "near_mint"),
                used_in_fusion=card_data.get("used_in_fusion"),
                probability=card_data.get("probability"),
                color=card_data.get("color")
            ))
        
        # Store the opening in database
        opening_id = None
        try:
            with db_connection() as conn:
                cursor = conn.cursor()
                # Store the pack name (fallback to pack_id if missing) for pull history readability
                pack_name = pack_data.get('name', pack_id)
                cursor.execute(
                    """
                    INSERT INTO pack_openings (user_id, pack_type, pack_count, price_points,
                                               client_seed, nonce, server_seed_hash, server_seed, random_hash)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                    """,
                    (user_id, pack_name, count, total_price,
                     client_seed, nonce, server_seed_hash, server_seed, random_hash)
                )
                opening_id = cursor.fetchone()[0]
                
                cursor.execute(
                    """
                    INSERT INTO transactions (user_id, type, points_delta, reference_id)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, 'pack_open', -total_price, str(opening_id))
                )
                conn.commit()
                logger.info(f"Inserted pack opening record with ID {opening_id}")
        except Exception as e:
            logger.error(f"Failed to insert SQL records: {e}")
            # Continue even if SQL insertion fails

        
        # Count cards with point_worth >= certain thresholds (same as regular drawing)
        point_threshold_counts = {}
        thresholds = [2000, 5000, 10000, 30000]
        
        for drawn_card in drawn_cards:
            card_data = drawn_card["card_data"]
            point_worth = card_data.get('point_worth', 0)
            for threshold in thresholds:
                if point_worth >= threshold:
                    field_name = f"total_drawn_{threshold}"
                    point_threshold_counts[field_name] = point_threshold_counts.get(field_name, 0) + 1

        # Prepare update data with point threshold counts
        update_data = {
            "total_drawn": firestore.Increment(total_price),
            "totalPointsSpent": firestore.Increment(total_price),
            "pointsBalance": firestore.Increment(-total_price)
        }

        # Add point threshold counts to update data
        for field_name, count in point_threshold_counts.items():
            update_data[field_name] = firestore.Increment(count)
            logger.info(f"Incrementing {field_name} for user '{user_id}' by {count}")

        # Handle expensive pack tracking (price > 200) - same as regular drawing
        if pack_price > 200:
            from datetime import datetime, timedelta
            current_time = datetime.now()
            current_date = current_time.date()
            
            # Get current expensive pack tracking data from user
            last_expensive_draw_time = user_data.get('last_expensive_pack_draw_time')
            consecutive_days = user_data.get('consecutive_expensive_pack_days', 0)
            
            # Check if this is a new day since last expensive draw
            is_new_day = True
            if last_expensive_draw_time:
                if hasattr(last_expensive_draw_time, 'date'):
                    last_draw_date = last_expensive_draw_time.date()
                else:
                    last_draw_date = last_expensive_draw_time.date()
                
                is_new_day = current_date > last_draw_date
                
                # Check if consecutive (yesterday or today)
                days_diff = (current_date - last_draw_date).days
                if days_diff == 0:
                    consecutive_days = consecutive_days
                elif days_diff == 1:
                    consecutive_days += 1
                else:
                    consecutive_days = 1
            else:
                consecutive_days = 1
            
            # Only update fields if it's a new day
            if is_new_day:
                update_data["last_expensive_pack_draw_time"] = current_time
                update_data["consecutive_expensive_pack_days"] = consecutive_days
                update_data["total_expensive_pack_draws"] = firestore.Increment(1)
                logger.info(f"Expensive pack draw (price: {pack_price}) - New day detected. Consecutive days: {consecutive_days}")

        # Deduct points and update user statistics
        @firestore.async_transactional
        async def _update_user_stats(tx: firestore.AsyncTransaction):
            # Re-check balance inside transaction to prevent race condition
            user_doc_tx = await user_ref.get(transaction=tx)
            if not user_doc_tx.exists:
                raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            
            user_data_tx = user_doc_tx.to_dict()
            current_balance = user_data_tx.get('pointsBalance', 0)
            
            if current_balance < total_price:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient points balance. You have {current_balance} points, but need {total_price} points for official odds draw."
                )
            
            # Update user stats with points deduction and all counters
            tx.update(user_ref, update_data)
            
        
        txn = db_client.transaction()
        await _update_user_stats(txn)
        
        # Update weekly_spent collection (skip for challenger1 to challenger100 users)
        is_challenger = False
        if user_id.startswith('challenger'):
            try:
                challenger_suffix = user_id[10:]
                if challenger_suffix.isdigit():
                    challenger_num = int(challenger_suffix)
                    if 1 <= challenger_num <= 100:
                        is_challenger = True
                        logger.warning(f"CHALLENGER DETECTED: Skipping weekly_spent update for user {user_id}")
            except Exception as e:
                logger.error(f"Error parsing challenger user_id {user_id}: {e}")
        
        if not is_challenger:
            try:
                from datetime import datetime, timedelta
                # Get the current week's start date (Monday)
                today = datetime.now()
                start_of_week = today - timedelta(days=today.weekday())
                week_id = start_of_week.strftime("%Y-%m-%d")

                # Reference to the weekly_spent collection and this week's document
                weekly_spent_ref = db_client.collection('weekly_spent').document('weekly_spent').collection(
                    week_id).document(user_id)
                weekly_doc = await weekly_spent_ref.get()

                if weekly_doc.exists:
                    # Update existing document
                    await weekly_spent_ref.update({
                        "spent": firestore.Increment(total_price),
                        "displayName": user_data.get('displayName', user_id),
                        "avatar": user_data.get('avatar', ''),
                        "updatedAt": firestore.SERVER_TIMESTAMP
                    })
                else:
                    # Create new document
                    await weekly_spent_ref.set({
                        "spent": total_price,
                        "displayName": user_data.get('displayName', user_id),
                        "avatar": user_data.get('avatar', ''),
                        "updatedAt": firestore.SERVER_TIMESTAMP
                    })
                logger.info(f"Updated weekly_spent for user '{user_id}' with {total_price} points")
            except Exception as e:
                logger.error(f"Failed to update weekly_spent for user '{user_id}': {e}")
        
        # Increment pack popularity
        try:
            await pack_ref.update({'popularity': firestore.Increment(count)})
            logger.info(f"Incremented popularity for pack '{pack_id}' by {count}")
        except Exception as e:
            logger.error(f"Failed to increment pack popularity: {e}")

        # Calculate and update user's level after drawing cards
        try:
            await calculate_and_update_level(user_id, db_client)
            logger.info(f"Updated level for user '{user_id}' after drawing official odds cards")
        except Exception as e:
            logger.error(f"Failed to update level for user '{user_id}': {e}")

        # Add cards to user collection using card_service batch functionality
        try:
            # Prepare cards_to_add list in the format expected by card_service batch_add_cards
            cards_to_add = []
            for drawn_card in drawn_cards:
                card_data = drawn_card["card_data"]
                card_reference = card_data.get('card_reference', '')
                
                # Convert Firestore reference to string if needed
                if hasattr(card_reference, 'path'):
                    card_reference = card_reference.path
                elif hasattr(card_reference, '_document_path'):
                    card_reference = card_reference._document_path
                elif not isinstance(card_reference, str):
                    card_reference = str(card_reference)
                
                if card_reference and card_reference.startswith('/'):
                    card_reference = card_reference[1:]
                
                if card_reference:
                    cards_to_add.append({
                        'card_reference': card_reference,
                        'card_id': drawn_card['card_id']
                    })
            
            # Use the same batch_add_cards logic from card_service
            # First, aggregate duplicate cards
            card_counts = {}
            for card_info in cards_to_add:
                card_ref = card_info['card_reference']
                if card_ref not in card_counts:
                    card_counts[card_ref] = {
                        'info': card_info,
                        'count': 0
                    }
                card_counts[card_ref]['count'] += 1
            
            logger.info(f"Aggregated card counts: {[(ref, data['count']) for ref, data in card_counts.items()]}")
            
            # Pre-fetch all master and user card data in parallel for better performance
            import asyncio
            from datetime import timedelta
            
            master_card_tasks = []
            user_card_tasks = []
            card_refs_list = []
            
            for card_ref, card_data in card_counts.items():
                collection_name, card_id = card_ref.split('/')
                master_card_ref = db_client.collection(collection_name).document(card_id)
                user_card_ref = user_ref.collection('cards').document('cards').collection(collection_name).document(card_id)
                
                master_card_tasks.append(master_card_ref.get())
                user_card_tasks.append(user_card_ref.get())
                card_refs_list.append({
                    'card_ref': card_ref,
                    'card_data': card_data,
                    'master_ref': master_card_ref,
                    'user_ref': user_card_ref,
                    'card_id': card_id,
                    'collection_name': collection_name
                })
            
            # Execute all reads in parallel
            master_results, user_results = await asyncio.gather(
                asyncio.gather(*master_card_tasks),
                asyncio.gather(*user_card_tasks)
            )
            
            # Use single batch write for all operations
            batch = db_client.batch()
            now = datetime.now()
            
            for i, ref_info in enumerate(card_refs_list):
                try:
                    master_snap = master_results[i]
                    user_snap = user_results[i]
                    
                    if not master_snap.exists:
                        logger.warning(f"Master card not found: {ref_info['card_ref']}")
                        continue
                    
                    master_data = master_snap.to_dict()
                    quantity_to_add = ref_info['card_data']['count']
                    card_id = ref_info['card_id']
                    collection_name = ref_info['collection_name']
                    
                    # Update master card quantity
                    batch.update(ref_info['master_ref'], {"quantity": firestore.Increment(-quantity_to_add)})
                    
                    # Update or create user card
                    if user_snap.exists:
                        # Update existing card
                        updates = {
                            "quantity": firestore.Increment(quantity_to_add),
                            "point_worth": master_data.get("point_worth", 0),
                            "condition": master_data.get("condition", "near_mint"),
                            "buybackexpiresAt": now + timedelta(days=settings.card_buyback_expire_days),
                            "used_in_fusion": master_data.get("used_in_fusion", False)
                        }
                        
                        # Add expiration for low-value cards
                        point_worth = master_data.get("point_worth", 0)
                        low_value_and_not_material = point_worth <= 500 and not master_data.get("used_in_fusion")
                        if low_value_and_not_material:
                            updates["expireAt"] = now + timedelta(days=settings.card_expire_days)
                            updates["isExpiring"] = True
                        
                        batch.update(ref_info['user_ref'], updates)

                        # Also upsert expiring_cards tracking doc for official draws
                        if low_value_and_not_material:
                            try:
                                exp_ref = db_client.collection('expiring_cards').document(f"{user_id}_{card_id}")
                                exp_snap = await exp_ref.get()
                                expires_at = now + timedelta(days=settings.card_expire_days)
                                if exp_snap.exists:
                                    batch.update(exp_ref, {
                                        "quantity": firestore.Increment(quantity_to_add),
                                        "expiresAt": expires_at
                                    })
                                else:
                                    card_path = f"users/{user_id}/cards/cards/{collection_name}/{card_id}"
                                    batch.set(exp_ref, {
                                        "userId": user_id,
                                        "cardReference": card_path,
                                        "expiresAt": expires_at,
                                        "quantity": quantity_to_add
                                    })
                            except Exception as exp_e:
                                logger.warning(f"Failed to upsert expiring_cards for {user_id}_{card_id}: {exp_e}")
                    else:
                        # Create new card
                        user_card_data = {
                            "card_reference": ref_info['card_ref'],
                            "card_name": master_data.get("card_name", ""),
                            "date_got": firestore.SERVER_TIMESTAMP,
                            "id": card_id,
                            "image_url": master_data.get("image_url", ""),
                            "point_worth": master_data.get("point_worth", 0),
                            "quantity": quantity_to_add,
                            "rarity": master_data.get("rarity", 1),
                            "condition": master_data.get("condition", "near_mint"),
                            "buybackexpiresAt": now + timedelta(days=settings.card_buyback_expire_days),
                            "used_in_fusion": master_data.get("used_in_fusion", False)
                        }
                        
                        # Add expiration for low-value cards
                        point_worth = master_data.get("point_worth", 0)
                        low_value_and_not_material = point_worth <= 500 and not master_data.get("used_in_fusion")
                        if low_value_and_not_material:
                            user_card_data["expireAt"] = now + timedelta(days=settings.card_expire_days)
                            user_card_data["isExpiring"] = True
                        
                        batch.set(ref_info['user_ref'], user_card_data)

                        # Also create expiring_cards tracking doc for official draws
                        if low_value_and_not_material:
                            try:
                                exp_ref = db_client.collection('expiring_cards').document(f"{user_id}_{card_id}")
                                exp_snap = await exp_ref.get()
                                expires_at = now + timedelta(days=settings.card_expire_days)
                                if exp_snap.exists:
                                    batch.update(exp_ref, {
                                        "quantity": firestore.Increment(quantity_to_add),
                                        "expiresAt": expires_at
                                    })
                                else:
                                    card_path = f"users/{user_id}/cards/cards/{collection_name}/{card_id}"
                                    batch.set(exp_ref, {
                                        "userId": user_id,
                                        "cardReference": card_path,
                                        "expiresAt": expires_at,
                                        "quantity": quantity_to_add
                                    })
                            except Exception as exp_e:
                                logger.warning(f"Failed to create expiring_cards for {user_id}_{card_id}: {exp_e}")
                    
                    logger.debug(f"Prepared batch operation for {quantity_to_add}x {card_id}")
                    
                except Exception as e:
                    logger.error(f"Error preparing batch for card {ref_info['card_ref']}: {e}")
                    continue
            
            # Execute single atomic batch write
            await batch.commit()
            logger.info(f"Successfully batch added {len(card_counts)} unique cards to user collection")
            
        except Exception as e:
            logger.error(f"Failed to batch add cards to user collection: {e}")
            # Fallback to individual card addition if batch fails
            from .card_service import add_card_to_user
            for drawn_card in drawn_cards:
                try:
                    card_data = drawn_card["card_data"]
                    card_reference = card_data.get('card_reference', '')
                    
                    if hasattr(card_reference, 'path'):
                        card_reference = card_reference.path
                    elif hasattr(card_reference, '_document_path'):
                        card_reference = card_reference._document_path
                    elif not isinstance(card_reference, str):
                        card_reference = str(card_reference)
                    
                    if card_reference and card_reference.startswith('/'):
                        card_reference = card_reference[1:]
                    
                    if card_reference:
                        await add_card_to_user(
                            user_id=user_id,
                            card_reference=card_reference,
                            db_client=db_client,
                            collection_metadata_id=card_reference.split('/')[0]
                        )
                        logger.info(f"Added card {drawn_card['card_id']} to user {user_id}'s collection")
                except Exception as card_error:
                    logger.error(f"Failed to add card {drawn_card['card_id']} individually: {card_error}")
        
        # Get updated user data
        updated_user_doc = await user_ref.get()
        updated_user_data = updated_user_doc.to_dict() if updated_user_doc.exists else {}
        
        logger.info(f"Successfully drew {total_cards} cards using official odds for user '{user_id}'")
        
        return {
            "cards": result_cards,
            "total_drawn": total_cards,
            "packs_drawn": count,
            "total_cost": total_price,
            "user_points_balance": updated_user_data.get('pointsBalance', 0),
            "opening_id": opening_id,
            "provably_fair": {
                "client_seed": client_seed,
                "nonce": nonce,
                "server_seed_hash": server_seed_hash,
                "server_seed": server_seed,
                "random_hash": random_hash
            },
            "draw_structure": {
                "slots_1_4": "4 green (common) cards with probability=1",
                "slots_5_7": "3 blue (uncommon) cards with probability=1", 
                "slots_8_9": "2 purple (reverse holo) cards with probabilities 5-4-1",
                "slot_10": "1 orange (rare+) card, total probability=100%"
            }
        }
        
    except HTTPException:
        return draw_result

    except Exception as e:
        logger.error(f"Error in draw_official_odds: {e}", exc_info=True)
        raise HTTPException(
            status_code=500, 
            detail=f"An error occurred while drawing from the official odds pack: {str(e)}"
        )


async def get_pack_info(pack_id: str, db_client: AsyncClient) -> Dict[str, Any]:
    """
    Get basic information for a specific pack by ID.
    
    Returns pack metadata including name, description, price, etc.
    """
    try:
        # Get pack from offcial collection
        pack_ref = db_client.collection('packs').document('offcial').collection('offcial').document(pack_id)
        pack_doc = await pack_ref.get()
        
        if not pack_doc.exists:
            logger.warning(f"Pack {pack_id} not found in offcial collection")
            raise HTTPException(
                status_code=404,
                detail=f"Pack with ID {pack_id} not found"
            )
        
        pack_data = pack_doc.to_dict()
        
        # Return pack info with consistent structure
        pack_info = {
            "id": pack_id,
            "name": pack_data.get('name', pack_id),
            "description": pack_data.get('description', ''),
            "price": pack_data.get('price', 0),
            "popularity": pack_data.get('popularity', 0),
            "image_url": pack_data.get('image_url', ''),
            "card_count": 0  # Can be updated if needed
        }
        
        logger.info(f"Retrieved pack info for {pack_id}: {pack_info['name']}")
        return pack_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching pack {pack_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch pack {pack_id}: {str(e)}"
        )


async def demo_draw_official_odds(
    pack_id: str, 
    db_client: AsyncClient,
    count: int = 1,
    user_id: str = None
) -> Dict[str, Any]:
    """
    DEMO Draw cards from a pack using official odds structure - NO COST, NO BALANCE CHANGES
    - count=1: Draw 10 cards (1 pack)
    - count=3: Draw 30 cards (3 packs) 
    - count=5: Draw 50 cards (5 packs)
    
    Each pack follows official odds structure:
    - Slots 1-4: 4 green (common) cards weighted by their probability values
    - Slots 5-7: 3 blue (uncommon) cards weighted by their probability values  
    - Slots 8-9: 2 purple (reverse holo) cards weighted by their probability values
    - Slot 10: 1 orange (rare+) card weighted by their probability values
    
    This is a DEMO endpoint - no points are deducted, no balance changes, no stats updates.
    Only provides preview of what cards could be drawn.
        
    Args:
        pack_id: The ID of the pack to draw from (always from /packs/offcial/offcial)
        user_id: The ID of the user
        db_client: Firestore client
        count: Number of packs to draw (1, 3, or 5)
        
    Returns:
        Dict containing drawn cards and demo draw info (no balance changes)
        
    Raises:
        HTTPException: If there's an error drawing the cards
    """
    try:
        # Validate count parameter
        if count not in [1, 3, 5]:
            logger.error(f"Invalid count parameter: {count}. Must be 1, 3, or 5.")
            raise HTTPException(status_code=400, detail=f"Invalid count parameter: {count}. Must be 1, 3, or 5.")

        total_cards = count * 10
        logger.info(f"DEMO Drawing official odds ({total_cards} cards, {count} packs) from pack '{pack_id}' in offcial collection (no auth required)")
        
        # For demo mode, we don't need user authentication - use demo values
        user_points_balance = 10000  # Demo balance for display
        user_data = {
            'clientSeed': 'demo_client_seed',
            'nonceCounter': 0
        }
        
        # Get pack cards from memory cache
        pack_cards = await PackCardsCache.get_pack_cards(pack_id, db_client)
        
        # Extract organized cards from cache
        green_cards = pack_cards["green"]
        blue_cards = pack_cards["blue"]
        purple_cards = pack_cards["purple"]
        orange_cards = pack_cards["orange"]
        
        # Get pack price for display (no deduction in demo)
        pack_ref = db_client.collection('packs').document('offcial').collection('offcial').document(pack_id)
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found")
        
        pack_data = pack_snap.to_dict()
        
        # Check if pack is active - even for demo, only show active packs
        is_active = pack_data.get('is_active', False)
        if not is_active:
            logger.warning(f"Attempted demo draw from inactive pack {pack_id}")
            raise HTTPException(
                status_code=400,
                detail=f"Pack '{pack_id}' is not currently available for drawing"
            )
        
        pack_price = pack_data.get('price', 0)
        total_price = pack_price * count
        
        # Get provably fair seeds (using demo test values)
        client_seed = 'demo_client_seed'
        nonce = 999999  # Fixed test nonce for demo
        
        server_seed = f"demo_{secrets.token_hex(16)}"  # Demo server seed
        server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
        payload = f"{client_seed}{nonce}".encode()
        random_hash = hmac.new(server_seed.encode(), payload, hashlib.sha256).hexdigest()
        
        logger.info(f"DEMO Generated provably fair seeds - server_seed_hash: {server_seed_hash}, random_hash: {random_hash}")
        
        # Initialize RNG with the hash
        random.seed(int(random_hash, 16))
        
        # Draw cards according to official odds structure (same logic as real draw)
        drawn_cards = []
        
        # Draw multiple packs (count times)
        for pack_num in range(count):
            pack_offset = pack_num * 10
            pack_drawn_card_ids = set()
            
            # Helper function to draw unique card from a color group
            def draw_unique_card(card_group, card_type, max_attempts=100):
                attempts = 0
                while attempts < max_attempts:
                    probabilities = [card["data"].get("probability", 0) for card in card_group]
                    chosen_card = random.choices(card_group, weights=probabilities, k=1)[0]
                    
                    if chosen_card["id"] not in pack_drawn_card_ids:
                        pack_drawn_card_ids.add(chosen_card["id"])
                        return chosen_card
                    
                    attempts += 1
                
                logger.warning(f"DEMO: Could not find unique {card_type} card after {max_attempts} attempts in pack {pack_num + 1}")
                pack_drawn_card_ids.add(chosen_card["id"])
                return chosen_card
            
            # Slots 1-4: Green (common) cards
            for slot in range(1, 5):
                chosen_card = draw_unique_card(green_cards, "green")
                drawn_cards.append({
                    "slot": pack_offset + slot,
                    "pack_number": pack_num + 1,
                    "card_id": chosen_card["id"],
                    "card_data": chosen_card["data"],
                    "color": "green",
                    "type": "common"
                })
            
            # Slots 5-7: Blue (uncommon) cards
            for slot in range(5, 8):
                chosen_card = draw_unique_card(blue_cards, "blue")
                drawn_cards.append({
                    "slot": pack_offset + slot,
                    "pack_number": pack_num + 1,
                    "card_id": chosen_card["id"],
                    "card_data": chosen_card["data"],
                    "color": "blue",
                    "type": "uncommon"
                })
            
            # Slots 8-9: Purple (reverse holo) cards
            for slot in range(8, 10):
                chosen_card = draw_unique_card(purple_cards, "purple")
                drawn_cards.append({
                    "slot": pack_offset + slot,
                    "pack_number": pack_num + 1,
                    "card_id": chosen_card["id"],
                    "card_data": chosen_card["data"],
                    "color": "purple",
                    "type": "reverse_holo"
                })
            
            # Slot 10: Orange (rare+) card
            chosen_card = draw_unique_card(orange_cards, "orange")
            drawn_cards.append({
                "slot": pack_offset + 10,
                "pack_number": pack_num + 1,
                "card_id": chosen_card["id"],
                "card_data": chosen_card["data"],
                "color": "orange",
                "type": "rare_plus"
            })
        
        # Convert drawn cards to StoredCardInfo format
        result_cards = []
        for drawn_card in drawn_cards:
            card_data = drawn_card["card_data"]
            
            # Generate signed URL for image if exists
            image_url = card_data.get("image_url", "")
            signed_image_url = image_url  # R2 URLs are public
            
            result_cards.append(StoredCardInfo(
                id=drawn_card["card_id"],
                card_name=card_data.get("card_name", ""),
                rarity=card_data.get("rarity", 0),
                point_worth=card_data.get("point_worth", 0),
                date_got_in_stock=card_data.get("date_got_in_stock", ""),
                date_got_in_stock_unix=card_data.get("date_got_in_stock_unix"),
                image_url=signed_image_url,
                quantity=card_data.get("quantity", 0),
                condition=card_data.get("condition", "near_mint"),
                used_in_fusion=card_data.get("used_in_fusion"),
                probability=card_data.get("probability"),
                color=card_data.get("color")
            ))
        
        # NO DATABASE OPERATIONS - THIS IS DEMO ONLY
        # No pack opening storage, no balance deduction, no stats updates, no card additions
        
        logger.info(f"DEMO draw completed - Generated {len(result_cards)} cards for preview")
        
        # Return demo results - same structure as normal draw
        return {
            "cards": result_cards,
            "total_drawn": total_cards,
            "packs_drawn": count,
            "total_cost": total_price,
            "user_points_balance": user_points_balance,
            "opening_id": 0,
            "provably_fair": {
                "client_seed": client_seed,
                "nonce": nonce,
                "server_seed_hash": server_seed_hash,
                "server_seed": server_seed,
                "random_hash": random_hash
            },
            "draw_structure": {
                "slots_1_4": "4 green (common) cards with probability=1",
                "slots_5_7": "3 blue (uncommon) cards with probability=1", 
                "slots_8_9": "2 purple (reverse holo) cards with probabilities 5-4-1",
                "slot_10": "1 orange (rare+) card, total probability=100%"
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in demo_draw_official_odds: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"An unexpected error occurred while processing the demo official odds draw: {str(e)}"
        )
