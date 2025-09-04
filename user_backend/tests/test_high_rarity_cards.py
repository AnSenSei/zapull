import asyncio
import httpx
import sys
import json

async def test_high_rarity_cards():
    """
    Test the tracking of high-rarity cards (rarity > 4) when drawing cards.
    
    This script:
    1. Takes a user ID, pack ID, and collection ID as command-line arguments
    2. Gets the user document to check initial high-rarity card counts
    3. Calls the draw-multiple-cards endpoint
    4. Checks the drawn cards for any with rarity > 4
    5. Gets the user document again to verify high-rarity card counts are updated
    
    Usage:
        python test_high_rarity_cards.py <user_id> <pack_id> <collection_id> [<count>]
    """
    if len(sys.argv) < 4:
        print("Usage: python test_high_rarity_cards.py <user_id> <pack_id> <collection_id> [<count>]")
        return
    
    user_id = sys.argv[1]
    pack_id = sys.argv[2]
    collection_id = sys.argv[3]
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 5
    
    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"
    
    # Endpoint URL for drawing cards
    draw_url = f"{base_url}/users/{user_id}/draw-multiple-cards?pack_id={pack_id}&collection_id={collection_id}&count={count}"
    
    print(f"Testing high-rarity card tracking for user {user_id}...")
    print(f"URL: {draw_url}")
    
    try:
        async with httpx.AsyncClient() as client:
            # First, get the user document to check initial high-rarity card counts
            user_url = f"{base_url}/users/{user_id}"
            user_response = await client.get(user_url)
            
            initial_high_rarity_fields = {}
            if user_response.status_code == 200:
                user_data = user_response.json()
                print("Initial user information:")
                print(f"User ID: {user_data.get('email', user_id)}")
                
                # Check for existing high-rarity card counts
                for field, value in user_data.items():
                    if field.startswith("total_drawn_rarity_") and isinstance(value, int):
                        initial_high_rarity_fields[field] = value
                
                if initial_high_rarity_fields:
                    print("Initial high-rarity card counts:")
                    for field, value in initial_high_rarity_fields.items():
                        print(f"  {field}: {value}")
                else:
                    print("No high-rarity card counts found in user document")
            else:
                print(f"Error getting user data: {user_response.status_code}")
                print(user_response.text)
            
            # Draw cards
            print("\nDrawing cards...")
            draw_response = await client.post(draw_url)
            
            drawn_high_rarity_cards = {}
            if draw_response.status_code == 200:
                draw_result = draw_response.json()
                print(f"Successfully drew {len(draw_result)} cards!")
                
                # Check for high-rarity cards (rarity > 4)
                for card in draw_result:
                    card_name = card.get('card_name', 'Unknown')
                    card_id = card.get('id', 'Unknown')
                    rarity = card.get('rarity', 0)
                    
                    print(f"Card: {card_name} (ID: {card_id}), Rarity: {rarity}")
                    
                    if rarity > 4:
                        field_name = f"total_drawn_rarity_{rarity}"
                        drawn_high_rarity_cards[field_name] = drawn_high_rarity_cards.get(field_name, 0) + 1
                
                if drawn_high_rarity_cards:
                    print("\nHigh-rarity cards drawn:")
                    for field, count in drawn_high_rarity_cards.items():
                        print(f"  {field}: {count}")
                else:
                    print("\nNo high-rarity cards (rarity > 4) were drawn")
            else:
                print(f"Error drawing cards: {draw_response.status_code}")
                print(draw_response.text)
                return
            
            # Wait a moment to ensure database updates are complete
            await asyncio.sleep(1)
            
            # Get the updated user document to check high-rarity card counts
            print("\nChecking updated user document...")
            user_response = await client.get(user_url)
            
            if user_response.status_code == 200:
                updated_user_data = user_response.json()
                
                # Check for high-rarity card counts
                updated_high_rarity_fields = {}
                for field, value in updated_user_data.items():
                    if field.startswith("total_drawn_rarity_") and isinstance(value, int):
                        updated_high_rarity_fields[field] = value
                
                if updated_high_rarity_fields:
                    print("Updated high-rarity card counts:")
                    for field, value in updated_high_rarity_fields.items():
                        initial_value = initial_high_rarity_fields.get(field, 0)
                        if value != initial_value:
                            print(f"  {field}: {initial_value} -> {value} (Increased by {value - initial_value})")
                        else:
                            print(f"  {field}: {value} (Unchanged)")
                    
                    # Verify that the counts match the drawn cards
                    print("\nVerifying counts match drawn cards:")
                    all_correct = True
                    for field, drawn_count in drawn_high_rarity_cards.items():
                        expected_value = initial_high_rarity_fields.get(field, 0) + drawn_count
                        actual_value = updated_high_rarity_fields.get(field, 0)
                        
                        if actual_value == expected_value:
                            print(f"  ✓ {field} correctly updated: {initial_high_rarity_fields.get(field, 0)} + {drawn_count} = {actual_value}")
                        else:
                            print(f"  ✗ {field} not correctly updated: expected {expected_value}, got {actual_value}")
                            all_correct = False
                    
                    if all_correct and drawn_high_rarity_cards:
                        print("\n✅ All high-rarity card counts were correctly updated!")
                    elif not drawn_high_rarity_cards:
                        print("\n✅ No high-rarity cards were drawn, so no updates were expected.")
                    else:
                        print("\n❌ Some high-rarity card counts were not correctly updated.")
                else:
                    if drawn_high_rarity_cards:
                        print("❌ No high-rarity card counts found in updated user document, but high-rarity cards were drawn!")
                    else:
                        print("No high-rarity card counts found in updated user document (as expected, since no high-rarity cards were drawn)")
            else:
                print(f"Error getting updated user data: {user_response.status_code}")
                print(user_response.text)
            
            return {
                "initial_counts": initial_high_rarity_fields,
                "drawn_cards": drawn_high_rarity_cards,
                "updated_counts": updated_high_rarity_fields if 'updated_high_rarity_fields' in locals() else {}
            }
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    asyncio.run(test_high_rarity_cards())