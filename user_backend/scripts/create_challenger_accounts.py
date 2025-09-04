#!/usr/bin/env python3
"""
Script to create challenger accounts (challenger1 to challenger100) in both Firebase Auth and Firestore.

This script:
1. Creates Firebase Auth users with unique emails and passwords
2. Creates corresponding Firestore user documents with all required fields
3. Generates unique passwords for security
4. Sets up referral codes for each user
5. Provides a summary of created accounts

Usage:
    python create_challenger_accounts.py [--start N] [--end N] [--dry-run]

Examples:
    python create_challenger_accounts.py                    # Create challenger1-challenger100
    python create_challenger_accounts.py --start 1 --end 10  # Create challenger1-challenger10
    python create_challenger_accounts.py --dry-run          # Preview what would be created
"""

import asyncio
import argparse
import secrets
import random
import string
from datetime import datetime
from typing import List, Dict, Any
import csv
import os
import sys

import firebase_admin
from firebase_admin import auth, credentials
from google.cloud import firestore
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration from environment variables
FIRESTORE_COLLECTION_USERS = os.getenv("FIRESTORE_COLLECTION_USERS", "users")


def get_firestore_client():
    """Create and return a Firestore client."""
    return firestore.Client()


def generate_secure_password(length: int = 12) -> str:
    """Generate a secure random password."""
    # Include letters, digits, and some special characters
    characters = string.ascii_letters + string.digits + "!@#$%^&*"
    return ''.join(secrets.choice(characters) for _ in range(length))


def generate_referral_code() -> str:
    """Generate a random 6-8 character referral code."""
    code_length = random.randint(6, 8)
    return ''.join(random.choices(
        '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 
        k=code_length
    ))


async def reset_password(user_id: str) -> Dict[str, Any]:
    """Reset password for a Firebase Auth user."""
    try:
        # Generate new secure password
        new_password = generate_secure_password()
        
        # Update user password in Firebase Auth
        auth.update_user(
            uid=user_id,
            password=new_password
        )
        
        logger.info(f"Password reset for user: {user_id}")
        
        return {
            "user_id": user_id,
            "email": f"{user_id}@zapull.com",
            "password": new_password,
            "success": True,
            "error": None
        }
    except Exception as e:
        logger.error(f"Failed to reset password for {user_id}: {e}")
        return {
            "user_id": user_id,
            "email": f"{user_id}@zapull.com",
            "password": None,
            "success": False,
            "error": str(e)
        }


async def create_firebase_auth_user(user_id: str, email: str, password: str) -> str:
    """Create a user in Firebase Auth and return the UID."""
    try:
        user_record = auth.create_user(
            uid=user_id,  # Use challenger1, challenger2, etc. as UID
            email=email,
            password=password,
            display_name=f"Challenger {user_id[10:]}",  # Extract number from challengerN
            email_verified=True  # Pre-verify emails to avoid verification step
        )
        logger.info(f"Created Firebase Auth user: {user_record.uid}")
        return user_record.uid
    except Exception as e:
        logger.error(f"Failed to create Firebase Auth user {user_id}: {e}")
        raise


def create_firestore_user(user_id: str, email: str, db_client) -> Dict[str, Any]:
    """Create a user document in Firestore."""
    try:
        # Generate clientSeed
        client_seed = secrets.token_hex(16)
        
        # Generate referral code
        refer_code = generate_referral_code()
        
        # Get current timestamp
        now = datetime.now()
        
        # Extract challenger number for display name
        challenger_num = user_id[10:]  # Remove "challenger" prefix
        
        # Create user data matching the CreateAccountRequest structure
        user_data = {
            "createdAt": now,
            "displayName": f"Challenger {challenger_num}",
            "email": email,
            "addresses": [],  # Empty addresses list
            "avatar": None,
            "level": 1,
            "pointsBalance": 50000,  # Default starting points
            "totalCashRecharged": 0,
            "totalPointsSpent": 0,
            "totalFusion": 0,
            "clientSeed": client_seed,
            "total_point_refered": 0,
            "referred_by": None,
            "stripe_account_id": None,
            "totalAchievements": 0,
            "new_account": True,
            "refer_code": refer_code
        }
        
        # Create user document in Firestore
        user_ref = db_client.collection(FIRESTORE_COLLECTION_USERS).document(user_id)
        user_ref.set(user_data)
        
        # Create referral code document
        refer_code_data = {
            "user": user_id,
            "referer_id": user_id
        }
        refer_code_ref = db_client.collection('refer_codes').document(refer_code)
        refer_code_ref.set(refer_code_data)
        
        logger.info(f"Created Firestore user document: {user_id}")
        logger.info(f"Created referral code: {refer_code}")
        
        return user_data
    except Exception as e:
        logger.error(f"Failed to create Firestore user {user_id}: {e}")
        raise


