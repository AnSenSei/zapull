import asyncio
import httpx
import sys
import json

async def test_calculate_level():
    """
    Test the calculate-level endpoint.

    This script:
    1. Takes a user ID as a command-line argument
    2. Calls the calculate-level endpoint
    3. Prints the response

    Usage:
        python test_achievements.py calculate-level <user_id>
    """
    if len(sys.argv) < 3:
        print("Usage: python test_achievements.py calculate-level <user_id>")
        return

    user_id = sys.argv[2]

    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"

    # Endpoint URL
    url = f"{base_url}/achievements/users/{user_id}/calculate-level"

    print(f"Testing calculate-level endpoint for user {user_id}...")
    print(f"URL: {url}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url)

            if response.status_code == 200:
                result = response.json()
                print("Success!")
                print(f"User ID: {result['user_id']}")
                print(f"Previous Level: {result['previous_level']}")
                print(f"Current Level: {result['current_level']}")
                print(f"Total Drawn: {result['total_drawn']}")

                # Check if level was updated
                if result['previous_level'] != result['current_level']:
                    print(f"Level updated from {result['previous_level']} to {result['current_level']}")
                else:
                    print("Level remained the same")

                return result
            else:
                print(f"Error: {response.status_code}")
                print(response.text)
                return None
    except Exception as e:
        print(f"Error: {e}")
        return None

async def test_get_user_achievements():
    """
    Test the get user achievements endpoint.

    This script:
    1. Takes a user ID as a command-line argument
    2. Calls the get user achievements endpoint
    3. Prints the response

    Usage:
        python test_achievements.py user-achievements <user_id> [page] [per_page] [sort_by] [sort_order]
    """
    if len(sys.argv) < 3:
        print("Usage: python test_achievements.py user-achievements <user_id> [page] [per_page] [sort_by] [sort_order]")
        return

    user_id = sys.argv[2]
    page = sys.argv[3] if len(sys.argv) > 3 else 1
    per_page = sys.argv[4] if len(sys.argv) > 4 else 10
    sort_by = sys.argv[5] if len(sys.argv) > 5 else "updated_at"
    sort_order = sys.argv[6] if len(sys.argv) > 6 else "desc"

    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"

    # Endpoint URL with query parameters
    url = f"{base_url}/users/{user_id}/achievements?page={page}&per_page={per_page}&sort_by={sort_by}&sort_order={sort_order}"

    print(f"Testing get user achievements endpoint for user {user_id}...")
    print(f"URL: {url}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)

            if response.status_code == 200:
                result = response.json()
                print("Success!")
                print(f"Total achievements: {result['pagination']['total_items']}")
                print(f"Page {result['pagination']['current_page']} of {result['pagination']['total_pages']}")
                print(f"Items per page: {result['pagination']['items_per_page']}")

                # Print achievements
                print("\nAchievements:")
                for i, achievement in enumerate(result['achievements']):
                    print(f"{i+1}. Achievement ID: {achievement['achievement_id']}")
                    print(f"   Acquired: {achievement['acquired']}")
                    print(f"   Progress: {achievement['progress']}")
                    if achievement['acquired_at']:
                        print(f"   Acquired at: {achievement['acquired_at']}")
                    print()

                return result
            else:
                print(f"Error: {response.status_code}")
                print(response.text)
                return None
    except Exception as e:
        print(f"Error: {e}")
        return None

async def test_get_all_achievements():
    """
    Test the get all achievements endpoint.

    This script:
    1. Optionally takes a user ID as a command-line argument
    2. Calls the get all achievements endpoint
    3. Prints the response

    Usage:
        python test_achievements.py all-achievements [user_id] [page] [per_page] [sort_by] [sort_order]
    """
    user_id = sys.argv[2] if len(sys.argv) > 2 else None
    page = sys.argv[3] if len(sys.argv) > 3 else 1
    per_page = sys.argv[4] if len(sys.argv) > 4 else 10
    sort_by = sys.argv[5] if len(sys.argv) > 5 else "created_at"
    sort_order = sys.argv[6] if len(sys.argv) > 6 else "desc"

    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"

    # Endpoint URL with query parameters
    url = f"{base_url}/achievements?page={page}&per_page={per_page}&sort_by={sort_by}&sort_order={sort_order}"
    if user_id:
        url += f"&user_id={user_id}"

    print(f"Testing get all achievements endpoint...")
    if user_id:
        print(f"Including progress for user: {user_id}")
    print(f"URL: {url}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)

            if response.status_code == 200:
                result = response.json()
                print("Success!")
                print(f"Total achievements: {result['pagination']['total_items']}")
                print(f"Page {result['pagination']['current_page']} of {result['pagination']['total_pages']}")
                print(f"Items per page: {result['pagination']['items_per_page']}")

                # Print achievements
                print("\nAchievements:")
                for i, achievement in enumerate(result['achievements']):
                    print(f"{i+1}. {achievement['name']}")
                    print(f"   ID: {achievement['id']}")
                    print(f"   Description: {achievement['description']}")
                    if user_id:
                        print(f"   Acquired: {achievement['acquired']}")
                        print(f"   Progress: {achievement['progress']}")
                        if achievement['acquired_at']:
                            print(f"   Acquired at: {achievement['acquired_at']}")
                    print()

                return result
            else:
                print(f"Error: {response.status_code}")
                print(response.text)
                return None
    except Exception as e:
        print(f"Error: {e}")
        return None

async def test_get_user_achievement_by_id():
    """
    Test the get user achievement by ID endpoint.

    This script:
    1. Takes a user ID and achievement ID as command-line arguments
    2. Calls the get user achievement by ID endpoint
    3. Prints the response

    Usage:
        python test_achievements.py user-achievement <user_id> <achievement_id>
    """
    if len(sys.argv) < 4:
        print("Usage: python test_achievements.py user-achievement <user_id> <achievement_id>")
        return

    user_id = sys.argv[2]
    achievement_id = sys.argv[3]

    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"

    # Endpoint URL
    url = f"{base_url}/users/{user_id}/achievements/{achievement_id}"

    print(f"Testing get user achievement by ID endpoint for user {user_id} and achievement {achievement_id}...")
    print(f"URL: {url}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)

            if response.status_code == 200:
                result = response.json()
                print("Success!")
                print(f"Achievement ID: {result['id']}")
                print(f"Name: {result['name']}")
                print(f"Description: {result['description']}")
                print(f"Acquired: {result['acquired']}")
                print(f"Progress: {result['progress']}")
                if result['acquired_at']:
                    print(f"Acquired at: {result['acquired_at']}")
                if result['image_url']:
                    print(f"Image URL: {result['image_url']}")
                if result['criteria']:
                    print(f"Criteria: {result['criteria']}")

                return result
            else:
                print(f"Error: {response.status_code}")
                print(response.text)
                return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_achievements.py <command> [args]")
        print("Commands:")
        print("  calculate-level <user_id>")
        print("  user-achievements <user_id> [page] [per_page] [sort_by] [sort_order]")
        print("  all-achievements [user_id] [page] [per_page] [sort_by] [sort_order]")
        print("  user-achievement <user_id> <achievement_id>")
        sys.exit(1)

    command = sys.argv[1]

    if command == "calculate-level":
        asyncio.run(test_calculate_level())
    elif command == "user-achievements":
        asyncio.run(test_get_user_achievements())
    elif command == "all-achievements":
        asyncio.run(test_get_all_achievements())
    elif command == "user-achievement":
        asyncio.run(test_get_user_achievement_by_id())
    else:
        print(f"Unknown command: {command}")
        print("Available commands: calculate-level, user-achievements, all-achievements, user-achievement")
