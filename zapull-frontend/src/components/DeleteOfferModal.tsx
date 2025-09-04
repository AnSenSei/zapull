'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentUserId, getAuthHeaders } from '@/lib/authUtils'

interface DeleteOfferModalProps {
  isOpen: boolean
  onClose: () => void
  offer: {
    offerreference: string
    listingId: string
    amount: number
    type: 'cash' | 'points'
    card_reference: string
    image_url?: string
  } | null
  onSuccess: () => void
}

export default function DeleteOfferModal({ isOpen, onClose, offer, onSuccess }: DeleteOfferModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!offer) return

    const userId = getCurrentUserId()
    if (!userId) {
      setError('User not logged in')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      const url = offer.type === 'cash'
        ? `${apiBaseUrl}/marketplace/listings/${offer.listingId}/offers/cash/${offer.offerreference}`
        : `${apiBaseUrl}/marketplace/listings/${offer.listingId}/offers/points/${offer.offerreference}`

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      })

      if (response.ok) {
        onSuccess()
        onClose()
      } else {
        const errorData = await response.text()
        setError(`Failed to delete offer: ${errorData}`)
      }
    } catch (err) {
      setError('Network error, please try again')
      console.error('Failed to delete offer:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!offer) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-md"
            style={{
              background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
              borderRadius: '20px',
              border: '2px solid #8B5CF6'
            }}
          >
            {/* PROMPT 标题 */}
            <div className="relative p-6 text-center border-b border-gray-700">
              <h2 className="text-2xl font-bold text-white tracking-wider">PROMPT</h2>
              <div className="flex justify-center mt-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                  <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                  <div className="w-2 h-2 bg-purple-300 rounded-full"></div>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 bg-purple-600 hover:bg-purple-700 rounded-full flex items-center justify-center text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              {/* 卡片信息 */}
              <div className="flex items-center space-x-4 mb-6 p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                <img
                  src={offer.image_url || '/cards/card1.jpg'}
                  alt={offer.card_reference}
                  className="w-16 h-16 rounded-lg object-cover border-2 border-purple-500/30"
                />
                <div className="flex-1">
                  <h3 className="text-white font-bold text-lg">{offer.card_reference}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {offer.type === 'points' ? (
                      <>
                        <img src="/users/coin.png" alt="Points" className="w-5 h-5" />
                        <span className="text-yellow-400 font-bold">{offer.amount} Points</span>
                      </>
                    ) : (
                      <span className="text-green-400 font-bold">${offer.amount}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Confirmation info */}
              <div className="text-center mb-6">
                <p className="text-white text-lg font-medium mb-2">
                  Confirm withdrawal?
                </p>
                <p className="text-gray-400 text-sm">
                  Are you sure you want to withdraw this {offer.type === 'cash' ? 'cash' : 'points'} offer? This action cannot be undone.
                </p>
              </div>

              {error && (
                <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg mb-4 border border-red-500/30">
                  {error}
                </div>
              )}

              {/* 按钮 */}
              <div className="flex space-x-4">
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="flex-1 py-3 px-6 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-full transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={loading}
                  className="flex-1 py-3 px-6 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  ) : (
                    'Confirm'
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}