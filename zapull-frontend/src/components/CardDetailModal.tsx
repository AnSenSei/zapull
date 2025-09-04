'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { Card } from '@/lib/packsApi'
import styles from './CardDetailModal.module.css'
import MakeOfferModal from './MakeOfferModal'
import SelectAddressModal from './SelectAddressModal'
import MarketplacePaymentModal from './MarketplacePaymentModal'
import ConfirmActionModal from './ConfirmActionModal'
import InventoryCardDetailModal from './InventoryCardDetailModal'
import MarketplaceCardDetailModal, { MarketplaceCardDetails } from './MarketplaceCardDetailModal'
import marketplaceApi from '@/lib/marketplaceApi'
import paymentApi, { stripeUtils } from '@/lib/paymentApi'
import { getCurrentUserId } from '@/lib/authUtils'
import { userApi, UserCard } from '@/lib/userApi'
import { cardsApi, CardDetails } from '@/lib/cardsApi'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'
import { useAuthStore } from '@/store/authStore'
import { getImageProps } from '@/lib/image-loader'

interface CardDetailModalProps {
  card: Card | null
  isOpen: boolean
  onClose: () => void
  channel?: 'player' | 'official' // Channel type: player channel or official channel
  onPurchase?: (type: 'cash' | 'points', card: Card) => void // Purchase callback
  listingId?: string // Product listing ID (for player marketplace)
  userId?: string // User ID
  listing?: any // Original listing data, including owner_reference and other info
  collectionName?: string // Collection name
  isOfferView?: boolean // Whether viewing from offer management
  existingOffer?: any // Existing offer data if updating
}

