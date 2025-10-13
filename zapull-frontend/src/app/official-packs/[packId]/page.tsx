'use client'

import { useState, useEffect, useCallback, memo, useRef, use } from 'react'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { packsApi } from '@/lib/packsApi'
import { userApi } from '@/lib/userApi'
import { useAuthStore } from '@/store/authStore'
import styles from '../../packs/packs.module.css'
import PackCardDetailModal from '@/components/PackCardDetailModal'
import FusionBadge from '@/components/FusionBadge'
import { getPackColorTheme } from '@/lib/packColorUtils'
import CanvasVideoPlayer, { CanvasVideoPlayerRef } from '@/components/CanvasVideoPlayer'
import ParticleBurst from '@/components/ParticleBurst'
import CardPointsFilter from '@/components/CardPointsFilter'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'
import { lockBodyScroll, unlockBodyScroll, forceUnlockBodyScroll } from '@/lib/scrollLock'
import PackGuideModal from '@/components/PackGuideModal'
import PointsTopUpModal from '@/components/PointsTopUpModal'
import { audioManager, SOUND_PATHS, initializeAudioManager } from '@/lib/audioManager'
import { getDrawAnimationUrl, preloadDrawAnimation, isDrawAnimationCached } from '@/lib/videoCache'
import { getAuthHeaders } from '@/lib/authUtils'

