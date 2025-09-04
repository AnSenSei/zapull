'use client'

import { useState } from 'react'
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase'

export default function TestAuthPage() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<any>(null)

  const testGoogleAuth = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const provider = new GoogleAuthProvider()
      provider.addScope('profile')
      provider.addScope('email')
      
      console.log('Starting Google sign-in popup...')
      const userCredential = await signInWithPopup(auth, provider)
      
      console.log('Sign-in successful:', userCredential)
      setResult({
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        displayName: userCredential.user.displayName,
        photoURL: userCredential.user.photoURL,
        isNewUser: userCredential.additionalUserInfo?.isNewUser,
        providerId: userCredential.additionalUserInfo?.providerId
      })
    } catch (err: any) {
      console.error('Google auth error:', err)
      setError({
        code: err.code,
        message: err.message,
        customData: err.customData,
        fullError: err
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Firebase Auth Test Page</h1>
        
        <div className="bg-gray-800 p-6 rounded-lg mb-6">
          <h2 className="text-xl font-semibold mb-4">Test Google Authentication</h2>
          <button
            onClick={testGoogleAuth}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg disabled:opacity-50"
          >
            {loading ? 'Testing...' : 'Test Google Sign-In'}
          </button>
        </div>

        {result && (
          <div className="bg-green-800 p-6 rounded-lg mb-6">
            <h3 className="text-xl font-semibold mb-2">Success!</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(result, null, 2)}
            </pre>
          </div>
        )}

        {error && (
          <div className="bg-red-800 p-6 rounded-lg mb-6">
            <h3 className="text-xl font-semibold mb-2">Error</h3>
            <pre className="text-sm overflow-auto">
              {JSON.stringify(error, null, 2)}
            </pre>
          </div>
        )}

        <div className="bg-gray-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-4">Debugging Information</h3>
          <div className="space-y-2 text-sm">
            <p><strong>Auth Domain:</strong> {auth.config.authDomain}</p>
            <p><strong>API Key:</strong> {auth.config.apiKey?.substring(0, 10)}...</p>
            <p><strong>Current User:</strong> {auth.currentUser ? auth.currentUser.email : 'None'}</p>
          </div>
        </div>

        <div className="mt-8 bg-yellow-800 p-6 rounded-lg">
          <h3 className="text-xl font-semibold mb-2">Troubleshooting the 503 Error</h3>
          <ol className="list-decimal list-inside space-y-2 text-sm">
            <li>Check Firebase Console → Authentication → Sign-in method → Google is enabled</li>
            <li>Check Google Cloud Console → APIs & Services → Credentials → OAuth 2.0 Client IDs</li>
            <li>Verify authorized JavaScript origins includes: http://localhost:3000</li>
            <li>Check if Identity Toolkit API is enabled in Google Cloud Console</li>
            <li>Try using an incognito/private browser window</li>
            <li>Clear browser cache and cookies for Google accounts</li>
          </ol>
        </div>
      </div>
    </div>
  )
}