import asyncio
import httpx
import sys
import json

async def test_top_level():
    """
    Test the top_level endpoint.

    This script:
    1. Calls the top_level endpoint
    2. Prints the response

    Usage:
        python test_top_level.py [<limit>]
    """
    # Get the limit from command line arguments if provided
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 100

    # Base URL for the API
    base_url = "http://localhost:8082/users/api/v1"

    # Endpoint URL
    url = f"{base_url}/rank/top_level?limit={limit}"

    print(f"Testing top_level endpoint with limit {limit}...")
    print(f"URL: {url}")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url)

            if response.status_code == 200:
                result = response.json()
                print("Success!")
                print(f"Number of users returned: {len(result)}")

                # Print the first 10 users
                print("\nTop 10 users:")
                for i, user_entry in enumerate(result[:10], 1):
                    user_id = user_entry.get('user_id', 'Unknown')
                    total_drawn = user_entry.get('total_drawn', 0)
                    level = user_entry.get('level', 1)
                    display_name = user_entry.get('display_name', 'Unknown')
                    avatar = user_entry.get('avatar', 'None')
                    print(f"{i}. User ID: {user_id}")
                    print(f"   Display Name: {display_name}")
                    print(f"   Level: {level}")
                    print(f"   Total Drawn: {total_drawn}")
                    print(f"   Avatar: {avatar}")
                    print("")

                return result
            else:
                print(f"Error: {response.status_code}")
                print(response.text)
                return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    asyncio.run(test_top_level())
