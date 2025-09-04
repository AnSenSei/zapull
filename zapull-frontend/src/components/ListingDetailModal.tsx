'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentUserId, getAuthHeaders } from '@/lib/authUtils'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

interface ListingDetailModalProps {
  isOpen: boolean
  onClose: () => void
  listing: {
    id: string
    card_name: string
    card_reference: string
    priceCash: number
    pricePoints: number
    image_url?: string
    highestOfferPoints?: { 
      amount: number
      offererRef: string
      offerreference: string
      at: string
      type: string
    }
    highestOfferCash?: { 
      amount: number
      offererRef: string
      offerreference: string
      at: string
      type: string
    }
    quantity: number
    expiresAt: string
    status?: string
  } | null
}

interface Offer {
  id: string
  offerer: string
  amount: number
  createdAt: string
  status: string
}

export default function ListingDetailModal({ isOpen, onClose, listing }: ListingDetailModalProps) {
  const [accepting, setAccepting] = useState(false)

  const acceptOffer = async (offerType: 'cash' | 'point') => {
    if (!listing || listing.status === 'accepted') return
    
    setAccepting(true)
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1'
      const authHeaders = await getAuthHeaders()
      
      const response = await fetch(`${apiBaseUrl}/marketplace/listings/${listing.id}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          offer_type: offerType
        })
      })
      
      if (response.ok) {
        toastSuccess('Offer accepted successfully!')
        onClose()
      } else {
        const error = await response.json()
        toast.error(`Failed to accept offer: ${error.detail || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Failed to accept offer:', error)
      toast.error('Failed to accept offer')
    } finally {
      setAccepting(false)
    }
  }

  if (!listing) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex min-h-screen items-end justify-center p-0 text-center sm:items-center sm:p-4">
            {/* Background overlay */}
            <div className="fixed inset-0 bg-black bg-opacity-70" onClick={onClose} />
            
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative inline-block w-full max-w-4xl transform overflow-hidden rounded-t-2xl sm:rounded-2xl text-left align-bottom transition-all sm:my-8 sm:align-middle max-h-[90vh] sm:max-h-[85vh]"
              style={{
                background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
                border: '2px solid #8B5CF6'
              }}
            >
            {/* Header */}
            <div className="relative p-4 md:p-6 text-center border-b border-gray-700">
              <h2 className="text-xl md:text-2xl font-bold text-white">
                Listing Details
              </h2>
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 md:top-6 md:right-6 text-white hover:text-gray-300 transition-colors"
              >
                <img src="/icons/close.png" alt="Close" width={24} height={24} />
              </button>
            </div>

            <div className="p-4 md:p-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 5rem)' }}>
              {/* Card info section */}
              <div className="flex flex-col md:flex-row gap-4 md:gap-6">
                <div className="w-full md:w-1/4 mx-auto max-w-[200px] md:max-w-none">
                  <div className="aspect-[3/4] rounded-lg overflow-hidden border border-purple-500/30 shadow-lg">
                    <img 
                      src={listing.image_url || '/cards/card1.jpg'} 
                      alt={listing.card_name} 
                      className="w-full h-full object-contain bg-gradient-to-b from-[#3F3F5F] to-[#2A2B3D]"
                    />
                  </div>
                </div>
                
                <div className="flex-1">
                  <h3 className="text-lg md:text-2xl font-bold text-white mb-4 text-center md:text-left">{listing.card_name}</h3>
                  
                  {/* Listing Prices */}
                  <div className="mb-4">
                    <h4 className="text-sm text-gray-400 mb-2">Listing Prices</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-[#2A2B3D] rounded-lg p-3">
                        <div className="text-gray-400 text-xs mb-1">Cash Price</div>
                        <div className="text-green-400 font-bold text-lg">${listing.priceCash || 0}</div>
                      </div>
                      
                      <div className="bg-[#2A2B3D] rounded-lg p-3">
                        <div className="text-gray-400 text-xs mb-1">Points Price</div>
                        <div className="text-yellow-400 font-bold text-lg flex items-center gap-1">
                          <img src="/users/coin.png" alt="Points" className="w-4 h-4" />
                          {listing.pricePoints || 0}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Highest Offers */}
                  <div>
                    <h4 className="text-sm text-gray-400 mb-2">Highest Offers</h4>
                    
                    {listing.status === 'accepted' && (
                      <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3 mb-3 text-sm">
                        <p className="text-red-400 text-center">This listing has already been accepted</p>
                      </div>
                    )}
                    
                    <div className="grid grid-cols-2 gap-3">
                      {/* Highest Cash Offer */}
                      {listing.priceCash && listing.priceCash > 0 ? (
                        <div className="bg-[#2A2B3D] rounded-lg p-3">
                          <div className="text-gray-400 text-xs mb-1">Cash Offer</div>
                          {listing.highestOfferCash ? (
                            <>
                              <div className="text-green-400 font-bold text-lg mb-2">${listing.highestOfferCash.amount}</div>
                              {listing.status !== 'accepted' && (
                                <button
                                  onClick={() => acceptOffer('cash')}
                                  disabled={accepting}
                                  className="w-full px-3 py-1.5 bg-green-600 text-white rounded text-xs hover:bg-green-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {accepting ? 'Accepting...' : 'Accept'}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-500 text-sm">No offers</div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#2A2B3D] rounded-lg p-3 opacity-50">
                          <div className="text-gray-400 text-xs mb-1">Cash Offer</div>
                          <div className="text-gray-500 text-sm">N/A</div>
                        </div>
                      )}
                      
                      {/* Highest Points Offer */}
                      {listing.pricePoints && listing.pricePoints > 0 ? (
                        <div className="bg-[#2A2B3D] rounded-lg p-3">
                          <div className="text-gray-400 text-xs mb-1">Points Offer</div>
                          {listing.highestOfferPoints ? (
                            <>
                              <div className="text-yellow-400 font-bold text-lg flex items-center gap-1 mb-2">
                                <img src="/users/coin.png" alt="Points" className="w-4 h-4" />
                                {listing.highestOfferPoints.amount}
                              </div>
                              {listing.status !== 'accepted' && (
                                <button
                                  onClick={() => acceptOffer('point')}
                                  disabled={accepting}
                                  className="w-full px-3 py-1.5 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {accepting ? 'Accepting...' : 'Accept'}
                                </button>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-500 text-sm">No offers</div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-[#2A2B3D] rounded-lg p-3 opacity-50">
                          <div className="text-gray-400 text-xs mb-1">Points Offer</div>
                          <div className="text-gray-500 text-sm">N/A</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>
  )
}