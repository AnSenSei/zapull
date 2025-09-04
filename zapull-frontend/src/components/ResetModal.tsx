'use client'

import { useState, useEffect } from 'react'
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import Image from 'next/image'

export default function ResetModal() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const { isResetModalOpen, closeResetModal, switchToLogin } = useAuthStore()

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)

    try {
      await sendPasswordResetEmail(auth, email)
      setSuccess(true)
      setTimeout(() => {
        closeResetModal()
        switchToLogin()
      }, 3000)
    } catch (err: any) {
      console.error('Password reset failed:', err)
      
      // Provide specific error messages based on Firebase error codes
      if (err.code === 'auth/invalid-email') {
        setError('Please enter a valid email address.');
      } else if (err.code === 'auth/user-not-found') {
        setError('No account found with this email address.');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later.');
      } else if (err.code === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection and try again.');
      } else if (err.code === 'auth/missing-email') {
        setError('Please enter your email address.');
      } else {
        // Generic error message
        setError(err.message || 'Failed to send reset email. Please try again.');
      }
    } finally {
      setLoading(false)
    }
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isResetModalOpen) {
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
  }, [isResetModalOpen])

  if (!isResetModalOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-gradient-to-br from-[#1A1B2C] to-[#2A2B3D] w-[480px] p-8 rounded-[20px] shadow-xl relative border-2 border-[#8868FF]">
        <button
          onClick={closeResetModal}
          className="absolute top-[10px] right-[10px] cursor-pointer bg-none border-none p-0 text-[20px] text-white"
        >
          <Image src="/icons/close.png" alt="Close" width={24} height={24} />
        </button>

        <h2 className="text-2xl font-bold text-center text-white mb-6">RESET</h2>
        <p className="text-gray-400 text-center mb-6">Enter your email and we'll send you instructions to reset your password</p>

        {error && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500 bg-opacity-10 border border-green-500 text-green-500 px-4 py-3 rounded mb-4">
            Password reset email has been sent. Please check your inbox.
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-4">
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

          <button
            type="submit"
            className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
            disabled={loading}
          >
            {loading ? 'Submitting...' : 'Submit'}
          </button>
        </form>

        <p className="text-gray-500 text-sm text-center mt-4">
          If your email is registered with us, you'll receive a password reset email.
        </p>

        <div className="mt-6 text-center">
          <button
            onClick={switchToLogin}
            className="text-purple-500 hover:text-purple-400"
          >
            ← Go back to sign in
          </button>
        </div>
      </div>
    </div>
  )
}