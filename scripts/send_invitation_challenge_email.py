#!/usr/bin/env python3
"""
Script to send invitation challenge email to users.

This script fetches user emails from Firestore using fetch_users.py and sends
the invitation challenge email to all users.

Usage:
    MAILGUN_API=your_api_key python send_invitation_challenge_email.py
    
    # Dry run to see what would be sent without sending:
    MAILGUN_API=your_api_key python send_invitation_challenge_email.py --dry-run

Requirements:
    - scripts/fetch_users.py (to fetch users from Firestore)
    - scripts/email_invitation_challenge.html (email template)
    - Environment variable MAILGUN_API
    - Google Cloud credentials for Firestore access
    
Output:
    - scripts/invitation_challenge_sent_log.xlsx
"""

import os
import sys
import subprocess
import argparse
import time
import re
from typing import List, Dict
from datetime import datetime

import pandas as pd
import requests


# Configuration
MAILGUN_DOMAIN = os.getenv("MAILGUN_DOMAIN", "mg.zapull.fun")
FROM_EMAIL = os.getenv("FROM_EMAIL", "Zapull Support <support@mg.zapull.fun>")
SUBJECT = os.getenv("SUBJECT", "🎉 Zapull Invitation Challenge - Earn Up to 9,500 Coins!")
SLEEP_MS = int(os.getenv("SLEEP_MS", "500"))  # Delay between emails
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))

# File paths
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
FETCH_USERS_SCRIPT = os.path.join(SCRIPTS_DIR, "fetch_users.py")
HTML_TEMPLATE_PATH = os.path.join(SCRIPTS_DIR, "email_invitation_challenge_simple.html")
OUTPUT_EXCEL = os.path.join(SCRIPTS_DIR, "invitation_challenge_sent_log.xlsx")


