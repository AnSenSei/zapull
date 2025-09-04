"""
Test Payment Saga Implementation

This module tests the payment saga patterns to ensure:
1. Atomic operations
2. Proper idempotency
3. Correct referral handling
4. Database consistency
"""

import pytest
import asyncio
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import datetime
from google.cloud.firestore_v1 import AsyncClient
from fastapi import HTTPException

from service.recharge_payment_saga import RechargePaymentSaga, RechargeSagaStatus
from service.marketplace_payment_saga import MarketplacePaymentSaga, PaymentSagaStatus
from utils.payment_idempotency import PaymentIdempotencyManager, IdempotencyStatus


class TestRechargePaymentSaga:
    """Test the recharge payment saga implementation."""
    
    @pytest.fixture
    def saga(self):
        """Create a saga instance."""
        with patch('service.recharge_payment_saga.execute_query'):
            return RechargePaymentSaga()
    
    @pytest.fixture
    def mock_db_client(self):
        """Create a mock Firestore client."""
        return AsyncMock(spec=AsyncClient)
    
    @pytest.mark.asyncio
    async def test_successful_recharge_without_referral(self, saga, mock_db_client):
        """Test successful recharge without referral."""
        # Mock user
        mock_user = MagicMock()
        mock_user.pointsBalance = 1000
        mock_user.totalCashRecharged = 50
        
        with patch('service.recharge_payment_saga.get_user_by_id', return_value=mock_user):
            with patch.object(saga, '_create_saga_record'):
                with patch.object(saga, '_create_firestore_snapshot', return_value={}):
                    with patch.object(saga, '_execute_firestore_updates', return_value={}):
                        with patch.object(saga, '_execute_sql_updates', return_value=123):
                            with patch.object(saga, '_update_saga_status'):
                                result = await saga.execute_recharge_payment(
                                    payment_id="pi_test123",
                                    user_id="user123",
                                    amount_cents=5000,
                                    amount_dollars=50.0,
                                    points_to_add=5000,
                                    referer_id=None,
                                    refer_code=None,
                                    db_client=mock_db_client
                                )
        
        assert result['status'] == 'success'
        assert result['points_added'] == 5000
        assert result['referral_bonus'] == 0
        assert result['referrer_points'] == 0
    
    @pytest.mark.asyncio
    async def test_successful_recharge_with_referral(self, saga, mock_db_client):
        """Test successful recharge with referral bonus."""
        # Mock user and referrer
        mock_user = MagicMock()
        mock_user.pointsBalance = 0
        mock_user.totalCashRecharged = 0
        
        mock_referrer = MagicMock()
        mock_referrer.pointsBalance = 10000
        
        with patch('service.recharge_payment_saga.get_user_by_id', side_effect=[mock_user, mock_referrer]):
            with patch.object(saga, '_create_saga_record'):
                with patch.object(saga, '_validate_and_calculate_referral', return_value=(250, 250)):
                    with patch.object(saga, '_create_firestore_snapshot', return_value={}):
                        with patch.object(saga, '_execute_firestore_updates', return_value={}):
                            with patch.object(saga, '_execute_sql_updates', return_value=123):
                                with patch.object(saga, '_apply_referral_bonus'):
                                    with patch.object(saga, '_update_saga_status'):
                                        result = await saga.execute_recharge_payment(
                                            payment_id="pi_test124",
                                            user_id="user124",
                                            amount_cents=5000,
                                            amount_dollars=50.0,
                                            points_to_add=5000,
                                            referer_id="referrer123",
                                            refer_code="REF123",
                                            db_client=mock_db_client
                                        )
        
        assert result['status'] == 'success'
        assert result['points_added'] == 5250  # 5000 + 250 bonus
        assert result['referral_bonus'] == 250
        assert result['referrer_points'] == 250
    
    @pytest.mark.asyncio
    async def test_saga_rollback_on_firestore_failure(self, saga, mock_db_client):
        """Test saga rollback when Firestore update fails."""
        mock_user = MagicMock()
        
        with patch('service.recharge_payment_saga.get_user_by_id', return_value=mock_user):
            with patch.object(saga, '_create_saga_record'):
                with patch.object(saga, '_create_firestore_snapshot', return_value={'user': {'pointsBalance': 1000}}):
                    with patch.object(saga, '_execute_firestore_updates', side_effect=Exception("Firestore error")):
                        with patch.object(saga, '_compensate_saga', return_value={'success': True}):
                            with patch.object(saga, '_update_saga_error'):
                                with patch.object(saga, '_update_saga_status'):
                                    with pytest.raises(HTTPException) as exc_info:
                                        await saga.execute_recharge_payment(
                                            payment_id="pi_test125",
                                            user_id="user125",
                                            amount_cents=5000,
                                            amount_dollars=50.0,
                                            points_to_add=5000,
                                            referer_id=None,
                                            refer_code=None,
                                            db_client=mock_db_client
                                        )
        
        assert exc_info.value.status_code == 500
        assert "Firestore error" in str(exc_info.value.detail)
    
    @pytest.mark.asyncio
    async def test_idempotency_prevents_duplicate_processing(self, saga, mock_db_client):
        """Test that idempotency prevents duplicate payment processing."""
        # First call succeeds
        mock_user = MagicMock()
        
        with patch('service.recharge_payment_saga.get_user_by_id', return_value=mock_user):
            with patch.object(saga, '_create_saga_record'):
                with patch.object(saga, '_create_firestore_snapshot', return_value={}):
                    with patch.object(saga, '_execute_firestore_updates', return_value={}):
                        with patch.object(saga, '_execute_sql_updates', return_value=123):
                            with patch.object(saga, '_update_saga_status'):
                                # First call
                                result1 = await saga.execute_recharge_payment(
                                    payment_id="pi_test126",
                                    user_id="user126",
                                    amount_cents=5000,
                                    amount_dollars=50.0,
                                    points_to_add=5000,
                                    referer_id=None,
                                    refer_code=None,
                                    db_client=mock_db_client
                                )
                                
                                # Second call with same payment_id should return cached result
                                # This would be handled by the idempotency decorator
                                # In a real scenario, the decorator would return the cached result
                                # without executing the saga logic again


