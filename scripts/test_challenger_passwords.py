#!/usr/bin/env python3
"""
Dry-run version of the challenger password distribution script for testing.
This version will not send actual emails but will simulate the process and generate the Excel output.

Usage:
    python test_challenger_passwords.py
"""

import os
import sys
import csv
import time
import re
from typing import Dict, List
from datetime import datetime

import pandas as pd

# Add the scripts directory to the path to import from the main script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# File paths
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(SCRIPTS_DIR, "challenger_passwords.csv")
EXCEL_PATH_1 = os.path.join(SCRIPTS_DIR, "box-opening-chanllange.xlsx")  # Original typo
EXCEL_PATH_2 = os.path.join(SCRIPTS_DIR, "box-opening-challenge.xlsx")   # Corrected name
HTML_PATH = os.path.join(SCRIPTS_DIR, "email_challenger_password.html")
OUTPUT_EXCEL = os.path.join(SCRIPTS_DIR, "test_challenger_account_assignments.xlsx")


def validate_files():
    """Validate required files exist."""
    if not os.path.exists(CSV_PATH):
        print(f"ERROR: Challenger passwords file not found at {CSV_PATH}", file=sys.stderr)
        sys.exit(1)
    
    # Check for Excel file (try both names)
    excel_path = None
    if os.path.exists(EXCEL_PATH_1):
        excel_path = EXCEL_PATH_1
    elif os.path.exists(EXCEL_PATH_2):
        excel_path = EXCEL_PATH_2
    else:
        print(f"ERROR: Excel file not found at {EXCEL_PATH_1} or {EXCEL_PATH_2}", file=sys.stderr)
        sys.exit(1)
    
    if not os.path.exists(HTML_PATH):
        print(f"ERROR: HTML template not found at {HTML_PATH}", file=sys.stderr)
        sys.exit(1)
    
    return excel_path


