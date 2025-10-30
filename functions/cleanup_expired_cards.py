import os
import logging
from datetime import datetime
from google.cloud import firestore
import functions_framework

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# 配置
PROJECT_ID = os.environ.get('PROJECT_ID', 'seventh-program-433718-h8')

# 初始化 Firestore
db = firestore.Client(project=PROJECT_ID)


def get_collection_metadata(collection_name: str) -> dict:
    """
    Retrieves metadata for a specific collection from the metadata collection in Firestore.
    
    Args:
        collection_name: The name of the collection to fetch metadata for (e.g., 'pokemon', 'one_piece')
        
    Returns:
        The collection metadata as a dictionary
    """
    meta_collection_name = 'collection_meta_data'
    doc_ref = db.collection(meta_collection_name).document(collection_name)
    
    try:
        doc_snapshot = doc_ref.get()
        
        if not doc_snapshot.exists:
            logger.warning(f"Metadata for collection '{collection_name}' not found in Firestore.")
            return None
        
        metadata_data = doc_snapshot.to_dict()
        return metadata_data
    except Exception as e:
        logger.error(f"Failed to retrieve metadata for collection '{collection_name}': {e}")
        return None


def destroy_card_locally(user_id: str, card_id: str, subcollection_name: str, quantity: int = 1):
    """
    Destroy a card from a user's collection directly in Firestore using a transaction.
    This ensures atomicity of all operations.
    
    Args:
        user_id: The ID of the user who owns the card
        card_id: The ID of the card to destroy
        subcollection_name: The name of the subcollection containing the card
        quantity: The number of cards to destroy
        
    Returns:
        True if successful, False otherwise
    """
    try:
        # 1. Pre-fetch all necessary data outside the transaction
        user_ref = db.collection('users').document(user_id)
        user_doc = user_ref.get()
        
        if not user_doc.exists:
            logger.warning(f"User with ID {user_id} not found")
            return False
        
        # 2. Get the card from user's collection
        card_ref = (
            user_ref
            .collection('cards')
            .document('cards')
            .collection(subcollection_name)
            .document(card_id)
        )
        card_doc = card_ref.get()
        
        if not card_doc.exists:
            logger.warning(f"Card {card_id} not found in subcollection {subcollection_name} for user {user_id}")
            # Clean up stale expiring_cards document so it won't keep failing next runs
            try:
                stale_expiring_ref = db.collection('expiring_cards').document(f"{user_id}_{card_id}")
                stale_expiring_doc = stale_expiring_ref.get()
                if stale_expiring_doc.exists:
                    stale_expiring_ref.delete()
                    logger.info(f"Deleted stale expiring_cards record {user_id}_{card_id}")
            except Exception as cleanup_err:
                logger.error(f"Failed to delete stale expiring_cards record {user_id}_{card_id}: {cleanup_err}")
            return False
        
        card_data = card_doc.to_dict()
        current_quantity = card_data.get('quantity', 0)
        point_worth = card_data.get('point_worth', 0)
        
        # 3. Check if buyback has expired (optional - for expired cards this is expected)
        buyback_expires_at = card_data.get('buybackexpiresAt')
        if buyback_expires_at:
            current_time = datetime.now()
            # Convert Firestore timestamp to datetime if needed
            if hasattr(buyback_expires_at, 'timestamp'):
                buyback_expires_at = datetime.fromtimestamp(buyback_expires_at.timestamp())
            
            # For expired cards, we expect the buyback period to be expired
            # So we just log this but don't block the destruction
            if buyback_expires_at < current_time:
                logger.info(f"Card {card_id} buyback period has expired (expected for expired cards)")
        
        # 4. Validate quantity
        if quantity <= 0:
            logger.error(f"Invalid quantity {quantity}")
            return False
        
        if quantity > current_quantity:
            logger.warning(f"Cannot destroy {quantity} cards, only {current_quantity} available")
            # Adjust to destroy all available cards
            quantity = current_quantity
        
        # Calculate points to add and remaining quantity
        points_to_add = point_worth * quantity
        remaining = current_quantity - quantity
        
        # 5. Pre-fetch main card collection info
        main_card_ref = None
        main_card_exists = False
        collection_metadata = get_collection_metadata(subcollection_name)
        if collection_metadata:
            firestore_collection = collection_metadata.get('firestoreCollection')
            if firestore_collection:
                main_card_ref = db.collection(firestore_collection).document(card_id)
                main_card_doc = main_card_ref.get()
                main_card_exists = main_card_doc.exists
        
        # 6. Check if expiring_cards record exists (do not gate by point_worth; clean consistently)
        expiring_card_ref = db.collection('expiring_cards').document(f"{user_id}_{card_id}")
        expiring_card_exists = expiring_card_ref.get().exists
        
        # 7. Execute transaction with all updates
        @firestore.transactional
        def update_in_transaction(transaction):
            # Add points to user balance
            transaction.update(user_ref, {"pointsBalance": firestore.Increment(points_to_add)})
            
            # Update or delete user's card
            if remaining <= 0:
                transaction.delete(card_ref)
                logger.info(f"Deleting card {card_id} from user {user_id}'s collection")
            else:
                transaction.update(card_ref, {"quantity": remaining})
                logger.info(f"Updating card {card_id} quantity to {remaining} for user {user_id}")
            
            # Return cards to main inventory if it exists
            if main_card_ref and main_card_exists:
                transaction.update(main_card_ref, {"quantity": firestore.Increment(quantity)})
                logger.info(f"Returning {quantity} cards to main inventory for card {card_id}")
            
            # Update expiring_cards collection if needed
            if expiring_card_ref and expiring_card_exists:
                if remaining <= 0:
                    transaction.delete(expiring_card_ref)
                    logger.info(f"Deleting expired card record for {user_id}_{card_id}")
                else:
                    transaction.update(expiring_card_ref, {"quantity": firestore.Increment(-quantity)})
                    logger.info(f"Updating expiring_cards quantity for {user_id}_{card_id}")
        
        # Execute the transaction
        transaction = db.transaction()
        update_in_transaction(transaction)
        
        logger.info(f"Successfully destroyed {quantity} of card {card_id} for user {user_id}, added {points_to_add} points")
        return True
        
    except Exception as e:
        logger.error(f"Error destroying card {card_id} for user {user_id}: {str(e)}")
        return False