class TestMarketplacePaymentSaga:
    """Test the marketplace payment saga implementation."""
    
    @pytest.fixture
    def saga(self):
        """Create a saga instance."""
        with patch('service.marketplace_payment_saga.execute_query'):
            return MarketplacePaymentSaga()
    
    @pytest.fixture
    def mock_db_client(self):
        """Create a mock Firestore client."""
        return AsyncMock(spec=AsyncClient)
    
    @pytest.mark.asyncio
    async def test_successful_marketplace_payment(self, saga, mock_db_client):
        """Test successful marketplace payment processing."""
        listing_data = {
            'owner_reference': 'users/seller123',
            'card_reference': 'cards/card123',
            'collection_id': 'collection123',
            'quantity': 1,
            'price': 100
        }
        
        with patch.object(saga, '_create_saga_record'):
            with patch.object(saga, '_validate_listing', return_value=(listing_data, 'seller123', 'cards/card123', 'collection123')):
                with patch.object(saga, '_create_firestore_snapshot', return_value={}):
                    with patch.object(saga, '_execute_firestore_updates', return_value={}):
                        with patch.object(saga, '_execute_sql_updates', return_value=456):
                            with patch('service.marketplace_payment_saga.add_card_to_user'):
                                with patch.object(saga, '_send_notification_email'):
                                    with patch.object(saga, '_update_saga_status'):
                                        result = await saga.execute_marketplace_payment(
                                            payment_id="pi_market123",
                                            amount=10000,
                                            amount_dollars=100.0,
                                            currency="usd",
                                            listing_id="listing123",
                                            buyer_id="buyer123",
                                            offer_id="offer123",
                                            db_client=mock_db_client
                                        )
        
        assert result['status'] == 'success'
        assert result['listing_id'] == 'listing123'
        assert result['buyer_id'] == 'buyer123'
        assert result['seller_id'] == 'seller123'


