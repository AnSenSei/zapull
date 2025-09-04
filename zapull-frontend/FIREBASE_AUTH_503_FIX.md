# Firebase Google Sign-in 503 Error Fix Guide

## Problem
- Existing Google users can sign in successfully
- New Google users get 503 Service Unavailable (Error code: 47)
- Email sign-up works fine

## Root Cause
This error typically occurs when the OAuth consent screen is in "Testing" mode and the test users list is full (limited to 100 users).

## Solution Steps

### 1. Check OAuth Consent Screen Status

1. Go to: https://console.cloud.google.com/apis/credentials/consent?project=seventh-program-433718-h8
2. Check the **Publishing status**:
   - If it shows **"Testing"**, this is likely the issue
   - If it shows **"In production"**, skip to step 3

### 2. Fix Testing Mode Issues

If your app is in "Testing" mode, you have two options:

#### Option A: Clear Test Users List (Quick Fix)
1. Click on the OAuth consent screen
2. Go to "Test users" section
3. Remove some test users to make room for new ones
4. Save changes

#### Option B: Publish to Production (Recommended)
1. Click "PUBLISH APP" button
2. Review the requirements:
   - App name
   - Support email
   - App logo (optional for production)
   - Authorized domains
   - Privacy policy URL (required for production)
   - Terms of service URL (optional)
3. Complete any missing requirements
4. Submit for publication

### 3. Check Google Cloud Quotas

1. Go to: https://console.cloud.google.com/apis/api/identitytoolkit.googleapis.com/quotas?project=seventh-program-433718-h8
2. Check if any quotas are at or near their limits
3. Common quota issues:
   - Sign-ups per project per day
   - Sign-ups per IP address per hour
   - Total users per project

### 4. Verify Identity Toolkit API

1. Go to: https://console.cloud.google.com/apis/api/identitytoolkit.googleapis.com?project=seventh-program-433718-h8
2. Ensure the API is **Enabled**
3. Check the metrics for any error spikes

### 5. Check Firebase Authentication Settings

1. Go to Firebase Console: https://console.firebase.google.com/
2. Select your project
3. Go to Authentication → Settings → Authorized domains
4. Ensure your domain is listed:
   - localhost (for development)
   - Your production domain

### 6. Verify OAuth 2.0 Client Configuration

1. Go to: https://console.cloud.google.com/apis/credentials?project=seventh-program-433718-h8
2. Click on your OAuth 2.0 Client ID
3. Verify Authorized JavaScript origins includes:
   - http://localhost:3000 (for development)
   - Your production domain
4. Verify Authorized redirect URIs includes:
   - https://seventh-program-433718-h8.firebaseapp.com/__/auth/handler

## Testing the Fix

1. Visit: http://localhost:3000/diagnose-auth
2. Click "Test Google Sign-In"
3. Try with a new Google account that hasn't been used before

## Alternative Workarounds

If you need to stay in "Testing" mode:

1. **Use Email Sign-up**: Encourage users to sign up with email instead
2. **Pre-add Test Users**: Manually add test users' email addresses to the test users list
3. **Create Development Project**: Use a separate Firebase project for development with its own OAuth consent screen

## Common Pitfalls

1. **Logo Upload**: Adding a logo to OAuth consent screen in production requires Google verification (can take weeks)
2. **Support Email**: Must match between Firebase Console and Google Cloud Console
3. **Privacy Policy**: Required for production apps
4. **Domain Verification**: Production apps may need domain verification

## Code Verification

The code implementation is correct. The issue is with Google Cloud/Firebase configuration, not the code.

## Need More Help?

1. Check Firebase Support: https://firebase.google.com/support
2. Check Google Cloud logs: https://console.cloud.google.com/logs
3. Contact Google Cloud Support if quotas are the issue