import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, async_transactional
from google.cloud.firestore_v1.field_path import FieldPath
from fastapi import HTTPException
from shippo import Shippo

from models.schemas import (
    UserCard, WithdrawRequest, WithdrawRequestDetail, WithdrawRequestsResponse,
    PaginationInfo
)
from config import get_logger, settings
# No need for storage utils - R2 URLs are public

logger = get_logger(__name__)


async def withdraw_pending_ship_request(request_id: str, user_id: str, db_client: AsyncClient = None) -> WithdrawRequestDetail:
    """
    Withdraw (cancel) a pending ship request and return the cards back to the user's collection.

    This function:
    1. Retrieves the existing withdraw request
    2. Validates that the request has a status of 'pending'
    3. Returns the cards in the withdraw request back to the user's collection
    4. Marks the withdraw request as 'canceled'

    Args:
        request_id: The ID of the withdraw request to withdraw
        user_id: The ID of the user who owns the withdraw request
        db_client: Firestore client

    Returns:
        WithdrawRequestDetail object containing the updated withdraw request details

    Raises:
        HTTPException: If there's an error withdrawing the request
    """
    try:
        logger.info(f"Withdrawing pending ship request {request_id} for user {user_id}")

        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the withdraw request
        withdraw_request_ref = user_ref.collection('withdraw_requests').document(request_id)
        withdraw_request_doc = await withdraw_request_ref.get()

        if not withdraw_request_doc.exists:
            raise HTTPException(status_code=404, detail=f"Withdraw request with ID {request_id} not found for user {user_id}")

        # Get the withdraw request data
        withdraw_request_data = withdraw_request_doc.to_dict()

        # Check if the withdraw request is in a state that can be withdrawn
        status = withdraw_request_data.get('status', 'pending')
        if status not in ['pending', 'insufficient_funds']:
            raise HTTPException(status_code=400, detail=f"Cannot withdraw request with status '{status}'. Only 'pending' and 'insufficient_funds' requests can be withdrawn.")

        # Get the cards in the withdraw request
        request_cards_ref = withdraw_request_ref.collection('cards')
        cards_docs = await request_cards_ref.get()

        if not cards_docs:
            logger.warning(f"No cards found in withdraw request {request_id}")

        # Pre-fetch all user cards before the transaction
        user_cards_data = {}
        for card_doc in cards_docs:
            card_data = card_doc.to_dict()
            card_id = card_doc.id
            subcollection_name = card_data.get('subcollection_name', 'cards')
            
            # Get the card in the user's collection if it exists
            user_card_ref = user_ref.collection('cards').document('cards').collection(subcollection_name).document(card_id)
            user_card_doc = await user_card_ref.get()
            
            user_cards_data[card_id] = {
                'card_data': card_data,
                'card_quantity': card_data.get('quantity', 1),
                'subcollection_name': subcollection_name,
                'user_card_ref': user_card_ref,
                'user_card_exists': user_card_doc.exists,
                'user_card_data': user_card_doc.to_dict() if user_card_doc.exists else None
            }

        # Use a transaction to return the cards to the user's collection and delete the withdraw request
        @async_transactional
        async def withdraw_request_transaction(transaction):
            # Return each card to the user's collection
            for card_id, card_info in user_cards_data.items():
                user_card_ref = card_info['user_card_ref']
                card_quantity = card_info['card_quantity']
                
                if card_info['user_card_exists']:
                    # Card exists in user's collection, update quantity
                    current_quantity = card_info['user_card_data'].get('quantity', 0)
                    transaction.update(user_card_ref, {
                        'quantity': current_quantity + card_quantity
                    })
                else:
                    # Card doesn't exist in user's collection, create it
                    transaction.set(user_card_ref, {
                        **card_info['card_data'],
                        'quantity': card_quantity
                    })
            
            # Delete all cards from the withdraw request
            for card_doc in cards_docs:
                card_ref = withdraw_request_ref.collection('cards').document(card_doc.id)
                transaction.delete(card_ref)
            
            # Delete the withdraw request document
            transaction.delete(withdraw_request_ref)

        # Store the withdraw request data before deletion
        original_withdraw_request_data = withdraw_request_data.copy()
        
        # Execute the transaction
        await withdraw_request_transaction(db_client.transaction())

        # Delete the corresponding card_shipping document
        try:
            card_shipping_ref = db_client.collection('card_shipping').document(request_id)
            await card_shipping_ref.delete()
            logger.info(f"Successfully deleted card shipping entry for withdraw request {request_id}")
        except Exception as e:
            logger.error(f"Error deleting card shipping entry for withdraw request {request_id}: {e}", exc_info=True)
            # Don't raise an exception here, the main operation was successful

        # Get the cards that were in the withdraw request (for the response)
        cards = []
        for card_doc in cards_docs:
            card_data = card_doc.to_dict()
            card = UserCard(**card_data)
            cards.append(card)

        # Create and return the WithdrawRequestDetail object with canceled status
        withdraw_request_detail = WithdrawRequestDetail(
            id=request_id,
            created_at=original_withdraw_request_data.get('created_at'),
            request_date=original_withdraw_request_data.get('request_date'),
            status='canceled',
            user_id=original_withdraw_request_data.get('user_id', user_id),
            user_email=original_withdraw_request_data.get('user_email', ''),
            card_count=original_withdraw_request_data.get('card_count', len(cards)),
            cards=cards,
            shipping_address=original_withdraw_request_data.get('shipping_address'),
            shippo_address_id=original_withdraw_request_data.get('shippo_address_id'),
            shippo_parcel_id=original_withdraw_request_data.get('shippo_parcel_id'),
            shippo_shipment_id=original_withdraw_request_data.get('shippo_shipment_id'),
            shippo_transaction_id=original_withdraw_request_data.get('shippo_transaction_id'),
            shippo_label_url=original_withdraw_request_data.get('shippo_label_url'),
            tracking_number=original_withdraw_request_data.get('tracking_number'),
            tracking_url=original_withdraw_request_data.get('tracking_url'),
            shipping_status='canceled'
        )

        logger.info(f"Successfully canceled and deleted withdraw request {request_id} for user {user_id}")
        return withdraw_request_detail

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error withdrawing pending ship request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to withdraw pending ship request: {str(e)}")


