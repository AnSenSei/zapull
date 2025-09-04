# Environment Variables Setup

This document explains how to set up environment variables for local development and production builds.

## Environment Files

### `.env.local` (Development)
Contains development environment variables based on `cloudbuild.yaml`. This file is used for:
- Local development with `npm run dev`
- Testing with development Firebase project
- Stripe test keys
- Development API endpoints

### `.env.production` (Production)
Contains production environment variables based on `cloudbuild_production.yaml`. This file is used for:
- Local production builds with `npm run build`
- Testing with production Firebase project
- Stripe live keys
- Production API endpoints

### `.env.example` (Template)
Template file for new developers to copy and customize.

## Usage

### For Development
The `.env.local` file is already set up with the correct development environment variables from your Cloud Build configuration. Simply run:

```bash
npm run dev
```

### For Local Production Build
To build locally with production environment variables:

```bash
# Copy production env to .env.local temporarily
cp .env.production .env.local.backup  # backup current .env.local
cp .env.production .env.local

# Build
npm run build
npm start

# Restore development env
mv .env.local.backup .env.local
```

Or use environment variable override:
```bash
NODE_ENV=production npm run build
```

### For Testing Different Environments
You can create additional environment files as needed:
- `.env.staging` - for staging environment
- `.env.test` - for testing environment

## Environment Variables Mapping

### Development vs Production

| Variable | Development | Production |
|----------|-------------|------------|
| Firebase Project | seventh-program-433718-h8 | zapull-production |
| Stripe Keys | Test keys (pk_test_*) | Live keys (pk_live_*) |
| API URLs | *-351785787544.* | *-769075815684.* |

### Key Differences

1. **Firebase Projects**:
   - Dev: `seventh-program-433718-h8`
   - Prod: `zapull-production`

2. **Stripe Configuration**:
   - Dev: Test publishable key for development
   - Prod: Live publishable key for production payments

3. **API Endpoints**:
   - Dev: Uses project ID `351785787544`
   - Prod: Uses project ID `769075815684`

## Security Notes

⚠️ **Important**: 
- Never commit `.env.local` or `.env.production` to version control
- The `.gitignore` file excludes all `.env*` files
- Production keys should only be used in production environments
- For new team members, share environment values securely (not via chat/email)

## Verification

To verify your environment is set up correctly:

1. Check that the correct Firebase project is being used in the browser console
2. Verify API calls are going to the correct endpoints
3. Test authentication and payments work as expected

## Troubleshooting

If you encounter issues:

1. **Build fails**: Check that all required environment variables are set
2. **API errors**: Verify the API URLs are correct and accessible
3. **Auth issues**: Ensure Firebase configuration matches your project
4. **Payment issues**: Verify Stripe keys are correct for the environment

## Cloud Build Sync

The environment files are based on the Cloud Build configurations:
- `cloudbuild.yaml` → `.env.local` (development)
- `cloudbuild_production.yaml` → `.env.production` (production)

When Cloud Build configurations change, update these files accordingly.
