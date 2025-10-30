'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { UserCard } from '@/lib/userApi'
import { motion, AnimatePresence } from 'framer-motion'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import confetti from 'canvas-confetti'
import { getFusionRecipeWithUserInfo, FusionRecipeWithUserInfo, performFusion } from '@/lib/fusionApi'

interface InventoryCardDetailModalProps {
  card: UserCard | null
  isOpen: boolean
  onClose: () => void
  onSell?: (card: UserCard) => void
  onRedeem?: (card: UserCard) => void
  onFusionComplete?: () => void
}

export default function InventoryCardDetailModal({ 
  card, 
  isOpen, 
  onClose, 
  onSell,
  onRedeem,
  onFusionComplete
}: InventoryCardDetailModalProps) {
  const [imageError, setImageError] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
  // Fusion related states
  const [fusionPoints, setFusionPoints] = useState<Record<string, number | undefined>>({})
  const [fusionQtys, setFusionQtys] = useState<Record<string, number | undefined>>({})
  const [fusionDetailOpen, setFusionDetailOpen] = useState(false)
  const [fusionDetail, setFusionDetail] = useState<FusionRecipeWithUserInfo | null>(null)
  const [fusionDetailLoading, setFusionDetailLoading] = useState(false)
  const [isFusing, setIsFusing] = useState(false)
  const { uid } = useAuthStore()
  const confettiCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const [fusionResultOpen, setFusionResultOpen] = useState(false)
  const [fusionResult, setFusionResult] = useState<any | null>(null)
  // Cache pack names for each result_card_id to show friendly labels
  const [fusionPackNames, setFusionPackNames] = useState<Record<string, string | undefined>>({})
  const [showRedeemConfirmation, setShowRedeemConfirmation] = useState(false)

  // Ensure image URLs are safe for next/image (fallback for gs:// or invalid URLs)
  const sanitizeImageUrl = (url?: string) => {
    if (!url) return '/placeholder-card.png'
    try {
      const trimmed = String(url).trim()
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '/placeholder-card.png'
      if (trimmed.startsWith('gs://')) return '/placeholder-card.png'
      return trimmed
    } catch {
      return '/placeholder-card.png'
    }
  }

  // Confetti effect similar to main fusion page
  const triggerLegendaryEffect = () => {
    const end = Date.now() + 2000
    const colors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7']
    const canvas = confettiCanvasRef.current
    const shoot = canvas ? confetti.create(canvas, { resize: true, useWorker: true }) : confetti
    ;(function frame() {
      shoot({ particleCount: 8, angle: 60, spread: 50, origin: { x: 0.3, y: 0.7 }, colors, gravity: 0.9, scalar: 1.0 })
      shoot({ particleCount: 8, angle: 120, spread: 50, origin: { x: 0.7, y: 0.7 }, colors, gravity: 0.9, scalar: 1.0 })
      shoot({ particleCount: 6, angle: 90, spread: 40, origin: { x: 0.5, y: 0.8 }, colors, gravity: 0.8, scalar: 1.2 })
      if (Date.now() < end) requestAnimationFrame(frame)
    })()
  }

  // Helper to display clean card labels in fusion detail ingredients
  const getIngredientLabel = (ing: any) => {
    const name = ing.card_name || ing.name || ing.result_card_name
    if (name) return String(name)
    const ref = String(ing.card_reference || ing.card_id || '')
    if (!ref) return ''
    const parts = ref.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : ref
  }

  useEffect(() => {
    if (isOpen) {
      setImageError(false)
      setIsFullscreen(false)
      setImageLoading(true)
      setShowRedeemConfirmation(false)
    }
  }, [isOpen])
  
  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [isOpen])

  // Lock again when entering fullscreen (nested lock count)
  useEffect(() => {
    if (isFullscreen) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [isFullscreen])

  // Prefetch fusion result points and owned qty for the "Can be used to create" list
  useEffect(() => {
    const run = async () => {
      if (!isOpen || !card?.used_in_fusion || (Array.isArray(card.used_in_fusion) && card.used_in_fusion.length === 0)) return
      const pointUpdates: Record<string, number | undefined> = {}
      const qtyUpdates: Record<string, number | undefined> = {}
      const list: any[] = Array.isArray(card.used_in_fusion) ? card.used_in_fusion as any[] : []
      await Promise.all(list.map(async (f) => {
        try {
          if (!f?.result_card_id || !f?.pack_reference) return
          const parts = String(f.pack_reference).split('/').filter(Boolean)
          const collectionId = parts[1] || ''
          const packId = parts[parts.length - 1]
          if (!collectionId || !packId) return
          const recipe = await getFusionRecipeWithUserInfo({
            pack_collection_id: collectionId,
            pack_id: packId,
            result_card_id: f.result_card_id,
          })
          const pw: any = (recipe as any).result_card_point_worth
          const rq: any = (recipe as any).result_card_user_quantity ?? (recipe as any).result_user_quantity ?? (recipe as any).user_quantity
          pointUpdates[f.result_card_id] = typeof pw === 'number' ? pw : undefined
          qtyUpdates[f.result_card_id] = typeof rq === 'number' ? rq : undefined
          const packName: any = (recipe as any).pack_name || (recipe as any).pack_title || undefined
          if (packName) {
            setFusionPackNames(prev => ({ ...prev, [f.result_card_id]: String(packName) }))
          }
        } catch (e) {
          // ignore individual failures
        }
      }))
      if (Object.keys(pointUpdates).length > 0) setFusionPoints(prev => ({ ...prev, ...pointUpdates }))
      if (Object.keys(qtyUpdates).length > 0) setFusionQtys(prev => ({ ...prev, ...qtyUpdates }))
    }
    run()
  }, [isOpen, card?.used_in_fusion])

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

  const getTimeRemaining = (buybackExpiresAt: string) => {
    const now = new Date().getTime()
    const expireTime = new Date(buybackExpiresAt).getTime()
    const diff = expireTime - now
    
    if (diff <= 0) return 'Expired'
    
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    
    if (days > 0) return `${days}d ${hours}h ${minutes}m`
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  }

  const isExpired = (buybackExpiresAt: string) => {
    const now = new Date().getTime()
    const expireTime = new Date(buybackExpiresAt).getTime()
    return expireTime <= now
  }

  const expired = isExpired(card.buybackexpiresAt)

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
            src={card.image_url || '/placeholder-card.png'}
            alt={card.card_name}
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
    <>
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[999] p-4">
      <div className="bg-[#1A1B2E] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-700">
          <h2 className="text-lg sm:text-xl font-bold text-white truncate pr-2">
            {card.card_name}
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
                        src={card.image_url} 
                        alt={card.card_name} 
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
                  <div className="text-white text-sm sm:text-base">{card.subcollection_name || 'Unknown'}</div>
                </div>

                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Quantity</div>
                  <div className="text-white text-sm sm:text-base font-medium">{card.quantity}</div>
                </div>

                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Points Value</div>
                  <div className="flex items-center gap-1">
                    <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                    <span className="text-yellow-400 text-sm sm:text-base font-medium">{card.point_worth}</span>
                  </div>
                </div>

                <div>
                  <div className="text-gray-400 text-xs sm:text-sm mb-1">Buyback Status</div>
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${expired ? 'bg-red-500' : 'bg-green-500'}`}></div>
                    <span className={`text-sm sm:text-base font-medium ${expired ? 'text-red-400' : 'text-green-400'}`}>
                      {expired ? 'Expired' : 'Active'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Buyback Timer */}
              <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                <div className="text-gray-400 text-xs sm:text-sm mb-2">Buyback Time Remaining</div>
                <div className={`text-lg sm:text-xl font-bold ${expired ? 'text-red-400' : 'text-white'}`}>
                  {getTimeRemaining(card.buybackexpiresAt)}
                </div>
                {!expired && (
                  <div className="text-gray-400 text-xs sm:text-sm mt-1">
                    Expires: {new Date(card.buybackexpiresAt).toLocaleString()}
                  </div>
                )}
              </div>

              {/* Fusion usage list */}
              {Array.isArray((card as any).used_in_fusion) && (card as any).used_in_fusion.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-gray-300 text-sm font-medium">Can be used to create</h3>
                    {fusionDetailLoading && (
                      <span className="text-[10px] sm:text-xs text-gray-400">Loading…</span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {(card as any).used_in_fusion.map((fusion: any, idx: number) => {
                      const parts = String(fusion.pack_reference || '').split('/').filter(Boolean)
                      const collectionId = parts[1] || ''
                      const packId = parts[parts.length - 1] || ''
                      const packLabel = (fusion.pack_name || fusion.pack_title || fusion.pack || fusion.packName || fusionPackNames[fusion.result_card_id]) || packId || (fusion.pack_reference || '')
                      const pw = fusionPoints[fusion.result_card_id]
                      const rq = fusionQtys[fusion.result_card_id]
                      return (
                        <div key={`${fusion.result_card_id}-${idx}`} className="flex items-center gap-3 p-2 rounded-md bg-gray-900 hover:bg-gray-700 cursor-pointer" onClick={async () => {
                          try {
                            setFusionDetailLoading(true)
                            if (!collectionId || !packId) return
                            const detail = await getFusionRecipeWithUserInfo({ pack_collection_id: collectionId, pack_id: packId, result_card_id: fusion.result_card_id })
                            setFusionDetail(detail)
                            setFusionDetailOpen(true)
                          } finally {
                            setFusionDetailLoading(false)
                          }
                        }}>
                          <div className="relative w-12 h-16 flex-shrink-0">
                            <Image src={sanitizeImageUrl(fusion.result_card_image_url)} alt={fusion.result_card_name || fusion.result_card_id} fill className="object-cover rounded" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{fusion.result_card_name || fusion.result_card_id}</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {typeof pw === 'number' && (
                              <div className="flex items-center gap-1 text-xs text-gray-300">
                                <Image src="/users/coin.png" alt="Coin" width={12} height={12} />
                                <span>{pw}</span>
                              </div>
                            )}
                            {typeof rq === 'number' && (
                              <div className="px-1.5 py-0.5 rounded bg-gray-700 text-[10px] text-gray-200">{rq}/1</div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                {(() => {
                  const canWithdraw = (card.point_worth || 0) >= 200;
                  return (
                    <button
                      onClick={() => {
                        if (canWithdraw) {
                          onClose()
                          onSell?.(card)
                        }
                      }}
                      disabled={!canWithdraw}
                      className={`flex-1 font-bold py-2 sm:py-3 px-4 rounded-lg text-sm sm:text-base transition-colors ${
                        canWithdraw 
                          ? 'bg-purple-600 hover:bg-purple-700 text-white cursor-pointer'
                          : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                      }`}
                      title={!canWithdraw ? `Cards with value less than 200 points cannot be withdrawn (current: ${card.point_worth?.toFixed(2) || '0.00'})` : ''}
                    >
                      List for Sale
                    </button>
                  );
                })()}
                
                {(() => {
                  const isExpired = new Date(card.buybackexpiresAt).getTime() <= new Date().getTime();
                  return (
                    <button
                      onClick={() => {
                        if (!isExpired) {
                          setShowRedeemConfirmation(true)
                        }
                      }}
                      disabled={isExpired}
                      className={`flex-1 font-bold py-2 sm:py-3 px-4 rounded-lg text-sm sm:text-base transition-colors ${
                        isExpired 
                          ? 'bg-gray-500 text-gray-300 cursor-not-allowed'
                          : 'bg-[#8868FF] hover:bg-[#7759EE] text-white'
                      }`}
                      title={isExpired ? 'Expired cards cannot be redeemed for points' : ''}
                    >
                      <div className="flex items-center justify-center space-x-2">
                        <div className="w-3 h-3 bg-purple-300 rounded-full"></div>
                        <span>Redeem</span>
                      </div>
                    </button>
                  );
                })()}
                
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

        {/* Redeem Confirmation Overlay */}
        {showRedeemConfirmation && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-4 z-10">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="p-6">
                <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 rounded-full mb-4">
                  <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 text-center mb-2">
                  Confirm Redemption
                </h3>
                <p className="text-sm text-gray-600 text-center mb-1">
                  Are you sure you want to redeem "{card.card_name}" for {card.point_worth || 0} points?
                </p>
                <p className="text-sm font-medium text-red-600 text-center mb-6">
                  This action cannot be undone.
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => {
                      setShowRedeemConfirmation(false)
                      onClose()
                      onRedeem?.(card)
                    }}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
                  >
                    Yes, Redeem for {card.point_worth || 0} Points
                  </button>
                  <button
                    onClick={() => setShowRedeemConfirmation(false)}
                    className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-medium py-2.5 px-4 rounded-lg text-sm transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Fusion Detail Modal (reused layout similar to pack detail) */}
      {fusionDetailOpen && fusionDetail && (
        <div className="fixed inset-0 bg-black/70 z-[1100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="relative w-full max-w-3xl bg-[#0F111C] rounded-2xl border border-purple-500/50 overflow-hidden max-h-[85vh] flex flex-col">
            <button onClick={() => setFusionDetailOpen(false)} className="absolute top-3 right-3 text-white hover:text-purple-300">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className="p-4 border-b border-gray-700 text-center flex-shrink-0 hidden md:block">
              <h3 className="text-xl font-bold text-white">{fusionDetail.result_card_name || fusionDetail.result_card_id}</h3>
              <p className="text-gray-400 text-sm">Fusion Recipe</p>
            </div>

            <div className="p-4 space-y-6 overflow-y-auto flex-1">
              {/* Result card (clickable to navigate to pack) */}
              <div className="flex justify-center">
                {fusionDetail ? (
                  <Link href={`/packs/${(fusionDetail as any).pack_collection_id || (fusionDetail as any).card_collection_id}/${(fusionDetail as any).pack_id}`} title="Go to pack">
                    <div className="relative w-40 h-56 bg-gray-800 rounded-lg border border-purple-400/30 cursor-pointer hover:border-purple-400 transition-colors">
                      <Image src={sanitizeImageUrl((fusionDetail as any).result_card_image_url || (fusionDetail as any).result_card_image)} alt={fusionDetail.result_card_name || fusionDetail.result_card_id} fill className="object-cover rounded-lg" />
                      {(() => {
                        const pw = (fusionDetail as any).result_card_point_worth
                        return typeof pw === 'number' ? (
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs rounded px-1.5 py-0.5 flex items-center gap-1">
                            <Image src="/users/coin.png" alt="Coin" width={12} height={12} />
                            <span>{pw}</span>
                          </div>
                        ) : null
                      })()}
                    </div>
                  </Link>
                ) : (
                  <div className="relative w-40 h-56 bg-gray-800 rounded-lg border border-purple-400/30" />
                )}
              </div>

              {/* Ingredients */}
              <div className="space-y-2">
                <h4 className="text-white font-semibold">Ingredients</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {fusionDetail.ingredients.map((ing: any, i: number) => (
                    <div key={`${ing.card_id}-${i}`} className="bg-gray-800 rounded-lg p-2 border border-gray-700">
                      <div className="text-xs text-center text-white truncate mb-1">{getIngredientLabel(ing)}</div>
                      <div className="relative w-full aspect-[3/4] bg-gray-700 rounded">
                        {ing.image_url ? (
                          <Image src={ing.image_url} alt={getIngredientLabel(ing)} fill className="object-cover rounded" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">{getIngredientLabel(ing)}</div>
                        )}
                        <div className="absolute top-1 left-1 bg-black/70 text-white text-xs rounded px-1">x{(ing as any).quantity}</div>
                        {(() => {
                          const pw = (ing as any).point_worth ?? (ing as any).pointWorth
                          return typeof pw === 'number' ? (
                            <div className="absolute top-1 right-1 bg-black/70 text-white text-xs rounded px-1.5 py-0.5 flex items-center gap-1">
                              <Image src="/users/coin.png" alt="Coin" width={12} height={12} />
                              <span>{pw}</span>
                            </div>
                          ) : null
                        })()}
                        {(() => {
                          const have = (ing as any).user_quantity ?? (ing as any).user_qty ?? (ing as any).owned_quantity ?? (ing as any).owned ?? 0
                          const required = Number((ing as any).quantity) || 0
                          const ok = have >= required
                          return (
                            <div className={`absolute bottom-1 right-1 text-xs rounded px-1.5 py-0.5 ${ok ? 'bg-green-600/80' : 'bg-red-600/80'} text-white`}>
                              {have}/{required}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row justify-end gap-2">
                <button
                  className="px-4 py-2 rounded text-white disabled:opacity-50 disabled:cursor-not-allowed bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
                  disabled={!uid || !fusionDetail?.can_perform_fusion || isFusing}
                  onClick={async () => {
                    if (!fusionDetail) return
                    if (!uid) {
                      toast.error('Please login to fuse')
                      return
                    }
                    try {
                      setIsFusing(true)
                      const res = await performFusion({
                        result_card_id: fusionDetail.result_card_id,
                        collection_id: fusionDetail.pack_collection_id,
                        pack_id: fusionDetail.pack_id,
                      })
                      if ((res as any)?.success) {
                        const resultCard = (res as any)?.result_card || null
                        setFusionResult(resultCard)
                        setFusionResultOpen(true)
                        try {
                          const fusionAudio = new Audio('/draw/fusion.wav')
                          fusionAudio.play().catch(() => {})
                        } catch {}
                        setTimeout(() => { triggerLegendaryEffect() }, 200)
                        toast.success('Fusion successful!')
                        try {
                          const updated = await getFusionRecipeWithUserInfo({
                            pack_collection_id: fusionDetail.pack_collection_id,
                            pack_id: fusionDetail.pack_id,
                            result_card_id: fusionDetail.result_card_id,
                          })
                          setFusionDetail(updated)
                        } catch {}
                        
                        // Refetch user's cards after successful fusion
                        if (onFusionComplete) {
                          try {
                            onFusionComplete()
                          } catch (error) {
                            console.error('Error refreshing cards after fusion:', error)
                          }
                        }
                      } else {
                        toast.error((res as any)?.message || 'Fusion failed')
                      }
                    } catch (e) {
                      toast.error('Fusion failed')
                    } finally {
                      setIsFusing(false)
                    }
                  }}
                >
                  {isFusing ? 'Fusing…' : uid ? (fusionDetail?.can_perform_fusion ? 'Fuse' : 'Missing materials') : 'Login to fuse'}
                </button>
                <button className="px-4 py-2 bg-gray-700 rounded text-white hover:bg-gray-600" onClick={() => setFusionDetailOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Fusion success overlay showing result card */}
    {fusionResultOpen && (
      <div className="fixed inset-0 z-[1300] flex items-center justify-center">
        <div className="absolute inset-0 bg-black/80" onClick={() => setFusionResultOpen(false)}></div>
        <canvas ref={confettiCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"></canvas>
          <div className="relative z-10 bg-[#0F111C] border border-purple-500/50 rounded-2xl p-5 sm:p-7 shadow-2xl flex flex-col items-center max-w-[90vw]">
            <h3 className="text-white text-xl sm:text-2xl font-bold mb-4">Fusion Result</h3>
            <div className="relative w-56 h-80 sm:w-64 sm:h-[22rem] md:w-72 md:h-[26rem]">
              <Image src={sanitizeImageUrl((fusionResult as any)?.image_url)} alt={(fusionResult as any)?.card_name || (fusionResult as any)?.name || 'Fusion Result'} fill className="object-contain rounded-lg" />
            </div>
            <p className="text-white mt-3 text-base truncate max-w-[320px]">{(fusionResult as any)?.card_name || (fusionResult as any)?.name || 'Unknown'}</p>
            <button className="mt-5 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg" onClick={() => setFusionResultOpen(false)}>Confirm</button>
          </div>
      </div>
    )}
    </>
  )
}
