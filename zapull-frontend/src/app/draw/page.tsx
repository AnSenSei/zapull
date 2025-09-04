'use client'

import { useState, useEffect, Suspense, memo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import styles from './draw.module.css'
import { getCurrentUserId } from '@/lib/authUtils'
import { userApi } from '@/lib/userApi'
import { packsApi } from '@/lib/packsApi'
import { useCollection } from '@/components/layout/Navbar'
import { useAuthStore } from '@/store/authStore'
import CanvasVideoPlayer, { CanvasVideoPlayerRef } from '@/components/CanvasVideoPlayer'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'
import { audioManager, SOUND_PATHS, initializeAudioManager } from '@/lib/audioManager'
import { useVideoCache } from '@/hooks/useVideoCache'

const floatAnimations = ['float1', 'float2', 'float3', 'float4']

// Create a cache for card back images
const imageCache = new Map<string, string>();

// Get or create cached image URL
const getCachedImageUrl = (color: string): string => {
  const imageColor = color || 'green';
  const cacheKey = `card-back-${imageColor}`;
  
  if (!imageCache.has(cacheKey)) {
    imageCache.set(cacheKey, `/draw/${imageColor}.png`);
  }
  
  return imageCache.get(cacheKey)!;
};

// Memoized card back component with stable image source
const CardBack = memo(({ color, rarity }: { color: string; rarity: string }) => {
  const imageSrc = getCachedImageUrl(color);
  
  return (
    <div className={styles.cardBackImageContainer}>
      <div 
        className={styles.cardBackImage}
        style={{
          backgroundImage: `url(${imageSrc})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          width: '100%',
          height: '100%'
        }}
      />
    </div>
  );
});
CardBack.displayName = 'CardBack';

function DrawPageContent() {
  // Debug: Check if CSS classes exist
  console.log('CSS Classes available:', {
    celebrateOrange: styles.celebrateOrange,
    celebrateRed: styles.celebrateRed,
    modalCard: styles.modalCard,
    revealed: styles.revealed
  })
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedCollectionId } = useCollection()
  const { setUserInfo } = useAuthStore()
  const [isDrawing, setIsDrawing] = useState(false)
  const [showCards, setShowCards] = useState<boolean[]>([])
  const [cards, setCards] = useState<{id: number, name: string, rarity: string, image: string, color: string, uniqueId?: string}[]>([])
  const [drawCount, setDrawCount] = useState(1)
  const [skipAnimation, setSkipAnimation] = useState(true)
  const [showDrawModal, setShowDrawModal] = useState(false)
  const [showGif, setShowGif] = useState(true)
  const [showModalCards, setShowModalCards] = useState(false)
  const [cardVisible, setCardVisible] = useState<boolean[]>([]) // 控制卡片移动动画
  const [cardAnimationComplete, setCardAnimationComplete] = useState<boolean[]>([]) // 控制动画完成状态
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null) // 当前播放的音频
  const [selectedCards, setSelectedCards] = useState<boolean[]>([]) // 选中要销毁的卡片
  const [cardFlipping, setCardFlipping] = useState<boolean[]>([]) // 正在翻转，防止状态抖动
  const [isDestroying, setIsDestroying] = useState(false) // 销毁中状态
  const [showDestroyButton, setShowDestroyButton] = useState(false) // 显示销毁按钮
  const [gifTimeoutId, setGifTimeoutId] = useState<NodeJS.Timeout | null>(null)
  const [videoUrl, setVideoUrl] = useState('https://draw.zapull.fun/draw_animate1.mp4') // 缓存的视频URL
  
  // 使用视频缓存hook
  const videoCache = useVideoCache()
  
  // 视频播放器引用
  const videoPlayerRef = useRef<CanvasVideoPlayerRef>(null)

  // Calculate responsive video box (no fixed aspect ratio; video is letterboxed inside)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const calcW = Math.min(vw * 0.98, 1200) // near full width on mobile
  const calcH = Math.min(vh * 0.92, 900)  // use a tall box on mobile so portrait videos fill nicely

  // Preload card back images and initialize audio manager
  useEffect(() => {
    const colors = ['green', 'red', 'blue', 'purple', 'orange'];
    
    // Create a hidden div to preload background images
    const preloadDiv = document.createElement('div');
    preloadDiv.style.position = 'absolute';
    preloadDiv.style.left = '-9999px';
    preloadDiv.style.width = '1px';
    preloadDiv.style.height = '1px';
    preloadDiv.style.overflow = 'hidden';
    
    colors.forEach(color => {
      const div = document.createElement('div');
      div.style.width = '1px';
      div.style.height = '1px';
      div.style.backgroundImage = `url(/draw/${color}.png)`;
      preloadDiv.appendChild(div);
    });
    
    document.body.appendChild(preloadDiv);
    
    // Initialize audio manager for optimized mobile audio
    initializeAudioManager().catch(error => {
      console.warn('Failed to initialize audio manager:', error);
    });
    
    // Clean up after images load
    return () => {
      if (preloadDiv.parentNode) {
        preloadDiv.parentNode.removeChild(preloadDiv);
      }
    };
  }, []);

  // Refresh user points information
  const refreshUserPoints = async () => {
    try {
      const updatedUserInfo = await userApi.getUserInfo()
      setUserInfo(updatedUserInfo)
    } catch (error) {
      console.error('Failed to refresh user points:', error)
    }
  }

  const cardPool: {id: number, name: string, rarity: string, image: string, color?: string}[] = [
    { id: 1, name: 'Legendary Card 1', rarity: 'legendary', image: '/cards/legendary1.jpg.svg' },
    { id: 2, name: 'Epic Card 1', rarity: 'epic', image: '/cards/epic1.jpg.svg' },
    { id: 3, name: 'Rare Card 1', rarity: 'rare', image: '/cards/rare1.jpg.svg' },
    { id: 4, name: 'Common Card 1', rarity: 'common', image: '/cards/common1.jpg.svg' },
    // Add special test card with explicit red color for testing
    { id: 5, name: 'Ultra Rare Card', rarity: 'legendary', image: '/cards/legendary1.jpg.svg', color: 'red' },
  ]

  // Map rarity to color for burst effects
  const rarityToColor = (rarity: string): string => {
    switch (rarity) {
      case 'legendary':
        return 'orange'
      case 'epic':
        return 'purple'
      case 'rare':
        return 'blue'
      case 'common':
        return 'green'
      default:
        return 'green'
    }
  }

  const handleDraw = async () => {
    if (isDrawing) return
    setIsDrawing(true)
    setShowCards(new Array(drawCount).fill(false))

    // 播放抽卡音效 - 使用优化的音频管理器
    audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })

    // 随机选择卡牌 - 创建新对象以避免引用问题
    const drawnCards: Array<{id: number, name: string, rarity: string, image: string, color: string, uniqueId?: string}> = []
    for (let i = 0; i < drawCount; i++) {
      const selectedCard = cardPool[Math.floor(Math.random() * cardPool.length)]
      const cardColor = selectedCard.color || rarityToColor(selectedCard.rarity)
      const newCard = {
        ...selectedCard,
        // Use explicit color if provided, otherwise map from rarity
        color: cardColor,
        uniqueId: `${Date.now()}-${i}` // Add unique ID for stable keys
      }
      console.log(`Card ${i}: rarity=${selectedCard.rarity}, color=${cardColor}, name=${selectedCard.name}`)
      drawnCards.push(newCard)
    }
    console.log('All drawn cards:', drawnCards)
    setCards(drawnCards)

    // 获取缓存的视频URL
    try {
      const cachedVideoUrl = await videoCache.getVideoUrl((progress) => {
        // 可以添加进度显示逻辑
        console.log(`Video loading progress: ${progress}%`)
      })
      setVideoUrl(cachedVideoUrl)
    } catch (error) {
      console.warn('Failed to load cached video, using direct URL:', error)
      setVideoUrl('https://draw.zapull.fun/draw_animate1.mp4')
    }
    
    // 显示抽卡动画弹窗
    setShowDrawModal(true)

    if (skipAnimation) {
      // 跳过动画时直接显示卡片
      setShowGif(false)
      setShowModalCards(true)
      setShowCards(new Array(drawCount).fill(false))
      setCardVisible(new Array(drawCount).fill(false))
      setCardAnimationComplete(new Array(drawCount).fill(false))
      setCardFlipping(new Array(drawCount).fill(false))
      
      // 逐个显示卡片移动动画
      drawnCards.forEach((card, index) => {
        setTimeout(() => {
          setCardVisible(prev => {
            const newVisible = [...prev]
            newVisible[index] = true
            return newVisible
          })
          // 动画完成后启用鼠标事件
          setTimeout(() => {
            setCardAnimationComplete(prev => {
              const newComplete = [...prev]
              newComplete[index] = true
              return newComplete
            })
          }, 800) // 0.8秒动画完成后
        }, index * 150) // 跳过动画时间隔更短
      })
      
      // 逐个翻转卡片
      drawnCards.forEach((card, index) => {
        setTimeout(() => {
          setShowCards(prev => {
            const newShow = [...prev]
            newShow[index] = true
            return newShow
          })
          // 移除了传说卡牌特效
        }, 800 + index * 300) // 在卡片移动后再翻转
      })
      
      setTimeout(() => {
        setIsDrawing(false)
      }, 800 + drawCount * 300 + 1500)
    } else {
      // 11秒后隐藏GIF并在弹窗内显示卡片（卡背状态）
      const timeoutId = setTimeout(() => {
        setShowGif(false)
        setShowModalCards(true)
        setShowCards(new Array(drawCount).fill(false)) // 显示为卡背状态
        setCardVisible(new Array(drawCount).fill(false)) // 初始化卡片可见性
        setCardAnimationComplete(new Array(drawCount).fill(false)) // 初始化动画完成状态
        setCardFlipping(new Array(drawCount).fill(false)) // 初始化翻转状态
        
        // 逐个显示卡片移动动画
        drawnCards.forEach((card, index) => {
          setTimeout(() => {
            setCardVisible(prev => {
              const newVisible = [...prev]
              newVisible[index] = true
              return newVisible
            })
            // 动画完成后启用鼠标事件
            setTimeout(() => {
              setCardAnimationComplete(prev => {
                const newComplete = [...prev]
                newComplete[index] = true
                return newComplete
              })
            }, 800) // 0.8秒动画完成后
          }, index * 200) // 每张卡片间隔200ms出现
        })
        
        setTimeout(() => {
          setIsDrawing(false)
        }, drawCount * 200 + 1000)
      }, 11000) // 11秒后显示卡片
      
      setGifTimeoutId(timeoutId)
    }
  }

  // Use ref to track flipping state immediately to prevent race conditions
  const flippingRef = useRef<boolean[]>([])
  
  // Initialize flipping ref when cards change
  useEffect(() => {
    flippingRef.current = new Array(cards.length).fill(false)
  }, [cards.length])

  const handleCardClick = useCallback((index: number) => {
    // Prevent multiple triggers on mobile - check if already flipped or flipping
    // Use ref for immediate checking to prevent race conditions
    if (!isDrawing && !showCards[index] && !cardFlipping[index] && !flippingRef.current[index]) {
      // Mark as flipping immediately in ref to prevent double clicks
      flippingRef.current[index] = true
      
      // Initialize audio context on first user interaction
      audioManager.initializeOnUserInteraction()
      
      // 标记当前卡片处于翻转中，避免移动端多次触发或样式抖动
      setCardFlipping(prev => {
        const next = [...prev]
        next[index] = true
        return next
      })
      
      const card = cards[index]
      console.log(`Card ${index} clicked: color=${card.color}, rarity=${card.rarity}, will reveal after animation`)
      
      // 播放卡片翻转音效 - 使用优化的音频管理器
      audioManager.playSound(SOUND_PATHS.FLIP, { volume: 0.7 })
      
      // 根据稀有度播放对应音效
      let raritySound = null
      if (card.rarity === 'rare') {
        raritySound = SOUND_PATHS.RARITY_2
      } else if (card.rarity === 'epic') {
        raritySound = SOUND_PATHS.RARITY_3
      } else if (card.rarity === 'legendary') {
        raritySound = SOUND_PATHS.RARITY_3
      } else {
        raritySound = SOUND_PATHS.RARITY_1 // 默认为普通卡片
      }
      
      // Wait for flip animation to complete before revealing card
      // This ensures the animation always plays
      setTimeout(() => {
        setShowCards(prev => {
          const newShow = [...prev]
          newShow[index] = true
          
          // 检查是否所有卡片都已翻开，如果是则显示销毁按钮
          const allCardsRevealed = newShow.every(shown => shown)
          if (allCardsRevealed) {
            setShowDestroyButton(true)
            setSelectedCards(new Array(cards.length).fill(false))
          }
          
          return newShow
        })
        
        // 播放稀有度音效在卡片翻转后
        if (raritySound) {
          audioManager.playSound(raritySound!, { volume: 0.8, interrupt: true })
        }
      }, 300) // Wait 300ms for flip animation to start before revealing

      // 在过渡结束后移除 flipping 标记（与 CSS 过渡时间匹配）
      setTimeout(() => {
        setCardFlipping(prev => {
          const next = [...prev]
          next[index] = false
          return next
        })
        // Reset flipping ref
        flippingRef.current[index] = false
      }, 650)
    }
  }, [isDrawing, showCards, cards, currentAudio, cardFlipping])

  // 切换卡片选中状态
  const handleCardSelect = (index: number) => {
    if (!showCards[index]) return // 只有翻开的卡片才能选择
    
    setSelectedCards(prev => {
      const newSelected = [...prev]
      newSelected[index] = !newSelected[index]
      return newSelected
    })
  }

  // 销毁选中的卡片
  const handleDestroyCards = async () => {
    const selectedIndices = selectedCards.map((selected, index) => selected ? index : -1).filter(i => i !== -1)
    if (selectedIndices.length === 0) {
      toast.error('Please select cards to destroy')
      return
    }

    if (!confirm(`Are you sure you want to destroy ${selectedIndices.length} card(s)? You will receive corresponding points after destruction.`)) {
      return
    }

    try {
      setIsDestroying(true)
      
      // 构建销毁卡片的数据
      const cardsToDestroy = selectedIndices.map(index => ({
        card_id: cards[index].id.toString(),
        quantity: 1,
        subcollection_name: 'default' // Use default as subcollection_name
      }))

      // 调用销毁API - 使用每张卡片的subcollection_name
      const result = await userApi.batchDestroyCards(cardsToDestroy)
      
      // 从卡片列表中移除已销毁的卡片
      const newCards = cards.filter((_, index) => !selectedCards[index])
      const newShowCards = showCards.filter((_, index) => !selectedCards[index])
      const newCardVisible = cardVisible.filter((_, index) => !selectedCards[index])
      const newCardAnimationComplete = cardAnimationComplete.filter((_, index) => !selectedCards[index])
      
      setCards(newCards)
      setShowCards(newShowCards)
      setCardVisible(newCardVisible)
      setCardAnimationComplete(newCardAnimationComplete)
      setSelectedCards(new Array(newCards.length).fill(false))
      
      // 如果没有卡片了，隐藏销毁按钮
      if (newCards.length === 0) {
        setShowDestroyButton(false)
      }
      
      toastSuccess(`${result.message || `Successfully destroyed ${result.cards_destroyed || selectedIndices.length} cards, earned ${result.points_added || 0} points! Current balance: ${result.remaining_points || 0} points`}`)
      
      // Refresh user points after successful destruction
      await refreshUserPoints()
      
      // 销毁成功后关闭弹窗
      handleCloseModal()
    } catch (error) {
      console.error('Failed to destroy cards:', error)
      toast.error('Failed to destroy cards, please try again later')
    } finally {
      setIsDestroying(false)
    }
  }

  const handleSkipGif = () => {
    if (showGif && gifTimeoutId) {
      clearTimeout(gifTimeoutId)
      setGifTimeoutId(null)
      
      setShowGif(false)
      setShowModalCards(true)
      setShowCards(new Array(drawCount).fill(false))
      setCardVisible(new Array(drawCount).fill(false))
      setCardAnimationComplete(new Array(drawCount).fill(false))
      setCardFlipping(new Array(drawCount).fill(false))
      
      // 逐个显示卡片移动动画
      cards.forEach((card, index) => {
        setTimeout(() => {
          setCardVisible(prev => {
            const newVisible = [...prev]
            newVisible[index] = true
            return newVisible
          })
          // 动画完成后启用鼠标事件
          setTimeout(() => {
            setCardAnimationComplete(prev => {
              const newComplete = [...prev]
              newComplete[index] = true
              return newComplete
            })
          }, 800) // 0.8秒动画完成后
        }, index * 200)
      })
      
      setTimeout(() => {
        setIsDrawing(false)
      }, cards.length * 200 + 1000)
    }
  }

  const handleCloseModal = () => {
    if (gifTimeoutId) {
      clearTimeout(gifTimeoutId)
      setGifTimeoutId(null)
    }
    // 停止当前播放的音频
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
      setCurrentAudio(null)
    }
    setShowDrawModal(false)
    setShowGif(true)
    setShowModalCards(false)
    setCards([])
    setShowCards([])
    setCardVisible([])
    setCardAnimationComplete([])
    setSelectedCards([])
    setShowDestroyButton(false)
    setIsDestroying(false)
    setIsDrawing(false)
  }

  return (
    <div className={styles.drawContainer}>
      <div className={styles.controls}>
        <select 
          value={drawCount} 
          onChange={(e) => setDrawCount(Number(e.target.value))}
          className={styles.select}
        >
          <option value={1}>Draw 1</option>
          <option value={5}>Draw 5</option>
          <option value={10}>Draw 10</option>
        </select>

        <label className={styles.animationToggle}>
          <input
            type="checkbox"
            checked={skipAnimation}
            onChange={(e) => setSkipAnimation(e.target.checked)}
          />
          <span>Skip Animation</span>
        </label>

        <button
          onClick={handleDraw}
          className={styles.drawButton}
          disabled={isDrawing}
        >
          Start Drawing
        </button>
      </div>
      
      <div className={styles.drawArea}>
        <div className={styles.placeholder}>
          Select number of cards to draw
        </div>
      </div>
      
      {/* 抽卡动画弹窗 */}
      {showDrawModal && (
        <div className={styles.drawModal}>
          <div className={styles.drawModalContent}>
            <button 
              className={styles.closeButton}
              onClick={handleCloseModal}
            >
              ×
            </button>
            
            {showGif && (
              <div 
                onClick={handleSkipGif} 
                style={{ 
                  cursor: 'pointer', 
                  width: '100%', 
                  height: '100%', 
                  display: 'flex', 
                  flexDirection: 'column', 
                  justifyContent: 'center', 
                  alignItems: 'center',
                  position: 'relative'
                }}
              >
                {videoCache.isLoading ? (
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    width: calcW,
                    height: calcH,
                    color: 'white',
                    fontSize: '18px'
                  }}>
                    Loading video...
                  </div>
                ) : (
                  <CanvasVideoPlayer
                    ref={videoPlayerRef}
                    src={videoUrl}
                    width={calcW}
                    height={calcH}
                    autoPlay={true}
                    muted={true}
                    onEnded={() => {
                      // Video ended, trigger the same behavior as the timeout
                      handleSkipGif()
                    }}
                    className={styles.drawAnimation}
                    style={{ maxWidth: '100vw', maxHeight: '85vh' }}
                  />
                )}
                <div style={{ 
                  position: 'absolute', 
                  bottom: '20px', 
                  left: '50%', 
                  transform: 'translateX(-50%)',
                  color: 'white',
                  fontSize: '14px',
                  textShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}>
                  Click to skip
                </div>
              </div>
            )}
            
            {showModalCards && (
              <div className={styles.modalCardsContainer}>
                <div className={styles.modalCardsGrid} data-card-count={drawCount}>
                  {cards.map((card, index) => {
                    const floatAnimation = floatAnimations[index % floatAnimations.length]
                    const cardClasses = [
                      styles.modalCard,
                      showCards[index] ? styles.revealed : '',
                      cardVisible[index] ? styles.cardVisible : styles.cardHidden,
                      cardAnimationComplete[index] ? styles.animationComplete : '',
                      cardFlipping[index] ? styles.flipping : ''
                    ].filter(Boolean).join(' ')
                    
                    // Debug logging
                    const isOrange = card.color === 'orange'
                    const isRed = card.color === 'red'
                    const finalClasses = [
                      cardClasses,
                      // Only apply celebrate classes when not skipping animation
                      !skipAnimation && isOrange ? styles.celebrateOrange : '',
                      !skipAnimation && isRed ? styles.celebrateRed : ''
                    ].filter(Boolean).join(' ')
                    
                    // When skipping animation, fill with subtle color without changing size
                    const skipFill: React.CSSProperties = skipAnimation
                      ? {
                          backgroundColor:
                            card.color === 'orange' ? 'rgba(255,165,0,0.12)' :
                            card.color === 'red' ? 'rgba(255,0,0,0.12)' :
                            card.color === 'purple' ? 'rgba(128,0,128,0.12)' :
                            card.color === 'blue' ? 'rgba(0,0,255,0.12)' :
                            card.color === 'green' ? 'rgba(0,128,0,0.12)' : 'transparent'
                        }
                      : {}
                    
                    console.log(`Card ${index} render: color=${card.color}, isOrange=${isOrange}, isRed=${isRed}, revealed=${showCards[index]}, finalClasses=${finalClasses}`)
                    
                    return (
                      <div 
                        key={card.uniqueId || `modal-card-${index}`} 
                        className={finalClasses}
                        data-color={card.color}
                        data-revealed={showCards[index] ? 'true' : 'false'}
                        style={{ 
                          '--float-animation': floatAnimation,
                          animationDelay: skipAnimation ? '0s' : `${index * 0.2}s`,
                          // remove size changes; apply only color fill when skipping
                          ...skipFill
                        } as React.CSSProperties}
                      >
                        <div className={styles.cardInner} onClick={() => handleCardClick(index)}>
                          {/* 卡背 - 默认显示状态 */}
                          <div 
                            className={`${styles.cardFront} ${styles[card.rarity]}`}
                            style={{
                              '--hover-shadow-color': card.color || '#ffffff'
                            } as React.CSSProperties & { '--hover-shadow-color': string }}
                          >
                            <CardBack color={card.color} rarity={card.rarity} />
                            {!showCards[index] && (
                              <div className={styles.clickTip}>Click to flip</div>
                            )}
                          </div>
                          {/* 卡片正面 - 翻转后显示 */}
                          <div className={styles.cardBack}>
                            <img src={card.image} alt={card.name} className={styles.cardImage} />
                          </div>
                        </div>
                        
                        {/* 选择框 - 只在卡片翻开且显示销毁按钮时显示 */}
                        {showCards[index] && showDestroyButton && (
                          <div 
                            className={styles.cardSelectArea}
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCardSelect(index)
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={selectedCards[index] || false}
                              readOnly
                              className={styles.cardCheckbox}
                            />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
            
            {/* 控制按钮区域 - 销毁按钮和确认按钮在同一行 */}
            {!isDrawing && cards.length > 0 && !showGif && (
              <div className={styles.controlButtons}>
                {showDestroyButton && (
                  <button
                    onClick={handleDestroyCards}
                    disabled={isDestroying || selectedCards.every(selected => !selected)}
                    className={styles.destroyButton}
                  >
                    {isDestroying ? 'Destroying...' : `Destroy Selected Cards (${selectedCards.filter(Boolean).length})`}
                  </button>
                )}
                <button 
                  className={styles.confirmButton}
                  onClick={handleCloseModal}
                >
                  Confirm
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DrawPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DrawPageContent />
    </Suspense>
  )
}