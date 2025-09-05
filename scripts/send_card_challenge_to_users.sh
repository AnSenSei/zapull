#!/usr/bin/env bash
set -euo pipefail

# Script to send card challenge emails to all users in the 'users' collection
# Usage:
#   MAILGUN_API=... ./scripts/send_card_challenge_to_users.sh
#
# Notes:
# - Reads API key from MAILGUN_API env var (do not echo secrets).
# - Uses mg.zapull.fun domain like in user_backend/service/marketplace_service.py.
# - Fetches user emails from Firestore 'users' collection.
# - Requires curl and Python with google-cloud-firestore installed.

MAILGUN_DOMAIN="${MAILGUN_DOMAIN:-mg.zapull.fun}"
FROM_EMAIL=${FROM_EMAIL:-"Zapull Support <support@mg.zapull.fun>"}
SUBJECT=${SUBJECT:-"🎮 Free Card Challenge on Zapull - 50K Points to Start!"}
# Use the card challenge template
HTML_PATH="scripts/email_card_challenge.html"

# Batching and throttling (defaults)
BATCH_SIZE=${BATCH_SIZE:-50}
SLEEP_MS=${SLEEP_MS:-250}
MAX_RETRIES=${MAX_RETRIES:-3}

# Parse args
while [[ $# -gt 0 ]]; do
  case "$1" in
    --from)
      FROM_EMAIL="$2"; shift 2 ;;
    --subject)
      SUBJECT="$2"; shift 2 ;;
    --batch-size)
      BATCH_SIZE="$2"; shift 2 ;;
    --sleep-ms)
      SLEEP_MS="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" 1>&2; exit 1 ;;
  esac
done

if [[ -z "${MAILGUN_API:-}" ]]; then
  echo "ERROR: MAILGUN_API must be set in the environment." 1>&2
  exit 1
fi

if [[ ! -f "$HTML_PATH" ]]; then
  echo "ERROR: HTML file not found at $HTML_PATH" 1>&2
  exit 1
fi

API_BASE="https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages"

send_one() {
  local recipient="$1"
  local display_name="$2"
  local http_code
  local resp_file
  resp_file=$(mktemp -t mailgun_resp.XXXXXX)
  http_code=$(curl -s -o "$resp_file" -w "%{http_code}" \
    -u "api:${MAILGUN_API}" \
    "$API_BASE" \
    -F from="$FROM_EMAIL" \
    -F to="$recipient" \
    -F subject="$SUBJECT" \
    -F text="Plain-text fallback" \
    -F html=@"$HTML_PATH" \
    -F h:Reply-To="support@zapull.fun" \
    -F h:X-Campaign="card-challenge-2025")

  echo "Response for $recipient ($display_name) ($http_code):"
  cat "$resp_file" || true
  rm -f "$resp_file"

  if [[ "$http_code" == "200" ]]; then
    echo "OK: $recipient ($display_name)"
    return 0
  else
    echo "FAIL: $recipient ($display_name)"
    return 1
  fi
}

echo "Fetching user emails from Firestore collection 'users'..."
# Use embedded Python to list unique, valid emails from Firestore users collection
USER_DATA=$(python3 - <<'PY'
from google.cloud import firestore
import re
import json
EMAIL=re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
try:
    db = firestore.Client()
except Exception as e:
    print(f"ERROR: Failed to init Firestore client: {e}")
    raise SystemExit(1)

seen=set()
users=[]
for doc in db.collection("users").stream():
    data = doc.to_dict() or {}
    email = (data.get("email") or "").strip()
    display_name = (data.get("displayName") or "").strip()
    
    if email and EMAIL.match(email) and email not in seen:
        users.append({
            "email": email,
            "displayName": display_name or "User"
        })
        seen.add(email)

for user in users:
    print(f"{user['email']}|{user['displayName']}")
PY
)

if [[ -z "$USER_DATA" ]]; then
  echo "No users found in Firestore 'addresses' collection."
  exit 0
fi

total=0; ok=0; fail=0
# Convert sleep from milliseconds to seconds
secs=$(awk "BEGIN{printf \"%.3f\", $SLEEP_MS/1000}")

# Send emails one by one
OIFS=$IFS; IFS=$'\n'
for user_line in $USER_DATA; do
  IFS=$OIFS
  
  # Split email and display name
  email=$(echo "$user_line" | cut -d'|' -f1)
  display_name=$(echo "$user_line" | cut -d'|' -f2)
  
  total=$((total+1))
  echo "Sending email $total to: $email ($display_name)"
  
  if send_one "$email" "$display_name"; then
    ok=$((ok+1))
  else
    fail=$((fail+1))
  fi
  
  # Sleep between emails (except for the last one)
  if [[ $total -lt $(echo "$USER_DATA" | wc -l) ]]; then
    echo "Sleeping for ${secs} seconds..."
    sleep "$secs"
  fi
  
  IFS=$'\n'
done
IFS=$OIFS

echo "Summary: total=$total ok=$ok fail=$fail (sleep_ms=$SLEEP_MS)"
if [[ $fail -gt 0 ]]; then exit 1; else exit 0; fi
