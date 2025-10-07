from typing import Optional, Dict, List, Tuple, Any
from datetime import datetime, timedelta
import requests
import math

from fastapi import HTTPException
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient, SERVER_TIMESTAMP, async_transactional, Increment
from config import get_logger, settings, get_typesense_client
from models.schemas import CreateCardListingRequest, OfferPointsRequest, OfferCashRequest, UpdatePointOfferRequest, UpdateCashOfferRequest, CardListing, MarketplaceTransaction, SimpleMarketplaceTransaction, PaginationInfo, AppliedFilters, CreateListingResponse
from models.marketplace_schemas import PaginatedListingsResponse, OfficialListingResponse, OfficialListingCardInfo
from service.card_service import get_user_card, add_card_to_user, get_collection_metadata
from service.account_service import get_user_by_id
# No need for storage utils - R2 URLs are public
from config.db_connection import db_connection

logger = get_logger(__name__)

async def update_image_url_in_database(card_id: str, signed_url: str, collection_name: str) -> None:
    """
    Updates the image_url field in Firestore with a new signed URL.
    This helps avoid regenerating URLs unnecessarily.
    """
    try:
        from config import get_firestore_client
        db_client = get_firestore_client()
        doc_ref = db_client.collection(collection_name).document(card_id)
        await doc_ref.update({'image_url': signed_url})
        logger.debug(f"Successfully updated image_url in Firestore for card {card_id} in collection {collection_name}")
    except Exception as e:
        logger.warning(f"Failed to update image_url for card {card_id}: {e}")
        # Don't raise the exception as this is not critical for the main operation

async def send_offer_accepted_email(to_email: str, to_name: str, listing_data: dict, offer_type: str, offer_amount: float or int):
    """
    Send an email notification to a user when their offer has been accepted.

    Args:
        to_email: The email address of the recipient
        to_name: The name of the recipient
        listing_data: Dictionary containing listing information
        offer_type: Type of offer ("cash" or "point")
        offer_amount: Amount of the offer

    Returns:
        The response from the Mailgun API

    Raises:
        HTTPException: If there's an error sending the email
    """
    try:
        # Get collection name from collection_id
        collection_name = 'N/A'
        collection_id = listing_data.get('collection_id')
        if collection_id:
            try:
                collection_metadata = await get_collection_metadata(collection_id)
                collection_name = collection_metadata.get('name', collection_id)
            except Exception as e:
                logger.warning(f"Failed to get collection metadata for {collection_id}: {e}")
                collection_name = collection_id  # Fallback to collection_id if metadata fetch fails
        
        # Format the offer amount based on type
        formatted_amount = f"${offer_amount:.2f}" if offer_type.lower() == "cash" else f"{offer_amount} points"
        
        # Generate a transaction ID for reference
        transaction_id = f"TXN-{listing_data.get('id', 'NA')[:8].upper()}"
        current_date = datetime.now().strftime("%B %d, %Y")

        # Construct the email subject and body - more transactional, less promotional
        subject = f"Transaction Confirmation - Offer Accepted for {listing_data.get('card_name', 'Item')}"
        text = f"""Dear {to_name},

This email confirms that your offer has been accepted for the following item:

Transaction ID: {transaction_id}
Date: {current_date}

TRANSACTION DETAILS
-------------------
Item: {listing_data.get('card_name', 'N/A')}
Collection: {collection_name}
Payment Method: {offer_type.title()}
Transaction Amount: {formatted_amount}
Item Condition: {listing_data.get('condition', 'N/A').title()}

IMPORTANT - ACTION REQUIRED
---------------------------
Payment Deadline: Within 48 hours from {current_date}
Status: Awaiting Payment

To complete this transaction, please log in to your account and proceed with the payment.

Account Access: https://zapull.fun/account
Transaction Support: support@zapull.fun

This is an automated transaction notification. Please do not reply directly to this email.

Thank you for using Zapull.

Zapull Trading Platform
Transaction Services Department
"""

        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Transaction Confirmation</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #ffffff;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff;">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 0 20px 20px; border-bottom: 2px solid #e9ecef;">
                                    <h1 style="font-size: 20px; font-weight: 600; color: #2c3e50; margin: 0;">Transaction Confirmation</h1>
                                    <p style="font-size: 14px; color: #6c757d; margin: 5px 0 0;">Transaction ID: {transaction_id}</p>
                                </td>
                            </tr>
                            
                            <!-- Main Content -->
                            <tr>
                                <td style="padding: 30px 20px;">
                                    <p style="font-size: 16px; margin: 0 0 20px;">Dear {to_name},</p>
                                    
                                    <p style="font-size: 14px; color: #495057; margin: 0 0 25px;">
                                        This email confirms that your offer has been accepted. Please review the transaction details below:
                                    </p>
                                    
                                    <!-- Transaction Details Table -->
                                    <table role="presentation" style="width: 100%; border: 1px solid #dee2e6; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px; background-color: #f8f9fa;">
                                                <h2 style="font-size: 14px; font-weight: 600; color: #495057; margin: 0 0 15px; text-transform: uppercase; letter-spacing: 0.5px;">Transaction Details</h2>
                                                
                                                <table role="presentation" style="width: 100%;">
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Item:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right; font-weight: 500;">{listing_data.get('card_name', 'N/A')}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Collection:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{collection_name}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Payment Method:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{offer_type.title()}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d; border-top: 1px solid #dee2e6;">Total Amount:</td>
                                                        <td style="padding: 8px 0; font-size: 16px; color: #2c3e50; text-align: right; font-weight: 600; border-top: 1px solid #dee2e6;">{formatted_amount}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Action Required Notice -->
                                    <table role="presentation" style="width: 100%; background-color: #fff5ec; border: 1px solid #ffddcc; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px;">
                                                <h3 style="font-size: 14px; font-weight: 600; color: #d84315; margin: 0 0 10px;">ACTION REQUIRED</h3>
                                                <p style="font-size: 14px; color: #6c757d; margin: 0 0 5px;">Payment must be completed within <strong>48 hours</strong> to secure this transaction.</p>
                                                <p style="font-size: 14px; color: #6c757d; margin: 0;">Current Status: <strong style="color: #f57c00;">Awaiting Payment</strong></p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- CTA Button -->
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td align="center">
                                                <a href="https://zapull.fun/account" style="display: inline-block; padding: 12px 30px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500;">Complete Payment</a>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="font-size: 13px; color: #6c757d; margin: 0;">
                                        If you have any questions about this transaction, please contact our support team at 
                                        <a href="mailto:support@zapull.fun" style="color: #007bff; text-decoration: none;">support@zapull.fun</a>
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; border-top: 1px solid #e9ecef;">
                                    <p style="font-size: 12px; color: #6c757d; margin: 0; text-align: center;">
                                        This is an automated transaction notification from Zapull Trading Platform.<br>
                                        Please do not reply directly to this email.<br>
                                        © {datetime.now().year} Zapull. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

        # Send the email using Mailgun API with additional headers
        response = requests.post(
            "https://api.mailgun.net/v3/mg.zapull.fun/messages",
            auth=("api", settings.mailgun_api),
            data={
                "from": "Zapull Transaction Services <transactions@mg.zapull.fun>",
                "to": f"{to_name} <{to_email}>",
                "subject": subject,
                "text": text,
                "html": html,
                "h:Reply-To": "support@zapull.fun",
                "h:X-Priority": "1",
                "h:Importance": "high"
            }
        )

        if response.status_code != 200:
            logger.error(f"Failed to send email: {response.text}")
            return None

        logger.info(f"Successfully sent offer accepted email to {to_email}")
        return response

    except Exception as e:
        logger.error(f"Error sending offer accepted email: {e}", exc_info=True)
        return None

async def send_item_sold_email(to_email: str, to_name: str, listing_data: dict, offer_type: str, offer_amount: float or int, buyer_name: str):
    """
    Send an email notification to a seller when their item has been sold.

    Args:
        to_email: The email address of the seller
        to_name: The name of the seller
        listing_data: Dictionary containing listing information
        offer_type: Type of offer ("cash" or "point")
        offer_amount: Amount of the offer
        buyer_name: Name of the buyer

    Returns:
        The response from the Mailgun API

    Raises:
        HTTPException: If there's an error sending the email
    """
    try:
        # Get collection name from collection_id
        collection_name = 'N/A'
        collection_id = listing_data.get('collection_id')
        if collection_id:
            try:
                collection_metadata = await get_collection_metadata(collection_id)
                collection_name = collection_metadata.get('name', collection_id)
            except Exception as e:
                logger.warning(f"Failed to get collection metadata for {collection_id}: {e}")
                collection_name = collection_id  # Fallback to collection_id if metadata fetch fails
        
        # Format the offer amount based on type
        formatted_amount = f"${offer_amount:.2f}" if offer_type.lower() == "cash" else f"{offer_amount} points"
        
        # Generate sale reference and date
        sale_reference = f"SALE-{listing_data.get('id', 'NA')[:8].upper()}"
        current_date = datetime.now().strftime("%B %d, %Y")
        current_time = datetime.now().strftime("%I:%M %p %Z")

        # Construct the email subject and body - transactional format
        subject = f"Sale Confirmation - {listing_data.get('card_name', 'Item')} Successfully Sold"
        text = f"""Dear {to_name},

This email confirms the successful sale of your listed item.

Sale Reference: {sale_reference}
Date: {current_date}
Time: {current_time}

SALE DETAILS
------------
Item Sold: {listing_data.get('card_name', 'N/A')}
Collection: {collection_name}
Buyer: {buyer_name}
Payment Method: {offer_type.title()}
Sale Amount: {formatted_amount}
Item Condition: {listing_data.get('condition', 'N/A').title()}

PAYMENT INFORMATION
-------------------
Account Dashboard: https://zapull.fun/account

For transaction inquiries, please reference Sale ID: {sale_reference}
Contact Support: support@zapull.fun

This is an automated sale confirmation. Please do not reply directly to this email.

Thank you for using Zapull Trading Platform.

Zapull Trading Platform
Seller Services Department
"""

        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Sale Confirmation</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #ffffff;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff;">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 0 20px 20px; border-bottom: 2px solid #e9ecef;">
                                    <h1 style="font-size: 20px; font-weight: 600; color: #2c3e50; margin: 0;">Sale Confirmation</h1>
                                    <p style="font-size: 14px; color: #6c757d; margin: 5px 0 0;">Reference: {sale_reference}</p>
                                </td>
                            </tr>
                            
                            <!-- Main Content -->
                            <tr>
                                <td style="padding: 30px 20px;">
                                    <p style="font-size: 16px; margin: 0 0 20px;">Dear {to_name},</p>
                                    
                                    <p style="font-size: 14px; color: #495057; margin: 0 0 25px;">
                                        Your item has been successfully sold. Transaction details are provided below for your records.
                                    </p>
                                    
                                    <!-- Sale Details Table -->
                                    <table role="presentation" style="width: 100%; border: 1px solid #dee2e6; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px; background-color: #f8f9fa;">
                                                <h2 style="font-size: 14px; font-weight: 600; color: #495057; margin: 0 0 15px; text-transform: uppercase; letter-spacing: 0.5px;">Sale Summary</h2>
                                                
                                                <table role="presentation" style="width: 100%;">
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Item:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right; font-weight: 500;">{listing_data.get('card_name', 'N/A')}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Collection:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{collection_name}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Buyer:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{buyer_name}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Payment Method:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{offer_type.title()}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d; border-top: 1px solid #dee2e6;">Sale Amount:</td>
                                                        <td style="padding: 8px 0; font-size: 16px; color: #28a745; text-align: right; font-weight: 600; border-top: 1px solid #dee2e6;">{formatted_amount}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Payment Information -->
                                    <table role="presentation" style="width: 100%; background-color: #f0f9ff; border: 1px solid #bee5eb; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px;">
                                                <h3 style="font-size: 14px; font-weight: 600; color: #0c5460; margin: 0 0 10px;">PAYMENT INFORMATION</h3>
                                                <p style="font-size: 14px; color: #495057; margin: 0;">You can view your account balance and transaction history in your dashboard.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Account Access Button -->
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td align="center">
                                                <a href="https://zapull.fun/account" style="display: inline-block; padding: 12px 30px; background-color: #28a745; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500;">View Account Balance</a>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="font-size: 13px; color: #6c757d; margin: 0;">
                                        For questions about this sale, please contact 
                                        <a href="mailto:support@zapull.fun" style="color: #007bff; text-decoration: none;">support@zapull.fun</a> 
                                        with reference number {sale_reference}.
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; border-top: 1px solid #e9ecef;">
                                    <p style="font-size: 12px; color: #6c757d; margin: 0; text-align: center;">
                                        This is an automated sale confirmation from Zapull Trading Platform.<br>
                                        Please retain this email for your records.<br>
                                        © {datetime.now().year} Zapull. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

        # Send the email using Mailgun API with enhanced headers
        response = requests.post(
            "https://api.mailgun.net/v3/mg.zapull.fun/messages",
            auth=("api", settings.mailgun_api),
            data={
                "from": "Zapull Sales Department <sales@mg.zapull.fun>",
                "to": f"{to_name} <{to_email}>",
                "subject": subject,
                "text": text,
                "html": html,
                "h:Reply-To": "support@zapull.fun",
                "h:X-Priority": "3",
                "h:X-Transaction-Type": "sale-confirmation"
            }
        )

        if response.status_code != 200:
            logger.error(f"Failed to send email: {response.text}")
            return None

        logger.info(f"Successfully sent item sold email to {to_email}")
        return response

    except Exception as e:
        logger.error(f"Error sending item sold email: {e}", exc_info=True)
        return None

async def send_purchase_confirmation_email(to_email: str, to_name: str, listing_data: dict, offer_type: str, offer_amount: float | int):
    """
    Send a purchase confirmation to the buyer when they complete payment
    (either points offer payment or cash buy now).
    """
    try:
        collection_name = 'N/A'
        collection_id = listing_data.get('collection_id')
        if collection_id:
            try:
                collection_metadata = await get_collection_metadata(collection_id)
                collection_name = collection_metadata.get('name', collection_id)
            except Exception as e:
                logger.warning(f"Failed to get collection metadata for {collection_id}: {e}")
                collection_name = collection_id

        formatted_amount = f"${offer_amount:.2f}" if offer_type.lower() == "cash" else f"{int(offer_amount)} points"
        reference = f"PUR-{listing_data.get('id', 'NA')[:8].upper()}"
        current_date = datetime.now().strftime("%B %d, %Y")

        subject = f"Purchase Confirmation - {listing_data.get('card_name', 'Item')}"
        text = f"""Dear {to_name},

Your payment was successful. Here are your purchase details:

Reference: {reference}
Date: {current_date}
Item: {listing_data.get('card_name', 'N/A')}
Collection: {collection_name}
Payment Method: {offer_type.title()}
Amount: {formatted_amount}

You can view your updated collection and transaction history in your account.

Account Dashboard: https://zapull.fun/account

Thank you for using Zapull.
"""
        html = text.replace('\n', '<br/>')

        response = requests.post(
            "https://api.mailgun.net/v3/mg.zapull.fun/messages",
            auth=("api", settings.mailgun_api),
            data={
                "from": "Zapull Purchases <purchases@mg.zapull.fun>",
                "to": f"{to_name} <{to_email}>",
                "subject": subject,
                "text": text,
                "html": f"<html><body style='font-family:Arial, sans-serif'>{html}</body></html>",
                "h:Reply-To": "support@zapull.fun",
                "h:X-Transaction-Type": "purchase-confirmation"
            }
        )
        if response.status_code != 200:
            logger.error(f"Failed to send purchase confirmation email: {response.text}")
            return None
        logger.info(f"Sent purchase confirmation email to {to_email}")
        return response
    except Exception as e:
        logger.error(f"Error sending purchase confirmation email: {e}", exc_info=True)
        return None

