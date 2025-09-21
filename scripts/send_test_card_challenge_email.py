#!/usr/bin/env python3
"""
Test script to send card challenge email to a specific email address.

Usage:
    MAILGUN_API=your_api_key python send_test_card_challenge_email.py recipient@email.com [recipient_name]
"""

import os
import sys
import requests
from datetime import datetime

# Configuration
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN", "mg.zapull.fun")
FROM_EMAIL = os.getenv("FROM_EMAIL", "Zapull Support <support@mg.zapull.fun>")
SUBJECT = os.getenv("SUBJECT", "🎮 Free Card Challenge on Zapull - 50K Points to Start!")

# File paths
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
HTML_TEMPLATE_PATH = os.path.join(SCRIPTS_DIR, "email_card_challenge.html")


def validate_environment():
    """Validate environment variables and files."""
    mailgun_api = os.getenv("MAILGUN_API")
    if not mailgun_api:
        print("ERROR: MAILGUN_API environment variable must be set", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(HTML_TEMPLATE_PATH):
        print(f"ERROR: HTML template not found at {HTML_TEMPLATE_PATH}", file=sys.stderr)
        sys.exit(1)
    
    return mailgun_api


def send_email(mailgun_api: str, recipient_email: str, recipient_name: str, html_content: str) -> bool:
    """Send email via Mailgun API."""
    api_base = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages"
    
    data = {
        "from": FROM_EMAIL,
        "to": recipient_email,
        "subject": SUBJECT,
        "text": "Please view this email in HTML format to see the card challenge details.",
        "html": html_content,
        "h:Reply-To": "support@zapull.fun",
        "h:X-Campaign": "card-challenge-test-2025"
    }
    
    try:
        response = requests.post(
            api_base,
            auth=("api", mailgun_api),
            data=data,
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"✅ Test card challenge email sent successfully to {recipient_name} ({recipient_email})")
            print(f"📧 Message ID: {response.json().get('id', 'N/A')}")
            return True
        else:
            print(f"❌ Failed to send email to {recipient_name} ({recipient_email}): HTTP {response.status_code}")
            print(f"Response: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error sending email to {recipient_name} ({recipient_email}): {e}")
        return False


def main():
    """Main execution function."""
    if len(sys.argv) < 2:
        print("Usage: python send_test_card_challenge_email.py recipient@email.com [recipient_name]")
        sys.exit(1)
    
    recipient_email = sys.argv[1]
    recipient_name = sys.argv[2] if len(sys.argv) > 2 else "Test User"
    
    print("🚀 Sending test card challenge email...")
    print(f"📧 Recipient: {recipient_name} ({recipient_email})")
    
    # Validate environment and files
    mailgun_api = validate_environment()
    
    # Load HTML template
    with open(HTML_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # Send email
    success = send_email(mailgun_api, recipient_email, recipient_name, html_content)
    
    if success:
        print(f"\n🎉 Test card challenge email sent successfully!")
        print(f"⏰ Sent at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    else:
        print(f"\n❌ Failed to send test email.")
        sys.exit(1)


if __name__ == "__main__":
    main()