def validate_environment():
    """Validate environment variables and files."""
    mailgun_api = os.getenv("MAILGUN_API")
    if not mailgun_api:
        print("ERROR: MAILGUN_API environment variable must be set", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(FETCH_USERS_SCRIPT):
        print(f"ERROR: fetch_users.py script not found at {FETCH_USERS_SCRIPT}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(HTML_TEMPLATE_PATH):
        print(f"ERROR: HTML template not found at {HTML_TEMPLATE_PATH}", file=sys.stderr)
        sys.exit(1)
    
    return mailgun_api


def load_user_emails_from_firestore() -> List[Dict]:
    """Load user emails from Firestore using fetch_users.py script."""
    users = []
    try:
        print("Fetching users from Firestore...")
        
        # Run fetch_users.py script
        result = subprocess.run(
            [sys.executable, FETCH_USERS_SCRIPT], 
            capture_output=True, 
            text=True, 
            encoding='utf-8',
            cwd=SCRIPTS_DIR
        )
        
        if result.returncode != 0:
            print(f"ERROR: fetch_users.py failed with return code {result.returncode}", file=sys.stderr)
            print(f"STDERR: {result.stderr}", file=sys.stderr)
            sys.exit(1)
        
        # Parse the output (format: email|displayName)
        lines = result.stdout.strip().split('\n')
        for line in lines:
            if not line.strip():
                continue
                
            parts = line.split('|')
            if len(parts) >= 2:
                email = parts[0].strip()
                display_name = parts[1].strip() or "Friend"
                
                # Validate email format (should already be validated by fetch_users.py)
                if email and re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email):
                    users.append({
                        'email': email,
                        'name': display_name
                    })
                else:
                    print(f"Warning: Skipping invalid email format: {email}")
            else:
                print(f"Warning: Skipping malformed line: {line}")
        
        print(f"Loaded {len(users)} valid user emails from Firestore")
        return users
        
    except Exception as e:
        print(f"ERROR: Failed to fetch users from Firestore: {e}", file=sys.stderr)
        sys.exit(1)


def load_existing_sent_emails() -> set:
    """Load emails that have already been sent to avoid duplicates."""
    sent_emails = set()
    if os.path.exists(OUTPUT_EXCEL):
        try:
            df = pd.read_excel(OUTPUT_EXCEL, sheet_name='Sent_Emails')
            # Get emails where sending was successful
            successful_sends = df[df['Email Sent'] == 'Yes']['Email'].tolist()
            sent_emails = set(successful_sends)
            print(f"Found {len(sent_emails)} users who already received the invitation challenge email")
        except Exception as e:
            print(f"Warning: Could not read existing sent emails: {e}")
    else:
        print("No existing sent emails file found - will process all users")
    
    return sent_emails


def create_personalized_html(template_content: str, name: str) -> str:
    """Create personalized HTML content by replacing placeholders."""
    # Replace name placeholder - use "Friend" as fallback
    personalized_name = name if name and name.strip() else "Friend"
    return template_content.replace("{{NAME}}", personalized_name)


def send_email(mailgun_api: str, recipient_email: str, recipient_name: str, html_content: str) -> bool:
    """Send email via Mailgun API."""
    api_base = f"https://api.mailgun.net/v3/{MAILGUN_DOMAIN}/messages"
    
    data = {
        "from": FROM_EMAIL,
        "to": recipient_email,
        "subject": SUBJECT,
        "text": "Please view this email in HTML format to see the invitation challenge details.",
        "html": html_content,
        "h:Reply-To": "support@zapull.fun",
        "h:X-Campaign": "invitation-challenge-2025"
    }
    
    try:
        response = requests.post(
            api_base,
            auth=("api", mailgun_api),
            data=data,
            timeout=30
        )
        
        if response.status_code == 200:
            print(f"✅ Email sent successfully to {recipient_name} ({recipient_email})")
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
    parser = argparse.ArgumentParser(description='Send invitation challenge emails to users')
    parser.add_argument('--dry-run', action='store_true',
                        help='Show what would be sent without actually sending emails')
    
    args = parser.parse_args()
    
    print("🚀 Starting invitation challenge email distribution...")
    
    # Validate environment and files
    if not args.dry_run:
        mailgun_api = validate_environment()
    else:
        # For dry run, just check if files exist
        if not os.path.exists(FETCH_USERS_SCRIPT):
            print(f"ERROR: fetch_users.py script not found at {FETCH_USERS_SCRIPT}")
            sys.exit(1)
        if not os.path.exists(HTML_TEMPLATE_PATH):
            print(f"ERROR: HTML template not found at {HTML_TEMPLATE_PATH}")
            sys.exit(1)
        print("🔍 DRY RUN MODE - No emails will be sent")
    
    # Load user data from Firestore
    users = load_user_emails_from_firestore()
    
    if not users:
        print("ERROR: No valid user emails found in Firestore", file=sys.stderr)
        sys.exit(1)
    
    # Check for users who already received emails
    existing_sent_emails = load_existing_sent_emails() if not args.dry_run else set()
    
    # Filter out users who already received emails
    new_users = [user for user in users if user['email'] not in existing_sent_emails]
    
    if not new_users:
        print("\\n✅ All users have already received the invitation challenge email!")
        print(f"Total users: {len(users)}")
        print(f"Already processed: {len(existing_sent_emails)}")
        print("No new emails to send.")
        return
    
    print(f"\\n📊 Email Status:")
    print(f"   Total users in Firestore: {len(users)}")
    print(f"   Already processed: {len(existing_sent_emails)}")
    print(f"   New users to process: {len(new_users)}")
    
    if args.dry_run:
        print(f"\\n🔍 DRY RUN - Would send emails to these {len(new_users)} users:")
        for user in new_users[:10]:  # Show first 10
            print(f"   - {user['name']} ({user['email']})")
        if len(new_users) > 10:
            print(f"   ... and {len(new_users) - 10} more users")
        return
    
    print(f"\\n🆕 New users who will receive emails:")
    for user in new_users:
        print(f"   - {user['name']} ({user['email']})")
    
    # Load HTML template
    with open(HTML_TEMPLATE_PATH, 'r', encoding='utf-8') as f:
        html_template = f.read()
    
    # Send emails
    sent_records = []
    sent_count = 0
    failed_count = 0
    
    print(f"\\n📧 Starting email distribution to {len(new_users)} users...")
    
    for i, user in enumerate(new_users):
        # Create personalized email
        personalized_html = create_personalized_html(html_template, user['name'])
        
        # Send email
        success = send_email(mailgun_api, user['email'], user['name'], personalized_html)
        
        # Track the send attempt
        record = {
            'Email': user['email'],
            'Name': user['name'],
            'Email Sent': 'Yes' if success else 'No',
            'Sent At': datetime.now().isoformat() if success else '',
            'Send Order': i + 1
        }
        sent_records.append(record)
        
        if success:
            sent_count += 1
        else:
            failed_count += 1
        
        # Progress update
        print(f"Progress: {i + 1}/{len(new_users)} "
              f"(✅ {sent_count} sent, ❌ {failed_count} failed)")
        
        # Rate limiting - don't sleep after last email
        if i < len(new_users) - 1:
            sleep_seconds = SLEEP_MS / 1000.0
            print(f"⏳ Sleeping for {sleep_seconds} seconds...")
            time.sleep(sleep_seconds)
    
    # Save results to Excel
    print(f"\\n📊 Creating Excel log at {OUTPUT_EXCEL}...")
    
    # Load existing records if they exist
    all_records = []
    if os.path.exists(OUTPUT_EXCEL):
        try:
            existing_df = pd.read_excel(OUTPUT_EXCEL, sheet_name='Sent_Emails')
            all_records = existing_df.to_dict('records')
            print(f"Loaded {len(all_records)} existing records")
        except Exception as e:
            print(f"Warning: Could not load existing records: {e}")
    
    # Add new records
    all_records.extend(sent_records)
    df_records = pd.DataFrame(all_records)
    
    # Create summary data
    summary_data = {
        'Metric': [
            'Total Users in Latest Batch',
            'Emails Sent Successfully (Latest)',
            'Emails Failed (Latest)',
            'Total Unique Users Processed',
            'Total Successful Sends (All Time)',
            'Last Run At'
        ],
        'Value': [
            len(new_users),
            sent_count,
            failed_count,
            len(df_records),
            len(df_records[df_records['Email Sent'] == 'Yes']),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ]
    }
    df_summary = pd.DataFrame(summary_data)
    
    # Write to Excel
    with pd.ExcelWriter(OUTPUT_EXCEL, engine='openpyxl') as writer:
        df_records.to_excel(writer, sheet_name='Sent_Emails', index=False)
        df_summary.to_excel(writer, sheet_name='Summary', index=False)
        
        # Format the Excel file
        workbook = writer.book
        
        # Auto-adjust column widths
        for sheet_name in ['Sent_Emails', 'Summary']:
            worksheet = writer.sheets[sheet_name]
            for column in worksheet.columns:
                max_length = 0
                column_name = column[0].column_letter
                for cell in column:
                    try:
                        if len(str(cell.value)) > max_length:
                            max_length = len(str(cell.value))
                    except:
                        pass
                adjusted_width = min(max_length + 2, 50)
                worksheet.column_dimensions[column_name].width = adjusted_width
    
    print(f"✅ Excel log file created successfully: {OUTPUT_EXCEL}")
    
    # Final summary
    print(f"\\n🎯 Final Summary:")
    print(f"   Users processed in this run: {len(new_users)}")
    print(f"   Emails sent successfully: {sent_count}")
    print(f"   Emails failed: {failed_count}")
    print(f"   Success rate: {sent_count / len(new_users) * 100:.1f}%" if new_users else "0%")
    print(f"   Log file: {OUTPUT_EXCEL}")
    
    if failed_count > 0:
        print(f"\\n⚠️  {failed_count} emails failed to send. Check the Excel file for details.")
        sys.exit(1)
    else:
        print(f"\\n🎉 All emails sent successfully!")


if __name__ == "__main__":
    main()