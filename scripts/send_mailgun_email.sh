#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   # Single recipient mode
#   MAILGUN_API=... ./scripts/send_mailgun_email.sh \
#     --to "recipient@example.com" \
#     [--from "Zapull Announcements \u003cannounce@mg.zapull.fun\u003e"] \
#     [--subject "Zapull Beta launching on 08/18 at 4 PM ET"] \
#     [--html-path "scripts/email_coin_drop_discord.html"]
#
#   # Broadcast mode (pull all recipients from Firestore collection 'emails')
#   MAILGUN_API=... ./scripts/send_mailgun_email.sh \
#     --from-firestore \
#     [--from "Zapull Announcements \u003cannounce@mg.zapull.fun\u003e"] \
#     [--subject "Zapull Beta launching on 08/18 at 4 PM ET"] \
#     [--html-path "scripts/email.html"]
#
# Notes:
# - Reads API key from MAILGUN_API env var (do not echo secrets).
# - Uses mg.zapull.fun domain like in user_backend/service/marketplace_service.py.
# - Requires curl and Python with google-cloud-firestore installed for --from-firestore.

TO=""
USE_FIRESTORE=false
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
    --to)
      TO="$2"; shift 2 ;;
    --from-firestore)
      USE_FIRESTORE=true; shift 1 ;;
    --from)
      FROM_EMAIL="$2"; shift 2 ;;
    --subject)
      SUBJECT="$2"; shift 2 ;;
    --batch-size)
      BATCH_SIZE="$2"; shift 2 ;;
    --sleep-ms)
      SLEEP_MS="$2"; shift 2 ;;
    --html-path)
      HTML_PATH="$2"; shift 2 ;;
    *)
      echo "Unknown argument: $1" 1>&2; exit 1 ;;
  esac
done

if [[ -z "${MAILGUN_API:-}" ]]; then
  echo "ERROR: MAILGUN_API must be set in the environment." 1\u003e\u00262
  exit 1
fi

if [[ ! -f "$HTML_PATH" ]]; then
  echo "ERROR: HTML file not found at $HTML_PATH" 1\u003e\u00262
  exit 1
fi

API_BASE="https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages"

send_one() {
  local recipient="$1"
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
    -F h:X-Campaign="beta-festival-2025")

  echo "Response for $recipient ($http_code):"
  cat "$resp_file" || true
  rm -f "$resp_file"

  if [[ "$http_code" == "200" ]]; then
    echo "OK: $recipient"
    return 0
  else
    echo "FAIL: $recipient"
    return 1
  fi
}

send_batch() {
  # Arguments: newline-delimited recipients on stdin
  # Returns: 0 on success, non-zero on failure
  local recipients=()
  local line
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    recipients+=("$line")
  done

  if [[ ${#recipients[@]} -eq 0 ]]; then
    echo "No recipients in batch"
    return 0
  fi

  local resp_file hdr_file http_code attempt=0
  resp_file=$(mktemp -t mailgun_resp.XXXXXX)
  hdr_file=$(mktemp -t mailgun_hdr.XXXXXX)

  while :; do
    attempt=$((attempt+1))

    # Build curl command with multiple -F to="..."
    # Use an eval-safe array for extra -F args
    local curl_args=(
      -s -D "$hdr_file" -o "$resp_file" -w "%{http_code}" \
      -u "api:${MAILGUN_API}" \
      "$API_BASE" \
      -F from="$FROM_EMAIL" \
      -F subject="$SUBJECT" \
      -F text="Plain-text fallback" \
      -F html=@"$HTML_PATH" \
      -F h:Reply-To="support@zapull.fun" \
      -F h:X-Campaign="beta-festival-2025"
    )

    local r
    for r in "${recipients[@]}"; do
      curl_args+=( -F "to=$r" )
    done

    http_code=$(curl "${curl_args[@]}")

    echo "Batch response (${#recipients[@]} recipients) ($http_code):"
    cat "$resp_file" || true

    if [[ "$http_code" == "200" ]]; then
      rm -f "$resp_file" "$hdr_file"
      return 0
    fi

    # Handle 429: rate limit
    if [[ "$http_code" == "429" ]]; then
      # Try Retry-After header first
      local retry_after
      retry_after=$(awk -F': ' 'BEGIN{IGNORECASE=1} tolower($1)=="retry-after"{print $2}' "$hdr_file" | tr -d '\r')
      if [[ -n "$retry_after" ]]; then
        echo "Hit rate limit. Sleeping for ${retry_after}s per Retry-After header..."
        sleep "$retry_after"
      else
        # Fallback: try to parse timestamp in JSON (not robust), else sleep 60s
        echo "Hit rate limit. Sleeping for 60s (no Retry-After header found)..."
        sleep 60
      fi
    else
      # Other non-200: retry limited times
      if [[ $attempt -lt $MAX_RETRIES ]]; then
        echo "Non-200 ($http_code). Retrying attempt $((attempt+1))/$MAX_RETRIES after 5s..."
        sleep 5
      else
        echo "Batch failed after $attempt attempts with status $http_code"
        rm -f "$resp_file" "$hdr_file"
        return 1
      fi
    fi
  done
}
if [[ "$USE_FIRESTORE" == true ]]; then
  echo "Fetching recipient emails from Firestore collection 'emails'..."
  # Use embedded Python to list unique, valid emails from Firestore
  RECIPIENTS=$(python3 - <<'PY'
from google.cloud import firestore
import re
EMAIL=re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
try:
    db = firestore.Client()
except Exception as e:
    print(f"ERROR: Failed to init Firestore client: {e}")
    raise SystemExit(1)
seen=set()
for doc in db.collection("emails").stream():
    data = doc.to_dict() or {}
    email = (data.get("email") or "").strip()
    if email and EMAIL.match(email) and email not in seen:
        print(email)
        seen.add(email)
PY
  )

  if [[ -z "$RECIPIENTS" ]]; then
    echo "No recipients found in Firestore 'emails' collection."
    exit 0
  fi

  total=0; ok=0; fail=0
  # Convert sleep from milliseconds to seconds
  secs=$(awk "BEGIN{printf \"%.3f\", $SLEEP_MS/1000}")

  # Send emails one by one
  OIFS=$IFS; IFS=$'\n'
  for addr in $RECIPIENTS; do
    IFS=$OIFS
    total=$((total+1))
    echo "Sending email $total to: $addr"
    
    if send_one "$addr"; then
      ok=$((ok+1))
    else
      fail=$((fail+1))
    fi
    
    # Sleep between emails (except for the last one)
    if [[ $total -lt $(echo "$RECIPIENTS" | wc -l) ]]; then
      echo "Sleeping for ${secs} seconds..."
      sleep "$secs"
    fi
    
    IFS=$'\n'
  done
  IFS=$OIFS

  echo "Summary: total=$total ok=$ok fail=$fail (sleep_ms=$SLEEP_MS)"
  if [[ $fail -gt 0 ]]; then exit 1; else exit 0; fi
else
  if [[ -z "$TO" ]]; then
    echo "ERROR: --to is required unless --from-firestore is provided" 1>&2
    exit 1
  fi
  if send_one "$TO"; then exit 0; else exit 1; fi
fi