async def withdraw_ship_multiple_cards(user_id: str, cards_to_withdraw: List[Dict[str, Any]], address_id: str, phone_number: str, db_client: AsyncClient) -> List[UserCard]:
    """
    Withdraw or ship multiple cards from a user's collection by creating a single withdraw request.
    The withdraw request contains fields for request date and status, and a subcollection "cards"
    that contains all withdrawn cards.
    For each card, if quantity is less than the card's quantity, only move the specified quantity.
    Only remove a card from the original subcollection if the remaining quantity is 0.

    Note: Withdrawal fees are handled by cloud functions.
    Note: Shippo integration for shipping labels is handled separately and not in this function.

    Args:
        user_id: The ID of the user who owns the cards
        cards_to_withdraw: List of dictionaries containing card_id, quantity, and subcollection_name for each card to withdraw
        address_id: The ID of the address to ship the cards to
        phone_number: The phone number of the recipient for shipping purposes
        db_client: Firestore client

    Returns:
        List of the updated withdrawn cards as UserCard objects

    Raises:
        HTTPException: If there's an error withdrawing the cards or if the user doesn't have enough points
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get user data to find the address
        user_data = user_doc.to_dict()
        user_addresses = user_data.get('addresses', [])

        # Validate cards to withdraw
        if not cards_to_withdraw:
            raise HTTPException(status_code=400, detail="No cards specified for withdrawal")

        # Find the address with the given ID
        shipping_address = None
        for address in user_addresses:
            if address.get('id') == address_id:
                shipping_address = address
                break

        if not shipping_address:
            raise HTTPException(status_code=404, detail=f"Address with ID {address_id} not found for user {user_id}")

        # Create a new withdraw request
        withdraw_requests_ref = user_ref.collection('withdraw_requests')
        new_request_ref = withdraw_requests_ref.document()  # Auto-generate ID
        request_cards_ref = new_request_ref.collection('cards')

        # Prepare data for transaction
        cards_data = []
        for card_info in cards_to_withdraw:
            card_id = card_info.get('card_id')
            quantity = card_info.get('quantity', 1)
            subcollection_name = card_info.get('subcollection_name')

            if not card_id:
                raise HTTPException(status_code=400, detail="Card ID is required for each card")

            if not subcollection_name:
                raise HTTPException(status_code=400, detail=f"Subcollection name is required for card {card_id}")

            if quantity <= 0:
                raise HTTPException(status_code=400, detail=f"Quantity must be greater than 0 for card {card_id}")

            # Get the card from the source subcollection
            source_card_ref = user_ref.collection('cards').document('cards').collection(subcollection_name).document(card_id)
            source_card_doc = await source_card_ref.get()

            if not source_card_doc.exists:
                raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in subcollection {subcollection_name}")

            source_card_data = source_card_doc.to_dict()
            card = UserCard(**source_card_data)
            card_quantity = card.quantity
            
            # Validate point_worth
            point_worth = source_card_data.get('point_worth', 0)
            if point_worth < 150:
                raise HTTPException(status_code=400, detail=f"Card {card_id} cannot be withdrawn. Only cards with point_worth >= 150 can be withdrawn (current: {point_worth})")

            # Validate quantity
            if quantity > card_quantity:
                raise HTTPException(status_code=400, detail=f"Cannot withdraw/ship {quantity} of card {card_id}, only {card_quantity} available")

            # Get the main card reference and pre-fetch it
            main_card_ref = user_ref.collection('cards').document(card_id)
            main_card_doc = await main_card_ref.get()

            # Add card data to the list
            cards_data.append({
                'card_id': card_id,
                'quantity': quantity,
                'subcollection_name': subcollection_name,
                'source_card_ref': source_card_ref,
                'source_card_data': source_card_data,
                'remaining_quantity': card_quantity - quantity,
                'main_card_ref': main_card_ref,
                'main_card_doc': main_card_doc,
                'request_card_ref': request_cards_ref.document(card_id)
            })

        # Create transaction to process all cards
        @firestore.async_transactional
        async def create_withdraw_request(transaction):
            # IMPORTANT: Firestore requires all reads to happen before any writes in a transaction.
            # First, re-read all relevant documents INSIDE the transaction and re-validate quantities.
            per_card_runtime = []
            for card_data in cards_data:
                card_id = card_data['card_id']
                quantity_to_withdraw = card_data['quantity']
                source_card_ref = card_data['source_card_ref']
                main_card_ref = card_data['main_card_ref']
                request_card_ref = card_data['request_card_ref']
                subcollection_name = card_data['subcollection_name']

                # Read source and main card docs inside the transaction
                source_snap = await source_card_ref.get(transaction=transaction)
                if not source_snap.exists:
                    raise HTTPException(status_code=404, detail=f"Card with ID {card_id} not found in subcollection {subcollection_name}")
                source_data = source_snap.to_dict() or {}
                current_qty = source_data.get('quantity', 0)
                if quantity_to_withdraw > current_qty:
                    raise HTTPException(status_code=400, detail=f"Cannot withdraw/ship {quantity_to_withdraw} of card {card_id}, only {current_qty} available")
                remaining_quantity = current_qty - quantity_to_withdraw

                # Read main card doc (optional) inside the transaction
                main_snap = await main_card_ref.get(transaction=transaction)

                # Prepare request card payload (copy of source with adjusted qty and subcollection)
                request_card_data = dict(source_data)
                request_card_data['quantity'] = quantity_to_withdraw
                request_card_data['subcollection_name'] = subcollection_name

                per_card_runtime.append({
                    'card_id': card_id,
                    'quantity_to_withdraw': quantity_to_withdraw,
                    'remaining_quantity': remaining_quantity,
                    'source_card_ref': source_card_ref,
                    'main_card_ref': main_card_ref,
                    'main_exists': main_snap.exists,
                    'request_card_ref': request_card_ref,
                    'request_card_data': request_card_data,
                    'subcollection_name': subcollection_name
                })

            # After all reads are completed, perform writes
            now = datetime.now()
            request_data = {
                'request_date': now,
                'status': 'pending',  # Initial status is pending
                'user_id': user_id,
                'user_email': user_data.get('email', ''),  # Add user's email to the withdrawal request
                'created_at': now,
                'card_count': len(cards_data),  # Add count of cards in this request
                'shipping_address': shipping_address,  # Add shipping address
                'shipping_status': 'pending'  # Initial shipping status
            }
            transaction.set(new_request_ref, request_data)

            for item in per_card_runtime:
                # Add the card to the request cards subcollection
                transaction.set(item['request_card_ref'], item['request_card_data'])

                # Update/delete user's card quantities
                if item['remaining_quantity'] <= 0:
                    transaction.delete(item['source_card_ref'])
                    if item['main_exists']:
                        transaction.delete(item['main_card_ref'])
                    logger.info(f"Created withdraw request for all {item['quantity_to_withdraw']} of card {item['card_id']} from user {user_id}'s subcollection {item['subcollection_name']}")
                else:
                    transaction.update(item['source_card_ref'], {"quantity": item['remaining_quantity']})
                    if item['main_exists']:
                        transaction.update(item['main_card_ref'], {"quantity": item['remaining_quantity']})
                    logger.info(f"Created withdraw request for {item['quantity_to_withdraw']} of card {item['card_id']} from user {user_id}'s subcollection {item['subcollection_name']}, {item['remaining_quantity']} remaining")

        # Execute the transaction
        transaction = db_client.transaction()
        await create_withdraw_request(transaction)

        # Get the updated cards from the withdraw request
        withdrawn_cards = []
        for card_data in cards_data:
            card_id = card_data['card_id']
            request_card_ref = card_data['request_card_ref']

            updated_request_card_doc = await request_card_ref.get()
            updated_request_card_data = updated_request_card_doc.to_dict()

            # Ensure ID is part of the data
            if 'id' not in updated_request_card_data:
                updated_request_card_data['id'] = card_id

            # R2 URLs are public, no need to sign them

            # Create a UserCard object from the updated request card data
            withdrawn_card = UserCard(
                card_reference=updated_request_card_data.get("card_reference", ""),
                card_name=updated_request_card_data.get("card_name", ""),
                date_got=updated_request_card_data.get("date_got"),
                id=updated_request_card_data.get("id", card_id),
                image_url=updated_request_card_data.get("image_url", ""),
                point_worth=updated_request_card_data.get("point_worth", 0),
                quantity=updated_request_card_data.get("quantity", 0),
                rarity=updated_request_card_data.get("rarity", 1)
            )

            # Add optional fields if they exist in the data
            if "expireAt" in updated_request_card_data:
                withdrawn_card.expireAt = updated_request_card_data["expireAt"]
            if "buybackexpiresAt" in updated_request_card_data:
                withdrawn_card.buybackexpiresAt = updated_request_card_data["buybackexpiresAt"]
            if "request_date" in updated_request_card_data:
                withdrawn_card.request_date = updated_request_card_data["request_date"]

            withdrawn_cards.append(withdrawn_card)

        # Now that the transaction is complete, create an entry in the card_shipping collection
        try:
            # Create a document in the card_shipping collection
            card_shipping_ref = db_client.collection('card_shipping').document(new_request_ref.id)

            # Get the withdraw request data
            request_doc = await new_request_ref.get()
            request_data = request_doc.to_dict()

            # Prepare the card shipping data
            card_shipping_data = {
                'request_id': new_request_ref.id,
                'user_id': user_id,
                'user_email': user_data.get('email', ''),  # Add user's email to the card shipping record
                'request_date': request_data.get('request_date'),
                'status': request_data.get('status', 'pending'),
                'shipping_address': shipping_address,
                'shipping_status': request_data.get('shipping_status', 'pending'),
                'card_count': len(cards_data),
                'created_at': datetime.now(),
                'phone_number': phone_number
            }

            # Add the cards data to the card shipping document
            cards_list = []
            for card_data in cards_data:
                card_id = card_data['card_id']
                request_card_ref = card_data['request_card_ref']
                request_card_doc = await request_card_ref.get()
                request_card_data = request_card_doc.to_dict()

                card_info = {
                    'card_id': card_id,
                    'card_reference': request_card_data.get('card_reference', ''),
                    'card_name': request_card_data.get('card_name', ''),
                    'quantity': request_card_data.get('quantity', 0),
                    'image_url': request_card_data.get('image_url', ''),
                    'rarity': request_card_data.get('rarity', 1),
                    'point_worth': request_card_data.get('point_worth', 0)
                }
                cards_list.append(card_info)

            card_shipping_data['cards'] = cards_list

            # Set the card shipping document
            await card_shipping_ref.set(card_shipping_data)

            logger.info(f"Successfully created card shipping entry for withdraw request {new_request_ref.id}")
        except Exception as e:
            logger.error(f"Error creating card shipping entry for withdraw request {new_request_ref.id}: {e}", exc_info=True)
            # Don't raise an exception here, just log the error and continue
            # The withdraw request was created successfully, but the card shipping entry creation failed

        # Note: Shippo integration for shipping labels is now handled separately
        logger.info(f"Withdraw request {new_request_ref.id} created successfully. Shipping will be handled separately.")

        logger.info(f"Successfully created withdraw request for {len(withdrawn_cards)} cards from user {user_id}'s subcollection {subcollection_name}")
        return withdrawn_cards

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error creating withdraw request for multiple cards for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create withdraw request: {str(e)}")


async def get_all_withdraw_requests(user_id: str, db_client: AsyncClient, page: int = 1, per_page: int = 10, sort_by: str = "created_at", sort_order: str = "desc") -> WithdrawRequestsResponse:
    """
    Get all withdraw requests for a specific user with pagination.

    Args:
        user_id: The ID of the user to get withdraw requests for
        db_client: Firestore client
        page: The page number to get (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "created_at")
        sort_order: The sort order ("asc" or "desc", default: "desc")

    Returns:
        WithdrawRequestsResponse containing the withdraw requests and pagination information

    Raises:
        HTTPException: If there's an error getting the withdraw requests or if the user doesn't exist
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get withdraw requests for this user
        withdraw_requests_ref = user_ref.collection('withdraw_requests')

        # Create the base query
        query = withdraw_requests_ref

        # Count total items
        count_agg_query = query.count()
        count_snapshot = await count_agg_query.get()
        total_items = count_snapshot[0][0].value if count_snapshot and count_snapshot[0] else 0

        if total_items == 0:
            logger.info(f"No withdraw requests found for user {user_id}")
            return WithdrawRequestsResponse(
                withdraw_requests=[],
                pagination=PaginationInfo(
                    total_items=0,
                    items_per_page=per_page,
                    current_page=page,
                    total_pages=0
                )
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
        query_with_sort = query.order_by(sort_by, direction=direction)

        # Apply pagination
        current_page_query = max(1, page)
        per_page_query = max(1, per_page)
        offset = (current_page_query - 1) * per_page_query

        paginated_query = query_with_sort.limit(per_page_query).offset(offset)

        # Execute the query
        logger.info(f"Executing Firestore query for withdraw requests for user {user_id} with pagination and sorting")
        withdraw_requests = await paginated_query.get()

        user_withdraw_requests = []

        # Convert each withdraw request to a WithdrawRequest object
        for request in withdraw_requests:
            request_data = request.to_dict()
            withdraw_request = WithdrawRequest(
                id=request.id,
                created_at=request_data.get('created_at'),
                request_date=request_data.get('request_date'),
                status=request_data.get('status', 'pending'),
                user_id=request_data.get('user_id', user_id),
                user_email=request_data.get('user_email', ''),
                card_count=request_data.get('card_count'),
                shipping_address=request_data.get('shipping_address'),
                shippo_address_id=request_data.get('shippo_address_id'),
                shippo_parcel_id=request_data.get('shippo_parcel_id'),
                shippo_shipment_id=request_data.get('shippo_shipment_id'),
                shippo_transaction_id=request_data.get('shippo_transaction_id'),
                shippo_label_url=request_data.get('shippo_label_url'),
                tracking_number=request_data.get('tracking_number'),
                tracking_url=request_data.get('tracking_url'),
                shipping_status=request_data.get('shipping_status')
            )
            user_withdraw_requests.append(withdraw_request)

        # Calculate total pages
        total_pages = math.ceil(total_items / per_page_query)

        # Create and return the response
        response = WithdrawRequestsResponse(
            withdraw_requests=user_withdraw_requests,
            pagination=PaginationInfo(
                total_items=total_items,
                items_per_page=per_page_query,
                current_page=current_page_query,
                total_pages=total_pages
            )
        )

        logger.info(f"Retrieved {len(user_withdraw_requests)} withdraw requests for user {user_id} (page {current_page_query} of {total_pages})")
        return response
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting withdraw requests for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get withdraw requests for user {user_id}: {str(e)}")


async def get_withdraw_request_by_id(request_id: str, user_id: str, db_client: AsyncClient) -> WithdrawRequestDetail:
    """
    Get a specific withdraw request by ID.
    This function also checks the status of the shipment with the Shippo API and updates the status in Firestore.

    Args:
        request_id: The ID of the withdraw request to get
        user_id: The ID of the user who made the withdraw request
        db_client: Firestore client

    Returns:
        WithdrawRequestDetail object containing the withdraw request details and cards

    Raises:
        HTTPException: If there's an error getting the withdraw request
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the withdraw request
        withdraw_request_ref = user_ref.collection('withdraw_requests').document(request_id)
        withdraw_request_doc = await withdraw_request_ref.get()

        if not withdraw_request_doc.exists:
            raise HTTPException(status_code=404, detail=f"Withdraw request with ID {request_id} not found for user {user_id}")

        # Get the withdraw request data
        withdraw_request_data = withdraw_request_doc.to_dict()

        # Check if the withdraw request has a Shippo transaction ID
        shippo_transaction_id = withdraw_request_data.get('shippo_transaction_id')
        if shippo_transaction_id:
            # Initialize the Shippo SDK with API key
            if not hasattr(settings, 'shippo_api_key') or not settings.shippo_api_key:
                logger.error("Shippo API key not configured")
                raise HTTPException(status_code=500, detail="Shipping service not configured")

            shippo_sdk = Shippo(
                api_key_header=settings.shippo_api_key
            )

            try:
                # Retrieve the transaction from Shippo
                shippo_transaction = shippo_sdk.transactions.get(shippo_transaction_id)

                # Get the current status from Shippo
                current_status = shippo_transaction.status

                # Map Shippo status to our shipping_status
                shipping_status_map = {
                    'QUEUED': 'label_created',
                    'WAITING': 'label_created',
                    'PROCESSING': 'label_created',
                    'SUCCESS': 'label_created',
                    'ERROR': 'error',
                    'DELIVERED': 'delivered',
                    'TRANSIT': 'shipped',
                    'FAILURE': 'error',
                    'RETURNED': 'returned',
                    'UNKNOWN': 'unknown'
                }

                # Get the current shipping_status from Firestore
                current_shipping_status = withdraw_request_data.get('shipping_status', 'pending')

                # Map the Shippo status to our shipping_status
                new_shipping_status = shipping_status_map.get(current_status, current_shipping_status)

                # Update the shipping_status in Firestore if it has changed
                if new_shipping_status != current_shipping_status:
                    await withdraw_request_ref.update({
                        'shipping_status': new_shipping_status
                    })
                    withdraw_request_data['shipping_status'] = new_shipping_status
                    logger.info(f"Updated shipping status for withdraw request {request_id} from {current_shipping_status} to {new_shipping_status}")
            except Exception as e:
                logger.error(f"Error checking shipment status for withdraw request {request_id}: {e}", exc_info=True)
                # Don't raise an exception here, just log the error and continue
                # The withdraw request can still be returned with its current status

        # Get the cards in the withdraw request
        cards_ref = withdraw_request_ref.collection('cards')
        cards_docs = await cards_ref.get()

        cards = []
        for card_doc in cards_docs:
            card_data = card_doc.to_dict()
            
            # R2 URLs are public, no need to sign them
            
            card = UserCard(**card_data)
            cards.append(card)

        # Create and return the WithdrawRequestDetail object
        withdraw_request_detail = WithdrawRequestDetail(
            id=withdraw_request_doc.id,
            created_at=withdraw_request_data.get('created_at'),
            request_date=withdraw_request_data.get('request_date'),
            status=withdraw_request_data.get('status', 'pending'),
            user_id=withdraw_request_data.get('user_id', user_id),
            user_email=withdraw_request_data.get('user_email', ''),
            card_count=withdraw_request_data.get('card_count', len(cards)),
            cards=cards,
            shipping_address=withdraw_request_data.get('shipping_address'),
            shippo_address_id=withdraw_request_data.get('shippo_address_id'),
            shippo_parcel_id=withdraw_request_data.get('shippo_parcel_id'),
            shippo_shipment_id=withdraw_request_data.get('shippo_shipment_id'),
            shippo_transaction_id=withdraw_request_data.get('shippo_transaction_id'),
            shippo_label_url=withdraw_request_data.get('shippo_label_url'),
            tracking_number=withdraw_request_data.get('tracking_number'),
            tracking_url=withdraw_request_data.get('tracking_url'),
            shipping_status=withdraw_request_data.get('shipping_status')
        )

        logger.info(f"Retrieved withdraw request {request_id} for user {user_id} with {len(cards)} cards")
        return withdraw_request_detail
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get withdraw request: {str(e)}")


async def update_withdraw_request(request_id: str, user_id: str, address_id: Optional[str] = None, phone_number: Optional[str] = None, db_client: AsyncClient = None) -> WithdrawRequestDetail:
    """
    Update an existing withdraw request's phone number and/or address only.

    This function:
    1. Retrieves the existing withdraw request
    2. Validates the user and address
    3. Updates only the phone number and/or shipping address
    4. Returns the updated withdraw request

    Args:
        request_id: The ID of the withdraw request to update
        user_id: The ID of the user who owns the withdraw request
        address_id: The ID of the address to ship the cards to (optional)
        phone_number: The phone number of the recipient for shipping purposes (optional)
        db_client: Firestore client

    Returns:
        WithdrawRequestDetail object containing the updated withdraw request details

    Raises:
        HTTPException: If there's an error updating the withdraw request
    """
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Get the withdraw request
        withdraw_request_ref = user_ref.collection('withdraw_requests').document(request_id)
        withdraw_request_doc = await withdraw_request_ref.get()

        if not withdraw_request_doc.exists:
            raise HTTPException(status_code=404, detail=f"Withdraw request with ID {request_id} not found for user {user_id}")

        # Get the withdraw request data
        withdraw_request_data = withdraw_request_doc.to_dict()

        # Check if the withdraw request is in a state that can be updated
        status = withdraw_request_data.get('status', 'pending')
        if status != 'pending':
            raise HTTPException(status_code=400, detail=f"Cannot update withdraw request with status '{status}'. Only 'pending' requests can be updated.")

        # At least one of address_id or phone_number must be provided
        if not address_id and not phone_number:
            raise HTTPException(status_code=400, detail="At least one of address_id or phone_number must be provided")

        # Get shipping address from existing request
        shipping_address = withdraw_request_data.get('shipping_address')

        # Update shipping address if address_id is provided
        if address_id:
            # Get user data to find the address
            user_data = user_doc.to_dict()
            user_addresses = user_data.get('addresses', [])

            # Find the address with the given ID
            new_shipping_address = None
            for address in user_addresses:
                if address.get('id') == address_id:
                    new_shipping_address = address
                    break

            if not new_shipping_address:
                raise HTTPException(status_code=404, detail=f"Address with ID {address_id} not found for user {user_id}")

            # Update shipping address
            shipping_address = new_shipping_address

        # Update the withdraw request with new address and/or phone number
        update_data = {}
        
        if shipping_address:
            update_data['shipping_address'] = shipping_address
            
        # Update the withdraw request document
        await withdraw_request_ref.update(update_data)

        # Update the card_shipping collection with new address and/or phone number if needed
        try:
            # Get the card_shipping document
            card_shipping_ref = db_client.collection('card_shipping').document(request_id)
            card_shipping_doc = await card_shipping_ref.get()

            if card_shipping_doc.exists:
                # Prepare update data for card_shipping
                shipping_update_data = {
                    'updated_at': datetime.now()
                }
                
                if shipping_address:
                    shipping_update_data['shipping_address'] = shipping_address
                    
                if phone_number:
                    shipping_update_data['phone_number'] = phone_number

                # Update the card shipping document
                await card_shipping_ref.update(shipping_update_data)
                logger.info(f"Successfully updated card shipping entry for withdraw request {request_id}")
            else:
                logger.warning(f"Card shipping document for withdraw request {request_id} not found")
        except Exception as e:
            logger.error(f"Error updating card shipping entry for withdraw request {request_id}: {e}", exc_info=True)
            # Don't raise an exception here, just log the error and continue

        # Get the updated withdraw request
        updated_withdraw_request = await get_withdraw_request_by_id(request_id, user_id, db_client)
        return updated_withdraw_request

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating withdraw request {request_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")