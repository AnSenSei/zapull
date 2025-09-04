#!/bin/bash
# Deployment script for backend and user-backend services to Cloud Run

# Set the project ID and region
PROJECT_ID="seventh-program-433718-h8"
REGION="us-central1"

# Step 1: Deploy backend service
echo "Building backend image..."
gcloud builds submit --tag us-docker.pkg.dev/$PROJECT_ID/backend/backend:latest ./backend

# Update the image in service.yaml
sed -i "s|gcr.io/$PROJECT_ID/backend|us-docker.pkg.dev/$PROJECT_ID/backend/backend:latest|g" backend/service.yaml

echo "Deploying backend service..."
gcloud run services replace backend/service.yaml --region=$REGION

# Step 2: Get the backend URL
BACKEND_URL=$(gcloud run services describe backend --platform managed --region=$REGION --format="value(status.url)")
echo "Backend deployed at: $BACKEND_URL"

# Step 3: Update the user-backend service.yaml with the actual backend URL
sed -i "s|https://backend-\[hash\].run.app|$BACKEND_URL|g" user_backend/service.yaml

# Update the image in user_backend service.yaml
sed -i "s|gcr.io/$PROJECT_ID/user-backend|us-docker.pkg.dev/$PROJECT_ID/backend/user-backend:latest|g" user_backend/service.yaml

# Step 4: Build and deploy user-backend service
echo "Building user-backend image..."
gcloud builds submit --tag us-docker.pkg.dev/$PROJECT_ID/backend/user-backend:latest ./user_backend

echo "Deploying user-backend service..."
gcloud run services replace user_backend/service.yaml --region=$REGION

# Step 5: Get the user-backend URL
USER_BACKEND_URL=$(gcloud run services describe user-backend --platform managed --region=$REGION --format="value(status.url)")
echo "User backend deployed at: $USER_BACKEND_URL"

echo "Deployment complete!"
