'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { sendEmailVerification, reload } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

export default function VerifyEmailPage() {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)
  const router = useRouter()
  const { userInfo, setUserInfo } = useAuthStore()

  useEffect(() => {
    // Check if user is already verified
    const checkVerification = async () => {
      const user = auth.currentUser
      if (user) {
        await reload(user)
        if (user.emailVerified) {
          router.push('/inventory')
        }
      } else {
        // If no user is logged in, redirect to login
        router.push('/auth/login')
      }
    }
    
    checkVerification()
  }, [router])

  const handleResendEmail = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const user = auth.currentUser
      if (user && !user.emailVerified) {
        await sendEmailVerification(user)
        setEmailSent(true)
        setMessage('Verification email sent successfully! Please check your inbox.')
      } else if (user?.emailVerified) {
        setMessage('Your email is already verified!')
        setTimeout(() => router.push('/inventory'), 2000)
      } else {
        setError('No user found. Please sign up or log in.')
      }
    } catch (err: any) {
      console.error('Failed to send verification email:', err)
      if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please wait before requesting another verification email.')
      } else {
        setError('Failed to send verification email. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleCheckVerification = async () => {
    setLoading(true)
    setError('')
    setMessage('')

    try {
      const user = auth.currentUser
      if (user) {
        await reload(user)
        if (user.emailVerified) {
          setMessage('Email verified successfully! Creating your account...')
          
          // Get pending user data from localStorage
          const pendingUserDataStr = localStorage.getItem('pendingUserData')
          if (pendingUserDataStr) {
            const pendingUserData = JSON.parse(pendingUserDataStr)
            
            try {
              // Now create the account in our backend
              const userInfo = await userApi.createAccount({
                email: pendingUserData.email,
                displayName: pendingUserData.displayName,
                avatar: pendingUserData.avatar
              })
              
              setUserInfo(userInfo)
              localStorage.removeItem('pendingUserData') // Clean up
              
              setMessage('Account created successfully! Redirecting...')
              setTimeout(() => router.push('/inventory'), 1500)
            } catch (apiErr) {
              console.error('Failed to create account:', apiErr)
              setError('Email verified but failed to create account. Please try again or contact support.')
            }
          } else {
            // No pending data, just redirect (maybe user refreshed page)
            setTimeout(() => router.push('/inventory'), 1500)
          }
        } else {
          setError('Email not yet verified. Please check your inbox and click the verification link.')
        }
      }
    } catch (err) {
      console.error('Failed to check verification status:', err)
      setError('Failed to check verification status. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await auth.signOut()
      router.push('/')
    } catch (err) {
      console.error('Failed to sign out:', err)
    }
  }

  return (
    <div className="min-h-screen bg-[#0F111C] flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '20px',
          border: '2px solid #8B5CF6'
        }}
      >
        <div className="p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 mx-auto mb-4 bg-purple-600 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 4.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Verify Your Email</h1>
            <p className="text-gray-400">
              We've sent a verification link to {auth.currentUser?.email}
            </p>
          </div>

          {message && (
            <div className="bg-green-500 bg-opacity-10 border border-green-500 text-green-500 px-4 py-3 rounded mb-4">
              {message}
            </div>
          )}

          {error && (
            <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <p className="text-gray-400 text-sm mb-3">
              Please check your email and click the verification link to activate your account.
            </p>
            <div className="bg-purple-600 bg-opacity-10 border border-purple-600 text-purple-200 px-4 py-3 rounded text-sm">
              <strong>Note:</strong> You need to verify your email to access your account and all features.
            </div>

            <button
              onClick={handleCheckVerification}
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              disabled={loading}
            >
              {loading ? 'Checking...' : 'I\'ve Verified My Email'}
            </button>

            <button
              onClick={handleResendEmail}
              className="w-full bg-transparent border border-purple-600 text-purple-600 py-3 rounded-lg hover:bg-purple-600 hover:text-white disabled:opacity-50 transition-colors"
              disabled={loading || emailSent}
            >
              {loading ? 'Sending...' : emailSent ? 'Email Sent' : 'Resend Verification Email'}
            </button>

            <div className="pt-4 border-t border-gray-700">
              <p className="text-gray-500 text-sm mb-3">
                Wrong email address?
              </p>
              <button
                onClick={handleSignOut}
                className="text-purple-400 hover:text-purple-300 underline text-sm"
              >
                Sign out and create a new account
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
