import functions_framework
import logging
from google.cloud import firestore
from flask import Request, jsonify
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)

# Initialize Firestore client
db = firestore.Client()

@functions_framework.http
def check_achievements(request: Request):
    """
    HTTP-triggered Cloud Function.
    Expects:
    - Authorization header with Bearer token
    - JSON body:
      {
        "types": {
          "<achievement_type1>": true,
          "<achievement_type2>": true,
          ...
        }
      }
    Only achievements whose condition.type is in `types` with a value of true
    will be considered. Called after draw_multiple_card to check/grant those specified achievements.
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
        # Extract and verify the Firebase ID token from Authorization header
        auth_header = request.headers.get('Authorization')
        if not auth_header or not auth_header.startswith('Bearer '):
            logging.error("Missing or invalid Authorization header")
            return jsonify({"error": "Authorization header with Bearer token required"}), 401, headers
        
        id_token = auth_header.split('Bearer ')[1]
        
        try:
            # Import firebase_admin here to avoid initialization issues
            import firebase_admin
            from firebase_admin import auth as firebase_auth
            
            # Initialize Firebase Admin SDK if not already initialized
            if not firebase_admin._apps:
                # In Google Cloud Functions, use default credentials
                firebase_admin.initialize_app()
                logging.info("Initialized Firebase Admin SDK")
            
            # Verify the ID token
            try:
                decoded_token = firebase_auth.verify_id_token(id_token)
                user_id = decoded_token['uid']
                logging.info(f"Verified token for user_id: {user_id}")
            except firebase_auth.InvalidIdTokenError as e:
                logging.error(f"Invalid ID token: {e}")
                return jsonify({"error": "Invalid ID token"}), 401, headers
            except firebase_auth.ExpiredIdTokenError as e:
                logging.error(f"Expired ID token: {e}")
                return jsonify({"error": "Token has expired"}), 401, headers
            except firebase_auth.RevokedIdTokenError as e:
                logging.error(f"Revoked ID token: {e}")
                return jsonify({"error": "Token has been revoked"}), 401, headers
            except ValueError as e:
                logging.error(f"Firebase configuration error: {e}")
                return jsonify({"error": "Authentication service is misconfigured"}), 503, headers
        except ImportError as e:
            logging.error(f"Failed to import firebase_admin: {e}")
            return jsonify({"error": "Authentication service not available"}), 503, headers
        except Exception as e:
            logging.error(f"Unexpected error during token verification: {e}", exc_info=True)
            return jsonify({"error": "Authentication error"}), 401, headers
        
        request_json = request.get_json(silent=True)
        if request_json is None:
            logging.error("Request missing JSON body")
            return jsonify({"error": "Request body must be JSON"}), 400, headers

        # Parse the `types` map from the request
        types_map = request_json.get("types")
        if not isinstance(types_map, dict):
            logging.error("Request missing or invalid 'types' map")
            return jsonify({"error": "Request body must include a 'types' map"}), 400, headers

        # Build a list of type strings to filter on
        desired_types = [atype for atype, enabled in types_map.items() if enabled]
        if not desired_types:
            logging.info("No achievement types set to true in 'types' map → nothing to check.")
            return jsonify({
                "message": "No achievement types requested, so no checks performed.",
                "awarded": []
            }), 200, headers

        logging.info(f"Will filter global achievements by types: {desired_types}")

        # 1. Fetch user document
        user_ref = db.collection("users").document(user_id)
        user_snap = user_ref.get()
        if not user_snap.exists:
            logging.error(f"User not found: {user_id}")
            return jsonify({"error": f"User {user_id} does not exist"}), 404, headers

        user_data = user_snap.to_dict()
        logging.info(f"Fetched user_data for '{user_id}': {user_data}")

        user_level = user_data.get("level", 0)
        user_buy_deal = user_data.get("buy_deal", 0)
        user_sell_deal = user_data.get("sell_deal", 0)
        user_total_fusion = user_data.get("totalFusion", 0)
        logging.info(f"User '{user_id}' stats - level: {user_level}, buy_deal: {user_buy_deal}, sell_deal: {user_sell_deal}, totalFusion: {user_total_fusion}")

        # 2. Read existing achievements in user's subcollection
        user_achievements_ref = user_ref.collection("achievements")
        existing_ach_ids = set(doc.id for doc in user_achievements_ref.list_documents())
        logging.info(f"User '{user_id}' already has achievement IDs: {existing_ach_ids}")

        # 3. Query global achievements WHERE condition.type IN desired_types
        achievements_ref = db.collection("achievements")
        # Firestore 'in' query on nested field 'condition.type'
        ach_query = achievements_ref.where("condition.type", "in", desired_types)
        matching_ach_snapshots = ach_query.stream()

        new_achievements = []
        total_new_points = 0

        # 4. Loop over each matching global achievement
        for ach_snap in matching_ach_snapshots:
            ach_id = ach_snap.id
            ach_data = ach_snap.to_dict()
            logging.info(f"Checking global achievement '{ach_id}': {ach_data}")

            if ach_id in existing_ach_ids:
                logging.info(f"  - Skipping '{ach_id}' because user already has it.")
                continue

            condition = ach_data.get("condition", {})
            ach_type = condition.get("type")
            reward_list = ach_data.get("reward", [])

            # Check level_reached type
            if ach_type == "level_reached":
                target_level = condition.get("target", 0)
                logging.info(f"  - Achievement '{ach_id}' is 'level_reached' (target={target_level}).")
                if user_level >= target_level:
                    logging.info(f"    → User qualifies for '{ach_id}' (level_reached).")
                    new_achievements.append({"achievement_id": ach_id, "data": ach_data})
                else:
                    logging.info(f"    → User level {user_level} < target {target_level}, not qualified.")

            # Check draw_by_rarity type (now using point_worth thresholds)
            elif ach_type == "draw_by_rarity":
                point_worth = condition.get("point_worth")
                target_count = condition.get("target", 0)
                
                if point_worth:
                    # New logic using point_worth thresholds
                    user_drawn = user_data.get(f"total_drawn_{point_worth}", 0)
                    logging.info(f"  - Achievement '{ach_id}' is 'draw_by_rarity' (point_worth={point_worth}, target={target_count}).")
                    logging.info(f"    User has total_drawn_{point_worth}: {user_drawn}")
                    if user_drawn >= target_count:
                        logging.info(f"    → User qualifies for '{ach_id}' (draw_by_rarity with point_worth).")
                        new_achievements.append({"achievement_id": ach_id, "data": ach_data})
                    else:
                        logging.info(f"    → User drawn {user_drawn} < target {target_count}, not qualified.")
                else:
                    # Backward compatibility for old rarity-based achievements
                    rarity = condition.get("rarity")
                    if rarity:
                        user_drawn = user_data.get(f"total_drawn_rarity_{rarity}", 0)
                        logging.info(f"  - Achievement '{ach_id}' is 'draw_by_rarity' (rarity={rarity}, target={target_count}) - using legacy logic.")
                        logging.info(f"    User has total_drawn_rarity_{rarity}: {user_drawn}")
                        if user_drawn >= target_count:
                            logging.info(f"    → User qualifies for '{ach_id}' (draw_by_rarity legacy).")
                            new_achievements.append({"achievement_id": ach_id, "data": ach_data})
                        else:
                            logging.info(f"    → User drawn {user_drawn} < target {target_count}, not qualified.")
                    else:
                        logging.info(f"  - Achievement '{ach_id}' has 'draw_by_rarity' type but missing both point_worth and rarity fields, skipping.")

            # Check buy_deal_reached type
            elif ach_type == "buy_deal_reached":
                target_buy_deal = condition.get("target", 0)
                logging.info(f"  - Achievement '{ach_id}' is 'buy_deal_reached' (target={target_buy_deal}).")
                if user_buy_deal >= target_buy_deal:
                    logging.info(f"    → User qualifies for '{ach_id}' (buy_deal_reached).")
                    new_achievements.append({"achievement_id": ach_id, "data": ach_data})
                else:
                    logging.info(f"    → User buy_deal {user_buy_deal} < target {target_buy_deal}, not qualified.")

            # Check sell_deal_reached type
            elif ach_type == "sell_deal_reached":
                target_sell_deal = condition.get("target", 0)
                logging.info(f"  - Achievement '{ach_id}' is 'sell_deal_reached' (target={target_sell_deal}).")
                if user_sell_deal >= target_sell_deal:
                    logging.info(f"    → User qualifies for '{ach_id}' (sell_deal_reached).")
                    new_achievements.append({"achievement_id": ach_id, "data": ach_data})
                else:
                    logging.info(f"    → User sell_deal {user_sell_deal} < target {target_sell_deal}, not qualified.")

            # Check fusion_reached type
            elif ach_type == "fusion_reached":
                target_fusion = condition.get("target", 0)
                logging.info(f"  - Achievement '{ach_id}' is 'fusion_reached' (target={target_fusion}).")
                if user_total_fusion >= target_fusion:
                    logging.info(f"    → User qualifies for '{ach_id}' (fusion_reached).")
                    new_achievements.append({"achievement_id": ach_id, "data": ach_data})
                else:
                    logging.info(f"    → User totalFusion {user_total_fusion} < target {target_fusion}, not qualified.")

            else:
                logging.info(f"  - Unexpected condition.type '{ach_type}' for '{ach_id}', skipping.")

        # 5. If no new achievements, return early
        if not new_achievements:
            logging.info(f"No new achievements to grant for user '{user_id}'.")
            return jsonify({"message": "No new achievements to grant", "awarded": []}), 200, headers

        # 6. Batch write new achievements and update points
        batch = db.batch()
        for item in new_achievements:
            ach_id = item["achievement_id"]
            ach_data = item["data"]

            # Accumulate point rewards
            for r in ach_data.get("reward", []):
                if r.get("type") == "point":
                    amount = int(r.get("amount", 0))
                    total_new_points += amount
                    logging.info(f"  - Achievement '{ach_id}' grants {amount} points.")

            # Prepare user subcollection document
            user_ach_doc_ref = user_achievements_ref.document(ach_id)
            record = {
                "name": ach_data.get("name"),
                "description": ach_data.get("description"),
                "type": condition.get("type"),
                "condition": ach_data.get("condition"),
                "reward": ach_data.get("reward"),
                "rank": ach_data.get("rank"),  # Add this
                "rarity": ach_data.get("rarity"),  # Add this
                "emblemId": None,
                "emblemUrl": None,
                "awardedAt": datetime.utcnow()
            }
            # If there's an emblem reward, store its ID and URL
            for r in ach_data.get("reward", []):
                if r.get("type") == "emblem":
                    record["emblemId"] = r.get("emblemId")
                    record["emblemUrl"] = r.get("url")
                    logging.info(f"  - Achievement '{ach_id}' has emblem '{record['emblemId']}' ({record['emblemUrl']}).")
                    break

            batch.set(user_ach_doc_ref, record)
            logging.info(f"  - Queued batch.set for 'users/{user_id}/achievements/{ach_id}'.")

        # 6.3 Update user's pointsBalance if there are any point rewards
        if total_new_points > 0:
            new_balance = user_data.get("pointsBalance", 0) + total_new_points
            batch.update(user_ref, {"pointsBalance": new_balance})
            logging.info(f"  - Queued batch.update to set pointsBalance = {new_balance} for user '{user_id}'.")

        # 7. Commit the batch
        batch.commit()
        logging.info(f"Committed batch writes for user '{user_id}' with total_new_points = {total_new_points}.")

        # 8. Build and return response
        awarded_summary = []
        for item in new_achievements:
            ach_id = item["achievement_id"]
            ach_data = item["data"]
            
            # Build reward array with complete information
            rewards = []
            for r in ach_data.get("reward", []):
                reward_item = {
                    "type": r.get("type")
                }
                if r.get("type") == "point":
                    reward_item["amount"] = r.get("amount", 0)
                elif r.get("type") == "emblem":
                    reward_item["emblemId"] = r.get("emblemId")
                    reward_item["url"] = r.get("url")
                rewards.append(reward_item)
            
            summary_item = {
                "id": ach_id,
                "name": ach_data.get("name"),
                "description": ach_data.get("description"),
                "reward": rewards,
                "rarity": ach_data.get("rarity"),
                "rank": ach_data.get("rank")
            }
            
            # Add condition information for context
            condition = ach_data.get("condition", {})
            summary_item["condition"] = {
                "type": condition.get("type"),
                "target": condition.get("target")
            }
            if condition.get("point_worth"):
                summary_item["condition"]["point_worth"] = condition.get("point_worth")
            
            awarded_summary.append(summary_item)

        logging.info(f"Returning awarded summary for user '{user_id}': {awarded_summary}")
        return jsonify({
            "message": "New achievements granted",
            "awarded": awarded_summary,
            "addedPoints": total_new_points
        }), 200, headers

    except Exception as e:
        logging.exception(f"Internal error while checking achievements: {e}")
        return jsonify({"error": f"Internal error: {e}"}), 500, headers