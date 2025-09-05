#!/usr/bin/env bash
set -euo pipefail

CSV_FILE="collaboration.csv"
line_count=0

echo "Starting debug of CSV reading..."
while IFS= read -r line || [[ -n "$line" ]]; do
  ((line_count++))
  echo "Line $line_count: '$line'"
  
  # Remove carriage returns and trim the line
  clean_line=$(echo "$line" | tr -d '\r' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
  echo "  Cleaned: '$clean_line'"
  
  # Skip empty lines
  if [[ -z "$clean_line" ]]; then
    echo "  -> Skipping empty line"
    continue
  fi
  
  # Parse CSV line
  if [[ "$clean_line" == *","* ]]; then
    name="${clean_line%%,*}"
    email="${clean_line#*,}"
  else
    name="$clean_line"
    email=""
  fi
  
  echo "  Name: '$name', Email: '$email'"
  
  if [[ "$line_count" -gt 5 ]]; then
    echo "Stopping after 5 lines for debug..."
    break
  fi
  
done < "$CSV_FILE"

echo "Total lines processed: $line_count"
