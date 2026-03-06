"""
Script to update all admin-created virtual users' avatar URLs
from length=2 to length=1 (single-letter initial, matching Google avatar style).

Usage:
    cd backend
    python3 scripts/update_virtual_user_avatars.py --project zapull-production
"""

import asyncio
import os
import sys

# Add the parent directory to sys.path to allow imports from the backend app
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from google.cloud import firestore
from config import settings


async def update_virtual_user_avatars():
    """Update all admin-created virtual users' avatars from length=2 to length=1."""
    project_id = settings.firestore_project_id
    print(f"Using Firestore project: {project_id}")
    
    db = firestore.AsyncClient(project=project_id)
    
    # Query all admin-created users
    users_ref = db.collection('users')
    query = users_ref.where('admin_created', '==', True)
    docs = []
    async for doc in query.stream():
        docs.append(doc)
    
    print(f"Found {len(docs)} admin-created users")
    
    updated_count = 0
    skipped_count = 0
    error_count = 0
    
    for doc in docs:
        user_data = doc.to_dict()
        avatar = user_data.get('avatar', '')
        display_name = user_data.get('displayName', user_data.get('display_name', ''))
        email = user_data.get('email', '')
        
        # Check if avatar uses ui-avatars.com with length=2
        if avatar and 'ui-avatars.com' in avatar and 'length=2' in avatar:
            # Replace length=2 with length=1
            new_avatar = avatar.replace('length=2', 'length=1')
            
            try:
                await doc.reference.update({'avatar': new_avatar})
                updated_count += 1
                print(f"  ✅ Updated: {email} ({doc.id})")
                print(f"     Old: {avatar}")
                print(f"     New: {new_avatar}")
            except Exception as e:
                error_count += 1
                print(f"  ❌ Failed: {email} ({doc.id}): {e}")
        else:
            skipped_count += 1
            reason = "no avatar" if not avatar else (
                "not ui-avatars" if 'ui-avatars.com' not in avatar else "already length=1"
            )
            print(f"  ⏭️  Skipped: {email} ({doc.id}) - {reason}")
    
    print(f"\n{'='*50}")
    print(f"Avatar Update Summary")
    print(f"{'='*50}")
    print(f"Total admin-created users found: {len(docs)}")
    print(f"Updated:  {updated_count}")
    print(f"Skipped:  {skipped_count}")
    print(f"Errors:   {error_count}")
    print(f"{'='*50}")


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Update virtual user avatars from length=2 to length=1')
    parser.add_argument('--project', help='Firestore project ID (overrides settings)')
    args = parser.parse_args()

    if args.project:
        # Override the project ID in settings
        settings.firestore_project_id = args.project

    print("Updating virtual user avatars from length=2 to length=1...\n")
    asyncio.run(update_virtual_user_avatars())
    print("\nDone!")
