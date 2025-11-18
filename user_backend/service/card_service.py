
from typing import Optional, Dict, List, Tuple, Any
from uuid import UUID
import random
import math
import re
import secrets
import hashlib
import hmac
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException
import httpx
from shippo import Shippo
from shippo.models import components
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, SERVER_TIMESTAMP, async_transactional, Increment

from config import get_logger, settings
import config
from config.db_connection import db_connection
from models.schemas import User, UserCard, PaginationInfo, AppliedFilters, UserCardListResponse, UserCardsResponse, Address, CreateAccountRequest, PerformFusionResponse, RandomFusionRequest, CardListing, CreateCardListingRequest, OfferPointsRequest, OfferCashRequest, UpdatePointOfferRequest, UpdateCashOfferRequest, CheckCardMissingResponse, MissingCard, FusionRecipeMissingCards, RankEntry, FusionIngredient, FusionRecipeWithUserInfo
from models.pack_schemas import StoredCardInfo
# No need for storage utils - R2 URLs are public
from service.achievements_service import calculate_and_update_level

logger = get_logger(__name__)

async def validate_address_with_shippo(address: Address) -> bool:
    """
    Validate an address using the latest Shippo Python SDK.

    Args:
        address: The address object to validate (including name)

    Returns:
        True if the address is valid, False otherwise

    Raises:
        HTTPException: If there's an error validating the address
    """
    try:
        # Configure Shippo SDK
        if not hasattr(settings, 'shippo_api_key') or not settings.shippo_api_key:
            logger.error("Shippo API key not configured")
            raise HTTPException(status_code=500, detail="Address validation service not configured")

        # Initialize the Shippo SDK with API key
        shippo_sdk = Shippo(
            api_key_header=settings.shippo_api_key
        )

        # Create address object for validation using the new SDK structure
        logger.info(f"Validating address for {address.name}: {address.street}, {address.city}, {address.state}, {address.zip}, {address.country}")

        # Create and validate the address using the new SDK
        validation_result = shippo_sdk.addresses.create(
            components.AddressCreateRequest(
                name=address.name,
                street1=address.street,
                city=address.city,
                state=address.state,
                zip=address.zip,
                country=address.country,
                validate=True
            )
        )

        # Check if validation was successful
        if not validation_result:
            raise HTTPException(status_code=400, detail="Address validation failed: No response from service")

        # Access validation results from the response
        validation_results = validation_result.validation_results

        if not validation_results:
            logger.warning(f"No validation results returned for address: {validation_result}")
            return True  # If no validation results, consider it valid (some addresses may not support validation)

        # Check if the address is valid
        is_valid = validation_results.is_valid

        if not is_valid:
            # Get validation messages for detailed error reporting
            error_messages = []

            messages = validation_results.messages or []
            for msg in messages:
                error_text = msg.text if hasattr(msg, 'text') else str(msg)
                error_code = msg.code if hasattr(msg, 'code') else ""
                if error_code:
                    error_messages.append(f"{error_code}: {error_text}")
                else:
                    error_messages.append(error_text)

            error_detail = "; ".join(error_messages) if error_messages else "Address validation failed"
            logger.warning(f"Address validation failed for {address.name}: {error_detail}")
            raise HTTPException(status_code=400, detail=f"Address validation failed: {error_detail}")

        logger.info(f"Address validated successfully for {address.name}")
        return True

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

async def get_collection_metadata(collection_name: str, db_client: AsyncClient = None) -> Dict:
    """
    Retrieves metadata for a specific collection from the metadata collection in Firestore.
    This is the main method that should be used by all other functions.
    
    Args:
        collection_name: The name of the collection to fetch metadata for (e.g., 'pokemon', 'one_piece')
        db_client: Optional Firestore client
        
    Returns:
        The collection metadata as a dictionary containing:
        - firestoreCollection: The actual Firestore collection name (e.g., 'pokemon_card_info')
        - storagePrefix: The storage prefix for images
        - name: The collection name
        
    Raises:
        HTTPException: 404 if collection metadata not found, 500 for other errors
    """
    if not db_client:
        from config import get_firestore_client
        db_client = get_firestore_client()
    
    # Get the metadata collection name from settings
    # Default to 'collection_meta_data' to match backend's metadata collection
    meta_collection_name = getattr(settings, 'meta_data_collection', 'collection_meta_data')
    
    # Get the specific document by collection_name
    doc_ref = db_client.collection(meta_collection_name).document(collection_name)
    
    try:
        doc_snapshot = await doc_ref.get()
        
        if not doc_snapshot.exists:
            logger.warning(f"Metadata for collection '{collection_name}' not found in Firestore.")
            raise HTTPException(status_code=404, detail=f"Metadata for collection '{collection_name}' not found")
        
        metadata_data = doc_snapshot.to_dict()
        return metadata_data
    except HTTPException as http_exc:
        raise http_exc
    except Exception as e:
        logger.error(f"Failed to retrieve metadata for collection '{collection_name}' from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve collection metadata: {str(e)}")

# Keep the old function name for backward compatibility but have it call the new one
async def get_collection_metadata_from_firestore(collection_name: str, db_client: AsyncClient = None) -> Dict:
    """
    Backward compatibility wrapper for get_collection_metadata.
    
    Args:
        collection_name: The name of the collection to fetch metadata for
        db_client: Optional Firestore client
        
    Returns:
        The collection metadata as a dictionary
    """
    return await get_collection_metadata(collection_name, db_client)

async def get_collection_metadata_from_service(collection_name: str) -> Dict:
    """
    Gets collection metadata from Firestore.
    Previously fetched from storage service, now fetches from Firestore collection_meta_data.

    Args:
        collection_name: The name of the collection to fetch metadata for

    Returns:
        The collection metadata as a dictionary

    Raises:
        HTTPException: If the collection is not found
    """
    return await get_collection_metadata(collection_name)


async def get_card_by_id_from_service(card_id: str, collection_name: str = None) -> dict:
    """
    Fetches card data directly from Firestore.
    Previously fetched from storage service, now queries Firestore directly to avoid cross-service dependency.

    Args:
        card_id: The ID of the card to fetch
        collection_name: The collection where the card is stored

    Returns:
        The card data as a dictionary

    Raises:
        HTTPException: If there's an error fetching the card
    """
    try:
        # Get Firestore client from the request context
        from config import get_firestore_client
        db_client = get_firestore_client()
        
        # If collection_name is provided, use it. Otherwise, try to find the card in known collections
        if collection_name:
            # Get the actual Firestore collection name from metadata
            metadata = await get_collection_metadata(collection_name, db_client)
            firestore_collection = metadata["firestoreCollection"]
            card_ref = db_client.collection(firestore_collection).document(card_id)
            card_doc = await card_ref.get()
            
            if not card_doc.exists:
                raise HTTPException(status_code=404, detail=f"Card {card_id} not found in collection {collection_name}")
            
            card_data = card_doc.to_dict()
            # Add the document ID to match the format from the storage service
            card_data['id'] = card_id
            return card_data
        else:
            # Try to find the card in known collections
            # We need to know which collections to check - for now, try common ones
            known_collections = ['pokemon', 'one_piece', 'magic']
            
            for collection_name in known_collections:
                try:
                    metadata = await get_collection_metadata(collection_name, db_client)
                    firestore_collection = metadata["firestoreCollection"]
                    card_ref = db_client.collection(firestore_collection).document(card_id)
                    card_doc = await card_ref.get()
                    
                    if card_doc.exists:
                        card_data = card_doc.to_dict()
                        card_data['id'] = card_id
                        return card_data
                except HTTPException:
                    # Collection metadata not found, continue to next
                    continue
            
            raise HTTPException(status_code=404, detail=f"Card {card_id} not found in any collection")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching card {card_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch card details: {str(e)}"
        )


async def draw_card_from_pack(collection_id: str, pack_id: str, db_client: AsyncClient) -> dict:
    """
    Draw a card from a pack based on probabilities.

    This function:
    1. Gets all probabilities from cards.values() in the pack
    2. Randomly chooses a card id based on these probabilities
    3. Retrieves the card information from the cards subcollection
    4. Logs the card information and returns a success message
    5. Increments the popularity field of the pack by 1

    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to draw from
        db_client: Firestore client

    Returns:
        A dictionary with a success message

    Raises:
        HTTPException: If there's an error drawing the card
    """
    try:
        logger.info(f"Drawing card from pack '{pack_id}' in collection '{collection_id}'")

        # Construct the reference to the pack document
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id} in collection {collection_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Get the cards map from the pack document
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})

        if not cards_map:
            logger.error(f"No cards found in pack '{pack_id}' in collection '{collection_id}'")
            raise HTTPException(status_code=404, detail=f"No cards found in pack '{pack_id}' in collection '{collection_id}'")

        # Get all probabilities from the cards map
        card_ids = list(cards_map.keys())
        probabilities = list(cards_map.values())

        # Randomly choose a card id based on probabilities
        chosen_card_id = random.choices(card_ids, weights=probabilities, k=1)[0]
        logger.info(f"Randomly selected card '{chosen_card_id}' from pack '{pack_id}' in collection '{collection_id}'")

        # Get the card information from the cards subcollection
        card_ref = pack_ref.collection('cards').document(chosen_card_id)
        card_snap = await card_ref.get()

        if not card_snap.exists:
            logger.error(f"Card '{chosen_card_id}' not found in pack '{pack_id}' in collection '{collection_id}'")
            raise HTTPException(status_code=404, detail=f"Card '{chosen_card_id}' not found in pack '{pack_id}' in collection '{collection_id}'")

        # Get the card data
        card_data = card_snap.to_dict()

        # Generate a signed URL for the card image if it exists
        image_url = card_data.get('image_url', '')
        signed_url = image_url
        if image_url:
            try:
                # R2 URLs are public, no need to sign them

                signed_url = image_url
                logger.info(f"  Generated signed URL for image: {signed_url}")
            except Exception as e:
                logger.warning(f"Failed to generate signed URL for card image {image_url}: {e}")
                signed_url = image_url

        # Increment the popularity field of the pack by 1
        try:
            await pack_ref.update({"popularity": Increment(1)})
            logger.info(f"Incremented popularity for pack '{pack_id}' in collection '{collection_id}'")
        except Exception as e:
            logger.error(f"Failed to increment popularity for pack '{pack_id}' in collection '{collection_id}': {e}")
            # Continue even if updating popularity fails

        # Return a dictionary with the signed URL and point_worth
        return {
            "message": f"Successfully drew card '{chosen_card_id}' from pack '{pack_id}' in collection '{collection_id}'",
            "image_url": signed_url,
            "point_worth": card_data.get('point', 0)
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error drawing card from pack '{pack_id}' in collection '{collection_id}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to draw card from pack '{pack_id}' in collection '{collection_id}': {str(e)}")


async def draw_multiple_cards_from_pack(collection_id: str, pack_id: str, user_id: str, db_client: AsyncClient,
                                        count: int = 5) -> list:
    """
    Draw multiple cards (1,5 or 10) from a pack based on probabilities.

    This function:
    1. Gets all probabilities from cards.values() in the pack
    2. Randomly chooses multiple card ids based on these probabilities
    3. Retrieves the card information from the cards subcollection for each card
    4. Logs the card information and returns the list of drawn cards
    5. Increments the popularity field of the pack by the number of cards drawn

    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to draw from
        user_id: The ID of the user (used only for validation)
        db_client: Firestore client
        count: The number of cards to draw (default: 1, should be 1, 3 or 5)

    Returns:
        A list of dictionaries containing the drawn card data

    Raises:
        HTTPException: If there's an error drawing the cards
    """
    try:
        # Validate count parameter
        if count not in [1, 3, 5]:
            logger.error(f"Invalid count parameter: {count}. Must be 1, 3 or 5.")
            raise HTTPException(status_code=400, detail=f"Invalid count parameter: {count}. Must be 1, 3 or 5.")

        logger.info(f"Drawing {count} cards from pack '{pack_id}' in collection '{collection_id}' for user '{user_id}'")

        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get user data
        user_data = user_doc.to_dict()
        user_points_balance = user_data.get('pointsBalance', 0)

        # Construct the reference to the pack document
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)

        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id} in collection {collection_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Get the cards map from the pack document
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})

        # Check if user has enough points to draw the requested number of cards
        pack_price = pack_data.get('price', 0)
        total_price = pack_price * count

        if user_points_balance < total_price:
            logger.error(
                f"User '{user_id}' has insufficient points balance ({user_points_balance}) to draw {count} cards (cost: {total_price})")
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient points balance. You have {user_points_balance} points, but need {total_price} points to draw {count} cards."
            )

        if not cards_map:
            logger.error(f"No cards found in pack '{pack_id}' in collection '{collection_id}'")
            raise HTTPException(status_code=404,
                                detail=f"No cards found in pack '{pack_id}' in collection '{collection_id}'")

        # Get all probabilities from the cards map
        card_ids = list(cards_map.keys())
        probabilities = list(cards_map.values())

        # Check if there are enough cards in the pack
        if len(card_ids) < count:
            logger.warning(
                f"Not enough cards in pack '{pack_id}' in collection '{collection_id}'. Requested {count} but only {len(card_ids)} available.")
            # We'll still draw as many as possible, but with replacement

        # 3. Get clientSeed and nonce from user data
        user_doc_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        
        # Get user data (using different variable to preserve original user_data)
        user_snap = await user_doc_ref.get()
        user_data_for_nonce = user_snap.to_dict()
        client_seed = user_data_for_nonce.get('clientSeed')
        old_nonce = user_data_for_nonce.get('nonceCounter', 0)
        nonce = old_nonce + 1

        # Update counter in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            tx.update(user_doc_ref, {'nonceCounter': firestore.Increment(count)})

        # Execute the transaction
        txn = db_client.transaction()
        await _txn(txn)
        logger.info(f"Retrieved client seed '{client_seed}' and nonce {nonce} for user '{user_id}'")

        # 4. Provably fair seeds and proof
        server_seed = secrets.token_hex(32)
        server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
        # Compute HMAC for the batch
        payload = f"{client_seed}{nonce}".encode()
        random_hash = hmac.new(server_seed.encode(), payload, hashlib.sha256).hexdigest()
        logger.info(
            f"Generated server seed '{server_seed}' with hash '{server_seed_hash}' and random hash '{random_hash}'")

        # 5. Perform deterministic draw using Python RNG seeded by random_hash
        random.seed(int(random_hash, 16))
        chosen_card_ids = random.choices(card_ids, weights=probabilities, k=count)
        logger.info(f"Deterministically selected {count} cards from pack '{pack_id}' in collection '{collection_id}'")

        # 6. Insert into SQL tables
        opening_id = None
        try:
            with db_connection() as conn:
                cursor = conn.cursor()
                # pack_openings
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

                # transactions
                cursor.execute(
                    """
                    INSERT INTO transactions (user_id, type, points_delta, reference_id)
                    VALUES (%s, %s, %s, %s)
                    """,
                    (user_id, 'pack_open', -total_price, str(opening_id))
                )
                conn.commit()
                logger.info(f"Inserted pack opening record with ID {opening_id} and transaction record")
        except Exception as e:
            logger.error(f"Failed to insert SQL records: {e}")
            # Continue even if SQL insertion fails

        # List to store all drawn cards data for adding to user
        cards_to_add = []

        # Pre-fetch card data outside the transaction
        for chosen_card_id in chosen_card_ids:
            # Get the card information from the cards subcollection
            card_ref = pack_ref.collection('cards').document(chosen_card_id)
            card_snap = await card_ref.get()

            if not card_snap.exists:
                logger.error(f"Card '{chosen_card_id}' not found in pack '{pack_id}' in collection '{collection_id}'")
                # Skip this card and continue with others
                continue

            # Get the card data
            card_data = card_snap.to_dict()

            # Get card reference from the card data - it might be a Firestore reference
            card_reference = card_data.get('card_reference', '')
            
            # Convert Firestore reference to string if needed
            if hasattr(card_reference, 'path'):
                card_reference = card_reference.path
            elif hasattr(card_reference, '_document_path'):
                card_reference = card_reference._document_path
            elif not isinstance(card_reference, str):
                card_reference = str(card_reference)
            
            if not card_reference:
                logger.warning(f"Card {chosen_card_id} has no card_reference")
                continue
                
            # Remove leading slash if present (card_reference might be "/collection/card_id")
            if card_reference.startswith('/'):
                card_reference = card_reference[1:]
            
            # Add card to the list of cards to add to user
            cards_to_add.append({
                'card_reference': card_reference,
                'collection_id': collection_id,
                'card_id': chosen_card_id
            })

        if not cards_to_add:
            raise HTTPException(status_code=404,
                                detail=f"No valid cards found in pack '{pack_id}' in collection '{collection_id}'")

        # Helper function to convert Firestore references to strings
        def convert_references_to_strings(data):
            if isinstance(data, dict):
                result = {}
                for key, value in data.items():
                    # Check for Firestore reference by checking for path attribute or _document_path attribute
                    if hasattr(value, 'path') and callable(getattr(value, 'path', None)):
                        # This is likely a Firestore reference with a callable path method
                        result[key] = str(value.path)
                    elif hasattr(value, '_document_path'):
                        # This is likely a Firestore reference with a _document_path attribute
                        result[key] = str(value._document_path)
                    elif str(type(value)).find('google.cloud.firestore_v1.async_document.AsyncDocumentReference') != -1:
                        # Direct check for AsyncDocumentReference type
                        result[key] = str(value)
                    elif isinstance(value, (dict, list)):
                        result[key] = convert_references_to_strings(value)
                    else:
                        result[key] = value
                return result
            elif isinstance(data, list):
                return [convert_references_to_strings(item) for item in data]
            else:
                # Check if the data itself is a Firestore reference
                if hasattr(data, 'path') and callable(getattr(data, 'path', None)):
                    return str(data.path)
                elif hasattr(data, '_document_path'):
                    return str(data._document_path)
                elif str(type(data)).find('google.cloud.firestore_v1.async_document.AsyncDocumentReference') != -1:
                    return str(data)
                return data

        # Create a list of drawn cards with detailed information
        drawn_cards = []
        processed_urls = {}  # Cache to avoid regenerating the same URL multiple times in this request
        
        for index, card_data in enumerate(cards_to_add, 1):
            # Get the card information from the cards subcollection
            card_ref = pack_ref.collection('cards').document(card_data['card_id'])
            card_snap = await card_ref.get()
            card_dict = card_snap.to_dict()

            # Convert any Firestore references to strings
            card_dict = convert_references_to_strings(card_dict)

            # Ensure card_reference is a string
            if 'card_reference' in card_data and not isinstance(card_data['card_reference'], str):
                card_data['card_reference'] = convert_references_to_strings(card_data['card_reference'])

            # Check and cache signed URL for the card image
            image_url = card_dict.get('image_url', '')
            if image_url:
                # Check if we've already processed this card in this request
                card_cache_key = f"{card_data['card_id']}_{image_url}"
                if card_cache_key in processed_urls:
                    card_dict['image_url'] = processed_urls[card_cache_key]
                else:
                    try:
                        # R2 URLs are public; no signing required. Just reuse the URL.
                        signed_url = image_url
                        card_dict['image_url'] = signed_url
                        processed_urls[card_cache_key] = signed_url
                    except Exception as e:
                        logger.error(f"Failed to process image URL {image_url}: {e}")
                        processed_urls[card_cache_key] = image_url

            # Create a new dictionary with only the fields we need
            simplified_card = {
                'id': card_data['card_id'],
                'collection_id': collection_id,
                'card_reference': card_data['card_reference'],
                'image_url': card_dict.get('image_url', ''),
                'card_name': card_dict.get('card_name', ''),
                'point_worth': card_dict.get('point_worth', 0),
                'quantity': card_dict.get('quantity', 0),
                'rarity': card_dict.get('rarity', 0),
                'num_draw': index,  # Add the position of the card in the drawing sequence
                'color': card_dict.get('color', 'white')  # Add the color of the card
            }

            drawn_cards.append(simplified_card)

        logger.info(f"Successfully drew {len(drawn_cards)} cards from pack '{pack_id}' in collection '{collection_id}'")

        # Increment the popularity field of the pack by the number of cards drawn
        try:
            await pack_ref.update({"popularity": Increment(len(drawn_cards))})
            logger.info(
                f"Incremented popularity for pack '{pack_id}' in collection '{collection_id}' by {len(drawn_cards)}")
        except Exception as e:
            logger.error(f"Failed to increment popularity for pack '{pack_id}' in collection '{collection_id}': {e}")
            # Continue even if updating popularity fails

        # Increment the total_drawn and totalPointsSpent fields in the user's document by the pack price multiplied by the number of cards drawn
        # Also deduct the points from the user's balance
        # Track cards with rarity > 4 and update corresponding fields
        try:
            # We already calculated these values earlier
            # pack_price = pack_data.get('price', 0)
            # total_price = pack_price * len(drawn_cards)

            # Count cards with point_worth >= certain thresholds
            point_threshold_counts = {}
            thresholds = [2000, 5000, 10000, 30000]
            
            for card in drawn_cards:
                point_worth = card.get('point_worth', 0)
                for threshold in thresholds:
                    if point_worth >= threshold:
                        field_name = f"total_drawn_{threshold}"
                        point_threshold_counts[field_name] = point_threshold_counts.get(field_name, 0) + 1

            # Prepare update data with point threshold counts
            update_data = {
                "total_drawn": Increment(total_price),
                "totalPointsSpent": Increment(total_price),
                "pointsBalance": Increment(-total_price)  # Deduct points from balance
            }

            # Add point threshold counts to update data
            for field_name, count in point_threshold_counts.items():
                update_data[field_name] = Increment(count)
                logger.info(f"Incrementing {field_name} for user '{user_id}' by {count}")

            # Handle expensive pack tracking (price > 200)
            if pack_price > 200:
                current_time = datetime.now()
                current_date = current_time.date()
                
                # Get current expensive pack tracking data from user
                last_expensive_draw_time = user_data.get('last_expensive_pack_draw_time')
                consecutive_days = user_data.get('consecutive_expensive_pack_days', 0)
                total_draws = user_data.get('total_expensive_pack_draws', 0)
                
                # Check if this is a new day since last expensive draw
                is_new_day = True
                if last_expensive_draw_time:
                    if hasattr(last_expensive_draw_time, 'date'):
                        # It's a datetime object
                        last_draw_date = last_expensive_draw_time.date()
                    else:
                        # It's a Firestore timestamp, convert to local server time
                        last_draw_date = last_expensive_draw_time.date()
                    
                    is_new_day = current_date > last_draw_date
                    
                    # Check if consecutive (yesterday or today)
                    days_diff = (current_date - last_draw_date).days
                    if days_diff == 0:
                        # Same day - don't increment counters and don't update timestamp
                        consecutive_days = consecutive_days  # Keep same
                    elif days_diff == 1:
                        # Next day - increment consecutive days
                        consecutive_days += 1
                    else:
                        # Gap in days - reset consecutive to 1
                        consecutive_days = 1
                else:
                    # First time drawing expensive pack
                    consecutive_days = 1
                
                # Only update fields if it's a new day
                if is_new_day:
                    update_data["last_expensive_pack_draw_time"] = current_time
                    update_data["consecutive_expensive_pack_days"] = consecutive_days
                    update_data["total_expensive_pack_draws"] = Increment(1)
                    logger.info(f"Expensive pack draw (price: {pack_price}) - New day detected. Consecutive days: {consecutive_days}, Total draws will be incremented")
                else:
                    logger.info(f"Expensive pack draw (price: {pack_price}) - Same day as last draw. No fields updated")

            # Use a transaction to ensure atomic points deduction
            @firestore.async_transactional
            async def deduct_points_txn(tx: firestore.AsyncTransaction):
                # Re-check balance inside transaction to prevent race condition
                user_doc_tx = await user_ref.get(transaction=tx)
                if not user_doc_tx.exists:
                    raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
                
                user_data_tx = user_doc_tx.to_dict()
                current_balance = user_data_tx.get('pointsBalance', 0)
                
                if current_balance < total_price:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient points balance. You have {current_balance} points, but need {total_price} points to draw {count} cards."
                    )
                
                # Update user stats with points deduction
                tx.update(user_ref, update_data)
            
            # Execute the transaction
            txn = db_client.transaction()
            await deduct_points_txn(txn)

            logger.info(
                f"Incremented total_drawn and totalPointsSpent for user '{user_id}' by pack price ({pack_price}) * number of cards drawn ({len(drawn_cards)}) = {total_price}")
            logger.info(
                f"Deducted {total_price} points from user '{user_id}' balance. New balance: {user_points_balance - total_price}")

            # Update weekly_spent collection (skip for challenger1 to challenger100 users)
            # Check if user_id matches challenger pattern (challenger1 to challenger100)
            is_challenger = False
            if user_id.startswith('challenger'):
                try:
                    # Extract the number part after 'challenger'
                    challenger_suffix = user_id[10:]
                    if challenger_suffix.isdigit():
                        challenger_num = int(challenger_suffix)
                        if 1 <= challenger_num <= 100:
                            is_challenger = True
                            logger.warning(f"CHALLENGER DETECTED: Skipping weekly_spent update for user {user_id} (number: {challenger_num})")
                        else:
                            logger.info(f"Challenger user {user_id} with number {challenger_num} is outside range 1-100, will update weekly_spent")
                    else:
                        logger.info(f"User {user_id} starts with 'challenger' but suffix '{challenger_suffix}' is not a digit, will update weekly_spent")
                except Exception as e:
                    logger.error(f"Error parsing challenger user_id {user_id}: {e}, will update weekly_spent")
            
            if not is_challenger:
                try:
                    # Get the current week's start date (Monday) using Eastern timezone
                    from zoneinfo import ZoneInfo
                    eastern_tz = ZoneInfo("America/New_York")
                    today = datetime.now(eastern_tz)
                    start_of_week = today - timedelta(days=today.weekday())
                    week_id = start_of_week.strftime("%Y-%m-%d")

                    # Reference to the weekly_spent collection and this week's document
                    weekly_spent_ref = db_client.collection('weekly_spent').document('weekly_spent').collection(
                        week_id).document(user_id)
                    weekly_doc = await weekly_spent_ref.get()

                    if weekly_doc.exists:
                        # Update existing document
                        await weekly_spent_ref.update({
                            "spent": Increment(total_price),
                            "displayName": user_data.get('displayName', user_id),
                            "avatar": user_data.get('avatar', ''),
                            "updatedAt": SERVER_TIMESTAMP
                        })
                    else:
                        # Create new document
                        await weekly_spent_ref.set({
                            "spent": total_price,
                            "displayName": user_data.get('displayName', user_id),
                            "avatar": user_data.get('avatar', ''),
                            "updatedAt": SERVER_TIMESTAMP
                        })
                    logger.info(f"Updated weekly_spent for user '{user_id}' with {total_price} points")
                except Exception as e:
                    logger.error(f"Failed to update weekly_spent for user '{user_id}': {e}")
                    # Continue even if updating weekly_spent fails
        except Exception as e:
            logger.error(f"Failed to increment total_drawn and totalPointsSpent for user '{user_id}': {e}")
            # Continue even if updating total_drawn and totalPointsSpent fails

        # Add provably fair information to the response (once for the entire draw)
        provably_fair_info = {
            "server_seed_hash": server_seed_hash,
            "server_seed": server_seed,  # Include actual server seed for verification
            "client_seed": client_seed,
            "nonce": nonce,
            "random_hash": random_hash,  # Include the computed random hash
            "opening_id": opening_id
        }

        # Calculate and update user's level after drawing cards
        try:
            await calculate_and_update_level(user_id, db_client)
            logger.info(f"Updated level for user '{user_id}' after drawing cards")
        except Exception as e:
            logger.error(f"Failed to update level for user '{user_id}': {e}")
            # Continue even if updating level fails

        # Add each drawn card to the user's collection
        for card_data in cards_to_add:
            try:
                await add_card_to_user(
                    user_id=user_id,
                    card_reference=card_data['card_reference'],
                    db_client=db_client,
                    collection_metadata_id=collection_id
                )
                logger.info(f"Added card {card_data['card_id']} to user {user_id}'s collection")
            except Exception as e:
                logger.error(f"Failed to add card {card_data['card_id']} to user {user_id}: {e}")
                # Continue with other cards even if one fails

        # Add selected color cards (purple, orange, red) to top_hits
        for card in drawn_cards:
            card_color = str(card.get('color', '')).lower()
            if card_color in {'purple', 'orange', 'red'}:
                try:
                    # Get user display name
                    display_name = user_data.get('displayName', user_id)
                    
                    # Call add_to_top_hits
                    await add_to_top_hits(
                        user_id=user_id,
                        display_name=display_name,
                        card_reference=card.get('card_reference'),
                        db_client=db_client,
                        pack_id=pack_id,
                        collection_id=collection_id
                    )
                    logger.info(f"Added card {card.get('id')} with color {card_color} to top_hits for user {user_id}")
                except Exception as e:
                    logger.error(f"Failed to add card {card.get('id')} to top_hits: {e}")
                    # Continue even if adding to top_hits fails

        return {
            "cards": drawn_cards,
            "provably_fair_info": provably_fair_info
        }
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(
            f"Error drawing multiple cards from pack '{pack_id}' in collection '{collection_id}' for user '{user_id}': {e}",
            exc_info=True)
        raise HTTPException(status_code=500,
                            detail=f"Failed to draw multiple cards from pack '{pack_id}' in collection '{collection_id}': {str(e)}")


