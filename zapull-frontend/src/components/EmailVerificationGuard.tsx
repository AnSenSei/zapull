'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '@/lib/firebase'
import { reload } from 'firebase/auth'
import { useAuthStore } from '@/store/authStore'

interface EmailVerificationGuardProps {
  children: React.ReactNode
  redirectTo?: string
}

export default function EmailVerificationGuard({ 
  children, 
  redirectTo = '/auth/verify-email' 
}: EmailVerificationGuardProps) {
  const [isChecking, setIsChecking] = useState(true)
  const [isVerified, setIsVerified] = useState(false)
  const router = useRouter()
  const { uid, authInitialized } = useAuthStore()

  useEffect(() => {
    const checkEmailVerification = async () => {
      // Wait for auth to be initialized
      if (!authInitialized) {
        return
      }

      const user = auth.currentUser

      // If no user is logged in, redirect to login
      if (!user || !uid) {
        router.push('/auth/login')
        return
      }

      try {
        // Reload user to get latest verification status
        await reload(user)
        
        // Check if user is using email/password authentication
        const isEmailPasswordUser = user.providerData.some(
          provider => provider.providerId === 'password'
        )

        // If it's an email/password user and not verified, redirect to verification
        if (isEmailPasswordUser && !user.emailVerified) {
          console.log('User email not verified, redirecting to verification page')
          router.push(redirectTo)
          return
        }

        // User is verified or using social login (which doesn't require email verification)
        setIsVerified(true)
      } catch (error) {
        console.error('Failed to check email verification:', error)
        // On error, assume user needs to verify
        router.push(redirectTo)
      } finally {
        setIsChecking(false)
      }
    }

    checkEmailVerification()
  }, [uid, authInitialized, router, redirectTo])

  // Show loading while checking
  if (isChecking || !authInitialized) {
    return (
      <div className="min-h-screen bg-[#0F111C] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-white">Checking verification status...</p>
        </div>
      </div>
    )
  }

  // If not verified and not redirecting, don't render children
  if (!isVerified) {
    return null
  }

  // User is verified, render protected content
  return <>{children}</>
}
