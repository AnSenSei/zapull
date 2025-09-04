#!/bin/bash

# Deploy the weekly rewards processing cloud function

# Set variables
PROJECT_ID="zapull-production"
REGION="us-central1"
FUNCTION_NAME="process-weekly-rewards"
RUNTIME="python311"
ENTRY_POINT="process_weekly_rewards"
MEMORY="512MB"
TIMEOUT="300s"

# Environment variables
ADMIN_TOKEN="your-admin-token-here"  # Change this to a secure token

echo "Deploying weekly rewards processing function..."

# Deploy the main function
gcloud functions deploy $FUNCTION_NAME \
  --gen2 \
  --runtime=$RUNTIME \
  --region=$REGION \
  --source=. \
  --entry-point=$ENTRY_POINT \
  --trigger-http \
  --allow-unauthenticated \
  --memory=$MEMORY \
  --timeout=$TIMEOUT \
  --set-env-vars ADMIN_TOKEN=$ADMIN_TOKEN

echo "Function deployed successfully!"

# Create Cloud Scheduler job to run every Sunday at 23:59
echo "Creating Cloud Scheduler job..."

gcloud scheduler jobs create http weekly-rewards-job \
  --location=$REGION \
  --schedule="59 23 * * 0" \
  --time-zone="America/New_York" \
  --uri="https://$REGION-$PROJECT_ID.cloudfunctions.net/$FUNCTION_NAME" \
  --http-method=POST \
  --headers="X-CloudScheduler=true" \
  --attempt-deadline="540s"

echo "Cloud Scheduler job created!"

# Deploy the status check function
echo "Deploying status check function..."

gcloud functions deploy check-weekly-reward-status \
  --gen2 \
  --runtime=$RUNTIME \
  --region=$REGION \
  --source=. \
  --entry-point=check_weekly_reward_status \
  --trigger-http \
  --allow-unauthenticated \
  --memory="256MB" \
  --timeout="60s"

echo "Status check function deployed!"

echo "Deployment complete!"
echo ""
echo "To test the function manually, run:"
echo "curl -X POST https://$REGION-$PROJECT_ID.cloudfunctions.net/$FUNCTION_NAME \\"
echo "  -H 'Authorization: Bearer $ADMIN_TOKEN' \\"
echo "  -H 'Content-Type: application/json'"
echo ""
echo "To check the status of weekly rewards:"
echo "curl https://$REGION-$PROJECT_ID.cloudfunctions.net/check-weekly-reward-status"