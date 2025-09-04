#!/bin/bash

# Deploy the cleanup_expired_cards cloud function

PROJECT_ID="seventh-program-433718-h8"
REGION="us-central1"
FUNCTION_NAME="cleanup-expired-cards"

echo "Deploying cleanup_expired_cards function..."

# Deploy the HTTP-triggered version (for testing)
gcloud functions deploy ${FUNCTION_NAME}-http \
  --gen2 \
  --runtime=python311 \
  --region=${REGION} \
  --source=. \
  --entry-point=cleanup_expired_cards_http \
  --trigger-http \
  --allow-unauthenticated \
  --memory=256MB \
  --timeout=540s \
  --set-env-vars PROJECT_ID=${PROJECT_ID} \
  --project=${PROJECT_ID}

# Deploy the scheduled version (runs every hour)
gcloud functions deploy ${FUNCTION_NAME}-scheduled \
  --gen2 \
  --runtime=python311 \
  --region=${REGION} \
  --source=. \
  --entry-point=cleanup_expired_cards_scheduled \
  --trigger-topic=cleanup-expired-cards-topic \
  --memory=256MB \
  --timeout=540s \
  --set-env-vars PROJECT_ID=${PROJECT_ID} \
  --project=${PROJECT_ID}

# Create a Cloud Scheduler job to trigger the function every hour
echo "Creating Cloud Scheduler job..."

gcloud scheduler jobs create pubsub cleanup-expired-cards-job \
  --schedule="0 * * * *" \
  --topic=cleanup-expired-cards-topic \
  --message-body='{}' \
  --time-zone="America/New_York" \
  --project=${PROJECT_ID} \
  --location=${REGION} \
  || echo "Scheduler job already exists"

echo "Deployment complete!"
echo "HTTP endpoint for testing: https://${REGION}-${PROJECT_ID}.cloudfunctions.net/${FUNCTION_NAME}-http"