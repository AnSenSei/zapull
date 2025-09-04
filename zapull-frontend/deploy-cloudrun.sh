#!/bin/bash

# Exit on error
set -e

echo "🚀 Starting deployment to Cloud Run..."

# Check if PROJECT_ID is set
if [ -z "$PROJECT_ID" ]; then
    echo "❌ Error: PROJECT_ID environment variable is not set"
    echo "Please run: export PROJECT_ID=your-gcp-project-id"
    exit 1
fi

echo "📦 Building Docker image with environment variables..."
docker build -t gcr.io/$PROJECT_ID/zapull-frontend \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY="$NEXT_PUBLIC_FIREBASE_API_KEY" \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN" \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID="$NEXT_PUBLIC_FIREBASE_PROJECT_ID" \
  --build-arg NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET" \
  --build-arg NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID" \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID="$NEXT_PUBLIC_FIREBASE_APP_ID" \
  --build-arg NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID="$NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID" \
  .

echo "📤 Pushing image to Container Registry..."
docker push gcr.io/$PROJECT_ID/zapull-frontend

echo "🌐 Deploying to Cloud Run..."
gcloud run deploy zapull-frontend \
  --image gcr.io/$PROJECT_ID/zapull-frontend \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --port 3000 \
  --memory 512Mi \
  --cpu 1 \
  --min-instances 0 \
  --max-instances 10 \
  --set-env-vars "NODE_ENV=production"

echo "✅ Deployment complete!"
echo "🔗 Your app should be available at the URL provided above"