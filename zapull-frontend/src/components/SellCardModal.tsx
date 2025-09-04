'use client'

import React, { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { UserCard } from '@/lib/userApi'
import styles from './CardDetailModal.module.css'
import marketplaceApi from '../lib/marketplaceApi'
import { useAuthStore } from '../store/authStore'
import { paymentApi } from '../lib/paymentApi'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

interface SellCardModalProps {
  card: UserCard | null
  collectionId: string | null
  isOpen: boolean
  onClose: () => void
  onSell?: (price: number, card: UserCard) => void
}

export default function SellCardModal({ card, collectionId, isOpen, onClose, onSell }: SellCardModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [pointsPrice, setPointsPrice] = useState('')
  const [cashPrice, setCashPrice] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [enablePoints, setEnablePoints] = useState(true)
  const [enableCash, setEnableCash] = useState(false)
  const [stripeStatus, setStripeStatus] = useState<'not_connected' | 'incomplete' | 'ready' | null>(null)
  const [checkingStripe, setCheckingStripe] = useState(false)
  const { uid: userId } = useAuthStore()

  // ESC key to close modal
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

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setPointsPrice('')
      setCashPrice('')
      setEnablePoints(true)
      setEnableCash(false)
      setStripeStatus(null)
    }
  }, [isOpen])

  // Check Stripe Connect status when cash is enabled
  useEffect(() => {
    const checkStripeStatus = async () => {
      if (enableCash && userId && !stripeStatus) {
        setCheckingStripe(true)
        try {
          const response = await paymentApi.getStripeConnectStatus()
          setStripeStatus(response.status)
        } catch (error) {
          console.error('Failed to check Stripe Connect status:', error)
          // Don't block the user from trying to create a listing
        } finally {
          setCheckingStripe(false)
        }
      }
    }

    checkStripeStatus()
  }, [enableCash, userId, stripeStatus])

  // Handle listing creation
  const handleSell = async () => {
    if (!card || !userId) return
    
    // Check at least one price is set
    if (!enablePoints && !enableCash) {
      toast.error('Please select at least one pricing method')
      return
    }
    
    // Validate prices
    const points = enablePoints ? parseFloat(pointsPrice) : 0
    const cash = enableCash ? parseFloat(cashPrice) : 0
    
    if (enablePoints && (isNaN(points) || points <= 0)) {
      toast.error('Please enter a valid points price')
      return
    }
    
    if (enableCash && (isNaN(cash) || cash <= 0)) {
      toast.error('Please enter a valid cash price')
      return
    }
    
    setIsLoading(true)
    try {
      let pointsListingCreated = false
      let cashListingCreated = false
      let stripeConnectRequired = false
      let onboardingUrl = ''
      
      // Create a single listing with both point and cash prices if enabled
      const response = await marketplaceApi.createListing({
        card_id: card.id,
        collection_id: collectionId || card.collection_id,
        quantity: 1,
        pricePoints: enablePoints ? points : null,
        priceCash: enableCash ? cash : null
      })
      
      // Check if Stripe Connect is required for cash listings
      if (response.onboarding_url && !response.listing) {
        stripeConnectRequired = true
        onboardingUrl = response.onboarding_url
        
        // Show message about Stripe Connect requirement
        const message = response.stripe_connect_status === 'not_connected' 
          ? 'You need to set up a Stripe account to sell for cash. Click OK to continue with the setup.'
          : 'You need to complete your Stripe account setup to sell for cash. Click OK to continue.'
        
        if (confirm(message)) {
          // Try to open Stripe onboarding in new tab
          const newWindow = window.open(onboardingUrl, '_blank')
          
          // Check if popup was blocked
          if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
            // Popup was blocked, redirect in current window
            toast('Pop-up was blocked. You will be redirected to complete Stripe setup. Please return to this page after completing the setup.', { 
              icon: 'ℹ️',
              duration: 5000 
            })
            window.location.href = onboardingUrl
          }
        }
      } else if (response.listing) {
        // Listing was created successfully
        if (enablePoints && points > 0) {
          pointsListingCreated = true
        }
        if (enableCash && cash > 0) {
          cashListingCreated = true
        }
      }
      
      // Build success message based on what was actually created
      if (pointsListingCreated || cashListingCreated) {
        const priceDisplayParts = []
        if (pointsListingCreated) {
          priceDisplayParts.push(`Points: ${points.toFixed(2)}`)
        }
        if (cashListingCreated) {
          priceDisplayParts.push(`Cash: $${cash.toFixed(2)}`)
        }
        
        toastSuccess(`Successfully listed ${card.card_name} for ${priceDisplayParts.join(' | ')}`)
        console.log('Listed card:', card.card_name, 'Points listing:', pointsListingCreated, 'Cash listing:', cashListingCreated)
        
        if (pointsListingCreated) {
          onSell?.(points, card)
        }
        onClose()
      } else if (stripeConnectRequired && !pointsListingCreated) {
        // Only cash was attempted and Stripe Connect is required
        // Keep modal open so user can try again after completing Stripe setup
        toast.error('Please complete your Stripe setup and try again.')
      }
    } catch (error) {
      console.error('Listing failed:', error)
      toast.error('Failed to create listing. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  if (!isOpen || !card) return null

  // Get rarity text and style class based on rarity level
  const getRarityInfo = (rarity: number) => {
    switch (rarity) {
      case 1: return { text: 'Common', className: styles.rarityCommon }
      case 2: return { text: 'Uncommon', className: styles.rarityUncommon }
      case 3: return { text: 'Rare', className: styles.rarityRare }
      case 4: return { text: 'Epic', className: styles.rarityEpic }
      case 5: return { text: 'Legendary', className: styles.rarityLegendary }
      default: return { text: 'Unknown', className: '' }
    }
  }
  
  const rarityInfo = getRarityInfo(card.rarity)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-2 sm:p-4">
      <div 
        ref={modalRef}
        className="relative w-full max-w-[95vw] sm:max-w-[75rem] max-h-[95vh] overflow-hidden"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '12px',
          border: '2px solid #8B5CF6'
        }}
      >
        {/* Modal header */}
        <div className="relative p-3 sm:p-4 text-center border-b border-gray-700">
          <h2 className="text-lg sm:text-2xl font-bold text-white pr-8">List Card - {card.card_name}</h2>
          <button 
            onClick={onClose}
            className="absolute top-3 sm:top-4 right-3 sm:right-4 text-white hover:text-gray-300 transition-colors z-10 p-1"
          >
            <Image src="/icons/close.png" alt="Close" width={20} height={20} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-80px)]">
          <div className="p-3 sm:p-6 flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* Card image */}
          <div className={`w-full lg:w-1/3 aspect-[3/4] max-w-[280px] mx-auto lg:mx-0 relative rounded-md overflow-hidden flex-shrink-0 ${styles.cardImageContainer} ${styles[`imageContainerRarity${card.rarity}`] || 'border border-gray-700'}`}>
            {card.image_url ? (
              <Image 
                src={card.image_url} 
                alt={card.card_name} 
                fill
                className="object-cover"
                priority
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400">
                No Image
              </div>
            )}
          </div>

          {/* Card details and pricing container */}
          <div className="flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6">
            {/* Card details */}
            <div className="flex-1 text-white">
              <h3 className="text-lg sm:text-xl font-bold mb-3 sm:mb-4 lg:hidden">{card.card_name}</h3>
              
              <div className="space-y-3 sm:space-y-4">
                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Condition</div>
                  <div className="text-sm sm:text-lg">{card.condition || 'Mint'}</div>
                </div>
                
                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Collection</div>
                  <div className="text-sm sm:text-lg">{card.subcollection_name || collectionId || 'Unknown'}</div>
                </div>
                
                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Quantity</div>
                  <div className="text-sm sm:text-lg">{card.quantity}</div>
                </div>
                
                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Point Worth</div>
                  <div className="flex items-center gap-2">
                    <img src="/users/coin.png" alt="Coin" className="w-4 h-4 sm:w-5 sm:h-5" />
                    <span className="text-yellow-400 font-bold text-sm sm:text-lg">
                      {card.point_worth?.toFixed(2) || '0.00'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Listing price area */}
            <div className="w-full lg:w-1/3 flex-shrink-0 space-y-3 sm:space-y-4">
              <div className="text-base sm:text-lg font-bold text-white mb-2">Set Listing Price</div>
              <div className="text-gray-400 text-xs sm:text-sm mb-3 sm:mb-4">You can set both points and cash prices</div>
              
              {/* Points price setting */}
              <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enablePoints}
                      onChange={(e) => setEnablePoints(e.target.checked)}
                      className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                    />
                    <span className="text-white font-medium text-sm sm:text-base">Points Price</span>
                  </label>
                  <div className="text-xs sm:text-sm text-gray-400">
                    Suggested: {(card.point_worth * 0.9).toFixed(2)}
                  </div>
                </div>
                {enablePoints && (
                  <div className="relative">
                    <img src="/users/coin.png" alt="Points" className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5" />
                    <input
                      type="number"
                      value={pointsPrice}
                      onChange={(e) => setPointsPrice(e.target.value)}
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-full bg-gray-700 text-yellow-400 text-sm sm:text-lg font-bold py-2 sm:py-3 pl-8 sm:pl-10 pr-3 sm:pr-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>
            
              {/* Cash price setting */}
              <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                <div className="flex items-center justify-between mb-2 sm:mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableCash}
                      onChange={(e) => setEnableCash(e.target.checked)}
                      className="w-3 h-3 sm:w-4 sm:h-4 text-purple-600 bg-gray-700 border-gray-600 rounded focus:ring-purple-500"
                    />
                    <span className="text-white font-medium text-sm sm:text-base">Cash Price</span>
                  </label>
                  <div className="text-xs sm:text-sm text-gray-400">
                    Suggested: ${(card.point_worth * 0.01).toFixed(2)}
                  </div>
                </div>
                {enableCash && (
                  <>
                    <div className="relative">
                      <span className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-white text-sm sm:text-lg">$</span>
                      <input
                        type="number"
                        value={cashPrice}
                        onChange={(e) => setCashPrice(e.target.value)}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        className="w-full bg-gray-700 text-white text-sm sm:text-lg font-bold py-2 sm:py-3 pl-6 sm:pl-8 pr-3 sm:pr-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                      />
                  </div>
                  
                    {/* Stripe Connect Status Indicator */}
                    {checkingStripe && (
                      <div className="mt-2 text-xs sm:text-sm text-gray-400">
                        Checking payment setup...
                      </div>
                    )}
                    
                    {!checkingStripe && stripeStatus && stripeStatus !== 'ready' && (
                      <div className="mt-2 p-2 bg-yellow-900 bg-opacity-50 border border-yellow-600 rounded text-xs sm:text-sm">
                        <div className="flex flex-col gap-2">
                          <div className="flex items-start gap-2">
                            <span className="text-yellow-400 text-sm">⚠️</span>
                            <span className="text-yellow-300 flex-1">
                              {stripeStatus === 'not_connected' 
                                ? 'You need to set up a Stripe account to receive cash payments. Note: Stripe verification may take some time to complete.'
                                : 'Complete your Stripe account setup to receive cash payments. Note: Stripe verification may take some time to complete.'
                              }
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                const response = await paymentApi.createStripeConnect()
                                if (response.onboarding_url) {
                                  // Try popup first
                                  const newWindow = window.open(response.onboarding_url, '_blank')
                                  if (!newWindow || newWindow.closed) {
                                    // Fallback to redirect
                                    window.location.href = response.onboarding_url
                                  }
                                }
                              } catch (error) {
                                console.error('Failed to create Stripe Connect:', error)
                                toast.error('Failed to start Stripe setup. Please try again.')
                              }
                            }}
                            className="text-xs bg-yellow-600 hover:bg-yellow-700 text-white px-2 sm:px-3 py-1 rounded transition-colors w-full sm:w-auto"
                          >
                            Set Up Stripe Account
                          </button>
                        </div>
                      </div>
                    )}
                    
                    {!checkingStripe && stripeStatus === 'ready' && (
                      <div className="mt-2 text-xs sm:text-sm text-green-400">
                        ✓ Stripe account ready for cash payments
                      </div>
                    )}
                </>
              )}
            </div>
            
              {/* Fee information */}
              {(enablePoints || enableCash) && (
                <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                  <div className="text-gray-400 text-xs sm:text-sm mb-2">Fee Details</div>
                  <div className="space-y-2 sm:space-y-3">
                    {enablePoints && pointsPrice && (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400 uppercase">Points Transaction</div>
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-400">Price:</span>
                          <div className="flex items-center gap-1">
                            <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="text-yellow-400">{pointsPrice}</span>
                          </div>
                        </div>
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-400">Platform Fee (7%):</span>
                          <div className="flex items-center gap-1">
                            <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="text-red-400">-{(parseFloat(pointsPrice) * 0.07).toFixed(2)}</span>
                          </div>
                        </div>
                        <div className="flex justify-between font-bold text-xs sm:text-sm pt-1">
                          <span className="text-gray-300">You Will Receive:</span>
                          <div className="flex items-center gap-1">
                            <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="text-green-400">{(parseFloat(pointsPrice) * 0.93).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {enablePoints && enableCash && pointsPrice && cashPrice && (
                      <div className="border-t border-gray-600 my-2"></div>
                    )}
                    
                    {enableCash && cashPrice && (
                      <div className="space-y-1">
                        <div className="text-xs text-gray-400 uppercase">Cash Transaction</div>
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-400">Price:</span>
                          <span className="text-white">${cashPrice}</span>
                        </div>
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-400">Platform Fee (7%):</span>
                          <span className="text-red-400">-${(parseFloat(cashPrice) * 0.07).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-400">Stripe Fee (3%):</span>
                          <span className="text-red-400">-${(parseFloat(cashPrice) * 0.03).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-xs sm:text-sm">
                          <span className="text-gray-400">Total Fees:</span>
                          <span className="text-red-400">-${(parseFloat(cashPrice) * 0.10).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-xs sm:text-sm pt-1">
                          <span className="text-gray-300">You Will Receive:</span>
                          <span className="text-green-400">${(parseFloat(cashPrice) * 0.90).toFixed(2)}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Submit button */}
              <button 
                onClick={handleSell}
                disabled={isLoading || (!enablePoints && !enableCash) || (enablePoints && !pointsPrice) || (enableCash && !cashPrice)}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-2 sm:py-3 px-3 sm:px-4 rounded-lg text-sm sm:text-base transition-colors"
              >
                {isLoading ? 'Listing...' : 'Confirm Listing'}
              </button>
              
              <div className="text-gray-400 text-xs text-center leading-relaxed">
                {enablePoints && enableCash 
                  ? 'Other players can purchase your card with points or cash after listing' 
                  : enablePoints
                  ? 'Other players can purchase your card with points after listing'
                  : 'Other players can purchase your card with cash after listing'
                }
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  )
}