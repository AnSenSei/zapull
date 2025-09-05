#!/usr/bin/env bash
set -euo pipefail

# Script to send the Zapull collaboration email to all contacts in collaboration.csv
# Based on the existing send_mailgun_email.sh script but configured for the collaboration template
#
# Usage:
#   MAILGUN_API=... ./scripts/send_zapull_collaboration_email.sh

# Configuration
CSV_FILE="collaboration.csv"
MAILGUN_DOMAIN="${MAILGUN_DOMAIN:-mg.zapull.fun}"
FROM_EMAIL=${FROM_EMAIL:-"Zapull Team <support@mg.zapull.fun>"}
SUBJECT=${SUBJECT:-"🚀 Zapull Collaboration Opportunity"}
# Use the collaboration template
HTML_PATH="Copy of (2) New Template.html"

# Check if MAILGUN_API is set
if [[ -z "${MAILGUN_API:-}" ]]; then
  echo "ERROR: MAILGUN_API must be set in the environment." >&2
  echo "Usage: MAILGUN_API=your_api_key ./scripts/send_zapull_collaboration_email.sh" >&2
  exit 1
fi

# Check if CSV file exists
if [[ ! -f "$CSV_FILE" ]]; then
  echo "ERROR: CSV file not found at $CSV_FILE" >&2
  exit 1
fi

# Check if HTML file exists
if [[ ! -f "$HTML_PATH" ]]; then
  echo "ERROR: HTML file not found at $HTML_PATH" >&2
  exit 1
fi

API_BASE="https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages"

send_collaboration_email() {
  local recipient="$1"
  local http_code
  local resp_file
  resp_file=$(mktemp -t mailgun_resp.XXXXXX)
  
  echo "Sending Zapull collaboration email to: $recipient"
  
  http_code=$(curl -s -o "$resp_file" -w "%{http_code}" \
    -u "api:${MAILGUN_API}" \
    "$API_BASE" \
    -F from="$FROM_EMAIL" \
    -F to="$recipient" \
    -F subject="$SUBJECT" \
    -F text="Hello, I hope this message finds you well. I am reaching out on behalf of Zapull, a new online card-pulling platform, and we would love to explore a potential collaboration with you. What we provide: - Custom mystery packs for you to include in your shipments. Each pack contains: - A Zapull gift card (redeemable for points on our platform) - A custom affiliate code created specifically for you - Two Pokémon cards to add a fun, collectible element. Affiliate benefits: - 10% commission on every order placed with your affiliate code - Option to receive rewards in Zapull Points or direct cash payouts - Opportunity to negotiate higher rates as the partnership grows. Your role would simply be to place one mystery pack into each outgoing shipment. We see this as an opportunity to delight your customers with a unique surprise while also creating an additional revenue stream for your business. Please let us know if this opportunity is of interest to you. If you are interested, please reply to contact@zapull.fun. We look forward to the possibility of working together. Sincerely, Zapull Team" \
    -F html=@"$HTML_PATH" \
    -F h:Reply-To="contact@zapull.fun" \
    -F h:X-Campaign="collaboration-outreach-2025")

  echo "Response for $recipient (HTTP $http_code):"
  cat "$resp_file" || true
  rm -f "$resp_file"

  if [[ "$http_code" == "200" ]]; then
    echo "✅ SUCCESS: Email sent successfully to $recipient"
    return 0
  else
    echo "❌ FAILED: Failed to send email to $recipient (HTTP $http_code)"
    return 1
  fi
}

# Read contacts from CSV and send emails
echo "📧 Starting collaboration email campaign..."
echo "Reading contacts from: $CSV_FILE"
echo ""

# Initialize counters
total_contacts=0
sent_count=0
failed_count=0
skipped_count=0

# Read CSV file line by line with better error handling
# First, let's convert the file to handle CRLF issues
tmp_csv=$(mktemp)
tr -d '\r' < "$CSV_FILE" > "$tmp_csv"

echo "🔍 Processing $(wc -l < "$tmp_csv") lines from CSV file..."

line_number=0
while IFS= read -r line; do
  line_number=$((line_number + 1))
  
  # Skip empty lines
  if [[ -z "$line" ]]; then
    echo "Skipping empty line $line_number"
    continue
  fi
  
  echo "Processing line $line_number: $line"
  
  # Parse CSV line (simple comma split)
  if [[ "$line" == *","* ]]; then
    name="${line%%,*}"  # Everything before the first comma
    email="${line#*,}"  # Everything after the first comma
  else
    # Handle lines without commas
    name="$line"
    email=""
  fi
  
  # Trim whitespace from both fields
  name=$(echo "$name" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  email=$(echo "$email" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  
  echo "  Parsed -> Name: '$name', Email: '$email'"
  
  # Skip header line
  if [[ "$name" == "name" ]] && [[ "$email" == "email" ]]; then
    echo "📋 Found CSV header, skipping..."
    continue
  fi
  
  # Skip empty or invalid email addresses
  if [[ -z "$email" || "$email" == " " ]]; then
    echo "⚠️  SKIPPED: $name (no email address)"
    skipped_count=$((skipped_count + 1))
    continue
  fi
  
  # Basic email validation
  if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
    echo "⚠️  SKIPPED: $name - invalid email format: $email"
    skipped_count=$((skipped_count + 1))
    continue
  fi
  
  total_contacts=$((total_contacts + 1))
  
  echo "📤 Processing: $name ($email)"
  
  if send_collaboration_email "$email"; then
    sent_count=$((sent_count + 1))
    echo "✅ SUCCESS: Email sent to $name ($email)"
  else
    failed_count=$((failed_count + 1))
    echo "❌ FAILED: Could not send email to $name ($email)"
  fi
  
  echo "" # Add spacing between contacts
  
  # Add a small delay to avoid rate limiting
  sleep 1
  
done < "$tmp_csv"

# Clean up temporary file
rm -f "$tmp_csv"

# Final summary
echo "📊 CAMPAIGN SUMMARY:"
echo "==================="
echo "Total contacts processed: $total_contacts"
echo "Emails sent successfully: $sent_count"
echo "Failed to send: $failed_count"
echo "Skipped (no/invalid email): $skipped_count"
echo ""

if [[ $sent_count -gt 0 ]]; then
  echo "🎉 Campaign completed! Successfully sent $sent_count collaboration emails."
  exit 0
else
  echo "💥 Campaign failed! No emails were sent successfully."
  exit 1
fi
