'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { cardsApi, CardDetails } from '@/lib/cardsApi'
import InventoryCardDetailModal from '@/components/InventoryCardDetailModal'
import { UserCard } from '@/lib/userApi'
import toast from 'react-hot-toast'

// Convert CardDetails from API to UserCard format for the modal
const convertToUserCard = (cardDetails: CardDetails): UserCard => {
  return {
    id: cardDetails.id,
    card_name: cardDetails.card_name || cardDetails.name || 'Unknown Card',
    image_url: cardDetails.image_url || '',
    point_worth: cardDetails.point_worth || 0,
    quantity: 1, // Default quantity since this is a single card view
    rarity: cardDetails.rarity || 1,
    subcollection_name: cardDetails.collection_name || 'Unknown Collection',
    buybackexpiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(), // Default 10 days from now
    locked_quantity: 0,
    request_date: new Date().toISOString(),
    condition: cardDetails.condition || 'Mint'
  }
}

export default function CardDetailPage() {
  const params = useParams()
  const router = useRouter()
  const cardId = params.cardId as string
  
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cardData, setCardData] = useState<UserCard | null>(null)
  const [showModal, setShowModal] = useState(false)
  
  useEffect(() => {
    const fetchCardDetails = async () => {
      if (!cardId) return
      
      try {
        setLoading(true)
        setError('')
        
        // Extract collection name from URL params if available
        const searchParams = new URLSearchParams(window.location.search)
        const collectionName = searchParams.get('collection_name')
        
        const cardDetails = await cardsApi.getCardById(cardId, collectionName || undefined)
        
        const userCardData = convertToUserCard(cardDetails)
        setCardData(userCardData)
        
        // Show modal immediately after loading
        setShowModal(true)
        
      } catch (err) {
        console.error('Failed to fetch card details:', err)
        setError('Failed to load card details. Please try again.')
        toast.error('Failed to load card details')
      } finally {
        setLoading(false)
      }
    }
    
    fetchCardDetails()
  }, [cardId])
  
  const handleCloseModal = () => {
    setShowModal(false)
    // Navigate back or to a default page when modal closes
    router.back()
  }
  
  const handleSell = (card: UserCard) => {
    // This could redirect to sell page or show sell modal
    // For now, just show a toast since this is a public card view
    toast('Sell functionality not available for this card view', {
      icon: 'ℹ️'
    })
  }
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0B1A] via-[#1A1B2E] to-[#2A2B3D] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mx-auto mb-4"></div>
          <p>Loading card details...</p>
        </div>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0B1A] via-[#1A1B2E] to-[#2A2B3D] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="text-red-400 mb-4">
            <svg className="w-16 h-16 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }
  
  if (!cardData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0A0B1A] via-[#1A1B2E] to-[#2A2B3D] flex items-center justify-center">
        <div className="text-center text-white">
          <p className="mb-4">Card not found</p>
          <button
            onClick={() => router.back()}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <>
      {/* Background page - could show basic card info or redirect automatically */}
      <div className="min-h-screen bg-gradient-to-br from-[#0A0B1A] via-[#1A1B2E] to-[#2A2B3D] flex items-center justify-center">
        <div className="text-center text-white">
          <div className="max-w-sm mx-auto">
            <div className="mb-4">
              {cardData.image_url ? (
                <img 
                  src={cardData.image_url} 
                  alt={cardData.card_name}
                  className="w-48 h-64 object-contain mx-auto rounded-lg shadow-lg"
                />
              ) : (
                <div className="w-48 h-64 bg-gray-800 rounded-lg flex items-center justify-center mx-auto">
                  <span className="text-gray-400">No Image</span>
                </div>
              )}
            </div>
            <h1 className="text-2xl font-bold mb-2">{cardData.card_name}</h1>
            <p className="text-gray-400 mb-4">{cardData.subcollection_name}</p>
            <button
              onClick={() => setShowModal(true)}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors mr-3"
            >
              View Details
            </button>
            <button
              onClick={() => router.back()}
              className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
      
      {/* Use the same modal as inventory */}
      <InventoryCardDetailModal
        card={cardData}
        isOpen={showModal}
        onClose={handleCloseModal}
        onSell={handleSell}
      />
    </>
  )
}
