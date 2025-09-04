import asyncio
import httpx
import sys
import json

async def test_draw_cards():
    """
    Test drawing multiple cards and verify that the level is updated and high-rarity cards are tracked.

    This script:
    1. Takes a user ID, pack ID, and collection ID as command-line arguments
    2. Gets the user document to check initial high-rarity card counts
    3. Calls the draw-multiple-cards endpoint
    4. Prints the response and checks for high-rarity cards
    5. Gets the user document again to verify high-rarity card counts are updated
    6. Calls the calculate-level endpoint to verify the level

    Usage:
        python test_draw_cards.py <user_id> <pack_id> <collection_id> [<count>]
    """
    if len(sys.argv) < 4:
        print("Usage: python test_draw_cards.py <user_id> <pack_id> <collection_id> [<count>]")
        return

    user_id = sys.argv[1]
    pack_id = sys.argv[2]
    collection_id = sys.argv[3]
    count = int(sys.argv[4]) if len(sys.argv) > 4 else 5

    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"

    # Endpoint URL for drawing cards
    draw_url = f"{base_url}/users/{user_id}/draw-multiple-cards?pack_id={pack_id}&collection_id={collection_id}&count={count}"

    print(f"Testing draw-multiple-cards endpoint for user {user_id}...")
    print(f"URL: {draw_url}")

    try:
        async with httpx.AsyncClient() as client:
            # First, get the user document to check initial high-rarity card counts
            user_url = f"{base_url}/users/{user_id}"
            user_response = await client.get(user_url)

            if user_response.status_code == 200:
                user_data = user_response.json()
                print("Initial user information:")
                print(f"User ID: {user_data.get('email', user_id)}")

                # Check for existing high-rarity card counts
                high_rarity_fields = {}
                for field, value in user_data.items():
                    if field.startswith("total_drawn_rarity_") and isinstance(value, int):
                        high_rarity_fields[field] = value

                if high_rarity_fields:
                    print("Initial high-rarity card counts:")
                    for field, value in high_rarity_fields.items():
                        print(f"  {field}: {value}")
                else:
                    print("No high-rarity card counts found in user document")
            else:
                print(f"Error getting user data: {user_response.status_code}")
                print(user_response.text)

            # Get the user's current level
            level_url = f"{base_url}/achievements/users/{user_id}/calculate-level"
            level_response = await client.post(level_url)

            if level_response.status_code == 200:
                level_result = level_response.json()
                print("Initial level information:")
                print(f"User ID: {level_result['user_id']}")
                print(f"Current Level: {level_result['current_level']}")
                print(f"Total Drawn: {level_result['total_drawn']}")
                initial_level = level_result['current_level']
                initial_total_drawn = level_result['total_drawn']
            else:
                print(f"Error getting initial level: {level_response.status_code}")
                print(level_response.text)
                return

            # Draw cards
            draw_response = await client.post(draw_url)

            if draw_response.status_code == 200:
                draw_result = draw_response.json()
                print("\nSuccessfully drew cards!")
                print(f"Number of cards drawn: {len(draw_result)}")

                # Print some information about the first card
                if draw_result:
                    first_card = draw_result[0]
                    print(f"First card: {first_card.get('card_name', 'Unknown')} (ID: {first_card.get('id', 'Unknown')})")
                    print(f"Point worth: {first_card.get('point_worth', 0)}")
                    print(f"Rarity: {first_card.get('rarity', 0)}")

                # Check for high-rarity cards (rarity > 4)
                high_rarity_cards = {}
                for card in draw_result:
                    rarity = card.get('rarity', 0)
                    if rarity > 4:
                        rarity_key = f"rarity_{rarity}"
                        high_rarity_cards[rarity_key] = high_rarity_cards.get(rarity_key, 0) + 1

                if high_rarity_cards:
                    print("\nHigh-rarity cards drawn:")
                    for rarity_key, count in high_rarity_cards.items():
                        print(f"  {rarity_key}: {count}")
                else:
                    print("\nNo high-rarity cards (rarity > 4) were drawn")
            else:
                print(f"Error drawing cards: {draw_response.status_code}")
                print(draw_response.text)
                return

            # Get the updated user document to check high-rarity card counts
            user_response = await client.get(user_url)

            if user_response.status_code == 200:
                updated_user_data = user_response.json()
                print("\nUpdated user information:")

                # Check for high-rarity card counts
                updated_high_rarity_fields = {}
                for field, value in updated_user_data.items():
                    if field.startswith("total_drawn_rarity_") and isinstance(value, int):
                        updated_high_rarity_fields[field] = value

                if updated_high_rarity_fields:
                    print("Updated high-rarity card counts:")
                    for field, value in updated_high_rarity_fields.items():
                        initial_value = high_rarity_fields.get(field, 0)
                        if value != initial_value:
                            print(f"  {field}: {initial_value} -> {value} (Increased by {value - initial_value})")
                        else:
                            print(f"  {field}: {value} (Unchanged)")

                    # Check if the counts match the drawn cards
                    for rarity_key, count in high_rarity_cards.items():
                        field_name = f"total_drawn_{rarity_key}"
                        expected_value = high_rarity_fields.get(field_name, 0) + count
                        actual_value = updated_high_rarity_fields.get(field_name, 0)
                        if actual_value == expected_value:
                            print(f"  ✓ {field_name} correctly updated: {high_rarity_fields.get(field_name, 0)} + {count} = {actual_value}")
                        else:
                            print(f"  ✗ {field_name} not correctly updated: expected {expected_value}, got {actual_value}")
                else:
                    print("No high-rarity card counts found in updated user document")
            else:
                print(f"Error getting updated user data: {user_response.status_code}")
                print(user_response.text)

            # Get the updated level
            level_response = await client.post(level_url)

            if level_response.status_code == 200:
                level_result = level_response.json()
                print("\nUpdated level information:")
                print(f"User ID: {level_result['user_id']}")
                print(f"Current Level: {level_result['current_level']}")
                print(f"Total Drawn: {level_result['total_drawn']}")

                # Check if level or total_drawn changed
                if level_result['current_level'] != initial_level:
                    print(f"Level changed from {initial_level} to {level_result['current_level']}")
                else:
                    print("Level remained the same")

                if level_result['total_drawn'] != initial_total_drawn:
                    print(f"Total drawn changed from {initial_total_drawn} to {level_result['total_drawn']}")
                    print(f"Difference: {level_result['total_drawn'] - initial_total_drawn}")
                else:
                    print("Total drawn remained the same")

                return level_result
            else:
                print(f"Error getting updated level: {level_response.status_code}")
                print(level_response.text)
                return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    asyncio.run(test_draw_cards())
