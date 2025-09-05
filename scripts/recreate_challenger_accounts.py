#!/usr/bin/env python3
"""
Script to recreate challenger accounts (challenger1 to challenger100) by first deleting existing accounts
and then creating fresh ones in both Firebase Auth and Firestore.

This script:
1. Deletes existing Firebase Auth users and Firestore documents for challenger accounts
2. Deletes associated referral codes
3. Creates fresh Firebase Auth users with new emails and passwords
4. Creates corresponding Firestore user documents with all required fields
5. Generates new unique passwords and referral codes
6. Provides a summary of recreated accounts

Usage:
    python recreate_challenger_accounts.py [--start N] [--end N] [--dry-run]

Examples:
    python recreate_challenger_accounts.py                    # Recreate challenger1-challenger100
    python recreate_challenger_accounts.py --start 1 --end 10  # Recreate challenger1-challenger10
    python recreate_challenger_accounts.py --dry-run          # Preview what would be recreated

⚠️  WARNING: This script will DELETE existing challenger accounts before recreating them!
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


async def delete_challenger_account(user_id: str, db_client, dry_run: bool = False) -> Dict[str, Any]:
    """Delete a challenger account from both Firebase Auth and Firestore."""
    delete_info = {
        "user_id": user_id,
        "deleted_auth": False,
        "deleted_firestore": False,
        "deleted_referral": False,
        "error": None
    }
    
    if dry_run:
        logger.info(f"DRY RUN: Would delete {user_id}")
        return delete_info
    
    try:
        # Delete from Firebase Auth
        try:
            auth.delete_user(user_id)
            delete_info["deleted_auth"] = True
            logger.info(f"Deleted Firebase Auth user: {user_id}")
        except auth.UserNotFoundError:
            logger.info(f"Firebase Auth user not found (already deleted): {user_id}")
            delete_info["deleted_auth"] = True  # Consider it successful since it's already gone
        except Exception as e:
            logger.error(f"Failed to delete Firebase Auth user {user_id}: {e}")
            # Continue with Firestore deletion even if Auth deletion fails
        
        # Get user document to find referral code before deleting
        user_ref = db_client.collection(FIRESTORE_COLLECTION_USERS).document(user_id)
        user_doc = user_ref.get()
        
        refer_code = None
        if user_doc.exists:
            user_data = user_doc.to_dict()
            refer_code = user_data.get('refer_code')
        
        # Delete from Firestore users collection
        try:
            user_ref.delete()
            delete_info["deleted_firestore"] = True
            logger.info(f"Deleted Firestore user document: {user_id}")
        except Exception as e:
            logger.error(f"Failed to delete Firestore user {user_id}: {e}")
        
        # Delete referral code if it exists
        if refer_code:
            try:
                refer_code_ref = db_client.collection('refer_codes').document(refer_code)
                refer_code_ref.delete()
                delete_info["deleted_referral"] = True
                logger.info(f"Deleted referral code: {refer_code}")
            except Exception as e:
                logger.error(f"Failed to delete referral code {refer_code}: {e}")
        else:
            delete_info["deleted_referral"] = True  # No referral code to delete
        
        logger.info(f"Successfully deleted challenger account: {user_id}")
        
    except Exception as e:
        logger.error(f"Failed to delete challenger account {user_id}: {e}")
        delete_info["error"] = str(e)
    
    return delete_info


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


async def recreate_challenger_account(user_id: str, db_client, dry_run: bool = False) -> Dict[str, Any]:
    """Recreate a challenger account by first deleting then creating it."""
    result = {
        "user_id": user_id,
        "deleted": False,
        "created": False,
        "email": None,
        "password": None,
        "error": None
    }
    
    try:
        # Step 1: Delete existing account
        delete_info = await delete_challenger_account(user_id, db_client, dry_run)
        result["deleted"] = not delete_info.get("error")
        
        if delete_info.get("error") and not dry_run:
            result["error"] = f"Delete failed: {delete_info['error']}"
            return result
        
        # Step 2: Create new account
        create_info = await create_challenger_account(user_id, db_client, dry_run)
        result["created"] = create_info["created"] or dry_run
        result["email"] = create_info["email"]
        result["password"] = create_info["password"]
        
        if create_info.get("error"):
            result["error"] = f"Create failed: {create_info['error']}"
        else:
            result.update({
                "display_name": create_info.get("display_name"),
                "refer_code": create_info.get("refer_code"),
                "points_balance": create_info.get("points_balance")
            })
        
    except Exception as e:
        result["error"] = str(e)
    
    return result


async def main():
    parser = argparse.ArgumentParser(description="Recreate challenger accounts (delete and create fresh)")
    parser.add_argument("--start", type=int, default=1, help="Start challenger number (default: 1)")
    parser.add_argument("--end", type=int, default=100, help="End challenger number (default: 100)")
    parser.add_argument("--dry-run", action="store_true", help="Preview what would be recreated without actually doing it")
    parser.add_argument("--output-csv", type=str, help="Save account details to CSV file")
    
    args = parser.parse_args()
    
    # Validate arguments
    if args.start < 1 or args.end > 100 or args.start > args.end:
        print("Error: start must be >= 1, end must be <= 100, and start must be <= end")
        sys.exit(1)
    
    print(f"Recreating challenger accounts from challenger{args.start} to challenger{args.end}")
    if args.dry_run:
        print("DRY RUN MODE - No accounts will actually be deleted or created")
    else:
        print("⚠️  WARNING: This will DELETE existing accounts before recreating them!")
        confirmation = input("Are you sure you want to proceed? (yes/no): ")
        if confirmation.lower() not in ['yes', 'y']:
            print("Operation cancelled.")
            sys.exit(0)
    
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
    
    # Get Firestore client
    db_client = get_firestore_client()
    
    # Process accounts
    accounts_recreated = []
    accounts_failed = []
    
    for i in range(args.start, args.end + 1):
        user_id = f"challenger{i}"
        
        try:
            result = await recreate_challenger_account(user_id, db_client, args.dry_run)
            
            if (result["deleted"] and result["created"]) or args.dry_run:
                accounts_recreated.append(result)
                print(f"✅ {user_id} - {result['email']}")
            else:
                accounts_failed.append(result)
                print(f"❌ {user_id} - {result['error']}")
                
        except Exception as e:
            error_info = {
                "user_id": user_id,
                "email": f"challenger{i}@zapull.com",
                "error": str(e),
                "deleted": False,
                "created": False
            }
            accounts_failed.append(error_info)
            print(f"❌ {user_id} - {str(e)}")
    
    # Print summary
    print(f"\n{'='*60}")
    print("SUMMARY")
    print(f"{'='*60}")
    print(f"Total requested: {args.end - args.start + 1}")
    print(f"Successfully recreated: {len(accounts_recreated)}")
    print(f"Failed to recreate: {len(accounts_failed)}")
    
    if accounts_failed:
        print(f"\nFailed to recreate:")
        for account in accounts_failed:
            print(f"  - {account['user_id']}: {account['error']}")
    
    # Save to CSV if requested
    if args.output_csv and accounts_recreated:
        with open(args.output_csv, 'w', newline='') as csvfile:
            fieldnames = ['user_id', 'email', 'password', 'display_name', 'refer_code', 'points_balance']
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            
            writer.writeheader()
            for account in accounts_recreated:
                if account["created"]:
                    writer.writerow({
                        'user_id': account['user_id'],
                        'email': account['email'],
                        'password': account['password'],
                        'display_name': account.get('display_name', ''),
                        'refer_code': account.get('refer_code', ''),
                        'points_balance': account.get('points_balance', 50000)
                    })
        
        print(f"\nAccount details saved to: {args.output_csv}")
        print("⚠️  IMPORTANT: Keep this file secure as it contains passwords!")
    
    if not args.dry_run and accounts_recreated:
        print(f"\n🎉 Recreated {len(accounts_recreated)} challenger accounts!")
        print("These accounts can now sign in to the frontend using their email and password.")
        print("All accounts are pre-verified and ready to use.")
        print("\n⚠️  Remember: These accounts are blocked from using marketplace and withdraw features.")


if __name__ == "__main__":
    asyncio.run(main())