async def create_challenger_account(user_id: str, db_client, dry_run: bool = False) -> Dict[str, Any]:
    """Create a complete challenger account (Firebase Auth + Firestore)."""
    # Generate unique email and password
    challenger_num = user_id[10:]  # Extract number from challengerN
    email = f"challenger{challenger_num}@zapull.com"
    password = generate_secure_password()
    
    account_info = {
        "user_id": user_id,
        "email": email,
        "password": password,
        "created": False,
        "error": None
    }
    
    if dry_run:
        logger.info(f"DRY RUN: Would create {user_id} with email {email}")
        return account_info
    
    try:
        # Create Firebase Auth user
        firebase_uid = await create_firebase_auth_user(user_id, email, password)
        
        # Create Firestore user document
        user_data = create_firestore_user(user_id, email, db_client)
        
        account_info.update({
            "created": True,
            "firebase_uid": firebase_uid,
            "display_name": user_data["displayName"],
            "refer_code": user_data["refer_code"],
            "points_balance": user_data["pointsBalance"]
        })
        
        logger.info(f"Successfully created challenger account: {user_id}")
        
    except Exception as e:
        logger.error(f"Failed to create challenger account {user_id}: {e}")
        account_info["error"] = str(e)
    
    return account_info


async def main():
    parser = argparse.ArgumentParser(description="Create challenger accounts or reset passwords")
    parser.add_argument("--start", type=int, default=1, help="Start challenger number (default: 1)")
    parser.add_argument("--end", type=int, default=100, help="End challenger number (default: 100)")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be created without actually creating")
    parser.add_argument("--output-csv", type=str, help="Save account details to CSV file")
    parser.add_argument("--reset-passwords", action="store_true", help="Reset passwords for existing challenger accounts")
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.start < 1 or args.end > 100 or args.start > args.end:
        print("Error: start must be >= 1, end must be <= 100, and start must be <= end")
        sys.exit(1)
    
    if args.reset_passwords:
        print(f"Resetting passwords for challenger accounts from challenger{args.start} to challenger{args.end}")
        if args.dry_run:
            print("DRY RUN MODE - No passwords will actually be reset")
    else:
        print(f"Creating challenger accounts from challenger{args.start} to challenger{args.end}")
        if args.dry_run:
            print("DRY RUN MODE - No accounts will actually be created")
    
    # Initialize Firebase Admin SDK if not already initialized
    if not firebase_admin._apps:
        try:
            # Try different initialization methods
            if os.getenv("K_SERVICE"):
                # Cloud Run environment
                firebase_admin.initialize_app()
                print("Initialized Firebase Admin SDK with default credentials (Cloud Run)")
            else:
                # Local development
                cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
                if cred_path and os.path.exists(cred_path):
                    cred = credentials.Certificate(cred_path)
                    firebase_admin.initialize_app(cred)
                    print(f"Initialized Firebase Admin SDK with service account from {cred_path}")
                else:
                    # Try default credentials
                    firebase_admin.initialize_app()
                    print("Initialized Firebase Admin SDK with default credentials")
        except Exception as e:
            print(f"Error: Failed to initialize Firebase Admin SDK: {e}")
            print("Please ensure you have proper Firebase credentials set up.")
            print("See FIREBASE_LOCAL_SETUP.md for instructions.")
            sys.exit(1)
    
    # Get Firestore client (only needed for account creation)
    db_client = get_firestore_client() if not args.reset_passwords else None
    
    # Process accounts
    accounts_created = []
    accounts_failed = []
    
    for i in range(args.start, args.end + 1):
        user_id = f"challenger{i}"
        
        try:
            if args.reset_passwords:
                # Reset password mode
                if args.dry_run:
                    print(f"DRY RUN: Would reset password for {user_id}")
                    account_info = {
                        "user_id": user_id,
                        "email": f"{user_id}@zapull.com",
                        "password": "dry-run-password",
                        "success": True
                    }
                    accounts_created.append(account_info)
                else:
                    account_info = await reset_password(user_id)
                    
                    if account_info["success"]:
                        accounts_created.append(account_info)
                        print(f"🔄 {user_id} - Password reset")
                    else:
                        accounts_failed.append(account_info)
                        print(f"❌ {user_id} - {account_info['error']}")
            else:
                # Account creation mode
                account_info = await create_challenger_account(user_id, db_client, args.dry_run)
                
                if account_info["created"] or args.dry_run:
                    accounts_created.append(account_info)
                    print(f"✅ {user_id} - {account_info['email']}")
                else:
                    accounts_failed.append(account_info)
                    print(f"❌ {user_id} - {account_info['error']}")
                
        except Exception as e:
            error_info = {
                "user_id": user_id,
                "email": f"challenger{i}@zapull.com",
                "error": str(e),
                "created": False if not args.reset_passwords else None,
                "success": False if args.reset_passwords else None
            }
            accounts_failed.append(error_info)
            print(f"❌ {user_id} - {str(e)}")
    
    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Total requested: {args.end - args.start + 1}")
    if args.reset_passwords:
        print(f"Successfully reset: {len(accounts_created)}")
        print(f"Failed to reset: {len(accounts_failed)}")
    else:
        print(f"Successfully created: {len(accounts_created)}")
        print(f"Failed to create: {len(accounts_failed)}")
    
    if accounts_failed:
        failed_type = "reset" if args.reset_passwords else "create"
        print(f"\nFailed to {failed_type}:")
        for account in accounts_failed:
            print(f"  - {account['user_id']}: {account['error']}")
    
    # Save to CSV if requested
    if args.output_csv and accounts_created:
        with open(args.output_csv, 'w', newline='') as csvfile:
            if args.reset_passwords:
                # For password reset, only export basic info
                fieldnames = ['user_id', 'email', 'password']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                for account in accounts_created:
                    if account.get("success", False) and not args.dry_run:
                        writer.writerow({
                            'user_id': account['user_id'],
                            'email': account['email'],
                            'password': account['password']
                        })
            else:
                # For account creation, export all details
                fieldnames = ['user_id', 'email', 'password', 'display_name', 'refer_code', 'points_balance']
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                writer.writeheader()
                for account in accounts_created:
                    if account["created"]:
                        writer.writerow({
                            'user_id': account['user_id'],
                            'email': account['email'],
                            'password': account['password'],
                            'display_name': account.get('display_name', ''),
                            'refer_code': account.get('refer_code', ''),
                            'points_balance': account.get('points_balance', 500)
                        })
        
        action = "Password reset" if args.reset_passwords else "Account"
        print(f"\n{action} details saved to: {args.output_csv}")
        print("⚠️  IMPORTANT: Keep this file secure as it contains passwords!")
    
    if not args.dry_run and accounts_created:
        if args.reset_passwords:
            print(f"\n🔄 Reset passwords for {len(accounts_created)} challenger accounts!")
            print("These accounts can now sign in with their new passwords.")
        else:
            print(f"\n🎉 Created {len(accounts_created)} challenger accounts!")
            print("These accounts can now sign in to the frontend using their email and password.")
            print("All accounts are pre-verified and ready to use.")
        
        if not args.reset_passwords:
            print("\n⚠️  Remember: These accounts are blocked from using marketplace and withdraw features.")


if __name__ == "__main__":
    asyncio.run(main())