async def send_recharge_confirmation_email(to_email: str, to_name: str, amount: float, points_granted: int, transaction_id: str):
    """
    Send an email confirmation when a user successfully recharges their account.

    Args:
        to_email: The email address of the recipient
        to_name: The name of the recipient
        amount: The dollar amount recharged
        points_granted: The number of points granted
        transaction_id: The transaction reference ID

    Returns:
        The response from the Mailgun API

    Raises:
        HTTPException: If there's an error sending the email
    """
    try:
        # Format the amount
        formatted_amount = f"${amount:.2f}"
        
        # Generate reference and timestamp
        recharge_reference = f"RCH-{transaction_id[:8].upper()}" if transaction_id else f"RCH-{datetime.now().strftime('%Y%m%d%H%M%S')}"
        current_date = datetime.now().strftime("%B %d, %Y")
        current_time = datetime.now().strftime("%I:%M %p %Z")

        # Construct the email subject and body - transactional format
        subject = f"Payment Receipt - Account Recharge Successful"
        text = f"""Dear {to_name},

This email confirms your account recharge has been processed successfully.

Receipt Number: {recharge_reference}
Date: {current_date}
Time: {current_time}

TRANSACTION DETAILS
-------------------
Payment Amount: {formatted_amount}
Points Credited: {points_granted:,} points
Payment Method: Credit/Debit Card
Status: Completed

Your points have been added to your account and are immediately available for use.

Account Dashboard: https://zapull.fun/account

For transaction inquiries, reference: {recharge_reference}
Contact Support: support@zapull.fun

This is an automated payment receipt. Please retain for your records.

Zapull Trading Platform
Billing Department
"""

        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Payment Receipt</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #ffffff;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff;">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 0 20px 20px; border-bottom: 2px solid #e9ecef;">
                                    <h1 style="font-size: 20px; font-weight: 600; color: #2c3e50; margin: 0;">Payment Receipt</h1>
                                    <p style="font-size: 14px; color: #6c757d; margin: 5px 0 0;">Receipt #: {recharge_reference}</p>
                                </td>
                            </tr>
                            
                            <!-- Main Content -->
                            <tr>
                                <td style="padding: 30px 20px;">
                                    <p style="font-size: 16px; margin: 0 0 20px;">Dear {to_name},</p>
                                    
                                    <p style="font-size: 14px; color: #495057; margin: 0 0 25px;">
                                        Your account recharge has been processed successfully. Details are provided below.
                                    </p>
                                    
                                    <!-- Transaction Details Table -->
                                    <table role="presentation" style="width: 100%; border: 1px solid #dee2e6; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px; background-color: #f8f9fa;">
                                                <h2 style="font-size: 14px; font-weight: 600; color: #495057; margin: 0 0 15px; text-transform: uppercase; letter-spacing: 0.5px;">Transaction Summary</h2>
                                                
                                                <table role="presentation" style="width: 100%;">
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Date:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{current_date}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Payment Amount:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right; font-weight: 500;">{formatted_amount}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Points Credited:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #28a745; text-align: right; font-weight: 500;">{points_granted:,} points</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d; border-top: 1px solid #dee2e6;">Status:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #28a745; text-align: right; font-weight: 600; border-top: 1px solid #dee2e6;">Completed</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Account Status -->
                                    <table role="presentation" style="width: 100%; background-color: #d4edda; border: 1px solid #c3e6cb; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px;">
                                                <p style="font-size: 14px; color: #155724; margin: 0;">
                                                    <strong>Points Available</strong><br>
                                                    Your points have been added to your account and are ready to use.
                                                </p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- View Account Button -->
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td align="center">
                                                <a href="https://zapull.fun/account" style="display: inline-block; padding: 12px 30px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500;">View Account</a>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="font-size: 13px; color: #6c757d; margin: 0;">
                                        For questions about this transaction, contact 
                                        <a href="mailto:support@zapull.fun" style="color: #007bff; text-decoration: none;">support@zapull.fun</a> 
                                        with reference number {recharge_reference}.
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; border-top: 1px solid #e9ecef;">
                                    <p style="font-size: 12px; color: #6c757d; margin: 0; text-align: center;">
                                        This is an automated payment receipt from Zapull Trading Platform.<br>
                                        Please retain this email for your records.<br>
                                        © {datetime.now().year} Zapull. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

        # Send the email using Mailgun API with transactional headers
        response = requests.post(
            "https://api.mailgun.net/v3/mg.zapull.fun/messages",
            auth=("api", settings.mailgun_api),
            data={
                "from": "Zapull Billing <billing@mg.zapull.fun>",
                "to": f"{to_name} <{to_email}>",
                "subject": subject,
                "text": text,
                "html": html,
                "h:Reply-To": "support@zapull.fun",
                "h:X-Priority": "3",
                "h:X-Transaction-Type": "payment-receipt"
            }
        )

        if response.status_code != 200:
            logger.error(f"Failed to send email: {response.text}")
            return None

        logger.info(f"Successfully sent recharge confirmation email to {to_email}")
        return response

    except Exception as e:
        logger.error(f"Error sending recharge confirmation email: {e}", exc_info=True)
        return None

async def send_new_highest_offer_email(to_email: str, to_name: str, listing_data: dict, offer_type: str, offer_amount: float or int, offerer_name: str):
    """
    Send an email notification to a seller when their listing receives a new highest offer.

    Args:
        to_email: The email address of the seller
        to_name: The name of the seller
        listing_data: Dictionary containing listing information
        offer_type: Type of offer ("cash" or "point")
        offer_amount: Amount of the offer
        offerer_name: Name of the person making the offer

    Returns:
        The response from the Mailgun API

    Raises:
        HTTPException: If there's an error sending the email
    """
    try:
        # Get collection name from collection_id
        collection_name = 'N/A'
        collection_id = listing_data.get('collection_id')
        if collection_id:
            try:
                collection_metadata = await get_collection_metadata(collection_id)
                collection_name = collection_metadata.get('name', collection_id)
            except Exception as e:
                logger.warning(f"Failed to get collection metadata for {collection_id}: {e}")
                collection_name = collection_id  # Fallback to collection_id if metadata fetch fails
        
        # Format the offer amount based on type
        formatted_amount = f"${offer_amount:.2f}" if offer_type.lower() == "cash" else f"{offer_amount} points"
        
        # Generate offer reference and timestamp
        offer_reference = f"OFFER-{listing_data.get('id', 'NA')[:8].upper()}"
        current_date = datetime.now().strftime("%B %d, %Y")
        current_time = datetime.now().strftime("%I:%M %p %Z")

        # Construct the email subject and body - transactional format
        subject = f"New Highest Offer Notification - {listing_data.get('card_name', 'Your Listed Item')}"
        text = f"""Dear {to_name},

You have received a new highest offer on your listed item.

Offer Reference: {offer_reference}
Date: {current_date}
Time: {current_time}

OFFER DETAILS
-------------
Listed Item: {listing_data.get('card_name', 'N/A')}
Collection: {collection_name}
Buyer: {offerer_name}
Offer Type: {offer_type.title()}
Offer Amount: {formatted_amount}
Item Condition: {listing_data.get('condition', 'N/A').title()}

ACTION REQUIRED
---------------
Please review this offer in your seller dashboard.
You may accept or wait for additional offers.

Access Dashboard: https://zapull.fun/marketplace/my-listings

For assistance with this offer, reference: {offer_reference}
Contact Support: support@zapull.fun

This is an automated offer notification. Please do not reply directly to this email.

Zapull Trading Platform
Seller Services Department
"""

        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>New Highest Offer Notification</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #ffffff;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 0;">
                        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff;">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 0 20px 20px; border-bottom: 2px solid #e9ecef;">
                                    <h1 style="font-size: 20px; font-weight: 600; color: #2c3e50; margin: 0;">New Highest Offer</h1>
                                    <p style="font-size: 14px; color: #6c757d; margin: 5px 0 0;">Reference: {offer_reference}</p>
                                </td>
                            </tr>
                            
                            <!-- Main Content -->
                            <tr>
                                <td style="padding: 30px 20px;">
                                    <p style="font-size: 16px; margin: 0 0 20px;">Dear {to_name},</p>
                                    
                                    <p style="font-size: 14px; color: #495057; margin: 0 0 25px;">
                                        You have received a new highest offer on your listed item. Details are provided below.
                                    </p>
                                    
                                    <!-- Offer Details Table -->
                                    <table role="presentation" style="width: 100%; border: 1px solid #dee2e6; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px; background-color: #f8f9fa;">
                                                <h2 style="font-size: 14px; font-weight: 600; color: #495057; margin: 0 0 15px; text-transform: uppercase; letter-spacing: 0.5px;">Offer Details</h2>
                                                
                                                <table role="presentation" style="width: 100%;">
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Listed Item:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right; font-weight: 500;">{listing_data.get('card_name', 'N/A')}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Collection:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{collection_name}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Buyer:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{offerer_name}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d;">Offer Type:</td>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">{offer_type.title()}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="padding: 8px 0; font-size: 14px; color: #6c757d; border-top: 1px solid #dee2e6;">Offer Amount:</td>
                                                        <td style="padding: 8px 0; font-size: 16px; color: #007bff; text-align: right; font-weight: 600; border-top: 1px solid #dee2e6;">{formatted_amount}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Action Required Notice -->
                                    <table role="presentation" style="width: 100%; background-color: #fff5ec; border: 1px solid #ffddcc; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px;">
                                                <h3 style="font-size: 14px; font-weight: 600; color: #d84315; margin: 0 0 10px;">ACTION REQUIRED</h3>
                                        <p style="font-size: 14px; color: #6c757d; margin: 0;">Please review this offer in your seller dashboard. You may accept or wait for additional offers.</p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Dashboard Access Button -->
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td align="center">
                                                <a href="https://zapull.fun/marketplace/my-listings" style="display: inline-block; padding: 12px 30px; background-color: #007bff; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 14px; font-weight: 500;">Review Offer</a>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="font-size: 13px; color: #6c757d; margin: 0;">
                                        For assistance with this offer, contact 
                                        <a href="mailto:support@zapull.fun" style="color: #007bff; text-decoration: none;">support@zapull.fun</a> 
                                        with reference number {offer_reference}.
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; border-top: 1px solid #e9ecef;">
                                    <p style="font-size: 12px; color: #6c757d; margin: 0; text-align: center;">
                                        This is an automated offer notification from Zapull Trading Platform.<br>
                                        Please do not reply directly to this email.<br>
                                        © {datetime.now().year} Zapull. All rights reserved.
                                    </p>
                                </td>
                            </tr>
                        </table>
                    </td>
                </tr>
            </table>
        </body>
        </html>
        """

        # Send the email using Mailgun API with transactional headers
        response = requests.post(
            "https://api.mailgun.net/v3/mg.zapull.fun/messages",
            auth=("api", settings.mailgun_api),
            data={
                "from": "Zapull Seller Services <seller@mg.zapull.fun>",
                "to": f"{to_name} <{to_email}>",
                "subject": subject,
                "text": text,
                "html": html,
                "h:Reply-To": "support@zapull.fun",
                "h:X-Priority": "2",
                "h:X-Transaction-Type": "offer-notification"
            }
        )

        if response.status_code != 200:
            logger.error(f"Failed to send email: {response.text}")
            return None

        logger.info(f"Successfully sent new highest offer email to {to_email}")
        return response

    except Exception as e:
        logger.error(f"Error sending new highest offer email: {e}", exc_info=True)
        return None

async def withdraw_listing(
    user_id: str,
    listing_id: str,
    db_client: AsyncClient
) -> dict:
    """
    Withdraw a listing for a card that a user has put up for sale.

    This function:
    1. Verifies the listing exists
    2. Verifies the user is the owner of the listing
    3. Gets the card reference and quantity from the listing
    4. Updates the user's card in a transaction to decrease locked_quantity and increase quantity
    5. Deletes the listing
    6. Returns a success message

    Args:
        user_id: The ID of the user withdrawing the listing
        listing_id: The ID of the listing to withdraw
        db_client: Firestore async client

    Returns:
        dict: A dictionary with a success message

    Raises:
        HTTPException: If there's an error withdrawing the listing
    """
    try:
        # 1. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 2. Verify user is the owner of the listing
        owner_reference = listing_data.get("owner_reference", "")
        if owner_reference != user_id:
            raise HTTPException(status_code=403, detail="You are not authorized to withdraw this listing")

        # Check if the listing has an accepted offer
        if listing_data.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="Cannot withdraw a listing with an accepted offer")

        # 3. Get card reference and quantity from the listing
        card_reference = listing_data.get("card_reference", "")
        listing_quantity = listing_data.get("quantity", 0)

        if not card_reference or listing_quantity <= 0:
            raise HTTPException(status_code=400, detail="Invalid listing data")

        # Parse card_reference to get collection_id and card_id
        try:
            collection_id, card_id = card_reference.split('/')
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid card reference format: {card_reference}")

        collection_id = listing_data.get("collection_id", collection_id)
        logger.info(f"collection_id: {collection_id}")

        # Get reference to the user's card
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        card_ref = user_ref.collection('cards').document('cards').collection(collection_id).document(card_id)

        # Check if the card still exists
        card_doc = await card_ref.get()

        # Get all point offers for this listing
        point_offers_ref = listing_ref.collection('point_offers')
        point_offers = await point_offers_ref.get()

        # Get all cash offers for this listing
        cash_offers_ref = listing_ref.collection('cash_offers')
        cash_offers = await cash_offers_ref.get()

        # Define the transaction function
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            if card_doc.exists:
                # Card exists, update quantity
                card_data = card_doc.to_dict()
                current_quantity = card_data.get('quantity', 0)
                current_locked_quantity = card_data.get('locked_quantity', 0)

                # Ensure we don't go below zero for locked_quantity
                new_locked_quantity = max(0, current_locked_quantity - listing_quantity)

                # Update the card with incremented quantity and decremented locked_quantity
                tx.update(card_ref, {
                    'quantity': current_quantity + listing_quantity,
                    'locked_quantity': new_locked_quantity
                })

            # Delete all point offers for this listing
            for offer in point_offers:
                tx.delete(point_offers_ref.document(offer.id))

            # Delete all cash offers for this listing
            for offer in cash_offers:
                tx.delete(cash_offers_ref.document(offer.id))

            # Delete the listing
            tx.delete(listing_ref)

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        logger.info(f"Successfully withdrew listing {listing_id} for user {user_id}")
        return {"message": f"Listing {listing_id} withdrawn successfully"}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error withdrawing listing {listing_id} for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to withdraw listing: {str(e)}")

async def create_card_listing(
    user_id: str,
    listing_request: CreateCardListingRequest,
    db_client: AsyncClient
) -> CreateListingResponse:
    """
    Create a listing for a card that a user wants to sell.

    This function:
    1. Verifies the user exists
    2. If listing with priceCash, checks Stripe Connect status
       - If not connected, creates a Stripe Connect account and returns onboarding URL
       - If incomplete, creates a Stripe Dashboard link and returns login URL
    3. Gets collection_id and card_id from the request
    4. Gets the user's card to retrieve card_reference and card data
    5. Checks if the user has enough available quantity
    6. Creates listing document
    7. Creates a new document in the "listings" collection
    8. Updates user's card locked_quantity and quantity in a transaction
    9. Gets the created listing
    10. Creates and returns a CardListing object

    Args:
        user_id: The ID of the user creating the listing
        listing_request: The CreateCardListingRequest containing listing details
        db_client: Firestore async client

    Returns:
        CardListing: The created listing or a dictionary with onboarding/login URL

    Raises:
        HTTPException: If there's an error creating the listing
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # 2. If listing with priceCash, check Stripe Connect status
        if listing_request.priceCash is not None and listing_request.priceCash > 0:
            from service.payment_service import check_stripe_connect_status, create_stripe_connect_account, create_stripe_dashboard_link

            # Check Stripe Connect status
            status_result = await check_stripe_connect_status(user_id, db_client)
            status = status_result.get("status")

            # If status is not ready, handle accordingly
            if status != "ready":
                if status == "not_connected":
                    # Create Stripe Connect account and return onboarding URL
                    result = await create_stripe_connect_account(user_id, db_client)
                    return CreateListingResponse(
                        has_stripe_connect=False,
                        stripe_connect_status="not_connected",
                        onboarding_url=result.get("onboarding_url")
                    )
                elif status == "incomplete":
                    # Create account link to continue onboarding
                    result = await create_stripe_connect_account(user_id, db_client)
                    return CreateListingResponse(
                        has_stripe_connect=True,
                        stripe_connect_status="incomplete",
                        onboarding_url=result.get("onboarding_url")
                    )

        # 3. Get collection_id and card_id from the request
        collection_id = listing_request.collection_id
        card_id = listing_request.card_id

        # 4. Get the user's card to retrieve card_reference and card data
        user_card = await get_user_card(
            user_id=user_id,
            collection_id=collection_id,
            card_id=card_id,
            db_client=db_client
        )

        # Get card_reference from the user's card
        card_reference = user_card.card_reference

        # 5. Check if user has enough available quantity (total quantity minus locked quantity)
        available_quantity = user_card.quantity
        if available_quantity < listing_request.quantity:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough cards available. Requested: {listing_request.quantity}, Available: {available_quantity}"
            )

        # Get reference to the card document for the transaction
        card_ref = user_ref.collection('cards').document('cards').collection(collection_id).document(card_id)

        # 6. Create listing document
        now = datetime.now()
        listing_data = {
            "owner_reference": user_id,  # User ID instead of full path
            "card_reference": card_reference,  # Card global ID
            "collection_id": collection_id,  # Collection ID of the card
            "quantity": listing_request.quantity,  # Quantity being listed
            "createdAt": now,
            "pricePoints": listing_request.pricePoints,
            "priceCash": listing_request.priceCash,
            "image_url": user_card.image_url,  # Add image_url from the user's card
            "card_name": user_card.card_name,  # Use card_name from request or user's card
            "condition": user_card.condition or "near_mint",  # Use condition from user's card
            "has_offer": False,  # New listings don't have offers yet
            # Add snake_case fields for Typesense sync
            "created_at": int(now.timestamp()),  # Unix timestamp for Typesense
            "price_points": listing_request.pricePoints or 0,
            "price_cash": listing_request.priceCash or 0.0,
            "status": "active",  # Default status for Typesense
        }

        # Add expiration date if provided
        if listing_request.expiresAt:
            listing_data["expiresAt"] = listing_request.expiresAt
            listing_data["expires_at"] = int(listing_request.expiresAt.timestamp())  # Unix timestamp for Typesense

        # 7. Create a new document in the listings collection
        listings_ref = db_client.collection('listings')
        new_listing_ref = listings_ref.document()  # Auto-generate ID

        # 8. Update user's card locked_quantity and quantity in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Increase the locked_quantity
            new_locked_quantity = user_card.locked_quantity + listing_request.quantity

            # Decrease the quantity
            new_quantity = user_card.quantity - listing_request.quantity

            # Update both locked_quantity and quantity
            tx.update(card_ref, {
                "locked_quantity": new_locked_quantity,
                "quantity": new_quantity
            })

            # Create the listing
            tx.set(new_listing_ref, listing_data)

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 9. Get the created listing
        listing_doc = await new_listing_ref.get()
        listing_data = listing_doc.to_dict()

        # 10. Create and return a CardListing object
        listing = CardListing(
            id=new_listing_ref.id,  # Include the listing ID
            owner_reference=listing_data["owner_reference"],
            card_reference=listing_data["card_reference"],
            collection_id=listing_data["collection_id"],
            quantity=listing_data["quantity"],
            createdAt=listing_data["createdAt"],
            pricePoints=listing_data.get("pricePoints"),
            priceCash=listing_data.get("priceCash"),
            expiresAt=listing_data.get("expiresAt"),
            highestOfferPoints=listing_data.get("highestOfferPoints"),
            highestOfferCash=listing_data.get("highestOfferCash"),
            image_url=listing_data.get("image_url"),
            card_name=listing_data.get("card_name"),
            has_offer=listing_data.get("has_offer", False),
            condition=listing_data.get("condition")
        )

        logger.info(f"Successfully created listing {new_listing_ref.id} for card {card_reference} by user {user_id}")
        
        # Determine Stripe Connect status for response
        has_stripe_connect = False
        stripe_connect_status = None
        if listing_request.priceCash is not None and listing_request.priceCash > 0:
            # If we got here with priceCash, it means Stripe Connect was ready
            has_stripe_connect = True
            stripe_connect_status = "ready"
        
        return CreateListingResponse(
            listing=listing,
            has_stripe_connect=has_stripe_connect,
            stripe_connect_status=stripe_connect_status
        )

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error creating listing for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create listing: {str(e)}")

