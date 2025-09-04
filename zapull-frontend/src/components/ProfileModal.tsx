'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { getImageProps } from '@/lib/image-loader'
import { userApi } from '@/lib/userApi'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
  userId: string
}

export default function ProfileModal({ isOpen, onClose, userId }: ProfileModalProps) {
  const { userInfo, updateUserInfo } = useAuthStore()
  const [displayName, setDisplayName] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Initialize form data
  useEffect(() => {
    if (isOpen && userInfo) {
      setDisplayName(userInfo.displayName || '')
      setAvatar(userInfo.avatar || '')
      // Only set avatarPreview if there's actually an avatar
      if (userInfo.avatar) {
        setAvatarPreview(userInfo.avatar)
      } else {
        setAvatarPreview('')
      }
      // Reset file when modal opens
      setAvatarFile(null)
      setError('')
      setSuccess(false)
    }
  }, [userInfo, isOpen])
  
  // Handle image selection
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (limit to 5MB)
      const maxSize = 5 * 1024 * 1024 // 5MB
      if (file.size > maxSize) {
        setError('Image size must be less than 5MB')
        return
      }
      
      // Check file type
      if (!file.type.startsWith('image/')) {
        setError('Please select a valid image file')
        return
      }
      
      setAvatarFile(file)
      setError('') // Clear any previous errors
      
      // Log original file dimensions
      const img = new window.Image()
      img.onload = () => {
        console.log('Original image dimensions:', img.width, 'x', img.height)
      }
      
      // Create preview URL
      const reader = new FileReader()
      reader.onloadend = () => {
        const result = reader.result as string
        console.log('Image data URL length:', result.length)
        console.log('Image file size:', file.size, 'bytes')
        console.log('Image type:', file.type)
        console.log('First 100 chars of base64:', result.substring(0, 100))
        
        // Verify it's a valid data URL
        if (!result.startsWith('data:')) {
          console.error('Invalid data URL format')
          setError('Failed to process image')
          return
        }
        
        // Load image to check dimensions
        img.src = result
        setAvatarPreview(result)
        console.log('Avatar preview set to:', result.substring(0, 50) + '...')
      }
      reader.onerror = () => {
        setError('Failed to read image file')
        console.error('FileReader error:', reader.error)
      }
      reader.readAsDataURL(file)
    }
  }
  
  // Trigger file selection dialog
  const triggerFileInput = () => {
    fileInputRef.current?.click()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    setSuccess(false)
    
    try {
      let avatarUrl = avatar
      
      // If there's a new uploaded image, use the preview which is already base64
      if (avatarFile && avatarPreview) {
        console.log('Using avatar preview for upload:', avatarPreview.substring(0, 100) + '...')
        avatarUrl = avatarPreview // avatarPreview is already base64 image data
        
        // Validate that it's a proper data URL
        if (!avatarUrl.startsWith('data:image/')) {
          console.error('Invalid avatar data URL format')
          setError('Invalid image format')
          setLoading(false)
          return
        }
      }
      
      // Check if there are any changes
      const hasProfileChanges = displayName !== userInfo?.displayName || avatarFile !== null
      
      // Update display name and avatar
      if (hasProfileChanges) {
        // Only send avatar if a new file was uploaded
        if (avatarFile && avatarUrl) {
          console.log('Sending profile update with avatar')
          const response = await userApi.updateProfile(displayName, avatarUrl)
          console.log('Profile update response:', response)
        } else {
          // Only update display name, don't send avatar
          console.log('Sending profile update without avatar')
          const response = await userApi.updateProfile(displayName, null)
          console.log('Profile update response:', response)
        }
      }
      
      // Refresh user data from backend to get the updated avatar URL
      try {
        const updatedUserInfo = await userApi.getUserInfo()
        console.log('Updated user info from backend:', updatedUserInfo)
        updateUserInfo(updatedUserInfo)
        // Update local state with the new avatar URL
        if (updatedUserInfo.avatar) {
          console.log('New avatar URL from backend:', updatedUserInfo.avatar)
          setAvatar(updatedUserInfo.avatar)
          setAvatarPreview(updatedUserInfo.avatar)
          // Clear the file input
          setAvatarFile(null)
        }
      } catch (error) {
        console.error('Failed to refresh user info:', error)
        // Still update with local data as fallback
        updateUserInfo({
          displayName,
          avatar: avatarUrl
        })
      }
      
      setSuccess(true)
      
      setTimeout(() => {
        onClose()
      }, 1500)
    } catch (error) {
      console.error('Failed to update user info:', error)
      setError('Update failed, please try again later')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '20px',
          border: '2px solid #8B5CF6'
        }}
      >
        <div className="p-4 sm:p-6">
        {/* Close button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
        >
          <Image src="/icons/close.png" alt="Close" width={24} height={24} />
        </button>

        {/* Title */}
        <div className="text-center mb-6">
          <h2 className="text-xl font-bold text-white uppercase">EDIT PROFILE</h2>
          <div className="flex justify-center mt-2">
            <div className="w-12 h-1 bg-[#8B5CF6] rounded-full"></div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500 bg-opacity-10 border border-red-500 text-red-500 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500 bg-opacity-10 border border-green-500 text-green-500 px-4 py-3 rounded mb-4">
            Profile updated successfully!
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div 
              className="relative w-24 h-24 mb-4 rounded-full overflow-hidden cursor-pointer group"
              onClick={triggerFileInput}
            >
              <Image 
                {...getImageProps(avatarPreview || '/avatars/default.svg')}
                alt="Profile" 
                fill
                className="object-cover"
                onLoad={() => {
                  if (avatarPreview) {
                    console.log('Avatar preview loaded successfully')
                  }
                }}
                onError={(e) => {
                  if (avatarPreview) {
                    console.error('Avatar preview failed to load:', avatarPreview)
                  }
                }}
              />
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              id="avatar"
              name="avatar"
              accept="image/*"
              onChange={handleImageChange}
              className="hidden"
            />
            <p className="text-sm text-gray-400 mb-2">Click avatar to upload new image</p>
          </div>
          
          {/* Display Name */}
          <div>
            <label htmlFor="displayName" className="block text-sm text-gray-400 mb-2">Display Name</label>
            <input
              type="text"
              id="displayName"
              name="displayName"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full px-4 py-3 bg-[#2A2B3D] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-white text-sm"
              placeholder="Enter new display name"
            />
          </div>
          
          {/* Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="w-full bg-transparent border border-[#8B5CF6] text-white py-3 rounded-lg font-medium transition-colors hover:bg-[#8B5CF6]/20 flex items-center justify-center"
            >
              <Image src="/icons/close.png" alt="Close" width={16} height={16} />
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#8B5CF6] hover:bg-[#7C3AED] text-white py-3 rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center"
            >
              <span className="mr-2">💾</span> {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
        </div>
      </motion.div>
    </div>
  )
}