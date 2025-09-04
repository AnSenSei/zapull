#!/usr/bin/env python3
"""
Test script to verify the withdrawal fee logic for multiple cards.

This script tests the new logic where:
- If total point_worth of withdrawn cards >= 15000, withdrawal fee is waived (0 points)
- If total point_worth of withdrawn cards < 15000, withdrawal fee is 550 points

Usage:
    python test_withdrawal_fee.py <user_id> <address_id> <phone_number>

The script will test both scenarios:
1. Low value cards (< 15000 total point_worth) - should charge 550 points
2. High value cards (>= 15000 total point_worth) - should waive fee
"""

import asyncio
import httpx
import sys
import json
from typing import List, Dict, Any

async def test_withdrawal_fee():
    """Test the withdrawal fee logic with different card combinations."""
    
    if len(sys.argv) < 4:
        print("Usage: python test_withdrawal_fee.py <user_id> <address_id> <phone_number>")
        print("Example: python test_withdrawal_fee.py user123 addr456 +1234567890")
        return
    
    user_id = sys.argv[1]
    address_id = sys.argv[2]
    phone_number = sys.argv[3]
    
    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"
    
    print(f"Testing withdrawal fee logic for user {user_id}...")
    print("=" * 60)
    
    try:
        async with httpx.AsyncClient() as client:
            # First, get the user's current points balance
            user_url = f"{base_url}/users/{user_id}"
            user_response = await client.get(user_url)
            
            if user_response.status_code != 200:
                print(f"Error getting user data: {user_response.status_code}")
                print(user_response.text)
                return
            
            user_data = user_response.json()
            initial_points = user_data.get('pointsBalance', 0)
            print(f"Initial points balance: {initial_points}")
            
            # Get user's cards to find some for testing
            cards_url = f"{base_url}/users/{user_id}/cards"
            cards_response = await client.get(cards_url)
            
            if cards_response.status_code != 200:
                print(f"Error getting user cards: {cards_response.status_code}")
                print(cards_response.text)
                return
            
            cards_data = cards_response.json()
            print(f"Found {len(cards_data.get('cards', []))} cards in user's collection")
            
            # Find cards for testing
            available_cards = []
            for card in cards_data.get('cards', []):
                if card.get('quantity', 0) > 0:
                    available_cards.append({
                        'card_id': card['id'],
                        'point_worth': card.get('point_worth', 0),
                        'quantity': card.get('quantity', 0),
                        'card_name': card.get('card_name', 'Unknown'),
                        'subcollection_name': 'pokemon'  # Assuming pokemon collection
                    })
            
            if not available_cards:
                print("No cards available for testing. Please ensure the user has some cards.")
                return
            
            print(f"Available cards for testing: {len(available_cards)}")
            for i, card in enumerate(available_cards[:5]):  # Show first 5
                print(f"  {i+1}. {card['card_name']} - Point worth: {card['point_worth']}, Quantity: {card['quantity']}")
            
            # Get user's addresses to check if any are Canadian
            user_addresses = user_data.get('addresses', [])
            canadian_address = None
            non_canadian_address = None

            for addr in user_addresses:
                if addr.get('country', '').upper() in ['CA', 'CANADA']:
                    canadian_address = addr
                else:
                    non_canadian_address = addr

            # Test Case 1: Low value withdrawal - Non-Canada (should charge 550 points)
            print("\n" + "=" * 60)
            print("TEST CASE 1: Low value withdrawal - Non-Canada (< 15000 total point_worth)")
            print("=" * 60)
            
            # Find cards with low total value
            low_value_cards = []
            total_low_value = 0
            for card in available_cards:
                if total_low_value + card['point_worth'] < 15000:
                    low_value_cards.append({
                        'card_id': card['card_id'],
                        'quantity': 1,
                        'subcollection_name': card['subcollection_name']
                    })
                    total_low_value += card['point_worth']
                    if len(low_value_cards) >= 3:  # Test with 3 cards max
                        break

            if low_value_cards and total_low_value < 15000 and non_canadian_address:
                print(f"Testing with {len(low_value_cards)} cards, total point_worth: {total_low_value}")
                print("Expected: 550 points withdrawal fee (Non-Canada)")

                withdraw_request = {
                    'cards': low_value_cards,
                    'address_id': non_canadian_address.get('id', address_id),
                    'phone_number': phone_number
                }
                
                # Make the withdrawal request
                withdraw_url = f"{base_url}/users/{user_id}/cards/withdraw"
                withdraw_response = await client.post(withdraw_url, json=withdraw_request)
                
                if withdraw_response.status_code == 200:
                    print("✅ Low value withdrawal successful!")
                    
                    # Check points balance change
                    user_response = await client.get(user_url)
                    if user_response.status_code == 200:
                        updated_user_data = user_response.json()
                        new_points = updated_user_data.get('pointsBalance', 0)
                        points_deducted = initial_points - new_points
                        print(f"Points deducted: {points_deducted} (Expected: 550)")
                        
                        if points_deducted == 550:
                            print("✅ Correct fee charged for low value withdrawal")
                        else:
                            print(f"❌ Incorrect fee. Expected 550, got {points_deducted}")
                        
                        initial_points = new_points  # Update for next test
                else:
                    print(f"❌ Low value withdrawal failed: {withdraw_response.status_code}")
                    print(withdraw_response.text)
            else:
                print("⚠️  Could not find suitable low-value cards for testing")
            
            # Test Case 2: High value withdrawal (should waive fee)
            print("\n" + "=" * 60)
            print("TEST CASE 2: High value withdrawal (>= 15000 total point_worth)")
            print("=" * 60)
            
            # Find cards with high total value
            high_value_cards = []
            total_high_value = 0
            for card in available_cards:
                if card['point_worth'] >= 15000:  # Single high-value card
                    high_value_cards.append({
                        'card_id': card['card_id'],
                        'quantity': 1,
                        'subcollection_name': card['subcollection_name']
                    })
                    total_high_value = card['point_worth']
                    break
            
            # If no single high-value card, try to combine multiple cards
            if not high_value_cards:
                for card in available_cards:
                    if total_high_value < 15000:
                        high_value_cards.append({
                            'card_id': card['card_id'],
                            'quantity': 1,
                            'subcollection_name': card['subcollection_name']
                        })
                        total_high_value += card['point_worth']
                        if total_high_value >= 15000:
                            break
            
            if high_value_cards and total_high_value >= 15000:
                print(f"Testing with {len(high_value_cards)} cards, total point_worth: {total_high_value}")
                print("Expected: 0 points withdrawal fee (waived)")
                
                withdraw_request = {
                    'cards': high_value_cards,
                    'address_id': address_id,
                    'phone_number': phone_number
                }
                
                # Make the withdrawal request
                withdraw_response = await client.post(withdraw_url, json=withdraw_request)
                
                if withdraw_response.status_code == 200:
                    print("✅ High value withdrawal successful!")
                    
                    # Check points balance change
                    user_response = await client.get(user_url)
                    if user_response.status_code == 200:
                        updated_user_data = user_response.json()
                        new_points = updated_user_data.get('pointsBalance', 0)
                        points_deducted = initial_points - new_points
                        print(f"Points deducted: {points_deducted} (Expected: 0)")
                        
                        if points_deducted == 0:
                            print("✅ Correct fee waived for high value withdrawal")
                        else:
                            print(f"❌ Incorrect fee. Expected 0, got {points_deducted}")
                else:
                    print(f"❌ High value withdrawal failed: {withdraw_response.status_code}")
                    print(withdraw_response.text)
            else:
                print("⚠️  Could not find suitable high-value cards for testing")
                print(f"Total value found: {total_high_value} (need >= 15000)")

            # Test Case 3: Canadian address test (if available)
            if canadian_address:
                print("\n" + "=" * 60)
                print("TEST CASE 3: Canadian address withdrawal")
                print("=" * 60)

                # Test with medium value cards for Canada (< 30000 but > 15000)
                canada_test_cards = []
                total_canada_value = 0
                for card in available_cards:
                    if total_canada_value < 25000:  # Target around 25000 (between thresholds)
                        canada_test_cards.append({
                            'card_id': card['card_id'],
                            'quantity': 1,
                            'subcollection_name': card['subcollection_name']
                        })
                        total_canada_value += card['point_worth']
                        if len(canada_test_cards) >= 3:
                            break

                if canada_test_cards:
                    expected_fee = 0 if total_canada_value >= 30000 else 1000
                    print(f"Testing with {len(canada_test_cards)} cards, total point_worth: {total_canada_value}")
                    print(f"Expected: {expected_fee} points withdrawal fee (Canada - threshold: 30000)")

                    withdraw_request = {
                        'cards': canada_test_cards,
                        'address_id': canadian_address.get('id'),
                        'phone_number': phone_number
                    }

                    # Make the withdrawal request
                    withdraw_response = await client.post(withdraw_url, json=withdraw_request)

                    if withdraw_response.status_code == 200:
                        print("✅ Canadian withdrawal successful!")

                        # Check points balance change
                        user_response = await client.get(user_url)
                        if user_response.status_code == 200:
                            updated_user_data = user_response.json()
                            new_points = updated_user_data.get('pointsBalance', 0)
                            points_deducted = initial_points - new_points
                            print(f"Points deducted: {points_deducted} (Expected: {expected_fee})")

                            if points_deducted == expected_fee:
                                print("✅ Correct fee applied for Canadian withdrawal")
                            else:
                                print(f"❌ Incorrect fee. Expected {expected_fee}, got {points_deducted}")
                    else:
                        print(f"❌ Canadian withdrawal failed: {withdraw_response.status_code}")
                        print(withdraw_response.text)
                else:
                    print("⚠️  Could not find suitable cards for Canadian testing")
            else:
                print("\n⚠️  No Canadian address found for testing Canadian withdrawal logic")

            print("\n" + "=" * 60)
            print("Test completed!")
            
    except Exception as e:
        print(f"Error during testing: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(test_withdrawal_fee())
