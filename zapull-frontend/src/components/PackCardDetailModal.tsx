'use client'

import { useState, useRef, useEffect, Fragment } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Card } from '@/lib/packsApi'
import styles from './CardDetailModal.module.css'
import FusionBadge from './FusionBadge'
import { lockBodyScroll, unlockBodyScroll, forceUnlockBodyScroll } from '@/lib/scrollLock'
import { getFusionRecipeWithUserInfo, FusionRecipeWithUserInfo, performFusion, getReverseFusionRecipes, ReverseFusionRecipe } from '@/lib/fusionApi'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import confetti from 'canvas-confetti'

interface PackCardDetailModalProps {
  isOpen: boolean
  onClose: () => void
  card: Card | null
}

export default function PackCardDetailModal({ isOpen, onClose, card }: PackCardDetailModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [detailsExpanded, setDetailsExpanded] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [imageLoading, setImageLoading] = useState(true)
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
  const [isMobile, setIsMobile] = useState(false)
  // Reverse fusion states for "Can be created from"
  const [reverseRecipes, setReverseRecipes] = useState<ReverseFusionRecipe[]>([])
  const [reverseRecipesLoading, setReverseRecipesLoading] = useState(false)
  // Fusion tab state
  const [fusionActiveTab, setFusionActiveTab] = useState<'create' | 'created-from'>('create')

  // Helper to display clean card labels in fusion ingredients (match inventory modal)
  const getIngredientLabel = (ing: any) => {
    const name = ing.card_name || ing.name || ing.result_card_name
    if (name) return String(name)
    const ref = String(ing.card_reference || ing.card_id || '')
    if (!ref) return ''
    const parts = ref.split('/').filter(Boolean)
    return parts.length ? parts[parts.length - 1] : ref
  }

  // Check if it's mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768) // md breakpoint
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // 移除点击外部关闭弹窗的功能，只保留close图标和ESC键关闭

  // ESC键关闭弹窗
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false)
        } else {
          onClose()
        }
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey)
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [isOpen, onClose, isFullscreen])

  // 弹窗打开时重置数据
  useEffect(() => {
    if (isOpen) {
      setDetailsExpanded(false)
      setIsFullscreen(false)
      setImageLoading(true)
    }
  }, [isOpen])

  // 锁定背景滚动并阻止背景交互（模态打开）
  useEffect(() => {
    if (isOpen) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [isOpen])

  // Fetch point worth and user's owned qty for fusion results to display in "Can be used to create"
  useEffect(() => {
    const run = async () => {
      if (!isOpen || !card?.used_in_fusion || card.used_in_fusion.length === 0) return
      const pointUpdates: Record<string, number | undefined> = {}
      const qtyUpdates: Record<string, number | undefined> = {}
      await Promise.all(card.used_in_fusion.map(async (f) => {
        try {
          if (!f?.result_card_id || !f?.pack_reference) return
          const parts = f.pack_reference.split('/').filter(Boolean) // e.g. ['packs','one_piece','one_piece','<packId>'] or ['packs','one_piece','<packId>']
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
        } catch (e) {
          // ignore individual failures
        }
      }))
      if (Object.keys(pointUpdates).length > 0) {
        setFusionPoints(prev => ({ ...prev, ...pointUpdates }))
      }
      if (Object.keys(qtyUpdates).length > 0) {
        setFusionQtys(prev => ({ ...prev, ...qtyUpdates }))
      }
    }
    run()
  }, [isOpen, card?.used_in_fusion])

  // Build reverse fusion cache from all cards' used_in_fusion data
  useEffect(() => {
    const buildReverseFusionCache = async () => {
      if (!isOpen || !card?.id && !card?.card_reference) {
        setReverseRecipesLoading(false)
        setReverseRecipes([])
        return
      }
      
      try {
        setReverseRecipesLoading(true)
        
        // Get all cards from the current pack to build fusion cache
        const currentCardId = card.id || card.card_reference || ''
        const reverseFusions: ReverseFusionRecipe[] = []
        
        // Get pack data from the current page context
        // We'll look through the window location or try to find pack data
        const pathParts = window.location.pathname.split('/').filter(Boolean)
        if (pathParts.length >= 3 && pathParts[0] === 'packs') {
          const collectionId = pathParts[1]
          const packId = pathParts[2]
          
          try {
            // Try to get pack data from the current context
            // Since we're in a modal, we need to look for pack data in the parent component
            const packElement = document.querySelector('[data-pack-cards]')
            let allCards: any[] = []
            
            if (packElement) {
              try {
                allCards = JSON.parse(packElement.getAttribute('data-pack-cards') || '[]')
              } catch {}
            }
            
            // Build fusion result cache: map from result_card_id to source cards
            const fusionResultMap: Record<string, any[]> = {}
            
            allCards.forEach(sourceCard => {
              if (sourceCard.used_in_fusion && sourceCard.used_in_fusion.length > 0) {
                sourceCard.used_in_fusion.forEach((fusion: any) => {
                  const resultId = fusion.result_card_id
                  if (resultId) {
                    if (!fusionResultMap[resultId]) {
                      fusionResultMap[resultId] = []
                    }
                    fusionResultMap[resultId].push({
                      sourceCard,
                      fusion
                    })
                  }
                })
              }
            })
            
            // Check if current card is a result of any fusion
            const reverseFusionsForCurrentCard = fusionResultMap[currentCardId] || []
            
            // Convert to ReverseFusionRecipe format
            for (const { sourceCard, fusion } of reverseFusionsForCurrentCard) {
              const parts = (fusion.pack_reference || '').split('/').filter(Boolean)
              const fusionCollectionId = parts[1] || collectionId
              const fusionPackId = parts[parts.length - 1] || packId
              
              reverseFusions.push({
                recipe_id: `${fusionCollectionId}_${fusionPackId}_${fusion.result_card_id}`,
                result_card_id: fusion.result_card_id,
                result_card_name: fusion.result_card_name || card.name || card.card_name || currentCardId,
                result_card_image_url: card.image_url || '',
                result_card_point_worth: card.point_worth,
                pack_id: fusionPackId,
                pack_collection_id: fusionCollectionId,
                pack_name: `Pack ${fusionPackId}`,
                ingredients: [
                  {
                    card_id: sourceCard.id || sourceCard.card_reference,
                    card_name: sourceCard.name || sourceCard.card_name || 'Unknown Card',
                    image_url: sourceCard.image_url || '',
                    quantity: 1, // We don't have exact ingredient info, so assume 1
                    user_quantity: sourceCard.user_quantity || 0,
                    has_enough: (sourceCard.user_quantity || 0) >= 1,
                    point_worth: sourceCard.point_worth
                  }
                ],
                can_perform_fusion: (sourceCard.user_quantity || 0) >= 1
              })
            }
          } catch (error) {
            console.error('Error building reverse fusion cache:', error)
          }
        }
        
        console.log(`Found ${reverseFusions.length} reverse fusion recipes for card:`, currentCardId)
        setReverseRecipes(reverseFusions)
        
      } catch (error) {
        console.error('Failed to build reverse fusion cache:', error)
        setReverseRecipes([])
      } finally {
        setReverseRecipesLoading(false)
      }
    }
    
    buildReverseFusionCache()
  }, [isOpen, card?.id, card?.card_reference, card?.name, card?.card_name, card?.image_url, card?.point_worth])

  // 全屏状态下再次加锁，退出全屏时释放一次（与模态嵌套计数配合）
  useEffect(() => {
    if (isFullscreen) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [isFullscreen])

  // Nested overlays (Fusion Detail / Fusion Result) also lock body scroll
  useEffect(() => {
    if (fusionDetailOpen || fusionResultOpen) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [fusionDetailOpen, fusionResultOpen])

  if (!isOpen || !card) return null

  // 根据颜色获取对应的显示信息和奖品等级
  const getColorInfo = (color: string | undefined) => {
    if (!color) return { 
      text: 'Default', 
      hexColor: '#808080', 
      displayName: 'Default',
      prizeLevel: 'Standard Prize',
      prizeIcon: '🏆',
      prizeRank: 5
    }
    
    const colorMap: { [key: string]: { hexColor: string, displayName: string, prizeLevel: string, prizeIcon: string, prizeRank: number } } = {
      'red': { 
        hexColor: '#FF0066', 
        displayName: 'Red',
        prizeLevel: 'JACKPOT',
        prizeIcon: '💎',
        prizeRank: 1
      },
      'orange': { 
        hexColor: '#FF8800', 
        displayName: 'Orange',
        prizeLevel: 'MEGA PRIZE',
        prizeIcon: '👑',
        prizeRank: 2
      },
      'purple': { 
        hexColor: '#FF00FF', 
        displayName: 'Purple',
        prizeLevel: 'BIG WIN',
        prizeIcon: '💜',
        prizeRank: 3
      },
      'blue': { 
        hexColor: '#00CCFF', 
        displayName: 'Blue',
        prizeLevel: 'Lucky Prize',
        prizeIcon: '🎯',
        prizeRank: 4
      },
      'green': { 
        hexColor: '#00FF88', 
        displayName: 'Green',
        prizeLevel: 'Prize',
        prizeIcon: '🏆',
        prizeRank: 5
      },
      'yellow': { 
        hexColor: '#FFFF00', 
        displayName: 'Yellow',
        prizeLevel: 'Special Prize',
        prizeIcon: '⭐',
        prizeRank: 3
      },
      'pink': { 
        hexColor: '#FF66CC', 
        displayName: 'Pink',
        prizeLevel: 'Rare Prize',
        prizeIcon: '🌸',
        prizeRank: 3
      },
      'teal': { 
        hexColor: '#00FFCC', 
        displayName: 'Teal',
        prizeLevel: 'Prize',
        prizeIcon: '🏆',
        prizeRank: 4
      },
      'cyan': { 
        hexColor: '#00FFFF', 
        displayName: 'Cyan',
        prizeLevel: 'Prize',
        prizeIcon: '🏆',
        prizeRank: 4
      },
      'brown': { 
        hexColor: '#CC6633', 
        displayName: 'Brown',
        prizeLevel: 'Prize',
        prizeIcon: '🏆',
        prizeRank: 5
      },
      'grey': { 
        hexColor: '#CCCCCC', 
        displayName: 'Grey',
        prizeLevel: 'Prize',
        prizeIcon: '🏆',
        prizeRank: 5
      },
      'gray': { 
        hexColor: '#CCCCCC', 
        displayName: 'Gray',
        prizeLevel: 'Prize',
        prizeIcon: '🏆',
        prizeRank: 5
      }
    }
    
    const colorInfo = colorMap[color.toLowerCase()] || { 
      hexColor: '#808080', 
      displayName: color.charAt(0).toUpperCase() + color.slice(1),
      prizeLevel: 'Prize',
      prizeIcon: '🏆',
      prizeRank: 5
    }
    
    return colorInfo
  }
  
  const colorInfo = getColorInfo(card.color)

  // Sanitize potentially unsupported image URLs (e.g., gs://)
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

  // 全屏查看组件
  if (isFullscreen) {
    return (
      <div
        className="fixed inset-0 bg-black bg-opacity-95 z-[100000] flex items-center justify-center p-8"
        role="dialog"
        aria-modal="true"
        onClick={() => setIsFullscreen(false)}
      >
        <button 
          onClick={() => setIsFullscreen(false)}
          className="absolute top-8 right-8 text-white hover:text-gray-300 transition-colors z-10"
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        
        		<div className="relative w-full h-full max-w-3xl max-h-[90vh] flex items-center justify-center">
          <Image
            src={card.image_url || '/placeholder-card.png'}
            alt={card.name || card.card_name}
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
    <div>
    <div
      className="fixed inset-0 bg-black bg-opacity-50 md:bg-opacity-70 z-[100000] flex items-end md:items-center justify-center md:p-4"
      role="dialog"
      aria-modal="true"
      onClick={() => { try { onClose(); } finally { setTimeout(() => forceUnlockBodyScroll(), 0); } }}
    >
      <motion.div 
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
        className={`relative w-full overflow-hidden ${
          isMobile ? 'bg-gray-800 rounded-t-2xl max-h-[90vh]' : 'bg-gray-900 rounded-2xl max-w-4xl'
        }`}
        style={{
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
          maxHeight: isMobile ? (colorInfo.prizeRank <= 3 ? '95vh' : '92vh') : (colorInfo.prizeRank <= 3 ? '95vh' : '90vh')
        }}
        initial={isMobile ? { y: '100%', opacity: 0.3 } : { opacity: 0, scale: 0.9 }}
        animate={isMobile ? { y: 0, opacity: 1 } : { opacity: 1, scale: 1 }}
        exit={isMobile ? { y: '100%', opacity: 0 } : { opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      >
        {/* Close button - respect safe-area inset (improved visibility) */}
        <button 
          aria-label="Close"
          onClick={() => { try { onClose(); } finally { setTimeout(() => forceUnlockBodyScroll(), 0); } }}
          className={`absolute flex items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/70 hover:text-white transition-colors z-20 border border-white/20 shadow ${
            isMobile ? 'w-8 h-8 top-3 right-3' : 'w-10 h-10'
          }`}
          style={!isMobile ? { top: 'calc(env(safe-area-inset-top, 0px) + 20px)', right: 'calc(env(safe-area-inset-right, 0px) + 20px)' } : {}}
        >
          <svg width={isMobile ? "18" : "22"} height={isMobile ? "18" : "22"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* Main Content - Fixed height with internal scroll */}
        <div className={`flex flex-col ${isMobile ? 'h-full' : 'h-[90vh] max-h-[90vh]'}`}>
          {/* Title - Fixed */}
          <h2 className="text-base sm:text-xl font-bold text-white text-center py-2 sm:py-3 px-4 border-b border-gray-800">
            {card.name || card.card_name}
          </h2>
          
          {/* Card Image Section - Fixed */}
          <div className="w-full bg-gray-950 p-2 sm:p-4 flex flex-col items-center justify-center flex-shrink-0">
            {/* Card Image Container */}
            <div className="relative group cursor-pointer" onClick={() => setIsFullscreen(true)}>
              
              
              {/* Loading Skeleton */}
              {imageLoading && (
                <div className="absolute inset-0 bg-gray-800 rounded-xl animate-pulse" />
              )}
              
              {/* Main Card Image - Much smaller for mobile to give room for tabs */}
              <div 
                className="relative w-32 h-[180px] sm:w-56 sm:h-[320px] md:w-64 md:h-[380px] lg:w-72 lg:h-[420px] transition-transform duration-300 group-hover:scale-105 p-[2px] rounded-xl"
                style={{
                  background: `linear-gradient(135deg, ${colorInfo.hexColor}, ${colorInfo.hexColor}80)`,
                  boxShadow: `0 0 40px ${colorInfo.hexColor}40, 0 0 80px ${colorInfo.hexColor}20`
                }}
              >
                <div className="relative w-full h-full bg-gray-950 rounded-xl overflow-hidden">
                  <Image
                    src={card.image_url || '/placeholder-card.png'}
                    alt={card.name || card.card_name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 320px, 384px"
                    priority
                    onLoadingComplete={() => setImageLoading(false)}
                  />
                  
                  {/* Fusion Badge */}
                  <FusionBadge 
                    fusionInfo={card.used_in_fusion} 
                    isResultCard={reverseRecipes.length > 0}
                    className="absolute top-3 right-3"
                    size="large"
                    showTooltip={false}
                  />
                </div>
                
                {/* Fullscreen Icon Overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-300 rounded-xl flex items-center justify-center">
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
              </div>
              
              {/* Click hint */}
              <p className="text-gray-500 text-[10px] sm:text-xs mt-1 sm:mt-2 text-center">Click to fullscreen</p>
            </div>
          </div>

          {/* Details Section - Scrollable */}
          <div className="flex-1 overflow-y-auto w-full">
            <div className="p-2 sm:p-4">
              {/* Card Stats Row: Price, Drop Rate, Condition */}
              <div className="grid grid-cols-3 gap-1 sm:gap-2 mb-2">
                {/* Price */}
                <div 
                  className="rounded-md p-1 sm:p-1.5 relative overflow-hidden"
                style={{
                  background: colorInfo.prizeRank <= 2 
                    ? `linear-gradient(135deg, ${colorInfo.hexColor}20, ${colorInfo.hexColor}10)` 
                    : 'rgb(31, 41, 55)'
                }}
                >
                  <div className="flex items-center gap-1 mb-0.5">
                    <Image 
                      src="/users/coin.png" 
                      alt="Coin" 
                      width={12} 
                      height={12} 
                    />
                    <span className="text-gray-400 text-[10px] sm:text-xs">Price</span>
                  </div>
                  <p 
                    className={`text-sm sm:text-base font-bold ${colorInfo.prizeRank <= 2 ? 'animate-pulse' : ''}`}
                    style={{ color: colorInfo.prizeRank <= 2 ? colorInfo.hexColor : '#FBBF24' }}
                  >
                    {card.point_worth || '0'}
                  </p>
                </div>
                
                {/* Drop Rate */}
                <div className="bg-gray-800 rounded-md p-1 sm:p-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                      <path d="M12 2v20M2 12h20M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z" />
                    </svg>
                    <span className="text-gray-400 text-[10px] sm:text-xs">Drop</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold text-blue-400">{(() => {
                    const p = Number(card.probability);
                    if (Number.isFinite(p)) {
                      // API returns probability in percent units already (e.g., 0.1 => 0.1%)
                      const display = p;
                      return `${display.toFixed(2)}%`;
                    }
                    return '?';
                  })()}</p>
                </div>

                {/* Condition */}
                <div className="bg-gray-800 rounded-md p-1 sm:p-1.5">
                  <div className="flex items-center gap-1 mb-0.5">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                      <path d="M20 6l-9 9-5-5" />
                    </svg>
                    <span className="text-gray-400 text-[10px] sm:text-xs">Condition</span>
                  </div>
                  <p className="text-sm sm:text-base font-bold text-white">{card.condition || 'Mint'}</p>
                </div>
              </div>
            
              {/* Detailed Info */}
              <div className="space-y-1">
                
                {/* Prize Level - hide for official pack cards */}
                {card.condition !== 'near_mint' && !window.location.pathname.includes('/official-packs/') && (
                  <div className="flex justify-between items-center py-1 border-b border-gray-700">
                    <span className="text-gray-400 font-medium text-xs sm:text-sm">Prize Tier</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base sm:text-xl">{colorInfo.prizeIcon}</span>
                      <div className="flex flex-col items-end">
                        <span 
                          className="font-black text-sm sm:text-lg tracking-wide"
                          style={{ 
                            color: colorInfo.hexColor,
                            textShadow: `0 0 20px ${colorInfo.hexColor}80`
                          }}
                        >
                          {colorInfo.prizeLevel}
                        </span>
                        {colorInfo.prizeRank === 1 && (
                          <span className="text-[10px] sm:text-xs text-yellow-400 animate-pulse">Highest Value!</span>
                        )}
                        {colorInfo.prizeRank === 2 && (
                          <span className="text-[10px] sm:text-xs text-orange-400">Very Rare!</span>
                        )}
                        {colorInfo.prizeRank === 3 && (
                          <span className="text-[10px] sm:text-xs text-purple-400">Rare Find!</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Collection */}
                {card.collection && (
                  <div className="flex justify-between items-center py-1 border-b border-gray-700">
                    <span className="text-gray-400 font-medium text-xs sm:text-sm">Collection</span>
                    <span className="text-white font-semibold text-xs sm:text-sm">{card.collection}</span>
                  </div>
                )}
              
                {/* Fusion Info - Conditional Tabbed Interface */}
                {(() => {
                  const canFuseToCreate = card.used_in_fusion && card.used_in_fusion.length > 0
                  const canBeCreatedFrom = reverseRecipes.length > 0 || reverseRecipesLoading
                  
                  // Don't show fusion section if neither capability exists
                  if (!canFuseToCreate && !canBeCreatedFrom) return null
                  
                  // If only one tab should be shown, set it as active and don't show tab headers
                  const showBothTabs = canFuseToCreate && canBeCreatedFrom
                  const singleTab = canFuseToCreate ? 'create' : 'created-from'
                  const currentTab = showBothTabs ? fusionActiveTab : singleTab
                  
                  // Special styling for cards that are both fusable and material
                  const isDualFusion = canFuseToCreate && canBeCreatedFrom
                  
                  return (
                    <div className="py-1">
                      {/* Tab Headers - Show for both dual-tab and single-tab modes */}
                      {showBothTabs ? (
                        <div className="flex mb-1 sm:mb-2">
                          <button
                            className={`flex-1 py-1 px-2 sm:py-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors rounded-l-md shadow-sm ${
                              fusionActiveTab === 'create'
                                ? 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-purple-500/30'
                                : 'bg-gray-600 text-gray-200 hover:bg-gray-500 hover:text-white'
                            }`}
                            onClick={() => setFusionActiveTab('create')}
                          >
                            <span className="block sm:inline">Can fuse</span>
                            <span className="hidden sm:inline"> to create</span>
                          </button>
                          <button
                            className={`flex-1 py-1 px-2 sm:py-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors rounded-r-md shadow-sm ${
                              fusionActiveTab === 'created-from'
                                ? (isDualFusion 
                                    ? 'bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 text-white shadow-purple-500/30 animate-pulse'
                                    : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-purple-500/30'
                                  )
                                : (isDualFusion 
                                    ? 'bg-gray-600 text-gray-200 hover:bg-gradient-to-r hover:from-pink-500 hover:via-purple-500 hover:to-cyan-500 hover:text-white'
                                    : 'bg-gray-600 text-gray-200 hover:bg-gray-500 hover:text-white'
                                  )
                            }`}
                            onClick={async () => {
                              // If there are reverse recipes, directly open the fusion modal with the first recipe
                              if (reverseRecipes.length > 0) {
                                try {
                                  setFusionDetailLoading(true)
                                  const recipe = reverseRecipes[0] // Use first recipe
                                  const detail = await getFusionRecipeWithUserInfo({ 
                                    pack_collection_id: recipe.pack_collection_id, 
                                    pack_id: recipe.pack_id, 
                                    result_card_id: recipe.result_card_id 
                                  })
                                  setFusionDetail(detail)
                                  setFusionDetailOpen(true)
                                } catch (error) {
                                  console.error('Failed to get fusion detail:', error)
                                  toast.error('Failed to load fusion recipe')
                                } finally {
                                  setFusionDetailLoading(false)
                                }
                              } else {
                                // Fallback to tab switching if no recipes
                                setFusionActiveTab('created-from')
                              }
                            }}
                          >
                            <span className="block sm:inline">Fuse from</span>
                            <span className="hidden sm:inline">/ Can be created from</span>
                          </button>
                        </div>
                      ) : (
                        /* Single tab mode - show the relevant tab button */
                        <div className="mb-1 sm:mb-2">
                          {currentTab === 'create' ? (
                            <button
                              className="w-full py-1 px-2 sm:py-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors rounded-md shadow-sm bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-purple-500/30"
                              onClick={() => {}} // No action needed for material-only cards
                            >
                              <span className="block sm:inline">Can be used to create</span>
                            </button>
                          ) : (
                            <button
                              className="w-full py-1 px-2 sm:py-2 sm:px-3 text-xs sm:text-sm font-medium transition-colors rounded-md shadow-sm bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-purple-500/30 hover:shadow-purple-500/50 transition-all"
                              onClick={async () => {
                                // For fusible-only cards, directly open the fusion modal with the appropriate recipe
                                // First, try to get the recipe based on the current card's ID
                                try {
                                  setFusionDetailLoading(true)
                                  
                                  // Get pack info from current URL
                                  const pathParts = window.location.pathname.split('/').filter(Boolean)
                                  if (pathParts.length >= 3 && pathParts[0] === 'packs') {
                                    const collectionId = pathParts[1]
                                    const packId = pathParts[2]
                                    
                                    // Try to fetch the fusion recipe for this card
                                    const detail = await getFusionRecipeWithUserInfo({ 
                                      pack_collection_id: collectionId, 
                                      pack_id: packId, 
                                      result_card_id: card.id || card.card_reference || ''
                                    })
                                    setFusionDetail(detail)
                                    setFusionDetailOpen(true)
                                  } else if (reverseRecipes.length > 0) {
                                    // Fallback to first reverse recipe if available
                                    const recipe = reverseRecipes[0]
                                    const detail = await getFusionRecipeWithUserInfo({ 
                                      pack_collection_id: recipe.pack_collection_id, 
                                      pack_id: recipe.pack_id, 
                                      result_card_id: recipe.result_card_id 
                                    })
                                    setFusionDetail(detail)
                                    setFusionDetailOpen(true)
                                  } else {
                                    toast.error('Fusion recipe not found')
                                  }
                                } catch (error) {
                                  console.error('Failed to get fusion detail:', error)
                                  toast.error('Failed to load fusion recipe')
                                } finally {
                                  setFusionDetailLoading(false)
                                }
                              }}
                            >
                              <span className="block sm:inline">Fuse from</span>
                            </button>
                          )}
                        </div>
                      )}

                      {/* Tab Content - Show content area only for material cards (can be used to create) or dual-tab mode */}
                      {(currentTab === 'create' || showBothTabs) && (
                      <div className="bg-gray-800 rounded-md p-1">
                        {currentTab === 'create' ? (
                          /* "Can be used to create" tab content */
                          card.used_in_fusion && card.used_in_fusion.length > 0 ? (
<div className="space-y-1 max-h-40 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {fusionDetailLoading && (
                              <div className="text-center py-2">
                                <span className="text-[10px] sm:text-xs text-gray-400">Loading…</span>
                              </div>
                            )}
                            {card.used_in_fusion.map((fusion, index) => {
                              const parts = (fusion.pack_reference || '').split('/').filter(Boolean)
                              const collectionId = parts[1] || ''
                              const packId = parts[parts.length - 1] || ''
                              const pw = fusionPoints[fusion.result_card_id]
                              const rq = fusionQtys[fusion.result_card_id]
                              return (
                              <div key={index} className="flex items-center gap-2 p-1 hover:bg-gray-700 rounded transition-colors cursor-pointer" onClick={async () => {
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
                                {/* Result card image with fusion badge */}
                                <div className="relative w-12 h-16 sm:w-14 sm:h-18 flex-shrink-0">
                                  <Image
                                    src={fusion.result_card_image_url}
                                    alt={fusion.result_card_name}
                                    fill
                                    className="object-cover rounded"
                                  />
                                  {/* Fusion badge for fusible cards */}
                                  <div className="absolute -top-1 -right-1 bg-purple-600 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">
                                    F
                                  </div>
                                </div>
                                {/* Result card info */}
                                <div className="flex-1">
                                  <p className="text-white font-medium text-xs sm:text-sm">{fusion.result_card_name}</p>
                                  <p className="text-gray-400 text-[10px] sm:text-xs">Fusion Result</p>
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
                            )})}
                          </div>
                        ) : (
                          <div className="text-center py-1">
                            <p className="text-gray-400 text-[10px]">This card cannot be used in fusion</p>
                          </div>
                        )
                      ) : (
                        /* "Can be created from" tab content */
                        reverseRecipesLoading ? (
                          <div className="text-center py-3">
                            <p className="text-gray-400 text-xs">Searching fusion recipes...</p>
                          </div>
                        ) : reverseRecipes.length > 0 ? (
<div className="space-y-1 max-h-20 overflow-y-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {reverseRecipes.map((recipe, index) => {
                              const sourceCard = recipe.ingredients[0] // Get the first (and likely only) source card
                              return (
                                <div 
                                  key={index} 
                                  className="flex items-center gap-2 p-1.5 bg-gray-700 rounded cursor-pointer hover:bg-gray-600 transition-colors"
                                  onClick={async () => {
                                    try {
                                      setFusionDetailLoading(true)
                                      const detail = await getFusionRecipeWithUserInfo({ 
                                        pack_collection_id: recipe.pack_collection_id, 
                                        pack_id: recipe.pack_id, 
                                        result_card_id: recipe.result_card_id 
                                      })
                                      setFusionDetail(detail)
                                      setFusionDetailOpen(true)
                                    } catch (error) {
                                      console.error('Failed to get fusion detail:', error)
                                      toast.error('Failed to load fusion recipe')
                                    } finally {
                                      setFusionDetailLoading(false)
                                    }
                                  }}
                                >
                                  {/* Source card image (the ingredient) - smaller */}
                                  <div className="relative w-8 h-10 flex-shrink-0">
                                    <Image
                                      src={sanitizeImageUrl(sourceCard?.image_url)}
                                      alt={sourceCard?.card_name || 'Source Card'}
                                      fill
                                      className="object-cover rounded"
                                    />
                                    {/* Fusion badge */}
                                    <div className="absolute -top-1 -right-1 bg-purple-600 text-white text-[8px] px-1 py-0.5 rounded-full font-bold">
                                      F
                                    </div>
                                  </div>
                                  
                                  <div className="flex-1">
                                    <p className="text-white font-medium text-[10px]">{sourceCard?.card_name || 'Unknown Card'}</p>
                                    <p className="text-gray-400 text-[8px]">
                                      Material for fusion
                                    </p>
                                  </div>
                                  
                                  {/* Show user quantity if available */}
                                  {typeof sourceCard?.user_quantity === 'number' && (
                                    <div className={`px-1 py-0.5 rounded text-[8px] ${
                                      sourceCard.user_quantity >= (sourceCard.quantity || 1) 
                                        ? 'bg-green-600 text-white' 
                                        : 'bg-red-600 text-white'
                                    }`}>
                                      {sourceCard.user_quantity}/{sourceCard.quantity || 1}
                                    </div>
                                  )}
                                  
                                  {/* Show source card point worth if available */}
                                  {typeof sourceCard?.point_worth === 'number' && (
                                    <div className="flex items-center gap-1 text-[10px] text-gray-300">
                                      <Image src="/users/coin.png" alt="Coin" width={8} height={8} />
                                      <span>{sourceCard.point_worth}</span>
                                    </div>
                                  )}
                                  
                                  {/* Click hint */}
                                  <div className="text-gray-500 text-[7px]">
                                    Click for recipe
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        ) : (
                          <div className="text-center py-3">
                            <p className="text-gray-400 text-xs">This card cannot be created through fusion</p>
                            <p className="text-gray-500 text-[10px] mt-1">
                              Only obtainable from card packs
                            </p>
                          </div>
                        )
                      )}
                      </div>
                      )}
                    </div>
                  )
                })()
                }
          </div>
            </div>
          </div>

          {/* Sticky footer with a clear Close button for mobile/desktop */}
          <div className="sticky bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-800 p-2 sm:p-3">
            <button
              aria-label="Close modal"
              onClick={() => { try { onClose(); } finally { setTimeout(() => forceUnlockBodyScroll(), 0); } }}
              className="w-full bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 sm:py-2.5 rounded-lg text-sm sm:text-base"
            >
              Close
            </button>
        </div>
        </div>
      </motion.div>
    </div>

      {/* Fusion Detail Modal */}
      {fusionDetailOpen && fusionDetail && (
        <div className="fixed inset-0 bg-black/70 z-[100000] flex items-end md:items-center justify-center md:p-4" role="dialog" aria-modal="true" onClick={() => setFusionDetailOpen(false)}>
          <motion.div 
className={`relative w-full bg-[#0F111C] border border-purple-500/50 overflow-hidden flex flex-col ${
              isMobile ? 'rounded-t-2xl max-h-[90vh]' : 'rounded-2xl max-w-5xl max-h-[90vh]'
            }`}
            style={{ 
              paddingTop: 'calc(env(safe-area-inset-top, 0px) + 4px)', 
              paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 4px)' 
            }} 
            onClick={(e) => e.stopPropagation()}
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.9 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <button 
              onClick={() => setFusionDetailOpen(false)} 
              className={`absolute text-white hover:text-purple-300 ${
                isMobile ? 'top-2 right-2' : 'top-3 right-3'
              }`}
            >
              <svg width={isMobile ? "20" : "24"} height={isMobile ? "20" : "24"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>

            <div className={`border-b border-gray-700 text-center flex-shrink-0 ${
              isMobile ? 'p-3' : 'p-4 hidden sm:block'
            }`}>
              <h3 className={`font-bold text-white ${isMobile ? 'text-lg' : 'text-xl'}`}>{fusionDetail.result_card_name || fusionDetail.result_card_id}</h3>
              <p className="text-gray-400 text-sm">Fusion Recipe</p>
            </div>

            <div className="p-4 space-y-6 overflow-y-auto flex-1" style={{ WebkitOverflowScrolling: 'touch' }}>
              {/* Result card (clickable to navigate to pack) — simplified for "Can be created from" modal */}
              <div className="flex justify-center">
                {fusionDetail ? (
                  <a href={`/packs/${(fusionDetail as any).pack_collection_id || (fusionDetail as any).card_collection_id}/${(fusionDetail as any).pack_id}`} title="Go to pack">
                    <div className="relative w-40 h-56 md:w-56 md:h-80 bg-gray-800 rounded-lg border border-purple-400/30 cursor-pointer hover:border-purple-400 transition-colors">
                      <Image src={sanitizeImageUrl((fusionDetail as any).result_card_image_url || (fusionDetail as any).result_card_image)} alt={fusionDetail.result_card_name || fusionDetail.result_card_id} fill className="object-cover rounded-lg" />
                      {(() => {
                        const pw = (fusionDetail as any).result_card_point_worth
                        return typeof pw === 'number' ? (
                          <div className="absolute top-2 right-2 bg-black/70 text-white text-xs rounded px-1.5 py-0.5 flex items-center gap-1">
                            <Image src="/users/coin.png" alt="Coin" width={12} height={12} />
                            <span>{pw}</span>
                          </div>
                        ) : null
                      })()
                      }
                    </div>
                  </a>
                ) : (
                  <div className="relative w-40 h-56 md:w-56 md:h-80 bg-gray-800 rounded-lg border border-purple-400/30" />
                )}
              </div>

              {/* Ingredients Section */}
              <div className="">
                <h4 className="text-white font-semibold mb-4 text-lg">Ingredients</h4>
<div className="grid grid-cols-3 md:grid-cols-4 gap-4">
                  {fusionDetail?.ingredients?.map((ingredient, index) => (
                    <div key={index} className="flex flex-col">
                      {/* Card name */}
                      <h5 className="text-white text-sm md:text-xs mb-2 text-center truncate">{ingredient.card_name}</h5>
                      {/* Card image with gradient border */}
                      <div className="relative aspect-[3/4] mb-2">
                        <div 
                          className="absolute inset-0 rounded-lg p-[2px]"
                          style={{
                            background: 'linear-gradient(135deg, #3B82F6, #8B5CF6, #EC4899)'
                          }}
                        >
                          <div className="w-full h-full bg-gray-900 rounded-lg overflow-hidden relative">
                            <Image
                              src={sanitizeImageUrl(ingredient.image_url)}
                              alt={ingredient.card_name}
                              fill
                              className="object-cover"
                            />
                            {/* Quantity indicator */}
                            <div className="absolute top-2 left-2 bg-black/80 text-white text-xs rounded px-1.5 py-0.5 flex items-center gap-1">
                              <span className="text-yellow-400 font-bold">x{ingredient.quantity || 1}</span>
                            </div>
                            {/* Point worth indicator */}
                            {typeof ingredient.point_worth === 'number' && (
                              <div className="absolute top-2 right-2 bg-black/80 text-white text-xs rounded px-1.5 py-0.5 flex items-center gap-1">
                                <Image src="/users/coin.png" alt="Coin" width={12} height={12} />
                                <span className="font-bold">{ingredient.point_worth}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      {/* User inventory status */}
                      <div className={`text-sm md:text-xs px-3 md:px-2 py-1.5 md:py-1 rounded-lg text-center font-bold ${
                        ingredient.has_enough 
                          ? 'bg-green-600 text-white' 
                          : 'bg-red-600 text-white'
                      }`}>
                        {ingredient.user_quantity || 0}/{ingredient.quantity || 1}
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
                        try { new Audio('/draw/fusion.wav').play().catch(() => {}) } catch {}
                        setTimeout(() => triggerLegendaryEffect(), 200)
                        toast.success('Fusion successful!')
                        try {
                          const updated = await getFusionRecipeWithUserInfo({
                            pack_collection_id: fusionDetail.pack_collection_id,
                            pack_id: fusionDetail.pack_id,
                            result_card_id: fusionDetail.result_card_id,
                          })
                          setFusionDetail(updated)
                        } catch {}
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
          </motion.div>
        </div>
      )}

      {/* Fusion success overlay showing result card - unified with inventory */}
      {fusionResultOpen && (
        <div className="fixed inset-0 z-[100000] flex items-end md:items-center justify-center md:p-4" role="dialog" aria-modal="true" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 8px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)' }}>
          <div className="absolute inset-0 bg-black/80" onClick={() => setFusionResultOpen(false)}></div>
          <canvas ref={confettiCanvasRef} className="absolute inset-0 w-full h-full pointer-events-none"></canvas>
          <motion.div 
            className={`relative z-10 bg-[#0F111C] border border-purple-500/50 shadow-2xl flex flex-col items-center overflow-y-auto ${
              isMobile ? 'rounded-t-2xl w-full max-h-[90vh] p-4' : 'rounded-2xl w-[min(92vw,420px)] max-h-[85vh] p-4 sm:p-6'
            }`}
            onClick={(e) => e.stopPropagation()}
            initial={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.9 }}
            animate={isMobile ? { y: 0 } : { opacity: 1, scale: 1 }}
            exit={isMobile ? { y: '100%' } : { opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
          >
            <h3 className="text-white text-lg sm:text-2xl font-bold mb-3 sm:mb-4">Fusion Result</h3>
            <div className="relative w-[72vw] max-w-[320px] aspect-[3/4] sm:w-64 sm:max-w-none">
              <Image src={sanitizeImageUrl((fusionResult as any)?.image_url)} alt={(fusionResult as any)?.card_name || (fusionResult as any)?.name || 'Fusion Result'} fill className="object-contain rounded-lg" />
            </div>
            <p className="text-white mt-3 text-sm sm:text-base truncate max-w-[80vw] sm:max-w-[320px]">{(fusionResult as any)?.card_name || (fusionResult as any)?.name || 'Unknown'}</p>
            <button className="mt-4 sm:mt-5 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg" onClick={() => setFusionResultOpen(false)} style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}>Confirm</button>
          </motion.div>
        </div>
      )}
    </div>
  )
}
