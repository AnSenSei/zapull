'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/lib/packsApi'
import marketplaceApi from '@/lib/marketplaceApi'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

interface MakeOfferModalProps {
  isOpen: boolean
  onClose: () => void
  card: Card | null
  userId?: string
  listingId?: string
  offerType: 'points' | 'cash'
  onMakeOffer?: (amount: number, duration: number) => void
  existingOffer?: any // Existing offer data for updating
}

export default function MakeOfferModal({ isOpen, onClose, card, userId, listingId, offerType, onMakeOffer, existingOffer }: MakeOfferModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [offerAmount, setOfferAmount] = useState('')
  const [duration, setDuration] = useState(7) // 默认7天
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // 移除点击外部关闭弹窗的功能，只保留close图标和ESC键关闭

  // ESC键关闭弹窗
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey)
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [isOpen, onClose])

  // 弹窗打开时重置或设置数据
  useEffect(() => {
    if (isOpen) {
      if (existingOffer) {
        // If updating, set the existing offer amount
        setOfferAmount(existingOffer.amount.toString())
        // Duration is not provided in existing offer, so keep default (7 days)
        setDuration(7)
      } else {
        // If creating new offer, reset
        setOfferAmount('')
        setDuration(7)
      }
    }
  }, [isOpen, existingOffer])

  const handleMakeOffer = async () => {
    const amount = parseFloat(offerAmount)
    if (amount <= 0 || !userId) return
    
    setIsLoading(true)
    try {
      if (existingOffer) {
        // Update existing offer
        if (offerType === 'points') {
          await marketplaceApi.updatePointsOffer({
            offer_id: existingOffer.offerreference,
            price: amount,
            expired: duration
          })
        } else {
          await marketplaceApi.updateCashOffer({
            offer_id: existingOffer.offerreference,
            price: amount,
            expired: duration
          })
        }
        toastSuccess('Offer updated successfully!')
      } else {
        // Create new offer
        if (!listingId) return
        
        if (offerType === 'points') {
          await marketplaceApi.createPointsOffer({
            listing_id: listingId,
            price: amount,
            expired: duration
          })
        } else {
          await marketplaceApi.createCashOffer({
            listing_id: listingId,
            price: amount,
            expired: duration
          })
        }
        toastSuccess('Offer submitted successfully!')
      }
      
      onMakeOffer?.(amount, duration)
      onClose()
    } catch (error: any) {
      console.error(existingOffer ? 'Failed to update offer:' : 'Failed to submit offer:', error)
      
      // Some environments may surface a success-looking response through the error path
      const maybeMessage = error?.response?.data?.message || error?.message || ''
      if (/success/i.test(maybeMessage) || error?.response?.status === 200) {
        toastSuccess(existingOffer ? 'Offer updated successfully!' : 'Offer submitted successfully!')
        onMakeOffer?.(parseFloat(offerAmount), duration)
        onClose()
        return
      }

      const status = error?.response?.status
      const backendDetail: string | undefined = error?.response?.data?.detail || error?.response?.data?.message

      // Specific UX: cannot offer on your own listing
      if (!existingOffer && status === 400 && backendDetail && /own listing/i.test(backendDetail)) {
        toast.error("You can't make an offer on your own listing")
      // Past due offers block
      } else if (!existingOffer && status === 403 && backendDetail?.includes('past due offers')) {
        toast.error(backendDetail)
      // If backend provided a clear detail, surface it
      } else if (backendDetail) {
        toast.error(backendDetail)
      } else {
        toast.error(existingOffer ? 'Failed to update offer, please try again' : 'Failed to submit offer, please try again')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const durationOptions = [
    { value: 1, label: '1 day' },
    { value: 3, label: '3 days' },
    { value: 7, label: '7 days' },
    { value: 14, label: '14 days' },
    { value: 30, label: '30 days' }
  ]

  if (!isOpen || !card) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
        <motion.div 
          ref={modalRef}
          className="relative w-full max-w-md"
          style={{
            background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
            borderRadius: '20px',
            border: '2px solid #8B5CF6'
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          {/* 标题栏 */}
          <div className="relative p-4 text-center border-b border-gray-700">
            <h2 className="text-xl font-bold text-white">{existingOffer ? 'Update offer' : 'Make an offer'}</h2>
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          <div className="p-6 space-y-6">
            {/* 卡片信息 */}
            <div className="flex items-center space-x-3">
              <div className="w-16 h-16 relative rounded-lg overflow-hidden flex-shrink-0">
                {card.image_url ? (
                  <Image 
                    src={card.image_url} 
                    alt={card.name} 
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gray-700 flex items-center justify-center text-gray-400 text-xs">
                    No Image
                  </div>
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-white font-medium text-sm truncate">{card.name}</h3>
                <p className="text-gray-400 text-xs">Graded Cards</p>
              </div>
            </div>



            {/* 出价输入 */}
            <div className="space-y-2">
              <label className="text-gray-400 text-sm">
                Your offer ({offerType === 'points' ? 'Points' : 'USD'})
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={offerAmount}
                  onChange={(e) => setOfferAmount(e.target.value)}
                  placeholder={offerType === 'points' ? '100' : '10.00'}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white text-center text-lg font-medium focus:outline-none focus:border-purple-500 transition-colors"
                  min="0"
                  step={offerType === 'points' ? '1' : '0.01'}
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* 持续时间选择 */}
            <div className="space-y-2">
              <label className="text-gray-400 text-sm">Duration</label>
              <div className="relative">
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white text-left flex items-center justify-between focus:outline-none focus:border-purple-500 transition-colors"
                >
                  <span>{durationOptions.find(opt => opt.value === duration)?.label}</span>
                  <svg 
                    className={`w-5 h-5 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
                    fill="currentColor" 
                    viewBox="0 0 20 20"
                  >
                    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd"/>
                  </svg>
                </button>
                
                {isDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-gray-800 border border-gray-600 rounded-lg shadow-lg z-10">
                    {durationOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setDuration(option.value)
                          setIsDropdownOpen(false)
                        }}
                        className="w-full px-4 py-3 text-left text-white hover:bg-gray-700 transition-colors first:rounded-t-lg last:rounded-b-lg"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 按钮组 */}
            <div className="space-y-3 pt-4">
              <button
                onClick={handleMakeOffer}
                disabled={!offerAmount || parseFloat(offerAmount) <= 0 || isLoading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                {isLoading ? 'Submitting...' : (existingOffer ? 'Update offer' : 'Make offer')}
              </button>
              <button
                onClick={onClose}
                className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* 底部提示 */}
            <div className="text-center">
              <p className="text-gray-400 text-xs">
                By clicking the buttons above you acknowledge that<br/>
                you have read and accept our terms of service.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}