def cleanup_expired_cards():
    """扫描过期卡片并销毁它们"""
    logger.info("开始清理过期卡片")
    
    current_time = datetime.utcnow()
    stats = {'scanned': 0, 'destroyed': 0, 'errors': 0}
    
    try:
        # 查询过期卡片
        expired_query = db.collection('expiring_cards').where('expiresAt', '<=', current_time)
        expired_cards = expired_query.stream()
        
        for doc in expired_cards:
            stats['scanned'] += 1
            data = doc.to_dict()
            
            # 解析数据
            user_id = data.get('userId')
            card_reference = data.get('cardReference')
            quantity = data.get('quantity', 1)
            
            if not user_id or not card_reference:
                logger.warning(f"无效数据: {data}")
                stats['errors'] += 1
                # 删除无效记录
                doc.reference.delete()
                continue
            
            # 解析卡片路径: users/{user_id}/cards/cards/{subcollection}/{card_id}
            try:
                path_parts = card_reference.split('/')
                if len(path_parts) != 6:
                    raise ValueError(f"路径格式错误: {card_reference}")
                
                # Extract subcollection name and card ID
                subcollection_name = path_parts[4]
                card_id = path_parts[5]
                
            except Exception as e:
                logger.error(f"解析路径失败 {card_reference}: {str(e)}")
                stats['errors'] += 1
                # 删除无效记录
                doc.reference.delete()
                continue
            
            logger.info(f"处理过期卡片: {user_id}/{subcollection_name}/{card_id} (数量: {quantity})")
            
            # 销毁卡片
            if destroy_card_locally(user_id, card_id, subcollection_name, quantity):
                stats['destroyed'] += 1
                # 只有成功销毁后才删除过期记录
                # 注意：destroy_card_locally 函数内部已经处理了 expiring_cards 的删除/更新
                logger.info(f"成功销毁卡片: {card_id} (用户: {user_id})")
            else:
                stats['errors'] += 1
                logger.error(f"销毁卡片失败: {card_id} (用户: {user_id})")
        
        logger.info(f"清理完成 - 扫描: {stats['scanned']}, 销毁: {stats['destroyed']}, 错误: {stats['errors']}")
        return stats
        
    except Exception as e:
        logger.error(f"清理过程出错: {str(e)}")
        raise


@functions_framework.cloud_event
def cleanup_expired_cards_scheduled(cloud_event):
    """定时触发入口"""
    logger.info("定时任务触发")
    try:
        result = cleanup_expired_cards()
        return {'status': 'success', 'stats': result}
    except Exception as e:
        logger.error(f"执行失败: {str(e)}")
        return {'status': 'error', 'message': str(e)}


@functions_framework.http
def cleanup_expired_cards_http(request):
    """HTTP 触发入口（测试用）"""
    logger.info("HTTP 请求触发")
    try:
        result = cleanup_expired_cards()
        return {
            'success': True,
            'message': '清理完成',
            'stats': result
        }
    except Exception as e:
        logger.error(f"执行失败: {str(e)}")
        return {
            'success': False,
            'error': str(e)
        }, 500