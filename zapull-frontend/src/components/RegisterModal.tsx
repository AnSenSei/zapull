'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, sendEmailVerification } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

export default function RegisterModal() {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { closeRegisterModal, switchToLogin, setUid, setUserInfo, setToken, openVerifyEmailModal } = useAuthStore()

  const handleEmailRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const userId = userCredential.user.uid
      setUid(userId)
      
      // Send email verification
      try {
        await sendEmailVerification(userCredential.user)
        console.log('Email verification sent successfully')
        
        // Store user data in localStorage temporarily until email is verified
        localStorage.setItem('pendingUserData', JSON.stringify({
          email,
          displayName: username,
          avatar: '',
          uid: userId
        }))
        
        closeRegisterModal()
        // Show verification modal - account creation happens after verification
        openVerifyEmailModal()
      } catch (verificationErr) {
        console.error('Failed to send email verification:', verificationErr)
        setError('Failed to send verification email. Please try again.')
        setLoading(false)
      }
    } catch (err: any) {
      console.error('Registration failed:', err)
      
      // Provide specific error messages based on Firebase error codes
      if (err.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please sign in or use a different email.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/weak-password') {
        setError('Password should be at least 6 characters long.');
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Email/password accounts are not enabled. Please contact support.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many attempts. Please try again later.');
      } else if (err.code === 'auth/missing-email') {
        setError('Please enter your email address.');
      } else if (err.code === 'auth/missing-password') {
        setError('Please enter a password.');
      } else {
        // Generic error message with the actual error for debugging
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')

    try {
      const provider = new GoogleAuthProvider()
      // Add required scopes
      provider.addScope('profile')
      provider.addScope('email')
      // Force account selection to ensure it works for new users
      provider.setCustomParameters({
        prompt: 'select_account'
      })
      
      console.log('Starting Google sign-in popup...')
      const userCredential = await signInWithPopup(auth, provider)
      console.log('Google sign-in successful, user credential:', {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        isNewUser: userCredential.additionalUserInfo?.isNewUser,
        providerId: userCredential.additionalUserInfo?.providerId
      })
      
      const userId = userCredential.user.uid
      setUid(userId)
      
      // Get and cache token
      try {
        const token = await userCredential.user.getIdToken()
        setToken(token, Date.now() + 3600000) // Cache for 1 hour
        console.log('Google sign-up token cached successfully')
      } catch (tokenErr) {
        console.error('Failed to get token:', tokenErr)
      }
      
      // Check if this is a new user from Firebase's perspective
      const isNewUser = userCredential.additionalUserInfo?.isNewUser
      console.log('Is new Firebase user:', isNewUser)
      
      try {
        // First try to get existing user info
        const userInfo = await userApi.getUserInfo()
        console.log('User already exists in our system:', userInfo)
        setUserInfo(userInfo)
        closeRegisterModal()
        router.push('/inventory')
      } catch (apiErr: any) {
        console.error('Failed to get user info:', apiErr)
        // If 404 error, user doesn't exist yet, so create account
        if (apiErr.response?.status === 404) {
          try {
            console.log('User does not exist in our system, creating new account')
            // Create user account and store in global state
            const newUserInfo = await userApi.createAccount({
              email: userCredential.user.email || '',
              displayName: userCredential.user.displayName || username || 'User',
              avatar: userCredential.user.photoURL || ''
            })
            console.log('New account created successfully:', newUserInfo)
            setUserInfo(newUserInfo)
            closeRegisterModal()
            router.push('/inventory')
          } catch (createErr) {
            console.error('Failed to create account:', createErr)
            setError('Registration successful but failed to create account. Please try again.')
            setLoading(false)
          }
        } else {
          setError('Registration successful but failed to get user info. Please try again.')
          setLoading(false)
        }
      }
    } catch (err: any) {
      console.error('Social login failed:', err)
      console.error('Error details:', {
        code: err.code,
        message: err.message,
        customData: err.customData,
        credential: err.credential
      })
      
      // Provide more specific error messages
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Login window was closed')
      } else if (err.code === 'auth/cancelled-popup-request') {
        setError('Login request was cancelled')
      } else if (err.code === 'auth/operation-not-allowed') {
        setError('Google login is not enabled. Please contact administrator.')
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('Current domain is not authorized for Google login')
      } else if (err.code === 'auth/error-code:-47' || err.message?.includes('503')) {
        console.error('Firebase 503 Service Unavailable - Error Code 47')
        console.error('This error typically indicates:')
        console.error('1. OAuth consent screen is in "Testing" mode with full test users list (100 user limit)')
        console.error('2. Firebase/Google Cloud quota limits reached')
        console.error('3. OAuth consent screen needs to be published to "Production"')
        console.error('')
        console.error('To fix this issue:')
        console.error('1. Go to https://console.cloud.google.com/apis/credentials/consent')
        console.error('2. Check if status is "Testing" - if so, either:')
        console.error('   a. Remove some test users to make room')
        console.error('   b. Publish the app to "Production" status')
        console.error('3. If already in "Production", check quotas at:')
        console.error('   https://console.cloud.google.com/apis/api/identitytoolkit.googleapis.com/quotas')
        
        setError('Google sign-up is currently unavailable for new users. This typically happens when the app is in testing mode with a full test users list or Google Cloud quotas have been reached. Please use email sign-up instead.')
      } else {
        setError(`Login failed: ${err.message || 'Please try again'}`)
      }
    } finally {
      setLoading(false)
    }
  }

  const { isRegisterModalOpen } = useAuthStore()

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isRegisterModalOpen) {
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.width = '100%';
      document.documentElement.style.overflow = 'hidden';
      
      return () => {
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.top = '';
        document.body.style.width = '';
        document.documentElement.style.overflow = '';
        window.scrollTo(0, scrollY);
      };
    }
  }, [isRegisterModalOpen])

  if (!isRegisterModalOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <div 
        className="relative w-full max-w-md"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '20px',
          border: '2px solid #8B5CF6'
        }}
      >
        <div className="p-8">
        <button
          onClick={closeRegisterModal}
          className="absolute -top-2 -right-2 text-white hover:text-gray-300 transition-colors z-10"
        >
          <Image src="/icons/close.png" alt="Close" width={24} height={24} />
        </button>

        <h2 className="text-2xl font-bold text-center text-white mb-6">SIGN UP</h2>

        {error && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailRegister} className="space-y-4">
          <div>
            <input
              type="text"
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3 bg-[#25262B] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
              disabled={loading}
            />
            <p className="text-sm text-gray-400 mt-1">This is your displayed user name</p>
          </div>

          <div>
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-[#25262B] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
              disabled={loading}
            />
          </div>

          <div>
            <input
              type="password"
              placeholder="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 bg-[#25262B] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              required
              disabled={loading}
            />
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="terms"
              className="mr-2"
              required
            />
            <label htmlFor="terms" className="text-gray-400 text-sm">I agree to the <a href="/privacy/Terms%20of%20Service(1).html" target="_blank" rel="noopener noreferrer" className="text-purple-400 underline hover:text-purple-300">Terms of Service</a></label>
          </div>

          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            disabled={loading}
          >
            {loading ? 'Signing up...' : 'Sign up'}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          <p className="mb-4">Already have an account? <button onClick={switchToLogin} className="text-purple-500 hover:text-purple-400">Sign in instead</button></p>
          <p className="mb-4">or continue</p>
        </div>

        <button
          onClick={handleGoogleLogin}
          className="w-full flex items-center justify-center px-4 py-3 bg-[#25262B] text-white rounded-lg hover:bg-opacity-80 transition-colors"
          disabled={loading}
        >
          <img src="/google.png" alt="Google" className="w-5 h-5" />
          <span className="ml-2">Continue with Google</span>
        </button>
        </div>
      </div>
    </div>
  )
}