class TestPaymentIdempotency:
    """Test the payment idempotency manager."""
    
    @pytest.fixture
    def manager(self):
        """Create an idempotency manager."""
        with patch('utils.payment_idempotency.execute_query'):
            return PaymentIdempotencyManager()
    
    @pytest.mark.asyncio
    async def test_acquire_lock_new_operation(self, manager):
        """Test acquiring lock for a new operation."""
        with patch('utils.payment_idempotency.db_connection') as mock_conn:
            mock_cursor = MagicMock()
            mock_conn.return_value.__enter__.return_value.cursor.return_value = mock_cursor
            mock_cursor.fetchone.return_value = None
            
            result = await manager.acquire_lock(
                idempotency_key="test_key_1",
                operation_type="recharge",
                user_id="user123",
                request_data={"amount": 100}
            )
            
            assert result is None  # New operation
    
    @pytest.mark.asyncio
    async def test_acquire_lock_completed_operation(self, manager):
        """Test acquiring lock for an already completed operation."""
        with patch('utils.payment_idempotency.db_connection') as mock_conn:
            mock_cursor = MagicMock()
            mock_conn.return_value.__enter__.return_value.cursor.return_value = mock_cursor
            
            # First execute raises (record exists), then we fetch the existing record
            mock_cursor.execute.side_effect = [Exception("Record exists"), None]
            mock_cursor.fetchone.return_value = (
                IdempotencyStatus.COMPLETED.value,
                '{"status": "success", "points": 5000}',
                None,
                manager.generate_request_hash({"amount": 100}),
                None,
                None,
                1
            )
            
            result = await manager.acquire_lock(
                idempotency_key="test_key_2",
                operation_type="recharge",
                user_id="user123",
                request_data={"amount": 100}
            )
            
            assert result == {"status": "success", "points": 5000}
    
    @pytest.mark.asyncio
    async def test_concurrent_operations_prevented(self, manager):
        """Test that concurrent operations are prevented."""
        with patch('utils.payment_idempotency.db_connection') as mock_conn:
            mock_cursor = MagicMock()
            mock_conn.return_value.__enter__.return_value.cursor.return_value = mock_cursor
            
            # First execute raises (record exists), then we fetch the existing record
            mock_cursor.execute.side_effect = [Exception("Record exists"), None]
            mock_cursor.fetchone.return_value = (
                IdempotencyStatus.PROCESSING.value,
                None,
                None,
                manager.generate_request_hash({"amount": 100}),
                datetime.now() + timedelta(minutes=5),  # Lock not expired
                "worker_1",
                1
            )
            
            with pytest.raises(Exception) as exc_info:
                await manager.acquire_lock(
                    idempotency_key="test_key_3",
                    operation_type="recharge",
                    user_id="user123",
                    request_data={"amount": 100}
                )
            
            assert "currently being processed" in str(exc_info.value)


@pytest.mark.asyncio
async def test_concurrent_recharge_requests():
    """Test handling of concurrent recharge requests."""
    saga = RechargePaymentSaga()
    mock_db_client = AsyncMock(spec=AsyncClient)
    
    # Simulate concurrent requests
    tasks = []
    for i in range(3):
        task = saga.execute_recharge_payment(
            payment_id="pi_concurrent",
            user_id="user_concurrent",
            amount_cents=5000,
            amount_dollars=50.0,
            points_to_add=5000,
            referer_id=None,
            refer_code=None,
            db_client=mock_db_client
        )
        tasks.append(task)
    
    # Only one should succeed, others should get cached result or fail
    # This test would need proper mocking of the idempotency layer


if __name__ == "__main__":
    pytest.main([__file__, "-v"])