'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

export default function EditDisplayNameModal() {
  const [displayName, setDisplayName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { closeEditDisplayNameModal, setUserInfo, updateUserInfo, isEditDisplayNameModalOpen } = useAuthStore()

  // Initialize display name from localStorage if available
  useEffect(() => {
    if (isEditDisplayNameModalOpen) {
      const pendingUserDataStr = localStorage.getItem('pendingUserData')
      if (pendingUserDataStr) {
        const pendingUserData = JSON.parse(pendingUserDataStr)
        setDisplayName(pendingUserData.displayName || '')
      }
    }
  }, [isEditDisplayNameModalOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) {
      setError('Display name is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      // Get pending user data from localStorage
      const pendingUserDataStr = localStorage.getItem('pendingUserData')
      if (pendingUserDataStr) {
        const pendingUserData = JSON.parse(pendingUserDataStr)
        
        // Create account with updated display name
        const userInfo = await userApi.createAccount({
          email: pendingUserData.email,
          displayName: displayName.trim(),
          avatar: pendingUserData.avatar
        })
        
        setUserInfo(userInfo)
        localStorage.removeItem('pendingUserData') // Clean up
        
        closeEditDisplayNameModal()
        router.push('/inventory')
      } else {
        // Fallback: update existing user info
        const currentUserInfo = useAuthStore.getState().userInfo
        if (currentUserInfo) {
          const updatedInfo = await userApi.updateUserInfo({
            displayName: displayName.trim()
          })
          updateUserInfo(updatedInfo)
        }
        closeEditDisplayNameModal()
        // Don't redirect when editing existing profile - user stays on current page
      }
    } catch (err: any) {
      console.error('Failed to save display name:', err)
      setError('Failed to save display name. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSkip = () => {
    // Use default name and continue
    const pendingUserDataStr = localStorage.getItem('pendingUserData')
    if (pendingUserDataStr) {
      const pendingUserData = JSON.parse(pendingUserDataStr)
      setDisplayName(pendingUserData.displayName || 'User')
      // Submit with default name
      handleSubmit({ preventDefault: () => {} } as React.FormEvent)
    } else {
      closeEditDisplayNameModal()
      // Don't redirect when editing existing profile - user stays on current page
    }
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isEditDisplayNameModalOpen) {
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
  }, [isEditDisplayNameModalOpen])

  if (!isEditDisplayNameModalOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="flex items-center justify-center min-h-full py-4 w-full">
        <div 
          className="relative w-full max-w-md my-auto"
          style={{
            background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
            borderRadius: '20px',
            border: '2px solid #8B5CF6'
          }}
        >
          <div className="p-6 sm:p-8">
            <button
              onClick={closeEditDisplayNameModal}
              className="absolute -top-2 -right-2 text-white hover:text-gray-300 transition-colors z-10"
            >
              <Image src="/icons/close.png" alt="Close" width={24} height={24} />
            </button>

            <div className="text-center">
              <div className="mb-4 sm:mb-6">
                <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-3 sm:mb-4 bg-purple-600 rounded-full flex items-center justify-center">
                  <svg className="w-6 h-6 sm:w-8 sm:h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">Choose Your Display Name</h2>
                <p className="text-gray-400 text-sm sm:text-base">
                  This is the name other users will see
                </p>
              </div>

              {error && (
                <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Enter your display name"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full px-4 py-2.5 sm:py-3 bg-[#25262B] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm sm:text-base"
                    required
                    disabled={loading}
                    maxLength={50}
                  />
                  <p className="text-xs sm:text-sm text-gray-500 mt-2 text-left">
                    Choose a unique name that represents you
                  </p>
                </div>

                <button
                  type="submit"
                  className="w-full bg-purple-600 text-white py-2.5 sm:py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm sm:text-base"
                  disabled={loading || !displayName.trim()}
                >
                  {loading ? 'Saving...' : 'Continue'}
                </button>

                <button
                  type="button"
                  onClick={handleSkip}
                  className="w-full bg-transparent border border-gray-600 text-gray-400 py-2.5 sm:py-3 rounded-lg hover:bg-gray-600 hover:text-white transition-colors text-sm sm:text-base"
                  disabled={loading}
                >
                  Skip for now
                </button>
              </form>

              <div className="mt-4 pt-3 sm:pt-4 border-t border-gray-700">
                <p className="text-xs sm:text-sm text-gray-500">
                  You can always change this later in your profile settings
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
