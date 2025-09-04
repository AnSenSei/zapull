'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { cardsApi } from '@/lib/cardsApi'

interface SimpleCardDetailModalProps {
  card: {
    id: string;
    name?: string;
    card_name?: string;
    card_reference?: string;
    image_url: string;
    condition?: string;
    collection_name?: string;
    subcollection_name?: string;
    card_collection_id?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: (cardId: string) => void;
  showDeleteButton?: boolean;
}

export default function SimpleCardDetailModal({ card, isOpen, onClose, onDelete, showDeleteButton = false }: SimpleCardDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [cardDetails, setCardDetails] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  // Fetch card details from API if needed
  useEffect(() => {
    const fetchCardDetails = async () => {
      if (!card || card.condition) {
        // If we already have condition, no need to fetch
        setCardDetails(card)
        return
      }

      setLoading(true)
      try {
        // Determine the card ID and collection to fetch
        let cardIdToFetch = card.id
        let collectionName = card.subcollection_name || card.collection_name || (card as any).card_collection_id
        
        // If we have a card_reference, parse it for both ID and collection
        if (card.card_reference && card.card_reference.includes('/')) {
          const parts = card.card_reference.split('/')
          if (parts.length >= 2) {
            // Only use the parsed collection if we don't already have one
            if (!collectionName) {
              collectionName = parts[0]
            }
            cardIdToFetch = parts[1]
          }
        }
        
        if (cardIdToFetch) {
          // Fetch from API - only pass collection name if we have it
          const apiCardData = await cardsApi.getCardById(cardIdToFetch, collectionName || undefined)
          
          setCardDetails({
            ...card,
            condition: apiCardData.condition || 'N/A',
            collection_name: apiCardData.collection_name || collectionName || 'Unknown Collection',
            card_name: apiCardData.card_name || apiCardData.name || card.card_name || card.name
          })
        } else {
          setCardDetails(card)
        }
      } catch (error) {
        console.error('Error fetching card details:', error)
        setCardDetails(card)
      } finally {
        setLoading(false)
      }
    }

    if (isOpen && card) {
      fetchCardDetails()
    }
  }, [card, isOpen])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  // ESC key to close
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

  if (!isOpen || !card) return null

  const displayCard = cardDetails || card
  const cardName = displayCard.card_name || displayCard.name || 'Unknown Card'
  const collection = displayCard.collection_name || displayCard.subcollection_name || 'Unknown Collection'
  const condition = displayCard.condition || 'N/A'
  const price = displayCard.point_worth || 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" />
      
      <div ref={modalRef} className="relative bg-[#2A2B3D] rounded-lg p-4 max-w-sm w-full mx-4">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        {/* Card Image */}
        <div className="mb-4">
          {loading ? (
            <div className="w-full aspect-[3/4] max-w-[250px] mx-auto bg-[#1E1F2E] rounded flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-purple-500"></div>
            </div>
          ) : displayCard.image_url ? (
            <div className="relative w-full aspect-[3/4] max-w-[250px] mx-auto">
              <Image
                src={displayCard.image_url}
                alt={cardName}
                fill
                className="object-contain rounded"
              />
            </div>
          ) : (
            <div className="w-full aspect-[3/4] max-w-[250px] mx-auto bg-[#1E1F2E] rounded flex items-center justify-center">
              <span className="text-gray-400">No Image</span>
            </div>
          )}
        </div>
        
        {/* Card Information */}
        <div className="space-y-2 text-white">
          <div>
            <span className="text-gray-400 text-sm">Card Name:</span>
            <p className="font-semibold">{cardName}</p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Category:</span>
            <p className="font-semibold">{collection}</p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Condition:</span>
            <p className="font-semibold">{condition}</p>
          </div>
          <div>
            <span className="text-gray-400 text-sm">Point Value:</span>
            <div className="flex items-center gap-1">
              <Image 
                src="/users/coin.png" 
                alt="Coin" 
                width={20} 
                height={20} 
              />
              <p className="font-semibold text-yellow-400">{price.toFixed(2)}</p>
            </div>
          </div>
        </div>
        
        {/* Delete button */}
        {showDeleteButton && onDelete && (
          <div className="mt-6 pt-4 border-t border-gray-600">
            <button
              onClick={() => {
                if (card?.id) {
                  onDelete(card.id)
                  onClose()
                }
              }}
              className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Remove from Highlights
            </button>
          </div>
        )}
      </div>
    </div>
  )
}