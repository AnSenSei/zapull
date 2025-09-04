#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building and pushing to Artifact Registry...${NC}"

# Generate a unique tag with timestamp
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
TAG="v${TIMESTAMP}"

echo -e "${YELLOW}Using tag: ${TAG}${NC}"

# Submit the build using cloudbuild.yaml which creates both tags in one build
gcloud builds submit --config cloudbuild.yaml --substitutions=_VERSION_TAG=${TAG}

echo -e "${GREEN}Build complete!${NC}"
echo ""
echo -e "${YELLOW}To deploy in Cloud Run UI:${NC}"
echo "1. Go to Cloud Run console"
echo "2. Click 'Edit & Deploy New Revision'"
echo "3. Select the image with tag: ${TAG}"
echo "4. Deploy"
echo ""
echo -e "${YELLOW}Or deploy via CLI:${NC}"
echo "gcloud run deploy admin --image us-docker.pkg.dev/zapull-production/frontend/admin:${TAG} --region us-central1 --port 8080"