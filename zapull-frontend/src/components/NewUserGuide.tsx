'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

interface NewUserGuideProps {
  isVisible: boolean
  onComplete: () => void
}

export default function NewUserGuide({ isVisible, onComplete }: NewUserGuideProps) {
  const [currentStep, setCurrentStep] = useState(1) // 1 = profile dropdown, 2 = inventory link
  const [isCompleting, setIsCompleting] = useState(false)
  const router = useRouter()
  const { updateUserInfo } = useAuthStore()

  const completeGuide = async () => {
    setIsCompleting(true)
    try {
      // Mark onboarding as complete on backend
      const updatedUserInfo = await userApi.completeOnboarding()
      // Update local user info
      updateUserInfo({ new_account: false })
      // Navigate to inventory
      router.push('/inventory')
    } catch (error) {
      console.error('Failed to complete onboarding:', error)
      // Still navigate to inventory even if API fails
      router.push('/inventory')
    } finally {
      setIsCompleting(false)
      onComplete()
    }
  }

  const getTargetElement = () => {
    const isMobile = window.innerWidth < 768
    
    if (currentStep === 1) {
      // Step 1: Highlight profile dropdown
      return isMobile 
        ? document.querySelector('.mobile-menu-button') 
        : document.querySelector('.user-menu-container')
    } else if (currentStep === 2) {
      // Step 2: Highlight inventory link in dropdown
      return document.querySelector('a[href="/inventory"]')
    }
    
    return null
  }

  const highlightTarget = () => {
    const targetElement = getTargetElement()
    console.log('NewUserGuide: Highlighting target', {
      step: currentStep,
      elementFound: !!targetElement,
      isMobile: window.innerWidth < 768
    })
    
    if (targetElement) {
      // Remove any existing highlights first
      document.querySelectorAll('.guide-highlight').forEach(el => {
        el.classList.remove('guide-highlight')
      })
      
      // Add highlight class
      targetElement.classList.add('guide-highlight')
      console.log('NewUserGuide: Added guide-highlight class to element:', targetElement)
    } else {
      console.warn('NewUserGuide: Target element not found for highlighting')
    }
  }

  // Highlight target when step changes + toggle guide-mode class
  useEffect(() => {
    if (isVisible && currentStep) {
      document.body.classList.add('guide-mode')
      // Delay to ensure DOM is ready
      const timer = setTimeout(() => {
        highlightTarget()
      }, 200)
      return () => {
        clearTimeout(timer)
        document.body.classList.remove('guide-mode')
      }
    } else {
      document.body.classList.remove('guide-mode')
    }
  }, [currentStep, isVisible])

  // Handle profile dropdown click (step 1)
  useEffect(() => {
    if (isVisible && currentStep === 1) {
      const targetElement = getTargetElement()
      if (targetElement) {
        const handleClick = () => {
          console.log('NewUserGuide: Profile clicked, moving to step 2')
          setCurrentStep(2)
          // Wait for dropdown to open, then highlight inventory
          setTimeout(() => {
            highlightTarget()
          }, 100)
        }
        
        targetElement.addEventListener('click', handleClick)
        return () => {
          targetElement.removeEventListener('click', handleClick)
        }
      }
    }
  }, [currentStep, isVisible])

  // Handle inventory link click (step 2)
  useEffect(() => {
    if (isVisible && currentStep === 2) {
      // Wait a bit for dropdown to be open, then try to find inventory link
      const timer = setTimeout(() => {
        const targetElement = getTargetElement()
        if (targetElement) {
          const handleClick = (e) => {
            console.log('NewUserGuide: Inventory clicked, completing guide')
            // Don't prevent default - let them navigate to inventory
            completeGuide()
          }
          
          targetElement.addEventListener('click', handleClick)
          return () => {
            targetElement.removeEventListener('click', handleClick)
          }
        }
      }, 300)
      
      return () => clearTimeout(timer)
    }
  }, [currentStep, isVisible])

  // On mobile, auto-open the menu and focus Inventory (only Inventory should be clickable)
  useEffect(() => {
    if (!isVisible) return
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (!isMobile) return

    let cancelled = false

    const ensureMenuOpen = () => {
      const panel = document.querySelector('.mobile-menu-container')
      if (!panel) {
        const btn = document.querySelector('.mobile-menu-button') as HTMLElement | null
        btn?.click()
      }
    }

    // Move directly to step 2 on mobile
    setCurrentStep(2)
    ensureMenuOpen()

    let attempts = 0
    const interval = setInterval(() => {
      if (cancelled) return
      attempts++
      ensureMenuOpen()
      const el = document.querySelector('a[href="/inventory"]') as HTMLElement | null
      if (el) {
        // Highlight soon after it's in the DOM
        setTimeout(() => { if (!cancelled) highlightTarget() }, 50)
        clearInterval(interval)
      } else if (attempts > 30) {
        clearInterval(interval)
      }
    }, 100)

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [isVisible])

  // Cleanup highlights when guide is not visible
  useEffect(() => {
    if (!isVisible) {
      document.querySelectorAll('.guide-highlight').forEach(el => {
        el.classList.remove('guide-highlight')
      })
      document.body.classList.remove('guide-mode')
      setCurrentStep(1) // Reset to step 1
    }
  }, [isVisible])

  if (!isVisible) return null

  return (
    <>
      {/* Dark overlay that dims everything, placed below navbar to avoid layout issues */}
      <div className="fixed inset-0 z-[40] bg-black/60" />

      {/* Global guide mode to disable all clicks except highlighted */}
      <style jsx global>{`
        body.guide-mode * { pointer-events: none !important; }
        body.guide-mode .guide-highlight, body.guide-mode .guide-highlight * { pointer-events: auto !important; }
      `}</style>

      {/* Guide styles */}
      <style jsx global>{`
        .guide-highlight {
          position: relative;
          z-index: 10002 !important;
          /* Stronger multi-layer glow */
          box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.9),
                      0 0 20px 6px rgba(139, 92, 246, 0.8),
                      0 0 44px 16px rgba(139, 92, 246, 0.65),
                      0 0 80px 28px rgba(139, 92, 246, 0.5);
          filter: drop-shadow(0 0 18px rgba(139, 92, 246, 1)) drop-shadow(0 0 36px rgba(139, 92, 246, 0.95)) drop-shadow(0 0 70px rgba(139, 92, 246, 0.8));
          animation: guide-shine 1.2s ease-in-out infinite, guide-pulse 1.6s ease-in-out infinite;
          pointer-events: auto !important;
          border-radius: 10px;
        }
        .guide-highlight::after {
          content: '';
          position: absolute;
          inset: -10px;
          border-radius: inherit;
          pointer-events: none;
          background: radial-gradient(ellipse at center, rgba(139,92,246,0.55) 0%, rgba(139,92,246,0.35) 45%, rgba(139,92,246,0) 70%);
          filter: blur(10px);
          animation: guide-radiate 1.8s ease-in-out infinite;
          z-index: -1;
        }
        
        /* Ensure all children of highlighted elements are also above overlay */
        .guide-highlight * {
          position: relative;
          z-index: 10003 !important;
          pointer-events: auto !important;
        }
        
        @keyframes guide-shine {
          0%, 100% {
            filter: drop-shadow(0 0 18px rgba(139, 92, 246, 1)) drop-shadow(0 0 36px rgba(139, 92, 246, 0.95)) drop-shadow(0 0 70px rgba(139, 92, 246, 0.8));
          }
          50% {
            filter: drop-shadow(0 0 28px rgba(255, 255, 255, 1)) drop-shadow(0 0 50px rgba(139, 92, 246, 1)) drop-shadow(0 0 90px rgba(139, 92, 246, 0.9));
          }
        }
        @keyframes guide-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.9), 0 0 20px 6px rgba(139, 92, 246, 0.8), 0 0 44px 16px rgba(139, 92, 246, 0.65), 0 0 80px 28px rgba(139, 92, 246, 0.5); }
          50% { transform: scale(1.02); box-shadow: 0 0 0 4px rgba(139, 92, 246, 1), 0 0 26px 10px rgba(139, 92, 246, 0.95), 0 0 60px 22px rgba(139, 92, 246, 0.8), 0 0 100px 34px rgba(139, 92, 246, 0.65); }
        }
        @keyframes guide-radiate {
          0%, 100% { opacity: 0.7; transform: scale(0.98); }
          50% { opacity: 1; transform: scale(1.02); }
        }
      `}</style>
    </>
  )
}
