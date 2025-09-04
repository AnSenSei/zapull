# Zapull Admin Deployment Guide

This guide explains how to containerize and deploy the zapull-admin application to Google Cloud.

## Prerequisites

1. Google Cloud SDK installed and configured
2. Docker installed (optional for local testing)
3. Access to the Google Cloud project: `zapull-production`
4. Artifact Registry API enabled

## Quick Deployment

The easiest way to deploy is using the existing build script:

```bash
# Make the script executable (first time only)
chmod +x build-and-deploy.sh

# Run the deployment
./build-and-deploy.sh
```

This script will:
1. Generate a unique timestamp-based tag
2. Build the Docker image using Cloud Build
3. Push to Artifact Registry with both the timestamp tag and `latest` tag
4. Provide instructions for deploying to Cloud Run

## Manual Deployment Steps

### 1. Build the Docker Image Locally (Optional)

For local testing:

```bash
# Build the image
docker build -t zapull-admin:local .

# Test locally
docker run -p 8080:8080 zapull-admin:local
```

### 2. Deploy Using Cloud Build

The `cloudbuild.yaml` configuration handles the build and push process:

```bash
# Deploy with automatic versioning
gcloud builds submit --config cloudbuild.yaml

# Deploy with custom tag
gcloud builds submit --config cloudbuild.yaml --substitutions=_VERSION_TAG=v1.0.0
```

### 3. Deploy to Cloud Run

After the image is built and pushed to Artifact Registry:

```bash
# Deploy using the latest image
gcloud run deploy admin \
  --image us-docker.pkg.dev/zapull-production/frontend/admin:latest \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated

# Deploy using a specific version
gcloud run deploy admin \
  --image us-docker.pkg.dev/zapull-production/frontend/admin:v20241230-143022 \
  --region us-central1 \
  --port 8080 \
  --allow-unauthenticated
```

## Architecture Overview

### Multi-Stage Docker Build

The Dockerfile uses a multi-stage build process:

1. **Build Stage**: 
   - Uses Node.js 18 Alpine image
   - Installs dependencies with `npm ci`
   - Builds the Vue.js application with `npm run build`

2. **Production Stage**:
   - Uses nginx Alpine image
   - Copies built files from the build stage
   - Serves static files with nginx
   - Proxies API requests to the backend service

### Nginx Configuration

The `nginx.conf` file handles:
- Static asset serving with caching
- SPA routing (all routes serve index.html)
- API proxy to the backend service
- Gzip compression for better performance

## Environment Configuration

The application uses environment variables for configuration:

- `VITE_API_URL`: Backend API URL
- `VITE_FIREBASE_*`: Firebase configuration
- `VITE_STRIPE_PUBLISHABLE_KEY`: Stripe public key

These are baked into the build during the Docker image creation.

## Troubleshooting

### Build Failures

1. **Node modules issues**:
   ```bash
   # Clear npm cache
   npm cache clean --force
   
   # Remove node_modules and reinstall
   rm -rf node_modules package-lock.json
   npm install
   ```

2. **Docker build context too large**:
   - Check `.dockerignore` file
   - Ensure large files/directories are excluded

### Deployment Issues

1. **Cloud Run port mismatch**:
   - Ensure the `--port` flag matches the nginx configuration (8080)

2. **API proxy not working**:
   - Verify the backend URL in `nginx.conf`
   - Check Cloud Run service permissions

## Monitoring

After deployment, monitor the application:

```bash
# View Cloud Run logs
gcloud run services logs read admin --region us-central1

# View Cloud Build history
gcloud builds list --limit=10
```

## Rollback

To rollback to a previous version:

```bash
# List Cloud Run revisions
gcloud run revisions list --service admin --region us-central1

# Rollback to a specific revision
gcloud run services update-traffic admin \
  --to-revisions=admin-00001-abc=100 \
  --region us-central1
```

## Security Notes

- The `.env.production` file contains sensitive keys but uses test/development values
- Production secrets should be managed through Google Secret Manager
- Consider using Cloud Run environment variables for runtime configuration