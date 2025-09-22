#!/bin/bash

# Discord Bot Deployment Script for Google Cloud Run using Cloud Build

# Set variables
PROJECT_ID="zapull-production"
SERVICE_NAME="discord-gift-bot"
REGION="us-central1"

echo "🚀 Starting deployment of Discord Gift Code Bot..."

# Stop local bot if running
echo "🛑 Stopping local bot..."
pkill -f "npm start" || true

# Set the current project
echo "📋 Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Load environment variables
if [ -f .env ]; then
    source .env
else
    echo "❌ .env file not found!"
    exit 1
fi

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com

# Build and deploy using Cloud Build
echo "☁️ Building and deploying with Cloud Build..."
gcloud builds submit \
    --config=cloudbuild.yaml \
    --substitutions=_DISCORD_TOKEN="${DISCORD_TOKEN}",_CLIENT_ID="${CLIENT_ID}",_GUILD_ID="${GUILD_ID}"

echo "✅ Deployment completed!"
echo "🔗 Service URL: https://${SERVICE_NAME}-769075815684.us-central1.run.app"
echo "🏥 Health check: https://${SERVICE_NAME}-769075815684.us-central1.run.app/health"
echo "📋 To view logs: gcloud logs tail /projects/${PROJECT_ID}/logs/run.googleapis.com%2Fstdout"