async def draw_multiple_cards_from_pack_optimized(
    collection_id: str, 
    pack_id: str, 
    user_id: str, 
    db_client: AsyncClient,
    count: int = 5
) -> dict:
    """
    Optimized version of draw_multiple_cards_from_pack with improved performance.
    
    Performance improvements:
    1. Eliminates duplicate user fetch
    2. Uses batch operations for card reads
    3. Parallelizes independent operations using asyncio.gather
    4. Batches card additions to user's collection
    5. Reduces redundant data fetching
    
    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to draw from
        user_id: The ID of the user
        db_client: Firestore client
        count: The number of cards to draw (default: 5, should be 1, 3 or 5)
    
    Returns:
        A dictionary containing the drawn cards and provably fair info
    
    Raises:
        HTTPException: If there's an error drawing the cards
    """
    import asyncio
    from collections import defaultdict
    
    try:
        # Validate count parameter
        if count not in [1, 3, 5]:
            logger.error(f"Invalid count parameter: {count}. Must be 1, 3 or 5.")
            raise HTTPException(status_code=400, detail=f"Invalid count parameter: {count}. Must be 1, 3 or 5.")

        logger.info(f"Drawing {count} cards from pack '{pack_id}' in collection '{collection_id}' for user '{user_id}'")

        # Parallel fetch: user and pack data
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
        
        user_doc, pack_snap = await asyncio.gather(
            user_ref.get(),
            pack_ref.get()
        )
        
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id} in collection {collection_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")

        # Get user data (only once!)
        user_data = user_doc.to_dict()
        user_points_balance = user_data.get('pointsBalance', 0)
        client_seed = user_data.get('clientSeed')

        # Get pack data
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})
        pack_price = pack_data.get('price', 0)
        total_price = pack_price * count

        # Check points balance (preliminary check - will be rechecked in transaction)
        if user_points_balance < total_price:
            logger.error(f"User '{user_id}' has insufficient points balance ({user_points_balance}) to draw {count} cards (cost: {total_price})")
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient points balance. You have {user_points_balance} points, but need {total_price} points to draw {count} cards."
            )

        if not cards_map:
            logger.error(f"No cards found in pack '{pack_id}' in collection '{collection_id}'")
            raise HTTPException(status_code=404, detail=f"No cards found in pack '{pack_id}' in collection '{collection_id}'")

        # Get all probabilities from the cards map
        card_ids = list(cards_map.keys())
        probabilities = list(cards_map.values())

        # Atomically read and increment nonce counter to prevent race condition
        @firestore.async_transactional
        async def get_and_update_nonce(tx: firestore.AsyncTransaction):
            user_doc_tx = await user_ref.get(transaction=tx)
            if not user_doc_tx.exists:
                raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            user_data_tx = user_doc_tx.to_dict()
            old_nonce = user_data_tx.get('nonceCounter', 0)
            nonce = old_nonce + 1
            tx.update(user_ref, {'nonceCounter': firestore.Increment(count)})
            return nonce

        # Execute the transaction and get the nonce
        txn = db_client.transaction()
        nonce = await get_and_update_nonce(txn)
        logger.info(f"Atomically retrieved and updated nonce counter for user '{user_id}', nonce: {nonce}")

        # Provably fair random selection - generate individual seed per card
        server_seed = secrets.token_hex(32)
        server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
        
        chosen_card_ids = []
        random_hashes = []
        
        # Draw each card with its own nonce for proper provably fair verification
        for i in range(count):
            current_nonce = nonce + i
            payload = f"{client_seed}{current_nonce}".encode()
            random_hash = hmac.new(server_seed.encode(), payload, hashlib.sha256).hexdigest()
            random_hashes.append(random_hash)
            
            # Use a local Random instance to avoid affecting global random state
            rng = random.Random(int(random_hash, 16))
            chosen_card_id = rng.choices(card_ids, weights=probabilities, k=1)[0]
            chosen_card_ids.append(chosen_card_id)
            
        nonce_end = nonce + count - 1
        logger.info(f"Deterministically selected {count} cards from pack '{pack_id}' using nonces {nonce}-{nonce_end}: {chosen_card_ids}")

        # Insert SQL records (non-blocking)
        opening_id = None
        try:
            with db_connection() as conn:
                cursor = conn.cursor()
                # Store the pack name (fallback to pack_id if missing) for pull history readability
                pack_name = pack_data.get('name', pack_id)
                
                # Import json for JSONB storage
                import json
                
                cursor.execute(
                    """
                    INSERT INTO pack_openings (user_id, pack_type, pack_count, price_points,
                                               client_seed, nonce, nonce_end, server_seed_hash, server_seed, 
                                               random_hash, random_hashes)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id
                    """,
                    (user_id, pack_name, count, total_price,
                     client_seed, nonce, nonce_end, server_seed_hash, server_seed, 
                     random_hashes[0], json.dumps(random_hashes))  # Store first hash in random_hash for backward compat
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

        # Get all unique card documents
        unique_card_ids = list(set(chosen_card_ids))
        card_doc_map = {}
        
        # Fetch each unique card document
        for card_id in unique_card_ids:
            card_ref = pack_ref.collection('cards').document(card_id)
            card_doc = await card_ref.get()
            if card_doc.exists:
                card_doc_map[card_id] = card_doc
        
        # Process cards and prepare batch operations
        cards_to_add = []
        drawn_cards = []
        high_rarity_cards = []
        processed_urls = {}
        
        # Helper function for reference conversion
        def convert_ref_to_string(ref):
            if hasattr(ref, 'path'):
                return ref.path
            elif hasattr(ref, '_document_path'):
                return ref._document_path
            elif not isinstance(ref, str):
                return str(ref)
            return ref
        
        # Process all chosen cards (including duplicates)
        for index, card_id in enumerate(chosen_card_ids, 1):
            card_doc = card_doc_map.get(card_id)
            if not card_doc:
                logger.error(f"Card '{card_id}' not found in pack '{pack_id}' in collection '{collection_id}'")
                continue
                
            card_data = card_doc.to_dict()
            
            # Process card reference
            card_reference = convert_ref_to_string(card_data.get('card_reference', ''))
            if card_reference and card_reference.startswith('/'):
                card_reference = card_reference[1:]
                
            if not card_reference:
                logger.warning(f"Card {card_id} has no card_reference")
                continue
            
            # Prepare card data
            card_info = {
                'card_reference': card_reference,
                'collection_id': collection_id,
                'card_id': card_id
            }
            cards_to_add.append(card_info)
            
            # Process image URL (cache signed URLs)
            image_url = card_data.get('image_url', '')
            if image_url:
                card_cache_key = f"{card_id}_{image_url}"
                if card_cache_key not in processed_urls:
                    # R2 URLs are public, no need to sign them
                    try:
                        valid_url = image_url
                        processed_urls[card_cache_key] = valid_url
                    except Exception as e:
                        logger.error(f"Failed to get valid URL for {image_url}: {e}")
                        processed_urls[card_cache_key] = image_url
                image_url = processed_urls[card_cache_key]
            
            # Create drawn card info
            drawn_card = {
                'id': card_id,
                'collection_id': collection_id,
                'card_reference': card_reference,
                'image_url': image_url,
                'card_name': card_data.get('card_name', ''),
                'point_worth': card_data.get('point_worth', 0),
                'quantity': card_data.get('quantity', 0),
                'rarity': card_data.get('rarity', 0),
                'num_draw': index,
                'color': card_data.get('color', 'white')
            }
            drawn_cards.append(drawn_card)
            
            # Track cards by color for top_hits (purple, orange, red)
            card_color = str(drawn_card.get('color', '')).lower()
            if card_color in {'purple', 'orange', 'red'}:
                high_rarity_cards.append(drawn_card)

        if not cards_to_add:
            raise HTTPException(status_code=404, detail=f"No valid cards found in pack '{pack_id}' in collection '{collection_id}'")

        # Prepare all updates
        point_threshold_counts = defaultdict(int)
        thresholds = [2000, 5000, 10000, 30000]
        
        for card in drawn_cards:
            point_worth = card.get('point_worth', 0)
            for threshold in thresholds:
                if point_worth >= threshold:
                    field_name = f"total_drawn_{threshold}"
                    point_threshold_counts[field_name] += 1

        # Prepare user update data
        update_data = {
            "total_drawn": Increment(total_price),
            "totalPointsSpent": Increment(total_price),
            "pointsBalance": Increment(-total_price)
        }
        for field_name, count in point_threshold_counts.items():
            update_data[field_name] = Increment(count)

        # Handle expensive pack tracking (price > 200)
        if pack_price > 200:
            current_time = datetime.now()
            current_date = current_time.date()
            
            # Get current expensive pack tracking data from user
            last_expensive_draw_time = user_data.get('last_expensive_pack_draw_time')
            consecutive_days = user_data.get('consecutive_expensive_pack_days', 0)
            total_draws = user_data.get('total_expensive_pack_draws', 0)
            
            # Check if this is a new day since last expensive draw
            is_new_day = True
            if last_expensive_draw_time:
                if hasattr(last_expensive_draw_time, 'date'):
                    # It's a datetime object
                    last_draw_date = last_expensive_draw_time.date()
                else:
                    # It's a Firestore timestamp, convert to local server time
                    last_draw_date = last_expensive_draw_time.date()
                
                is_new_day = current_date > last_draw_date
                
                # Check if consecutive (yesterday or today)
                days_diff = (current_date - last_draw_date).days
                if days_diff == 0:
                    # Same day - don't increment counters
                    consecutive_days = consecutive_days  # Keep same
                elif days_diff == 1:
                    # Next day - increment consecutive days
                    consecutive_days += 1
                else:
                    # Gap in days - reset consecutive to 1
                    consecutive_days = 1
            else:
                # First time drawing expensive pack
                consecutive_days = 1
            
            # Only update fields if it's a new day
            if is_new_day:
                update_data["last_expensive_pack_draw_time"] = current_time
                update_data["consecutive_expensive_pack_days"] = consecutive_days
                update_data["total_expensive_pack_draws"] = Increment(1)
                logger.info(f"Expensive pack draw (price: {pack_price}) - New day detected. Consecutive days: {consecutive_days}, Total draws will be incremented")
            else:
                logger.info(f"Expensive pack draw (price: {pack_price}) - Same day as last draw. No fields updated")

        # Parallel operations
        async def update_user_stats():
            # Use a transaction to ensure atomic points deduction
            @firestore.async_transactional
            async def deduct_points_txn(tx: firestore.AsyncTransaction):
                # Re-check balance inside transaction to prevent race condition
                user_doc_tx = await user_ref.get(transaction=tx)
                if not user_doc_tx.exists:
                    raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
                
                user_data_tx = user_doc_tx.to_dict()
                current_balance = user_data_tx.get('pointsBalance', 0)
                
                if current_balance < total_price:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Insufficient points balance. You have {current_balance} points, but need {total_price} points to draw {count} cards."
                    )
                
                # Update user stats with points deduction
                tx.update(user_ref, update_data)
            
            # Execute the transaction
            txn = db_client.transaction()
            await deduct_points_txn(txn)
            logger.info(f"Updated user '{user_id}' stats and deducted {total_price} points")

        async def update_pack_popularity():
            await pack_ref.update({"popularity": Increment(len(drawn_cards))})
            logger.info(f"Incremented popularity for pack '{pack_id}'")

        async def update_weekly_spent():
            # Skip weekly spending update for challenger1 to challenger100 users
            is_challenger = False
            if user_id.startswith('challenger'):
                try:
                    # Extract the number part after 'challenger'
                    challenger_suffix = user_id[10:]
                    if challenger_suffix.isdigit():
                        challenger_num = int(challenger_suffix)
                        if 1 <= challenger_num <= 100:
                            is_challenger = True
                            logger.warning(f"CHALLENGER DETECTED: Skipping weekly_spent update for user {user_id} (number: {challenger_num})")
                            return
                        else:
                            logger.info(f"Challenger user {user_id} with number {challenger_num} is outside range 1-100, will update weekly_spent")
                    else:
                        logger.info(f"User {user_id} starts with 'challenger' but suffix '{challenger_suffix}' is not a digit, will update weekly_spent")
                except Exception as e:
                    logger.error(f"Error parsing challenger user_id {user_id}: {e}, will update weekly_spent")
            
            try:
                from zoneinfo import ZoneInfo
                eastern_tz = ZoneInfo("America/New_York")
                today = datetime.now(eastern_tz)
                start_of_week = today - timedelta(days=today.weekday())
                week_id = start_of_week.strftime("%Y-%m-%d")
                
                weekly_spent_ref = db_client.collection('weekly_spent').document('weekly_spent').collection(week_id).document(user_id)
                weekly_doc = await weekly_spent_ref.get()
                
                if weekly_doc.exists:
                    await weekly_spent_ref.update({
                        "spent": Increment(total_price),
                        "displayName": user_data.get('displayName', user_id),
                        "avatar": user_data.get('avatar', ''),
                        "updatedAt": SERVER_TIMESTAMP
                    })
                else:
                    await weekly_spent_ref.set({
                        "spent": total_price,
                        "displayName": user_data.get('displayName', user_id),
                        "avatar": user_data.get('avatar', ''),
                        "updatedAt": SERVER_TIMESTAMP
                    })
                logger.info(f"Updated weekly_spent for user '{user_id}'")
            except Exception as e:
                logger.error(f"Failed to update weekly_spent: {e}")

        async def batch_add_cards():
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
            
            # Process each unique card using individual transactions for atomicity
            for card_ref, card_data in card_counts.items():
                card_info = card_data['info']
                quantity_to_add = card_data['count']
                collection_name, card_id = card_info['card_reference'].split('/')
                
                # Prepare references
                master_card_ref = db_client.collection(collection_name).document(card_id)
                user_card_ref = user_ref.collection('cards').document('cards').collection(collection_id).document(card_id)
                
                # Use a transaction for atomic updates
                @firestore.async_transactional
                async def add_single_card_transaction(transaction):
                    # Get master card data INSIDE transaction using correct pattern
                    master_card_snap = await master_card_ref.get(transaction=transaction)
                    
                    if not master_card_snap.exists:
                        logger.warning(f"Master card not found: {card_info['card_reference']}")
                        return
                        
                    master_card_data = master_card_snap.to_dict()
                    
                    # Check user's card INSIDE transaction using correct pattern
                    user_card_snap = await user_card_ref.get(transaction=transaction)
                    
                    # Check expiring card if needed (do all reads before writes)
                    # Only add to expiring if point_worth <= 500 and NOT used in fusion
                    point_worth = master_card_data.get("point_worth", 0)
                    used_in_fusion = master_card_data.get("used_in_fusion")
                    needs_expiring_card = point_worth <= 500 and not used_in_fusion
                    expiring_card_snap = None
                    if needs_expiring_card:
                        expiring_card_ref = db_client.collection('expiring_cards').document(f"{user_id}_{card_id}")
                        expiring_card_snap = await expiring_card_ref.get(transaction=transaction)
                    
                    # Now do all write operations after all reads are complete
                    # Update master card quantity
                    transaction.update(master_card_ref, {"quantity": firestore.Increment(-quantity_to_add)})
                    
                    now = datetime.now()
                    if user_card_snap.exists:
                        # Update existing card - use atomic increment
                        updates = {
                            "quantity": firestore.Increment(quantity_to_add),
                            "point_worth": master_card_data.get("point_worth", 0),
                            "condition": master_card_data.get("condition", "near_mint"),
                            "buybackexpiresAt": now + timedelta(days=settings.card_buyback_expire_days),
                            "used_in_fusion": master_card_data.get("used_in_fusion") if master_card_data.get("used_in_fusion") is not None else False
                        }
                        if needs_expiring_card:
                            updates["expireAt"] = now + timedelta(days=settings.card_expire_days)
                            updates["isExpiring"] = True
                        transaction.update(user_card_ref, updates)
                    else:
                        # Create new card entry
                        user_card_data = {
                            "card_reference": card_info['card_reference'],
                            "card_name": master_card_data.get("card_name", ""),
                            "date_got": firestore.SERVER_TIMESTAMP,
                            "id": card_id,
                            "image_url": master_card_data.get("image_url", ""),
                            "point_worth": master_card_data.get("point_worth", 0),
                            "quantity": quantity_to_add,
                            "rarity": master_card_data.get("rarity", 1),
                            "condition": master_card_data.get("condition", "near_mint"),
                            "buybackexpiresAt": now + timedelta(days=settings.card_buyback_expire_days),
                            "used_in_fusion": master_card_data.get("used_in_fusion") if master_card_data.get("used_in_fusion") is not None else False
                        }
                        
                        if needs_expiring_card:
                            user_card_data["expireAt"] = now + timedelta(days=settings.card_expire_days)
                            user_card_data["isExpiring"] = True
                        
                        transaction.set(user_card_ref, user_card_data)
                    
                    # Handle expiring cards collection if needed
                    if needs_expiring_card:
                        card_path = f"users/{user_id}/cards/cards/{collection_id}/{card_id}"
                        
                        if expiring_card_snap and expiring_card_snap.exists:
                            transaction.update(expiring_card_ref, {
                                "quantity": firestore.Increment(quantity_to_add),
                                "expiresAt": now + timedelta(days=settings.card_expire_days)
                            })
                        else:
                            transaction.set(expiring_card_ref, {
                                "userId": user_id,
                                "cardReference": card_path,
                                "expiresAt": now + timedelta(days=settings.card_expire_days),
                                "quantity": quantity_to_add
                            })
                    
                    logger.info(f"Added {quantity_to_add}x card {card_id} to user {user_id}'s collection")
                
                # Execute transaction for this card
                try:
                    transaction = db_client.transaction()
                    await add_single_card_transaction(transaction)
                except Exception as e:
                    logger.error(f"Failed to add card {card_id}: {e}")
                    # Continue with other cards even if one fails

        async def add_high_rarity_to_top_hits():
            for card in high_rarity_cards:
                try:
                    display_name = user_data.get('displayName', user_id)
                    await add_to_top_hits(
                        user_id=user_id,
                        display_name=display_name,
                        card_reference=card.get('card_reference'),
                        db_client=db_client,
                        pack_id=pack_id,
                        collection_id=collection_id
                    )
                    logger.info(f"Added high rarity card {card.get('id')} to top_hits")
                except Exception as e:
                    logger.error(f"Failed to add card to top_hits: {e}")

        # Execute critical operations first (user stats and card additions)
        # These must succeed together
        try:
            await update_user_stats()
            await batch_add_cards()
        except Exception as e:
            logger.error(f"Critical operation failed: {e}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to complete card drawing transaction: {str(e)}"
            )
        
        # Execute non-critical operations in parallel (failures won't affect the core transaction)
        non_critical_tasks = [
            update_pack_popularity(),
            update_weekly_spent(),
            calculate_and_update_level(user_id, db_client),
            add_high_rarity_to_top_hits()
        ]
        
        # Run non-critical tasks but don't fail the whole operation if they fail
        results = await asyncio.gather(*non_critical_tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                task_names = ['pack_popularity', 'weekly_spent', 'level_calculation', 'top_hits']
                logger.error(f"Non-critical task {task_names[i]} failed: {result}")

        # Prepare response with detailed provably fair info
        provably_fair_info = {
            "server_seed_hash": server_seed_hash,
            "server_seed": server_seed,
            "client_seed": client_seed,
            "nonce_start": nonce,
            "nonce_end": nonce_end,
            "random_hashes": random_hashes,  # Array of hashes, one per card
            "opening_id": opening_id,
            # Backward compatibility
            "nonce": nonce,
            "random_hash": random_hashes[0]
        }

        return {
            "cards": drawn_cards,
            "provably_fair_info": provably_fair_info
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(
            f"Error drawing multiple cards from pack '{pack_id}' in collection '{collection_id}' for user '{user_id}': {e}",
            exc_info=True)
        raise HTTPException(status_code=500,
                            detail=f"Failed to draw multiple cards from pack '{pack_id}' in collection '{collection_id}': {str(e)}")


async def demo_draw_multiple_cards_from_pack(
    collection_id: str, 
    pack_id: str, 
    db_client: AsyncClient,
    count: int = 5
) -> dict:
    """
    Demo version of draw_multiple_cards_from_pack that doesn't deduct points or modify the database.
    
    This function:
    1. Gets all probabilities from cards.values() in the pack
    2. Randomly chooses multiple card ids based on these probabilities
    3. Retrieves the card information from the cards subcollection for each card
    4. Returns the list of drawn cards WITHOUT any database modifications
    
    Args:
        collection_id: The ID of the collection containing the pack
        pack_id: The ID of the pack to draw from
        db_client: Firestore client
        count: The number of cards to draw (default: 5, should be 1, 3 or 5)
    
    Returns:
        A dictionary containing the drawn cards and provably fair info (simulated)
    
    Raises:
        HTTPException: If there's an error during the demo draw
    """
    try:
        # Validate count parameter
        if count not in [1, 3, 5]:
            logger.error(f"Invalid count parameter: {count}. Must be 1, 3 or 5.")
            raise HTTPException(status_code=400, detail=f"Invalid count parameter: {count}. Must be 1, 3 or 5.")
        
        logger.info(f"Demo drawing {count} cards from pack '{pack_id}' in collection '{collection_id}'")
        
        # Construct the reference to the pack document
        pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
        
        # Check if pack exists
        pack_snap = await pack_ref.get()
        if not pack_snap.exists:
            logger.error(f"Pack not found: {pack_id} in collection {collection_id}")
            raise HTTPException(status_code=404, detail=f"Pack '{pack_id}' not found in collection '{collection_id}'")
        
        # Get the cards map from the pack document
        pack_data = pack_snap.to_dict()
        cards_map = pack_data.get('cards', {})
        
        if not cards_map:
            logger.error(f"No cards found in pack '{pack_id}' in collection '{collection_id}'")
            raise HTTPException(status_code=404, detail=f"No cards found in pack '{pack_id}' in collection '{collection_id}'")
        
        # Get all probabilities from the cards map
        card_ids = list(cards_map.keys())
        probabilities = list(cards_map.values())
        
        # Check if there are enough cards in the pack
        if len(card_ids) < count:
            logger.warning(
                f"Not enough cards in pack '{pack_id}' in collection '{collection_id}'. Requested {count} but only {len(card_ids)} available.")
        
        # Generate demo seed and hashes (no user-specific data needed)
        demo_client_seed = "DEMO_CLIENT_SEED"
        demo_nonce = random.randint(1, 100000)  # Random nonce for demo
        
        # Generate demo server seed and hashes
        server_seed = secrets.token_hex(32)
        server_seed_hash = hashlib.sha256(server_seed.encode()).hexdigest()
        payload = f"{demo_client_seed}{demo_nonce}".encode()
        random_hash = hmac.new(server_seed.encode(), payload, hashlib.sha256).hexdigest()
        
        logger.info(f"Demo: Generated server seed with hash '{server_seed_hash}' and random hash '{random_hash}'")
        
        # Perform deterministic draw using Python RNG seeded by random_hash
        random.seed(int(random_hash, 16))
        chosen_card_ids = random.choices(card_ids, weights=probabilities, k=count)
        logger.info(f"Demo: Selected {count} cards from pack '{pack_id}' in collection '{collection_id}'")
        
        # Helper function to convert Firestore references to strings
        def convert_references_to_strings(data):
            if isinstance(data, dict):
                result = {}
                for key, value in data.items():
                    if hasattr(value, 'path') and callable(getattr(value, 'path', None)):
                        result[key] = str(value.path)
                    elif hasattr(value, '_document_path'):
                        result[key] = str(value._document_path)
                    elif str(type(value)).find('google.cloud.firestore_v1.async_document.AsyncDocumentReference') != -1:
                        result[key] = str(value)
                    elif isinstance(value, (dict, list)):
                        result[key] = convert_references_to_strings(value)
                    else:
                        result[key] = value
                return result
            elif isinstance(data, list):
                return [convert_references_to_strings(item) for item in data]
            else:
                if hasattr(data, 'path') and callable(getattr(data, 'path', None)):
                    return str(data.path)
                elif hasattr(data, '_document_path'):
                    return str(data._document_path)
                elif str(type(data)).find('google.cloud.firestore_v1.async_document.AsyncDocumentReference') != -1:
                    return str(data)
                return data
        
        # Create a list of drawn cards with detailed information
        drawn_cards = []
        processed_urls = {}  # Cache to avoid regenerating the same URL multiple times
        
        for index, chosen_card_id in enumerate(chosen_card_ids, 1):
            # Get the card information from the cards subcollection
            card_ref = pack_ref.collection('cards').document(chosen_card_id)
            card_snap = await card_ref.get()
            
            if not card_snap.exists:
                logger.error(f"Card '{chosen_card_id}' not found in pack '{pack_id}' in collection '{collection_id}'")
                continue
            
            card_dict = card_snap.to_dict()
            
            # Convert any Firestore references to strings
            card_dict = convert_references_to_strings(card_dict)
            
            # Get card reference from the card data (should be converted to string already)
            card_reference = card_dict.get('card_reference', '')
            
            # Remove leading slash if present (card_reference might be "/collection/card_id")
            if card_reference and card_reference.startswith('/'):
                card_reference = card_reference[1:]
            
            # Check and cache signed URL for the card image
            image_url = card_dict.get('image_url', '')
            if image_url:
                card_cache_key = f"{chosen_card_id}_{image_url}"
                if card_cache_key in processed_urls:
                    card_dict['image_url'] = processed_urls[card_cache_key]
                else:
                    try:
                        # R2 URLs are public; no signing required. Just reuse the URL.
                        signed_url = image_url
                        card_dict['image_url'] = signed_url
                        processed_urls[card_cache_key] = signed_url
                    except Exception as e:
                        logger.error(f"Failed to process image URL {image_url}: {e}")
                        processed_urls[card_cache_key] = image_url
            
            # Create a simplified card dictionary
            simplified_card = {
                'id': chosen_card_id,
                'collection_id': collection_id,
                'card_reference': card_reference,
                'image_url': card_dict.get('image_url', ''),
                'card_name': card_dict.get('card_name', ''),
                'point_worth': card_dict.get('point_worth', 0),
                'quantity': card_dict.get('quantity', 0),
                'rarity': card_dict.get('rarity', 0),
                'num_draw': index,
                'color': card_dict.get('color', 'white')
            }
            
            drawn_cards.append(simplified_card)
        
        logger.info(f"Demo: Successfully drew {len(drawn_cards)} cards from pack '{pack_id}' in collection '{collection_id}'")
        
        # Simulated provably fair information
        provably_fair_info = {
            "server_seed_hash": server_seed_hash,
            "server_seed": server_seed,
            "client_seed": demo_client_seed,
            "nonce": demo_nonce,
            "random_hash": random_hash,
            "opening_id": None,  # No real opening ID for demo
            "is_demo": True  # Flag to indicate this is a demo draw
        }
        
        # Return the same format as the real draw function
        return {
            "cards": drawn_cards,
            "provably_fair_info": provably_fair_info,
            "demo_mode": True,
            "message": "This is a demo draw. No points were deducted and no cards were added to your collection."
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(
            f"Error in demo draw from pack '{pack_id}' in collection '{collection_id}': {e}",
            exc_info=True)
        raise HTTPException(status_code=500,
                            detail=f"Failed to perform demo draw from pack '{pack_id}' in collection '{collection_id}': {str(e)}")


async def draw_daily_free_box(user_id: str, db_client: AsyncClient) -> dict:
    """
    Draw a daily free box for a user.
    
    This function:
    1. Checks if the user has already claimed their daily free box today (using US Central time)
    2. Draws a card based on the specified probabilities for the daily free box pack
    3. Adds the card to the user's collection
    4. Creates a claim document to prevent duplicate claims
    
    Args:
        user_id: The ID of the user claiming the daily free box
        db_client: Firestore client
    
    Returns:
        A dictionary with success message and drawn card data
    
    Raises:
        HTTPException: If user has already claimed today or if there's an error
    """
    pack_id = "8e03ce64-8111-45f6-aed4-d516c1b00755"
    collection_id = "pokemon"
    
    # Check if the user has already claimed the daily free box today (using Eastern time)
    eastern_tz = ZoneInfo("America/New_York")
    today_eastern_dt = datetime.now(eastern_tz)
    today_eastern = today_eastern_dt.strftime('%Y%m%d')
    claim_doc_id = f"{user_id}_{today_eastern}"
    claim_ref = db_client.collection("dailyDrawClaims").document(claim_doc_id)
    
    claim_doc = await claim_ref.get()
    if claim_doc.exists:
        raise HTTPException(status_code=403, detail="You have already claimed your daily free box today.")

    # Define the cards and their probabilities
    cards = {
        "4ee7aa39-5746-4080-82d5-ba7ce9aa8a9e": 0.4,
        "d8f81843-1e49-465e-b8d7-a49d1651dcde": 0.5,
        "ebaa87c8-c5c8-449e-9b92-f160871fc565": 0.1
    }
    
    card_ids = list(cards.keys())
    probabilities = list(cards.values())
    
    # Draw a card based on probabilities
    drawn_card_id = random.choices(card_ids, weights=probabilities, k=1)[0]
    logger.info(f"Drew card {drawn_card_id} for user {user_id} from daily free box")
    
    # Get card details from the pack's subcollection
    pack_ref = db_client.collection('packs').document(collection_id).collection(collection_id).document(pack_id)
    card_ref = pack_ref.collection('cards').document(drawn_card_id)
    card_snap = await card_ref.get()

    if not card_snap.exists:
        raise HTTPException(status_code=404, detail=f"Card '{drawn_card_id}' not found.")

    card_data = card_snap.to_dict()
    card_reference = card_data.get('card_reference')
    
    # Convert Firestore reference to string if needed
    if hasattr(card_reference, 'path'):
        card_reference = card_reference.path
    elif hasattr(card_reference, '_document_path'):
        card_reference = card_reference._document_path
    elif not isinstance(card_reference, str):
        card_reference = str(card_reference)
    
    # Remove leading slash if present
    if card_reference and card_reference.startswith('/'):
        card_reference = card_reference[1:]
    
    # Update the card_data with the processed card_reference
    card_data['card_reference'] = card_reference

    # Add points to user's balance instead of adding the card
    points_to_add = card_data.get('point_worth', 0)
    if points_to_add > 0:
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        await user_ref.update({"pointsBalance": Increment(points_to_add)})
        logger.info(f"Added {points_to_add} points to user {user_id} from daily free box")
    else:
        logger.warning(f"Card {drawn_card_id} has no point_worth value, no points added")
    
    # Create the claim document in Firestore with 2-day expiration
    # Calculate expiration time (2 days from now in Eastern timezone)
    expiration_time = today_eastern_dt + timedelta(days=2)
    
    await claim_ref.set({
        "userId": user_id,
        "rewardId": pack_id,
        "claimedAt": SERVER_TIMESTAMP,
        "expiresAt": expiration_time
    })

    # Generate signed URL for the card image if it exists
    image_url = card_data.get('image_url', '')
    if image_url:
        try:
            # R2 URLs are public, no need to sign them
            signed_url = image_url
            card_data['image_url'] = signed_url
            logger.info(f"Generated signed URL for daily free box card image: {signed_url}")
        except Exception as e:
            logger.warning(f"Failed to generate signed URL for card image {image_url}: {e}")
    
    return {
        "message": "Successfully claimed daily free box.",
        "card": card_data
    }


async def get_user_cards(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "date_got",
    sort_order: str = "desc",
    search_query: str | None = None,
    subcollection_name: str | None = None
) -> UserCardsResponse:
    """
    Get all cards for a user, separated by subcollection with pagination.

    Args:
        user_id: The ID of the user to get cards for
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "date_got")
        sort_order: The sort order ("asc" or "desc", default: "desc")
        search_query: Optional search query to filter cards by name
        subcollection_name: Optional subcollection name to filter by

    Returns:
        A UserCardsResponse with a list of UserCardListResponse objects, one for each subcollection

    Raises:
        HTTPException: If there's an error getting the cards
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # If a specific subcollection is requested, go directly to it
        if subcollection_name:
            logger.info(f"Direct access to subcollection {subcollection_name} for user {user_id}")
            # Try to access the subcollection directly
            subcoll_response = await get_user_subcollection_cards(
                user_id=user_id,
                subcollection_name=subcollection_name,
                db_client=db_client,
                page=page,
                per_page=per_page,
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
            return UserCardsResponse(subcollections=[subcoll_response])

        # Get the 'cards' document in the user's 'cards' collection
        cards_doc_ref = user_ref.collection('cards').document('cards')
        cards_doc = await cards_doc_ref.get()

        # Check if there are any cards directly under the 'cards' collection
        cards_collection_ref = user_ref.collection('cards')
        cards_query = cards_collection_ref.limit(1)
        cards_docs = await cards_query.get()
        has_direct_cards = len(cards_docs) > 0

        # Check if there are any subcollections under the 'cards' document even if it doesn't exist
        # This is a special case where the document might not exist but subcollections do
        collections = []
        async for collection in cards_doc_ref.collections():
            collections.append(collection)
        has_subcollections = len(collections) > 0

        logger.info(f"Checking cards for user {user_id}: 'cards' document exists: {cards_doc.exists}, direct cards exist: {has_direct_cards}, subcollections exist: {has_subcollections}")

        if not cards_doc.exists and not has_direct_cards and not has_subcollections:
            # If the 'cards' document doesn't exist, there are no direct cards, and no subcollections, the user has no cards
            logger.info(f"User {user_id} has no cards")
            return UserCardsResponse(subcollections=[])

        # Get all subcollections under the 'cards' document
        subcollections = []

        # Get subcollections regardless of whether the 'cards' document exists
        # We already checked for subcollections earlier
        all_subcollections = [collection.id for collection in collections]

        if subcollection_name:
            # If a specific subcollection is requested, check if it exists
            logger.info(f"Available subcollections for user {user_id}: {all_subcollections}")

            if subcollection_name in all_subcollections:
                # If the requested subcollection exists, use only that one
                logger.info(f"Subcollection {subcollection_name} found for user {user_id}")
                subcollections = [subcollection_name]
            else:
                # If the requested subcollection doesn't exist, return empty response
                logger.warning(f"Subcollection {subcollection_name} not found for user {user_id}. Available subcollections: {all_subcollections}")
                return UserCardsResponse(subcollections=[])
        else:
            # Otherwise, use all subcollections
            subcollections = all_subcollections

        if not cards_doc.exists and has_subcollections:
            logger.info(f"'cards' document doesn't exist for user {user_id}, but subcollections exist: {subcollections}")

        if not subcollections:
            logger.info(f"User {user_id} has no card subcollections")
            return UserCardsResponse(subcollections=[])

        # For each subcollection, get the cards with pagination
        subcollection_responses = []
        for subcoll_name in subcollections:
            # Get cards from this subcollection with pagination
            subcoll_response = await get_user_subcollection_cards(
                user_id=user_id,
                subcollection_name=subcoll_name,
                db_client=db_client,
                page=page,
                per_page=per_page,
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
            subcollection_responses.append(subcoll_response)

        return UserCardsResponse(subcollections=subcollection_responses)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting cards for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get cards for user: {str(e)}")

async def get_user_subcollection_cards(
    user_id: str,
    subcollection_name: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "date_got",
    sort_order: str = "desc",
    search_query: str | None = None
) -> UserCardListResponse:
    """
    Get cards for a user from a specific subcollection with pagination.

    Args:
        user_id: The ID of the user to get cards for
        subcollection_name: The name of the subcollection to get cards from
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "date_got")
        sort_order: The sort order ("asc" or "desc", default: "desc")
        search_query: Optional search query to filter cards by name

    Returns:
        A UserCardListResponse with the cards, pagination info, and applied filters

    Raises:
        HTTPException: If there's an error getting the cards
    """
    try:
        # Get the subcollection reference
        subcoll_ref = db_client.collection(settings.firestore_collection_users).document(user_id) \
            .collection('cards').document('cards').collection(subcollection_name)

        # Create the base query
        query = subcoll_ref

        # Apply search query if provided
        if search_query and search_query.strip():
            stripped_search_query = search_query.strip()
            logger.info(f"Applying search filter for card_name: >='{stripped_search_query}' and <='{stripped_search_query}\uf8ff'")
            query = query.where("card_name", ">=", stripped_search_query)
            query = query.where("card_name", "<=", stripped_search_query + "\uf8ff")

        # Count total items matching the query
        count_agg_query = query.count()
        count_snapshot = await count_agg_query.get()
        total_items = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0

        if total_items == 0:
            logger.info(f"No cards found for user {user_id} in subcollection {subcollection_name}")
            return UserCardListResponse(
                subcollection_name=subcollection_name,
                cards=[],
                pagination=PaginationInfo(
                    total_items=0,
                    items_per_page=per_page,
                    current_page=page,
                    total_pages=0
                ),
                filters=AppliedFilters(sort_by=sort_by, sort_order=sort_order, search_query=search_query)
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

        if search_query and search_query.strip() and sort_by != "card_name":
            # If searching and sorting by a different field, ensure card_name is the first sort key
            logger.warning(f"Search query on 'card_name' is active while sorting by '{sort_by}'. Firestore requires ordering by 'card_name' first.")
            query_with_sort = query_with_filters.order_by("card_name").order_by(sort_by, direction=direction)
        else:
            query_with_sort = query_with_filters.order_by(sort_by, direction=direction)

        # Apply pagination
        current_page_query = max(1, page)
        per_page_query = max(1, per_page)
        offset = (current_page_query - 1) * per_page_query

        paginated_query = query_with_sort.limit(per_page_query).offset(offset)

        # Execute the query
        logger.info(f"Executing Firestore query for user {user_id}, subcollection {subcollection_name} with pagination and sorting")
        stream = paginated_query.stream()

        # Process the results
        cards_list = []
        processed_urls = {}  # Cache to avoid regenerating the same URL multiple times in this request
        
        async for doc in stream:
            try:
                card_data = doc.to_dict()
                if not card_data:  # Skip empty documents
                    logger.warning(f"Skipping empty document with ID: {doc.id} in subcollection {subcollection_name}")
                    continue

                # Ensure ID is part of the data
                if 'id' not in card_data:
                    card_data['id'] = doc.id

                # Generate and cache signed URL for the card image
                if 'image_url' in card_data and card_data['image_url']:
                    image_url = card_data['image_url']
                    # Check if we've already processed this image in this request
                    if image_url in processed_urls:
                        card_data['image_url'] = processed_urls[image_url]
                    else:
                        try:
                            # R2 URLs are public; no signing required. Just reuse the URL.
                            signed_url = image_url
                            card_data['image_url'] = signed_url
                            processed_urls[image_url] = signed_url
                            logger.debug(f"Using public image URL for card {doc.id}")
                        except Exception as sign_error:
                            logger.error(f"Failed to process image URL {image_url}: {sign_error}")
                            processed_urls[image_url] = image_url
                            # Keep the original URL if processing fails

                # Skip cards with quantity 0 or less
                if card_data.get('quantity', 0) <= 0:
                    logger.debug(f"Skipping card {doc.id} with quantity {card_data.get('quantity', 0)}")
                    continue
                    
                cards_list.append(UserCard(**card_data))
            except Exception as e:
                logger.error(f"Error processing document {doc.id} from subcollection {subcollection_name}: {e}", exc_info=True)
                # Skip this card and continue
                continue

        # Calculate total pages
        total_pages = math.ceil(total_items / per_page_query) if per_page_query > 0 else 0

        # Create pagination info
        pagination_info = PaginationInfo(
            total_items=total_items,
            items_per_page=per_page_query,
            current_page=current_page_query,
            total_pages=total_pages
        )

        # Create applied filters info
        applied_filters_info = AppliedFilters(
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )

        logger.info(f"Successfully fetched {len(cards_list)} cards for user {user_id} from subcollection {subcollection_name}")
        return UserCardListResponse(
            subcollection_name=subcollection_name,
            cards=cards_list,
            pagination=pagination_info,
            filters=applied_filters_info
        )
    except Exception as e:
        logger.error(f"Error getting cards for user {user_id} from subcollection {subcollection_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get cards from subcollection {subcollection_name}: {str(e)}")


async def get_user_fusion_eligible_cards(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "date_got",
    sort_order: str = "desc",
    search_query: str | None = None,
    subcollection_name: str | None = None
) -> UserCardsResponse:
    """
    Get all cards for a user that are eligible for random fusion (point_worth < 3000).

    Args:
        user_id: The ID of the user to get cards for
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "date_got")
        sort_order: The sort order ("asc" or "desc", default: "desc")
        search_query: Optional search query to filter cards by name
        subcollection_name: Optional subcollection name to filter by

    Returns:
        A UserCardsResponse with a list of UserCardListResponse objects, one for each subcollection,
        containing only cards with point_worth < 3000

    Raises:
        HTTPException: If there's an error getting the cards
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # If a specific subcollection is requested, go directly to it
        if subcollection_name:
            logger.info(f"Direct access to subcollection {subcollection_name} for fusion eligible cards for user {user_id}")
            # Try to access the subcollection directly
            subcoll_response = await get_user_subcollection_fusion_eligible_cards(
                user_id=user_id,
                subcollection_name=subcollection_name,
                db_client=db_client,
                page=page,
                per_page=per_page,
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
            return UserCardsResponse(subcollections=[subcoll_response])

        # Get the 'cards' document in the user's 'cards' collection
        cards_doc_ref = user_ref.collection('cards').document('cards')
        
        # Check if there are any subcollections under the 'cards' document
        collections = []
        async for collection in cards_doc_ref.collections():
            collections.append(collection)
        
        all_subcollections = [collection.id for collection in collections]

        if not all_subcollections:
            logger.info(f"User {user_id} has no card subcollections")
            return UserCardsResponse(subcollections=[])

        # For each subcollection, get the fusion eligible cards with pagination
        subcollection_responses = []
        for subcoll_name in all_subcollections:
            # Get cards from this subcollection with pagination
            subcoll_response = await get_user_subcollection_fusion_eligible_cards(
                user_id=user_id,
                subcollection_name=subcoll_name,
                db_client=db_client,
                page=page,
                per_page=per_page,
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
            subcollection_responses.append(subcoll_response)

        return UserCardsResponse(subcollections=subcollection_responses)
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting fusion eligible cards for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get fusion eligible cards for user: {str(e)}")


async def get_user_subcollection_fusion_eligible_cards(
    user_id: str,
    subcollection_name: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "date_got",
    sort_order: str = "desc",
    search_query: str | None = None
) -> UserCardListResponse:
    """
    Get cards eligible for fusion (point_worth < 3000) from a specific subcollection with pagination.

    Args:
        user_id: The ID of the user to get cards for
        subcollection_name: The name of the subcollection to get cards from
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "date_got")
        sort_order: The sort order ("asc" or "desc", default: "desc")
        search_query: Optional search query to filter cards by name

    Returns:
        A UserCardListResponse with the cards, pagination info, and applied filters

    Raises:
        HTTPException: If there's an error getting the cards
    """
    try:
        # Get the subcollection reference
        subcoll_ref = db_client.collection(settings.firestore_collection_users).document(user_id) \
            .collection('cards').document('cards').collection(subcollection_name)

        # Create the base query with point_worth filter
        query = subcoll_ref.where("point_worth", "<", 3000)

        # Apply search query if provided
        if search_query and search_query.strip():
            stripped_search_query = search_query.strip()
            logger.info(f"Applying search filter for card_name: >='{stripped_search_query}' and <='{stripped_search_query}\\uf8ff'")
            query = query.where("card_name", ">=", stripped_search_query)
            query = query.where("card_name", "<=", stripped_search_query + "\\uf8ff")

        # Count total items matching the query
        count_agg_query = query.count()
        count_snapshot = await count_agg_query.get()
        total_items = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0

        if total_items == 0:
            logger.info(f"No fusion eligible cards found for user {user_id} in subcollection {subcollection_name}")
            return UserCardListResponse(
                subcollection_name=subcollection_name,
                cards=[],
                pagination=PaginationInfo(
                    total_items=0,
                    items_per_page=per_page,
                    current_page=page,
                    total_pages=0
                ),
                filters=AppliedFilters(sort_by=sort_by, sort_order=sort_order, search_query=search_query)
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
        if search_query and search_query.strip() and sort_by != "card_name":
            # If searching and sorting by a different field, ensure card_name is the first sort key
            logger.warning(f"Search query on 'card_name' is active while sorting by '{sort_by}'. Firestore requires ordering by 'card_name' first.")
            query_with_sort = query.order_by("card_name").order_by(sort_by, direction=direction)
        else:
            query_with_sort = query.order_by(sort_by, direction=direction)

        # Apply pagination
        current_page_query = max(1, page)
        per_page_query = max(1, per_page)
        offset = (current_page_query - 1) * per_page_query

        paginated_query = query_with_sort.limit(per_page_query).offset(offset)

        # Execute the query
        logger.info(f"Executing Firestore query for fusion eligible cards for user {user_id}, subcollection {subcollection_name}")
        stream = paginated_query.stream()

        # Process the results
        cards_list = []
        processed_urls = {}  # Cache to avoid regenerating the same URL multiple times in this request
        
        async for doc in stream:
            try:
                card_data = doc.to_dict()
                if not card_data:  # Skip empty documents
                    logger.warning(f"Skipping empty document with ID: {doc.id} in subcollection {subcollection_name}")
                    continue

                # Ensure ID is part of the data
                if 'id' not in card_data:
                    card_data['id'] = doc.id

                # Generate and cache signed URL for the card image
                if 'image_url' in card_data and card_data['image_url']:
                    image_url = card_data['image_url']
                    # Check if we've already processed this image in this request
                    if image_url in processed_urls:
                        card_data['image_url'] = processed_urls[image_url]
                    else:
                        try:
                            # R2 URLs are public; no signing required. Just reuse the URL.
                            signed_url = image_url
                            card_data['image_url'] = signed_url
                            processed_urls[image_url] = signed_url
                            logger.debug(f"Using public image URL for card {doc.id}")
                        except Exception as sign_error:
                            logger.error(f"Failed to process image URL {image_url}: {sign_error}")
                            processed_urls[image_url] = image_url
                            # Keep the original URL if processing fails

                # Skip cards with quantity 0 or less
                if card_data.get('quantity', 0) <= 0:
                    logger.debug(f"Skipping card {doc.id} with quantity {card_data.get('quantity', 0)}")
                    continue
                    
                cards_list.append(UserCard(**card_data))
            except Exception as e:
                logger.error(f"Error processing document {doc.id} from subcollection {subcollection_name}: {e}", exc_info=True)
                # Skip this card and continue
                continue

        # Calculate total pages
        total_pages = math.ceil(total_items / per_page_query) if per_page_query > 0 else 0

        # Create pagination info
        pagination_info = PaginationInfo(
            total_items=total_items,
            items_per_page=per_page_query,
            current_page=current_page_query,
            total_pages=total_pages
        )

        # Create applied filters info
        applied_filters_info = AppliedFilters(
            sort_by=sort_by,
            sort_order=sort_order,
            search_query=search_query
        )

        logger.info(f"Successfully fetched {len(cards_list)} fusion eligible cards for user {user_id} from subcollection {subcollection_name}")
        return UserCardListResponse(
            subcollection_name=subcollection_name,
            cards=cards_list,
            pagination=pagination_info,
            filters=applied_filters_info
        )
    except Exception as e:
        logger.error(f"Error getting fusion eligible cards for user {user_id} from subcollection {subcollection_name}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get fusion eligible cards from subcollection {subcollection_name}: {str(e)}")


async def add_card_to_user(
    user_id: str,
    card_reference: str,
    db_client: AsyncClient,
    collection_metadata_id: str = None,
    from_marketplace: bool = False
) -> str:
    """
    Add a card to a user's cards subcollection under the deepest nested path.
    Decreases the quantity of the original card by 1 (allows negative quantity).

    Args:
        user_id: The ID of the user
        card_reference: Reference to master card ("collection/card_id")
        db_client: Firestore async client
        collection_metadata_id: Optional override for subcollection name
        from_marketplace: Optional flag to indicate that the card is from the market (True)

    Returns:
        Success message

    Raises:
        HTTPException on errors
    """
    # 1. Verify user exists
    user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
    user_doc = await user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404,
                            detail=f"User with ID {user_id} not found")

    # 2. Parse card_reference
    try:
        collection_id, card_id = card_reference.split('/')
    except ValueError:
        raise HTTPException(status_code=400,
                            detail=f"Invalid card reference format: {card_reference}. "
                                   "Expected 'collection/card_id'.")

    # 3. Fetch master card data
    card_ref = db_client.collection(collection_id).document(card_id)
    card_doc = await card_ref.get()
    if not card_doc.exists:
        raise HTTPException(status_code=404,
                            detail=f"Card '{card_reference}' not found")
    card_data = card_doc.to_dict()

    # 4. Prepare payload
    now = datetime.now()
    user_card_data = {
        "card_reference": card_reference,
        "card_name":      card_data.get("card_name", ""),
        "date_got":       firestore.SERVER_TIMESTAMP,
        "id":             card_id,
        "image_url":      card_data.get("image_url", ""),
        "point_worth":    card_data.get("point_worth", 0),
        "quantity":       1,
        "rarity":         card_data.get("rarity", 1),
        "condition":      card_data.get("condition", "near_mint"),  # Add condition field with default "near_mint"
        "buybackexpiresAt": now + timedelta(days=settings.card_buyback_expire_days)
    }
    # Check if card should expire (point_worth <= 500 and not used in fusion)
    master_used_in_fusion = card_data.get("used_in_fusion")  # may be list or bool or None
    # Store the full fusion usages array when available for frontend rendering
    user_card_data["used_in_fusion"] = master_used_in_fusion if master_used_in_fusion is not None else False
    if user_card_data["point_worth"] <= 500 and not bool(master_used_in_fusion):
        user_card_data["expireAt"] = now + timedelta(days=settings.card_expire_days)
        user_card_data["isExpiring"] = True

    # 5. Set up references
    cards_container = user_ref.collection('cards').document('cards')
    subcol = collection_metadata_id or collection_id
    deep_ref = cards_container.collection(subcol).document(card_id)

    @firestore.async_transactional
    async def _txn(tx: firestore.AsyncTransaction):
        # Get user's card existence INSIDE transaction using correct pattern
        existing_deep_snap = await deep_ref.get(transaction=tx)
        existing_deep_exists = existing_deep_snap.exists
        
        # Check expiring card if needed (do all reads before writes)
        used_in_fusion_flag = bool(master_used_in_fusion)
        needs_expiring_card = user_card_data["point_worth"] <= 500 and not used_in_fusion_flag
        expiring_card_snap = None
        if needs_expiring_card:
            expiring_cards_collection = db_client.collection('expiring_cards')
            expiring_card_ref = expiring_cards_collection.document(f"{user_id}_{card_id}")
            expiring_card_snap = await expiring_card_ref.get(transaction=tx)
        
        # Now do all write operations after all reads are complete
        # Decrease the quantity of the original card by 1 (allows negative quantity)
        if not from_marketplace:
            tx.update(card_ref, {
                "quantity": firestore.Increment(-1)
            })

        if existing_deep_exists:
            # Just increment quantity atomically, update other fields
            updates = {
                "quantity": firestore.Increment(1),
                "point_worth": user_card_data["point_worth"],
                "condition": user_card_data["condition"],
                "buybackexpiresAt": now + timedelta(days=settings.card_buyback_expire_days),
                "used_in_fusion": master_used_in_fusion if master_used_in_fusion is not None else False
            }
            if "expireAt" in user_card_data:
                updates["expireAt"] = now + timedelta(days=settings.card_expire_days)
                updates["isExpiring"] = True
            tx.update(deep_ref, updates)
        else:
            # First-time set
            tx.set(deep_ref, user_card_data)

        # Handle expiring cards collection if needed
        if needs_expiring_card:
            # The path to the user's card
            card_path = f"users/{user_id}/cards/cards/{subcol}/{card_id}"

            if expiring_card_snap and expiring_card_snap.exists:
                # Update the existing document with new expiration time
                tx.update(expiring_card_ref, {
                    "expiresAt": user_card_data["expireAt"],
                    "quantity": firestore.Increment(1)
                })
                logger.info(f"Updated card in expiring_cards collection with ID {user_id}_{card_id}")
            else:
                # Add to expiring cards collection
                tx.set(expiring_card_ref, {
                    "userId": user_id,
                    "cardReference": card_path,
                    "expiresAt": user_card_data["expireAt"],
                    "quantity": 1
                })
                logger.info(f"Added card to expiring_cards collection with ID {user_id}_{card_id}")

        logger.info(f"Card stored at users/{user_id}/cards/cards/{subcol}/{card_id}")
        if not from_marketplace:
            logger.info(f"Decreased quantity of original card {card_reference} by 1")

    # Execute the transaction
    txn = db_client.transaction()
    await _txn(txn)

    # 6. Fetch updated data, sign URL, build UserCard
    updated_doc = await deep_ref.get()
    data = updated_doc.to_dict()
    if data.get("image_url", "").startswith('gs://'):
        try:
            # R2 URLs are public, no need to sign them

            data["image_url"] = data["image_url"]
        except Exception:
            pass

    user_card = UserCard(
        card_reference = data["card_reference"],
        card_name      = data["card_name"],
        date_got       = data["date_got"],
        id             = data["id"],
        image_url      = data["image_url"],
        point_worth    = data["point_worth"],
        quantity       = data["quantity"],
        rarity         = data["rarity"],
        condition      = data.get("condition", "near_mint"),  # Include condition field
        isExpiring     = data.get("isExpiring"),
        used_in_fusion = data.get("used_in_fusion")
    )
    if "expireAt" in data:
        user_card.expireAt = data["expireAt"]
    if "buybackexpiresAt" in data:
        user_card.buybackexpiresAt = data["buybackexpiresAt"]

    return f"Card {card_reference} successfully added to user {user_id}"

async def add_multiple_cards_to_user(
    user_id: str,
    card_references: List[str],
    db_client: AsyncClient,
    collection_metadata_id: str = None
) -> str:
    """
    Add multiple cards to a user's cards subcollection under the deepest nested path.

    Args:
        user_id: The ID of the user
        card_references: List of references to master cards (["collection/card_id", ...])
        db_client: Firestore async client
        collection_metadata_id: Optional override for subcollection name

    Returns:
        Success message

    Raises:
        HTTPException on errors
    """
    # 1. Verify user exists
    user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
    user_doc = await user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404,
                            detail=f"User with ID {user_id} not found")

    # 2. Process each card
    results = []
    for card_reference in card_references:
        try:
            result = await add_card_to_user(user_id, card_reference, db_client, collection_metadata_id)
            results.append(result)
        except HTTPException as e:
            # Log the error but continue processing other cards
            logger.error(f"Error adding card {card_reference} to user {user_id}: {e.detail}")
            results.append(f"Failed to add card {card_reference}: {e.detail}")
        except Exception as e:
            # Log the error but continue processing other cards
            logger.error(f"Error adding card {card_reference} to user {user_id}: {str(e)}")
            results.append(f"Failed to add card {card_reference}: {str(e)}")

    # 3. Return a summary message
    success_count = sum(1 for result in results if not result.startswith("Failed"))
    return f"Added {success_count} out of {len(card_references)} cards to user {user_id}"


async def add_cards_and_deduct_points(
    user_id: str,
    card_references: List[str],
    points_to_deduct: int,
    db_client: AsyncClient,
    collection_metadata_id: str = None
) -> dict:
    """
    Add multiple cards to a user's collection and deduct points in a single atomic transaction.

    Args:
        user_id: The ID of the user
        card_references: List of references to master cards (["collection/card_id", ...])
        points_to_deduct: Number of points to deduct from user's balance
        db_client: Firestore async client
        collection_metadata_id: Optional override for subcollection name

    Returns:
        Dictionary with success message and details

    Raises:
        HTTPException on errors
    """
    logger = get_logger(__name__)

    # 1. Verify user exists and has enough points
    user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
    user_doc = await user_ref.get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

    user_data = user_doc.to_dict()
    current_points = user_data.get("pointsBalance", 0)

    if current_points < points_to_deduct:
        raise HTTPException(status_code=400,
                           detail=f"Insufficient points. User has {current_points} points, but {points_to_deduct} are required.")

    # 2. Validate points_to_deduct
    if points_to_deduct <= 0:
        raise HTTPException(status_code=400, detail="Points to deduct must be greater than 0")

    # 3. Deduct points from user

    # 4. Add cards to user's collection by calling add_card_to_user for each card
    results = []
    for card_reference in card_references:
        try:
            result = await add_card_to_user(
                user_id=user_id,
                card_reference=card_reference,
                db_client=db_client,
                collection_metadata_id=collection_metadata_id
            )
            results.append(result)
        except HTTPException as e:
            # Log the error but continue processing other cards
            logger.error(f"Error adding card {card_reference} to user {user_id}: {e.detail}")
            results.append(f"Failed to add card {card_reference}: {e.detail}")
        except Exception as e:
            # Log the error but continue processing other cards
            logger.error(f"Error adding card {card_reference} to user {user_id}: {str(e)}")
            results.append(f"Failed to add card {card_reference}: {str(e)}")

    @firestore.async_transactional
    async def _deduct_points_txn(tx: firestore.AsyncTransaction):
        tx.update(user_ref, {
            "pointsBalance": firestore.Increment(-points_to_deduct)
        })

    # Execute the transaction to deduct points
    txn = db_client.transaction()
    await _deduct_points_txn(txn)

    # 5. Get updated user data
    updated_user_doc = await user_ref.get()
    updated_user_data = updated_user_doc.to_dict()

    # 6. Return success message with details
    success_count = sum(1 for result in results if not result.startswith("Failed"))
    return {
        "message": f"Successfully added {success_count} card(s) and deducted {points_to_deduct} points",
        "remaining_points": updated_user_data.get("pointsBalance", 0),
        "cards_added": success_count
    }




async def destroy_multiple_cards(
    user_id: str,
    cards_to_destroy: List[Dict[str, Any]],
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Destroy multiple cards from a user's collection and add their point_worth to the user's pointsBalance.
    For each card, if quantity is less than the card's quantity, only reduce the quantity.
    Only remove a card if the remaining quantity is 0.
    Also checks if the cards exist in expiring_cards collection and updates them accordingly.
    
    OPTIMIZED VERSION: Uses a single batch transaction for all cards to improve performance.

    Args:
        user_id: The ID of the user who owns the cards
        cards_to_destroy: List of dictionaries containing card_id, quantity, and subcollection_name for each card to destroy
        db_client: Firestore client

    Returns:
        Dictionary containing information about the destroyed cards and updated user balance

    Raises:
        HTTPException: If there's an error destroying the cards
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Validate cards to destroy
        if not cards_to_destroy:
            raise HTTPException(status_code=400, detail="No cards specified for destruction")

        # Aggregate duplicate cards first
        aggregated_cards = {}
        for card_info in cards_to_destroy:
            card_id = card_info.get('card_id')
            quantity = card_info.get('quantity', 1)
            subcollection_name = card_info.get('subcollection_name')
            
            key = (card_id, subcollection_name)
            if key not in aggregated_cards:
                aggregated_cards[key] = {
                    'card_id': card_id,
                    'quantity': 0,
                    'subcollection_name': subcollection_name
                }
            aggregated_cards[key]['quantity'] += quantity
        
        logger.info(f"Aggregated {len(cards_to_destroy)} card entries into {len(aggregated_cards)} unique cards")

        # If any card is missing subcollection_name, detect the correct subcollection by searching
        has_missing_subcollection = any(not card_info.get('subcollection_name') for card_info in aggregated_cards.values())
        if has_missing_subcollection:
            cards_doc_ref = user_ref.collection('cards').document('cards')
            available_subcollections = []
            async for collection in cards_doc_ref.collections():
                available_subcollections.append(collection.id)
            if not available_subcollections:
                raise HTTPException(status_code=404, detail=f"No card collections found for user {user_id}")

            # For each card lacking subcollection_name, find which subcollection contains it
            for card_info in aggregated_cards.values():
                if card_info.get('subcollection_name'):
                    continue
                card_id = card_info.get('card_id')
                if not card_id:
                    continue
                found_subcoll = None
                for subcoll in available_subcollections:
                    candidate_ref = user_ref.collection('cards').document('cards').collection(subcoll).document(card_id)
                    candidate_doc = await candidate_ref.get()
                    if candidate_doc.exists:
                        found_subcoll = subcoll
                        break
                if not found_subcoll:
                    raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in any subcollection for user {user_id}")
                card_info['subcollection_name'] = found_subcoll

        # Validate basic info after ensuring subcollection_name is set when possible
        for card_info in aggregated_cards.values():
            card_id = card_info.get('card_id')
            quantity = card_info.get('quantity', 1)
            
            if not card_id:
                raise HTTPException(status_code=400, detail="Card ID is required for each card")
            if quantity <= 0:
                raise HTTPException(status_code=400, detail=f"Quantity must be greater than 0 for card {card_id}")

        # Pre-fetch collection metadata for all unique subcollections to avoid repeated lookups
        unique_subcollections = set(card_info.get('subcollection_name') for card_info in aggregated_cards.values())
        collection_metadata_cache = {}
        
        for subcollection in unique_subcollections:
            if subcollection:  # Skip None values
                try:
                    collection_metadata_cache[subcollection] = await get_collection_metadata_from_service(subcollection)
                except Exception as e:
                    logger.warning(f"Failed to fetch metadata for subcollection {subcollection}: {e}")
                    # Continue without metadata - the transaction will handle missing metadata gracefully
                    collection_metadata_cache[subcollection] = None
        
        logger.info(f"Pre-fetched metadata for {len(collection_metadata_cache)} subcollections")

        # Execute single batch transaction for all cards
        @firestore.async_transactional
        async def batch_destroy_cards_transaction(transaction):
            total_points_to_add = 0
            cards_to_process = []
            
            # PHASE 1: Read all card documents first (reads must come before writes in transactions)
            for card_info in aggregated_cards.values():
                card_id = card_info.get('card_id')
                quantity = card_info.get('quantity', 1)
                subcollection_name = card_info.get('subcollection_name')
                
                if not subcollection_name:
                    raise HTTPException(status_code=400, detail=f"No subcollection_name for card {card_id}")
                
                # Prepare card reference
                card_ref = user_ref.collection('cards').document('cards').collection(subcollection_name).document(card_id)
                
                # Read card document inside transaction
                card_doc = await card_ref.get(transaction=transaction)
                
                if not card_doc.exists:
                    raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in subcollection {subcollection_name}")
                
                card_data = card_doc.to_dict()
                card = UserCard(**card_data)
                current_quantity = card.quantity
                
                # Check if buyback has expired
                if hasattr(card, 'buybackexpiresAt') and card.buybackexpiresAt:
                    current_time = datetime.now(card.buybackexpiresAt.tzinfo) if card.buybackexpiresAt.tzinfo else datetime.now()
                    if card.buybackexpiresAt < current_time:
                        raise HTTPException(
                            status_code=400, 
                            detail=f"Cannot destroy card {card_id}: buyback period has expired"
                        )
                
                if quantity > current_quantity:
                    raise HTTPException(status_code=400, detail=f"Cannot destroy {quantity} of card {card_id}, only {current_quantity} available")
                
                # Calculate points and remaining quantity
                points_to_add = card.point_worth * quantity
                remaining = current_quantity - quantity
                total_points_to_add += points_to_add
                
                # Read expiring cards document if needed (must read before writes)
                expiring_card_ref = None
                expiring_doc = None
                if getattr(card, 'isExpiring', False):
                    expiring_card_ref = db_client.collection('expiring_cards').document(f"{user_id}_{card_id}")
                    expiring_doc = await expiring_card_ref.get(transaction=transaction)
                
                # Store card processing info for the write phase
                cards_to_process.append({
                    'card_ref': card_ref,
                    'card': card,
                    'card_id': card_id,
                    'subcollection_name': subcollection_name,
                    'quantity': quantity,
                    'points_to_add': points_to_add,
                    'remaining': remaining,
                    'expiring_card_ref': expiring_card_ref,
                    'expiring_doc': expiring_doc
                })
            
            # PHASE 2: Perform all write operations
            for card_data in cards_to_process:
                card_ref = card_data['card_ref']
                card_id = card_data['card_id']
                subcollection_name = card_data['subcollection_name']
                quantity = card_data['quantity']
                remaining = card_data['remaining']
                expiring_card_ref = card_data['expiring_card_ref']
                expiring_doc = card_data['expiring_doc']
                
                # Update or delete the user's card
                if remaining <= 0:
                    transaction.delete(card_ref)
                    logger.debug(f"Scheduled deletion of card {card_id} from user collection")
                else:
                    transaction.update(card_ref, {"quantity": remaining})
                    logger.debug(f"Scheduled quantity update for card {card_id}: {remaining}")
                
                # Update main card collection inventory (return cards to global pool)
                collection_metadata = collection_metadata_cache.get(subcollection_name)
                if collection_metadata and collection_metadata.get("firestoreCollection"):
                    main_card_ref = db_client.collection(collection_metadata["firestoreCollection"]).document(card_id)
                    transaction.update(main_card_ref, {"quantity": firestore.Increment(quantity)})
                    logger.debug(f"Scheduled inventory return for card {card_id}: +{quantity}")
                else:
                    logger.warning(f"No metadata found for subcollection {subcollection_name}, skipping inventory return")
                
                # Update expiring_cards collection if needed
                if expiring_card_ref is not None and expiring_doc is not None and expiring_doc.exists:
                    if remaining <= 0:
                        transaction.delete(expiring_card_ref)
                        logger.debug(f"Scheduled deletion of expiring card {user_id}_{card_id}")
                    else:
                        transaction.update(expiring_card_ref, {"quantity": firestore.Increment(-quantity)})
                        logger.debug(f"Scheduled expiring card quantity update for {user_id}_{card_id}: -{quantity}")
            
            # Update user's points balance once for all cards
            if total_points_to_add > 0:
                transaction.update(user_ref, {"pointsBalance": firestore.Increment(total_points_to_add)})
                logger.debug(f"Scheduled user points update: +{total_points_to_add}")
            
            return total_points_to_add, len(cards_to_process)
        
        # Execute the batch transaction
        try:
            txn = db_client.transaction()
            total_points_added, total_cards_processed = await batch_destroy_cards_transaction(txn)
            
            logger.info(f"Successfully destroyed {total_cards_processed} cards in batch transaction, added {total_points_added} points")
            
        except Exception as e:
            logger.error(f"Failed to execute batch card destruction transaction: {e}")
            raise
        
        # Fetch the updated user model
        updated_user_snap = await user_ref.get()
        updated_user = User(**updated_user_snap.to_dict())

        # Calculate total cards destroyed (sum of quantities)
        total_cards_destroyed = sum(card_info['quantity'] for card_info in aggregated_cards.values())

        # Return information about the destroyed cards and updated user balance
        return {
            "message": f"Successfully destroyed {total_cards_destroyed} cards and added {total_points_added} points",
            "cards_destroyed": total_cards_destroyed,
            "points_added": total_points_added,
            "remaining_points": updated_user.pointsBalance
        }
        
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error destroying multiple cards for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to destroy cards: {str(e)}")

async def destroy_card(
    user_id: str,
    card_id: str,
    subcollection_name: str,
    db_client: AsyncClient,
    quantity: int = 1
) -> tuple[User, UserCard]:
    """
    Destroy a card from a user's collection and add its point_worth to the user's pointsBalance.
    If quantity is less than the card's quantity, only reduce the quantity.
    Only remove the card if the remaining quantity is 0.
    Also checks if the card exists in expiring_cards collection and updates it accordingly.

    Returns:
        Tuple of (updated_user_model, destroyed_card_model)

    Raises:
        HTTPException on errors
    """
    # 1. Verify user exists
    user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
    user_snap = await user_ref.get()
    if not user_snap.exists:
        raise HTTPException(404, f"User with ID {user_id} not found")
    user = User(**user_snap.to_dict())

    # 2. Load deep subcollection card
    deep_ref = (
        user_ref
        .collection('cards')
        .document('cards')
        .collection(subcollection_name)
        .document(card_id)
    )
    deep_snap = await deep_ref.get()
    if not deep_snap.exists:
        raise HTTPException(404, f"Card {card_id} not found in subcollection {subcollection_name}")
    card = UserCard(**deep_snap.to_dict())

    # 3. Check if buyback has expired
    if hasattr(card, 'buybackexpiresAt') and card.buybackexpiresAt:
        # buybackexpiresAt is already a datetime object from Firestore
        current_time = datetime.now(card.buybackexpiresAt.tzinfo) if card.buybackexpiresAt.tzinfo else datetime.now()
        if card.buybackexpiresAt < current_time:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot destroy card {card_id}: buyback period has expired"
            )

    # 4. Validate quantity
    if quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than 0")
    if quantity > card.quantity:
        raise HTTPException(400, f"Cannot destroy {quantity}, only {card.quantity} available")

    # Calculate points and remaining
    points_to_add = card.point_worth * quantity
    remaining = card.quantity - quantity

    # 5. Pre-fetch main card exists flag
    collection_meta_data = await get_collection_metadata_from_service(subcollection_name)
    print(collection_meta_data)
    main_card_ref = (
        db_client
        .collection(collection_meta_data["firestoreCollection"])
        .document(card_id)
    )
    main_snap = await main_card_ref.get()

    # 4.1 Check if card exists in expiring_cards collection using persisted isExpiring flag
    expiring_card_ref = None
    expiring_card_exists = False
    if getattr(card, 'isExpiring', False):
        expiring_cards_collection = db_client.collection('expiring_cards')
        expiring_card_ref = expiring_cards_collection.document(f"{user_id}_{card_id}")
        expiring_card_doc = await expiring_card_ref.get()
        expiring_card_exists = expiring_card_doc.exists

    @firestore.async_transactional
    async def _txn(tx: firestore.AsyncTransaction):
        # Add points to user balance
        tx.update(user_ref, {"pointsBalance": firestore.Increment(points_to_add)})

        if remaining <= 0:
            tx.delete(deep_ref)
        else:
            tx.update(deep_ref, {"quantity": remaining})
            if main_snap.exists:
                main_card = main_snap.to_dict()
                main_remaining = main_card["quantity"] + quantity
                tx.update(main_card_ref, {"quantity": main_remaining})
            logger.info(f"Updated card {card_id} to quantity {remaining} for user {user_id}")

        # Update expiring_cards collection if needed
        if expiring_card_exists:
            if remaining <= 0:
                tx.delete(expiring_card_ref)
                logger.info(f"Deleted card from expiring_cards collection with ID {user_id}_{card_id}")
            else:
                tx.update(expiring_card_ref, {
                    "quantity": firestore.Increment(-quantity)
                })
                logger.info(f"Updated card in expiring_cards collection with ID {user_id}_{card_id}, reduced quantity by {quantity}")

    txn = db_client.transaction()
    await _txn(txn)

    # 5. Fetch the updated user model
    updated_user_snap = await user_ref.get()
    updated_user = User(**updated_user_snap.to_dict())

    # 6. Return updated user and the card model (with original point_worth)
    return updated_user, card

async def perform_fusion(
    user_id: str,
    result_card_id: str,
    db_client: AsyncClient,
    collection_id: Optional[str] = None,
    pack_id: Optional[str] = None
) -> PerformFusionResponse:
    """
    Perform a fusion operation for a user.

    This function:
    1. Retrieves the fusion recipe from Firestore
    2. Checks if the user has all required ingredients
    3. Removes the ingredient cards from the user's collection
    4. Adds the result card to the user's collection

    Args:
        user_id: The ID of the user performing the fusion
        result_card_id: The ID of the fusion recipe to use
        db_client: Firestore client
        collection_id: Optional. The ID of the collection containing the fusion recipe
        pack_id: Optional. The ID of the pack containing the fusion recipe

    Returns:
        PerformFusionResponse with success status, message, and the resulting card

    Raises:
        HTTPException: If there's an error performing the fusion
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the fusion recipe
        fusion_recipes_ref = db_client.collection('fusion_recipes')
        recipe_doc = None
        recipe_data = None

        # If collection_id and pack_id are provided, directly access the recipe
        if collection_id and pack_id:
            card_ref = fusion_recipes_ref.document(collection_id).collection(collection_id).document(pack_id).collection('cards').document(result_card_id)
            card_doc = await card_ref.get()

            if card_doc.exists:
                recipe_doc = card_doc
                recipe_data = card_doc.to_dict()
        else:
            # If collection_id and pack_id are not provided, search through all collections and packs
            collections_stream = fusion_recipes_ref.stream()

            # Iterate through all pack collections
            async for collection_doc in collections_stream:
                pack_collection_id = collection_doc.id
                # Get all packs in this collection
                packs_ref = fusion_recipes_ref.document(pack_collection_id).collection(pack_collection_id)
                packs_stream = packs_ref.stream()

                # For each pack, check if it contains the recipe
                async for pack_doc in packs_stream:
                    pack_id = pack_doc.id

                    # Check if the cards collection has the result_card_id
                    card_ref = packs_ref.document(pack_id).collection('cards').document(result_card_id)
                    card_doc = await card_ref.get()

                    if card_doc.exists:
                        recipe_doc = card_doc
                        recipe_data = card_doc.to_dict()
                        break

                if recipe_doc:
                    break

        if not recipe_doc or not recipe_data:
            raise HTTPException(status_code=404, detail=f"Fusion recipe with ID '{result_card_id}' not found")

        # Check if the user has all required ingredients
        ingredients = recipe_data.get('ingredients', [])
        missing_ingredients = []

        for ingredient in ingredients:
            card_collection_id = ingredient.get('card_collection_id')
            card_id = ingredient.get('card_id')
            required_quantity = ingredient.get('quantity', 1)

            # Check if the user has this card in their collection
            card_ref = user_ref.collection('cards').document('cards').collection(card_collection_id).document(card_id)
            card_doc = await card_ref.get()

            if not card_doc.exists:
                missing_ingredients.append(f"{card_collection_id}/{card_id}")
                continue

            # Check if the user has enough quantity
            card_data = card_doc.to_dict()
            user_quantity = card_data.get('quantity', 0)

            if user_quantity < required_quantity:
                missing_ingredients.append(f"{card_collection_id}/{card_id} (have {user_quantity}, need {required_quantity})")

        # If there are missing ingredients, return an error
        if missing_ingredients:
            return PerformFusionResponse(
                success=False,
                message=f"Missing ingredients for fusion: {', '.join(missing_ingredients)}",
                result_card=None
            )

        # All ingredients are available, perform the fusion
        # 1. Remove the ingredients from the user's collection
        for ingredient in ingredients:
            card_collection_id = ingredient.get('card_collection_id')
            card_id = ingredient.get('card_id')
            required_quantity = ingredient.get('quantity', 1)

            # Get the card from the user's collection
            card_ref = user_ref.collection('cards').document('cards').collection(card_collection_id).document(card_id)
            card_doc = await card_ref.get()
            card_data = card_doc.to_dict()

            user_quantity = card_data.get('quantity', 0)
            locked_quantity = card_data.get('locked_quantity',0)
            remaining_quantity = user_quantity - required_quantity

            if remaining_quantity <= 0 and locked_quantity == 0:
                # Delete the card if no quantity remains
                await card_ref.delete()

                # Also delete from the main cards collection if it exists
                main_card_ref = user_ref.collection('cards').document(card_id)
                main_card_doc = await main_card_ref.get()
                if main_card_doc.exists:
                    await main_card_ref.delete()
            else:
                # Update the quantity
                await card_ref.update({"quantity": remaining_quantity})

                # Also update in the main cards collection if it exists
                main_card_ref = user_ref.collection('cards').document(card_id)
                main_card_doc = await main_card_ref.get()
                if main_card_doc.exists:
                    await main_card_ref.update({"quantity": remaining_quantity})

        # 2. Add the result card to the user's collection
        card_collection_id = recipe_data.get('card_collection_id')
        card_reference = recipe_data.get('card_reference')

        # Parse the card_reference to get the actual collection name
        try:
            collection_name, card_id = card_reference.split('/')
            logger.info(f"Parsed card_reference '{card_reference}' to collection '{collection_name}' and card_id '{card_id}'")
        except ValueError:
            logger.error(f"Invalid card reference format: {card_reference}. Expected 'collection/card_id'.")
            raise HTTPException(status_code=400, detail=f"Invalid card reference format: {card_reference}")

        # Add the result card to the user's collection
        # Use the collection name from the card_reference as the subcollection name
        await add_card_to_user(
            user_id=user_id,
            card_reference=card_reference,
            db_client=db_client,
            collection_metadata_id=card_collection_id
        )

        # 3. Get the added card to return in the response
        # Use the collection name from the card_reference as the subcollection name
        result_card_ref = user_ref.collection('cards').document('cards').collection(card_collection_id).document(card_id)
        result_card_doc = await result_card_ref.get()

        # Increment the user's totalFusion counter
        await user_ref.update({"totalFusion": firestore.Increment(1)})

        if not result_card_doc.exists:
            # This shouldn't happen, but just in case
            return PerformFusionResponse(
                success=True,
                message=f"Fusion successful, but couldn't retrieve the result card",
                result_card=None
            )

        result_card_data = result_card_doc.to_dict()

        # Generate signed URL for the card image
        if 'image_url' in result_card_data and result_card_data['image_url']:
            try:
                # R2 URLs are public, no need to sign them

                result_card_data['image_url'] = result_card_data['image_url']
            except Exception as sign_error:
                logger.error(f"Failed to generate signed URL for {result_card_data['image_url']}: {sign_error}")
                # Keep the original URL if signing fails

        # Create a UserCard object from the result card data
        result_card = UserCard(**result_card_data)

        return PerformFusionResponse(
            success=True,
            message=f"Fusion successful! Created {result_card_id}",
            result_card=result_card
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error performing fusion for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to perform fusion: {str(e)}")

async def perform_random_fusion(
    user_id: str,
    fusion_request: RandomFusionRequest,
    db_client: AsyncClient
) -> PerformFusionResponse:
    """
    Perform a random fusion operation for a user.

    This function:
    1. Verifies the user has both cards and they have point_worth < 3000
    2. Calculates the combined point_worth and determines the valid range (0.75-0.90)
    3. Queries Firestore for cards in the same collection with point_worth in that range
    4. Randomly selects one of those cards as the result
    5. Removes the ingredient cards from the user's collection
    6. Adds the result card to the user's collection

    Args:
        user_id: The ID of the user performing the fusion
        fusion_request: The RandomFusionRequest containing card IDs and collection
        db_client: Firestore client

    Returns:
        PerformFusionResponse with success status, message, and the resulting card

    Raises:
        HTTPException: If there's an error performing the fusion
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the cards from the user's collection
        card1_ref = user_ref.collection('cards').document('cards').collection(fusion_request.collection_id).document(fusion_request.card_id1)
        card2_ref = user_ref.collection('cards').document('cards').collection(fusion_request.collection_id).document(fusion_request.card_id2)

        card1_doc = await card1_ref.get()
        card2_doc = await card2_ref.get()

        # Check if the cards exist
        if not card1_doc.exists:
            return PerformFusionResponse(
                success=False,
                message=f"Card {fusion_request.card_id1} not found in your collection",
                result_card=None
            )

        if not card2_doc.exists:
            return PerformFusionResponse(
                success=False,
                message=f"Card {fusion_request.card_id2} not found in your collection",
                result_card=None
            )

        # Check if the cards are different
        if fusion_request.card_id1 == fusion_request.card_id2:
            return PerformFusionResponse(
                success=False,
                message="Cannot fuse the same card with itself",
                result_card=None
            )

        # Get the card data
        card1_data = card1_doc.to_dict()
        card2_data = card2_doc.to_dict()

        # Check if the cards have point_worth < 3000
        card1_point_worth = card1_data.get('point_worth', 0)
        card2_point_worth = card2_data.get('point_worth', 0)

        if card1_point_worth >= 3000:
            return PerformFusionResponse(
                success=False,
                message=f"Card {fusion_request.card_id1} has point_worth {card1_point_worth}, which is >= 3000",
                result_card=None
            )

        if card2_point_worth >= 3000:
            return PerformFusionResponse(
                success=False,
                message=f"Card {fusion_request.card_id2} has point_worth {card2_point_worth}, which is >= 3000",
                result_card=None
            )

        # Calculate the combined point_worth and determine the valid range
        combined_point_worth = card1_point_worth + card2_point_worth
        min_point_worth = int(combined_point_worth * 0.75)
        max_point_worth = int(combined_point_worth * 0.90)

        logger.info(f"Combined point_worth: {combined_point_worth}, valid range: {min_point_worth} - {max_point_worth}")

        # Extract the collection name from the card_reference of one of the cards
        collection_name = fusion_request.collection_id  # Default fallback

        # Try to get card_reference from card1 first
        if 'card_reference' in card1_data:
            try:
                # Parse the card_reference to get the collection name
                collection_name, _ = card1_data['card_reference'].split('/')
                logger.info(f"Extracted collection name '{collection_name}' from card1 reference: {card1_data['card_reference']}")
            except (ValueError, KeyError) as e:
                logger.warning(f"Failed to extract collection name from card1 reference: {e}")

        # If we couldn't get it from card1, try card2
        elif 'card_reference' in card2_data:
            try:
                # Parse the card_reference to get the collection name
                collection_name, _ = card2_data['card_reference'].split('/')
                logger.info(f"Extracted collection name '{collection_name}' from card2 reference: {card2_data['card_reference']}")
            except (ValueError, KeyError) as e:
                logger.warning(f"Failed to extract collection name from card2 reference: {e}")

        # Query Firestore for cards in the extracted collection with point_worth in the valid range
        collection_ref = db_client.collection(collection_name)
        logger.info(f"Querying collection: {collection_name}")

        # Use where method for filtering
        query = collection_ref.where("point_worth", ">=", min_point_worth).where("point_worth", "<=", max_point_worth)

        # Execute the query
        cards_stream = query.stream()

        # Collect all valid cards
        valid_cards = []
        async for card_doc in cards_stream:
            # Print out the document for debugging
            logger.info(f"Found document: {card_doc.id}, data: {card_doc.to_dict()}")
            card_data = card_doc.to_dict()
            # Only include cards with point_worth > 0
            if card_data.get('point_worth', 0) > 0:
                valid_cards.append({
                    'id': card_doc.id,
                    'data': card_data
                })

        # Check if there are any valid cards
        if not valid_cards:
            return PerformFusionResponse(
                success=False,
                message=f"No valid cards found in collection {collection_name} with point_worth between {min_point_worth} and {max_point_worth}",
                result_card=None
            )

        # Randomly select one of the valid cards
        result_card_info = random.choice(valid_cards)
        result_card_id = result_card_info['id']
        result_card_data = result_card_info['data']

        logger.info(f"Randomly selected card {result_card_id} with point_worth {result_card_data.get('point_worth', 0)}")

        # Remove the ingredient cards from the user's collection
        # First card
        card1_quantity = card1_data.get('quantity', 0)
        card1_locked_quantity = card1_data.get('locked_quantity', 0)
        remaining_quantity1 = card1_quantity - 1

        if remaining_quantity1 <= 0 and card1_locked_quantity == 0:
            # Delete the card if no quantity remains
            await card1_ref.delete()

            # Also delete from the main cards collection if it exists
            main_card1_ref = user_ref.collection('cards').document(fusion_request.card_id1)
            main_card1_doc = await main_card1_ref.get()
            if main_card1_doc.exists:
                await main_card1_ref.delete()
        else:
            # Update the quantity
            await card1_ref.update({"quantity": remaining_quantity1})

            # Also update in the main cards collection if it exists
            main_card1_ref = user_ref.collection('cards').document(fusion_request.card_id1)
            main_card1_doc = await main_card1_ref.get()
            if main_card1_doc.exists:
                await main_card1_ref.update({"quantity": remaining_quantity1})

        # Second card
        card2_quantity = card2_data.get('quantity', 0)
        card2_locked_quantity = card2_data.get('locked_quantity', 0)
        remaining_quantity2 = card2_quantity - 1

        if remaining_quantity2 <= 0 and card2_locked_quantity == 0:
            # Delete the card if no quantity remains
            await card2_ref.delete()

            # Also delete from the main cards collection if it exists
            main_card2_ref = user_ref.collection('cards').document(fusion_request.card_id2)
            main_card2_doc = await main_card2_ref.get()
            if main_card2_doc.exists:
                await main_card2_ref.delete()
        else:
            # Update the quantity
            await card2_ref.update({"quantity": remaining_quantity2})

            # Also update in the main cards collection if it exists
            main_card2_ref = user_ref.collection('cards').document(fusion_request.card_id2)
            main_card2_doc = await main_card2_ref.get()
            if main_card2_doc.exists:
                await main_card2_ref.update({"quantity": remaining_quantity2})

        # Add the result card to the user's collection
        card_reference = f"{collection_name}/{result_card_id}"

        await add_card_to_user(
            user_id=user_id,
            card_reference=card_reference,
            db_client=db_client,
            collection_metadata_id=fusion_request.collection_id
        )

        # Get the added card to return in the response
        result_card_ref = user_ref.collection('cards').document('cards').collection(fusion_request.collection_id).document(result_card_id)
        result_card_doc = await result_card_ref.get()

        if not result_card_doc.exists:
            # This shouldn't happen, but just in case
            return PerformFusionResponse(
                success=True,
                message=f"Random fusion successful, but couldn't retrieve the result card",
                result_card=None
            )

        result_card_data = result_card_doc.to_dict()

        # Generate signed URL for the card image
        if 'image_url' in result_card_data and result_card_data['image_url']:
            try:
                # R2 URLs are public, no need to sign them

                result_card_data['image_url'] = result_card_data['image_url']
            except Exception as sign_error:
                logger.error(f"Failed to generate signed URL for {result_card_data['image_url']}: {sign_error}")
                # Keep the original URL if signing fails

        # Create a UserCard object from the result card data
        result_card = UserCard(**result_card_data)

        return PerformFusionResponse(
            success=True,
            message=f"Random fusion successful! Created {result_card_id} with point_worth {result_card.point_worth}",
            result_card=result_card
        )
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error performing random fusion for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to perform random fusion: {str(e)}")


async def add_card_to_highlights(
    user_id: str,
    card_collection_id: str,
    card_id: str,
    db_client: AsyncClient
) -> UserCard:
    """
    Add a card to the user's highlights subcollection.
    This function finds the card in the user's collection and adds it to the highlights subcollection.

    Args:
        user_id: The ID of the user who owns the card
        card_collection_id: The collection ID of the card (e.g., 'pokemon')
        card_id: The ID of the card to add to highlights
        db_client: Firestore client

    Returns:
        The card that was added to highlights as a UserCard object

    Raises:
        HTTPException: If there's an error adding the card to highlights
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the card from the source collection
        source_card_ref = user_ref.collection('cards').document('cards').collection(card_collection_id).document(card_id)
        source_card_doc = await source_card_ref.get()

        if not source_card_doc.exists:
            raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in collection {card_collection_id}")

        # Get the card data
        source_card_data = source_card_doc.to_dict()

        # Set up the highlights subcollection reference
        highlights_ref = user_ref.collection('highlights').document(card_id)

        # Check if the card already exists in highlights
        highlights_doc = await highlights_ref.get()

        if highlights_doc.exists:
            # Card already exists in highlights, just return it
            highlights_data = highlights_doc.to_dict()

            # Generate signed URL for the card image
            if 'image_url' in highlights_data and highlights_data['image_url']:
                try:
                    # R2 URLs are public, no need to sign them

                    highlights_data['image_url'] = highlights_data['image_url']
                except Exception as sign_error:
                    logger.error(f"Failed to generate signed URL for {highlights_data['image_url']}: {sign_error}")
                    # Keep the original URL if signing fails

            return UserCard(**highlights_data)

        # Add the card to the highlights subcollection with collection ID
        highlight_data = {
            **source_card_data,
            'card_collection_id': card_collection_id  # Add collection ID for frontend use
        }
        await highlights_ref.set(highlight_data)

        logger.info(f"Added card {card_id} from collection {card_collection_id} to highlights for user {user_id}")

        # Generate signed URL for the card image
        if 'image_url' in source_card_data and source_card_data['image_url']:
            try:
                # R2 URLs are public, no need to sign them

                source_card_data['image_url'] = source_card_data['image_url']
            except Exception as sign_error:
                logger.error(f"Failed to generate signed URL for {source_card_data['image_url']}: {sign_error}")
                # Keep the original URL if signing fails

        # Return the card that was added to highlights
        return UserCard(**source_card_data)

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding card {card_id} from collection {card_collection_id} to highlights for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add card to highlights: {str(e)}")

async def add_to_top_hits(
    user_id: str,
    display_name: str,
    card_reference: str,
    db_client: AsyncClient,
    pack_id: str = None,
    collection_id: str = None
) -> dict:
    """
    Add a card to the top_hits collection.
    This function creates a document in the top_hits collection with user and card information.

    Args:
        user_id: The ID of the user
        display_name: The display name of the user
        card_reference: Reference to master card ("collection/card_id")
        db_client: Firestore client
        pack_id: The ID of the pack the card was drawn from (optional)
        collection_id: The ID of the collection the pack belongs to (optional)

    Returns:
        A dictionary with the created document data

    Raises:
        HTTPException: If there's an error adding the card to top_hits
    """
    try:
        # Parse card_reference
        # Handle both simple "collection/card_id" format and full Firestore path
        if card_reference.startswith('projects/'):
            # Extract collection and document ID from full Firestore path
            # Format: projects/{project}/databases/(default)/documents/{collection}/{document}
            parts = card_reference.split('/')
            if len(parts) >= 7:
                card_collection_id = parts[-2]
                card_id = parts[-1]
            else:
                raise HTTPException(status_code=400,
                                    detail=f"Invalid Firestore reference format: {card_reference}")
        else:
            # Simple format: collection/card_id
            try:
                card_collection_id, card_id = card_reference.split('/')
            except ValueError:
                raise HTTPException(status_code=400,
                                    detail=f"Invalid card reference format: {card_reference}. "
                                           "Expected 'collection/card_id' or Firestore reference path.")

        # Fetch master card data
        card_ref = db_client.collection(card_collection_id).document(card_id)
        card_doc = await card_ref.get()
        if not card_doc.exists:
            raise HTTPException(status_code=404,
                                detail=f"Card '{card_reference}' not found")
        card_data = card_doc.to_dict()

        # Generate signed URL for image with caching
        image_url = card_data.get("image_url", "")
        
        if image_url:
            try:
                # Use generate_signed_url which automatically checks expiration
                # R2 URLs are public, no need to sign them

                signed_url = image_url
                
                # Update the master card document if the URL was regenerated
                if signed_url != image_url:
                    try:
                        await card_ref.update({"image_url": signed_url})
                        logger.info(f"Updated master card {card_id} with new signed URL")
                        
                        # Also update the card in all packs that contain this card
                        # We need to search through all packs to find instances of this card
                        packs_collection = db_client.collection('packs')
                        
                        # Search through all collections
                        async for collection_doc in packs_collection.stream():
                            collection_id_pack = collection_doc.id
                            collection_ref = packs_collection.document(collection_id_pack).collection(collection_id_pack)
                            
                            # Search through all packs in this collection
                            async for pack_doc in collection_ref.stream():
                                pack_id_pack = pack_doc.id
                                pack_cards_ref = collection_ref.document(pack_id_pack).collection('cards')
                                
                                # Check if this card exists in this pack
                                pack_card_ref = pack_cards_ref.document(card_id)
                                pack_card_doc = await pack_card_ref.get()
                                
                                if pack_card_doc.exists:
                                    try:
                                        await pack_card_ref.update({"image_url": signed_url})
                                        logger.debug(f"Updated card {card_id} in pack {pack_id_pack} with new signed URL")
                                    except Exception as e:
                                        logger.error(f"Failed to update card {card_id} in pack {pack_id_pack}: {e}")
                                        # Continue even if pack update fails
                        
                    except Exception as e:
                        logger.error(f"Failed to update master card {card_id} with signed URL: {e}")
                        # Continue even if update fails
                
                image_url = signed_url
            except Exception as e:
                logger.error(f"Failed to generate signed URL for {image_url}: {e}")
                # Keep the original URL if signing fails

        # Prepare the document data
        top_hit_data = {
            "user_id": user_id,
            "display_name": display_name,
            "card": {
                "id": card_id,
                "name": card_data.get("card_name", ""),
                "rarity": card_data.get("rarity", 1),
                "image_url": image_url,
                "point_worth": card_data.get("point_worth", 0)
            },
            "timestamp": SERVER_TIMESTAMP
        }
        
        # Add pack_id if provided
        if pack_id and collection_id:
            top_hit_data["pack_id"] = pack_id
            top_hit_data["pack_collection_id"] = collection_id

        # Add the document to the top_hits collection
        top_hits_ref = db_client.collection('top_hits').document()
        await top_hits_ref.set(top_hit_data)

        logger.info(f"Added card {card_id} from collection {card_collection_id} to top_hits for user {user_id}")

        # Return the created document data
        return {
            "success": True,
            "message": f"Card {card_id} added to top_hits successfully",
            "document_id": top_hits_ref.id
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error adding card {card_reference} to top_hits for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to add card to top_hits: {str(e)}")

async def delete_card_from_highlights(
    user_id: str,
    card_id: str,
    db_client: AsyncClient
) -> dict:
    """
    Delete a card from the user's highlights collection.

    Args:
        user_id: The ID of the user who owns the card
        card_id: The ID of the card to delete from highlights
        db_client: Firestore client

    Returns:
        A dictionary with a success message

    Raises:
        HTTPException: If there's an error deleting the card from highlights
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Set up the highlights reference
        highlights_ref = user_ref.collection('highlights').document(card_id)

        # Check if the card exists in highlights
        highlights_doc = await highlights_ref.get()

        if not highlights_doc.exists:
            raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in highlights")

        # Get the card data before deleting it (for logging or returning)
        highlights_data = highlights_doc.to_dict()

        # Delete the card from highlights
        await highlights_ref.delete()

        logger.info(f"Deleted card {card_id} from highlights for user {user_id}")

        # Return a success message
        return {"message": f"Card {card_id} successfully deleted from highlights for user {user_id}"}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error deleting card {card_id} from highlights for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to delete card from highlights: {str(e)}")

async def get_user_highlights(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "date_got",
    sort_order: str = "desc",
    search_query: str | None = None
) -> UserCardListResponse:
    """
    Get all cards in the user's highlights collection with pagination.

    Args:
        user_id: The ID of the user to get highlights for
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "date_got")
        sort_order: The sort order ("asc" or "desc", default: "desc")
        search_query: Optional search query to filter cards by name

    Returns:
        A UserCardListResponse with the highlighted cards, pagination info, and applied filters

    Raises:
        HTTPException: If there's an error getting the highlights
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the highlights collection reference
        highlights_ref = user_ref.collection('highlights')

        # Create the base query
        query = highlights_ref

        # Apply search query if provided
        if search_query and search_query.strip():
            stripped_search_query = search_query.strip()
            logger.info(f"Applying search filter for card_name: >='{stripped_search_query}' and <='{stripped_search_query}\uf8ff'")
            query = query.where("card_name", ">=", stripped_search_query)
            query = query.where("card_name", "<=", stripped_search_query + "\uf8ff")

        # Count total items matching the query
        count_agg_query = query.count()
        count_snapshot = await count_agg_query.get()
        total_items = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0

        if total_items == 0:
            logger.info(f"No highlights found for user {user_id}")
            return UserCardListResponse(
                subcollection_name="highlights",
                cards=[],
                pagination=PaginationInfo(
                    total_items=0,
                    items_per_page=per_page,
                    current_page=page,
                    total_pages=0
                ),
                filters=AppliedFilters(sort_by=sort_by, sort_order=sort_order, search_query=search_query)
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

        if search_query and search_query.strip() and sort_by != "card_name":
            # If searching and sorting by a different field, ensure card_name is the first sort key
            logger.warning(f"Search query on 'card_name' is active while sorting by '{sort_by}'. Firestore requires ordering by 'card_name' first.")
            query_with_sort = query_with_filters.order_by("card_name").order_by(sort_by, direction=direction)
        else:
            query_with_sort = query_with_filters.order_by(sort_by, direction=direction)

        # Apply pagination
        current_page_query = max(1, page)
        per_page_query = max(1, per_page)
        offset = (current_page_query - 1) * per_page_query

        paginated_query = query_with_sort.limit(per_page_query).offset(offset)

        # Execute the query
        logger.info(f"Executing Firestore query for user {user_id} highlights with pagination and sorting")
        stream = paginated_query.stream()

        # Process the results
        cards_list = []
        async for doc in stream:
            try:
                card_data = doc.to_dict()
                if not card_data:  # Skip empty documents
                    logger.warning(f"Skipping empty document with ID: {doc.id} in highlights")
                    continue

                # Ensure ID is part of the data
                if 'id' not in card_data:
                    card_data['id'] = doc.id

                # Map card_collection_id to subcollection_name if present
                if 'card_collection_id' in card_data and card_data['card_collection_id']:
                    card_data['subcollection_name'] = card_data['card_collection_id']
                    # Optionally remove card_collection_id to avoid field conflicts
                    del card_data['card_collection_id']

                # Generate signed URL for the card image
                if 'image_url' in card_data and card_data['image_url']:
                    try:
                        # R2 URLs are public, no need to sign them

                        card_data['image_url'] = card_data['image_url']
                    except Exception as sign_error:
                        logger.error(f"Failed to generate signed URL for {card_data['image_url']}: {sign_error}")
                        # Keep the original URL if signing fails

                # Create a UserCard object and add it to the list
                cards_list.append(UserCard(**card_data))
            except Exception as card_error:
                logger.error(f"Error processing card document {doc.id}: {card_error}", exc_info=True)
                # Skip this card and continue with others

        # Calculate total pages
        total_pages = math.ceil(total_items / per_page_query) if total_items > 0 else 0

        # Create and return the response
        return UserCardListResponse(
            subcollection_name="highlights",
            cards=cards_list,
            pagination=PaginationInfo(
                total_items=total_items,
                items_per_page=per_page_query,
                current_page=current_page_query,
                total_pages=total_pages
            ),
            filters=AppliedFilters(sort_by=sort_by, sort_order=sort_order, search_query=search_query)
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting highlights for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get highlights: {str(e)}")

async def get_user_card(
    user_id: str,
    collection_id: str,
    card_id: str,
    db_client: AsyncClient
) -> UserCard:
    """
    Get a specific card from a user's collection.

    Args:
        user_id: The ID of the user who owns the card
        collection_id: The collection ID of the card (e.g., 'pokemon')
        card_id: The ID of the card to retrieve
        db_client: Firestore client

    Returns:
        UserCard: The requested card

    Raises:
        HTTPException: If the user or card is not found
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the card reference
        card_ref = user_ref.collection('cards').document('cards').collection(collection_id).document(card_id)
        card_doc = await card_ref.get()

        if not card_doc.exists:
            raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in collection {collection_id}")

        # Get the card data
        card_data = card_doc.to_dict()

        # Generate and cache signed URL for the card image
        if 'image_url' in card_data and card_data['image_url']:
            try:
                # R2 URLs are public; no signing required. Just reuse the URL.
                card_data['image_url'] = card_data['image_url']
                logger.debug(f"Using public image URL for card {card_id}")
            except Exception as sign_error:
                logger.error(f"Failed to process image URL {card_data['image_url']}: {sign_error}")
                # Keep the original URL if processing fails

        # Create and return a UserCard object from the card data
        user_card = UserCard(**card_data)

        return user_card

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting card {card_id} from collection {collection_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get card: {str(e)}")


async def check_card_missing(
    user_id: str,
    fusion_recipe_ids: List[str],
    db_client: AsyncClient
) -> CheckCardMissingResponse:
    """
    Check which cards are missing for a user to perform fusion with specified recipes.

    This function:
    1. Retrieves the fusion recipes from Firestore
    2. For each recipe, checks which ingredients the user is missing
    3. Returns detailed information about missing cards for each recipe

    Args:
        user_id: The ID of the user to check cards for
        fusion_recipe_ids: List of fusion recipe IDs to check
        db_client: Firestore client

    Returns:
        CheckCardMissingResponse with details about missing cards for each recipe

    Raises:
        HTTPException: If there's an error checking the cards
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Initialize response
        recipes_missing_cards = []

        # Process each fusion recipe
        for recipe_id in fusion_recipe_ids:
            # Get the fusion recipe
            # First, we need to find which pack collection this recipe belongs to
            fusion_recipes_ref = db_client.collection('fusion_recipes')
            collections_stream = fusion_recipes_ref.stream()

            recipe_doc = None
            recipe_data = None

            # Iterate through all pack collections
            async for collection_doc in collections_stream:
                pack_collection_id = collection_doc.id
                # Get all packs in this collection
                packs_ref = fusion_recipes_ref.document(pack_collection_id).collection(pack_collection_id)
                packs_stream = packs_ref.stream()

                # For each pack, check if it contains the recipe
                async for pack_doc in packs_stream:
                    pack_id = pack_doc.id

                    # Check if the cards collection has the recipe_id
                    card_ref = packs_ref.document(pack_id).collection('cards').document(recipe_id)
                    card_doc = await card_ref.get()

                    if card_doc.exists:
                        recipe_doc = card_doc
                        recipe_data = card_doc.to_dict()
                        break

                if recipe_doc:
                    break

            if not recipe_doc or not recipe_data:
                # Skip non-existent recipes and continue with the next one
                logger.warning(f"Fusion recipe with ID '{recipe_id}' not found")
                continue

            # Initialize recipe missing cards info
            recipe_missing_cards = FusionRecipeMissingCards(
                recipe_id=recipe_id,
                recipe_name=recipe_data.get('name'),
                result_card_name=recipe_data.get('result_card_name'),
                result_card_image=recipe_data.get('result_card_image'),
                missing_cards=[]
            )

            # Check each ingredient
            ingredients = recipe_data.get('ingredients', [])
            all_cards_available = True

            for ingredient in ingredients:
                card_collection_id = ingredient.get('card_collection_id')
                card_id = ingredient.get('card_id')
                required_quantity = ingredient.get('quantity', 1)

                # Check if the user has this card in their collection
                card_ref = user_ref.collection('cards').document('cards').collection(card_collection_id).document(card_id)
                card_doc = await card_ref.get()

                user_quantity = 0
                if card_doc.exists:
                    card_data = card_doc.to_dict()
                    user_quantity = card_data.get('quantity', 0)

                # If user doesn't have enough, add to missing cards
                if not card_doc.exists or user_quantity < required_quantity:
                    all_cards_available = False

                    # Try to get additional card info from the storage service
                    card_name = ingredient.get('card_name')
                    image_url = ingredient.get('image_url')

                    try:
                        # Only fetch card details if we don't already have them
                        if not card_name or not image_url:
                            card_details = await get_card_by_id_from_service(card_id, card_collection_id)
                            card_name = card_details.get('name', card_name)
                            image_url = card_details.get('image_url', image_url)
                    except Exception as e:
                        logger.warning(f"Could not fetch card details for {card_collection_id}/{card_id}: {e}")

                    missing_card = MissingCard(
                        card_collection_id=card_collection_id,
                        card_id=card_id,
                        required_quantity=required_quantity,
                        user_quantity=user_quantity,
                        card_name=card_name,
                        image_url=image_url
                    )
                    recipe_missing_cards.missing_cards.append(missing_card)

            # Update has_all_cards flag
            recipe_missing_cards.has_all_cards = all_cards_available

            # Add to response
            recipes_missing_cards.append(recipe_missing_cards)

        return CheckCardMissingResponse(recipes=recipes_missing_cards)

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error checking missing cards for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to check missing cards: {str(e)}")


async def get_fusion_recipe_with_user_info(
    pack_collection_id: str,
    pack_id: str,
    result_card_id: str,
    user_id: Optional[str],
    db_client: AsyncClient
) -> FusionRecipeWithUserInfo:
    """
    Get a single fusion recipe with optional user card availability information.
    
    This function:
    1. Fetches the fusion recipe from the backend service
    2. If user_id is provided, checks the user's card inventory for each ingredient
    3. Returns the recipe with user-specific availability info if authenticated
    
    Args:
        pack_collection_id: The ID of the pack collection
        pack_id: The ID of the pack
        result_card_id: The ID of the result card (recipe ID)
        user_id: The ID of the user (optional - None if unauthenticated)
        db_client: Firestore client
        
    Returns:
        FusionRecipeWithUserInfo with user card availability data if authenticated
    """
    try:
        # Fetch the fusion recipe directly from Firestore
        fusion_recipes_ref = db_client.collection('fusion_recipes')
        recipe_ref = (
            fusion_recipes_ref
            .document(pack_collection_id)
            .collection(pack_collection_id)
            .document(pack_id)
            .collection('cards')
            .document(result_card_id)
        )
        
        recipe_doc = await recipe_ref.get()
        
        if not recipe_doc.exists:
            raise HTTPException(
                status_code=404,
                detail=f"Fusion recipe with ID '{result_card_id}' not found in pack '{pack_id}' and collection '{pack_collection_id}'"
            )
            
        recipe_data = recipe_doc.to_dict()
        
        # Get user reference only if user_id is provided
        user_ref = None
        user_doc = None
        if user_id:
            user_ref = db_client.collection('users').document(user_id)
            user_doc = await user_ref.get()
            
            if not user_doc.exists:
                raise HTTPException(status_code=404, detail=f"User with ID '{user_id}' not found")
        
        # Process ingredients to add user-specific info
        ingredients_with_user_info = []
        cards_needed = 0
        total_cards_needed = 0
        
        for ingredient in recipe_data.get('ingredients', []):
            # Generate signed URL for ingredient image if it exists
            ingredient_image_url = ingredient.get('image_url', '')
            if ingredient_image_url:
                try:
                    # R2 URLs are public, no need to sign them

                    ingredient_image_url = ingredient_image_url
                except Exception as e:
                    logger.warning(f"Failed to generate signed URL for ingredient image: {e}")
            
            # Create FusionIngredient object with base data
            ingredient_obj = FusionIngredient(
                card_id=ingredient.get('card_id'),
                card_collection_id=ingredient.get('card_collection_id'),
                quantity=ingredient.get('quantity', 1),
                card_reference=ingredient.get('card_reference'),
                card_name=ingredient.get('card_name'),
                image_url=ingredient_image_url,
                point_worth=ingredient.get('point_worth'),
                probability=ingredient.get('probability')
            )
            
            # Check user's card quantity only if user is authenticated
            card_collection_id = ingredient.get('card_collection_id')
            card_id = ingredient.get('card_id')
            required_quantity = ingredient.get('quantity', 1)
            
            user_quantity = 0
            if user_ref:  # Only check user cards if authenticated
                # Get the card from user's collection
                card_ref = user_ref.collection('cards').document('cards').collection(card_collection_id).document(card_id)
                card_doc = await card_ref.get()
                
                if card_doc.exists:
                    card_data = card_doc.to_dict()
                    user_quantity = card_data.get('quantity', 0)
                
                # Update ingredient with user-specific info
                ingredient_obj.user_quantity = user_quantity
                ingredient_obj.has_enough = user_quantity >= required_quantity
                
                if not ingredient_obj.has_enough:
                    cards_needed += 1
                    
                total_cards_needed += 1
            else:
                # For unauthenticated users, set default values
                ingredient_obj.user_quantity = 0
                ingredient_obj.has_enough = False
                
            ingredients_with_user_info.append(ingredient_obj)
        
        # Get result card details if not in recipe data
        result_image_url = recipe_data.get('result_card_image_url', '')
        result_card_name = recipe_data.get('result_card_name', '')
        result_card_point_worth = recipe_data.get('result_card_point_worth')
        
        # If image URL is missing, try to fetch from the master cards collection
        if not result_image_url or not result_card_name:
            try:
                card_ref_str = recipe_data.get('card_reference', '')
                if card_ref_str and '/' in card_ref_str:
                    card_ref_parts = card_ref_str.split('/', 1)
                    if len(card_ref_parts) >= 2:
                        card_collection = card_ref_parts[0]
                        card_id = card_ref_parts[1]
                        # Get card from master collection
                        card_doc_ref = db_client.collection(card_collection).document(card_id)
                        card_doc = await card_doc_ref.get()
                        if card_doc.exists:
                            card_info = card_doc.to_dict()
                            if card_info:
                                if not result_image_url:
                                    result_image_url = card_info.get('image_url', '')
                                if not result_card_name:
                                    result_card_name = card_info.get('card_name', '')
                                if result_card_point_worth is None:
                                    result_card_point_worth = card_info.get('point_worth', 0)
            except Exception as e:
                logger.warning(f"Failed to fetch result card details from master collection: {e}")
        
        # Generate signed URL for result card image if needed
        if result_image_url:
            try:
                # R2 URLs are public, no need to sign them

                result_image_url = result_image_url
            except Exception as e:
                logger.warning(f"Failed to generate signed URL for result card image: {e}")
        
        # Create the response object
        fusion_recipe = FusionRecipeWithUserInfo(
            result_card_id=recipe_data.get('result_card_id'),
            card_collection_id=recipe_data.get('card_collection_id'),
            card_reference=recipe_data.get('card_reference'),
            pack_id=recipe_data.get('pack_id'),
            pack_collection_id=recipe_data.get('pack_collection_id'),
            ingredients=ingredients_with_user_info,
            result_card_name=result_card_name,
            result_card_image_url=result_image_url,
            result_card_point_worth=result_card_point_worth,
            created_at=recipe_data.get('created_at'),
            cards_needed=cards_needed,
            total_cards_needed=total_cards_needed,
            can_perform_fusion=(cards_needed == 0)
        )
        
        return fusion_recipe
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting fusion recipe with user info: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get fusion recipe with user info: {str(e)}")


async def get_all_fusion_recipes(
    db_client: AsyncClient,
    collection_id: Optional[str] = None,
    pack: Optional[str] = None,
    user_id: Optional[str] = None,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "result_card_id",
    sort_order: str = "desc",
    search_query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get all fusion recipes from Firestore with optional filtering by collection and pack.
    Structure: /fusion_recipes/{collection_id}/{collection_id}/{pack_id}/cards/{card_id}
    
    Args:
        db_client: Firestore AsyncClient instance
        collection_id: Optional collection ID filter (e.g., "pokemon")
        pack: Optional pack ID filter to get fusions from a specific pack
        user_id: Optional user ID to calculate needed cards for each recipe
        page: Page number (default 1)
        per_page: Items per page (default 10)
        sort_by: Sort field (default "result_card_id")
        sort_order: Sort direction (default "desc")
        search_query: Optional search query
        
    Returns:
        Dict containing fusion recipes, pagination info, and filters
    """
    if not db_client:
        logger.error("Firestore client not provided to get_all_fusion_recipes.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")
    
    try:
        root_col_ref = db_client.collection('fusion_recipes')
        all_collections = []
        all_recipes = []
        
        # Get user cards if user_id provided
        user_cards = {}
        if user_id:
            try:
                user_ref = db_client.collection('users').document(user_id)
                user_doc = await user_ref.get()
                
                if user_doc.exists:
                    cards_ref = user_ref.collection('cards').document('cards')
                    async for collection_ref in cards_ref.collections():
                        collection_name = collection_ref.id
                        async for card_doc in collection_ref.stream():
                            card_data = card_doc.to_dict()
                            card_id = card_doc.id
                            user_cards[f"{collection_name}:{card_id}"] = card_data.get('quantity', 0)
            except Exception as e:
                logger.error(f"Error fetching user cards: {e}", exc_info=True)
                user_id = None
        
        # If collection_id specified, filter by it
        if collection_id:
            top_doc_ref = root_col_ref.document(collection_id)
            top_snapshot = await top_doc_ref.get()
            if not top_snapshot.exists:
                return {
                    "collections": [],
                    "pagination": {
                        "total_items": 0,
                        "total_pages": 0,
                        "current_page": page,
                        "per_page": per_page
                    },
                    "filters": {
                        "sort_by": sort_by,
                        "sort_order": sort_order,
                        "search_query": search_query
                    }
                }
            
            second_level_col_ref = root_col_ref.document(collection_id).collection(collection_id)
            
            # If pack specified, only get that pack
            if pack:
                pack_doc_ref = second_level_col_ref.document(pack)
                pack_doc = await pack_doc_ref.get()
                
                if pack_doc.exists:
                    cards_col_ref = pack_doc_ref.collection('cards')
                    cards_list = []
                    
                    async for card_doc in cards_col_ref.stream():
                        recipe_data = card_doc.to_dict()
                        result_card_id = recipe_data.get('result_card_id')
                        
                        if search_query and search_query.lower() not in result_card_id.lower():
                            continue
                        
                        ingredients_data = recipe_data.get('ingredients', []) or []
                        ingredients = []
                        cards_needed = 0
                        total_cards_needed = len(ingredients_data)
                        
                        for ing in ingredients_data:
                            ing_card_collection_id = ing.get('card_collection_id')
                            ing_card_id = ing.get('card_id')
                            ing_quantity = ing.get('quantity', 1)
                            
                            if user_id:
                                user_card_key = f"{ing_card_collection_id}:{ing_card_id}"
                                user_quantity = user_cards.get(user_card_key, 0)
                                if user_quantity < ing_quantity:
                                    cards_needed += 1
                            
                            ingredients.append(ing)
                        
                        # Get result card details with signed URL
                        result_card_data = {}
                        try:
                            card_ref_str = recipe_data.get('card_reference', '')
                            if card_ref_str and '/' in card_ref_str:
                                card_ref = card_ref_str.split('/', 1)
                                if len(card_ref) >= 2:
                                    card_collection = card_ref[0]
                                    card_id = card_ref[1]
                                    # Get card from master collection
                                    card_doc_ref = db_client.collection(card_collection).document(card_id)
                                    card_doc = await card_doc_ref.get()
                                    if card_doc.exists:
                                        card_info = card_doc.to_dict()
                                        if card_info:
                                            result_card_data = {
                                                "card_name": card_info.get("card_name", ""),
                                                "image_url": card_info.get("image_url", ""),
                                                "rarity": card_info.get("rarity", ""),
                                                "point_worth": card_info.get("point_worth", 0)
                                            }
                                            # Generate signed URL for result card image
                                            if result_card_data["image_url"]:
                                                # R2 URLs are public, no need to sign them

                                                result_card_data["image_url"] = result_card_data["image_url"]
                        except Exception as e:
                            logger.warning(f"Could not fetch result card details: {e}")
                        
                        # Process ingredients to add card details and signed URLs
                        enhanced_ingredients = []
                        for ing in ingredients:
                            enhanced_ing = dict(ing)
                            try:
                                ing_card_ref_str = ing.get('card_reference', '')
                                if ing_card_ref_str and '/' in ing_card_ref_str:
                                    ing_card_ref = ing_card_ref_str.split('/', 1)
                                    if len(ing_card_ref) >= 2:
                                        ing_collection = ing_card_ref[0]
                                        ing_card_id = ing_card_ref[1]
                                        # Get card from master collection
                                        ing_card_doc_ref = db_client.collection(ing_collection).document(ing_card_id)
                                        ing_card_doc = await ing_card_doc_ref.get()
                                        if ing_card_doc.exists:
                                            ing_card_info = ing_card_doc.to_dict()
                                            if ing_card_info:
                                                enhanced_ing["card_name"] = ing_card_info.get("card_name", "")
                                                enhanced_ing["image_url"] = ing_card_info.get("image_url", "")
                                                enhanced_ing["rarity"] = ing_card_info.get("rarity", "")
                                                enhanced_ing["point_worth"] = ing_card_info.get("point_worth", 0)
                                                # Generate signed URL for ingredient card image
                                                if enhanced_ing["image_url"]:
                                                    # R2 URLs are public, no need to sign them

                                                    enhanced_ing["image_url"] = enhanced_ing["image_url"]
                            except Exception as e:
                                logger.warning(f"Could not fetch ingredient card details: {e}")
                            enhanced_ingredients.append(enhanced_ing)
                        
                        # Build result_card_details structure
                        # Get the image URL, preferring the signed URL from result_card_data
                        result_image_url = result_card_data.get('image_url', '') or recipe_data.get('result_card_image_url', '')
                        # Generate signed URL if it's a GCS URL
                        if result_image_url:
                            try:
                                # R2 URLs are public; no signing required. Just reuse the URL.
                                result_image_url = result_image_url
                                logger.debug(f"Using public result card image URL: {result_image_url}")
                            except Exception as e:
                                logger.warning(f"Could not process result card image URL: {e}")
                        
                        result_card_details = {
                            "card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                            "image_url": result_image_url,
                            "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                            "rarity": result_card_data.get('rarity', 0)
                        }
                        
                        recipe = {
                            "result_card_id": result_card_id,
                            "card_collection_id": recipe_data.get('card_collection_id'),
                            "card_reference": recipe_data.get('card_reference'),
                            "pack_id": recipe_data.get('pack_id'),
                            "pack_collection_id": recipe_data.get('pack_collection_id'),
                            "result_card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                            "result_card_image": result_image_url,
                            "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                            "created_at": recipe_data.get('created_at'),
                            "ingredients": enhanced_ingredients,
                            "result_card_details": result_card_details
                        }
                        
                        if user_id:
                            recipe["cards_needed"] = cards_needed
                            recipe["total_cards_needed"] = total_cards_needed
                        
                        cards_list.append(recipe)
                        all_recipes.append(recipe)
                    
                    if cards_list:
                        packs_list = [{
                            "pack_id": pack,
                            "pack_collection_id": collection_id,
                            "cards": cards_list,
                            "cards_count": len(cards_list)
                        }]
                        
                        all_collections = [{
                            "collection_id": collection_id,
                            "packs": packs_list,
                            "packs_count": 1
                        }]
            else:
                # Get all packs in the collection
                packs_list = []
                
                async for pack_doc in second_level_col_ref.stream():
                    pack_id = pack_doc.id
                    cards_col_ref = second_level_col_ref.document(pack_id).collection('cards')
                    cards_list = []
                    
                    async for card_doc in cards_col_ref.stream():
                        recipe_data = card_doc.to_dict()
                        result_card_id = recipe_data.get('result_card_id')
                        
                        if search_query and search_query.lower() not in result_card_id.lower():
                            continue
                        
                        ingredients_data = recipe_data.get('ingredients', []) or []
                        ingredients = []
                        cards_needed = 0
                        total_cards_needed = len(ingredients_data)
                        
                        for ing in ingredients_data:
                            ing_card_collection_id = ing.get('card_collection_id')
                            ing_card_id = ing.get('card_id')
                            ing_quantity = ing.get('quantity', 1)
                            
                            if user_id:
                                user_card_key = f"{ing_card_collection_id}:{ing_card_id}"
                                user_quantity = user_cards.get(user_card_key, 0)
                                if user_quantity < ing_quantity:
                                    cards_needed += 1
                            
                            ingredients.append(ing)
                        
                        # Get result card details with signed URL
                        result_card_data = {}
                        try:
                            card_ref_str = recipe_data.get('card_reference', '')
                            if card_ref_str and '/' in card_ref_str:
                                card_ref = card_ref_str.split('/', 1)
                                if len(card_ref) >= 2:
                                    card_collection = card_ref[0]
                                    card_id = card_ref[1]
                                    # Get card from master collection
                                    card_doc_ref = db_client.collection(card_collection).document(card_id)
                                    card_doc = await card_doc_ref.get()
                                    if card_doc.exists:
                                        card_info = card_doc.to_dict()
                                        if card_info:
                                            result_card_data = {
                                                "card_name": card_info.get("card_name", ""),
                                                "image_url": card_info.get("image_url", ""),
                                                "rarity": card_info.get("rarity", ""),
                                                "point_worth": card_info.get("point_worth", 0)
                                            }
                                            # Generate signed URL for result card image
                                            if result_card_data["image_url"]:
                                                # R2 URLs are public, no need to sign them

                                                result_card_data["image_url"] = result_card_data["image_url"]
                        except Exception as e:
                            logger.warning(f"Could not fetch result card details: {e}")
                        
                        # Process ingredients to add card details and signed URLs
                        enhanced_ingredients = []
                        for ing in ingredients:
                            enhanced_ing = dict(ing)
                            try:
                                ing_card_ref_str = ing.get('card_reference', '')
                                if ing_card_ref_str and '/' in ing_card_ref_str:
                                    ing_card_ref = ing_card_ref_str.split('/', 1)
                                    if len(ing_card_ref) >= 2:
                                        ing_collection = ing_card_ref[0]
                                        ing_card_id = ing_card_ref[1]
                                        # Get card from master collection
                                        ing_card_doc_ref = db_client.collection(ing_collection).document(ing_card_id)
                                        ing_card_doc = await ing_card_doc_ref.get()
                                        if ing_card_doc.exists:
                                            ing_card_info = ing_card_doc.to_dict()
                                            if ing_card_info:
                                                enhanced_ing["card_name"] = ing_card_info.get("card_name", "")
                                                enhanced_ing["image_url"] = ing_card_info.get("image_url", "")
                                                enhanced_ing["rarity"] = ing_card_info.get("rarity", "")
                                                enhanced_ing["point_worth"] = ing_card_info.get("point_worth", 0)
                                                # Generate signed URL for ingredient card image
                                                if enhanced_ing["image_url"]:
                                                    # R2 URLs are public, no need to sign them

                                                    enhanced_ing["image_url"] = enhanced_ing["image_url"]
                            except Exception as e:
                                logger.warning(f"Could not fetch ingredient card details: {e}")
                            enhanced_ingredients.append(enhanced_ing)
                        
                        # Build result_card_details structure
                        # Get the image URL, preferring the signed URL from result_card_data
                        result_image_url = result_card_data.get('image_url', '') or recipe_data.get('result_card_image_url', '')
                        # Generate signed URL if it's a GCS URL
                        if result_image_url:
                            try:
                                # R2 URLs are public; no signing required. Just reuse the URL.
                                result_image_url = result_image_url
                                logger.debug(f"Using public result card image URL: {result_image_url}")
                            except Exception as e:
                                logger.warning(f"Could not process result card image URL: {e}")
                        
                        result_card_details = {
                            "card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                            "image_url": result_image_url,
                            "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                            "rarity": result_card_data.get('rarity', 0)
                        }
                        
                        recipe = {
                            "result_card_id": result_card_id,
                            "card_collection_id": recipe_data.get('card_collection_id'),
                            "card_reference": recipe_data.get('card_reference'),
                            "pack_id": recipe_data.get('pack_id'),
                            "pack_collection_id": recipe_data.get('pack_collection_id'),
                            "result_card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                            "result_card_image": result_image_url,
                            "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                            "created_at": recipe_data.get('created_at'),
                            "ingredients": enhanced_ingredients,
                            "result_card_details": result_card_details
                        }
                        
                        if user_id:
                            recipe["cards_needed"] = cards_needed
                            recipe["total_cards_needed"] = total_cards_needed
                        
                        cards_list.append(recipe)
                        all_recipes.append(recipe)
                    
                    if cards_list:
                        packs_list.append({
                            "pack_id": pack_id,
                            "pack_collection_id": collection_id,
                            "cards": cards_list,
                            "cards_count": len(cards_list)
                        })
                
                if packs_list:
                    all_collections = [{
                        "collection_id": collection_id,
                        "packs": packs_list,
                        "packs_count": len(packs_list)
                    }]
        else:
            # No collection_id specified - get all collections
            async for doc in root_col_ref.stream():
                doc_id = doc.id
                second_level_col_ref = root_col_ref.document(doc_id).collection(doc_id)
                
                # If pack specified, only check that pack in each collection
                if pack:
                    pack_doc_ref = second_level_col_ref.document(pack)
                    pack_doc = await pack_doc_ref.get()
                    
                    if pack_doc.exists:
                        cards_col_ref = pack_doc_ref.collection('cards')
                        cards_list = []
                        
                        async for card_doc in cards_col_ref.stream():
                            recipe_data = card_doc.to_dict()
                            result_card_id = recipe_data.get('result_card_id')
                            
                            if search_query and search_query.lower() not in result_card_id.lower():
                                continue
                            
                            ingredients_data = recipe_data.get('ingredients', []) or []
                            ingredients = []
                            cards_needed = 0
                            total_cards_needed = len(ingredients_data)
                            
                            for ing in ingredients_data:
                                ing_card_collection_id = ing.get('card_collection_id')
                                ing_card_id = ing.get('card_id')
                                ing_quantity = ing.get('quantity', 1)
                                
                                if user_id:
                                    user_card_key = f"{ing_card_collection_id}:{ing_card_id}"
                                    user_quantity = user_cards.get(user_card_key, 0)
                                    if user_quantity < ing_quantity:
                                        cards_needed += 1
                                
                                ingredients.append(ing)
                            
                            # Get result card details for simpler paths
                            result_card_data = {}
                            try:
                                card_ref_str = recipe_data.get('card_reference', '')
                                if card_ref_str and '/' in card_ref_str:
                                    card_ref = card_ref_str.split('/', 1)
                                    if len(card_ref) >= 2:
                                        card_collection = card_ref[0]
                                        card_id = card_ref[1]
                                        # Get card from master collection
                                        card_doc_ref = db_client.collection(card_collection).document(card_id)
                                        card_doc = await card_doc_ref.get()
                                        if card_doc.exists:
                                            card_info = card_doc.to_dict()
                                            if card_info:
                                                result_card_data = {
                                                    "card_name": card_info.get("card_name", ""),
                                                    "image_url": card_info.get("image_url", ""),
                                                    "rarity": card_info.get("rarity", ""),
                                                    "point_worth": card_info.get("point_worth", 0)
                                                }
                                                # Generate signed URL for result card image
                                                if result_card_data["image_url"]:
                                                    logger.debug(f"Generating signed URL for result card image: {result_card_data['image_url']}")
                                                    # R2 URLs are public, no need to sign them

                                                    result_card_data["image_url"] = result_card_data["image_url"]
                                                    logger.debug(f"Generated signed URL: {result_card_data['image_url']}")
                            except Exception as e:
                                logger.warning(f"Could not fetch result card details: {e}")
                            
                            # Process ingredients to add details and signed URLs
                            enhanced_ingredients = []
                            for ing in ingredients:
                                enhanced_ing = dict(ing)
                                try:
                                    ing_card_ref_str = ing.get('card_reference', '')
                                    if ing_card_ref_str and '/' in ing_card_ref_str:
                                        ing_card_ref = ing_card_ref_str.split('/', 1)
                                        if len(ing_card_ref) >= 2:
                                            ing_collection = ing_card_ref[0]
                                            ing_card_id = ing_card_ref[1]
                                            # Get card from master collection
                                            ing_card_doc_ref = db_client.collection(ing_collection).document(ing_card_id)
                                            ing_card_doc = await ing_card_doc_ref.get()
                                            if ing_card_doc.exists:
                                                ing_card_info = ing_card_doc.to_dict()
                                                if ing_card_info:
                                                    enhanced_ing["card_name"] = ing_card_info.get("card_name", "")
                                                    enhanced_ing["image_url"] = ing_card_info.get("image_url", "")
                                                    enhanced_ing["rarity"] = ing_card_info.get("rarity", "")
                                                    enhanced_ing["point_worth"] = ing_card_info.get("point_worth", 0)
                                                    # Generate signed URL for ingredient card image
                                                    if enhanced_ing["image_url"]:
                                                        logger.debug(f"Generating signed URL for ingredient image: {enhanced_ing['image_url']}")
                                                        # R2 URLs are public, no need to sign them

                                                        enhanced_ing["image_url"] = enhanced_ing["image_url"]
                                                        logger.debug(f"Generated signed URL for ingredient: {enhanced_ing['image_url']}")
                                except Exception as e:
                                    logger.warning(f"Could not fetch ingredient card details: {e}")
                                enhanced_ingredients.append(enhanced_ing)
                            
                            # Build result_card_details structure
                            result_card_details = {
                                "card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                                "image_url": recipe_data.get('result_card_image_url', '') or result_card_data.get('image_url', ''),
                                "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                                "rarity": result_card_data.get('rarity', 0)
                            }
                            
                            recipe = {
                                "result_card_id": result_card_id,
                                "card_collection_id": recipe_data.get('card_collection_id'),
                                "card_reference": recipe_data.get('card_reference'),
                                "pack_id": recipe_data.get('pack_id'),
                                "pack_collection_id": recipe_data.get('pack_collection_id'),
                                "result_card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                                "result_card_image": result_image_url,
                                "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                                "ingredients": enhanced_ingredients,
                                "result_card_details": result_card_details
                            }
                            
                            if user_id:
                                recipe["cards_needed"] = cards_needed
                                recipe["total_cards_needed"] = total_cards_needed
                            
                            cards_list.append(recipe)
                            all_recipes.append(recipe)
                        
                        if cards_list:
                            packs_list = [{
                                "pack_id": pack,
                                "pack_collection_id": doc_id,
                                "cards": cards_list,
                                "cards_count": len(cards_list)
                            }]
                            
                            all_collections.append({
                                "collection_id": doc_id,
                                "packs": packs_list,
                                "packs_count": 1
                            })
                else:
                    # Get all packs in each collection
                    packs_list = []
                    
                    async for pack_doc in second_level_col_ref.stream():
                        pack_id = pack_doc.id
                        cards_col_ref = second_level_col_ref.document(pack_id).collection('cards')
                        cards_list = []
                        
                        async for card_doc in cards_col_ref.stream():
                            recipe_data = card_doc.to_dict()
                            result_card_id = recipe_data.get('result_card_id')
                            
                            if search_query and search_query.lower() not in result_card_id.lower():
                                continue
                            
                            ingredients_data = recipe_data.get('ingredients', []) or []
                            ingredients = []
                            cards_needed = 0
                            total_cards_needed = len(ingredients_data)
                            
                            for ing in ingredients_data:
                                ing_card_collection_id = ing.get('card_collection_id')
                                ing_card_id = ing.get('card_id')
                                ing_quantity = ing.get('quantity', 1)
                                
                                if user_id:
                                    user_card_key = f"{ing_card_collection_id}:{ing_card_id}"
                                    user_quantity = user_cards.get(user_card_key, 0)
                                    if user_quantity < ing_quantity:
                                        cards_needed += 1
                                
                                ingredients.append(ing)
                            
                            # Get result card details for simpler paths
                            result_card_data = {}
                            try:
                                card_ref_str = recipe_data.get('card_reference', '')
                                if card_ref_str and '/' in card_ref_str:
                                    card_ref = card_ref_str.split('/', 1)
                                    if len(card_ref) >= 2:
                                        card_collection = card_ref[0]
                                        card_id = card_ref[1]
                                        # Get card from master collection
                                        card_doc_ref = db_client.collection(card_collection).document(card_id)
                                        card_doc = await card_doc_ref.get()
                                        if card_doc.exists:
                                            card_info = card_doc.to_dict()
                                            if card_info:
                                                result_card_data = {
                                                    "card_name": card_info.get("card_name", ""),
                                                    "image_url": card_info.get("image_url", ""),
                                                    "rarity": card_info.get("rarity", ""),
                                                    "point_worth": card_info.get("point_worth", 0)
                                                }
                                                # Generate signed URL for result card image
                                                if result_card_data["image_url"]:
                                                    logger.debug(f"Generating signed URL for result card image: {result_card_data['image_url']}")
                                                    # R2 URLs are public, no need to sign them

                                                    result_card_data["image_url"] = result_card_data["image_url"]
                                                    logger.debug(f"Generated signed URL: {result_card_data['image_url']}")
                            except Exception as e:
                                logger.warning(f"Could not fetch result card details: {e}")
                            
                            # Process ingredients to add details and signed URLs
                            enhanced_ingredients = []
                            for ing in ingredients:
                                enhanced_ing = dict(ing)
                                try:
                                    ing_card_ref_str = ing.get('card_reference', '')
                                    if ing_card_ref_str and '/' in ing_card_ref_str:
                                        ing_card_ref = ing_card_ref_str.split('/', 1)
                                        if len(ing_card_ref) >= 2:
                                            ing_collection = ing_card_ref[0]
                                            ing_card_id = ing_card_ref[1]
                                            # Get card from master collection
                                            ing_card_doc_ref = db_client.collection(ing_collection).document(ing_card_id)
                                            ing_card_doc = await ing_card_doc_ref.get()
                                            if ing_card_doc.exists:
                                                ing_card_info = ing_card_doc.to_dict()
                                                if ing_card_info:
                                                    enhanced_ing["card_name"] = ing_card_info.get("card_name", "")
                                                    enhanced_ing["image_url"] = ing_card_info.get("image_url", "")
                                                    enhanced_ing["rarity"] = ing_card_info.get("rarity", "")
                                                    enhanced_ing["point_worth"] = ing_card_info.get("point_worth", 0)
                                                    # Generate signed URL for ingredient card image
                                                    if enhanced_ing["image_url"]:
                                                        logger.debug(f"Generating signed URL for ingredient image: {enhanced_ing['image_url']}")
                                                        # R2 URLs are public, no need to sign them

                                                        enhanced_ing["image_url"] = enhanced_ing["image_url"]
                                                        logger.debug(f"Generated signed URL for ingredient: {enhanced_ing['image_url']}")
                                except Exception as e:
                                    logger.warning(f"Could not fetch ingredient card details: {e}")
                                enhanced_ingredients.append(enhanced_ing)
                            
                            # Build result_card_details structure
                            result_card_details = {
                                "card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                                "image_url": recipe_data.get('result_card_image_url', '') or result_card_data.get('image_url', ''),
                                "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                                "rarity": result_card_data.get('rarity', 0)
                            }
                            
                            recipe = {
                                "result_card_id": result_card_id,
                                "card_collection_id": recipe_data.get('card_collection_id'),
                                "card_reference": recipe_data.get('card_reference'),
                                "pack_id": recipe_data.get('pack_id'),
                                "pack_collection_id": recipe_data.get('pack_collection_id'),
                                "result_card_name": recipe_data.get('result_card_name', '') or result_card_data.get('card_name', ''),
                                "result_card_image": result_image_url,
                                "point_worth": recipe_data.get('result_card_point_worth', 0) or result_card_data.get('point_worth', 0),
                                "ingredients": enhanced_ingredients,
                                "result_card_details": result_card_details
                            }
                            
                            if user_id:
                                recipe["cards_needed"] = cards_needed
                                recipe["total_cards_needed"] = total_cards_needed
                            
                            cards_list.append(recipe)
                            all_recipes.append(recipe)
                        
                        if cards_list:
                            packs_list.append({
                                "pack_id": pack_id,
                                "pack_collection_id": doc_id,
                                "cards": cards_list,
                                "cards_count": len(cards_list)
                            })
                    
                    if packs_list:
                        all_collections.append({
                            "collection_id": doc_id,
                            "packs": packs_list,
                            "packs_count": len(packs_list)
                        })
        
        # Calculate pagination
        total_recipes = len(all_recipes)
        total_pages = (total_recipes + per_page - 1) // per_page if total_recipes > 0 else 0
        current_page = min(page, total_pages) if total_pages > 0 else 1
        
        # Apply pagination to recipes
        start_idx = (current_page - 1) * per_page
        end_idx = start_idx + per_page
        
        # Sort recipes if needed
        if sort_by == "result_card_id":
            reverse = sort_order.lower() == "desc"
            all_recipes.sort(key=lambda x: x.get("result_card_id", ""), reverse=reverse)
        
        # Paginate the sorted recipes
        paginated_recipes = all_recipes[start_idx:end_idx]
        
        # Rebuild collections structure with only paginated recipes
        paginated_collections = []
        for collection in all_collections:
            paginated_packs = []
            for pack in collection["packs"]:
                paginated_cards = [
                    card for card in pack["cards"]
                    if any(
                        card["result_card_id"] == recipe["result_card_id"]
                        for recipe in paginated_recipes
                    )
                ]
                if paginated_cards:
                    paginated_packs.append({
                        "pack_id": pack["pack_id"],
                        "pack_collection_id": pack["pack_collection_id"],
                        "cards": paginated_cards,
                        "cards_count": len(paginated_cards)
                    })
            
            if paginated_packs:
                paginated_collections.append({
                    "collection_id": collection["collection_id"],
                    "packs": paginated_packs,
                    "packs_count": len(paginated_packs)
                })
        
        return {
            "collections": paginated_collections,
            "pagination": {
                "total_items": total_recipes,
                "total_pages": total_pages,
                "current_page": current_page,
                "per_page": per_page
            },
            "filters": {
                "sort_by": sort_by,
                "sort_order": sort_order,
                "search_query": search_query,
                "pack": pack
            }
        }
        
    except Exception as e:
        logger.error(f"Error retrieving fusion recipes from Firestore: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve fusion recipes from database.")


async def get_fusion_packs_in_collection(
    db_client: AsyncClient,
    collection_id: str,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "pack_id",
    sort_order: str = "asc",
    search_query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Efficiently get all ACTIVE packs in a collection that have fusion recipes.

    Notes:
    - Search, sort, and pagination are handled on the frontend per request.
    - We avoid per-pack count aggregations. We simply intersect:
      active packs (packs/... where is_active == True) ∩ packs that exist under
      fusion_recipes/{collection_id}/{collection_id}.

    Args:
        db_client: Firestore AsyncClient instance
        collection_id: The collection ID to get packs from (e.g., "pokemon")
        page, per_page, sort_by, sort_order, search_query: kept for backward compatibility (ignored)
        
    Returns:
        Dict containing collection_id and a flat list of packs [{pack_id, pack_name}].
    """
    if not db_client:
        logger.error("Firestore client not provided to get_fusion_packs_in_collection.")
        raise HTTPException(status_code=500, detail="Firestore service not configured (client missing).")

    try:
        # 1) Fetch all ACTIVE packs for this collection from packs/{collection_id}/{collection_id}
        active_pack_names: Dict[str, str] = {}
        try:
            packs_ref = (
                db_client.collection('packs')
                .document(collection_id)
                .collection(collection_id)
                .where('is_active', '==', True)
            )
            active_docs = await packs_ref.get()
            for doc in active_docs:
                data = doc.to_dict() or {}
                pack_id = doc.id
                # Prefer pack_name, fall back to name, then id
                pack_name = data.get('pack_name') or data.get('name') or pack_id
                active_pack_names[pack_id] = pack_name
        except Exception as e:
            logger.error(f"Error fetching active packs for collection '{collection_id}': {e}", exc_info=True)
            # If we cannot resolve active packs, return empty safely
            return {"collection_id": collection_id, "packs": [], "total_packs": 0}

        if not active_pack_names:
            return {"collection_id": collection_id, "packs": [], "total_packs": 0}

        # 2) List all packs that have fusion recipes under fusion_recipes/{collection_id}/{collection_id}
        fusion_packs_ref = (
            db_client.collection('fusion_recipes')
            .document(collection_id)
            .collection(collection_id)
        )

        result_packs = []
        async for fusion_pack_doc in fusion_packs_ref.stream():
            pack_id = fusion_pack_doc.id
            # Only include if this pack is active
            if pack_id in active_pack_names:
                result_packs.append({
                    "pack_id": pack_id,
                    "pack_name": active_pack_names[pack_id]
                })

        return {
            "collection_id": collection_id,
            "packs": result_packs,
            "total_packs": len(result_packs)
        }

    except Exception as e:
        logger.error(f"Error retrieving fusion packs from collection {collection_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve fusion packs from database.")


async def get_card_by_id(
    document_id: str, 
    collection_name: str | None = None,
    db_client: AsyncClient = None
) -> StoredCardInfo:
    """
    Retrieves all data for a specific card from Firestore by its ID.
    If collection_name is provided, it fetches metadata from Firestore to find the actual collection.

    Returns:
        StoredCardInfo: Complete data for the requested card

    Raises:
        HTTPException: 404 if card not found, 500 for other errors
    """
    if not db_client:
        from config import get_firestore_client
        db_client = get_firestore_client()

    # Determine the effective collection name
    if collection_name:
        # Try to get the metadata for the collection from Firestore
        try:
            metadata = await get_collection_metadata_from_firestore(collection_name, db_client)
            effective_collection_name = metadata.get("firestoreCollection", collection_name)
            logger.info(f"Using metadata for collection '{collection_name}': firestoreCollection='{effective_collection_name}'")
        except HTTPException as e:
            if e.status_code == 404:
                # If metadata not found, use the provided collection_name as is
                effective_collection_name = collection_name
                logger.warning(f"Metadata for collection '{collection_name}' not found. Using provided collection_name as is.")
            else:
                # For other HTTP exceptions, re-raise
                raise e
    else:
        # Default to cards collection
        effective_collection_name = settings.firestore_collection_cards
    
    doc_ref = db_client.collection(effective_collection_name).document(document_id)

    try:
        doc = await doc_ref.get()

        if not doc.exists:
            logger.warning(f"Card with ID {document_id} not found in collection '{effective_collection_name}'.")
            raise HTTPException(status_code=404, detail=f"Card with ID {document_id} not found")

        # Get the card data and add the document ID
        card_data = doc.to_dict()
        card_data['id'] = document_id
        
        # Ensure condition field exists with default value if not present
        if 'condition' not in card_data:
            card_data['condition'] = 'near_mint'

        # Generate signed URL for the image if it's a GCS URI or signed URL
        if 'image_url' in card_data and card_data['image_url']:
            try:
                # R2 URLs are public, no need to sign them

                card_data['image_url'] = card_data['image_url']
                logger.debug(f"Generated signed URL for image: {card_data['image_url']}")
            except Exception as sign_error:
                logger.error(f"Failed to generate signed URL for {card_data['image_url']}: {sign_error}")
                # Keep the original URL if signing fails

        return StoredCardInfo(**card_data)

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error retrieving card {document_id} from '{effective_collection_name}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve card data from collection '{effective_collection_name}': {str(e)}")
