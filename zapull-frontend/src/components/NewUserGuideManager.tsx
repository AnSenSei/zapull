'use client'

import React, { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { usePathname } from 'next/navigation'
import NewUserGuide from './NewUserGuide'

export default function NewUserGuideManager() {
  const [isGuideVisible, setIsGuideVisible] = useState(false)
  const { userInfo, authInitialized } = useAuthStore()
  const pathname = usePathname()

  // Check if we should show the guide
  useEffect(() => {
    // Wait for auth to be initialized and user info to be loaded
    if (!authInitialized || !userInfo) return

    // Only show guide for new users and not on auth pages
    const shouldShowGuide = userInfo.new_account === true && 
                           !pathname.startsWith('/auth') && 
                           pathname !== '/inventory' // Don't show if already on inventory

    if (shouldShowGuide && !isGuideVisible) {
      // Small delay to ensure page is loaded
      setTimeout(() => {
        setIsGuideVisible(true)
      }, 1000)
    }
  }, [userInfo, authInitialized, pathname, isGuideVisible])

  // Hide guide when navigating to auth pages or inventory
  useEffect(() => {
    if (pathname.startsWith('/auth') || pathname === '/inventory') {
      setIsGuideVisible(false)
    }
  }, [pathname])

  const handleGuideComplete = () => {
    setIsGuideVisible(false)
  }

  return (
    <NewUserGuide 
      isVisible={isGuideVisible}
      onComplete={handleGuideComplete}
    />
  )
}
