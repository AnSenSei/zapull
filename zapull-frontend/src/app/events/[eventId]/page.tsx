'use client'

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { packsApi, Pack, Card } from '@/lib/packsApi'
import { userApi, UserCard } from '@/lib/userApi'
import { getCurrentUserId } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import styles from '../../packs/packs.module.css'
import PackCardDetailModal from '@/components/PackCardDetailModal'
import FusionBadge from '@/components/FusionBadge'
import { getPackColorTheme } from '@/lib/packColorUtils'
import CanvasVideoPlayer, { CanvasVideoPlayerRef } from '@/components/CanvasVideoPlayer'
import ParticleBurst from '@/components/ParticleBurst'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'
import { lockBodyScroll, unlockBodyScroll, forceUnlockBodyScroll } from '@/lib/scrollLock'
import PackGuideModal from '@/components/PackGuideModal'

import { audioManager, SOUND_PATHS, initializeAudioManager } from '@/lib/audioManager'
import { getDrawAnimationUrl, preloadDrawAnimation, isDrawAnimationCached } from '@/lib/videoCache'
import { useCelebrationEffects, getCelebrationColorFromCardColor } from '@/lib/celebrationManager'

const imageLoader = ({ src }) => {
  return src
}

// 定义页面参数接口
interface EventDetailPageProps {
  params: Promise<{
    eventId: string
  }>
}

// Event configuration - this would normally come from an API
const getEventConfig = (eventId: string) => {
  switch (eventId) {
    case 'freedaily-box':
      return {
        id: '8e03ce64-8111-45f6-aed4-d516c1b00755',
        collectionId: 'pokemon',
        name: 'Free Daily Box',
        description: 'Get your free daily Pokemon cards!',
        image_url: '/events/freedaily-box.jpg',
        price: 0,
        max_win: '500', // Updated to match API response
        win_rate: '100',
        min_win: '2', // Updated to match API response
        has_fusion_recipes: false
      }
    default:
      return null
  }
}

// Reuse the DrawnCard component from the pack page
const DrawnCard = memo(({ card, index, cardVisible, cardAnimationComplete, showCards, flippingCards, showDestroyButton, isDemoMode, selectedCards, handleDrawnCardClick, handleCardSelect, cardRef }) => {
  const { startCelebration, triggerBurst, stopCelebration } = useCelebrationEffects();
  const isSelected = Array.isArray(selectedCards) && selectedCards.length > index ? selectedCards[index] : false;
  
  // Start celebration effect when card becomes visible and has celebration-worthy color
  useEffect(() => {
    if (cardVisible && cardAnimationComplete && cardRef?.current) {
      const celebrationColor = getCelebrationColorFromCardColor(card.color);
      if (celebrationColor) {
        startCelebration(cardRef.current, celebrationColor, 5000); // 5 seconds duration
      }
    }
    return () => {
      if (cardRef?.current) {
        stopCelebration(cardRef.current);
      }
    };
  }, [cardVisible, cardAnimationComplete, card.color, cardRef, startCelebration, stopCelebration]);
  
  // Trigger burst effect when card is revealed
  useEffect(() => {
    if (showCards?.[index] && cardRef?.current) {
      triggerBurst(cardRef.current);
    }
  }, [showCards, index, cardRef, triggerBurst]);
  
  console.log(`DrawnCard ${index} render:`, {
    name: card.name,
    color: card.color,
    isOrange: card.color === 'orange',
    isRed: card.color === 'red',
    revealed: showCards?.[index]
  });
  
  return (
    <div
      ref={cardRef}
      data-card-index={index}
      data-card-color={card.color}
      data-card-revealed={showCards?.[index] ? 'true' : 'false'}
      className={[
        styles.drawnCard,
        styles.cardFlip,
        cardVisible ? styles.visible : styles.hidden,
        cardAnimationComplete ? styles.interactive : styles.nonInteractive,
        showCards && showCards[index] ? styles.flipped : '',
        flippingCards ? styles.prewarm : ''
      ].filter(Boolean).join(' ')}
      onClick={(e) => {
        if (showCards && showCards[index]) {
          handleCardSelect(index);
        }
      }}
    >
      <div
        className={`${styles.cardInner} ${
          showCards && showCards[index] ? styles.flipped : ''
        } ${
          flippingCards ? styles.flipping : ''
        } ${
          cardAnimationComplete ? styles.interactive : ''
        }`}
        onClick={(e) => {
          e.stopPropagation()
          if (showCards && showCards[index] && e.target.closest(`.${styles.cardSelectArea}`)) {
            return;
          }
          handleDrawnCardClick(index);
        }}
      >
        {/* 卡片选择区域 */}
        {showCards && showCards[index] && showDestroyButton && !isDemoMode && (
          <div 
            className={styles.cardSelectArea} 
            style={{ zIndex: 1 }}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); handleCardSelect(index); }}
              className={styles.cardCheckbox}
            />
          </div>
        )}
        {/* 卡片正面 */}
        <div
          className={`${styles.cardFront}`}
          style={{
            '--hover-shadow-color': card.color || '#ffffff',
            borderColor: card.color || 'white',
            '--card-border-color': card.color || 'white',
            zIndex: 5
          } as React.CSSProperties & { '--hover-shadow-color': string, '--card-border-color': string }}
        >
          <Image
            src={`/draw/${card.color || 'green'}.png`}
            alt="卡片背面"
            fill
            className={`object-cover rounded-lg ${styles.cardBackImage}`}
            style={{ pointerEvents: 'none' }}
          />
          
          {/* 点击提示 */}
          {showCards && !showCards[index] && cardAnimationComplete && !flippingCards && (
            <div className={styles.clickTip}>
              Click to flip
            </div>
          )}
        </div>
        
        {/* 卡片背面 */}
        <div
          className={`${styles.cardBack}`}
          style={{
            borderColor: card.color || 'white',
            '--card-border-color': card.color || 'white'
          } as React.CSSProperties & { '--card-border-color': string }}
          onClick={(e) => {
            if (showCards && showCards[index] && showDestroyButton && !isDemoMode) {
              e.stopPropagation();
              console.log(`卡片正面点击: ${index}, 正常模式，显示销毁按钮: ${showDestroyButton}`);
              handleCardSelect(index);
              return;
            }
          }}
        >
          <Image
            src={card.image_url || '/cards/card1.jpg'}
            alt={card.card_name || '卡片'}
            fill
            className="object-cover rounded-lg"
            style={{ pointerEvents: 'none' }}
          />
          
          {/* 卡片信息 */}
          <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-75 text-white p-2 rounded-b-lg" style={{ pointerEvents: 'none' }}>
            <div className="text-sm font-bold truncate">{card.card_name}</div>
            <div className="text-xs text-yellow-400">{card.point_worth} points</div>
          </div>
        </div>
      </div>
    </div>
  );
});
DrawnCard.displayName = 'DrawnCard';

