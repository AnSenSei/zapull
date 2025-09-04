'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, reload } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

export default function LoginModal() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { closeLoginModal, switchToRegister, switchToReset, setUid, setUserInfo, setToken, openVerifyEmailModal } = useAuthStore()

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const userId = userCredential.user.uid
      setUid(userId)
      
      // Reload user to get latest verification status
      try {
        await reload(userCredential.user)
      } catch (reloadErr) {
        console.error('Failed to reload user:', reloadErr)
      }
      
      // Check if email is verified for email/password users
      if (!userCredential.user.emailVerified) {
        console.log('User email not verified, showing verification modal')
        closeLoginModal()
        openVerifyEmailModal()
        return
      }
      
      // Get and cache token
      try {
        const token = await userCredential.user.getIdToken()
        setToken(token, Date.now() + 3600000) // Cache for 1 hour
        console.log('Email login token cached successfully')
      } catch (tokenErr) {
        console.error('Failed to get token:', tokenErr)
      }
      
      try {
        // Get user info and store in global state
        const userInfo = await userApi.getUserInfo()
        setUserInfo(userInfo)
        closeLoginModal()
        router.push('/inventory')
      } catch (apiErr: any) {
        console.error('Failed to get user info:', apiErr)
        // If 404 error, user hasn't created an account yet
        if (apiErr.response?.status === 404) {
          try {
            console.log('User does not exist, attempting to create account')
            // Create new account
            const newUserInfo = await userApi.createAccount({
              email: userCredential.user.email || email,
              displayName: userCredential.user.displayName || email.split('@')[0],
              avatar: userCredential.user.photoURL
            })
            setUserInfo(newUserInfo)
            closeLoginModal()
            router.push('/inventory')
          } catch (createErr) {
            console.error('Failed to create account:', createErr)
            setError('Failed to create account. Please try again.')
            setLoading(false)
          }
        } else {
          setError('Login successful but failed to get user info. Please try again.')
          setLoading(false)
        }
      }
    } catch (err: any) {
      console.error('Login failed:', err)
      
      // Provide specific error messages based on Firebase error codes
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        setError('Invalid email or password. Please check your credentials and try again.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email. Please sign up first.');
      } else if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/user-disabled') {
        setError('This account has been disabled. Please contact support.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many failed login attempts. Please try again later.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else if (err.code === 'auth/missing-email') {
        setError('Please enter your email address.');
      } else if (err.code === 'auth/missing-password') {
        setError('Please enter your password.');
      } else {
        // Generic error message with the actual error for debugging
        setError(err.message || 'Login failed. Please try again.');
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
      // Force account selection so users can choose a different Google account
      provider.setCustomParameters({
        prompt: 'select_account'
      })
      const userCredential = await signInWithPopup(auth, provider)
      const userId = userCredential.user.uid
      setUid(userId)
      
      // Get and cache token
      try {
        const token = await userCredential.user.getIdToken()
        setToken(token, Date.now() + 3600000) // Cache for 1 hour
        console.log('Google login token cached successfully')
      } catch (tokenErr) {
        console.error('Failed to get token:', tokenErr)
      }
      
      try {
        // Get user info and store in global state
        const userInfo = await userApi.getUserInfo()
        setUserInfo(userInfo)
        closeLoginModal()
        router.push('/inventory')
      } catch (apiErr: any) {
        console.error('Failed to get user info:', apiErr)
        // If 404 error, user hasn't created an account yet
        if (apiErr.response?.status === 404) {
          try {
            console.log('User does not exist, attempting to create account')
            // Create new account
            const newUserInfo = await userApi.createAccount({
              email: userCredential.user.email || email,
              displayName: userCredential.user.displayName || email.split('@')[0],
              avatar: userCredential.user.photoURL
            })
            setUserInfo(newUserInfo)
            closeLoginModal()
            router.push('/inventory')
          } catch (createErr) {
            console.error('Failed to create account:', createErr)
            setError('Failed to create account. Please try again.')
            setLoading(false)
          }
        } else {
          setError('Login successful but failed to get user info. Please try again.')
          setLoading(false)
        }
      }
    } catch (err: any) {
      console.error('Social login failed:', err)
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const { isLoginModalOpen } = useAuthStore()

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isLoginModalOpen) {
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
  }, [isLoginModalOpen])

  if (!isLoginModalOpen) return null

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
          onClick={closeLoginModal}
          className="absolute -top-2 -right-2 text-white hover:text-gray-300 transition-colors z-10"
        >
          <Image src="/icons/close.png" alt="Close" width={24} height={24} />
        </button>

        <h2 className="text-2xl font-bold text-center text-white mb-6">SIGN IN</h2>

        {error && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-4">
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

          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            disabled={loading}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <div className="mt-6 text-center text-gray-400">
          <p className="mb-4">Zapull newbie? <button onClick={switchToRegister} className="text-purple-500 hover:text-purple-400">Create an account</button></p>
          <p className="mb-4">Forgot password? <button onClick={switchToReset} className="text-purple-500 hover:text-purple-400">Reset it here</button></p>
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