from typing import Dict, Any
from datetime import datetime
import requests
from config import get_logger, settings

logger = get_logger(__name__)

async def send_shop_order_receipt_email(to_email: str, to_name: str, order_id: str, order_data: Dict[str, Any], cards_added: list):
    """
    Send an email receipt to a customer after their shop order payment is authorized.
    
    Args:
        to_email: The email address of the customer
        to_name: The name of the customer
        order_id: The order ID
        order_data: Dictionary containing order information
        cards_added: List of cards in the order
    
    Returns:
        The response from the Mailgun API
    """
    try:
        # Format order details
        order_reference = order_id[:12].upper()
        current_date = datetime.now().strftime("%B %d, %Y")
        
        subtotal = order_data.get('subtotal', 0)
        shipping_cost = order_data.get('shipping_cost', 0)
        tax_amount = order_data.get('tax_amount', 0)
        total_amount = order_data.get('amount_paid', 0)
        
        # Build items list for email
        items_html = ''
        for card in cards_added:
            items_html += f"""
            <tr>
                <td style="padding: 8px 0; font-size: 14px; color: #2c3e50;">{card.get('card_name', 'N/A')}</td>
                <td style="padding: 8px 0; font-size: 14px; color: #6c757d; text-align: center;">{card.get('quantity', 1)}</td>
                <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">${card.get('price', 0):.2f}</td>
                <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right; font-weight: 500;">${(card.get('price', 0) * card.get('quantity', 1)):.2f}</td>
            </tr>
            """
        
        # Construct the email subject and body
        subject = f"Order Confirmation - {order_reference}"
        
        text = f"""Dear {to_name},

Thank you for your order! Your payment has been authorized and your order is being processed.

Order Reference: {order_reference}
Order Date: {current_date}

ORDER SUMMARY
-------------
Subtotal: ${subtotal:.2f}
Shipping: ${shipping_cost:.2f}
Tax: ${tax_amount:.2f}
Total: ${total_amount:.2f}

IMPORTANT INFORMATION
---------------------
• Your payment has been authorized successfully
• Orders are usually shipped within four business days after processing
• Once your order is processed and shipped, you will receive a tracking number
• PLEASE NOTE: Once your order is processed, it cannot be cancelled
• You can cancel this order before processing at: https://zapull.fun/user/withdrawals

Order Status: https://zapull.fun/user/withdrawals
Support: support@zapull.fun

Thank you for shopping with Zapull!

Zapull Shop
© {datetime.now().year} Zapull. All rights reserved.
"""
        
        html = f"""
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Order Confirmation</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #2c3e50; background-color: #f5f5f5;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td align="center" style="padding: 40px 20px;">
                        <table role="presentation" style="width: 600px; max-width: 100%; background-color: #ffffff; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                            <!-- Header -->
                            <tr>
                                <td style="padding: 30px 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); text-align: center;">
                                    <h1 style="font-size: 28px; font-weight: 700; color: #ffffff; margin: 0;">Order Confirmed!</h1>
                                    <p style="font-size: 16px; color: #ffffff; margin: 10px 0 0; opacity: 0.9;">Thank you for your purchase</p>
                                </td>
                            </tr>
                            
                            <!-- Order Info -->
                            <tr>
                                <td style="padding: 30px 20px;">
                                    <p style="font-size: 16px; margin: 0 0 20px;">Dear {to_name},</p>
                                    
                                    <p style="font-size: 14px; color: #495057; margin: 0 0 25px;">
                                        Your payment has been authorized successfully! Your order is now being processed and will be shipped soon.
                                    </p>
                                    
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px; background-color: #f8f9fa; border-radius: 4px;">
                                                <table role="presentation" style="width: 100%;">
                                                    <tr>
                                                        <td style="font-size: 14px; color: #6c757d;">Order Number:</td>
                                                        <td style="font-size: 14px; color: #2c3e50; text-align: right; font-weight: 600;">{order_reference}</td>
                                                    </tr>
                                                    <tr>
                                                        <td style="font-size: 14px; color: #6c757d; padding-top: 8px;">Order Date:</td>
                                                        <td style="font-size: 14px; color: #2c3e50; text-align: right; padding-top: 8px;">{current_date}</td>
                                                    </tr>
                                                </table>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Order Items -->
                                    <h2 style="font-size: 18px; font-weight: 600; color: #2c3e50; margin: 0 0 15px;">Order Items</h2>
                                    <table role="presentation" style="width: 100%; border: 1px solid #dee2e6; border-radius: 4px; margin: 0 0 25px;">
                                        <thead>
                                            <tr style="background-color: #f8f9fa;">
                                                <th style="padding: 12px 8px; text-align: left; font-size: 12px; font-weight: 600; color: #6c757d; text-transform: uppercase;">Item</th>
                                                <th style="padding: 12px 8px; text-align: center; font-size: 12px; font-weight: 600; color: #6c757d; text-transform: uppercase;">Qty</th>
                                                <th style="padding: 12px 8px; text-align: right; font-size: 12px; font-weight: 600; color: #6c757d; text-transform: uppercase;">Price</th>
                                                <th style="padding: 12px 8px; text-align: right; font-size: 12px; font-weight: 600; color: #6c757d; text-transform: uppercase;">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {items_html}
                                        </tbody>
                                    </table>
                                    
                                    <!-- Order Total -->
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 8px 0; font-size: 14px; color: #6c757d; text-align: right;">Subtotal:</td>
                                            <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right; width: 100px;">${subtotal:.2f}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; font-size: 14px; color: #6c757d; text-align: right;">Shipping:</td>
                                            <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">${shipping_cost:.2f}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 8px 0; font-size: 14px; color: #6c757d; text-align: right;">Tax:</td>
                                            <td style="padding: 8px 0; font-size: 14px; color: #2c3e50; text-align: right;">${tax_amount:.2f}</td>
                                        </tr>
                                        <tr>
                                            <td style="padding: 12px 0 8px; font-size: 16px; color: #2c3e50; text-align: right; border-top: 2px solid #dee2e6; font-weight: 600;">Total:</td>
                                            <td style="padding: 12px 0 8px; font-size: 18px; color: #28a745; text-align: right; border-top: 2px solid #dee2e6; font-weight: 700;">${total_amount:.2f}</td>
                                        </tr>
                                    </table>
                                    
                                    <!-- Important Notice -->
                                    <table role="presentation" style="width: 100%; background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; margin: 0 0 25px;">
                                        <tr>
                                            <td style="padding: 15px;">
                                                <h3 style="font-size: 14px; font-weight: 600; color: #856404; margin: 0 0 10px;">⚠️ IMPORTANT NOTICE</h3>
                                                <p style="font-size: 14px; color: #856404; margin: 0 0 8px;">• Your payment has been authorized but not yet charged</p>
                                                <p style="font-size: 14px; color: #856404; margin: 0 0 8px;">• Orders are usually shipped within four business days after processing</p>
                                                <p style="font-size: 14px; color: #856404; margin: 0 0 8px; font-weight: 600;">• Once processed, orders CANNOT be cancelled</p>
                                                <p style="font-size: 14px; color: #856404; margin: 0;">• You can cancel this order before processing in your account</p>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <!-- CTA Button -->
                                    <table role="presentation" style="width: 100%; margin: 0 0 25px;">
                                        <tr>
                                            <td align="center">
                                                <a href="https://zapull.fun/user/withdrawals?tab=shop" style="display: inline-block; padding: 14px 32px; background-color: #667eea; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 16px; font-weight: 600; box-shadow: 0 2px 4px rgba(102, 126, 234, 0.4);">View Order Status</a>
                                            </td>
                                        </tr>
                                    </table>
                                    
                                    <p style="font-size: 13px; color: #6c757d; margin: 0; text-align: center;">
                                        Questions? Contact us at <a href="mailto:support@zapull.fun" style="color: #667eea; text-decoration: none;">support@zapull.fun</a>
                                    </p>
                                </td>
                            </tr>
                            
                            <!-- Footer -->
                            <tr>
                                <td style="padding: 20px; background-color: #f8f9fa; text-align: center;">
                                    <p style="font-size: 12px; color: #6c757d; margin: 0;">
                                        This is an automated order confirmation from Zapull Shop.<br>
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
        
        # Send the email using Mailgun API
        response = requests.post(
            "https://api.mailgun.net/v3/mg.zapull.fun/messages",
            auth=("api", settings.mailgun_api),
            data={
                "from": "Zapull Shop <shop@mg.zapull.fun>",
                "to": f"{to_name} <{to_email}>",
                "subject": subject,
                "text": text,
                "html": html,
                "h:Reply-To": "support@zapull.fun",
                "h:X-Priority": "3",
                "h:X-Order-ID": order_id
            }
        )
        
        if response.status_code != 200:
            logger.error(f"Failed to send order receipt email: {response.text}")
            return None
        
        logger.info(f"Successfully sent order receipt email to {to_email}")
        return response
        
    except Exception as e:
        logger.error(f"Error sending order receipt email: {e}", exc_info=True)
        return None
