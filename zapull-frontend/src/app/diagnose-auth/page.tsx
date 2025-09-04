'use client'

import { useState, useEffect } from 'react'
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function DiagnoseAuthPage() {
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
    })
    return () => unsubscribe()
  }, [])

  const addResult = (test: string, status: 'success' | 'error' | 'info', details: any) => {
    setResults(prev => [...prev, { test, status, details, timestamp: new Date().toISOString() }])
  }

  const testFirebaseConfig = () => {
    addResult('Firebase Config', 'info', {
      authDomain: auth.app.options.authDomain,
      projectId: auth.app.options.projectId,
      apiKey: auth.app.options.apiKey?.substring(0, 10) + '...',
    })
  }

  const testGoogleSignIn = async () => {
    setLoading(true)
    try {
      const provider = new GoogleAuthProvider()
      provider.addScope('profile')
      provider.addScope('email')
      
      // Test with different prompt settings
      provider.setCustomParameters({
        prompt: 'select_account',
        access_type: 'offline',
        include_granted_scopes: 'true'
      })

      addResult('Google Provider Setup', 'success', { scopes: ['profile', 'email'] })

      const result = await signInWithPopup(auth, provider)
      
      const credential = GoogleAuthProvider.credentialFromResult(result)
      const token = credential?.accessToken
      const user = result.user

      addResult('Google Sign-In', 'success', {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        isNewUser: result._tokenResponse?.isNewUser,
        providerId: result.providerId,
        operationType: result.operationType,
        hasAccessToken: !!token,
        metadata: {
          creationTime: user.metadata.creationTime,
          lastSignInTime: user.metadata.lastSignInTime
        }
      })

      // Test getting ID token
      try {
        const idToken = await user.getIdToken()
        addResult('ID Token', 'success', { 
          tokenLength: idToken.length,
          canGetToken: true 
        })
      } catch (tokenErr) {
        addResult('ID Token', 'error', tokenErr)
      }

    } catch (error: any) {
      addResult('Google Sign-In', 'error', {
        code: error.code,
        message: error.message,
        customData: error.customData,
        _tokenResponse: error._tokenResponse,
        fullError: JSON.stringify(error, null, 2)
      })
    } finally {
      setLoading(false)
    }
  }

  const testSignOut = async () => {
    try {
      await signOut(auth)
      addResult('Sign Out', 'success', { message: 'Successfully signed out' })
    } catch (error: any) {
      addResult('Sign Out', 'error', error)
    }
  }

  const checkAuthState = () => {
    addResult('Current Auth State', 'info', {
      isSignedIn: !!currentUser,
      uid: currentUser?.uid,
      email: currentUser?.email,
      emailVerified: currentUser?.emailVerified,
      isAnonymous: currentUser?.isAnonymous,
      metadata: currentUser?.metadata,
      providerData: currentUser?.providerData
    })
  }

  const clearResults = () => {
    setResults([])
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Firebase Auth Diagnostics</h1>
        
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Current User Status</h2>
          <div className="text-sm">
            {currentUser ? (
              <div className="space-y-1">
                <p><strong>Signed In:</strong> Yes</p>
                <p><strong>Email:</strong> {currentUser.email}</p>
                <p><strong>UID:</strong> {currentUser.uid}</p>
                <p><strong>Provider:</strong> {currentUser.providerData?.[0]?.providerId}</p>
              </div>
            ) : (
              <p>No user signed in</p>
            )}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Diagnostic Tests</h2>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={testFirebaseConfig}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg"
            >
              Check Firebase Config
            </button>
            <button
              onClick={checkAuthState}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg"
            >
              Check Auth State
            </button>
            <button
              onClick={testGoogleSignIn}
              disabled={loading || !!currentUser}
              className="bg-green-600 hover:bg-green-700 px-6 py-3 rounded-lg disabled:opacity-50"
            >
              {loading ? 'Testing...' : 'Test Google Sign-In'}
            </button>
            <button
              onClick={testSignOut}
              disabled={!currentUser}
              className="bg-red-600 hover:bg-red-700 px-6 py-3 rounded-lg disabled:opacity-50"
            >
              Sign Out
            </button>
            <button
              onClick={clearResults}
              className="bg-gray-600 hover:bg-gray-700 px-6 py-3 rounded-lg"
            >
              Clear Results
            </button>
          </div>
        </div>

        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-6 rounded-lg ${
                result.status === 'success' ? 'bg-green-800' :
                result.status === 'error' ? 'bg-red-800' :
                'bg-gray-800'
              }`}
            >
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-lg font-semibold">{result.test}</h3>
                <span className="text-xs text-gray-400">{result.timestamp}</span>
              </div>
              <pre className="text-sm overflow-auto whitespace-pre-wrap">
                {JSON.stringify(result.details, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        <div className="mt-8 bg-yellow-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">503 Error Troubleshooting</h3>
          <div className="space-y-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">1. Check Google Cloud Console:</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Go to: https://console.cloud.google.com/apis/credentials?project=seventh-program-433718-h8</li>
                <li>Check OAuth 2.0 Client IDs configuration</li>
                <li>Verify authorized JavaScript origins includes your domain</li>
                <li>Check if there's a user cap or quota limit</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">2. Check OAuth Consent Screen:</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Go to: https://console.cloud.google.com/apis/credentials/consent?project=seventh-program-433718-h8</li>
                <li>Ensure publishing status is "In production" not "Testing"</li>
                <li>If in "Testing" mode, check if test users list is full (limited to 100 users)</li>
                <li>Verify all required scopes are configured</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">3. Check Identity Toolkit API:</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Go to: https://console.cloud.google.com/apis/api/identitytoolkit.googleapis.com?project=seventh-program-433718-h8</li>
                <li>Ensure the API is enabled</li>
                <li>Check quotas and limits</li>
                <li>Look for any error logs or metrics</li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold mb-2">4. Firebase Console Checks:</h4>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Check Authentication → Settings → Authorized domains</li>
                <li>Verify user limits aren't reached</li>
                <li>Check if email enumeration protection is causing issues</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}