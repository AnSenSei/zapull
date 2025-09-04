'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'

export interface MarketplaceCardDetails {
  id: string;
  name?: string;
  card_name?: string;
  image_url: string;
  condition?: string;
  collection_name?: string;
  point_worth?: number;
  rarity?: number;
  document_id?: string;
  collection_id?: string;
  signed_image_url?: string;
  probability?: number;
  cash_worth?: number;
  globalRef?: string;
  [key: string]: any;
}

interface MarketplaceCardDetailModalProps {
  card: MarketplaceCardDetails | null
  isOpen: boolean
  onClose: () => void
}

export default function MarketplaceCardDetailModal({ card, isOpen, onClose }: MarketplaceCardDetailModalProps) {
  const [imageError, setImageError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)

  useEffect(() => {
    if (isOpen) {
      setImageError(false)
      setIsFullscreen(false)
      setImageLoading(true)
    }
  }, [isOpen])
  
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      const scrollY = window.scrollY || window.pageYOffset
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.width = '100%'
      
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.width = ''
        if (scrollY) {
          window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
        }
      }
    }
  }, [isOpen])

  // Lock again when entering fullscreen (nested lock count)
  useEffect(() => {
    if (isFullscreen) {
      const scrollY = window.scrollY || window.pageYOffset
      document.body.style.position = 'fixed'
      document.body.style.top = `-${scrollY}px`
      document.body.style.left = '0'
      document.body.style.right = '0'
      document.body.style.width = '100%'
      
      return () => {
        document.body.style.position = ''
        document.body.style.top = ''
        document.body.style.left = ''
        document.body.style.right = ''
        document.body.style.width = ''
        if (scrollY) {
          window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' })
        }
      }
    }
  }, [isFullscreen])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEsc)
    }

    return () => {
      document.removeEventListener('keydown', handleEsc)
    }
  }, [isOpen, onClose, isFullscreen])

  if (!isOpen || !card) return null

  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 1: return 'bg-gray-600 text-white'
      case 2: return 'bg-green-600 text-white'
      case 3: return 'bg-blue-600 text-white'
      case 4: return 'bg-purple-600 text-white'
      case 5: return 'bg-orange-600 text-white'
      default: return 'bg-red-600 text-white'
    }
  }

  const getRarityName = (rarity: number) => {
    switch (rarity) {
      case 1: return 'Common'
      case 2: return 'Uncommon'
      case 3: return 'Rare'
      case 4: return 'Epic'
      case 5: return 'Legendary'
      case 6: return 'Mythic'
      default: return 'Unknown'
    }
  }

  const cardName = card.card_name || card.name || 'Unknown Card'

  // Fullscreen image view
  if (isFullscreen) {
    return (
      <div 
        className="fixed inset-0 bg-black bg-opacity-95 z-[2000] flex items-center justify-center p-4"
        onClick={() => setIsFullscreen(false)}
      >
        <button 
          onClick={() => setIsFullscreen(false)}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        
        <div className="relative w-full h-full max-w-4xl max-h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
          <Image
            src={card.signed_image_url || card.image_url || '/placeholder-card.png'}
            alt={cardName}
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            priority
          />
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[999] p-4">
      <div className="bg-[#1A1B2E] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700">
          <h2 className="text-lg sm:text-xl font-bold text-white truncate pr-2">
            {cardName}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors p-1 flex-shrink-0"
          >
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
            {/* Card Image */}
            <div className="w-full lg:w-auto flex flex-col items-center">
              <div 
                className="relative group cursor-pointer"
                onClick={() => setIsFullscreen(true)}
              >
                {/* Card Image Container - responsive sizing */}
                <div className="relative w-[280px] sm:w-[320px] lg:w-[360px] h-[373px] sm:h-[427px] lg:h-[480px] rounded-lg overflow-hidden border border-purple-500/30 shadow-lg bg-gray-900">
                  {/* Loading Skeleton */}
                  {imageLoading && (
                    <div className="absolute inset-0 bg-gray-800 rounded-lg animate-pulse z-10" />
                  )}
                  
                  {card.image_url && !imageError ? (
                    <>
                      <Image 
                        src={card.signed_image_url || card.image_url} 
                        alt={cardName} 
                        fill
                        className="object-contain"
                        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 40vw"
                        priority
                        onError={() => setImageError(true)}
                        onLoadingComplete={() => setImageLoading(false)}
                      />
                      
                      {/* Fullscreen Icon Overlay */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 flex items-center justify-center pointer-events-none">
                        <svg 
                          width="48" 
                          height="48" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="white" 
                          strokeWidth="2"
                          className="opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                        >
                          <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                        </svg>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 bg-gray-800">
                      <div className="text-center">
                        <svg className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-2 opacity-50" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                        </svg>
                        <p className="text-xs sm:text-sm">No Image</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Click hint */}
              <p className="text-gray-500 text-sm mt-2 text-center w-full">Click image to view fullscreen</p>
            </div>

            {/* Card Details */}
            <div className="flex-1 lg:w-3/5 space-y-4 sm:space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Collection</div>
                  <div className="text-white text-sm sm:text-base">{card.collection_name || card.collection_id || 'Unknown'}</div>
                </div>

                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Condition</div>
                  <div className="text-white text-sm sm:text-base font-medium">{card.condition || 'Mint'}</div>
                </div>

                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Points Value</div>
                  <div className="flex items-center gap-1">
                    <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-yellow-400 text-sm sm:text-base font-medium">{card.point_worth || 0}</span>
                  </div>
                </div>
              </div>

              {/* Fusion usage list */}
              {Array.isArray((card as any).used_in_fusion) && (card as any).used_in_fusion.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-300 text-sm font-medium">Can be used to create</h3>
                  </div>
                  <div className="space-y-2">
                    {(card as any).used_in_fusion.map((fusion: any, idx: number) => {
                      const parts = String(fusion.pack_reference || '').split('/').filter(Boolean)
                      const collectionId = parts[1] || ''
                      const packId = parts[parts.length - 1] || ''
                      return (
                        <Link 
                          key={`${fusion.result_card_id}-${idx}`} 
                          href={`/packs/${collectionId}/${packId}`} 
                          title="Go to pack"
                          className="block"
                        >
                          <div className="flex items-center gap-3 p-2 rounded-md bg-gray-900 hover:bg-gray-700 cursor-pointer transition-colors">
                            <div className="relative w-12 h-16 flex-shrink-0">
                              <Image 
                                src={fusion.result_card_image_url || '/placeholder-card.png'} 
                                alt={fusion.result_card_name || fusion.result_card_id} 
                                fill 
                                className="object-cover rounded" 
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white text-sm font-medium truncate">{fusion.result_card_name || fusion.result_card_id}</p>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Additional Details */}
              {(card.probability || card.document_id || card.globalRef) && (
                <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                  <div className="text-gray-400 text-xs sm:text-sm mb-2">Card Details</div>
                  <div className="space-y-2">
                    {card.probability && (
                      <div className="flex justify-between">
                        <span className="text-gray-300 text-sm">Drop Rate:</span>
                        <span className="text-white text-sm">{(card.probability * 100).toFixed(2)}%</span>
                      </div>
                    )}
                    
                    {card.document_id && (
                      <div className="flex justify-between">
                        <span className="text-gray-300 text-sm">Card ID:</span>
                        <span className="text-xs font-mono bg-gray-700 px-2 py-1 rounded text-white">
                          {card.document_id.substring(0, 8)}...
                        </span>
                      </div>
                    )}
                    
                    {card.globalRef && (
                      <div className="flex justify-between">
                        <span className="text-gray-300 text-sm">Reference:</span>
                        <span className="text-xs font-mono bg-gray-700 px-2 py-1 rounded text-white">
                          {card.globalRef.substring(0, 12)}...
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 sm:py-3 px-4 rounded-lg text-sm sm:text-base transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