async def get_user_listings(
    user_id: str,
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: Optional[str] = None,
    sort_order: str = "desc",
    filter_type: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get all listings for a user using Typesense with pagination and sorting.

    This function:
    1. Verifies the user exists
    2. Uses Typesense to search for listings where owner_reference matches the user_id
    3. Checks if each listing has offers
    4. Converts the search results to CardListing objects with has_offer field
    5. Returns paginated results with listings and pagination info

    Args:
        user_id: The ID of the user to get listings for
        db_client: Firestore async client (used for user verification and offer checking)
        page: Page number (default: 1)
        per_page: Items per page (default: 10)
        sort_by: Field to sort by (e.g., 'created_at', 'price_points', 'price_cash')
        sort_order: Sort order ('asc' or 'desc', default: 'desc')
        filter_type: Filter type ('all', 'has_offers', 'accepted', default: None which means 'all')

    Returns:
        Dict containing:
        - listings: List of CardListing objects
        - pagination: Pagination info

    Raises:
        HTTPException: If there's an error getting the listings
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # 2. Use Typesense to search for listings by user_id
        client = get_typesense_client()
        typesense_collection = settings.typesense_collection_listings
        
        # Determine sort field for Typesense
        sort_field = 'created_at'  # Default sort field
        if sort_by:
            # Map API field names to Typesense field names
            field_mapping = {
                'createdAt': 'created_at',
                'pricePoints': 'price_points',
                'priceCash': 'price_cash'
            }
            sort_field = field_mapping.get(sort_by, sort_by)
        
        # Build filter conditions
        filters = [f'owner_reference:{user_id}']
        
        # Add filters based on filter_type
        if filter_type == 'accepted':
            filters.append('status:=accepted')
        elif filter_type == 'has_offers':
            filters.append('has_offer:=true')
        
        # Build search parameters for Typesense
        search_params = {
            'q': '*',  # Search all
            'query_by': 'card_name',  # Required field for Typesense
            'filter_by': ' && '.join(filters),  # Combine filters with AND
            'page': page,
            'per_page': per_page,
            'sort_by': f'{sort_field}:{sort_order}'
        }
        
        logger.info(f"Searching Typesense for listings with owner_reference:{user_id}, page:{page}, per_page:{per_page}")
        
        # Execute search
        try:
            res = client.collections[typesense_collection].documents.search(search_params)
        except Exception as e:
            logger.error(f"Typesense search error: {e}")
            raise HTTPException(status_code=500, detail="Failed to get listings from search service")
        
        logger.info(f"Typesense returned {res['found']} listings for user {user_id}")
        
        # 3. Convert search results to CardListing objects
        listings = []
        for hit in res['hits']:
            try:
                hit_data = hit['document']
                
                # Map Typesense snake_case fields to camelCase
                field_mapping = {
                    'created_at': 'createdAt',
                    'expires_at': 'expiresAt',
                    'price_points': 'pricePoints',
                    'price_cash': 'priceCash',
                    'owner_reference': 'owner_reference',
                    'card_reference': 'card_reference',
                    'collection_id': 'collection_id',
                    'highest_offer_points': 'highestOfferPoints',
                    'highest_offer_cash': 'highestOfferCash'
                }
                
                # Apply field mapping
                for snake_case, camel_case in field_mapping.items():
                    if snake_case in hit_data and camel_case not in hit_data:
                        hit_data[camel_case] = hit_data[snake_case]
                
                # Convert Unix timestamps to datetime objects
                if 'created_at' in hit_data and isinstance(hit_data['created_at'], (int, float)):
                    hit_data['createdAt'] = datetime.fromtimestamp(hit_data['created_at'])
                if 'expires_at' in hit_data and isinstance(hit_data['expires_at'], (int, float)):
                    hit_data['expiresAt'] = datetime.fromtimestamp(hit_data['expires_at'])
                
                # R2 URLs are public, no need to sign them
                # image_url is already public and accessible
                
                # Get has_offer from Typesense data - trust it as the source of truth
                listing_id = hit_data["id"]
                has_offer = hit_data.get("has_offer", False)
                
                # Create a CardListing object
                listing = CardListing(
                    id=hit_data["id"],
                    owner_reference=hit_data["owner_reference"],
                    card_reference=hit_data["card_reference"],
                    collection_id=hit_data.get("collection_id", ""),
                    quantity=hit_data["quantity"],
                    createdAt=hit_data["createdAt"],
                    pricePoints=hit_data.get("pricePoints"),
                    priceCash=hit_data.get("priceCash"),
                    expiresAt=hit_data.get("expiresAt"),
                    highestOfferPoints=hit_data.get("highestOfferPoints"),
                    highestOfferCash=hit_data.get("highestOfferCash"),
                    image_url=hit_data.get("image_url"),
                    card_name=hit_data.get("card_name"),
                    has_offer=has_offer,
                    status=hit_data.get("status"),  # Include status from Typesense
                    condition=hit_data.get("condition")
                )
                listings.append(listing)
            except Exception as e:
                logger.warning(f"Failed to parse listing from Typesense: {e}")
                continue

        # Calculate pagination info
        total_items = res['found']
        total_pages = math.ceil(total_items / per_page) if per_page > 0 else 1
        
        pagination_info = {
            "total_items": total_items,
            "items_per_page": per_page,
            "current_page": page,
            "total_pages": total_pages
        }
        
        logger.info(f"Successfully retrieved {len(listings)} listings for user {user_id}")
        return {
            "listings": listings,
            "pagination": pagination_info
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting listings for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get listings: {str(e)}")

async def get_listing_by_id(
    listing_id: str,
    db_client: AsyncClient
) -> CardListing:
    """
    Get a listing by its ID.

    This function:
    1. Verifies the listing exists
    2. Retrieves the listing document from Firestore
    3. Converts the Firestore document to a CardListing object
    4. Returns the CardListing object

    Args:
        listing_id: The ID of the listing to retrieve
        db_client: Firestore async client

    Returns:
        CardListing: The listing object

    Raises:
        HTTPException: If there's an error getting the listing or if the listing doesn't exist
    """
    try:
        # 1. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        # 2. Get the listing data
        listing_data = listing_doc.to_dict()
        listing_data['id'] = listing_doc.id  # Add the document ID to the data

        # 3. Generate signed URL for the card image if it exists
        # R2 URLs are public, no need to sign them
        # image_url is already public and accessible

        # 4. Check if listing has any offers
        has_offer = listing_data.get("has_offer", False)
        
        # If has_offer is not set in the document, check subcollections
        if not has_offer:
            # Check for point offers
            point_offers = await listing_ref.collection('point_offers').limit(1).get()
            if point_offers:
                has_offer = True
            else:
                # Check for cash offers if no point offers
                cash_offers = await listing_ref.collection('cash_offers').limit(1).get()
                if cash_offers:
                    has_offer = True

        # 5. Create and return a CardListing object
        listing = CardListing(
            id=listing_data["id"],  # Include the listing ID
            owner_reference=listing_data["owner_reference"],
            card_reference=listing_data["card_reference"],
            collection_id=listing_data.get("collection_id", ""),
            quantity=listing_data["quantity"],
            createdAt=listing_data["createdAt"],
            pricePoints=listing_data.get("pricePoints"),
            priceCash=listing_data.get("priceCash"),
            expiresAt=listing_data.get("expiresAt"),
            highestOfferPoints=listing_data.get("highestOfferPoints"),
            highestOfferCash=listing_data.get("highestOfferCash"),
            image_url=listing_data.get("image_url"),
            card_name=listing_data.get("card_name"),
            has_offer=has_offer,
            condition=listing_data.get("condition")
        )

        logger.info(f"Successfully retrieved listing {listing_id}")
        return listing

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting listing {listing_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get listing: {str(e)}")

async def withdraw_offer(
    user_id: str,
    listing_id: str,
    offer_id: str,
    db_client: AsyncClient
) -> dict:
    """
    Withdraw a point offer for a listing.

    This function:
    1. Verifies the user exists
    2. Verifies the listing exists
    3. Verifies the offer exists and belongs to the user
    4. Verifies the offer has not been accepted
    5. Deletes the offer from the listing's "point_offers" subcollection
    6. Deletes the corresponding offer from the user's "my_point_offers" subcollection
    7. If it was the highest offer, updates the listing's highestOfferPoints field
    8. Returns a success message

    Args:
        user_id: The ID of the user withdrawing the offer
        listing_id: The ID of the listing the offer was made for
        offer_id: The ID of the offer to withdraw
        db_client: Firestore async client

    Returns:
        dict: A dictionary with a success message

    Raises:
        HTTPException: If there's an error withdrawing the offer
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Verify offer exists and belongs to the user
        offer_ref = listing_ref.collection('point_offers').document(offer_id)
        offer_doc = await offer_ref.get()
        if not offer_doc.exists:
            raise HTTPException(status_code=404, detail=f"Point offer with ID {offer_id} not found")

        offer_data = offer_doc.to_dict()
        expected_offerer_path = f"{settings.firestore_collection_users}/{user_id}"
        if offer_data.get("offererRef", "") != expected_offerer_path:
            raise HTTPException(status_code=403, detail="You are not authorized to withdraw this offer")

        # 4. Find the corresponding offer in the user's my_point_offers subcollection
        my_point_offers_ref = user_ref.collection('my_point_offers')
        my_point_offers_query = my_point_offers_ref.where("listingId", "==", listing_id)
        my_point_offers_docs = await my_point_offers_query.get()

        my_offer_ref = None
        my_offer_data = None
        for doc in my_point_offers_docs:
            doc_data = doc.to_dict()
            # Check if this is the same offer by comparing amount and timestamp
            if (doc_data.get("amount") == offer_data.get("amount") and
                doc_data.get("at") == offer_data.get("at")):
                my_offer_ref = doc.reference
                my_offer_data = doc_data
                break

        if not my_offer_ref:
            logger.warning(f"Could not find corresponding my_offer for offer {offer_id} in user {user_id}'s my_offers collection")

        # 5. Check if the offer has been accepted
        if my_offer_data and my_offer_data.get('status') == 'accepted':
            raise HTTPException(status_code=400, detail="Cannot withdraw an accepted offer")

        # 5. Check if this is the highest offer
        current_highest_offer = listing_data.get("highestOfferPoints", None)
        is_highest_offer = False

        if current_highest_offer and offer_data.get("offerreference") == current_highest_offer.get("offerreference"):
            is_highest_offer = True

        # 6. Delete the offers in a transaction
        @firestore.async_transactional
        async def _delete_txn(tx: firestore.AsyncTransaction):
            # Delete the offer from the listing's offers subcollection
            tx.delete(offer_ref)

            # Delete the corresponding offer from the user's my_offers subcollection if found
            if my_offer_ref:
                tx.delete(my_offer_ref)

        # Execute the delete transaction
        delete_transaction = db_client.transaction()
        await _delete_txn(delete_transaction)

        # 7. If this was the highest offer, find the next highest offer and update the listing
        if is_highest_offer:
            # Get all remaining offers and sort them by amount to find the highest
            offers_query = listing_ref.collection('point_offers').order_by("amount", direction=firestore.Query.DESCENDING).limit(1)
            offers_snapshot = await offers_query.get()

            logger.info(f"Found {len(offers_snapshot)} point offers after withdrawal")

            # Update the listing in a separate transaction
            @firestore.async_transactional
            async def _update_txn(tx: firestore.AsyncTransaction):
                if offers_snapshot and len(offers_snapshot) > 0:
                    # There is a new highest offer
                    new_highest_offer = offers_snapshot[0].to_dict()
                    logger.info(f"Setting new highest point offer: {new_highest_offer}")
                    tx.update(listing_ref, {
                        "highestOfferPoints": new_highest_offer
                    })
                else:
                    # No more point offers, remove the highest offer field
                    logger.info(f"No more point offers, removing highestOfferPoints field")
                    
                    # Check if there are any cash offers before setting has_offer to false
                    cash_offers = await listing_ref.collection('cash_offers').limit(1).get()
                    
                    update_data = {
                        "highestOfferPoints": firestore.DELETE_FIELD
                    }
                    
                    # If no cash offers either, set has_offer to false
                    if not cash_offers:
                        update_data["has_offer"] = False
                        logger.info(f"No cash offers either, setting has_offer to false")
                    
                    tx.update(listing_ref, update_data)

            # Execute the update transaction
            update_transaction = db_client.transaction()
            await _update_txn(update_transaction)

        logger.info(f"Successfully withdrew point offer {offer_id} for listing {listing_id} by user {user_id}")
        return {"message": f"Point offer for listing {listing_id} withdrawn successfully"}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error withdrawing point offer {offer_id} for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to withdraw point offer: {str(e)}")

async def withdraw_cash_offer(
    user_id: str,
    listing_id: str,
    offer_id: str,
    db_client: AsyncClient
) -> dict:
    """
    Withdraw a cash offer for a listing.

    This function:
    1. Verifies the user exists
    2. Verifies the listing exists
    3. Verifies the offer exists and belongs to the user
    4. Verifies the offer has not been accepted
    5. Deletes the offer from the listing's "cash_offers" subcollection
    6. Deletes the corresponding offer from the user's "my_cash_offers" subcollection
    7. If it was the highest offer, updates the listing's highestOfferCash field
    8. Returns a success message

    Args:
        user_id: The ID of the user withdrawing the offer
        listing_id: The ID of the listing the offer was made for
        offer_id: The ID of the offer to withdraw
        db_client: Firestore async client

    Returns:
        dict: A dictionary with a success message

    Raises:
        HTTPException: If there's an error withdrawing the offer
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Verify offer exists and belongs to the user
        offer_ref = listing_ref.collection('cash_offers').document(offer_id)
        offer_doc = await offer_ref.get()
        if not offer_doc.exists:
            raise HTTPException(status_code=404, detail=f"Cash offer with ID {offer_id} not found")

        offer_data = offer_doc.to_dict()
        expected_offerer_path = f"{settings.firestore_collection_users}/{user_id}"
        if offer_data.get("offererRef", "") != expected_offerer_path:
            raise HTTPException(status_code=403, detail="You are not authorized to withdraw this offer")

        # 4. Find the corresponding offer in the user's my_cash_offers subcollection
        my_cash_offers_ref = user_ref.collection('my_cash_offers')
        my_cash_offers_query = my_cash_offers_ref.where("listingId", "==", listing_id)
        my_cash_offers_docs = await my_cash_offers_query.get()

        my_offer_ref = None
        my_offer_data = None
        for doc in my_cash_offers_docs:
            doc_data = doc.to_dict()
            # Check if this is the same offer by comparing amount and timestamp
            if (doc_data.get("amount") == offer_data.get("amount") and
                doc_data.get("at") == offer_data.get("at")):
                my_offer_ref = doc.reference
                my_offer_data = doc_data
                break

        if not my_offer_ref:
            logger.warning(f"Could not find corresponding my_offer for offer {offer_id} in user {user_id}'s my_offers collection")

        # 5. Check if the offer has been accepted
        if my_offer_data and my_offer_data.get('status') == 'accepted':
            raise HTTPException(status_code=400, detail="Cannot withdraw an accepted offer")

        # 5. Check if this is the highest offer
        current_highest_offer = listing_data.get("highestOfferCash", None)
        is_highest_offer = False

        if current_highest_offer and offer_data.get("offerreference") == current_highest_offer.get("offerreference"):
            is_highest_offer = True

        # 6. Delete the offers in a transaction
        @firestore.async_transactional
        async def _delete_txn(tx: firestore.AsyncTransaction):
            # Delete the offer from the listing's offers subcollection
            tx.delete(offer_ref)

            # Delete the corresponding offer from the user's my_offers subcollection if found
            if my_offer_ref:
                tx.delete(my_offer_ref)

        # Execute the delete transaction
        delete_transaction = db_client.transaction()
        await _delete_txn(delete_transaction)

        # 7. If this was the highest offer, find the next highest offer and update the listing
        if is_highest_offer:
            # Get all remaining offers and sort them by amount to find the highest
            offers_query = listing_ref.collection('cash_offers').order_by("amount", direction=firestore.Query.DESCENDING).limit(1)
            offers_snapshot = await offers_query.get()

            logger.info(f"Found {len(offers_snapshot)} cash offers after withdrawal")

            # Update the listing in a separate transaction
            @firestore.async_transactional
            async def _update_txn(tx: firestore.AsyncTransaction):
                if offers_snapshot and len(offers_snapshot) > 0:
                    # There is a new highest offer
                    new_highest_offer = offers_snapshot[0].to_dict()
                    logger.info(f"Setting new highest cash offer: {new_highest_offer}")
                    tx.update(listing_ref, {
                        "highestOfferCash": new_highest_offer
                    })
                else:
                    # No more cash offers, remove the highest offer field
                    logger.info(f"No more cash offers, removing highestOfferCash field")
                    
                    # Check if there are any point offers before setting has_offer to false
                    point_offers = await listing_ref.collection('point_offers').limit(1).get()
                    
                    update_data = {
                        "highestOfferCash": firestore.DELETE_FIELD
                    }
                    
                    # If no point offers either, set has_offer to false
                    if not point_offers:
                        update_data["has_offer"] = False
                        logger.info(f"No point offers either, setting has_offer to false")
                    
                    tx.update(listing_ref, update_data)

            # Execute the update transaction
            update_transaction = db_client.transaction()
            await _update_txn(update_transaction)

        logger.info(f"Successfully withdrew cash offer {offer_id} for listing {listing_id} by user {user_id}")
        return {"message": f"Cash offer for listing {listing_id} withdrawn successfully"}

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error withdrawing cash offer {offer_id} for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to withdraw cash offer: {str(e)}")


async def offer_points(
    user_id: str,
    listing_id: str,
    offer_request: OfferPointsRequest,
    db_client: AsyncClient,
    expired: int = 7
) -> CardListing:
    """
    Offer points for a listing.

    This function:
    1. Verifies the listing exists
    2. Verifies the user exists
    3. Checks if the user is the owner of the listing
    4. Checks if the listing already has an accepted offer
    5. Creates a new offer document in the "point_offers" subcollection under the listing
    6. Creates a new offer document in the "my_point_offers" subcollection under the user
    7. If it's the highest offer, updates the highestOfferPoint field in the listing document
    8. Returns the updated listing

    Args:
        user_id: The ID of the user making the offer
        listing_id: The ID of the listing to offer points for
        offer_request: The OfferPointsRequest containing the points to offer
        db_client: Firestore async client
        expired: Number of days until the offer expires (default: 7)

    Returns:
        CardListing: The updated listing

    Raises:
        HTTPException: If there's an error offering points for the listing
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        # Check offer_passdue field
        user_data = user_doc.to_dict()
        offer_passdue = user_data.get("offer_passdue", 0)
        if offer_passdue >= 2:
            raise HTTPException(
                status_code=403,
                detail="You can't make offers because of 2 past due offers. Please contact us."
            )

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Check if the user is the owner of the listing
        owner_reference = listing_data.get("owner_reference", "")
        if owner_reference == user_id:
            raise HTTPException(status_code=400, detail="You cannot offer points for your own listing")

        # 4. Check if the listing already has an accepted offer
        if listing_data.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="This listing already has an accepted offer")

        # 5. Check if the listing's pricePoints is null or zero
        price_points = listing_data.get("pricePoints")
        if price_points is None or price_points == 0:
            raise HTTPException(status_code=400, detail="This listing does not accept point offers")

        # 5.1 Prevent duplicate point offers by the same user for this listing
        point_offers_ref = listing_ref.collection('point_offers')
        existing_user_point_offers = await point_offers_ref.where("offererRef", "==", user_ref.path).limit(1).get()
        if existing_user_point_offers:
            raise HTTPException(
                status_code=400,
                detail="You already have the same offer type for this listing. Please go to your profile and update it."
            )

        # 6. Create a new offer document in the "point_offers" subcollection
        now = datetime.now()
        expires_at = now + timedelta(days=expired)  # Calculate expiration date

        # Get the point_offers subcollection reference
        point_offers_ref = listing_ref.collection('point_offers')
        new_offer_ref = point_offers_ref.document()  # Auto-generate ID

        offer_data = {
            "offererRef": user_ref.path,  # Reference to the user making the offer
            "amount": offer_request.points,  # Points offered
            "at": now,  # Timestamp of the offer
            "offerreference": new_offer_ref.id,  # Reference to this offer
            "type": "point",  # Indicate this is a point offer
            "expiresAt": expires_at  # Add expiration date
        }

        # Get the user's my_point_offers subcollection reference
        my_point_offers_ref = user_ref.collection('my_point_offers')
        new_my_offer_ref = my_point_offers_ref.document(new_offer_ref.id)  # Use the same ID as the listing's offer

        # Create my_offer_data with additional listing information
        my_offer_data = {
            **offer_data,  # Include all offer data
            "listingId": listing_id,  # Reference to the listing
            "card_reference": listing_data.get("card_reference", ""),  # Card reference from the listing
            "collection_id": listing_data.get("collection_id", ""),  # Collection ID from the listing
            "image_url": listing_data.get("image_url", ""),  # Image URL from the listing
            "card_name": listing_data.get("card_name", "")  # Card name from the listing
        }

        # 6. Check if this is the highest offer
        current_highest_offer = listing_data.get("highestOfferPoints", None)
        is_highest_offer = False

        if current_highest_offer is None or offer_request.points > current_highest_offer.get("amount", 0):
            is_highest_offer = True

        # 7. Update the listing and create the offer in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Create the offer in the listing's offers subcollection
            tx.set(new_offer_ref, offer_data)

            # Create the offer in the user's my_offers subcollection
            tx.set(new_my_offer_ref, my_offer_data)

            # Update the listing with has_offer=true and optionally highestOfferPoints
            update_data = {"has_offer": True}
            if is_highest_offer:
                update_data["highestOfferPoints"] = offer_data
            
            tx.update(listing_ref, update_data)

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 7. Send email notification if this is the new highest offer
        if is_highest_offer:
            try:
                # Get the listing owner's information
                owner_id = listing_data.get("owner_reference", "")
                if owner_id:
                    # Get the owner's user details
                    owner = await get_user_by_id(owner_id, db_client)
                    
                    # Get the offerer's user details
                    offerer = await get_user_by_id(user_id, db_client)
                    
                    if owner and owner.email and offerer:
                        # Send the email notification
                        await send_new_highest_offer_email(
                            to_email=owner.email,
                            to_name=owner.displayName,
                            listing_data=listing_data,
                            offer_type="point",
                            offer_amount=offer_request.points,
                            offerer_name=offerer.displayName
                        )
                        logger.info(f"Sent new highest offer email to {owner.email}")
                    else:
                        logger.warning(f"Could not send email notification: Owner or offerer information missing")
            except Exception as e:
                # Log the error but don't fail the whole operation if email sending fails
                logger.error(f"Error sending new highest offer email: {e}", exc_info=True)

        # 8. Get the updated listing
        updated_listing_doc = await listing_ref.get()
        updated_listing_data = updated_listing_doc.to_dict()

        # 9. Create and return a CardListing object
        listing = CardListing(
            id=listing_id,  # Include the listing ID
            owner_reference=updated_listing_data["owner_reference"],
            card_reference=updated_listing_data["card_reference"],
            collection_id=updated_listing_data["collection_id"],
            quantity=updated_listing_data["quantity"],
            createdAt=updated_listing_data["createdAt"],
            pricePoints=updated_listing_data.get("pricePoints"),
            priceCash=updated_listing_data.get("priceCash"),
            expiresAt=updated_listing_data.get("expiresAt"),
            highestOfferPoints=updated_listing_data.get("highestOfferPoints"),
            highestOfferCash=updated_listing_data.get("highestOfferCash"),
            image_url=updated_listing_data.get("image_url"),
            card_name=updated_listing_data.get("card_name"),
            status=updated_listing_data.get("status"),  # Include status field
            condition=updated_listing_data.get("condition")
        )

        logger.info(f"Successfully created offer for listing {listing_id} by user {user_id}")
        return listing

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error offering points for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to offer points for listing: {str(e)}")

async def update_point_offer(
    user_id: str,
    listing_id: str,
    offer_id: str,
    update_request: UpdatePointOfferRequest,
    db_client: AsyncClient
) -> CardListing:
    """
    Update a point offer for a listing with a higher amount.

    This function:
    1. Verifies the user exists
    2. Verifies the listing exists
    3. Verifies the offer exists and belongs to the user
    4. Verifies the offer has not been accepted
    5. Verifies the new amount is higher than the current amount
    6. Updates the offer document in the "point_offers" subcollection under the listing
    7. Updates the corresponding offer in the user's "my_point_offers" subcollection
    8. If it becomes the highest offer, updates the highestOfferPoints field in the listing document
    9. Returns the updated listing

    Args:
        user_id: The ID of the user updating the offer
        listing_id: The ID of the listing the offer was made for
        offer_id: The ID of the offer to update
        update_request: The UpdatePointOfferRequest containing the new points to offer
        db_client: Firestore async client

    Returns:
        CardListing: The updated listing

    Raises:
        HTTPException: If there's an error updating the point offer
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Verify offer exists and belongs to the user
        offer_ref = listing_ref.collection('point_offers').document(offer_id)
        offer_doc = await offer_ref.get()
        if not offer_doc.exists:
            raise HTTPException(status_code=404, detail=f"Point offer with ID {offer_id} not found")

        offer_data = offer_doc.to_dict()
        expected_offerer_path = f"{settings.firestore_collection_users}/{user_id}"
        if offer_data.get("offererRef", "") != expected_offerer_path:
            raise HTTPException(status_code=403, detail="You are not authorized to update this offer")

        # 4. Verify the new amount is higher than the current amount
        current_amount = offer_data.get("amount", 0)
        if update_request.points <= current_amount:
            raise HTTPException(status_code=400, detail="New offer amount must be higher than the current amount")

        # 5. Find the corresponding offer in the user's my_point_offers subcollection
        my_point_offers_ref = user_ref.collection('my_point_offers')
        my_point_offers_query = my_point_offers_ref.where("listingId", "==", listing_id)
        my_point_offers_docs = await my_point_offers_query.get()

        my_offer_ref = None
        my_offer_data = None
        for doc in my_point_offers_docs:
            doc_data = doc.to_dict()
            # Check if this is the same offer by comparing offerreference
            if doc_data.get("offerreference") == offer_id:
                my_offer_ref = doc.reference
                my_offer_data = doc_data
                break

        if not my_offer_ref:
            logger.warning(f"Could not find corresponding my_offer for offer {offer_id} in user {user_id}'s my_point_offers collection")
            raise HTTPException(status_code=404, detail=f"Could not find corresponding my_offer for offer {offer_id}")

        # 4. Check if the offer has been accepted
        if my_offer_data and my_offer_data.get('status') == 'accepted':
            raise HTTPException(status_code=400, detail="Cannot update an accepted offer")

        # 6. Update the offer data with the new amount
        now = datetime.now()
        updated_offer_data = {
            **offer_data,
            "amount": update_request.points,
            "at": now  # Update the timestamp
        }

        # Create updated my_offer_data with the new amount
        updated_my_offer_data = {
            **offer_data,
            "amount": update_request.points,
            "at": now,
            "listingId": listing_id,
            "card_reference": listing_data.get("card_reference", ""),
            "collection_id": listing_data.get("collection_id", ""),
            "image_url": listing_data.get("image_url", ""),
            "card_name": listing_data.get("card_name", "")
        }

        # 7. Check if this will be the highest offer
        current_highest_offer = listing_data.get("highestOfferPoints", None)
        is_highest_offer = False

        if current_highest_offer is None or update_request.points > current_highest_offer.get("amount", 0):
            is_highest_offer = True
        elif current_highest_offer.get("offerreference") == offer_id and update_request.points > current_amount:
            # This is already the highest offer and we're increasing the amount
            is_highest_offer = True

        # 8. Update the offers and possibly the listing in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Update the offer in the listing's point_offers subcollection
            tx.update(offer_ref, {
                "amount": update_request.points,
                "at": now
            })

            # Update the offer in the user's my_point_offers subcollection
            tx.update(my_offer_ref, {
                "amount": update_request.points,
                "at": now
            })

            # If this will be the highest offer, update the listing
            if is_highest_offer:
                tx.update(listing_ref, {
                    "highestOfferPoints": updated_offer_data
                })

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 9. Get the updated listing
        updated_listing_doc = await listing_ref.get()
        updated_listing_data = updated_listing_doc.to_dict()

        # 10. Create and return a CardListing object
        listing = CardListing(
            id=listing_id,  # Include the listing ID
            owner_reference=updated_listing_data["owner_reference"],
            card_reference=updated_listing_data["card_reference"],
            collection_id=updated_listing_data["collection_id"],
            quantity=updated_listing_data["quantity"],
            createdAt=updated_listing_data["createdAt"],
            pricePoints=updated_listing_data.get("pricePoints"),
            priceCash=updated_listing_data.get("priceCash"),
            expiresAt=updated_listing_data.get("expiresAt"),
            highestOfferPoints=updated_listing_data.get("highestOfferPoints"),
            highestOfferCash=updated_listing_data.get("highestOfferCash"),
            image_url=updated_listing_data.get("image_url"),
            card_name=updated_listing_data.get("card_name"),
            status=updated_listing_data.get("status"),  # Include status field
            condition=updated_listing_data.get("condition")
        )

        logger.info(f"Successfully updated point offer {offer_id} for listing {listing_id} by user {user_id}")
        return listing

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating point offer {offer_id} for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update point offer: {str(e)}")

async def update_cash_offer(
    user_id: str,
    listing_id: str,
    offer_id: str,
    update_request: UpdateCashOfferRequest,
    db_client: AsyncClient
) -> CardListing:
    """
    Update a cash offer for a listing with a higher amount.

    This function:
    1. Verifies the user exists
    2. Verifies the listing exists
    3. Verifies the offer exists and belongs to the user
    4. Verifies the offer has not been accepted
    5. Verifies the new amount is higher than the current amount
    6. Updates the offer document in the "cash_offers" subcollection under the listing
    7. Updates the corresponding offer in the user's "my_cash_offers" subcollection
    8. If it becomes the highest offer, updates the highestOfferCash field in the listing document
    9. Returns the updated listing

    Args:
        user_id: The ID of the user updating the offer
        listing_id: The ID of the listing the offer was made for
        offer_id: The ID of the offer to update
        update_request: The UpdateCashOfferRequest containing the new cash amount to offer
        db_client: Firestore async client

    Returns:
        CardListing: The updated listing

    Raises:
        HTTPException: If there's an error updating the cash offer
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Verify offer exists and belongs to the user
        offer_ref = listing_ref.collection('cash_offers').document(offer_id)
        offer_doc = await offer_ref.get()
        if not offer_doc.exists:
            raise HTTPException(status_code=404, detail=f"Cash offer with ID {offer_id} not found")

        offer_data = offer_doc.to_dict()
        expected_offerer_path = f"{settings.firestore_collection_users}/{user_id}"
        if offer_data.get("offererRef", "") != expected_offerer_path:
            raise HTTPException(status_code=403, detail="You are not authorized to update this offer")

        # 4. Verify the new amount is higher than the current amount
        current_amount = offer_data.get("amount", 0)
        if update_request.cash <= current_amount:
            raise HTTPException(status_code=400, detail="New offer amount must be higher than the current amount")

        # 5. Find the corresponding offer in the user's my_cash_offers subcollection
        my_cash_offers_ref = user_ref.collection('my_cash_offers')
        my_cash_offers_query = my_cash_offers_ref.where("listingId", "==", listing_id)
        my_cash_offers_docs = await my_cash_offers_query.get()

        my_offer_ref = None
        my_offer_data = None
        for doc in my_cash_offers_docs:
            doc_data = doc.to_dict()
            # Check if this is the same offer by comparing offerreference
            if doc_data.get("offerreference") == offer_id:
                my_offer_ref = doc.reference
                my_offer_data = doc_data
                break

        if not my_offer_ref:
            logger.warning(f"Could not find corresponding my_offer for offer {offer_id} in user {user_id}'s my_cash_offers collection")
            raise HTTPException(status_code=404, detail=f"Could not find corresponding my_offer for offer {offer_id}")

        # 4. Check if the offer has been accepted
        if my_offer_data and my_offer_data.get('status') == 'accepted':
            raise HTTPException(status_code=400, detail="Cannot update an accepted offer")

        # 6. Update the offer data with the new amount
        now = datetime.now()
        updated_offer_data = {
            **offer_data,
            "amount": update_request.cash,
            "at": now  # Update the timestamp
        }

        # Create updated my_offer_data with the new amount
        updated_my_offer_data = {
            **offer_data,
            "amount": update_request.cash,
            "at": now,
            "listingId": listing_id,
            "card_reference": listing_data.get("card_reference", ""),
            "collection_id": listing_data.get("collection_id", ""),
            "image_url": listing_data.get("image_url", "")
        }

        # 7. Check if this will be the highest offer
        current_highest_offer = listing_data.get("highestOfferCash", None)
        is_highest_offer = False

        if current_highest_offer is None or update_request.cash > current_highest_offer.get("amount", 0):
            is_highest_offer = True
        elif current_highest_offer.get("offerreference") == offer_id and update_request.cash > current_amount:
            # This is already the highest offer and we're increasing the amount
            is_highest_offer = True

        # 8. Update the offers and possibly the listing in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Update the offer in the listing's cash_offers subcollection
            tx.update(offer_ref, {
                "amount": update_request.cash,
                "at": now
            })

            # Update the offer in the user's my_cash_offers subcollection
            tx.update(my_offer_ref, {
                "amount": update_request.cash,
                "at": now
            })

            # If this will be the highest offer, update the listing
            if is_highest_offer:
                tx.update(listing_ref, {
                    "highestOfferCash": updated_offer_data
                })

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 9. Get the updated listing
        updated_listing_doc = await listing_ref.get()
        updated_listing_data = updated_listing_doc.to_dict()

        # 10. Create and return a CardListing object
        listing = CardListing(
            id=listing_id,  # Include the listing ID
            owner_reference=updated_listing_data["owner_reference"],
            card_reference=updated_listing_data["card_reference"],
            collection_id=updated_listing_data["collection_id"],
            quantity=updated_listing_data["quantity"],
            createdAt=updated_listing_data["createdAt"],
            pricePoints=updated_listing_data.get("pricePoints"),
            priceCash=updated_listing_data.get("priceCash"),
            expiresAt=updated_listing_data.get("expiresAt"),
            highestOfferPoints=updated_listing_data.get("highestOfferPoints"),
            highestOfferCash=updated_listing_data.get("highestOfferCash"),
            image_url=updated_listing_data.get("image_url"),
            card_name=updated_listing_data.get("card_name"),
            status=updated_listing_data.get("status"),  # Include status field
            condition=updated_listing_data.get("condition")
        )

        logger.info(f"Successfully updated cash offer {offer_id} for listing {listing_id} by user {user_id}")
        return listing

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error updating cash offer {offer_id} for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update cash offer: {str(e)}")


async def accept_offer(
    user_id: str,
    listing_id: str,
    offer_type: str,
    db_client: AsyncClient
) -> CardListing:
    """
    Accept the highest offer (cash or point) for a listing.

    This function:
    1. Verifies the listing exists and belongs to the user
    2. Checks if the listing status is already "accepted"
    3. Finds the highest offer of the specified type
    4. Updates the status of the offer to "accepted"
    5. Sets the payment_due date to 2 days after the accept time
    6. Sets the expireAt date to 48 hours after the accept time
    7. Returns the updated listing

    Args:
        user_id: The ID of the user accepting the offer (must be the listing owner)
        listing_id: The ID of the listing
        offer_type: The type of offer to accept ("cash" or "point")
        db_client: Firestore async client

    Returns:
        CardListing: The updated listing

    Raises:
        HTTPException: If there's an error accepting the offer
    """
    logger = get_logger(__name__)
    try:
        # 1. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 2. Verify the user is the owner of the listing
        owner_reference = listing_data.get("owner_reference", "")
        if owner_reference != user_id:
            raise HTTPException(status_code=403, detail="You can only accept offers for your own listings")

        # 3. Check if the listing status is already "accepted"
        if listing_data.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="This listing already has an accepted offer")

        # 4. Find the highest offer of the specified type
        # Handle both singular and plural forms of "point"
        if offer_type.lower() == "point":
            highest_offer_field = "highestOfferPoints"
        else:
            highest_offer_field = f"highestOffer{offer_type.capitalize()}"

        highest_offer = listing_data.get(highest_offer_field, None)

        if not highest_offer:
            raise HTTPException(status_code=404, detail=f"No {offer_type} offers found for this listing")

        # 5. Set the accept time, payment due date, and expiration date
        now = datetime.now()
        payment_due = now + timedelta(days=2)  # Payment due in 2 days
        expires_at = now + timedelta(hours=48)  # Listing expires in 48 hours

        # 5. Update the offer status in the listing
        highest_offer["status"] = "accepted"
        highest_offer["payment_due"] = payment_due

        # 6. Find the offer in the user's offers collection and update it
        offerer_ref_path = highest_offer.get("offererRef", "")
        offer_reference = highest_offer.get("offerreference", "")

        if not offerer_ref_path or not offer_reference:
            raise HTTPException(status_code=500, detail="Invalid offer data")

        # Get the offer subcollection reference
        offers_subcollection = f"{offer_type}_offers"
        offer_ref = listing_ref.collection(offers_subcollection).document(offer_reference)

        # Get the user's my_offers subcollection reference
        offerer_ref = db_client.document(offerer_ref_path)
        my_offers_subcollection = f"my_{offer_type}_offers"

        # Find the offer in the user's my_offers subcollection
        my_offers_query = offerer_ref.collection(my_offers_subcollection).where("listingId", "==", listing_id)
        my_offers_docs = await my_offers_query.get()

        if not my_offers_docs:
            logger.warning(f"No matching offer found in user's my_{offer_type}_offers collection")

        # 7. Update the listing and the offer in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Update the listing with the accepted offer
            tx.update(listing_ref, {
                highest_offer_field: highest_offer,
                "status": "accepted",
                "payment_due": payment_due,
                "expiresAt": expires_at,
                "expires_at": int(expires_at.timestamp())  # Unix timestamp for Typesense
            })

            # Update the offer in the listing's offers subcollection
            tx.update(offer_ref, {
                "status": "accepted",
                "payment_due": payment_due
            })

            # Update the offer in the user's my_offers subcollection if found
            for doc in my_offers_docs:
                tx.update(doc.reference, {
                    "status": "accepted",
                    "payment_due": payment_due
                })

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 8. Get the updated listing
        updated_listing_doc = await listing_ref.get()
        updated_listing_data = updated_listing_doc.to_dict()
        updated_listing_data['id'] = listing_id  # Add the listing ID to the data

        # 9. Send email notification to the user whose offer was accepted
        try:
            # Extract offerer user ID from the reference path
            offerer_id = offerer_ref_path.split('/')[-1]

            # Get the offerer's user details
            offerer = await get_user_by_id(offerer_id, db_client)

            if offerer and offerer.email:
                # Get the offer amount
                offer_amount = highest_offer.get("amount", 0)

                # Send the email notification
                await send_offer_accepted_email(
                    to_email=offerer.email,
                    to_name=offerer.displayName,
                    listing_data=updated_listing_data,
                    offer_type=offer_type,
                    offer_amount=offer_amount
                )
                logger.info(f"Sent offer accepted email to {offerer.email}")
            else:
                logger.warning(f"Could not send email notification: User {offerer_id} not found or has no email")
        except Exception as e:
            # Log the error but don't fail the whole operation if email sending fails
            logger.error(f"Error sending offer accepted email: {e}", exc_info=True)

        logger.info(f"Successfully accepted {offer_type} offer for listing {listing_id}")
        return CardListing(**updated_listing_data)

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error accepting {offer_type} offer for listing {listing_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to accept offer: {str(e)}")

async def offer_cash(
    user_id: str,
    listing_id: str,
    offer_request: OfferCashRequest,
    db_client: AsyncClient,
    expired: int = 7
) -> CardListing:
    """
    Offer cash for a listing.

    This function:
    1. Verifies the listing exists
    2. Verifies the user exists
    3. Checks if the user is the owner of the listing
    4. Checks if the listing already has an accepted offer
    5. Creates a new offer document in the "cash_offers" subcollection under the listing
    6. Creates a new offer document in the "my_cash_offers" subcollection under the user
    7. If it's the highest offer, updates the highestOfferCash field in the listing document
    8. Returns the updated listing

    Args:
        user_id: The ID of the user making the offer
        listing_id: The ID of the listing to offer cash for
        offer_request: The OfferCashRequest containing the cash amount to offer
        db_client: Firestore async client
        expired: Number of days until the offer expires (default: 7)

    Returns:
        CardListing: The updated listing

    Raises:
        HTTPException: If there's an error offering cash for the listing
    """
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
        
        # Check offer_passdue field
        user_data = user_doc.to_dict()
        offer_passdue = user_data.get("offer_passdue", 0)
        if offer_passdue >= 2:
            raise HTTPException(
                status_code=403,
                detail="You can't make offers because of 2 past due offers. Please contact us."
            )

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()

        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Check if the user is the owner of the listing
        owner_reference = listing_data.get("owner_reference", "")
        if owner_reference == user_id:
            raise HTTPException(status_code=400, detail="You cannot offer cash for your own listing")

        # 4. Check if the listing already has an accepted offer
        if listing_data.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="This listing already has an accepted offer")

        # 5. Check if the listing's priceCash is null or zero
        price_cash = listing_data.get("priceCash")
        if price_cash is None or price_cash == 0:
            raise HTTPException(status_code=400, detail="This listing does not accept cash offers")

        # 5.1 Prevent duplicate cash offers by the same user for this listing
        cash_offers_ref = listing_ref.collection('cash_offers')
        existing_user_cash_offers = await cash_offers_ref.where("offererRef", "==", user_ref.path).limit(1).get()
        if existing_user_cash_offers:
            raise HTTPException(
                status_code=400,
                detail="You already have the same offer type for this listing. Please go to your profile and update it."
            )

        # 6. Create a new offer document in the "cash_offers" subcollection
        now = datetime.now()
        expires_at = now + timedelta(days=expired)  # Calculate expiration date

        # Get the cash_offers subcollection reference
        cash_offers_ref = listing_ref.collection('cash_offers')
        new_offer_ref = cash_offers_ref.document()  # Auto-generate ID

        offer_data = {
            "offererRef": user_ref.path,  # Reference to the user making the offer
            "amount": offer_request.cash,  # Cash offered
            "at": now,  # Timestamp of the offer
            "offerreference": new_offer_ref.id,  # Reference to this offer
            "type": "cash",  # Indicate this is a cash offer
            "expiresAt": expires_at  # Add expiration date
        }

        # Get the user's my_cash_offers subcollection reference
        my_cash_offers_ref = user_ref.collection('my_cash_offers')
        new_my_offer_ref = my_cash_offers_ref.document(new_offer_ref.id)  # Use the same ID as the listing's offer

        # Create my_offer_data with additional listing information
        my_offer_data = {
            **offer_data,  # Include all offer data
            "listingId": listing_id,  # Reference to the listing
            "card_reference": listing_data.get("card_reference", ""),  # Card reference from the listing
            "collection_id": listing_data.get("collection_id", ""),  # Collection ID from the listing
            "image_url": listing_data.get("image_url", ""),  # Image URL from the listing
            "card_name": listing_data.get("card_name", "")  # Card name from the listing
        }

        # 6. Check if this is the highest offer
        highest_offer_field = "highestOfferCash"
        current_highest_offer = listing_data.get(highest_offer_field, None)
        is_highest_offer = False

        if current_highest_offer is None or offer_request.cash > current_highest_offer.get("amount", 0):
            is_highest_offer = True

        # 7. Update the listing and create the offer in a transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Create the offer in the listing's cash_offers subcollection
            tx.set(new_offer_ref, offer_data)

            # Create the offer in the user's my_offers subcollection
            tx.set(new_my_offer_ref, my_offer_data)

            # Update the listing with has_offer=true and optionally highestOfferCash
            update_data = {"has_offer": True}
            if is_highest_offer:
                update_data["highestOfferCash"] = offer_data
            
            tx.update(listing_ref, update_data)

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 7. Send email notification if this is the new highest offer
        if is_highest_offer:
            try:
                # Get the listing owner's information
                owner_id = listing_data.get("owner_reference", "")
                if owner_id:
                    # Get the owner's user details
                    owner = await get_user_by_id(owner_id, db_client)
                    
                    # Get the offerer's user details
                    offerer = await get_user_by_id(user_id, db_client)
                    
                    if owner and owner.email and offerer:
                        # Send the email notification
                        await send_new_highest_offer_email(
                            to_email=owner.email,
                            to_name=owner.displayName,
                            listing_data=listing_data,
                            offer_type="cash",
                            offer_amount=offer_request.cash,
                            offerer_name=offerer.displayName
                        )
                        logger.info(f"Sent new highest offer email to {owner.email}")
                    else:
                        logger.warning(f"Could not send email notification: Owner or offerer information missing")
            except Exception as e:
                # Log the error but don't fail the whole operation if email sending fails
                logger.error(f"Error sending new highest offer email: {e}", exc_info=True)

        # 8. Get the updated listing
        updated_listing_doc = await listing_ref.get()
        updated_listing_data = updated_listing_doc.to_dict()

        # 9. Create and return a CardListing object
        listing = CardListing(
            id=listing_id,  # Include the listing ID
            owner_reference=updated_listing_data["owner_reference"],
            card_reference=updated_listing_data["card_reference"],
            collection_id=updated_listing_data["collection_id"],
            quantity=updated_listing_data["quantity"],
            createdAt=updated_listing_data["createdAt"],
            pricePoints=updated_listing_data.get("pricePoints"),
            priceCash=updated_listing_data.get("priceCash"),
            expiresAt=updated_listing_data.get("expiresAt"),
            highestOfferPoints=updated_listing_data.get("highestOfferPoints"),
            highestOfferCash=updated_listing_data.get("highestOfferCash"),
            image_url=updated_listing_data.get("image_url"),
            card_name=updated_listing_data.get("card_name"),
            status=updated_listing_data.get("status"),  # Include status field
            condition=updated_listing_data.get("condition")
        )

        logger.info(f"Successfully created cash offer for listing {listing_id} by user {user_id}")
        return listing

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error offering cash for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to offer cash for listing: {str(e)}")


async def get_all_offers(
    user_id: str, 
    offer_type: str, 
    db_client: AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: Optional[str] = None,
    sort_order: str = "desc",
    search_query: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get all offers for a specific user with pagination, sorting, and search.

    Args:
        user_id: The ID of the user to get offers for
        offer_type: The type of offer to get (cash or point)
        db_client: Firestore client
        page: Page number (1-based)
        per_page: Items per page
        sort_by: Field to sort by (amount, at, card_name)
        sort_order: Sort order (asc or desc)
        search_query: Search term for card name

    Returns:
        Dict containing offers list and pagination info

    Raises:
        HTTPException: If there's an error getting the offers or if the user doesn't exist
    """
    logger = get_logger(__name__)
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Directly access the user's offers subcollection
        subcollection_name = "my_cash_offers" if offer_type == "cash" else "my_point_offers"
        offers_ref = user_ref.collection(subcollection_name)

        all_offers = []
        orphaned_refs = []
        
        async for offer_doc in offers_ref.stream():
            offer_data = offer_doc.to_dict()

            # Get the listing details to include card information
            listing_ref = db_client.collection('listings').document(offer_data.get('listingId', ''))
            listing_doc = await listing_ref.get()

            if listing_doc.exists:
                listing_data = listing_doc.to_dict()
                card_name = listing_data.get('card_name', '')

                # Apply search filter
                if search_query and search_query.lower() not in card_name.lower():
                    continue

                # Generate signed URL for the card image if it exists
                image_url = listing_data.get('image_url', '')
                if image_url:
                    try:
                        # R2 URLs are public; no signing required. Just reuse the URL.
                        signed_url = image_url
                        image_url = signed_url
                    except Exception as sign_error:
                        logger.error(f"Failed to process image URL {image_url}: {sign_error}")
                        # Keep the original URL if processing fails
                
                # Create the offer object with all required fields
                offer_obj = {
                    'amount': offer_data.get('amount', 0),
                    'at': offer_data.get('createdAt', datetime.now()),
                    'card_reference': listing_data.get('card_reference', ''),
                    'collection_id': listing_data.get('collection_id', ''),
                    'expiresAt': offer_data.get('expiresAt', datetime.now() + timedelta(days=7)),
                    'image_url': image_url,
                    'listingId': offer_data.get('listingId', ''),
                    'offererRef': offer_data.get('offererRef', ''),
                    'offerreference': offer_doc.id,
                    'payment_due': offer_data.get('payment_due', datetime.now() + timedelta(days=3)),
                    'status': offer_data.get('status', ''),
                    'type': offer_data.get('type', 'cash'),
                    'card_name': card_name
                }

                all_offers.append(offer_obj)
            else:
                # Listing doesn't exist - mark offer for cleanup
                orphaned_refs.append(offer_doc.reference)
                logger.info(f"Found orphaned {offer_type} offer {offer_doc.id} for deleted listing {offer_data.get('listingId', '')}")

        # Clean up orphaned offers in batch
        if orphaned_refs:
            @firestore.async_transactional
            async def _cleanup_orphaned_offers(tx: firestore.AsyncTransaction):
                for ref in orphaned_refs:
                    tx.delete(ref)
            
            transaction = db_client.transaction()
            await _cleanup_orphaned_offers(transaction)
            logger.info(f"Cleaned up {len(orphaned_refs)} orphaned {offer_type} offers for user {user_id}")

        # Sort offers in-memory
        if sort_by:
            reverse = sort_order == "desc"
            if sort_by == "amount":
                all_offers.sort(key=lambda x: x.get('amount', 0), reverse=reverse)
            elif sort_by == "at":
                all_offers.sort(key=lambda x: x.get('at', datetime.min), reverse=reverse)
            elif sort_by == "card_name":
                all_offers.sort(key=lambda x: x.get('card_name', '').lower(), reverse=reverse)

        # Apply pagination
        total_items = len(all_offers)
        start_index = (page - 1) * per_page
        end_index = start_index + per_page
        paginated_offers = all_offers[start_index:end_index]

        # Calculate pagination info
        total_pages = (total_items + per_page - 1) // per_page

        result = {
            'offers': paginated_offers,
            'pagination': {
                'total_items': total_items,
                'items_per_page': per_page,
                'total_pages': total_pages,
                'current_page': page
            },
            'filters': {
                'sort_by': sort_by or '',
                'sort_order': sort_order,
                'search_query': search_query or ''
            }
        }

        logger.info(f"Retrieved {len(paginated_offers)} of {total_items} {offer_type} offers for user {user_id}")
        return result
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting {offer_type} offers for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get {offer_type} offers: {str(e)}")


async def get_all_listings(
        db_client: firestore.AsyncClient = None,
        collection_id: Optional[str] = None,
        per_page: int = 10,
        sort_by: Optional[str] = None,
        sort_order: str = "desc",
        search_query: Optional[str] = None,
        page: int = 1,
        filter_out_accepted: bool = True,
        min_price_cash: Optional[float] = None,
        max_price_cash: Optional[float] = None,
        min_price_points: Optional[int] = None,
        max_price_points: Optional[int] = None
) -> Any:
    try:
        # Get Typesense client
        client = get_typesense_client()
        typesense_collection = settings.typesense_collection_listings
        
        # Build search parameters for Typesense
        search_params = {
            'q': search_query or '*',  # Use '*' for empty search
            'query_by': 'card_name',  # Search by card name
            'page': page,
            'per_page': per_page,
            'infix': 'always',  # Enable infix (substring) search
        }
        
        # Build filters
        filters = []
        if collection_id:
            filters.append(f'collection_id:={collection_id}')
        if filter_out_accepted:
            filters.append('status:!=accepted')
        
        # Add price range filters
        if min_price_cash is not None:
            filters.append(f'price_cash:>={min_price_cash}')
        if max_price_cash is not None:
            filters.append(f'price_cash:<={max_price_cash}')
        if min_price_points is not None:
            filters.append(f'price_points:>={min_price_points}')
        if max_price_points is not None:
            filters.append(f'price_points:<={max_price_points}')
        
        if filters:
            search_params['filter_by'] = ' && '.join(filters)
        
        # Handle sorting with field name mapping for Typesense
        typesense_field_mapping = {
            'createdAt': 'created_at',
            'expiresAt': 'expires_at',
            'pricePoints': 'price_points',
            'priceCash': 'price_cash'
        }
        
        if sort_by:
            # Map the field name if needed
            typesense_sort_field = typesense_field_mapping.get(sort_by, sort_by)
            sort_direction = 'desc' if sort_order.lower() == 'desc' else 'asc'
            search_params['sort_by'] = f'{typesense_sort_field}:{sort_direction}'
        else:
            # Default sort by created_at desc
            search_params['sort_by'] = 'created_at:desc'
        
        # Log the search params for debugging
        logger.info(f"Typesense search params for listings: {search_params}")
        logger.info(f"Searching in Typesense collection: {typesense_collection}")
        
        # Execute search
        try:
            res = client.collections[typesense_collection].documents.search(search_params)
        except Exception as e:
            logger.error(f"Typesense search error: {e}")
            raise HTTPException(status_code=500, detail="Failed to get listings from search service")
        
        logger.info(f"Typesense search returned {res['found']} results, showing {len(res['hits'])} hits")
        
        listings = []
        for hit in res['hits']:
            try:
                hit_data = hit['document']
                
                # Typesense documents should have 'id' field
                if 'id' not in hit_data:
                    logger.warning(f"Skipping hit without id: {hit_data}")
                    continue
                
                # Map Typesense snake_case fields to camelCase
                field_mapping = {
                    'created_at': 'createdAt',
                    'expires_at': 'expiresAt',
                    'price_points': 'pricePoints',
                    'price_cash': 'priceCash',
                    'owner_reference': 'owner_reference',
                    'card_reference': 'card_reference',
                    'collection_id': 'collection_id',
                    'card_name': 'card_name',
                    'quantity': 'quantity',
                    'status': 'status',
                    'image_url': 'image_url',
                    'highestOfferPoints': 'highestOfferPoints',
                    'highestOfferCash': 'highestOfferCash'
                }
                
                # Create mapped data with camelCase fields
                mapped_data = {}
                for snake_field, camel_field in field_mapping.items():
                    if snake_field in hit_data:
                        mapped_data[camel_field] = hit_data[snake_field]
                
                # Copy any additional fields not in mapping
                for key, value in hit_data.items():
                    if key not in field_mapping and key not in mapped_data:
                        mapped_data[key] = value
                
                hit_data = mapped_data

                # Ensure condition is present, default to "near_mint" if missing/empty
                if 'condition' not in hit_data or hit_data['condition'] in (None, ''):
                    hit_data['condition'] = 'near_mint'
                
                # Convert timestamps if needed
                if "createdAt" in hit_data and isinstance(hit_data["createdAt"], (int, float)):
                    hit_data["createdAt"] = datetime.fromtimestamp(hit_data["createdAt"])
                
                if "expiresAt" in hit_data and isinstance(hit_data["expiresAt"], (int, float)):
                    hit_data["expiresAt"] = datetime.fromtimestamp(hit_data["expiresAt"])
                
                # R2 URLs are public, no need to sign them
                # image_url is already public and accessible

                required_fields = ["owner_reference", "card_reference", "collection_id", "quantity", "createdAt"]
                missing_fields = [f for f in required_fields if f not in hit_data]
                if missing_fields:
                    logger.warning(f"Skipping due to missing fields {missing_fields}: {hit_data}")
                    continue

                listings.append(CardListing(**hit_data))

            except Exception as e:
                object_id = hit_data.get('id', 'unknown') if 'hit_data' in locals() else 'unknown'
                logger.warning(f"Failed to parse hit {object_id}: {e}")
                continue

        # Create pagination info for Typesense results
        total_items = res['found']
        total_pages = math.ceil(total_items / per_page) if per_page > 0 else 1
        
        pagination_info = PaginationInfo(
            total_items=total_items,
            items_per_page=per_page,
            total_pages=total_pages,
            current_page=page
        )

        filters_info = AppliedFilters(
            sort_by=sort_by or "",
            sort_order=sort_order,
            search_query=search_query,
            collection_id=collection_id,
            filter_out_accepted=filter_out_accepted
        )

        logger.info(f"Successfully fetched {len(listings)} listings using Typesense. Total items: {total_items}.")

        return PaginatedListingsResponse(
            listings=listings,
            pagination=pagination_info,
            filters=filters_info
        )

    except Exception as e:
        logger.error(f"Error fetching listings from Typesense: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to get listings.")


async def get_accepted_offers(user_id: str, offer_type: str, db_client: AsyncClient) -> List[Dict[str, Any]]:
    """
    Get all accepted offers for a specific user.

    Args:
        user_id: The ID of the user to get accepted offers for
        offer_type: The type of offer to get (cash or point)
        db_client: Firestore client

    Returns:
        List of accepted offers for the specified user

    Raises:
        HTTPException: If there's an error getting the accepted offers or if the user doesn't exist
    """
    logger = get_logger(__name__)
    try:
        # Check if user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()

        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Directly access the user's offers subcollection
        subcollection_name = "my_cash_offers" if offer_type == "cash" else "my_point_offers"
        offers_ref = user_ref.collection(subcollection_name)

        accepted_offers = []
        orphaned_refs = []
        
        async for offer_doc in offers_ref.stream():
            offer_data = offer_doc.to_dict()

            # Check if this offer has 'accepted' status
            if offer_data.get('status') == 'accepted':
                # Get the listing details to include card information
                listing_ref = db_client.collection('listings').document(offer_data.get('listingId', ''))
                listing_doc = await listing_ref.get()

                if listing_doc.exists:
                    listing_data = listing_doc.to_dict()
                    
                    # Generate signed URL for the card image if it exists
                    image_url = listing_data.get('image_url', '')
                    if image_url:
                        try:
                            # R2 URLs are public; no signing required. Just reuse the URL.
                            signed_url = image_url
                            image_url = signed_url
                        except Exception as sign_error:
                            logger.error(f"Failed to process image URL {image_url}: {sign_error}")
                            # Keep the original URL if processing fails

                    # Create the accepted offer object with all required fields
                    accepted_offer = {
                        'amount': offer_data.get('amount', 0),
                        'at': offer_data.get('createdAt', datetime.now()),
                        'card_reference': listing_data.get('card_reference', ''),
                        'collection_id': listing_data.get('collection_id', ''),
                        'expiresAt': offer_data.get('expiresAt', datetime.now() + timedelta(days=7)),
                        'image_url': image_url,
                        'listingId': offer_data.get('listingId', ''),
                        'offererRef': offer_data.get('offererRef', ''),
                        'offerreference': offer_doc.id,
                        'payment_due': offer_data.get('payment_due', datetime.now() + timedelta(days=3)),
                        'status': offer_data.get('status', 'accepted'),
                        'type': offer_data.get('type', 'cash')
                    }

                    accepted_offers.append(accepted_offer)
                else:
                    # Listing doesn't exist for accepted offer - mark for cleanup
                    orphaned_refs.append(offer_doc.reference)
                    logger.info(f"Found orphaned accepted {offer_type} offer {offer_doc.id} for deleted listing {offer_data.get('listingId', '')}")

        # Clean up orphaned accepted offers in batch
        if orphaned_refs:
            @firestore.async_transactional
            async def _cleanup_orphaned_accepted_offers(tx: firestore.AsyncTransaction):
                for ref in orphaned_refs:
                    tx.delete(ref)
            
            transaction = db_client.transaction()
            await _cleanup_orphaned_accepted_offers(transaction)
            logger.info(f"Cleaned up {len(orphaned_refs)} orphaned accepted {offer_type} offers for user {user_id}")

        logger.info(f"Retrieved {len(accepted_offers)} accepted {offer_type} offers for user {user_id}")
        return accepted_offers
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting accepted {offer_type} offers for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get accepted {offer_type} offers: {str(e)}")


async def get_user_marketplace_transactions(
    user_id: str,
    db_client: AsyncClient
) -> List[MarketplaceTransaction]:
    """
    Retrieve all marketplace transactions where the user is either a buyer or seller.

    Args:
        user_id: The ID of the user
        db_client: Firestore async client

    Returns:
        List of MarketplaceTransaction objects

    Raises:
        HTTPException: If there's an error retrieving the transactions
    """
    logger = get_logger(__name__)
    try:
        # Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        # Query transactions where user is buyer
        buyer_query = db_client.collection('marketplace_transactions').where("buyer_id", "==", user_id)
        buyer_docs = await buyer_query.get()

        # Query transactions where user is seller
        seller_query = db_client.collection('marketplace_transactions').where("seller_id", "==", user_id)
        seller_docs = await seller_query.get()

        # Combine and convert to MarketplaceTransaction objects
        transactions = []

        # Process buyer transactions
        for doc in buyer_docs:
            transaction_data = doc.to_dict()
            # Convert Firestore timestamp to datetime if needed
            if transaction_data.get("traded_at") == firestore.SERVER_TIMESTAMP:
                transaction_data["traded_at"] = datetime.now()
            transactions.append(MarketplaceTransaction(**transaction_data))

        # Process seller transactions
        for doc in seller_docs:
            transaction_data = doc.to_dict()
            # Convert Firestore timestamp to datetime if needed
            if transaction_data.get("traded_at") == firestore.SERVER_TIMESTAMP:
                transaction_data["traded_at"] = datetime.now()

            # Check if this transaction is already in the list (from buyer query)
            if not any(t.id == transaction_data["id"] for t in transactions):
                transactions.append(MarketplaceTransaction(**transaction_data))

        # Sort transactions by traded_at in descending order (newest first)
        transactions.sort(key=lambda x: x.traded_at, reverse=True)

        logger.info(f"Retrieved {len(transactions)} marketplace transactions for user {user_id}")
        return transactions
    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error getting marketplace transactions for user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get marketplace transactions: {str(e)}")


async def pay_price_point(
    user_id: str,
    listing_id: str,
    quantity: int,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Pay for a price point directly, which will:
    1. Deduct points from the user's account
    2. Add points to the seller's account
    3. Add the card to the user's collection
    4. Deduct quantity from the listing
    5. Delete the listing if quantity becomes zero
    6. Deduct locked_quantity from the seller's card
    7. Delete the seller's card if both quantity and locked_quantity are zero
    8. Insert data into the marketplace_transactions Firestore collection
    9. Insert data into the marketplace_transactions SQL table

    Args:
        user_id: The ID of the user paying for the price point
        listing_id: The ID of the listing
        quantity: The quantity of cards to buy (default: 1)
        db_client: Firestore async client

    Returns:
        Dictionary with success message and details

    Raises:
        HTTPException: If there's an error paying for the price point
    """
    logger = get_logger(__name__)
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # Disallow Buy Now if listing already has an accepted offer
        if listing_data.get("status") == "accepted":
            raise HTTPException(status_code=400, detail="This listing already has an accepted offer")

        # 3. Get the seller information
        owner_reference = listing_data.get("owner_reference", "")
        logger.info(f"Debug pay_price_point - Retrieved owner_reference from listing: '{owner_reference}', listing_id: '{listing_id}'")
        if not owner_reference:
            raise HTTPException(status_code=500, detail="Invalid listing data: missing owner reference")
        
        # Extract just the user ID from the owner_reference path
        if "/" in owner_reference:
            seller_id = owner_reference.split("/")[-1]
        else:
            seller_id = owner_reference
        logger.info(f"Debug pay_price_point - Extracted seller_id: '{seller_id}'")

        # 4. Verify the user is not the seller
        if seller_id == user_id:
            raise HTTPException(status_code=400, detail="You cannot buy your own listing")

        # 5. Verify the listing has a pricePoints field
        price_points = listing_data.get("pricePoints")
        if price_points is None:
            raise HTTPException(status_code=400, detail="This listing does not have a price in points")

        # 6. Calculate total points to pay
        total_points_to_pay = price_points * quantity

        # 7. Get card information
        card_reference = listing_data.get("card_reference", "")
        collection_id = listing_data.get("collection_id", "")

        if not card_reference or not collection_id:
            raise HTTPException(status_code=500, detail="Invalid listing data: missing card reference or collection ID")

        # 8. Verify the listing has enough quantity
        listing_quantity = listing_data.get("quantity", 0)
        if listing_quantity < quantity:
            raise HTTPException(status_code=400, detail=f"Not enough cards available. Requested: {quantity}, Available: {listing_quantity}")

        # 9. Create a transaction ID
        transaction_id = f"tx_direct_{listing_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        # 10. Get all point offers for this listing (for cleanup if listing quantity becomes zero)
        point_offers_ref = listing_ref.collection('point_offers')
        point_offers = await point_offers_ref.get()

        # 11. Get all cash offers for this listing (for cleanup if listing quantity becomes zero)
        cash_offers_ref = listing_ref.collection('cash_offers')
        cash_offers = await cash_offers_ref.get()
        
        # Calculate seller points before transaction (for use in email notification)
        seller_points_to_receive = int(total_points_to_pay * 0.93)
        
        # Variable to store user points after transaction
        user_points_after = 0

        # 12. Execute the transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # Check user's points balance inside the transaction
            user_doc_tx = await user_ref.get(transaction=tx)
            if not user_doc_tx.exists:
                raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            
            user_data_tx = user_doc_tx.to_dict()
            user_points_tx = user_data_tx.get("pointsBalance", 0)
            
            if user_points_tx < total_points_to_pay:
                raise HTTPException(status_code=400, detail=f"Insufficient points. You have {user_points_tx} points, but {total_points_to_pay} are required.")
            
            # a. Deduct points from the user and increment buy_deal
            tx.update(user_ref, {
                "pointsBalance": firestore.Increment(-total_points_to_pay),
                "buy_deal": firestore.Increment(1)
            })

            # b. Add points to the seller after deducting 7% platform fee and increment sell_deal
            # Platform fee is 7%, so seller receives 93%
            
            # Debug logging
            logger.info(f"Debug pay_price_point - seller_id: '{seller_id}', type: {type(seller_id)}")
            logger.info(f"Debug pay_price_point - firestore_collection_users: '{settings.firestore_collection_users}', type: {type(settings.firestore_collection_users)}")
            
            seller_ref = db_client.collection(settings.firestore_collection_users).document(seller_id)
            tx.update(seller_ref, {
                "pointsBalance": firestore.Increment(seller_points_to_receive),
                "sell_deal": firestore.Increment(1)
            })

            # c. Update the listing quantity
            new_quantity = listing_quantity - quantity

            if new_quantity <= 0:
                # Delete all point offers for this listing
                for offer in point_offers:
                    tx.delete(point_offers_ref.document(offer.id))

                # Delete all cash offers for this listing
                for offer in cash_offers:
                    tx.delete(cash_offers_ref.document(offer.id))

                # Delete the listing if quantity becomes zero
                tx.delete(listing_ref)
            else:
                # Update the listing quantity
                tx.update(listing_ref, {
                    "quantity": new_quantity
                })

            # d. Deduct locked_quantity from the seller's card
            try:
                # Parse card_reference to get card_id
                card_id = card_reference.split('/')[-1]

                # Get reference to the seller's card
                seller_card_ref = seller_ref.collection('cards').document('cards').collection(collection_id).document(card_id)

                # Update the card with decremented locked_quantity
                # Since we can't read in a transaction after writes, we use Increment
                tx.update(seller_card_ref, {
                    'locked_quantity': firestore.Increment(-quantity)
                })
                logger.info(f"Decremented locked_quantity by {quantity} for card {card_id} in seller {seller_id}'s collection")
            except Exception as e:
                logger.error(f"Error updating seller's card: {e}", exc_info=True)
                # Continue with the transaction even if updating the seller's card fails
                # This ensures the main transaction still completes

            # e. Create a marketplace transaction record
            transaction_ref = db_client.collection('marketplace_transactions').document(transaction_id)
            transaction_data = {
                "id": transaction_id,
                "listing_id": listing_id,
                "seller_id": seller_id,
                "buyer_id": user_id,
                "card_id": card_reference.split('/')[-1],
                "quantity": quantity,
                "price_points": total_points_to_pay,
                "price_card_id": None,
                "price_card_qty": None,
                "traded_at": datetime.now()
            }
            tx.set(transaction_ref, transaction_data)
            
            # Return the user's remaining points for use outside the transaction
            return user_points_tx - total_points_to_pay

        # Execute the transaction
        transaction = db_client.transaction()
        user_points_after = await _txn(transaction)

        # 13. Insert data into the marketplace_transactions SQL table
        # Use a single database connection for the SQL operation to ensure transaction integrity
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                # Begin transaction
                conn.autocommit = False

                # Record the transaction in marketplace_transactions table
                cursor.execute(
                    """
                    INSERT INTO marketplace_transactions (listing_id, seller_id, buyer_id, card_id, quantity, price_points, price_card_id, price_card_qty, traded_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (listing_id, seller_id, user_id, card_reference, quantity, total_points_to_pay, None, None, datetime.now())
                )
                sql_transaction_id = cursor.fetchone()[0]
                logger.info(f"Created marketplace transaction record with ID {sql_transaction_id}")

                # Commit the transaction
                conn.commit()
                logger.info(f"Successfully committed SQL database transaction for marketplace transaction {transaction_id}")
                logger.info(f"Recorded marketplace transaction: listing {listing_id}, seller {seller_id}, buyer {user_id}, points {total_points_to_pay}")

            except Exception as e:
                # Rollback on error
                conn.rollback()
                logger.error(f"SQL database transaction failed, rolling back: {str(e)}", exc_info=True)
                # Continue with the response - we've already completed the Firestore transaction,
                # so we don't want to fail the whole operation just because of a database issue
                logger.warning("SQL database transaction failed but Firestore transaction was successful")

            finally:
                # Close cursor (connection will be closed by context manager)
                cursor.close()

        # 14. Add the card to the user's collection
        try:
            # Add the card to the user's collection multiple times based on quantity
            card_references = [card_reference] * quantity
            for card_ref in card_references:
                await add_card_to_user(
                    user_id=user_id,
                    card_reference=card_ref,
                    db_client=db_client,
                    collection_metadata_id=collection_id,
                    from_marketplace=True
                )
        except Exception as e:
            logger.error(f"Error adding card to user {user_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Transaction completed but failed to add card to user: {str(e)}")

        # 15. Send email notification to the seller
        try:
            # Get the seller's user details
            seller = await get_user_by_id(seller_id, db_client)

            # Get the buyer's user details
            buyer = await get_user_by_id(user_id, db_client)

            if seller and seller.email:
                # Send the email notification
                await send_item_sold_email(
                    to_email=seller.email,
                    to_name=seller.displayName,
                    listing_data=listing_data,
                    offer_type="direct",
                    offer_amount=seller_points_to_receive,  # Show net amount after fee
                    buyer_name=buyer.displayName if buyer else "a user"
                )
                logger.info(f"Sent item sold email to {seller.email}")
            else:
                logger.warning(f"Could not send email notification: Seller {seller_id} not found or has no email")
        except Exception as e:
            # Log the error but don't fail the whole operation if email sending fails
            logger.error(f"Error sending item sold email: {e}", exc_info=True)

        # 16. Send purchase confirmation to the buyer
        try:
            buyer = await get_user_by_id(user_id, db_client)
            if buyer and buyer.email:
                await send_purchase_confirmation_email(
                    to_email=buyer.email,
                    to_name=buyer.displayName or "Buyer",
                    listing_data=listing_data,
                    offer_type="point",
                    offer_amount=total_points_to_pay
                )
            else:
                logger.warning(f"Buyer {user_id} not found or has no email; skipping buyer confirmation")
        except Exception as e:
            logger.error(f"Error sending buyer purchase confirmation: {e}", exc_info=True)

        logger.info(f"Successfully paid price point for listing {listing_id} by user {user_id}")
        return {
            "message": f"Successfully paid price point",
            "transaction_id": transaction_id,
            "listing_id": listing_id,
            "points_paid": total_points_to_pay,
            "quantity": quantity,
            "remaining_points": user_points_after
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error paying price point for listing {listing_id} by user {user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to pay price point: {str(e)}")

async def pay_point_offer(
    user_id: str,
    listing_id: str,
    offer_id: str,
    db_client: AsyncClient
) -> Dict[str, Any]:
    """
    Pay for a point offer, which will:
    1. Deduct points from the user's account
    2. Add points to the seller's account
    3. Add the card to the user's collection
    4. Deduct quantity from the listing
    5. Delete the listing if quantity becomes zero
    6. Deduct locked_quantity from the seller's card
    7. Delete the seller's card if both quantity and locked_quantity are zero
    8. Insert data into the marketplace_transactions Firestore collection
    9. Insert data into the marketplace_transactions SQL table
    10. Delete the user's offer from their my_point_offers collection

    Args:
        user_id: The ID of the user paying for the offer (must be the offer creator)
        listing_id: The ID of the listing
        offer_id: The ID of the offer to pay
        db_client: Firestore async client

    Returns:
        Dictionary with success message and details

    Raises:
        HTTPException: If there's an error paying for the offer
    """
    logger = get_logger(__name__)
    try:
        # 1. Verify user exists
        user_ref = db_client.collection(settings.firestore_collection_users).document(user_id)
        user_doc = await user_ref.get()
        if not user_doc.exists:
            raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")

        user_data = user_doc.to_dict()

        # 2. Verify listing exists
        listing_ref = db_client.collection('listings').document(listing_id)
        listing_doc = await listing_ref.get()
        if not listing_doc.exists:
            raise HTTPException(status_code=404, detail=f"Listing with ID {listing_id} not found")

        listing_data = listing_doc.to_dict()

        # 3. Verify the offer exists
        point_offers_ref = listing_ref.collection('point_offers')
        offer_ref = point_offers_ref.document(offer_id)
        offer_doc = await offer_ref.get()

        if not offer_doc.exists:
            raise HTTPException(status_code=404, detail=f"Offer with ID {offer_id} not found")

        offer_data = offer_doc.to_dict()

        # 4. Verify the user is the offer creator
        offerer_ref_path = offer_data.get("offererRef", "")
        expected_offerer_path = f"{settings.firestore_collection_users}/{user_id}"

        if offerer_ref_path != expected_offerer_path:
            raise HTTPException(status_code=403, detail="You can only pay for your own offers")

        # 5. Get the seller information
        seller_id = listing_data.get("owner_reference", "")
        if not seller_id:
            raise HTTPException(status_code=500, detail="Invalid listing data: missing owner reference")

        # 6. Verify the user has enough points
        points_to_pay = offer_data.get("amount", 0)
        user_points = user_data.get("pointsBalance", 0)

        if user_points < points_to_pay:
            raise HTTPException(status_code=400, detail=f"Insufficient points. You have {user_points} points, but {points_to_pay} are required.")

        # 7. Get card information
        card_reference = listing_data.get("card_reference", "")
        collection_id = listing_data.get("collection_id", "")

        if not card_reference or not collection_id:
            raise HTTPException(status_code=500, detail="Invalid listing data: missing card reference or collection ID")

        # 8. Get the quantity to deduct from the listing
        quantity_to_deduct = 1  # Default to 1

        # 9. Find the user's offer in their my_point_offers subcollection
        my_point_offers_ref = user_ref.collection('my_point_offers')
        my_point_offers_query = my_point_offers_ref.where("listingId", "==", listing_id)
        my_point_offers_docs = await my_point_offers_query.get()

        my_offer_ref = None
        for doc in my_point_offers_docs:
            my_offer_data = doc.to_dict()
            # Check if this is the same offer by comparing offerreference
            if my_offer_data.get("offerreference") == offer_id:
                my_offer_ref = doc.reference
                break

        if not my_offer_ref:
            logger.warning(f"Could not find corresponding my_offer for offer {offer_id} in user {user_id}'s my_point_offers collection")

        # Get all point offers for this listing
        point_offers_ref = listing_ref.collection('point_offers')
        point_offers = await point_offers_ref.get()

        # Get all cash offers for this listing
        cash_offers_ref = listing_ref.collection('cash_offers')
        cash_offers = await cash_offers_ref.get()

        # 10. Create a transaction ID
        transaction_id = f"tx_{listing_id}_{offer_id}_{datetime.now().strftime('%Y%m%d%H%M%S')}"

        # 11. Execute the transaction
        @firestore.async_transactional
        async def _txn(tx: firestore.AsyncTransaction):
            # a. Deduct points from the user and increment buy_deal
            tx.update(user_ref, {
                "pointsBalance": firestore.Increment(-points_to_pay),
                "buy_deal": firestore.Increment(1)
            })

            # Add points to the seller (list owner) after deducting 7% platform fee
            # Platform fee is 7%, so seller receives 93%
            seller_points_to_receive = int(points_to_pay * 0.93)
            seller_ref = db_client.collection(settings.firestore_collection_users).document(seller_id)
            tx.update(seller_ref, {
                "pointsBalance": firestore.Increment(seller_points_to_receive),
                "sell_deal": firestore.Increment(1)
            })

            # e. Delete the user's offer from their my_point_offers collection
            if my_offer_ref:
                tx.delete(my_offer_ref)

            # Delete the offer from the listing's point_offers collection
            tx.delete(offer_ref)

            # b. Update the listing quantity
            current_quantity = listing_data.get("quantity", 0)
            new_quantity = current_quantity - quantity_to_deduct

            if new_quantity <= 0:
                # Delete all point offers for this listing
                for offer in point_offers:
                    # We've already deleted the current offer above, so we can skip it here
                    if offer.id == offer_id:
                        continue
                    tx.delete(point_offers_ref.document(offer.id))

                # Delete all cash offers for this listing
                for offer in cash_offers:
                    tx.delete(cash_offers_ref.document(offer.id))

                # Delete the listing if quantity becomes zero
                tx.delete(listing_ref)
            else:
                # Update the listing quantity
                tx.update(listing_ref, {
                    "quantity": new_quantity
                })

            # c. Deduct locked_quantity from the seller's card
            try:
                # Parse card_reference to get collection_id and card_id
                card_id = card_reference.split('/')[-1]

                # Get reference to the seller's card
                seller_card_ref = seller_ref.collection('cards').document('cards').collection(collection_id).document(card_id)

                # Get the seller's card to check current values
                seller_card_doc = await seller_card_ref.get(transaction=tx)

                if seller_card_doc.exists:
                    seller_card_data = seller_card_doc.to_dict()
                    current_locked_quantity = seller_card_data.get('locked_quantity', 0)
                    current_card_quantity = seller_card_data.get('quantity', 0)

                    # Ensure we don't go below zero for locked_quantity
                    new_locked_quantity = max(0, current_locked_quantity - quantity_to_deduct)

                    # Check if both quantity and locked_quantity will be zero
                    if current_card_quantity == 0 and new_locked_quantity == 0:
                        # Delete the card from the seller's collection
                        tx.delete(seller_card_ref)
                        logger.info(f"Deleted card {card_id} from seller {seller_id}'s collection as both quantity and locked_quantity are zero")
                    else:
                        # Update the card with decremented locked_quantity
                        tx.update(seller_card_ref, {
                            'locked_quantity': new_locked_quantity
                        })
                        logger.info(f"Updated locked_quantity for card {card_id} in seller {seller_id}'s collection to {new_locked_quantity}")
            except Exception as e:
                logger.error(f"Error updating seller's card: {e}", exc_info=True)
                # Continue with the transaction even if updating the seller's card fails
                # This ensures the main transaction still completes

            # d. Create a marketplace transaction record
            transaction_ref = db_client.collection('marketplace_transactions').document(transaction_id)
            transaction_data = {
                "id": transaction_id,
                "listing_id": listing_id,
                "seller_id": seller_id,
                "buyer_id": user_id,
                "card_id": card_reference.split('/')[-1],
                "quantity": quantity_to_deduct,
                "price_points": points_to_pay,
                "price_card_id": None,
                "price_card_qty": None,
                "traded_at": datetime.now()
            }
            tx.set(transaction_ref, transaction_data)

        # Execute the transaction
        transaction = db_client.transaction()
        await _txn(transaction)

        # 12. Insert data into the marketplace_transactions SQL table
        # Use a single database connection for the SQL operation to ensure transaction integrity
        with db_connection() as conn:
            cursor = conn.cursor()
            try:
                # Begin transaction
                conn.autocommit = False

                # Record the transaction in marketplace_transactions table
                cursor.execute(
                    """
                    INSERT INTO marketplace_transactions (listing_id, seller_id, buyer_id, card_id, quantity, price_points, price_card_id, price_card_qty, traded_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                    """,
                    (listing_id, seller_id, user_id, card_reference, quantity_to_deduct, points_to_pay, None, None, datetime.now())
                )
                sql_transaction_id = cursor.fetchone()[0]
                logger.info(f"Created marketplace transaction record with ID {sql_transaction_id}")

                # Commit the transaction
                conn.commit()
                logger.info(f"Successfully committed SQL database transaction for marketplace transaction {transaction_id}")
                logger.info(f"Recorded marketplace transaction: listing {listing_id}, seller {seller_id}, buyer {user_id}, points {points_to_pay}")

            except Exception as e:
                # Rollback on error
                conn.rollback()
                logger.error(f"SQL database transaction failed, rolling back: {str(e)}", exc_info=True)
                # Continue with the response - we've already completed the Firestore transaction,
                # so we don't want to fail the whole operation just because of a database issue
                logger.warning("SQL database transaction failed but Firestore transaction was successful")

            finally:
                # Close cursor (connection will be closed by context manager)
                cursor.close()

        # 13. Add the card to the user's collection
        try:
            await add_card_to_user(
                user_id=user_id,
                card_reference=card_reference,
                db_client=db_client,
                collection_metadata_id=collection_id,
                from_marketplace=True
            )
        except Exception as e:
            logger.error(f"Error adding card to user {user_id}: {e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Transaction completed but failed to add card to user: {str(e)}")

        # 14. Send email notification to the seller
        try:
            # Get the seller's user details
            seller = await get_user_by_id(seller_id, db_client)

            # Get the buyer's user details
            buyer = await get_user_by_id(user_id, db_client)

            if seller and seller.email:
                # Send the email notification
                await send_item_sold_email(
                    to_email=seller.email,
                    to_name=seller.displayName,
                    listing_data=listing_data,
                    offer_type="point",
                    offer_amount=seller_points_to_receive,  # Show net amount after fee
                    buyer_name=buyer.displayName if buyer else "a user"
                )
                logger.info(f"Sent item sold email to {seller.email}")
            else:
                logger.warning(f"Could not send email notification: Seller {seller_id} not found or has no email")
        except Exception as e:
            # Log the error but don't fail the whole operation if email sending fails
            logger.error(f"Error sending item sold email: {e}", exc_info=True)

        logger.info(f"Successfully paid for point offer {offer_id} for listing {listing_id} by user {user_id}")
        return {
            "message": f"Successfully paid for point offer",
            "transaction_id": transaction_id,
            "listing_id": listing_id,
            "offer_id": offer_id,
            "points_paid": points_to_pay,
            "remaining_points": user_points - points_to_pay
        }

    except HTTPException as e:
        raise e
    except Exception as e:
        logger.error(f"Error paying for point offer {offer_id} for listing {listing_id} by user {user_id}: {e}", exc_info=True)


async def buy_from_official_listing(
    user_id: str,
    collection_id: str,
    card_id: str,
    quantity: int,
    db_client: firestore.AsyncClient
) -> Dict[str, Any]:
    """
    Buy a card from the official listing.
    Handles the entire transaction locally without calling backend service.
    
    Args:
        user_id: The ID of the user buying the card
        collection_id: The ID of the collection the card belongs to
        card_id: The ID of the card to buy
        quantity: The quantity of cards to buy
        db_client: Firestore async client
        
    Returns:
        Dict containing transaction details
        
    Raises:
        HTTPException: If the transaction fails
    """
    try:
        # Get the card from the official listing
        official_listing_ref = db_client.collection("official_listing").document(collection_id).collection("cards").document(card_id)
        official_listing_doc = await official_listing_ref.get()

        if not official_listing_doc.exists:
            raise HTTPException(
                status_code=404, 
                detail=f"Card with ID {card_id} not found in official listing for collection {collection_id}"
            )

        official_listing_data = official_listing_doc.to_dict()
        current_listing_quantity = official_listing_data.get('quantity', 0)
        price_points = official_listing_data.get('pricePoints', 0)
        card_reference = official_listing_data.get('card_reference')

        # Check if card_reference is valid
        if not card_reference:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid card reference for card {card_id} in collection {collection_id}"
            )

        # Check if there's enough quantity in the official listing
        if current_listing_quantity < quantity:
            raise HTTPException(
                status_code=400, 
                detail=f"Card quantity in official listing ({current_listing_quantity}) is less than requested quantity ({quantity})"
            )

        # Calculate total price
        total_price = price_points * quantity

        # Get user reference
        user_ref = db_client.collection("users").document(user_id)

        # Get the original card data
        original_card_ref = db_client.document(card_reference)
        original_card_doc = await original_card_ref.get()

        if not original_card_doc.exists:
            raise HTTPException(
                status_code=404,
                detail=f"Original card not found at reference {card_reference}"
            )

        original_card_data = original_card_doc.to_dict()
        current_marketplace_quantity = original_card_data.get('quantity_in_offical_marketplace', 0)

        # Start transaction
        @firestore.async_transactional
        async def _transaction(tx: firestore.AsyncTransaction):
            # Check user's points balance inside the transaction
            user_doc_tx = await user_ref.get(transaction=tx)
            if not user_doc_tx.exists:
                raise HTTPException(status_code=404, detail=f"User with ID {user_id} not found")
            
            user_data_tx = user_doc_tx.to_dict()
            points_balance_tx = user_data_tx.get('pointsBalance', 0)
            
            if points_balance_tx < total_price:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Insufficient points balance. You have {points_balance_tx} points, but need {total_price} points"
                )
            
            # 1. Update the official listing
            new_listing_quantity = current_listing_quantity - quantity
            if new_listing_quantity <= 0:
                # If quantity becomes 0, remove the card from the official listing
                tx.delete(official_listing_ref)
            else:
                # Otherwise, update the quantity
                tx.update(official_listing_ref, {"quantity": new_listing_quantity})

            # 2. Update the original card's quantity_in_official_marketplace
            tx.update(
                original_card_ref,
                {'quantity_in_offical_marketplace': max(0, current_marketplace_quantity - quantity)}
            )
            
            # 3. Deduct points from user
            tx.update(user_ref, {"pointsBalance": firestore.Increment(-total_price)})

        # Execute the transaction
        txn = db_client.transaction()
        await _transaction(txn)

        # Add cards to user's collection using the existing function
        from service.card_service import add_card_to_user
        
        for _ in range(quantity):
            await add_card_to_user(
                user_id=user_id,
                card_reference=card_reference,
                db_client=db_client,
                collection_metadata_id=collection_id,
                from_marketplace=True  # This prevents decrementing the original card quantity
            )

        logger.info(f"Successfully bought {quantity} card(s) {card_id} from collection {collection_id} for user {user_id}")

        # Return the result
        result = {
            "card": {
                **official_listing_data,
                "quantity": max(0, current_listing_quantity - quantity),
                "collection_id": collection_id
            },
            "quantity": quantity,
            "total_price": total_price,
            "collection_id": collection_id,
            "message": f"Successfully purchased {quantity} card(s) for {total_price} points"
        }

        return result

    except HTTPException as e:
        logger.error(f"HTTP error in buy_from_official_listing: {e.detail}")
        raise e
    except Exception as e:
        logger.error(f"Error in buy_from_official_listing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"An unexpected error occurred: {str(e)}")


async def get_official_listings(
    collection_id: str,
    db_client: firestore.AsyncClient,
    page: int = 1,
    per_page: int = 10,
    sort_by: str = "pricePoints",
    sort_order: str = "asc",
    search_query: Optional[str] = None
) -> OfficialListingResponse:
    """
    Get official marketplace listings for a specific collection with pagination, sorting, and search.
    
    This function retrieves cards from the official_listing collection and generates signed URLs
    for their images.
    
    Args:
        collection_id: The ID of the collection to get official listings for
        db_client: Firestore async client
        page: The page number to retrieve (default: 1)
        per_page: The number of items per page (default: 10)
        sort_by: The field to sort by (default: "pricePoints")
        sort_order: The sort order, either "asc" or "desc" (default: "asc")
        search_query: Optional search query to filter cards by name
        
    Returns:
        OfficialListingResponse: Response containing cards with signed URLs, pagination info, and filters
    """
    try:
        # Get all cards from the official_listing collection
        cards_ref = db_client.collection("official_listing").document(collection_id).collection("cards")
        cards_stream = cards_ref.stream()
        
        all_cards = []
        async for card_doc in cards_stream:
            card_data = card_doc.to_dict()
            card_data['id'] = card_doc.id
            
            # Ensure collection_id is in the card data
            if 'collection_id' not in card_data:
                card_data['collection_id'] = collection_id
                
            all_cards.append(card_data)
        
        # Apply search filter if provided
        filtered_cards = all_cards
        if search_query and search_query.strip():
            search_term = search_query.strip().lower()
            filtered_cards = [
                card for card in all_cards 
                if search_term in card.get('card_name', '').lower()
            ]
        
        # Apply sorting
        if sort_order.lower() not in ["asc", "desc"]:
            logger.warning(f"Invalid sort_order '{sort_order}'. Defaulting to 'asc'.")
            sort_order = "asc"
            
        reverse_sort = sort_order.lower() == "desc"
        
        # Handle case where the sort_by field might not exist in some cards
        def get_sort_key(card):
            if sort_by == "pricePoints":
                return card.get(sort_by, 0)
            elif sort_by == "card_name":
                return card.get(sort_by, "")
            else:
                return card.get(sort_by, None)
                
        sorted_cards = sorted(
            filtered_cards,
            key=get_sort_key,
            reverse=reverse_sort
        )
        
        # Calculate pagination
        total_items = len(sorted_cards)
        total_pages = math.ceil(total_items / per_page) if total_items > 0 else 0
        
        # Ensure page is within valid range
        current_page = max(1, min(page, total_pages)) if total_pages > 0 else 1
        
        # Apply pagination
        start_idx = (current_page - 1) * per_page
        end_idx = start_idx + per_page
        paginated_cards = sorted_cards[start_idx:end_idx]
        
        # Convert to OfficialListingCardInfo objects and generate signed URLs
        cards_response = []
        for card in paginated_cards:
            # R2 URLs are public, no need to sign them
            # image_url is already public and accessible
                    
            # Calculate priceCash if not present
            price_points = card.get("pricePoints", 0)
            price_cash = card.get("priceCash")
            
            # If priceCash is not set, calculate it from pricePoints
            if price_cash is None:
                price_cash = round(price_points / 100.0, 2) if price_points > 0 else 0.0
            
            # Create the response object
            card_info = OfficialListingCardInfo(
                id=card.get("id", ""),
                card_name=card.get("card_name", ""),
                card_reference=card.get("card_reference", f"{collection_id}/{card.get('id', '')}"),
                collection_id=collection_id,
                condition=card.get("condition", "near_mint"),
                date_got_in_stock=card.get("date_got_in_stock", ""),
                image_url=card.get("image_url", ""),
                pricePoints=price_points,
                priceCash=price_cash,
                quantity=card.get("quantity", 0),
                rarity=card.get("rarity", 1)
            )
            cards_response.append(card_info)
            
        # Create and return the response
        return OfficialListingResponse(
            cards=cards_response,
            pagination=PaginationInfo(
                total_items=total_items,
                total_pages=total_pages,
                current_page=current_page,
                items_per_page=per_page
            ),
            filters=AppliedFilters(
                sort_by=sort_by,
                sort_order=sort_order,
                search_query=search_query
            )
        )
        
    except Exception as e:
        logger.error(f"Error getting official listings for collection {collection_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Could not retrieve official listings: {str(e)}")
