#!/bin/bash
# Deployment script for backend and user-backend services

# Set the project ID
PROJECT_ID="seventh-program-433718-h8"
REGION="us-central1"

# Step 1: Enable required APIs
echo "Enabling required APIs..."
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Step 2: Create secrets for both services
echo "Creating secrets for backend..."
kubectl apply -f backend/secrets.yaml

echo "Creating secrets for user-backend..."
kubectl apply -f user_backend/secrets.yaml

# Step 3: Deploy backend service
echo "Deploying backend service..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/backend ./backend
gcloud run services replace backend/service.yaml --region=$REGION

# Step 4: Get the backend URL
BACKEND_URL=$(gcloud run services describe backend --platform managed --region=$REGION --format="value(status.url)")
echo "Backend deployed at: $BACKEND_URL"

# Step 5: Update the user-backend service.yaml with the actual backend URL
sed -i "s|https://backend-\[hash\].run.app|$BACKEND_URL|g" user_backend/service.yaml

# Step 6: Deploy user-backend service
echo "Deploying user-backend service..."
gcloud builds submit --tag gcr.io/$PROJECT_ID/user-backend ./user_backend
gcloud run services replace user_backend/service.yaml --region=$REGION

# Step 7: Get the user-backend URL
USER_BACKEND_URL=$(gcloud run services describe user-backend --platform managed --region=$REGION --format="value(status.url)")
echo "User backend deployed at: $USER_BACKEND_URL"

echo "Deployment complete!"