// Guide Modal Component (same as main official packs page)
function OfficialPackGuideModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (isOpen) {
      // Lock body scroll when modal opens
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      
      // Add slide animation styles if they don't exist
      const styleId = 'modal-animation-styles'
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `
          @keyframes slide-up {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          @keyframes slide-down {
            from {
              transform: translateY(0);
              opacity: 1;
            }
            to {
              transform: translateY(100%);
              opacity: 0;
            }
          }
          .animate-slide-up {
            animation: slide-up 0.3s ease-out;
          }
          .animate-slide-down {
            animation: slide-down 0.3s ease-out;
          }
          @media (min-width: 768px) {
            .animate-slide-up,
            .animate-slide-down {
              animation: none;
            }
          }
        `
        document.head.appendChild(style)
      }
    } else {
      // Unlock body scroll when modal closes
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
    }
    
    // Cleanup function to ensure scroll is unlocked when component unmounts
    return () => {
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
      // Remove animation styles when component unmounts
      const existingStyle = document.getElementById('modal-animation-styles')
      if (existingStyle) {
        existingStyle.remove()
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-4"
      onClick={(e) => {
        // Close modal if clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
      style={{ overflow: 'hidden' }}
    >
      <div className={`bg-gradient-to-br from-[#1A1B2E] via-[#2A2B4E] to-[#1A1B2E] rounded-xl max-w-2xl w-full max-h-[70vh] sm:max-h-[85vh] overflow-y-auto border border-purple-500/30 shadow-2xl transition-all duration-300 ease-out ${
        isOpen 
          ? 'md:animate-none animate-slide-up translate-y-0 opacity-100' 
          : 'md:animate-none animate-slide-down translate-y-full opacity-0'
      } md:rounded-xl rounded-t-xl md:mb-0 mb-0 md:mt-0 mt-auto`}>
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Official Odds Packs Guide</h2>
            <p className="text-gray-300 text-sm">Authentic card experiences with guaranteed value</p>
          </div>

          {/* Key Benefits - Compact Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="bg-gradient-to-r from-purple-600/20 to-purple-800/20 p-3 rounded-lg border border-purple-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">🎴</span>
                <h3 className="text-sm font-bold text-white">Official Odds</h3>
              </div>
              <p className="text-gray-300 text-xs">Same Pull Rates as Official Packs</p>
            </div>
            
            <div className="bg-gradient-to-r from-green-600/20 to-green-800/20 p-3 rounded-lg border border-green-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">💰</span>
                <h3 className="text-sm font-bold text-white">Lower Price</h3>
              </div>
              <p className="text-gray-300 text-xs">No scalper markups</p>
            </div>
            
            <div className="bg-gradient-to-r from-yellow-600/20 to-yellow-800/20 p-3 rounded-lg border border-yellow-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">⚡</span>
                <h3 className="text-sm font-bold text-white">Instant Buyback</h3>
              </div>
              <p className="text-gray-300 text-xs">Sell cards back instantly</p>
            </div>
            
            <div className="bg-gradient-to-r from-blue-600/20 to-blue-800/20 p-3 rounded-lg border border-blue-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">📦</span>
                <h3 className="text-sm font-bold text-white">Ship to Door</h3>
              </div>
              <p className="text-gray-300 text-xs">Easy physical withdrawal</p>
            </div>
          </div>

          {/* Pack Structure */}
          <div className="bg-gradient-to-r from-orange-600/20 to-orange-800/20 p-4 rounded-lg border border-orange-500/30 mb-6">
            <div className="flex items-center mb-3">
              <span className="text-2xl mr-2">📦</span>
              <h3 className="text-lg font-bold text-white">10 Cards per Pack</h3>
            </div>
            
            {/* Exact Slot Structure */}
            <div className="bg-black/30 p-3 rounded-lg">
              <h4 className="text-sm font-bold text-white mb-2">🎯 Exact Slot Configuration:</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-300">Common:</span>
                  </span>
                  <span className="text-green-400 font-semibold">4 slots - even probability</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-300">Uncommon:</span>
                  </span>
                  <span className="text-blue-400 font-semibold">3 slots - even probability</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-gray-300">Reverse Holo:</span>
                  </span>
                  <span className="text-purple-400 font-semibold">2 slots - weighted probability</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-gray-300">Rare+:</span>
                  </span>
                  <span className="text-orange-400 font-semibold">1 slot - guaranteed rare+</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-600">
                <p className="text-xs text-gray-400">💡 Purple reverse holo probabilities: Common(5), Uncommon(4), Rare(1)</p>
                <p className="text-xs text-gray-400">🎯 Orange slot: 100% total probability for rare and above cards</p>
              </div>
            </div>
          </div>

          {/* Close Button */}
          <div className="text-center">
            <button 
              onClick={onClose}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 w-full sm:w-auto"
            >
              Start Opening Packs! 🎴
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Simple helper to optimize images with Cloudflare Image Resizing
const optimizeImage = (url: string, options: { quality?: number; width?: number; height?: number } = {}) => {
  if (!url) return url
  
  try {
    // Extract the domain from the image URL
    const urlObj = new URL(url)
    const domain = urlObj.origin
    const path = urlObj.pathname + urlObj.search
    
    const { quality = 80, width, height } = options
    const params = [`format=auto`, `quality=${quality}`]
    
    if (width) params.push(`width=${width}`)
    if (height) params.push(`height=${height}`)
    
    return `${domain}/cdn-cgi/image/${params.join(',')}${path}`
  } catch {
    return url
  }
}

const imageLoader = ({ src }: { src: string }) => {
  return src
}

// Types for Official Packs API
interface PackInfo {
  id: string
  name: string
  description?: string
  price: number
  popularity: number
  image_url?: string
  card_count: number
}

interface CardInfo {
  id: string
  card_id: string
  card_name: string
  name?: string
  image_url?: string
  rarity: number
  probability: number
  point_worth?: number
}

interface OfficialPack {
  id: string
  name: string
  image_url?: string
  price?: number
  total_cards?: number
  card_count?: number
}

interface DrawResult {
  cards: Array<{
    slot: number
    card_id: string
    card_name: string
    card_image_url?: string
    rarity: number
    probability: number
    point_worth: number
    pack_number: number
    color?: string
  }>
}

export default function OfficialPackDetailsPage({ params }: { params: Promise<{ packId: string }> }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { uid, userInfo, token } = useAuthStore()
  const user = uid && token ? { ...userInfo, uid, token } : null
  const { packId } = use(params)
  
  // Extended interface for card sections
  interface CardSection {
    color: string
    cards: CardInfo[]
    slot_info?: string
    probability_info?: string
    cards_per_pack?: number
  }

  // State management
  const [pack, setPack] = useState<OfficialPack | null>(null)
  const [cardSections, setCardSections] = useState<CardSection[]>([])
  const [loading, setLoading] = useState(true)
  const [cardsLoading, setCardsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [drawCount, setDrawCount] = useState(1)
  const [isDrawing, setIsDrawing] = useState(false)
  const [showParticles, setShowParticles] = useState(false)
  const [isAnimating, setIsAnimating] = useState(false)
  const [selectedCard, setSelectedCard] = useState<CardInfo | null>(null)
  const [showGuideModal, setShowGuideModal] = useState(false)
  const [showTopUpModal, setShowTopUpModal] = useState(false)
  const [drawResults, setDrawResults] = useState<DrawResult | null>(null)
  const [showResults, setShowResults] = useState(false)
  const [showCardAnimation, setShowCardAnimation] = useState(false)
  const [revealedCards, setRevealedCards] = useState<any[]>([])
  const [isRevealing, setIsRevealing] = useState(false)
  const [burstEffects, setBurstEffects] = useState<any[]>([])
  const cardRefs = useRef<(HTMLElement | null)[]>([])  
  const videoPlayerRef = useRef<CanvasVideoPlayerRef>(null)
  const [pointsFilter, setPointsFilter] = useState<{min?: number, max?: number}>({})  
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [selectedCards, setSelectedCards] = useState<boolean[]>([])  
  const [animationSkipped, setAnimationSkipped] = useState(false)
  const [showDrawModal, setShowDrawModal] = useState(false)
  const [showGif, setShowGif] = useState(true)
  const [flipAudio, setFlipAudio] = useState<HTMLAudioElement | null>(null)
  const [rarityAudios, setRarityAudios] = useState<{[key: number]: HTMLAudioElement}>({})
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string>('')
  const [videoLoadProgress, setVideoLoadProgress] = useState<number>(0)
  const [skipEnabled, setSkipEnabled] = useState<boolean>(false)
  const [demoMode, setDemoMode] = useState<boolean>(false)
  const [isDemoDrawing, setIsDemoDrawing] = useState(false)
  const skipTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  
  // Video dimensions calculation (same as normal pack)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const calcW = Math.min(vw * 0.98, 1200) // nearly full width on mobile
  const calcH = Math.min(vh * 0.92, 900)  // taller box so portrait videos fill better
  
  // Particle burst states for celebration effects
  const [particleBursts, setParticleBursts] = useState<Array<{
    id: string;
    color: 'orange' | 'red' | 'purple' | 'blue' | 'green';
    position: { x: number; y: number };
    trigger: boolean;
    intensity?: number;
  }>>([])
  
  // Initialize audio manager (same as normal pack)
  useEffect(() => {
    // Initialize audio manager
    initializeAudioManager().catch(error => {
      console.warn('Failed to initialize audio manager:', error);
    });
  }, []);
  
  // Initialize flip sound and rarity sounds
  useEffect(() => {
    const audio = new Audio('/draw/flip-sound.wav')
    audio.preload = 'auto'
    setFlipAudio(audio)
    
    // Initialize rarity-specific sounds
    const rarityAudioMap: {[key: number]: HTMLAudioElement} = {}
    for (let i = 1; i <= 3; i++) {
      const rarityAudio = new Audio(`/draw/rarity-${i}.wav`)
      rarityAudio.preload = 'auto'
      rarityAudioMap[i] = rarityAudio
    }
    setRarityAudios(rarityAudioMap)
  }, [])
  
  
  // Get card back color for unrevealed cards - use API color directly like normal packs
  const getCardBackColor = (card: any) => {
    return card.color || 'green'
  }
  
  useEffect(() => {
    const fetchPack = async () => {
      if (!packId) {
        console.log('Waiting for packId:', { packId })
        return
      }

      try {
        console.log('Fetching pack:', packId)
        const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/official-odds/packs/${packId}`, {
          headers: {
            'Content-Type': 'application/json',
          },
        })
        
        console.log('Pack fetch response status:', response.status)
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }
        
        const data = await response.json()
        console.log('Pack data received:', data)
        setPack(data)
      } catch (error) {
        console.error('Error fetching pack:', error)
        setError('Failed to load pack details')
      } finally {
        setLoading(false)
      }
    }

    fetchPack()
  }, [packId])

  // Fetch pack cards
  const fetchPackCards = useCallback(async () => {
    if (!packId) {
      console.log('Waiting for packId for cards:', { packId })
      return
    }

    setCardsLoading(true)
    try {
      console.log('Fetching cards for pack:', packId)
      
      // Create headers with authorization if user is logged in, otherwise just content-type
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      }
      
      if (user?.token) {
        headers['Authorization'] = `Bearer ${user.token}`
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/official-odds/packs/${packId}/cards`, {
        headers,
      })
      
      if (!response.ok) {
        throw new Error(`Failed to fetch cards: ${response.status}`)
      }
      
      const cardsData = await response.json()
      console.log('Cards data received:', cardsData)
      
      // Handle the actual API response structure with sections array
      let sections = []
      
      if (cardsData.sections && Array.isArray(cardsData.sections)) {
        // Convert API sections format to component format, preserving slot_info and probability_info
        sections = cardsData.sections.map((section: any) => ({
          color: section.color,
          cards: section.cards || [],
          slot_info: section.slot_info || '',
          probability_info: section.probability_info || '',
          cards_per_pack: section.cards_per_pack || 0
        }))
      } else {
        // Fallback for direct color keys format
        sections = [
          { color: 'orange', cards: cardsData.orange || [], slot_info: '', probability_info: '', cards_per_pack: 0 },
          { color: 'purple', cards: cardsData.purple || [], slot_info: '', probability_info: '', cards_per_pack: 0 },
          { color: 'blue', cards: cardsData.blue || [], slot_info: '', probability_info: '', cards_per_pack: 0 },
          { color: 'green', cards: cardsData.green || [], slot_info: '', probability_info: '', cards_per_pack: 0 }
        ]
      }
      
      console.log('Card sections:', sections)
      setCardSections(sections)
      
    } catch (err) {
      console.error('Error fetching cards:', err)
    } finally {
      setCardsLoading(false)
    }
  }, [packId, user?.token])

  // Fetch cards when pack and user are available
  useEffect(() => {
    // Fetch pack cards regardless of authentication status (same as normal pack page)
    if (pack) {
      fetchPackCards()
    }
  }, [pack, fetchPackCards])

  // Handle demo pack drawing (no authentication required)
  const handleDemoOpen = async () => {
    console.log('Demo draw button clicked', { isDemoDrawing, pack })
    
    if (isDemoDrawing || isDrawing) {
      console.log('Demo draw blocked: already drawing')
      return
    }
    
    try {
      setIsDemoDrawing(true)
      setDemoMode(true)
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/official-odds/demo-draw/${packId}?count=${drawCount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Demo draw failed:', errorText)
        throw new Error(`Failed to demo draw pack: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      setDrawResults(result)
      
      // Play draw sound
      audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })
      
      // Start draw animation modal (video) before showing results
      setShowDrawModal(true)
      setShowGif(true)
      setAnimationSkipped(false)
      lockBodyScroll() // Lock scroll when draw modal opens
      
      // Get cached video URL
      try {
        const videoUrl = await getDrawAnimationUrl((progress) => {
          setVideoLoadProgress(progress);
        });
        setCachedVideoUrl(videoUrl);
      } catch (error) {
        console.warn('Failed to get cached video URL, using fallback:', error);
        setCachedVideoUrl(''); // Use fallback URL
      }
      
      // Auto-skip animation after video duration, or immediately if skip is enabled
      // Use same timing as normal pack opening - let video play to completion
      skipTimeoutRef.current = setTimeout(() => {
        handleSkipAnimation()
      }, skipEnabled ? 100 : 5000) // Skip immediately if skip is enabled, otherwise 5 seconds to match video duration
      
    } catch (err) {
      console.error('Error demo drawing pack:', err)
      toast.error('Failed to demo draw pack. Please try again.')
    } finally {
      setIsDemoDrawing(false)
    }
  }

  // Handle pack drawing
  const handleDraw = async () => {
    console.log('Draw button clicked', { user, isDrawing, pack })
    
    if (isDrawing || isDemoDrawing) {
      console.log('Draw blocked: already drawing')
      return
    }
    
    // If user is not logged in, show login modal
    if (!user) {
      console.log('User not logged in, showing login modal')
      useAuthStore.getState().openLoginModal()
      return
    }
    
    // Check if user has enough points
    const totalCost = (pack?.price || 0) * drawCount
    console.log('Checking points:', { userPoints: (user as any).points, totalCost })
    
    if ((user as any).points < totalCost) {
      console.log('Not enough points, showing top-up modal')
      setShowTopUpModal(true)
      return
    }
    
    try {
      setIsDrawing(true)
      setDemoMode(false)
      
      // Get auth headers with automatic token refresh
      const authHeaders = await getAuthHeaders()
      
      // Ensure we have authorization header
      if (!authHeaders.Authorization) {
        throw new Error('Failed to get authentication token')
      }
      
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/official-odds/draw/${packId}?count=${drawCount}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeaders.Authorization
        }
      })
      
      if (!response.ok) {
        const errorText = await response.text()
        console.error('Draw failed:', errorText)
        throw new Error(`Failed to draw pack: ${response.status} - ${errorText}`)
      }
      
      const result = await response.json()
      setDrawResults(result)
      
      // Check achievements after drawing cards (same as normal pack drawing)
      try {
        const { checkDrawAchievementsGlobal } = await import('@/lib/achievementChecker')
        checkDrawAchievementsGlobal().catch(() => undefined)
      } catch (error) {
        // Silently ignore achievement check errors
      }
      
      // Refresh user points using the same method as normal pack page
      try {
        const pointsData = await userApi.getUserPointsBalance()
        // Update the userInfo in the auth store with the latest points balance
        const { setUserInfo } = useAuthStore.getState()
        setUserInfo(prevInfo => ({
          ...prevInfo,
          pointsBalance: pointsData.pointsBalance,
          totalPointsSpent: pointsData.totalPointsSpent,
          totalCashRecharged: pointsData.totalCashRecharged
        }))
      } catch (error) {
        console.error('Failed to refresh user points:', error)
        // Fallback to local calculation if API fails
        const updatedUser = { ...(user as any), points: (user as any).points - totalCost }
        useAuthStore.setState({ userInfo: updatedUser })
      }
      
      // Play draw sound (same as normal pack)
      audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })
      
      // Start draw animation modal (video) before showing results
      setShowDrawModal(true)
      setShowGif(true)
      setAnimationSkipped(false)
      lockBodyScroll() // Lock scroll when draw modal opens
      
      // Get cached video URL (same as normal pack drawing)
      try {
        const videoUrl = await getDrawAnimationUrl((progress) => {
          setVideoLoadProgress(progress);
        });
        setCachedVideoUrl(videoUrl);
      } catch (error) {
        console.warn('Failed to get cached video URL, using fallback:', error);
        setCachedVideoUrl(''); // Use fallback URL
      }
      
      
      // Auto-skip animation after video duration, or immediately if skip is enabled
      // Use same timing as normal pack opening - let video play to completion
      skipTimeoutRef.current = setTimeout(() => {
        handleSkipAnimation()
      }, skipEnabled ? 100 : 5000) // Skip immediately if skip is enabled, otherwise 5 seconds to match video duration
      
    } catch (err) {
      console.error('Error drawing pack:', err)
      toast.error('Failed to draw pack. Please try again.')
    } finally {
      setIsDrawing(false)
    }
  }

  // Handle skip animation
  const handleSkipAnimation = () => {
    // Clear any pending skip timeout to prevent duplicate transitions
    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current)
      skipTimeoutRef.current = null
    }
    
    // Only transition if we're still in the draw modal state
    if (!showDrawModal) return
    
    setShowDrawModal(false)
    setShowGif(false)
    setShowCardAnimation(true) // Show card reveal stack instead of going directly to results
    setRevealedCards([])
    setIsRevealing(false)
    // Keep body scroll locked - card animation modal should also prevent scrolling
  }
  
  // Handle single card reveal on click
  const revealNextCard = () => {
    if (!drawResults?.cards || animationSkipped) return
    
    const cards = drawResults.cards
    if (revealedCards.length < cards.length) {
      const currentCard = cards[revealedCards.length]
      
      // Initialize audio context on first user interaction
      audioManager.initializeOnUserInteraction()
      
      // Play flip sound and rarity sound (same as normal pack)
      audioManager.playSound(SOUND_PATHS.FLIP, { volume: 0.7 })
      
      // Play color-specific rarity sound based on card color
      const cardColor = currentCard.color || 'green'
      let raritySound = null
      if (cardColor === 'red') {
        raritySound = SOUND_PATHS.RARITY_3 // Red uses rarity-3 sound
      } else if (cardColor === 'orange') {
        raritySound = SOUND_PATHS.RARITY_2 // Orange uses rarity-2 sound  
      } else if (cardColor === 'purple') {
        raritySound = SOUND_PATHS.RARITY_1 // Purple uses rarity-1 sound
      }
      
      // Play rarity sound for special cards (reduced delay for faster feel)
      if (raritySound) {
        setTimeout(() => {
          audioManager.playSound(raritySound!, { volume: 0.8, interrupt: true })
        }, 100)
      }
      
      setRevealedCards(prev => [...prev, currentCard])
      
      // Trigger particle burst for special color cards AFTER card is added to revealed
      if (cardColor === 'orange' || cardColor === 'red' || cardColor === 'purple') {
        // Use setTimeout to ensure the card is rendered before getting position (reduced delay)
        setTimeout(() => {
          // Get the revealed cards container position for better particle positioning
          // Use more specific selector to get the actual revealed card pile
          const revealedContainer = document.querySelector('.cardPilesContainer .cardPile:last-child')
          let centerX = window.innerWidth / 2
          let centerY = window.innerHeight / 2
          
          if (revealedContainer) {
            const rect = revealedContainer.getBoundingClientRect()
            centerX = rect.left + rect.width / 2
            centerY = rect.top + rect.height / 2
          }
          
          // Always use viewport coordinates for particle positioning on mobile
          // This ensures particles appear at the correct position regardless of scroll state
          if (window.visualViewport) {
            // Visual viewport gives us the actual visible area
            // No need to subtract offsets - getBoundingClientRect already gives viewport-relative coords
            // Just ensure we're within the visual viewport bounds
          }
          
          const burstId = `burst-${Date.now()}-${Math.random()}`
          const burstIntensity = cardColor === 'red' ? 1.5 : 
                                 cardColor === 'orange' ? 1.3 : 1.1
          
          // Trigger particle burst for rare card
          
          setParticleBursts(prev => [...prev, {
            id: burstId,
            color: cardColor as 'orange' | 'red' | 'purple',
            position: {
              x: centerX,
              y: centerY
            },
            trigger: true,
            intensity: burstIntensity
          }])
          
          // Remove burst after animation completes
          setTimeout(() => {
            setParticleBursts(prev => prev.filter(b => b.id !== burstId))
          }, 3000)
        }, 150)
      }
      
    }
    
    // If all cards revealed, show final results (longer delay for dramatic effect on last card)
    if (revealedCards.length + 1 >= cards.length) {
      setTimeout(() => {
        setShowResults(true)
        setShowCardAnimation(false)
      }, 1500)
    }
  }

  // Skip animation - for card reveal stage
  const skipAnimation = () => {
    // Clear any pending skip timeout from draw animation
    if (skipTimeoutRef.current) {
      clearTimeout(skipTimeoutRef.current)
      skipTimeoutRef.current = null
    }
    
    setAnimationSkipped(true)
    setIsRevealing(false)
    setRevealedCards(drawResults?.cards || [])
    setTimeout(() => {
      setShowResults(true)
      setShowCardAnimation(false)
    }, 300)
  }

  // Get total cards to show in stack based on draw count
  const getStackedCardCount = (drawCount: number) => {
    switch (drawCount) {
      case 1: return 10
      case 3: return 30 
      case 5: return 50
      default: return 10
    }
  }

  // Initialize selected cards when draw results change
  useEffect(() => {
    if (drawResults?.cards) {
      setSelectedCards(new Array(drawResults.cards.length).fill(false))
    }
  }, [drawResults])

  // Handle card selection toggle
  const handleCardSelect = (index: number) => {
    setSelectedCards(prev => {
      const newSelected = [...prev]
      newSelected[index] = !newSelected[index]
      return newSelected
    })
  }

  // Get filtered cards based on points filter
  const getFilteredCards = () => {
    if (!drawResults?.cards) return []
    return drawResults.cards.map((card, index) => ({ card, index })).filter(({ card }) => {
      const points = card.point_worth || 0
      const matchesMin = pointsFilter.min === undefined || points >= pointsFilter.min
      const matchesMax = pointsFilter.max === undefined || points <= pointsFilter.max
      return matchesMin && matchesMax
    })
  }

  // Get selected cards from filtered cards
  const getSelectedFilteredCards = () => {
    const filteredCards = getFilteredCards()
    return filteredCards.filter(({ index }) => selectedCards[index])
  }

  // Show confirmation dialog before redeeming cards
  const handleRedeemClick = () => {
    const selectedFilteredCards = getSelectedFilteredCards()
    if (selectedFilteredCards.length === 0) return
    setShowConfirmDialog(true)
  }

  // Handle redeem cards - use same logic as normal pack drawing
  const handleRedeem = async () => {
    const selectedFilteredCards = getSelectedFilteredCards()
    if (selectedFilteredCards.length === 0) return
    setShowConfirmDialog(false)
    
    const cardIds = selectedFilteredCards.map(({ card }) => (card as any).id)
    
    try {
      const cardsToDestroy = cardIds.map(cardId => ({
        card_id: cardId,
        quantity: 1,
        subcollection_name: 'pokemon' // Hardcode pokemon for official packs
      }))
      
      const result = await userApi.batchDestroyCards(cardsToDestroy)
      
      // Calculate level and check achievements after drawing cards
      try {
        // First call calculate level endpoint
        const { achievementApi } = await import('@/lib/achievementApi')
        await achievementApi.calculateUserLevel()
        
        // Then check achievements
        const { checkDrawAchievementsGlobal } = await import('@/lib/achievementChecker')
        checkDrawAchievementsGlobal().catch(() => undefined)
      } catch (error) {
        // Silently ignore level calculation and achievement check errors
      }
      
      // Refresh user points using the same method as normal pack page
      if (result.points_added) {
        try {
          const pointsData = await userApi.getUserPointsBalance()
          // Update the userInfo in the auth store with the latest points balance
          const { setUserInfo } = useAuthStore.getState()
          setUserInfo(prevInfo => ({
            ...prevInfo,
            pointsBalance: pointsData.pointsBalance,
            totalPointsSpent: pointsData.totalPointsSpent,
            totalCashRecharged: pointsData.totalCashRecharged
          }))
        } catch (error) {
          console.error('Failed to refresh user points:', error)
          // Fallback to local calculation if API fails
          const authState = useAuthStore.getState()
          const currentUser = authState.userInfo
          if (currentUser) {
            const updatedUser = {
              ...currentUser,
              points: (currentUser.points || 0) + result.points_added
            }
            useAuthStore.setState({ userInfo: updatedUser })
          }
        }
      }
      
      setShowResults(false)
      setDrawResults(null)
      setRevealedCards([])
      setShowCardAnimation(false)
      
      // Unlock body scroll since all modals are now closed
      forceUnlockBodyScroll()
      
      toast.success(`Successfully redeemed ${result.cards_destroyed || cardIds.length} cards for ${Number(result.points_added) || 0} points! Current balance: ${Number(result.remaining_points) || 0} points!`)
    } catch (error) {
      console.error('Error destroying cards:', error)
      toast.error('Failed to destroy cards')
    }
  }

  // Initialize data
  useEffect(() => {
    // Initialize particle burst effects
    const initializeParticleBursts = async () => {
      // Add your particle burst effects initialization code here
    }
    initializeParticleBursts()
  }, [])

  return (
    <div className={styles.container}>
      {/* Top navigation bar - same as normal pack page */}
      <div className={`flex items-center justify-between p-4 relative z-20 ${styles.topBar}`}>
        {/* Back button */}
        <button 
          onClick={() => router.back()}
          className="flex items-center text-white hover:text-gray-300 transition-colors bg-[#1E1F35] rounded-lg px-4 py-2"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span>Back</span>
        </button>

        {/* Guide button */}
        <div 
          className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg p-3"
          onClick={() => setShowGuideModal(true)}
        >
          <div className="text-white font-medium flex items-center justify-center">
            <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
          </div>
          <div className="text-gray-400 text-xs">Guide</div>
        </div>
      </div>
      
      {/* Pack details - same structure as normal pack page */}
      <div className="w-full relative z-10">
        <h1 className={`text-3xl font-bold text-center mb-8 ${styles.pageTitle}`}>{pack?.name || 'Loading...'}</h1>
        
        {/* Pack detail container - left-right layout like normal pack */}
        <div className={`gap-8 mb-12 ${styles.packDetailContainer} ${styles.infoContainer}`}>
          {/* Left side - Pack image */}
          <div className={`md:w-1/2 ${styles.imageWrapper}`}>
            <div className={`aspect-square w-full ${styles.packImageContainer} relative rounded-lg p-[2px] ${getPackColorTheme(pack?.price || 0).boxShadow}`}>
              <div className={`absolute inset-0 rounded-lg ${getPackColorTheme(pack?.price || 0).bgGradient} opacity-60`} />
              <div className="relative w-full h-full rounded-lg overflow-hidden p-2" style={{ background: 'transparent' }}>
                {pack?.image_url ? (
                  <Image 
                    src={pack.image_url}
                    alt={pack?.name || 'Pack'} 
                    fill
                    className="object-contain"
                    priority
                    loader={imageLoader}
                  />
                ) : (
                  <div className="w-full h-full bg-gray-800 rounded-lg flex items-center justify-center">
                    <div className="text-center text-gray-400">
                      <div className="text-6xl mb-4">📦</div>
                      <div>No Image Available</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Right side - Pack info and controls */}
          <div className={`md:w-1/2 flex flex-col justify-center ${styles.infoWrapper}`}>
            <div className={styles.rightPanelContainer}>
              {/* Button group like normal pack page */}
              <div className={`${styles.buttonGroup} mb-6`}>
                {/* Number buttons */}
                <div className={styles.numberButtonGroup}>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 1 ? styles.active : ''}`}
                    onClick={() => setDrawCount(1)}
                  >
                    1x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 3 ? styles.active : ''}`}
                    onClick={() => setDrawCount(3)}
                  >
                    3x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 5 ? styles.active : ''}`}
                    onClick={() => setDrawCount(5)}
                  >
                    5x
                  </button>
                </div>
                
                {/* Skip button */}
                <div className={styles.iconButtonWrapper}>
                  <button 
                    className={`${styles.iconButton} ${skipEnabled ? styles.active : ''}`}
                    onClick={() => setSkipEnabled(!skipEnabled)}
                  >
                    <span>⏭️</span>
                    <span>Skip</span>
                  </button>
                </div>
              </div>

              {/* Demo button - no login required */}
              <button 
                onClick={handleDemoOpen}
                disabled={isDemoDrawing || isDrawing}
                className={`${styles.openButton} mb-4`}
                style={{ 
                  background: 'linear-gradient(135deg, #4CAF50 0%, #45a049 100%)',
                  opacity: (isDemoDrawing || isDrawing) ? 0.6 : 1
                }}
              >
                <span>🎮</span>
                {isDemoDrawing ? 'Demo Opening...' : `Demo Open (Free Preview)`}
              </button>

              {/* Main draw button */}
              <button 
                onClick={handleDraw}
                disabled={isDrawing || isDemoDrawing}
                className={`${styles.openButton} ${styles.buttonPulse} mb-6`}
                style={{ 
                  background: getPackColorTheme(pack?.price || 0).buttonBg,
                  opacity: (isDrawing || isDemoDrawing) ? 0.6 : 1
                }}
              >
                <Image src="/users/coin.png" alt="Coin" width={20} height={20} />
                {isDrawing ? 'Opening...' : (
                  <span className="flex items-center gap-2">
                    Open For <Image src="/users/coin.png" alt="Coin" width={16} height={16} /> {(pack?.price || 0) * drawCount}.00
                  </span>
                )}
              </button>

              {/* Stats - like normal pack page */}
              <div className={styles.statsContainer}>
                <div className={styles.statItem}>
                  <div className={styles.statLabel}>Cards per pack</div>
                  <div className={styles.statValue} style={{ color: '#4FC3F7' }}>10</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statLabel}>Pack cost</div>
                  <div className={styles.statValue} style={{ color: '#42A5F5' }}>
                    <div className="flex items-center gap-1">
                      <Image src="/users/coin.png" alt="Coin" width={16} height={16} />
                      {pack?.price || 0}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cards Grid Section - matching normal pack page */}
      <div className={styles.cardsSection}>
        {cardSections.map((section, sectionIndex) => {
          // Color-specific styling matching normal pack page
          const getColorStyles = (color: string) => {
            switch(color) {
              case 'orange':
                return {
                  headerColor: '#FF9800',
                  borderColor: 'border-orange-500',
                  bgGradient: 'from-orange-500/20 to-orange-600/10',
                  glowColor: 'shadow-orange-500/30'
                }
              case 'purple': 
                return {
                  headerColor: '#9C27B0',
                  borderColor: 'border-purple-500',
                  bgGradient: 'from-purple-500/20 to-purple-600/10',
                  glowColor: 'shadow-purple-500/30'
                }
              case 'blue':
                return {
                  headerColor: '#2196F3', 
                  borderColor: 'border-blue-500',
                  bgGradient: 'from-blue-500/20 to-blue-600/10',
                  glowColor: 'shadow-blue-500/30'
                }
              case 'green':
                return {
                  headerColor: '#4CAF50',
                  borderColor: 'border-green-500', 
                  bgGradient: 'from-green-500/20 to-green-600/10',
                  glowColor: 'shadow-green-500/30'
                }
              default:
                return {
                  headerColor: '#666',
                  borderColor: 'border-gray-500',
                  bgGradient: 'from-gray-500/20 to-gray-600/10', 
                  glowColor: 'shadow-gray-500/30'
                }
            }
          }
          
          const colorStyle = getColorStyles(section.color)
          
          return (
            <div key={section.color} className={`${styles.colorSection} mb-12`}>
              <div className="text-center mb-8">
                <h2 className={`${styles.colorTitle} text-3xl font-bold mb-2`} style={{ color: colorStyle.headerColor }}>
                  {section.color.charAt(0).toUpperCase() + section.color.slice(1)} Cards
                </h2>
                
                <div className="mb-4">
                  {(section.cards_per_pack || 0) > 0 && (
                    <span className="text-sm text-gray-400">({section.cards_per_pack} per pack)</span>
                  )}
                </div>
                
                {/* Probability info */}
                <div className="text-sm text-gray-400">
                  {(section.color === 'blue' || section.color === 'green') ? 
                    'Probability is evenly distributed' :
                  section.color === 'orange' ? 
                    'Rare+ cards - total probability 100%, guaranteed 1 per pack' :
                  section.color === 'purple' ? 
                    'There are more cards in this rarity' :
                    (section.probability_info || 'Evenly distributed probabilities')
                  }
                </div>
              </div>

              <div className={`grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-8 gap-3 sm:gap-4`}>
                {section.cards.map((card: CardInfo, index: number) => {
                  // Get RGB color values for styling (matching normal pack page exactly)
                  const getRGBColor = (color: string) => {
                    switch(color) {
                      case 'orange': return '255, 152, 0'    // #FF9800
                      case 'purple': return '156, 39, 176'   // #9C27B0
                      case 'blue': return '33, 150, 243'     // #2196F3
                      case 'green': return '76, 175, 80'     // #4CAF50
                      default: return '102, 102, 102'        // #666
                    }
                  }
                  
                  const rgbColor = getRGBColor(section.color)
                  
                  // Debug logging for first card in each section
                  if (index === 0) {
                    console.log(`${section.color} card data:`, card);
                  }
                  
                  return (
                    <div 
                      key={`${(card as any).id}-${index}`}
                      className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all duration-300 hover:scale-105 cursor-pointer ${
                        selectedCards[index] ? 'ring-4 ring-purple-500' : ''
                      }`}
                      style={{
                        border: `2px solid rgb(${rgbColor})`,
                        boxShadow: `0 4px 12px rgba(${rgbColor}, 0.3)`,
                        background: `linear-gradient(135deg, rgba(${rgbColor}, 0.1) 0%, rgba(${rgbColor}, 0.05) 100%)`
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        setSelectedCard(card)
                      }}
                    >
                      {/* Card image */}
                      <div className="aspect-[3/4] relative overflow-hidden">
                        {card.image_url ? (
                          <Image 
                            src={optimizeImage(card.image_url, { width: 300, height: 400, quality: 85 })}
                            alt={card.name} 
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                            className="object-cover"
                            loader={imageLoader}
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full bg-gray-700 text-gray-400">
                            No Image
                          </div>
                        )}
                        
                        {/* Card info overlay */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-90 text-white px-2 py-2">
                          <p className="truncate font-medium text-xs sm:text-sm mb-1">{card.name || 'Unknown Card'}</p>
                          <div className="flex justify-between items-center text-xs sm:text-sm">
                            <span className="flex items-center gap-1 font-medium">
                              <Image src="/users/coin.png" alt="Coin" width={14} height={14} />
                              {card.point_worth || '0'}
                            </span>
                            {section.color === 'orange' && (
                              <span className="font-medium">
                                {(() => {
                                  const p = Number(card.probability);
                                  if (Number.isFinite(p) && p > 0) {
                                    return `${p.toFixed(2)}%`;
                                  }
                                  return 'N/A';
                                })()}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                
                {/* Add "and more..." card for purple, green, and blue sections */}
                {(section.color === 'purple' || section.color === 'green' || section.color === 'blue') && (() => {
                  const getRGBColor = (color: string) => {
                    switch(color) {
                      case 'orange': return '255, 152, 0'    // #FF9800
                      case 'purple': return '156, 39, 176'   // #9C27B0
                      case 'blue': return '33, 150, 243'     // #2196F3
                      case 'green': return '76, 175, 80'     // #4CAF50
                      default: return '102, 102, 102'        // #666
                    }
                  }
                  const rgbColor = getRGBColor(section.color)
                  return (
                    <div 
                      className="relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all duration-300 hover:scale-105 cursor-pointer"
                      style={{
                        border: `2px solid rgb(${rgbColor})`,
                        boxShadow: `0 4px 12px rgba(${rgbColor}, 0.3)`,
                        background: `linear-gradient(135deg, rgba(${rgbColor}, 0.2) 0%, rgba(${rgbColor}, 0.1) 100%)`
                      }}
                    >
                      <div className="flex items-center justify-center h-full bg-gray-800 text-white">
                        <div className="text-center p-4">
                          <div className="text-2xl mb-2">✨</div>
                          <div className="text-sm font-medium">And more...</div>
                          <div className="text-xs text-gray-300 mt-1">
                            More cards available
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Particle Burst Effects */}
      {particleBursts.map((burst) => (
        <ParticleBurst
          key={burst.id}
          color={burst.color}
          position={burst.position}
          trigger={burst.trigger}
          intensity={burst.intensity || 1}
        />
      ))}

      {/* Card Animation Modal - Mobile Centered */}
      {showCardAnimation && drawResults && (
        <div className={styles.drawModal} role="dialog" aria-modal="true">
          <div className={styles.drawModalContent} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '1rem'
          }}>
            <style jsx>{`
              @keyframes rarityGlowRed {
                0% { box-shadow: 0 0 20px rgba(255, 71, 87, 0.6), 0 0 40px rgba(255, 71, 87, 0.3); }
                100% { box-shadow: 0 0 30px rgba(255, 71, 87, 0.9), 0 0 60px rgba(255, 71, 87, 0.5); }
              }
              @keyframes rarityGlowOrange {
                0% { box-shadow: 0 0 20px rgba(255, 152, 0, 0.6), 0 0 40px rgba(255, 152, 0, 0.3); }
                100% { box-shadow: 0 0 30px rgba(255, 152, 0, 0.9), 0 0 60px rgba(255, 152, 0, 0.5); }
              }
              @keyframes rarityGlowPurple {
                0% { box-shadow: 0 0 20px rgba(156, 39, 176, 0.6), 0 0 40px rgba(156, 39, 176, 0.3); }
                100% { box-shadow: 0 0 30px rgba(156, 39, 176, 0.9), 0 0 60px rgba(156, 39, 176, 0.5); }
              }
              
              /* Mobile-specific card piles positioning */
              @media (max-width: 768px) {
                .cardPilesContainer {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  gap: 1.5rem;
                  width: 100%;
                  padding: 0 1rem;
                }
                
                .cardPile {
                  width: 120px;
                  height: 180px;
                  position: relative;
                }
                
                .cardPile .card {
                  width: 100%;
                  height: 100%;
                }
                
                .arrowSeparator {
                  font-size: 1.5rem;
                  color: white;
                  flex-shrink: 0;
                }
              }
              
              @media (min-width: 769px) {
                .cardPilesContainer {
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  gap: 2rem;
                  width: 100%;
                }
                
                .cardPile {
                  width: 192px;
                  height: 288px;
                  position: relative;
                }
                
                .cardPile .card {
                  width: 100%;
                  height: 100%;
                }
                
                .arrowSeparator {
                  font-size: 2rem;
                  color: white;
                  flex-shrink: 0;
                }
              }
            `}</style>
            
            {/* Pack Name - Positioned Above Card Stack */}
            <div className="text-center mb-6 px-4" style={{ width: '100%' }}>
              <h2 className="text-xl md:text-2xl font-bold text-white mb-2">{pack?.name || 'Official Pack'}</h2>
              {demoMode && (
                <div className="inline-block bg-green-600/20 border border-green-500/30 rounded-lg px-3 py-1 md:px-4 md:py-2">
                  <div className="flex items-center gap-2">
                    <span>🎮</span>
                    <span className="text-green-400 text-xs md:text-sm font-medium">Demo Mode - Free Preview</span>
                  </div>
                </div>
              )}
            </div>
            
            {/* Two Card Piles Layout - Mobile Responsive */}
            <div className="cardPilesContainer">
              {/* Unrevealed Cards Stack */}
              <div className="cardPile">
                {drawResults.cards.length - revealedCards.length > 0 ? (
                  <>
                    {drawResults.cards.slice(revealedCards.length).map((card, index) => {
                      const cardBackColor = getCardBackColor(card)
                      return (
                        <div
                          key={`unrevealed-${card.card_id}-${index}`}
                          className="card absolute inset-0 rounded-lg border-2 border-white/20 shadow-lg cursor-pointer overflow-hidden"
                          style={{
                            transform: `translate(${index * 1}px, ${index * -1}px) rotate(${(index % 2 - 0.5) * 1}deg)`,
                            zIndex: 100 - index,
                            opacity: Math.max(0.4, 1 - index * 0.1)
                          }}
                          onClick={revealNextCard}
                        >
                          <div 
                            className="w-full h-full"
                            style={{
                              backgroundImage: `url(/draw/${cardBackColor}.png)`,
                              backgroundSize: 'cover',
                              backgroundPosition: 'center'
                            }}
                          />
                        </div>
                      )
                    })}
                  </>
                ) : (
                  <div className="w-full h-full border-2 border-dashed border-gray-500 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400 text-xs md:text-sm">Empty</span>
                  </div>
                )}
              </div>

              {/* Arrow */}
              <div className="arrowSeparator">→</div>

              {/* Revealed Cards Pile */}
              <div className="cardPile">
                {revealedCards.length > 0 ? (
                  <>
                    {/* Only show the most recent card - completely overlaid */}
                    {(() => {
                      const latestCard = revealedCards[revealedCards.length - 1]
                      if (!latestCard) return null
                      
                      const cardColor = latestCard.color || 'green'
                      // Get border color and animation for different rarities
                      const getBorderStyle = (color: string) => {
                        switch(color) {
                          case 'red':
                            return {
                              borderColor: '#ff4757',
                              boxShadow: '0 0 20px rgba(255, 71, 87, 0.6), 0 0 40px rgba(255, 71, 87, 0.3)',
                              animation: 'rarityGlowRed 1.5s ease-in-out infinite alternate'
                            }
                          case 'orange':
                            return {
                              borderColor: '#ff9800',
                              boxShadow: '0 0 20px rgba(255, 152, 0, 0.6), 0 0 40px rgba(255, 152, 0, 0.3)',
                              animation: 'rarityGlowOrange 1.5s ease-in-out infinite alternate'
                            }
                          case 'purple':
                            return {
                              borderColor: '#9c27b0',
                              boxShadow: '0 0 20px rgba(156, 39, 176, 0.6), 0 0 40px rgba(156, 39, 176, 0.3)',
                              animation: 'rarityGlowPurple 1.5s ease-in-out infinite alternate'
                            }
                          case 'blue':
                            return {
                              borderColor: '#2196f3',
                              boxShadow: '0 0 15px rgba(33, 150, 243, 0.4)'
                            }
                          default:
                            return {
                              borderColor: '#4caf50',
                              boxShadow: '0 0 10px rgba(76, 175, 80, 0.3)'
                            }
                        }
                      }
                      const borderStyle = getBorderStyle(cardColor)
                      return (
                        <div 
                          key={`revealed-${latestCard.id}`}
                          ref={el => { cardRefs.current[revealedCards.length - 1] = el }}
                          className="card absolute inset-0 rounded-lg border-2 shadow-xl overflow-hidden"
                          data-card-color={cardColor}
                          data-card-revealed="true"
                          style={borderStyle}
                        >
                          {(() => {
                            const cardId = latestCard.card_id || latestCard.id
                            const cardImageUrl = latestCard.card_image_url || latestCard.image_url
                            
                            
                            // Load card image with Cloudflare optimization
                            if (cardImageUrl) {
                              const optimizedImageUrl = optimizeImage(cardImageUrl, { width: 400, height: 600, quality: 85 })
                              return (
                                <Image 
                                  src={optimizedImageUrl}
                                  alt={latestCard.card_name || 'Card'}
                                  fill
                                  className="object-cover rounded-lg"
                                  loader={imageLoader}
                                  priority
                                />
                              )
                            } else {
                              return (
                                <div className="w-full h-full bg-gray-700 rounded-lg flex flex-col items-center justify-center">
                                  <span className="text-white text-lg sm:text-xl mb-1">🎴</span>
                                  <span className="text-white text-xs text-center px-2">
                                    {latestCard.card_name || 'No Image'}
                                  </span>
                                </div>
                              )
                            }
                          })()}
                        </div>
                      )
                    })()}
                  </>
                ) : (
                  <div className="w-full h-full border-2 border-dashed border-gray-500 rounded-lg flex items-center justify-center">
                    <span className="text-gray-400 text-xs md:text-sm">Revealed</span>
                  </div>
                )}
              </div>
            </div>
              
            {/* Click instruction - Positioned Below Card Stack */}
            <div className="text-center px-4 mt-6" style={{ width: '100%' }}>
              {revealedCards.length < drawResults.cards.length && (
                <p className="text-white text-base md:text-lg animate-pulse mb-4">
                  👆 Click the card to reveal! ({revealedCards.length + 1}/{drawResults.cards.length})
                </p>
              )}
              {revealedCards.length >= drawResults.cards.length && (
                <p className="text-green-400 text-base md:text-lg font-bold mb-4">
                  All cards revealed! ✨
                </p>
              )}
              
              {/* Action Buttons - Positioned Below Instructions */}
              <div className="flex justify-center gap-4">
                <button
                  onClick={skipAnimation}
                  className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 md:px-6 md:py-3 rounded-lg font-medium transition-colors text-sm md:text-base"
                >
                  Skip ⏭️
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Draw Animation Modal - Match normal pack positioning exactly */}
      {showDrawModal && (
        <div className={styles.drawModal} role="dialog" aria-modal="true">
          <div className={styles.drawModalContent}>
            {/* Draw animation - Canvas MP4 Video - Same positioning as normal pack */}
            {showGif && (
              <div
                onClick={handleSkipAnimation}
                style={{ 
                  cursor: 'pointer', 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100vw', 
                  height: '100vh', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  backgroundColor: 'rgba(0, 0, 0, 0.95)',
                  zIndex: 1002
                }}
              >
                <CanvasVideoPlayer
                  ref={videoPlayerRef}
                  src={cachedVideoUrl || 'https://draw.zapull.fun/draw_animate1.mp4'}
                  width={calcW}
                  height={calcH}
                  autoPlay={true}
                  muted={true}
                  loop={false}
                  style={{
                    maxWidth: '100vw',
                    maxHeight: '85vh',
                    objectFit: 'contain'
                  }}
                  onEnded={() => {
                    console.log('Draw animation video ended, showing cards')
                    // Only transition if we're still showing the draw modal (not already skipped)
                    if (showDrawModal) {
                      handleSkipAnimation()
                    }
                  }}
                  onLoadedData={() => {
                    console.log('Draw animation video loaded')
                    if (videoPlayerRef.current) {
                      videoPlayerRef.current.play().catch(err => {
                        console.error('Failed to play draw animation:', err)
                      })
                    }
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Results Modal */}
      {showResults && drawResults && (
        <>
          {/* Backdrop to prevent background interaction */}
          <div className="fixed inset-0 bg-black bg-opacity-75 z-50" />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4 pointer-events-none overflow-hidden">
            <div className="bg-gray-900 rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-y-auto pointer-events-auto relative">
              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-2">{pack?.name || 'Official Pack'}</h3>
                    {demoMode && (
                      <div className="bg-green-600/20 border border-green-500/30 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span>🎮</span>
                          <span className="text-green-400 text-sm font-medium">Demo Mode - No points deducted, cards not added to collection</span>
                        </div>
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => setShowResults(false)}
                    className="text-gray-400 hover:text-white text-2xl"
                  >
                    ×
                  </button>
                </div>

                {/* Filter Controls */}
                <div className="mb-4 flex justify-between items-center">
                  <CardPointsFilter
                    onSelectRange={(min, max) => setPointsFilter({ min, max })}
                    className=""
                  />
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-gray-400">
                      Showing {getFilteredCards().length} of {drawResults.cards.length} cards
                    </div>
                    <div className="text-purple-400">
                      {getSelectedFilteredCards().length} selected
                    </div>
                  </div>
                </div>

                {/* Results Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mb-6">
                  {getFilteredCards().map(({ card, index: originalIndex }) => {
                    const cardColor = card.color || 'green'
                    // Get border style for rare cards
                    const getBorderStyle = (color: string) => {
                      switch(color) {
                        case 'red':
                          return {
                            borderColor: '#ff4757',
                            boxShadow: '0 0 15px rgba(255, 71, 87, 0.6), 0 0 30px rgba(255, 71, 87, 0.3)',
                            animation: 'rarityGlowRed 1.5s ease-in-out infinite alternate'
                          }
                        case 'orange':
                          return {
                            borderColor: '#ff9800',
                            boxShadow: '0 0 15px rgba(255, 152, 0, 0.6), 0 0 30px rgba(255, 152, 0, 0.3)',
                            animation: 'rarityGlowOrange 1.5s ease-in-out infinite alternate'
                          }
                        case 'purple':
                          return {
                            borderColor: '#9c27b0',
                            boxShadow: '0 0 15px rgba(156, 39, 176, 0.6), 0 0 30px rgba(156, 39, 176, 0.3)',
                            animation: 'rarityGlowPurple 1.5s ease-in-out infinite alternate'
                          }
                        case 'blue':
                          return {
                            borderColor: '#2196f3',
                            boxShadow: '0 0 10px rgba(33, 150, 243, 0.4)'
                          }
                        default:
                          return {
                            borderColor: '#4caf50',
                            boxShadow: '0 0 8px rgba(76, 175, 80, 0.3)'
                          }
                      }
                    }
                    const borderStyle = getBorderStyle(cardColor)
                    const isRareCard = ['red', 'orange', 'purple'].includes(cardColor)
                    
                    return (
                      <div 
                        key={originalIndex}
                        className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all duration-300 hover:scale-105 cursor-pointer ${
                          selectedCards[originalIndex] ? 'ring-4 ring-purple-500' : ''
                        }`}
                        style={borderStyle}
                        onClick={() => handleCardSelect(originalIndex)}
                      >
                        {(() => {
                          
                          if ((card as any).image_url) {
                            const optimizedUrl = optimizeImage((card as any).image_url, { width: 400, height: 600, quality: 85 })
                            return (
                              <Image 
                                src={optimizedUrl}
                                alt={card.card_name || 'Card'} 
                                fill
                                className="object-cover rounded"
                                loader={imageLoader}
                              />
                            )
                          } else {
                            return (
                              <div className="flex items-center justify-center h-full bg-gray-700 text-gray-400">
                                🎴
                              </div>
                            )
                          }
                        })()}
                        {/* Selection Checkmark */}
                        {selectedCards[originalIndex] && (
                          <div className="absolute top-2 left-2 z-10 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        
                        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                          <div className="text-white text-xs font-bold truncate">{card.card_name}</div>
                        </div>
                        <div className="absolute top-2 right-2 bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
                          {card.point_worth} pts
                        </div>
                      </div>
                    )
                  })}
                </div>

              {/* Selection Actions */}
              <div className="mb-4 flex justify-center">
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      const filteredCards = getFilteredCards()
                      setSelectedCards(prev => {
                        const newSelected = [...prev]
                        filteredCards.forEach(({ index }) => {
                          newSelected[index] = true
                        })
                        return newSelected
                      })
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
                  >
                    Select All Filtered
                  </button>
                  <button
                    onClick={() => setSelectedCards(new Array(drawResults.cards.length).fill(false))}
                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
                  >
                    Clear Selection
                  </button>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                {!demoMode ? (
                  <>
                    <button
                      onClick={handleRedeemClick}
                      disabled={getSelectedFilteredCards().length === 0}
                      className={`px-6 py-3 rounded-lg font-medium ${
                        getSelectedFilteredCards().length === 0
                          ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700 text-white'
                      }`}
                    >
                      Redeem Selected Cards for Points ({getSelectedFilteredCards().length})
                    </button>
                    <button
                      onClick={() => setShowResults(false)}
                      className="bg-gray-600 hover:bg-gray-700 text-white px-6 py-3 rounded-lg font-medium"
                    >
                      Keep Cards
                    </button>
                  </>
                ) : (
                  <>
                    <div className="text-center text-gray-400 mb-4">
                      <p className="text-sm flex items-center justify-center gap-1">This was a demo draw. To get real cards, use the paid "Open For <Image src="/users/coin.png" alt="Coin" width={14} height={14} />" option above.</p>
                    </div>
                    <button
                      onClick={() => {
                        setShowResults(false)
                        setDrawResults(null)
                        setRevealedCards([])
                        setShowCardAnimation(false)
                        setDemoMode(false)
                        // Unlock body scroll since all modals are now closed
                        forceUnlockBodyScroll()
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium"
                    >
                      Close Demo
                    </button>
                  </>
                )}
              </div>
              
              {/* Confirmation Dialog - Fixed Overlay */}
              {showConfirmDialog && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[9999] p-4">
                  <div className="bg-gray-900 rounded-xl w-full max-w-sm p-6 relative z-[10000]">
                    <h3 className="text-xl font-bold text-white mb-4">Confirm Redemption</h3>
                    {(() => {
                      const selectedFilteredCards = getSelectedFilteredCards()
                      const totalPoints = selectedFilteredCards.reduce((sum, { card }) => sum + (card.point_worth || 0), 0)
                      return (
                        <p className="text-gray-300 mb-6">
                          Are you sure you want to redeem {selectedFilteredCards.length} card{selectedFilteredCards.length !== 1 ? 's' : ''} for <span className="text-yellow-400 font-bold">{totalPoints} points</span>? This action cannot be undone.
                        </p>
                      )
                    })()}
                    <div className="flex gap-4 justify-end">
                      <button
                        onClick={() => setShowConfirmDialog(false)}
                        className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-medium transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRedeem}
                        className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors"
                      >
                        Redeem for Points
                      </button>
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Card Detail Modal */}
      <PackCardDetailModal
        isOpen={!!selectedCard}
        card={selectedCard}
        onClose={() => setSelectedCard(null)}
      />

      {/* Guide Modal */}
      {showGuideModal && (
        <OfficialPackGuideModal
          isOpen={showGuideModal}
          onClose={() => setShowGuideModal(false)}
        />
      )}

      {/* Top-up Modal */}
      {showTopUpModal && (
        <PointsTopUpModal
          onClose={() => setShowTopUpModal(false)}
        />
      )}

    </div>
  )
}
