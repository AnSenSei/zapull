# Google Authentication Setup for Cloud Run Deployment

When deploying the zapull-admin app to Cloud Run, Google authentication may fail with "Google登录失败" error. This is because Firebase needs to be configured to accept authentication from your Cloud Run domain.

## Cloud Run Service URL
Your deployed service URL is: `https://admin-meh6sujeya-uc.a.run.app`

## Steps to Fix Google Authentication

### 1. Add Cloud Run Domain to Firebase Authorized Domains

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project: **zapull-production**
3. Navigate to **Authentication** → **Settings** → **Authorized domains**
4. Click **Add domain**
5. Add: `admin-meh6sujeya-uc.a.run.app`
6. Click **Add**

### 2. Update Google OAuth 2.0 Redirect URIs

1. Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials?project=zapull-production)
2. Find the OAuth 2.0 Client ID that Firebase is using (usually named "Web client" or similar)
3. Click on it to edit
4. Under **Authorized redirect URIs**, add:
   - `https://admin-meh6sujeya-uc.a.run.app/__/auth/handler`
   - `https://zapull-production.firebaseapp.com/__/auth/handler` (if not already there)
5. Click **Save**

### 3. Verify Firebase Auth Domain

Make sure your Firebase authDomain in `.env.production` matches your Firebase project:
```
VITE_FIREBASE_AUTH_DOMAIN=zapull-production.firebaseapp.com
```

### 4. Clear Browser Cache

After making these changes:
1. Clear your browser cache and cookies for the admin domain
2. Try logging in again

## Common Issues and Solutions

### Issue: Popup Blocked
If you see "登录弹窗被浏览器阻止", enable popups for the admin domain in your browser settings.

### Issue: CORS Errors
If you see CORS errors in the console:
1. Ensure the Cloud Run service allows unauthenticated access
2. Check that all domains are properly whitelisted in Firebase

### Issue: Still Getting "Google登录失败"
1. Open browser developer console (F12)
2. Check the Console tab for specific error messages
3. Look for error codes like:
   - `auth/unauthorized-domain`: Domain not authorized
   - `auth/invalid-api-key`: API key mismatch
   - `auth/operation-not-allowed`: Google sign-in not enabled

## Testing

To verify the setup:
1. Go to https://admin-meh6sujeya-uc.a.run.app
2. Click "Google 登录"
3. Complete the Google sign-in flow
4. You should be redirected back and logged in

## Local Development

When running locally with `npx vite --mode production`, Google login works because:
- `localhost` is automatically authorized by Firebase
- No additional domain configuration is needed

## Security Note

Only add domains you control to the authorized domains list. Each domain added allows authentication requests from that domain.