export default function CardDetailModal({ card, isOpen, onClose, channel = 'player', onPurchase, listingId, userId, listing, collectionName, isOfferView = false, existingOffer }: CardDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [showOfferModal, setShowOfferModal] = useState(false)
  const [offerType, setOfferType] = useState<'points' | 'cash'>('points')
  const [isLoading, setIsLoading] = useState(false)
  const [sellerInfo, setSellerInfo] = useState<{ displayName: string; avatar: string } | null>(null)
  const [highestOffers, setHighestOffers] = useState<{ points: number | null; cash: number | null }>({ points: null, cash: null })
  const [showAddressModal, setShowAddressModal] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [selectedAddress, setSelectedAddress] = useState<string>('')
  const [confirmState, setConfirmState] = useState<{ open: boolean; type: 'points' | 'cash' | null }>(() => ({ open: false, type: null }))
  const [showCardDetails, setShowCardDetails] = useState(false)
  
  // Marketplace card detail modal states
  const [showMarketplaceModal, setShowMarketplaceModal] = useState(false)
  const [marketplaceCardData, setMarketplaceCardData] = useState<MarketplaceCardDetails | null>(null)
  const [fetchingCardDetails, setFetchingCardDetails] = useState(false)
  
  // Auth store for checking authentication and opening login modal
  const { uid, openLoginModal, setUserInfo } = useAuthStore()
  
  // Refresh user data to update points balance
  const refreshUserData = async () => {
    if (!uid) return
    
    try {
      const updatedUserInfo = await userApi.getUserInfo()
      setUserInfo(updatedUserInfo)
    } catch (error) {
      console.error('Failed to refresh user info:', error)
    }
  }

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

  // Reset data when modal opens and handle body scroll lock without losing scroll position
  useEffect(() => {
    if (isOpen) {
      setDetailsExpanded(false)
      setShowOfferModal(false)
      setShowAddressModal(false)
      setShowPaymentModal(false)
      setSelectedAddress('')
      // Only reset seller info if we don't have listing data to avoid unnecessary re-fetches
      if (!listing?.owner_reference) {
        setSellerInfo(null)
      }
      // Only reset highest offers if we don't have listing data
      if (!listing) {
        setHighestOffers({ points: null, cash: null })
      }

      // Lock body scroll while preserving current position
      if (typeof window !== 'undefined') {
        const scrollY = window.scrollY || window.pageYOffset
        // Store the scroll position on the body dataset for restoration if needed
        ;(document.body as any).dataset.scrollY = String(scrollY)
        document.body.style.position = 'fixed'
        document.body.style.top = `-${scrollY}px`
        document.body.style.left = '0'
        document.body.style.right = '0'
        document.body.style.width = '100%'
      }
    } else {
      // Unlock body scroll and restore position
      if (typeof window !== 'undefined') {
        const top = document.body.style.top
        // Clear styles first to avoid interfering with scroll
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.width = ''

        if (top) {
          const y = -parseInt(top || '0', 10) || 0
          window.scrollTo({ top: y, left: 0, behavior: 'auto' })
        }
        delete (document.body as any).dataset.scrollY
      }
    }

    return () => {
      // Ensure cleanup if component unmounts while open
      if (typeof window !== 'undefined') {
        const top = document.body.style.top
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.width = ''
        if (top) {
          const y = -parseInt(top || '0', 10) || 0
          window.scrollTo({ top: y, left: 0, behavior: 'auto' })
        }
        delete (document.body as any).dataset.scrollY
      }
    }
  }, [isOpen, listing])

  // Fetch seller info
  useEffect(() => {
    const fetchSellerInfo = async () => {
      if (!isOpen || !card || !listing?.owner_reference || channel !== 'player') return

      try {
        const sellerData = await userApi.getUserByReference(listing.owner_reference)
        if (sellerData) {
          setSellerInfo({
            displayName: sellerData.nickname || sellerData.username || listing.owner_reference,
            avatar: sellerData.avatar_url || ''
          })
        }
      } catch (error) {
        console.error('Failed to fetch seller info:', error)
      }
    }

    fetchSellerInfo()
  }, [isOpen, card, listing?.owner_reference, channel])

  // Set highest offers from listing data
  useEffect(() => {
    if (listing && channel === 'player') {
      const pointsOffer = listing.highestOfferPoints?.amount
      const cashOffer = listing.highestOfferCash?.amount
      
      setHighestOffers({
        points: typeof pointsOffer === 'number' ? pointsOffer : null,
        cash: typeof cashOffer === 'number' ? cashOffer : null
      })
    }
  }, [listing, channel])

  // Handle points purchase (opens confirmation)
  const handlePointsPurchase = async () => {
    if (!card || isLoading) return

    // Check if user is authenticated
    if (!uid) {
      toast('Please sign in to make a purchase', { icon: 'ℹ️', duration: 3000 })
      openLoginModal()
      return
    }

    // Open confirmation modal; actual purchase happens on confirm
    setConfirmState({ open: true, type: 'points' })
  }

  // Execute the actual points purchase after confirmation
  const executePointsPurchase = async () => {
    if (!card) return

    setIsLoading(true)
    try {
      if (channel === 'official') {
        // Official channel: buy from official listing
        const result = await marketplaceApi.buyFromOfficialListing({
          collection_id: card.collection_id || '',
          card_id: card.id,
          quantity: 1
        })
        
        // Backend returns the result directly without a success field
        // If we get here without an error, it was successful
        // Close modal first
        onClose()
        
        // Show success toast
        // Always show a consistent success message
        toastSuccess('Payment successful')
        
        // Call onPurchase callback
        if (onPurchase) {
          onPurchase('points', card)
        }
        
        // Refresh user data to update points balance
        await refreshUserData()
        // Refresh page after closing
        setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 300)
      } else {
        // Player channel: buy with points from user listing
        if (!listingId) {
          toast.error('Listing ID is required for player marketplace purchase')
          return
        }
        const result = await marketplaceApi.payWithPoints(listingId, 1)
        // Consider success when explicit success is true OR when we receive a transaction_id/message from backend (HTTP 200)
        if (result.success === true || result.transaction_id || result.message) {
          onClose()
          toastSuccess('Payment successful')
          if (onPurchase) {
            onPurchase('points', card)
          }
          
          // Refresh user data to update points balance
          await refreshUserData()
          // Refresh page after closing modal
          setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 300)
        } else {
          toast.error(result.message || 'Purchase failed')
        }
      }
    } catch (error: any) {
      console.error('Points purchase failed:', error)
      
      // Extract error message from axios response
      let errorMessage = 'Purchase failed, please try again'
      
      if (error.response?.data?.detail) {
        // Backend returns detailed error message
        errorMessage = error.response.data.detail
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message
      } else if (error.message) {
        errorMessage = error.message
      }
      
      // Handle some backends mistakenly returning a success message in error shape
      if (/successfully paid/i.test(errorMessage) || /success/i.test(errorMessage)) {
        try {
          onClose()
          toastSuccess('Payment successful')
          if (onPurchase && card) onPurchase('points', card)
          await refreshUserData()
          return
        } catch {}
      }
      // Show specific error message
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  // Handle cash purchase (opens confirmation)
  const handleCashPurchase = async () => {
    if (!card || isLoading) return
    
    // Check if user is authenticated
    if (!uid) {
      toast('Please sign in to make a purchase', { icon: 'ℹ️', duration: 3000 })
      openLoginModal()
      return
    }

    if (channel === 'official') {
      // Official channel: cash purchase not supported for official listings
      toast.error('Cash purchase is not available for official listings')
      return
    } else {
      // Player channel requires address selection for cash purchase
      if (!listingId) {
        toast.error('Listing ID is required for player marketplace purchase')
        return
      }

      // Open confirmation modal; on confirm, proceed to address/payment
      setConfirmState({ open: true, type: 'cash' })
    }
  }

  // Execute the actual cash flow after confirmation (address -> payment)
  const executeCashPurchase = async () => {
    if (!card) return
    // For cash, we proceed to address selection; actual payment happens in MarketplacePaymentModal
    setShowAddressModal(true)
  }

  // Handle address selection
  const handleAddressSelected = (addressId: string) => {
    setSelectedAddress(addressId)
    setShowAddressModal(false)
    setShowPaymentModal(true)
  }

  // Handle payment success
  const handlePaymentSuccess = async () => {
    setShowPaymentModal(false)
    // Call onPurchase callback to trigger data refresh
    if (onPurchase && card) {
      onPurchase('cash', card)
    }
    
    // Refresh user data to ensure all user info is up to date
    await refreshUserData()
    
    onClose()
    // Navigate back to marketplace page if not already there
    if (typeof window !== 'undefined' && !window.location.pathname.includes('/marketplace')) {
      window.location.href = '/marketplace'
    } else {
      // Refresh page to update listings and balances
      setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 300)
    }
  }
  
  // Convert CardDetails from API to UserCard format for the inventory modal
  const convertToUserCard = (cardDetails: CardDetails): UserCard => {
    return {
      id: cardDetails.id,
      card_name: cardDetails.card_name || cardDetails.name || card.name,
      image_url: cardDetails.image_url || card.image_url || '',
      point_worth: cardDetails.point_worth || card.point_worth || 0,
      quantity: 1, // Default quantity since this is a single card view
      rarity: cardDetails.rarity || card.rarity || 1,
      subcollection_name: cardDetails.collection_name || collectionName || 'Unknown Collection',
      buybackexpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // Default 10 days from now
      locked_quantity: 0,
      request_date: new Date().toISOString(),
      condition: cardDetails.condition || listing?.condition || 'Mint'
    }
  }

  // Handle card image click to fetch detailed card information and show inventory modal
  const handleCardImageClick = async () => {
    if (!card || fetchingCardDetails) return

    try {
      setFetchingCardDetails(true)
      toast('Loading detailed card information...', {
        icon: '⏳',
        duration: 1000
      })

      // Extract the card ID from card_reference (format: "collection/card-id") or use card.id as fallback
      let cardId = card.id
      let collectionForApi = collectionName || card.collection_id
      
      if (listing?.card_reference || (card as any).card_reference) {
        const cardRef = listing?.card_reference || (card as any).card_reference
        const parts = cardRef.split('/')
        if (parts.length > 1) {
          // Extract collection name and card ID from the reference
          collectionForApi = parts[0] // e.g., "pokemon"
          cardId = parts[parts.length - 1] // e.g., "4e910aa9-9ba6-47da-b857-60b00e6ffc60"
        }
      }

      // Use the extracted card ID and collection name to fetch detailed card info
      const cardDetails = await cardsApi.getCardById(cardId, collectionForApi)
      
      // Convert to MarketplaceCardDetails format and show marketplace modal
      const marketplaceCardData: MarketplaceCardDetails = {
        id: cardDetails.id,
        name: cardDetails.name,
        card_name: cardDetails.card_name,
        image_url: cardDetails.image_url || card.image_url || '',
        condition: cardDetails.condition || listing?.condition || 'Mint',
        collection_name: cardDetails.collection_name || collectionForApi || 'Unknown Collection',
        point_worth: cardDetails.point_worth || card.point_worth || 0,
        rarity: cardDetails.rarity || card.rarity || 1,
        document_id: cardDetails.document_id,
        collection_id: cardDetails.collection_id,
        signed_image_url: cardDetails.signed_image_url,
        probability: cardDetails.probability,
        cash_worth: cardDetails.cash_worth || card.cash_worth || 0,
        globalRef: cardDetails.globalRef,
        used_in_fusion: (cardDetails as any).used_in_fusion || [] // Include fusion data
      }
      setMarketplaceCardData(marketplaceCardData)
      setShowMarketplaceModal(true)
      
    } catch (error) {
      console.error('Failed to fetch card details:', error)
      toast.error('Failed to load detailed card information')
      
      // Fallback: create UserCard data from existing card information
      const fallbackUserCard: UserCard = {
        id: card.id,
        card_name: card.name,
        image_url: card.image_url || '',
        point_worth: card.point_worth || 0,
        quantity: 1,
        rarity: card.rarity || 1,
        subcollection_name: collectionName || 'Unknown Collection',
        buybackexpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        locked_quantity: 0,
        request_date: new Date().toISOString(),
        condition: listing?.condition || 'Mint'
      }
      setInventoryCardData(fallbackUserCard)
      setShowInventoryModal(true)
    } finally {
      setFetchingCardDetails(false)
    }
  }

  // Handle inventory modal sell (placeholder - marketplace cards aren't owned by user)
  const handleInventorySell = (card: UserCard) => {
    toast('Sell functionality not available for marketplace cards', {
      icon: 'ℹ️',
      duration: 3000
    })
  }

  // Handle make offer with authentication check
  const handleMakeOffer = (type: 'points' | 'cash') => {
    // Check if user is authenticated
    if (!uid) {
      toast('Please sign in to make an offer', {
        icon: 'ℹ️',
        duration: 3000
      })
      openLoginModal()
      return
    }
    
    setOfferType(type)
    setShowOfferModal(true)
  }

  if (!isOpen || !card) return null

  // Get rarity info
  const getRarityInfo = (rarity: number) => {
    switch (rarity) {
      case 1: return { text: '普通', className: styles.rarityCommon }
      case 2: return { text: '稀有', className: styles.rarityUncommon }
      case 3: return { text: '超稀有', className: styles.rarityRare }
      case 4: return { text: '史诗', className: styles.rarityEpic }
      case 5: return { text: '传说', className: styles.rarityLegendary }
      default: return { text: '未知', className: '' }
    }
  }
  
  const rarityInfo = getRarityInfo(card.rarity)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-2 sm:p-4">
        <div 
          ref={modalRef}
          className="relative w-full max-w-[90vw] sm:max-w-[75rem] my-auto"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '8px',
          border: '1px solid #8B5CF6'
        }}
      >
        {/* Modal title */}
        <div className="relative p-2 sm:p-4 text-center border-b border-gray-700">
          <h2 className="text-base sm:text-2xl font-bold text-white pr-6">{card.name}</h2>
          <button 
            onClick={onClose}
            className="absolute top-2 sm:top-4 right-2 sm:right-4 text-white hover:text-gray-300 transition-colors z-10 p-0.5"
          >
            <Image src="/icons/close.png" alt="Close" width={16} height={16} className="sm:w-6 sm:h-6" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[65vh] sm:max-h-[calc(90vh-80px)]">
          <div className="p-2 sm:p-6 flex flex-col lg:flex-row gap-3 sm:gap-6">
            {/* Card image - clickable */}
            <div
              className={`w-full lg:w-1/3 aspect-[3/4] max-w-[200px] sm:max-w-[280px] mx-auto lg:mx-0 relative rounded-md overflow-hidden flex-shrink-0 p-3 cursor-pointer hover:scale-105 transition-transform ${fetchingCardDetails ? 'opacity-50' : ''} ${styles.cardImageContainer} ${styles[`imageContainerRarity${card.rarity}`] || 'border border-gray-700'}`}
              onClick={handleCardImageClick}
              style={{
                background:
                  'linear-gradient(135deg, rgba(42,43,71,0.95) 0%, rgba(30,31,53,0.95) 100%), \
radial-gradient(2px 2px at 20% 25%, rgba(255,255,255,0.12) 50%, transparent 51%), \
radial-gradient(1.5px 1.5px at 70% 35%, rgba(255,255,255,0.10) 50%, transparent 51%), \
radial-gradient(1.5px 1.5px at 40% 80%, rgba(255,255,255,0.10) 50%, transparent 51%), \
radial-gradient(2px 2px at 85% 60%, rgba(255,255,255,0.12) 50%, transparent 51%), \
radial-gradient(1px 1px at 15% 70%, rgba(255,255,255,0.08) 50%, transparent 51%)'
              }}
            >
              {card.image_url ? (
                <Image 
                  src={card.image_url} 
                  alt={card.name} 
                  fill
                  className="object-contain"
                  priority
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  无图片
                </div>
              )}
              {/* Click indicator */}
              <div className="absolute top-2 right-2 bg-black bg-opacity-50 rounded-full p-1 opacity-0 hover:opacity-100 transition-opacity">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
                </svg>
              </div>
            </div>

            {/* Card details and purchase options container */}
            <div className="flex-1 flex flex-col lg:flex-row gap-3 sm:gap-6">
              {/* Card details */}
              <div className="flex-1 text-white">
                <div className="space-y-2 sm:space-y-4">
                  <div>
                    <div className="text-gray-400 text-[10px] sm:text-sm mb-0.5">Collection</div>
                    <div className="text-xs sm:text-lg">{collectionName || card.collection_id || 'Unknown'}</div>
                  </div>
                  
                  <div>
                    <div className="text-gray-400 text-[10px] sm:text-sm mb-0.5">Condition</div>
                    <div className="text-xs sm:text-lg">{listing?.condition || card.condition || 'Mint'}</div>
                  </div>
                  
                  {listing?.owner_reference && (
                    <div>
                      <div className="text-gray-400 text-[10px] sm:text-sm mb-0.5">Seller</div>
                      <div className="flex items-center gap-1.5">
                        <Image 
                          {...getImageProps(sellerInfo?.avatar)}
                          alt={sellerInfo?.displayName || 'Seller'} 
                          width={16} 
                          height={16} 
                          className="rounded-full sm:w-6 sm:h-6"
                        />
                        <span className="text-xs sm:text-lg">{sellerInfo?.displayName || 'Loading...'}</span>
                      </div>
                    </div>
                  )}
                  
                  {channel === 'official' && (
                    <div>
                      <div className="text-gray-400 text-[10px] sm:text-sm mb-0.5">Seller</div>
                      <div className="text-xs sm:text-lg">Official Store</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Purchase options */}
              <div className="w-full lg:w-1/3 flex-shrink-0 space-y-2 sm:space-y-4">
                {/* Points purchase option - available for all channels when point_worth > 0 */}
                {card.point_worth > 0 && (
                  <div className="bg-gray-800 rounded-md p-2 sm:p-4">
                    <div className="flex items-center justify-between mb-1.5 sm:mb-3">
                      <span className="text-orange-400 text-sm sm:text-lg font-bold">● {card.point_worth}</span>
                      <span className="text-orange-400 text-[10px] sm:text-sm">points</span>
                    </div>
                  <button 
                    onClick={handlePointsPurchase}
                    disabled={isLoading}
                    className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-1.5 px-2 sm:px-4 rounded-md text-xs sm:text-base transition-colors"
                  >
                    {isLoading ? 'Processing...' : 'Buy now'}
                  </button>
                  {channel === 'player' && !isOfferView && (
                    <button 
                      onClick={() => handleMakeOffer('points')}
                      className="w-full mt-1.5 bg-gray-700 hover:bg-gray-600 text-white font-bold py-1.5 px-2 sm:px-4 rounded-md text-xs sm:text-base transition-colors"
                    >
                      Make an offer
                    </button>
                  )}
                  {channel === 'player' && (
                    <div className="flex items-center justify-between mt-2 text-[10px] sm:text-xs text-gray-400">
                      <span>Top offer</span>
                      {highestOffers.points !== null ? (
                        <div className="flex items-center gap-0.5">
                          <span className="text-orange-400">●</span>
                          <span>{highestOffers.points}</span>
                        </div>
                      ) : (
                        <span>No offer</span>
                      )}
                    </div>
                  )}
                  </div>
                )}

                {/* Cash purchase option - only for player channel and cash_worth > 0 */}
                {channel === 'player' && card.cash_worth && card.cash_worth > 0 && (
                  <div className="bg-gray-800 rounded-md p-2 sm:p-4">
                    <div className="flex items-center justify-between mb-1.5 sm:mb-3">
                      <span className="text-green-400 text-sm sm:text-lg font-bold">${card.cash_worth.toFixed(2)}</span>
                      <span className="text-green-400 text-[10px] sm:text-sm">USD</span>
                    </div>
                    <button 
                      onClick={handleCashPurchase}
                      disabled={isLoading}
                      className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold py-1.5 px-2 sm:px-4 rounded-md text-xs sm:text-base transition-colors mb-1.5"
                    >
                      {isLoading ? 'Processing...' : 'Buy now'}
                    </button>
                    {!isOfferView && (
                      <button 
                        onClick={() => handleMakeOffer('cash')}
                        className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-1.5 px-2 sm:px-4 rounded-md text-xs sm:text-base transition-colors"
                      >
                        Make an offer
                      </button>
                    )}
                    <div className="flex items-center justify-between mt-2 text-[10px] sm:text-xs text-gray-400">
                      <span>Top offer</span>
                      {highestOffers.cash !== null ? (
                        <span>${highestOffers.cash.toFixed(2)}</span>
                      ) : (
                        <span>No offer</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      </div>
      
      {/* Make Offer Modal */}
      <MakeOfferModal
        isOpen={showOfferModal}
        onClose={() => setShowOfferModal(false)}
        card={card}
        userId={userId}
        listingId={listingId}
        offerType={offerType}
        existingOffer={isOfferView ? existingOffer : undefined}
        onMakeOffer={(amount, duration) => {
          console.log(isOfferView ? 'Updating offer:' : 'Making offer:', { amount, duration, card: card.name })
          // Close this detail modal and refresh the page so listings reflect the new offer
          onClose()
          setTimeout(() => { if (typeof window !== 'undefined') window.location.reload() }, 300)
          // Also refresh user info to reflect any point holds etc.
          refreshUserData().catch(() => undefined)
        }}
      />

      {/* Address Selection Modal */}
      <SelectAddressModal
        isOpen={showAddressModal}
        onClose={() => setShowAddressModal(false)}
        onSelect={handleAddressSelected}
      />

      {/* Payment Modal */}
      <MarketplacePaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        listing={{
          id: listingId || '',
          card_name: card.name,
          image_url: card.image_url,
          priceCash: card.cash_worth
        }}
        buyerAddressId={selectedAddress}
        onSuccess={handlePaymentSuccess}
      />

      {/* Confirm Action Modal */}
      <ConfirmActionModal
        isOpen={confirmState.open}
        title="Confirm purchase"
        message={confirmState.type === 'points'
          ? `Are you sure you want to buy "${card.name}" for ${card.point_worth} points?`
          : `Are you sure you want to buy "${card.name}" for $${Number(card.cash_worth || 0).toFixed(2)}?`}
        confirmText="Confirm"
        cancelText="Cancel"
        onCancel={() => setConfirmState({ open: false, type: null })}
        onConfirm={async () => {
          const t = confirmState.type
          setConfirmState({ open: false, type: null })
          if (t === 'points') {
            await executePointsPurchase()
          } else if (t === 'cash') {
            await executeCashPurchase()
          }
        }}
      />
      
      {/* Expanded Card Details Modal */}
      {showCardDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-90 z-[60] flex items-center justify-center p-4">
          <div className="relative max-w-4xl max-h-[90vh] w-full">
            {/* Close button */}
            <button 
              onClick={() => setShowCardDetails(false)}
              className="absolute top-4 right-4 z-10 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full p-2 text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            
            {/* Card details content */}
            <div className="bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 rounded-lg p-6 max-h-full overflow-y-auto">
              <div className="flex flex-col lg:flex-row gap-6">
                {/* Large card image */}
                <div className="lg:w-1/2">
                  <div className={`aspect-[3/4] relative rounded-lg overflow-hidden ${styles[`imageContainerRarity${card.rarity}`] || 'border-2 border-gray-700'}`}>
                    {card.image_url ? (
                      <Image 
                        src={card.image_url} 
                        alt={card.name} 
                        fill
                        className="object-contain"
                        priority
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-400">
                        无图片
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Card information */}
                <div className="lg:w-1/2 text-white space-y-4">
                  <div>
                    <h3 className="text-2xl font-bold mb-2">{card.name}</h3>
                    <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${rarityInfo.className}`}>
                      {rarityInfo.text}
                    </div>
                  </div>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Collection:</span>
                      <span>{collectionName || card.collection_id || 'Unknown'}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-400">Condition:</span>
                      <span>{listing?.condition || card.condition || 'Mint'}</span>
                    </div>
                    
                    <div className="flex justify-between">
                      <span className="text-gray-400">Rarity:</span>
                      <span>{rarityInfo.text}</span>
                    </div>
                    
                    {card.point_worth > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Points Value:</span>
                        <span className="text-orange-400 font-bold">● {card.point_worth}</span>
                      </div>
                    )}
                    
                    {card.cash_worth && card.cash_worth > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Cash Value:</span>
                        <span className="text-green-400 font-bold">${card.cash_worth.toFixed(2)}</span>
                      </div>
                    )}
                    
                    {card.quantity && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Quantity:</span>
                        <span>{card.quantity}</span>
                      </div>
                    )}
                    
                    {listing?.owner_reference && sellerInfo && (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-400">Seller:</span>
                        <div className="flex items-center gap-2">
                          <Image 
                            {...getImageProps(sellerInfo.avatar)}
                            alt={sellerInfo.displayName} 
                            width={24} 
                            height={24} 
                            className="rounded-full"
                          />
                          <span>{sellerInfo.displayName}</span>
                        </div>
                      </div>
                    )}
                    
                    {channel === 'official' && (
                      <div className="flex justify-between">
                        <span className="text-gray-400">Seller:</span>
                        <span className="text-purple-400 font-medium">Official Store</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Additional card stats or description could go here */}
                  <div className="mt-6 p-4 bg-black bg-opacity-30 rounded-lg">
                    <h4 className="text-lg font-semibold mb-2">Card Details</h4>
                    <p className="text-gray-300 text-sm">
                      This {rarityInfo.text.toLowerCase()} card from the {collectionName || card.collection_id || 'Unknown'} collection 
                      is in {listing?.condition || card.condition || 'mint'} condition.
                      {card.point_worth > 0 && ` Valued at ${card.point_worth} points.`}
                      {card.cash_worth && card.cash_worth > 0 && ` Cash value: $${card.cash_worth.toFixed(2)}.`}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Marketplace Card Detail Modal */}
      <MarketplaceCardDetailModal
        card={marketplaceCardData}
        isOpen={showMarketplaceModal}
        onClose={() => {
          setShowMarketplaceModal(false)
          setMarketplaceCardData(null)
        }}
      />
    </div>
  )
}
