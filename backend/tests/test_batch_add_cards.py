#!/usr/bin/env python3
"""
Test script for the batch add cards to pack endpoint.

This script tests the new batch endpoint that allows adding multiple cards to a pack in a single request.

Usage:
    python test_batch_add_cards.py <collection_id> <pack_id> <collection_metadata_id>

The script will test:
1. Adding multiple cards to a pack in a batch operation
2. Verifying the response contains correct success/failure counts
3. Testing error handling for invalid requests
"""

import asyncio
import httpx
import sys
import json
from typing import List, Dict, Any

async def test_batch_add_cards():
    """
    Test the batch add cards to pack endpoint.
    
    This script:
    1. Takes collection_id, pack_id, and collection_metadata_id as command-line arguments
    2. Calls the batch add cards endpoint with sample card data
    3. Prints the response and verifies the results
    
    Usage:
        python test_batch_add_cards.py <collection_id> <pack_id> <collection_metadata_id>
    """
    if len(sys.argv) < 4:
        print("Usage: python test_batch_add_cards.py <collection_id> <pack_id> <collection_metadata_id>")
        return
    
    collection_id = sys.argv[1]
    pack_id = sys.argv[2]
    collection_metadata_id = sys.argv[3]
    
    # Base URL for the API
    base_url = "http://localhost:8081/api/v1"
    
    # Endpoint URL for batch adding cards
    batch_url = f"{base_url}/packs/{collection_id}/{pack_id}/cards/batch"
    
    print(f"Testing batch add cards endpoint...")
    print(f"Collection ID: {collection_id}")
    print(f"Pack ID: {pack_id}")
    print(f"Collection Metadata ID: {collection_metadata_id}")
    print(f"URL: {batch_url}")
    
    # Sample card data for testing
    # Note: These card IDs should exist in your collection for the test to work
    sample_cards = [
        {
            "collection_metadata_id": collection_metadata_id,
            "document_id": "test_card_1",
            "probability": 0.1,
            "condition": "mint"
        },
        {
            "collection_metadata_id": collection_metadata_id,
            "document_id": "test_card_2", 
            "probability": 0.15,
            "condition": "near mint"
        },
        {
            "collection_metadata_id": collection_metadata_id,
            "document_id": "test_card_3",
            "probability": 0.2,
            "condition": "mint"
        }
    ]
    
    # Request payload
    request_payload = {
        "cards": sample_cards
    }
    
    try:
        async with httpx.AsyncClient() as client:
            print(f"\nSending batch add request with {len(sample_cards)} cards...")
            print(f"Request payload: {json.dumps(request_payload, indent=2)}")
            
            response = await client.post(
                batch_url,
                json=request_payload,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"\nResponse status code: {response.status_code}")
            
            if response.status_code == 201:
                result = response.json()
                print("\nBatch add successful!")
                print(f"Response: {json.dumps(result, indent=2)}")
                
                # Verify the response structure
                assert "total_cards" in result, "Response missing 'total_cards' field"
                assert "successful_cards" in result, "Response missing 'successful_cards' field"
                assert "failed_cards" in result, "Response missing 'failed_cards' field"
                assert "results" in result, "Response missing 'results' field"
                assert "pack_id" in result, "Response missing 'pack_id' field"
                assert "collection_id" in result, "Response missing 'collection_id' field"
                
                # Verify the counts
                total_cards = result["total_cards"]
                successful_cards = result["successful_cards"]
                failed_cards = result["failed_cards"]
                
                print(f"\nSummary:")
                print(f"Total cards: {total_cards}")
                print(f"Successful: {successful_cards}")
                print(f"Failed: {failed_cards}")
                
                assert total_cards == len(sample_cards), f"Expected {len(sample_cards)} total cards, got {total_cards}"
                assert successful_cards + failed_cards == total_cards, "Successful + failed cards should equal total cards"
                
                # Check individual results
                results = result["results"]
                assert len(results) == total_cards, f"Expected {total_cards} results, got {len(results)}"
                
                print(f"\nIndividual card results:")
                for i, card_result in enumerate(results):
                    card_id = card_result["document_id"]
                    success = card_result["success"]
                    error_msg = card_result.get("error_message")
                    
                    status = "✓ SUCCESS" if success else "✗ FAILED"
                    print(f"  {i+1}. {card_id}: {status}")
                    if error_msg:
                        print(f"     Error: {error_msg}")
                
                if successful_cards > 0:
                    print(f"\n✓ Successfully added {successful_cards} cards to pack!")
                if failed_cards > 0:
                    print(f"\n⚠ {failed_cards} cards failed to be added")
                    
            else:
                print(f"\nBatch add failed with status code: {response.status_code}")
                try:
                    error_detail = response.json()
                    print(f"Error response: {json.dumps(error_detail, indent=2)}")
                except:
                    print(f"Error response (raw): {response.text}")
                    
    except Exception as e:
        print(f"\nError during batch add test: {e}")
        import traceback
        traceback.print_exc()

async def test_batch_add_empty_request():
    """Test batch add with empty cards list (should fail)."""
    if len(sys.argv) < 4:
        print("Usage: python test_batch_add_cards.py <collection_id> <pack_id> <collection_metadata_id>")
        return
    
    collection_id = sys.argv[1]
    pack_id = sys.argv[2]
    
    base_url = "http://localhost:8081/api/v1"
    batch_url = f"{base_url}/packs/{collection_id}/{pack_id}/cards/batch"
    
    print(f"\n" + "="*60)
    print("Testing batch add with empty cards list...")
    
    # Empty request payload
    request_payload = {
        "cards": []
    }
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                batch_url,
                json=request_payload,
                headers={"Content-Type": "application/json"}
            )
            
            print(f"Response status code: {response.status_code}")
            
            if response.status_code == 400:
                print("✓ Correctly rejected empty cards list with 400 status")
                error_detail = response.json()
                print(f"Error message: {error_detail.get('detail', 'No detail provided')}")
            else:
                print(f"✗ Expected 400 status code, got {response.status_code}")
                
    except Exception as e:
        print(f"Error during empty request test: {e}")

async def main():
    """Run all tests."""
    print("Batch Add Cards to Pack - Test Suite")
    print("="*60)
    
    # Test 1: Normal batch add
    await test_batch_add_cards()
    
    # Test 2: Empty request
    await test_batch_add_empty_request()
    
    print(f"\n" + "="*60)
    print("All tests completed!")

if __name__ == "__main__":
    asyncio.run(main())
