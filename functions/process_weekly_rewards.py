"""
Cloud Function to process weekly ranking rewards for top 10 users.
This function should be scheduled to run every Sunday at 23:59.
"""

import functions_framework
import logging
from google.cloud import firestore
from flask import Request, jsonify
from datetime import datetime, timedelta
import os
from typing import List, Dict, Any

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firestore client
db = firestore.Client()

# Prize amounts for top 10 players (matching frontend)
PRIZE_AMOUNTS = {
    1: 25000,
    2: 20000,
    3: 15000,
    4: 12500,
    5: 10000,
    6: 7500,
    7: 6875,
    8: 6250,
    9: 5625,
    10: 5000
}


def get_week_boundaries():
    """
    Get the start and end of the current week (Sunday to Saturday).
    
    Returns:
        tuple: (week_start, week_end) as datetime objects
    """
    now = datetime.utcnow()
    # Find the most recent Sunday (or today if it's Sunday)
    days_since_sunday = (now.weekday() + 1) % 7
    week_start = now - timedelta(days=days_since_sunday)
    week_start = week_start.replace(hour=0, minute=0, second=0, microsecond=0)
    
    # Week ends on Saturday at 23:59:59
    week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
    
    return week_start, week_end




def get_top_weekly_users_from_firestore() -> List[Dict[str, Any]]:
    """
    Get top 10 users directly from the weekly_spent Firestore collection.
    
    Based on the card_service.py implementation, weekly spending is tracked in:
    weekly_spent/weekly_spent/{week_id}/{user_id}
    
    Returns:
        List of user dictionaries with ranking information
    """
    try:
        # Get the current week's start date (Monday)
        today = datetime.utcnow()
        start_of_week = today - timedelta(days=today.weekday())
        week_id = start_of_week.strftime("%Y-%m-%d")
        
        logger.info(f"Getting top users for week: {week_id}")
        
        # Query the weekly_spent collection for this week
        # Structure: weekly_spent/weekly_spent/{week_id}/{user_id}
        weekly_spent_ref = db.collection('weekly_spent').document('weekly_spent').collection(week_id)
        
        # Get all users for this week and sort by spent amount
        # Note: Firestore doesn't support server-side sorting by a field and limiting,
        # so we need to get all documents and sort client-side
        all_users = []
        docs = weekly_spent_ref.stream()
        
        for doc in docs:
            user_data = doc.to_dict()
            if user_data:
                all_users.append({
                    'user_id': doc.id,  # Document ID is the user_id
                    'display_name': user_data.get('displayName', 'Unknown'),
                    'avatar': user_data.get('avatar', ''),
                    'spent': user_data.get('spent', 0),
                    'updatedAt': user_data.get('updatedAt')
                })
        
        # Sort by spent amount (descending) and get top 10
        all_users.sort(key=lambda x: x['spent'], reverse=True)
        top_users = all_users[:10]
        
        logger.info(f"Found {len(top_users)} top users for week {week_id}")
        
        # Enrich with user level from users collection if needed
        for user in top_users:
            try:
                user_doc = db.collection('users').document(user['user_id']).get()
                if user_doc.exists:
                    user_data = user_doc.to_dict()
                    user['level'] = user_data.get('level', 1)
                else:
                    user['level'] = 1
            except Exception as e:
                logger.warning(f"Could not get level for user {user['user_id']}: {e}")
                user['level'] = 1
        
        return top_users
        
    except Exception as e:
        logger.error(f"Error getting top users from weekly_spent collection: {e}")
        return []


