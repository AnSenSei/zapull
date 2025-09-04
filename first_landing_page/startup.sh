#!/bin/sh

# Set default values if environment variables are not set
export FIREBASE_API_KEY=${FIREBASE_API_KEY:-""}

# Log environment configuration
echo "Configuring Firebase for project: seventh-program-433718-h8"
if [ -n "$FIREBASE_API_KEY" ]; then
    echo "Firebase API Key: ${FIREBASE_API_KEY:0:10}..." # Show only first 10 chars for security
else
    echo "No Firebase API Key provided - using mock mode"
fi

# Check if running in Cloud Run
if [ ! -z "$K_SERVICE" ]; then
    echo "Running in Cloud Run environment: $K_SERVICE"
else
    echo "Running in local/development environment"
fi

# Substitute environment variables in the HTML template
envsubst '${FIREBASE_API_KEY}' < /usr/share/nginx/html/index.html.template > /usr/share/nginx/html/index.html

# Verify the substitution worked
if [ -f /usr/share/nginx/html/index.html ]; then
    echo "Successfully created index.html with environment variables"
else
    echo "Failed to create index.html"
    exit 1
fi

# Start nginx
exec nginx -g "daemon off;"