def load_challenger_data() -> List[Dict]:
    """Load challenger passwords from CSV."""
    challengers = []
    with open(CSV_PATH, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            challengers.append({
                'user_id': row['user_id'].strip(),
                'email': row['email'].strip(),
                'password': row['password'].strip()
            })
    
    print(f"📄 Loaded {len(challengers)} challenger accounts from CSV")
    return challengers


def load_user_emails_from_excel(excel_path: str) -> List[str]:
    """Load user emails from Excel file."""
    try:
        # Read the Excel file
        df = pd.read_excel(excel_path, sheet_name=None)  # Load all sheets
        
        all_emails = []
        for sheet_name, sheet_df in df.items():
            print(f"📊 Processing sheet: {sheet_name}")
            print(f"📋 Columns in sheet: {sheet_df.columns.tolist()}")
            
            # Look for email-like columns
            email_columns = []
            for col in sheet_df.columns:
                if 'email' in str(col).lower() or 'mail' in str(col).lower():
                    email_columns.append(col)
            
            if email_columns:
                for col in email_columns:
                    emails_in_col = sheet_df[col].dropna().astype(str).tolist()
                    # Filter for valid email patterns
                    valid_emails = [email.strip() for email in emails_in_col 
                                  if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', email.strip())]
                    all_emails.extend(valid_emails)
                    print(f"✉️  Found {len(valid_emails)} valid emails in column '{col}'")
        
        # Remove duplicates while preserving order
        unique_emails = []
        seen = set()
        for email in all_emails:
            if email not in seen:
                unique_emails.append(email)
                seen.add(email)
        
        print(f"✅ Total unique emails found in Excel: {len(unique_emails)}")
        return unique_emails
        
    except Exception as e:
        print(f"ERROR: Failed to read Excel file {excel_path}: {e}", file=sys.stderr)
        sys.exit(1)


def simulate_email_sending(recipient_email: str, username: str, password: str) -> bool:
    """Simulate email sending (always returns True for testing)."""
    print(f"📧 [DRY RUN] Would send credentials to {recipient_email}")
    print(f"   Username: {username}")
    print(f"   Password: {password[:4]}{'*' * (len(password) - 4)}")  # Partially redacted for security
    return True


def load_existing_assignments() -> Dict[str, str]:
    """Load existing assignments from previous runs to avoid duplicate emails."""
    existing_assignments = {}
    output_excel = os.path.join(SCRIPTS_DIR, "challenger_account_assignments.xlsx")
    
    if os.path.exists(output_excel):
        try:
            import pandas as pd
            df = pd.read_excel(output_excel, sheet_name='Account_Assignments')
            # Create mapping of user email -> challenger account
            for _, row in df.iterrows():
                if row['Email Sent'] == 'Yes':
                    existing_assignments[row['User Email']] = row['Challenger Account']
            print(f"📊 Found {len(existing_assignments)} users who already received credentials")
        except Exception as e:
            print(f"Warning: Could not read existing assignments: {e}")
    else:
        print("🆕 No existing assignments file found - will process all users")
    
    return existing_assignments


def main():
    """Main execution function."""
    print("🦠 Starting challenger password distribution (DRY RUN)...")
    print("=" * 60)
    
    # Validate files
    excel_path = validate_files()
    
    # Load data
    challengers = load_challenger_data()
    
    # Check for existing assignments
    existing_assignments = load_existing_assignments()
    
    # Get all user emails from Excel file
    all_user_emails = load_user_emails_from_excel(excel_path)
    
    if not all_user_emails:
        print("ERROR: No user emails found in Excel file", file=sys.stderr)
        sys.exit(1)
    
    # Filter out users who already received emails
    new_user_emails = [email for email in all_user_emails if email not in existing_assignments]
    
    if not new_user_emails:
        print("\n✅ All users have already received their challenger passwords!")
        print(f"Total users: {len(all_user_emails)}")
        print(f"Already processed: {len(existing_assignments)}")
        print("No new emails to send.")
        return
    
    print(f"\n📊 Email Status:")
    print(f"   Total users in Excel: {len(all_user_emails)}")
    print(f"   Already processed: {len(existing_assignments)}")
    print(f"   New users to process: {len(new_user_emails)}")
    
    user_emails = new_user_emails
    
    if not user_emails:
        print("ERROR: No user emails found in Excel file", file=sys.stderr)
        sys.exit(1)
    
    # Load HTML template (just to verify it exists)
    with open(HTML_PATH, 'r', encoding='utf-8') as f:
        html_template = f.read()
    print(f"📝 HTML template loaded ({len(html_template)} characters)")
    
    # Assignment tracking
    assignments = []
    sent_count = 0
    failed_count = 0
    
    # Determine starting challenger index (next available after existing assignments)
    start_index = len(existing_assignments)
    
    # Assign challenger accounts to users
    print(f"\n📧 Starting email distribution simulation...")
    print(f"👥 Users to process: {len(user_emails)}")
    print(f"🎮 Available challenger accounts: {len(challengers)}")
    print(f"🔢 Starting from challenger{start_index + 1} (index {start_index})")
    print("-" * 60)
    
    for i, user_email in enumerate(user_emails):
        challenger_index = start_index + i
        if challenger_index >= len(challengers):
            print(f"⚠️  Warning: More users than available challenger accounts")
            print(f"⚠️  Need {challenger_index + 1} accounts but only have {len(challengers)}")
            print(f"⚠️  Skipping remaining users starting from: {user_email}")
            break
        
        challenger = challengers[challenger_index]
        
        # Create challenger email format
        challenger_email = f"{challenger['user_id']}@zapull.com"
        
        # Simulate email sending
        success = simulate_email_sending(user_email, challenger_email, challenger['password'])
        
        # Track assignment
        assignment = {
            'User Email': user_email,
            'Challenger Account': challenger_email,  # Use full email format
            'Password': challenger['password'],
            'Email Sent': 'Yes' if success else 'No',
            'Sent At': datetime.now().isoformat() if success else '',
            'Assignment Order': i + 1
        }
        assignments.append(assignment)
        
        if success:
            sent_count += 1
        else:
            failed_count += 1
        
        # Progress update
        print(f"Progress: {i + 1}/{min(len(user_emails), len(challengers))} "
              f"(✅ {sent_count} sent, ❌ {failed_count} failed)")
        
        # Small delay to simulate processing
        time.sleep(0.1)
    
    print("-" * 60)
    
    # Create Excel output
    print(f"\n📊 Creating Excel output at {OUTPUT_EXCEL}...")
    df_assignments = pd.DataFrame(assignments)
    
    # Create summary sheet data
    summary_data = {
        'Metric': [
            'Total Users',
            'Total Challenger Accounts',
            'Emails Sent Successfully',
            'Emails Failed',
            'Unassigned Accounts',
            'Generated At'
        ],
        'Value': [
            len(user_emails),
            len(challengers),
            sent_count,
            failed_count,
            max(0, len(challengers) - len(user_emails)),
            datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        ]
    }
    df_summary = pd.DataFrame(summary_data)
    
    # Write to Excel with multiple sheets
    with pd.ExcelWriter(OUTPUT_EXCEL, engine='openpyxl') as writer:
        df_assignments.to_excel(writer, sheet_name='Account_Assignments', index=False)
        df_summary.to_excel(writer, sheet_name='Summary', index=False)
        
        # Format the Excel file
        workbook = writer.book
        
        # Format assignments sheet
        assignments_sheet = writer.sheets['Account_Assignments']
        for column in assignments_sheet.columns:
            max_length = 0
            column_name = column[0].column_letter
            for cell in column:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            adjusted_width = min(max_length + 2, 50)
            assignments_sheet.column_dimensions[column_name].width = adjusted_width
        
        # Format summary sheet
        summary_sheet = writer.sheets['Summary']
        summary_sheet.column_dimensions['A'].width = 25
        summary_sheet.column_dimensions['B'].width = 30
    
    print(f"✅ Excel file created successfully: {OUTPUT_EXCEL}")
    
    # Final summary
    print(f"\n🎯 DRY RUN SUMMARY:")
    print(f"   📊 Total users processed: {len(assignments)}")
    print(f"   ✅ Emails that would be sent: {sent_count}")
    print(f"   ❌ Emails that would fail: {failed_count}")
    print(f"   📈 Success rate: {sent_count / len(assignments) * 100:.1f}%" if assignments else "0%")
    print(f"   📄 Output file: {OUTPUT_EXCEL}")
    print(f"\n🧪 DRY RUN COMPLETE - No actual emails were sent!")
    
    # Show first few assignments as preview
    if assignments:
        print(f"\n👀 Preview of first 3 assignments:")
        for i, assignment in enumerate(assignments[:3]):
            print(f"   {i+1}. {assignment['User Email']} → {assignment['Challenger Account']}")


if __name__ == "__main__":
    main()