def award_points_to_user(user_id: str, points: int, rank: int) -> bool:
    """
    Award points to a user using a Firestore transaction.
    
    Args:
        user_id: The user ID to award points to
        points: Number of points to award
        rank: The user's rank (1-10)
    
    Returns:
        bool: True if successful, False otherwise
    """
    try:
        # Use a transaction to ensure atomicity
        @firestore.transactional
        def update_in_transaction(transaction, user_ref):
            # Get the user document within the transaction
            user_doc = user_ref.get(transaction=transaction)
            
            if not user_doc.exists:
                logger.error(f"User {user_id} not found")
                return False
            
            # Update points balance
            transaction.update(user_ref, {
                'pointsBalance': firestore.Increment(points),
                'last_weekly_reward': firestore.SERVER_TIMESTAMP,
                'total_rewards_earned': firestore.Increment(points)
            })
            
            return True
        
        # Get user reference
        user_ref = db.collection('users').document(user_id)
        
        # Execute transaction
        transaction = db.transaction()
        success = update_in_transaction(transaction, user_ref)
        
        if success:
            logger.info(f"Successfully awarded {points} points to user {user_id} (rank {rank})")
        
        return success
        
    except Exception as e:
        logger.error(f"Error awarding points to user {user_id}: {e}")
        return False


def create_reward_record(user_data: Dict[str, Any], rank: int, prize_amount: int, week_ending: str) -> str:
    """
    Create a reward record in the weekly_rewards collection.
    
    Args:
        user_data: User information dictionary
        rank: User's rank
        prize_amount: Points awarded
        week_ending: Week ending date
    
    Returns:
        str: Document ID of the created record
    """
    try:
        reward_data = {
            'user_id': user_data['user_id'],
            'display_name': user_data.get('display_name', 'Unknown'),
            'rank': rank,
            'prize_amount': prize_amount,
            'weekly_spending': user_data.get('spent', 0),
            'created_at': firestore.SERVER_TIMESTAMP,
            'week_ending': week_ending,
            'status': 'awarded'
        }
        
        doc_ref = db.collection('weekly_rewards').add(reward_data)
        return doc_ref[1].id
        
    except Exception as e:
        logger.error(f"Error creating reward record: {e}")
        return None


def create_notification(user_id: str, rank: int, prize_amount: int):
    """
    Create a notification for the user about their weekly reward.
    
    Args:
        user_id: User ID
        rank: User's rank
        prize_amount: Points awarded
    """
    try:
        notification_data = {
            'type': 'weekly_reward',
            'title': 'Weekly Ranking Reward! 🎉',
            'message': f'Congratulations! You ranked #{rank} this week and earned {prize_amount:,} points!',
            'rank': rank,
            'prize_amount': prize_amount,
            'created_at': firestore.SERVER_TIMESTAMP,
            'read': False
        }
        
        db.collection('users').document(user_id)\
          .collection('notifications').add(notification_data)
          
        logger.info(f"Created notification for user {user_id}")
        
    except Exception as e:
        logger.error(f"Error creating notification for user {user_id}: {e}")