export default function EventDetailPage({ params }: EventDetailPageProps) {
  const router = useRouter()
  const { uid, setUserInfo, userInfo, openLoginModal } = useAuthStore()
  
  // 状态管理
  const [eventId, setEventId] = useState<string>('')
  const [eventConfig, setEventConfig] = useState<any>(null)

  
  // 清理滚动锁
  useEffect(() => {
    try { forceUnlockBodyScroll(); } catch {}
    return () => {
      try { forceUnlockBodyScroll(); } catch {}
    }
  }, [])
  
  // Pack-related states (reused from pack page)
  const [pack, setPack] = useState<Pack | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  
  // Drawing related states
  const [drawCount, setDrawCount] = useState(1)
  const [skipAnimation, setSkipAnimation] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawnCards, setDrawnCards] = useState<(UserCard & { unique_id: string })[]>([])
  const [showDrawModal, setShowDrawModal] = useState(false)
  const [showGif, setShowGif] = useState(true)
  const [showModalCards, setShowModalCards] = useState(false)
  const [showCards, setShowCards] = useState<boolean[]>([])
  const [cardVisible, setCardVisible] = useState<boolean[]>([])
  const [cardAnimationComplete, setCardAnimationComplete] = useState<boolean[]>([])
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [flippingCards, setFlippingCards] = useState<boolean[]>([])
  const [selectedCards, setSelectedCards] = useState<boolean[]>([])
  const [isDestroying, setIsDestroying] = useState(false)
  const [redeemConfirm, setRedeemConfirm] = useState<{ open: boolean; count: number; points: number }>({ open: false, count: 0, points: 0 })
  const [redeemIndices, setRedeemIndices] = useState<number[]>([])
  
  // Video player reference
  const videoPlayerRef = useRef<CanvasVideoPlayerRef>(null)
  
  // Video dimensions
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const calcW = Math.min(vw * 0.98, 1200)
  const calcH = Math.min(vh * 0.92, 900)
  const [showDestroyButton, setShowDestroyButton] = useState(false)
  const [gifTimeoutId, setGifTimeoutId] = useState<NodeJS.Timeout | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false)
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string>('')
  const [videoLoadProgress, setVideoLoadProgress] = useState<number>(0)
  
  // Daily reward status and countdown
  const [dailyRewardClaimed, setDailyRewardClaimed] = useState<boolean>(false)
  const [nextClaimTime, setNextClaimTime] = useState<Date | null>(null)
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<string>('')
  
  // Particle burst states
  const [particleBursts, setParticleBursts] = useState<Array<{
    id: string;
    color: 'orange' | 'red' | 'purple' | 'blue' | 'green';
    position: { x: number; y: number };
    trigger: boolean;
    intensity?: number;
  }>>([])
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Refresh user points
  const refreshUserPoints = async () => {
    try {
      const pointsData = await userApi.getUserPointsBalance()
      setUserInfo((prevInfo) => ({
        ...prevInfo,
        pointsBalance: pointsData.pointsBalance,
        totalPointsSpent: pointsData.totalPointsSpent,
        totalCashRecharged: pointsData.totalCashRecharged
      }))
      console.log('User points refreshed:', pointsData.pointsBalance)
    } catch (error) {
      console.error('Failed to refresh user points:', error)
    }
  }

  // 解析 params
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params
      setEventId(resolvedParams.eventId)
      
      const config = getEventConfig(resolvedParams.eventId)
      setEventConfig(config)
    }
    resolveParams()
  }, [params])

  // Initialize audio and CSS worklet
  useEffect(() => {
    if (typeof window !== 'undefined' && 'CSS' in window && 'paintWorklet' in CSS) {
      CSS.paintWorklet.addModule('/starry-sky.js').catch(err => {
        console.log('Paint Worklet registration failed:', err);
      });
    }
    
    initializeAudioManager().catch(error => {
      console.warn('Failed to initialize audio manager:', error);
    });
  }, []);

  // Fetch event data (treat as pack)
  useEffect(() => {
    if (!eventConfig) return
    
    const fetchEventData = async () => {
      try {
        setLoading(true)
        setError('')
        
        // Use the pack API with the event's pack ID and collection ID
        const packData = await packsApi.getPackDetails(eventConfig.id, eventConfig.collectionId)
        setPack({
          ...packData,
          name: eventConfig.name, // Override with event name
          price: eventConfig.price // Override with event price
        })
        
        const cardsData = await packsApi.getPackCards(eventConfig.collectionId, eventConfig.id)
        setCards(cardsData)
      } catch (err: any) {
        console.error('Failed to fetch event data:', err)
        setError('Failed to load event data, please try again later')
      } finally {
        setLoading(false)
      }
    }
    
    fetchEventData()
  }, [eventConfig])

  // Daily box drawing logic - use dedicated daily box endpoint
  const handleDraw = async () => {
    if (!uid) {
      openLoginModal()
      return
    }
    
    if (isDrawing || !eventConfig) return
    
    // Check if user has already claimed today's daily reward
    try {
      const dailyStatus = await userApi.checkDailyRewardStatus()
      if (dailyStatus.has_claimed) {
        setError('You have already claimed your daily reward today!')
        return
      }
    } catch (error) {
      console.error('Failed to check daily reward status:', error)
      setError('Unable to check daily reward status, please try again later')
      return
    }
    
    try {
      setIsDrawing(true)
      setIsDemoMode(false)
      setShowDestroyButton(false)
      setShowCards(new Array(1).fill(false)) // Daily box is always 1 card
      setDrawCount(1) // Force draw count to 1 for daily box
      
      // Use the daily box API endpoint
      const response = await userApi.claimDailyReward()
      const result = [{
        ...response.card,
        unique_id: `daily-${response.card.card_name}-${Math.random()}`,
        card_name: response.card.card_name,
        name: response.card.card_name // Ensure both fields are set
      }];
      
      console.log('Daily Box Card Drawn:', {
        card_name: response.card.card_name,
        point_worth: response.card.point_worth,
        rarity: response.card.rarity,
        color: response.card.color
      });
      
      setDrawnCards(result)
      
      try {
        const videoUrl = await getDrawAnimationUrl((progress) => {
          setVideoLoadProgress(progress);
          console.log(`Loading draw animation: ${progress}%`);
        });
        setCachedVideoUrl(videoUrl);
        console.log('Draw animation ready for playback');
      } catch (error) {
        console.warn('Failed to get cached video URL, using fallback:', error);
        setCachedVideoUrl('');
      }
      
      setShowDrawModal(true)
      setShowGif(true)
      setShowModalCards(false)
      
      if (skipAnimation) {
        audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })
        
        setShowGif(false)
        setShowModalCards(true)
        setShowCards(new Array(drawCount).fill(false))
        setCardVisible(new Array(drawCount).fill(false))
        setCardAnimationComplete(new Array(drawCount).fill(false))
        setFlippingCards(new Array(drawCount).fill(false))
        
        result.forEach((card, index) => {
          setTimeout(() => {
            setCardVisible(prev => {
              const newVisible = [...prev]
              newVisible[index] = true
              return newVisible
            })
            setTimeout(() => {
              setCardAnimationComplete(prev => {
                const newComplete = [...prev]
                newComplete[index] = true
                return newComplete
              })
            }, 800)
          }, index * 150)
        })
        
        setTimeout(() => {
          setIsDrawing(false)
        }, drawCount * 150 + 1000)
      } else {
        audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })
        
        const timeoutId = setTimeout(() => {
          if (showGif) {
            console.log('Video playback timeout, forcing card display')
            handleSkipGif()
          }
        }, 15000)
        
        setGifTimeoutId(timeoutId)
      }
      
      await refreshUserPoints()
      
    } catch (error: any) {
      console.error('Daily box claim failed:', error)
      
      // Handle specific daily box errors
      if (error.response?.status === 400 && error.response?.data?.detail?.includes('already claimed')) {
        setError('You have already claimed your daily reward today! Come back tomorrow.')
      } else if (error.response?.status === 400 && error.response?.data?.detail?.includes('no daily free box available')) {
        setError('No daily free box available at the moment.')
      } else {
        setError('Failed to claim daily reward, please try again later')
      }
      
      setIsDrawing(false)
      setShowDrawModal(false)
      setShowGif(true)
      setShowModalCards(false)
      setDrawnCards([])
      setShowCards([])
      setCardVisible([])
      setCardAnimationComplete([])
    }
  }

  // Demo draw function - still use demo endpoint for preview
  const handleDemoDrawMultipleCards = async () => {
    if (isDrawing || !eventConfig) return
    
    try {
      setIsDrawing(true)
      setIsDemoMode(true)
      setShowDestroyButton(false)
      setShowCards(new Array(1).fill(false)) // Daily box demo is always 1 card
      const demoDrawCount = 1 // Force to 1 for daily box demo
      
      const response = await userApi.demoDrawMultipleCards(eventConfig.id, eventConfig.collectionId, demoDrawCount)
      const result = (Array.isArray(response) ? response : (response.cards || [])).map((card, index) => ({
        ...card,
        unique_id: `demo-${card.id || card.card_reference || 'card'}-${index}-${Math.random()}`
      }));
      
      console.log('Demo Daily Box Card Drawn:', result.map((card, idx) => ({
        index: idx,
        name: card.name,
        color: card.color,
        rarity: card.rarity
      })));
      
      setDrawnCards(result)
      
      try {
        const videoUrl = await getDrawAnimationUrl((progress) => {
          setVideoLoadProgress(progress);
          console.log(`Loading draw animation: ${progress}%`);
        });
        setCachedVideoUrl(videoUrl);
        console.log('Draw animation ready for playback');
      } catch (error) {
        console.warn('Failed to get cached video URL, using fallback:', error);
        setCachedVideoUrl('');
      }
      
      setShowDrawModal(true)
      setShowGif(true)
      setShowModalCards(false)
      
      if (skipAnimation) {
        try {
          const audio = new Audio('/draw/draw-sound.wav')
          setCurrentAudio(audio)
          audio.play().catch((error) => {
            console.log('Draw sound playback failed (this is normal on mobile):', error.message)
          })
        } catch (error) {
          console.log('Failed to create draw sound:', error)
        }
        
        setShowGif(false)
        setShowModalCards(true)
        setShowCards(new Array(drawCount).fill(false))
        setCardVisible(new Array(drawCount).fill(false))
        setCardAnimationComplete(new Array(drawCount).fill(false))
        setFlippingCards(new Array(drawCount).fill(false))
        
        result.forEach((card, index) => {
          setTimeout(() => {
            setCardVisible(prev => {
              const newVisible = [...prev]
              newVisible[index] = true
              return newVisible
            })
            setTimeout(() => {
              setCardAnimationComplete(prev => {
                const newComplete = [...prev]
                newComplete[index] = true
                return newComplete
              })
            }, 800)
          }, index * 200)
        })
        
        setTimeout(() => {
          setIsDrawing(false)
        }, result.length * 200 + 1000)
      } else {
        try {
          const audio = new Audio('/draw/draw-sound.wav')
          setCurrentAudio(audio)
          audio.play().catch((error) => {
            console.log('Draw sound playback failed (this is normal on mobile):', error.message)
          })
        } catch (error) {
          console.log('Failed to create draw sound:', error)
        }
        
        const timeoutId = setTimeout(() => {
          if (showGif) {
            console.log('Video playback timeout, forcing card display')
            handleSkipGif()
          }
        }, 15000)
        
        setGifTimeoutId(timeoutId)
      }
    } catch (error) {
      console.error('Demo daily box failed:', error)
      setError('Demo draw failed, please try again later')
      setIsDrawing(false)
      setShowDrawModal(false)
      setShowGif(true)
      setShowModalCards(false)
      setDrawnCards([])
      setShowCards([])
      setCardVisible([])
      setCardAnimationComplete([])
    }
  }

  // Copy all other handler functions from pack page
  const handleCardClick = (card: Card) => {
    setSelectedCard(card)
    setIsModalOpen(true)
  }
  
  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  const handleDrawnCardClick = (index: number) => {
    // Initialize audio context on first user interaction
    audioManager.initializeOnUserInteraction()
    
    if (showCards[index] && (showDestroyButton || isDemoMode)) {
      console.log('点击已翻开的卡片，触发选择逻辑:', {
        index,
        showCards: showCards[index],
        isDemoMode,
        showDestroyButton
      });
      handleCardSelect(index);
      return;
    }
    
    if (isDrawing || showCards[index] || !drawnCards[index] || flippingCards[index]) {
      return;
    }

    const card = drawnCards[index];

    setFlippingCards(prev => {
      const newFlipping = [...prev];
      newFlipping[index] = true;
      return newFlipping;
    });
    
    if (card.color === 'orange' || card.color === 'red' || card.color === 'purple') {
      const cardElement = cardRefs.current[index];
      if (cardElement) {
        const rect = cardElement.getBoundingClientRect();
        const burstId = `burst-${index}-${Date.now()}`;
        const burstIntensity = card.color === 'red' ? 1.5 : 
                               card.color === 'orange' ? 1.3 : 1.1;
        
        // Calculate position accounting for mobile viewport differences
        let posX = rect.left + rect.width / 2;
        let posY = rect.top + rect.height / 2;
        
        // On mobile, adjust for potential viewport offset
        if (window.visualViewport && (window.visualViewport.width !== window.innerWidth || window.visualViewport.height !== window.innerHeight)) {
          const offsetX = window.visualViewport.offsetLeft || 0;
          const offsetY = window.visualViewport.offsetTop || 0;
          posX = posX - offsetX;
          posY = posY - offsetY;
        }
        
        setParticleBursts(prev => [...prev, {
          id: burstId,
          color: card.color as 'orange' | 'red' | 'purple',
          position: {
            x: posX,
            y: posY
          },
          trigger: true,
          intensity: burstIntensity
        }]);
        
        setTimeout(() => {
          setParticleBursts(prev => prev.filter(b => b.id !== burstId));
        }, 3000);
      }
    }

    audioManager.playSound(SOUND_PATHS.FLIP, { volume: 0.7 })

    let raritySound = null
    if (card.color === 'red') {
      raritySound = SOUND_PATHS.RARITY_3
    } else if (card.color === 'orange') {
      raritySound = SOUND_PATHS.RARITY_2
    } else if (card.color === 'purple') {
      raritySound = SOUND_PATHS.RARITY_1
    }

    if (raritySound) {
      setTimeout(() => {
        audioManager.playSound(raritySound!, { volume: 0.8, interrupt: true })
      }, 200)
    }

    requestAnimationFrame(() => {
      setFlippingCards(prev => {
        const nf = [...prev];
        nf[index] = true;
        return nf;
      });
      requestAnimationFrame(() => {
        setShowCards(prev => {
          const newShow = [...prev];
          newShow[index] = true;
          return newShow;
        });
      });
    });

    setTimeout(() => {
      setFlippingCards(prev => {
        const newFlipping = [...prev];
        newFlipping[index] = false;
        return newFlipping;
      });
    }, 500);
  };

  const handleCardSelect = useCallback((index: number) => {
    if (!drawnCards[index] || !showCards[index]) {
      console.log(`选择被阻止 - 卡片${index}:`, {
        cardExists: !!drawnCards[index],
        cardShown: showCards[index],
        showDestroyButton,
        isDemoMode
      });
      return;
    }
    
    console.log(`选择卡片 ${index}，当前状态:`, {
      showCards: showCards[index],
      isDemoMode,
      showDestroyButton
    });
    
    setSelectedCards(prev => {
      const newSelected = [...prev]
      newSelected[index] = !newSelected[index]
      console.log(`卡片 ${index} 选择状态变更为:`, !prev[index]);
      return newSelected
    })
  }, [showCards, drawnCards, isDemoMode, showDestroyButton]);

  const handleDestroyCards = async () => {
    const selectedIndices = selectedCards.map((selected, index) => selected ? index : -1).filter(i => i !== -1)
    if (selectedIndices.length === 0) {
      toast.error('Please select cards to redeem')
      return
    }

    const totalPoints = selectedIndices.reduce((sum, index) => {
      return sum + (drawnCards[index].point_worth || 0)
    }, 0)

    setRedeemIndices(selectedIndices)
    setRedeemConfirm({ open: true, count: selectedIndices.length, points: totalPoints })
  }

  const confirmRedeem = async () => {
    if (redeemIndices.length === 0) {
      setRedeemConfirm({ open: false, count: 0, points: 0 })
      return
    }
    try {
      setIsDestroying(true)

      const cardsToDestroy = redeemIndices.map(index => ({
        card_id: drawnCards[index].id || drawnCards[index].card_reference || drawnCards[index].card_id,
        quantity: 1,
        subcollection_name: eventConfig.collectionId
      }))

      const result = await userApi.batchDestroyCards(cardsToDestroy)

      const newCards = drawnCards.filter((_, index) => !selectedCards[index])
      const newShowCards = showCards.filter((_, index) => !selectedCards[index])
      const newCardVisible = cardVisible.filter((_, index) => !selectedCards[index])
      const newCardAnimationComplete = cardAnimationComplete.filter((_, index) => !selectedCards[index])

      setDrawnCards(newCards)
      setShowCards(newShowCards)
      setCardVisible(newCardVisible)
      setCardAnimationComplete(newCardAnimationComplete)
      setSelectedCards(new Array(newCards.length).fill(false))

      if (newCards.length === 0) {
        setShowDestroyButton(false)
      }

      toastSuccess(`Successfully redeemed ${result.cards_destroyed || redeemIndices.length} cards for ${result.points_added || redeemConfirm.points} points! Current balance: ${result.remaining_points || 0} points!`)
      await refreshUserPoints()
      setShowDrawModal(false)
    } catch (error) {
      console.error('Failed to redeem cards:', error)
      toast.error('Failed to redeem cards, please try again later')
    } finally {
      setIsDestroying(false)
      setRedeemConfirm({ open: false, count: 0, points: 0 })
      setRedeemIndices([])
    }
  }

  const handleSkipGif = () => {
    if (showGif && gifTimeoutId) {
      clearTimeout(gifTimeoutId)
      setGifTimeoutId(null)
      
      setShowGif(false)
      setShowModalCards(true)
      setShowCards(new Array(drawnCards.length).fill(false))
      setCardVisible(new Array(drawnCards.length).fill(false))
      setCardAnimationComplete(new Array(drawnCards.length).fill(false))
      setFlippingCards(new Array(drawnCards.length).fill(false))
      
      drawnCards.forEach((card, index) => {
        setTimeout(() => {
          setCardVisible(prev => {
            const newVisible = [...prev]
            newVisible[index] = true
            return newVisible
          })
          setTimeout(() => {
            setCardAnimationComplete(prev => {
              const newComplete = [...prev]
              newComplete[index] = true
              return newComplete
            })
          }, 800)
        }, index * 200)
      })
      
      setTimeout(() => {
        setIsDrawing(false)
        
        if (isDemoMode) {
          // Demo mode: cards need to be manually clicked to flip
        } else {
          // Normal draw mode: cards need to be manually clicked to flip
        }
      }, drawnCards.length * 200 + 1000)
    }
  }

  const handleCloseDrawModal = () => {
    if (gifTimeoutId) {
      clearTimeout(gifTimeoutId)
      setGifTimeoutId(null)
    }
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    setShowDrawModal(false)
    setShowGif(true)
    setShowModalCards(false)
    setDrawnCards([])
    setShowCards([])
    setCardVisible([])
    setCardAnimationComplete([])
    setSelectedCards([])
    setShowDestroyButton(false)
    setIsDestroying(false)
    setIsDrawing(false)
    setIsDemoMode(false)
  }

  const handleFlipAll = useCallback(() => {
    const unflippedIndices = showCards
      .map((isFlipped, index) => !isFlipped ? index : null)
      .filter(index => index !== null);
    
    if (unflippedIndices.length === 0) return;
    
    unflippedIndices.forEach((index, i) => {
      setTimeout(() => {
        handleDrawnCardClick(index);
      }, i * 100);
    });
  }, [showCards, handleDrawnCardClick]);

  // Lock body scroll while redeem confirmation modal is open
  useEffect(() => {
    if (redeemConfirm.open) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [redeemConfirm.open])

  // Check daily reward status on component mount and when user changes
  useEffect(() => {
    const checkDailyRewardStatus = async () => {
      if (!uid || !eventConfig) return
      
      try {
        const status = await userApi.checkDailyRewardStatus()
        setDailyRewardClaimed(status.has_claimed)
        
        if (status.has_claimed) {
          // Calculate next claim time (next midnight in US Central timezone)
          const now = new Date()
          
          // Get current time in US Central timezone
          const centralTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Chicago"}))
          
          // Calculate next midnight Central time
          const nextMidnight = new Date(centralTime)
          nextMidnight.setDate(centralTime.getDate() + 1)
          nextMidnight.setHours(0, 0, 0, 0)
          
          // Convert back to local time for countdown
          const centralOffset = centralTime.getTimezoneOffset() - now.getTimezoneOffset()
          const nextClaimLocal = new Date(nextMidnight.getTime() - (centralOffset * 60000))
          
          setNextClaimTime(nextClaimLocal)
        } else {
          setNextClaimTime(null)
        }
      } catch (error) {
        console.error('Failed to check daily reward status:', error)
      }
    }
    
    checkDailyRewardStatus()
  }, [uid, eventConfig])
  
  // Countdown timer effect
  useEffect(() => {
    if (!nextClaimTime) {
      setTimeUntilNextClaim('')
      return
    }
    
    const updateCountdown = () => {
      const now = new Date()
      const timeLeft = nextClaimTime.getTime() - now.getTime()
      
      if (timeLeft <= 0) {
        setTimeUntilNextClaim('')
        setDailyRewardClaimed(false)
        setNextClaimTime(null)
        return
      }
      
      const hours = Math.floor(timeLeft / (1000 * 60 * 60))
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)
      
      setTimeUntilNextClaim(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }
    
    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    
    return () => clearInterval(interval)
  }, [nextClaimTime])

  // For daily box, don't show destroy button - users keep the cards
  useEffect(() => {
    if (drawnCards.length > 0 && showCards.every(shown => shown)) {
      // Daily box cards are kept, not redeemed
      setShowDestroyButton(false);
      setSelectedCards([]);
    }
  }, [showCards, drawnCards]);

  // Reset drawCount to 1 for daily box (always single card)
  useEffect(() => {
    if (eventConfig && drawCount > 1) {
      setDrawCount(1)
    }
  }, [eventConfig, drawCount])

  // 返回上一页
  const handleGoBack = () => {
    router.back()
  }

  // Render loading state
  if (loading) {
    return (
      <div className="container mx-auto p-4">
        <div className="animate-pulse space-y-6">
          <div className="h-10 w-24 bg-gray-700 rounded"></div>
          <div className="h-8 w-64 bg-gray-700 rounded mx-auto"></div>
          <div className="aspect-square max-w-md mx-auto bg-gray-700 rounded-lg"></div>
          <div className="flex justify-between max-w-md mx-auto">
            <div className="h-6 w-20 bg-gray-700 rounded"></div>
            <div className="h-6 w-20 bg-gray-700 rounded"></div>
            <div className="h-6 w-20 bg-gray-700 rounded"></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
            {Array(8).fill(null).map((_, i) => (
              <div key={`card-skeleton-${i}`} className="aspect-[3/4] bg-gray-700 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="container mx-auto p-4 text-center">
        <div className="flex flex-col items-center space-y-4">
          <button 
            onClick={handleGoBack}
            className="px-4 py-2 text-white rounded transition-all duration-300 bg-purple-600 hover:bg-purple-700"
          >
            Back
          </button>
          <div className="text-red-500 text-xl mb-4">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-lg font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  // Render not found state
  if (!eventConfig || !pack) {
    return (
      <div className="container mx-auto p-4 text-center">
        <button 
          onClick={handleGoBack}
          className="mb-4 px-4 py-2 text-white rounded transition-all duration-300 bg-purple-600 hover:bg-purple-700"
        >
          Back
        </button>
        <div className="text-xl text-white">Event not found</div>
      </div>
    )
  }

  return (
    <div className={`p-4 pt-8 sm:pt-4 text-white ${styles.pageContainer}`}>
      {/* Header with Back button and Guide */}
      <div className="flex justify-between items-center mb-4">
        <button 
          onClick={() => {
            try { sessionStorage.setItem('home:restore','1') } catch {}
            if (typeof window !== 'undefined' && window.history.length > 1) {
              router.back()
            } else {
              router.push('/')
            }
          }}
          className="flex items-center gap-2 text-white hover:text-purple-400 transition-colors"
        >
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 24 24" 
            fill="none" 
            stroke="currentColor" 
            strokeWidth="2" 
            strokeLinecap="round" 
            strokeLinejoin="round"
          >
            <path d="M19 12H5"></path>
            <path d="M12 19l-7-7 7-7"></path>
          </svg>
          <span>Back</span>
        </button>

        {/* Guide button */}
        <div 
          className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg p-3"
          onClick={() => setShowGuide(true)}
        >
          <div className="text-white font-medium flex items-center justify-center">
            <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
          </div>
          <div className="text-gray-400 text-xs">Guide</div>
        </div>
      </div>
      
      {/* 错误提示 */}
      {error && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 bg-red-500 text-white px-6 py-3 rounded-lg shadow-lg z-50">
          <div className="flex items-center justify-between">
            <span>{error}</span>
            <button 
              onClick={() => setError('')}
              className="ml-4 text-white hover:text-gray-200"
            >
              ×
            </button>
          </div>
        </div>
      )}
      
      {/* Event details */}
      <div className="w-full relative z-10">
        <h1 className={`text-3xl font-bold text-center mb-8 ${styles.pageTitle}`}>{eventConfig.name}</h1>
        
        {/* Event details - 左右布局 */}
        <div className={`gap-8 mb-12 ${styles.packDetailContainer} ${styles.infoContainer}`}>
          {/* 左侧 - Event图片 */}
          <div className={`md:w-1/2 ${styles.imageWrapper}`}>
            <div className={`aspect-square w-full ${styles.packImageContainer} relative rounded-lg p-[2px] ${getPackColorTheme(pack?.price).boxShadow}`}>
              <div className={`absolute inset-0 rounded-lg ${getPackColorTheme(pack?.price).bgGradient} opacity-60`}></div>
              <div
                className="relative w-full h-full rounded-lg overflow-hidden p-2"
                style={{ background: 'transparent' }}
              >
                {pack.image_url ? (
                  <Image 
                    src={pack.image_url} 
                    alt={eventConfig.name} 
                    fill
                    className="object-contain"
                    priority
                  />
                ) : (
                  <Image 
                    src="/events/freedaily-box.jpg" 
                    alt={eventConfig.name} 
                    fill
                    className="object-contain"
                    priority
                  />
                )}
              </div>
            </div>
          </div>
          
          {/* 右侧 - Event信息和按钮 */}
          <div className={`md:w-1/2 flex flex-col justify-center ${styles.infoWrapper}`}>
            <div className={`${styles.rightPanelContainer}`}>
              {/* 试开按钮组 */}
              <div className={`${styles.buttonGroup} mb-6`}>
                {/* Demo按钮 */}
                <div className={styles.iconButtonWrapper}>
                  <button 
                    className={`${styles.iconButton}`}
                    onClick={handleDemoDrawMultipleCards}
                    disabled={isDrawing}
                  >
                    <Image src="/cards/open-icon.png" alt="演示开包图标" width={12} height={14} />
                    Demo
                  </button>
                </div>
                
                {/* 数字按钮组 */}
                <div className={styles.numberButtonGroup}>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 1 ? styles.active : ''}`}
                    onClick={() => setDrawCount(1)}
                  >
                    1x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 3 ? styles.active : ''} ${eventConfig.price === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => eventConfig.price === 0 ? null : setDrawCount(3)}
                    disabled={eventConfig.price === 0}
                  >
                    3x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 5 ? styles.active : ''} ${eventConfig.price === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => eventConfig.price === 0 ? null : setDrawCount(5)}
                    disabled={eventConfig.price === 0}
                  >
                    5x
                  </button>
                </div>
                
                {/* Skip按钮 */}
                <div className={styles.iconButtonWrapper}>
                  <button 
                    className={`${styles.iconButton} ${skipAnimation ? styles.active : ''}`}
                    onClick={() => setSkipAnimation(!skipAnimation)}
                  >
                    <Image src="/cards/open-icon.png" alt="跳过动画图标" width={12} height={14} />
                    Skip
                  </button>
                </div>
              </div>

              {/* 开启Event按钮 */}
              <button 
                className={`w-full py-4 text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg mb-4 ${dailyRewardClaimed ? 'bg-gray-600 cursor-not-allowed' : getPackColorTheme(eventConfig.price).buttonBg} ${!dailyRewardClaimed && !isDrawing ? styles.buttonPulse : ''} ${isDrawing ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleDraw}
                disabled={isDrawing || dailyRewardClaimed}
              >
                {dailyRewardClaimed ? (
                  <>
                    <span>Next claim in:</span>
                    <span className="font-bold text-yellow-400">{timeUntilNextClaim || 'Loading...'}</span>
                  </>
                ) : (
                  <>
                    <span>{isDrawing ? 'Opening...' : 'Open For'}</span>
                    <Image 
                      src="/users/coin.png" 
                      alt="Coin" 
                      width={20} 
                      height={20} 
                    />
                    <span className="font-bold">{eventConfig.price === 0 ? 'Free' : eventConfig.price ? (eventConfig.price * drawCount).toFixed(2) : (5.95 * drawCount).toFixed(2)}</span>
                  </>
                )}
              </button>

              {/* Event info */}
              <div className={`flex justify-between items-center text-sm px-4 py-3 rounded-lg bg-gradient-to-b from-black/20 to-black/40 ${styles.statsContainer}`}>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Max return</div>
                  <div className={`${getPackColorTheme(eventConfig.price).textColor} font-bold text-lg`}>{eventConfig.max_win || '250'}</div>
                </div>
                <div className={`border-l ${getPackColorTheme(eventConfig.price).borderColor} h-8 opacity-30`}></div>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Win rate</div>
                  <div className="text-green-400 font-bold text-lg">{eventConfig.win_rate ? `${eventConfig.win_rate}%` : '30%'}</div>
                </div>
                <div className={`border-l ${getPackColorTheme(eventConfig.price).borderColor} h-8 opacity-30`}></div>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Min return</div>
                  <div className={`${getPackColorTheme(eventConfig.price).textColor} font-bold text-lg`}>{eventConfig.min_win || '180'}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* 卡片列表标题 */}
        <h2 className={`text-center ${styles.sectionTitle}`}>What's in the box?</h2>
        
        {/* 卡片列表 */}
        {cards.length > 0 ? (
          <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4 ${styles.cardsList}`}>
            {cards.map((card) => {
              const getRGBColor = (colorName: string | undefined) => {
                if (!colorName) return '139, 92, 246';
                
                const colorMap: { [key: string]: string } = {
                  'green': '0, 255, 136',
                  'purple': '255, 0, 255',
                  'red': '255, 0, 102',
                  'orange': '255, 136, 0',
                  'blue': '0, 204, 255',
                  'yellow': '255, 255, 0',
                  'pink': '255, 102, 204',
                  'teal': '0, 255, 204',
                  'cyan': '0, 255, 255',
                  'brown': '204, 102, 51',
                  'grey': '204, 204, 204',
                  'gray': '204, 204, 204'
                };
                
                return colorMap[colorName.toLowerCase()] || '139, 92, 246';
              };
              
              const rgbColor = getRGBColor(card.color);
              
              const cardId = card.id || card.card_reference || card.document_id
              const isResultCard = cards.some(sourceCard => 
                sourceCard.used_in_fusion && sourceCard.used_in_fusion.some((fusion: any) => 
                  fusion.result_card_id === cardId
                )
              )
              
              return (
              <div 
                key={card.document_id || card.id || card.card_reference} 
                className={`${styles.cardListItem} cursor-pointer rounded-xl p-1 transition-all duration-300`}
                data-rarity={card.rarity || 1}
                onClick={() => handleCardClick(card)}
                style={{
                  background: `linear-gradient(135deg, rgba(${rgbColor}, 0.2) 0%, rgba(${rgbColor}, 0.6) 100%)`,
                  boxShadow: `0 4px 20px rgba(${rgbColor}, 0.2)`,
                  '--star-color': card.color || '#ffffff',
                  '--card-hover-color': card.color || '#ffffff',
                  '--card-hover-bg': `rgba(${rgbColor}, 0.15)`
                } as React.CSSProperties}
              >
                <div className="rounded-lg overflow-hidden relative" style={{ backgroundColor: `rgba(${rgbColor}, 0.05)` }}>
                  <div className={styles.cardInfoTooltip}>
                    <span className="flex items-center gap-1">
                      more info
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none"/>
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
                        <path d="M12 17h.01"/>
                      </svg>
                    </span>
                  </div>
                  
                  <div className="p-3">
                    <div className={`${styles.cardImageContainer} aspect-[3/4] relative rounded-md overflow-hidden`}>
                      {card.image_url ? (
                        <Image 
                          src={card.image_url} 
                          alt={card.card_name || card.name} 
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full bg-gray-700 text-gray-400">
                          No Image
                        </div>
                      )}
                      
                      <FusionBadge 
                        fusionInfo={card.used_in_fusion} 
                        isResultCard={isResultCard}
                        className="absolute top-1.5 right-1.5"
                        size="small"
                        showTooltip={true}
                      />
                    </div>
                    
                    <div className={`${styles.cardTitle} mt-1 text-center`}>
                      <p className="text-white text-sm font-medium truncate">{card.card_name || card.name || 'Unknown Card'}</p>
                    </div>
                  </div>
                  
                  <div 
                    className="flex justify-between items-center px-3 py-1 text-white font-semibold"
                    style={{
                      background: `linear-gradient(135deg, rgba(${rgbColor}, 0.4) 0%, rgba(${rgbColor}, 0.25) 100%)`
                    }}
                  >
                    <span className="flex items-center gap-1">
                      <Image 
                        src="/users/coin.png" 
                        alt="Coin" 
                        width={16} 
                        height={16} 
                      />
                      <span className="text-sm">{card.point_worth || '0'}</span>
                    </span>
                    <span className="text-xs">
                      {(() => {
                        const p = Number(card.probability);
                        if (Number.isFinite(p)) {
                          const display = p;
                          return `${display.toFixed(2)}%`;
                        }
                        return '?';
                      })()}
                    </span>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-gray-400 py-8">
            No cards available
          </div>
        )}
        
        {/* 卡片详情弹窗 */}
        <div data-pack-cards={JSON.stringify(cards)}>
          <PackCardDetailModal 
            card={selectedCard} 
            isOpen={isModalOpen} 
            onClose={handleCloseModal} 
          />
        </div>
        
        {/* 抽卡弹窗 */}
      {showDrawModal && (
          <div className={styles.drawModal} role="dialog" aria-modal="true">
            <div className={styles.drawModalContent}>

              
              {/* Draw animation - Canvas MP4 Video */}
              {showGif && (
                <div
                  onClick={handleSkipGif}
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
                      handleSkipGif()
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
              
              {/* Draw results */}
              {showModalCards && (
                <div className={styles.cardsWrapper}>
                  <div className={styles.drawnCardsContainer} data-card-count={drawCount}>
                    {drawnCards.map((card, index) => (
                      <DrawnCard
                        key={card.unique_id}
                        card={card}
                        index={index}
                        cardVisible={cardVisible[index]}
                        cardAnimationComplete={cardAnimationComplete[index]}
                        showCards={showCards}
                        flippingCards={flippingCards[index]}
                        showDestroyButton={showDestroyButton}
                        isDemoMode={isDemoMode}
                        selectedCards={selectedCards}
                        handleDrawnCardClick={handleDrawnCardClick}
                        handleCardSelect={handleCardSelect}
                        cardRef={(el) => { cardRefs.current[index] = el; }}
                      />
                    ))}
                  </div>
                  {drawCount > 1 && (
                    <div className={styles.scrollIndicator}>
                      <div className={styles.scrollGradient}></div>
                      <div className={styles.scrollArrow}>→</div>
                    </div>
                  )}
                </div>
              )}
              

              
              {/* Control button area */}
              {!isDrawing && drawnCards.length > 0 && !showGif && (
                <div className={styles.controlButtons}>
                  {/* Centered Redeem confirmation overlay */}
{redeemConfirm.open && (
  <div className="fixed inset-0 z-[100000] bg-black/70 flex items-end justify-center" role="dialog" aria-modal="true" style={{ paddingBottom: '20vh' }}>
                      <div className="bg-white/95 dark:bg-[#1F2235] border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl p-4 w-[320px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
                        <p className="font-medium mb-3 text-gray-900 dark:text-white">
                          Redeem {redeemConfirm.count} card{redeemConfirm.count > 1 ? 's' : ''} for {redeemConfirm.points} points?
                        </p>
                        <div className="flex gap-2 justify-end">
                          <button
                            className="px-3 py-1 rounded bg-green-600 text-white hover:bg-green-700"
                            onClick={confirmRedeem}
                          >
                            Confirm
                          </button>
                          <button
                            className="px-3 py-1 rounded bg-gray-600 text-white hover:bg-gray-700"
                            onClick={() => setRedeemConfirm({ open: false, count: 0, points: 0 })}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {showDestroyButton && !isDemoMode && (
                    <button
                      onClick={handleDestroyCards}
                      disabled={isDestroying || selectedCards.every(selected => !selected)}
                      className={styles.destroyButton}
                    >
                      {isDestroying ? 'Processing...' : `Redeem (${selectedCards.filter(Boolean).length})`}
                    </button>
                  )}
                  {/* Show Flip All button if not all cards are flipped, otherwise show Confirm */}
                  {showCards.some(isFlipped => !isFlipped) ? (
                    <button 
                      className={styles.confirmButton}
                      onClick={handleFlipAll}
                    >
                      Flip All
                    </button>
                  ) : (
                    <button 
                      className={styles.confirmButton}
                      onClick={() => setShowDrawModal(false)}
                    >
                      Confirm
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Render particle burst effects */}
      {particleBursts.map(burst => (
        <ParticleBurst
          key={burst.id}
          trigger={burst.trigger}
          color={burst.color}
          position={burst.position}
          intensity={burst.intensity || 1.2}
        />
      ))}

      {/* Guide Modal */}
      <PackGuideModal 
        isOpen={showGuide}
        onClose={() => setShowGuide(false)}
      />
      

    </div>
  )
}
