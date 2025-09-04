#!/usr/bin/env python
"""
Example script demonstrating how to correctly format condition and reward JSON for achievement form submission.

This script provides examples of how to create valid JSON strings for the achievement form fields,
showing proper formatting for both simple cases and complex scenarios.

Usage:
    Run this script to see example outputs for different scenarios.
"""

import json
import requests
from typing import List, Dict, Any, Optional

# Example 1: Basic level achievement
def example_basic_level_achievement():
    """
    Example of a basic level achievement with a point reward.
    """
    # Create condition JSON
    condition = {"type": "level", "target": 1}
    condition_json = json.dumps(condition)

    # Create reward JSON
    reward = [{"type": "point", "amount": 100}]
    reward_json = json.dumps(reward)

    print("\nExample 1: Basic Level Achievement")
    print(f"Condition JSON: {condition_json}")
    print(f"Reward JSON: {reward_json}")

    # Example form data that would be submitted
    form_data = {
        "id": "level_1",
        "name": "Level 1 Achievement",
        "description": "Reached level 1",
        "condition": condition_json,
        "reward": reward_json
    }

    print("\nForm data that would be submitted:")
    for key, value in form_data.items():
        print(f"{key}: {value}")

# Example 2: Achievement with both point and emblem rewards
def example_mixed_rewards_achievement():
    """
    Example of an achievement with both point and emblem rewards.
    """
    # Create condition JSON
    condition = {"type": "draw_spend_points", "target": 1000}
    condition_json = json.dumps(condition)

    # Create reward JSON with multiple reward types
    reward = [
        {"type": "point", "amount": 500},
        {"type": "emblem"}
    ]
    reward_json = json.dumps(reward)

    print("\nExample 2: Mixed Rewards Achievement")
    print(f"Condition JSON: {condition_json}")
    print(f"Reward JSON: {reward_json}")

    # Example form data that would be submitted
    form_data = {
        "id": "draw_spent_1000",
        "name": "Points Spender",
        "description": "Spend 1000 points on draws",
        "condition": condition_json,
        "reward": reward_json
        # emblem_file would be included for file upload
    }

    print("\nForm data that would be submitted:")
    for key, value in form_data.items():
        print(f"{key}: {value}")

# Example 3: Using helper functions
def example_using_helper_functions():
    """
    Example using helper functions to create condition and reward JSON.
    """
    # Helper function for condition
    def create_condition_json(condition_type: str, target: int) -> str:
        return json.dumps({"type": condition_type, "target": target})

    # Helper functions for rewards
    def create_point_reward_json(amount: int) -> dict:
        return {"type": "point", "amount": amount}

    def create_emblem_reward_json() -> dict:
        return {"type": "emblem"}

    def create_reward_json(rewards: List[dict]) -> str:
        return json.dumps(rewards)

    # Create condition JSON
    condition_json = create_condition_json("login_days", 30)

    # Create reward JSON
    rewards = [
        create_point_reward_json(1000),
        create_emblem_reward_json()
    ]
    reward_json = create_reward_json(rewards)

    print("\nExample 3: Using Helper Functions")
    print(f"Condition JSON: {condition_json}")
    print(f"Reward JSON: {reward_json}")

# Example 4: Simulation of a form submission
def simulate_form_submission():
    """
    Simulate a form submission to the API (does not actually make request).
    """
    # Create condition and reward JSON
    condition_json = json.dumps({"type": "level", "target": 5})
    reward_json = json.dumps([{"type": "point", "amount": 200}])

    print("\nExample 4: Simulated Form Submission")
    print("API endpoint: POST /achievements/form")
    print("Content-Type: multipart/form-data")
    print("\nForm fields:")
    print(f"id: level_5")
    print(f"name: Level 5 Achievement")
    print(f"description: Reached level 5")
    print(f"condition: {condition_json}")
    print(f"reward: {reward_json}")
    print("emblem_file: [binary file data would be here]")

    # This is how you would make the actual request with requests library
    # (commented out to prevent actual API calls)
    """
    files = {'emblem_file': ('emblem.png', open('emblem.png', 'rb'), 'image/png')}
    data = {
        'id': 'level_5',
        'name': 'Level 5 Achievement',
        'description': 'Reached level 5',
        'condition': condition_json,
        'reward': reward_json
    }
    response = requests.post('https://api.example.com/achievements/form', data=data, files=files)
    """

def main():
    print("=== Achievement Form JSON Examples ===")
    example_basic_level_achievement()
    example_mixed_rewards_achievement()
    example_using_helper_functions()
    simulate_form_submission()
    print("\n=== End of Examples ===")

if __name__ == "__main__":
    main()