@functions_framework.http
def process_weekly_rewards(request: Request):
    """
    HTTP-triggered Cloud Function to process weekly ranking rewards.
    This can be triggered by Cloud Scheduler or manually for testing.
    
    For production, this should be scheduled to run every Sunday at 23:59.
    """
    # Handle CORS preflight request
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "3600"
        }
        return ("", 204, headers)
    
    # Set CORS headers for the actual response
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
    }
    
    try:
        # Check for admin authorization (implement proper auth in production)
        auth_header = request.headers.get('Authorization')
        admin_token = os.environ.get('ADMIN_TOKEN')
        
        # For scheduled jobs, Cloud Scheduler can pass a special token
        is_scheduled = request.headers.get('X-CloudScheduler') == 'true'
        
        if not is_scheduled and (not auth_header or auth_header != f"Bearer {admin_token}"):
            logger.warning("Unauthorized access attempt")
            return jsonify({"error": "Unauthorized"}), 403, headers
        
        logger.info("Starting weekly ranking rewards processing...")
        
        # Get top 10 users directly from Firestore
        top_users = get_top_weekly_users_from_firestore()
        
        if not top_users:
            logger.warning("No users found in weekly ranking")
            return jsonify({
                "success": False,
                "message": "No users found in weekly ranking"
            }), 200, headers
        
        # Process rewards
        week_start, week_end = get_week_boundaries()
        week_ending = week_end.strftime('%Y-%m-%d')
        
        processed_users = []
        total_points_distributed = 0
        errors = []
        
        for i, user_data in enumerate(top_users[:10]):  # Ensure we only process top 10
            rank = i + 1
            prize_amount = PRIZE_AMOUNTS.get(rank, 0)
            
            if prize_amount == 0:
                continue
            
            user_id = user_data['user_id']
            
            logger.info(f"Processing rank {rank}: User {user_id}, Prize: {prize_amount} points")
            
            # Award points using transaction
            success = award_points_to_user(user_id, prize_amount, rank)
            
            if success:
                # Create reward record
                record_id = create_reward_record(user_data, rank, prize_amount, week_ending)
                
                # Create notification
                create_notification(user_id, rank, prize_amount)
                
                processed_users.append({
                    'user_id': user_id,
                    'display_name': user_data.get('display_name', 'Unknown'),
                    'rank': rank,
                    'prize_amount': prize_amount,
                    'record_id': record_id
                })
                
                total_points_distributed += prize_amount
            else:
                errors.append({
                    'user_id': user_id,
                    'rank': rank,
                    'error': 'Failed to award points'
                })
        
        # Create summary record
        summary_data = {
            'processed_at': firestore.SERVER_TIMESTAMP,
            'week_ending': week_ending,
            'total_users_rewarded': len(processed_users),
            'total_points_distributed': total_points_distributed,
            'rewards': processed_users,
            'errors': errors,
            'status': 'completed' if not errors else 'completed_with_errors'
        }
        
        summary_ref = db.collection('weekly_reward_summaries').add(summary_data)
        
        logger.info(f"Successfully processed {len(processed_users)} weekly rewards")
        logger.info(f"Total points distributed: {total_points_distributed}")
        
        if errors:
            logger.warning(f"Encountered {len(errors)} errors during processing")
        
        return jsonify({
            "success": True,
            "message": f"Processed weekly rewards for {len(processed_users)} users",
            "users_rewarded": len(processed_users),
            "total_points": total_points_distributed,
            "summary_id": summary_ref[1].id,
            "errors": errors
        }), 200, headers
        
    except Exception as e:
        logger.error(f"Error processing weekly ranking rewards: {e}", exc_info=True)
        
        # Log error for debugging
        try:
            db.collection('weekly_reward_errors').add({
                'error_message': str(e),
                'timestamp': firestore.SERVER_TIMESTAMP
            })
        except:
            pass
        
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500, headers


@functions_framework.http
def check_weekly_reward_status(request: Request):
    """
    HTTP endpoint to check the status of weekly rewards for the current week.
    """
    # Handle CORS
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Authorization, Content-Type",
            "Access-Control-Max-Age": "3600"
        }
        return ("", 204, headers)
    
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Authorization, Content-Type"
    }
    
    try:
        week_start, week_end = get_week_boundaries()
        week_ending = week_end.strftime('%Y-%m-%d')
        
        # Check if rewards have been processed for this week
        summaries = db.collection('weekly_reward_summaries')\
                     .where('week_ending', '==', week_ending)\
                     .limit(1)\
                     .stream()
        
        summary_list = list(summaries)
        
        if summary_list:
            summary_data = summary_list[0].to_dict()
            return jsonify({
                "processed": True,
                "week_ending": week_ending,
                "total_users_rewarded": summary_data.get('total_users_rewarded', 0),
                "total_points_distributed": summary_data.get('total_points_distributed', 0),
                "status": summary_data.get('status', 'unknown')
            }), 200, headers
        else:
            return jsonify({
                "processed": False,
                "week_ending": week_ending,
                "message": "Weekly rewards have not been processed yet"
            }), 200, headers
            
    except Exception as e:
        logger.error(f"Error checking weekly reward status: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500, headers