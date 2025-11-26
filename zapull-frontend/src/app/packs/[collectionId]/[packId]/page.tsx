'use client'

import { useState, useEffect, useCallback, memo, useRef } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { packsApi, Pack, Card } from '@/lib/packsApi'
import { userApi, UserCard } from '@/lib/userApi'
import { getCurrentUserId } from '@/lib/auth'
import { useAuthStore } from '@/store/authStore'
import styles from '../../packs.module.css'
import PackCardDetailModal from '@/components/PackCardDetailModal'
import FusionBadge from '@/components/FusionBadge'
import { getPackColorTheme } from '@/lib/packColorUtils'
import CanvasVideoPlayer, { CanvasVideoPlayerRef } from '@/components/CanvasVideoPlayer'
import ParticleBurst from '@/components/ParticleBurst'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'
import { lockBodyScroll, unlockBodyScroll, forceUnlockBodyScroll } from '@/lib/scrollLock'
import PackGuideModal from '@/components/PackGuideModal'
import PointsTopUpModal from '@/components/PointsTopUpModal'
import { audioManager, SOUND_PATHS, initializeAudioManager } from '@/lib/audioManager'
import { getDrawAnimationUrl, preloadDrawAnimation, isDrawAnimationCached } from '@/lib/videoCache'

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

const imageLoader = ({ src }) => {
  return src
}

// 定义页面参数接口
interface PackDetailPageProps {
  params: Promise<{
    collectionId: string
    packId: string
  }>
}

const DrawnCard = memo(({ card, index, cardVisible, cardAnimationComplete, showCards, flippingCards, showDestroyButton, isDemoMode, selectedCards, handleDrawnCardClick, handleCardSelect, cardRef }) => {
  // 确保selectedCards是数组，并获取对应索引的值
  const isSelected = Array.isArray(selectedCards) && selectedCards.length > index ? selectedCards[index] : false;
  
  // Debug logging
  console.log(`DrawnCard ${index} render:`, {
    name: card.name,
    color: card.color,
    isOrange: card.color === 'orange',
    isRed: card.color === 'red',
    revealed: showCards?.[index],
    celebrateOrangeClass: styles.celebrateOrange,
    celebrateRedClass: styles.celebrateRed
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
        flippingCards ? styles.prewarm : '',
        card.color === 'orange' ? styles.celebrateOrange : '',
        card.color === 'red' ? styles.celebrateRed : ''
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
          // 如果选择框显示且点击的是选择框区域，则不触发卡片翻转
          if (showCards && showCards[index] && e.target.closest(`.${styles.cardSelectArea}`)) {
            return;
          }
          handleDrawnCardClick(index);
        }}
      >
        {/* 卡片选择区域 - 只在正常抽卡模式下显示 */}
        {showCards && showCards[index] && showDestroyButton && !isDemoMode && (
          <div 
            className={styles.cardSelectArea} 
            style={{ zIndex: 1 }} // 提高z-index确保选择框在最上层
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={(e) => { e.stopPropagation(); handleCardSelect(index); }}
              className={styles.cardCheckbox}
            />
          </div>
        )}
        {/* 卡片正面 - 默认显示状态（卡背） */}
        <div
          className={`${styles.cardFront}`}
          style={{
            '--hover-shadow-color': card.color || '#ffffff',
            borderColor: card.color || 'white',
            '--card-border-color': card.color || 'white',
            zIndex: 5 // 降低z-index，确保选择区域在上层
          } as React.CSSProperties & { '--hover-shadow-color': string, '--card-border-color': string }}
        >
          <Image
            src={`/draw/${card.color || 'green'}.png`}
            alt="卡片背面"
            fill
            className={`object-cover rounded-lg ${styles.cardBackImage}`}
            style={{ pointerEvents: 'none' }} // 确保图片不会阻止点击事件传播
          />
          
          {/* 点击提示 - 只在卡片未翻转且动画完成时显示 */}
          {showCards && !showCards[index] && cardAnimationComplete && !flippingCards && (
            <div className={styles.clickTip}>
              Click to flip
            </div>
          )}
        </div>
        
        {/* 卡片背面 - 翻转后显示（卡面） */}
        <div
          className={`${styles.cardBack}`}
          style={{
            borderColor: card.color || 'white',
            '--card-border-color': card.color || 'white'
          } as React.CSSProperties & { '--card-border-color': string }}
          onClick={(e) => {
            // 在选择模式下处理卡片选择 - 只在正常抽卡模式下允许选择
            if (showCards && showCards[index] && showDestroyButton && !isDemoMode) {
              e.stopPropagation();
              console.log(`卡片正面点击: ${index}, 正常模式，显示销毁按钮: ${showDestroyButton}`);
              handleCardSelect(index);
              return;
            }
          }}
        >
          <Image
            src={optimizeImage(card.image_url || '/cards/card1.jpg', { width: 300, height: 400, quality: 85 })}
            alt={card.card_name || '卡片'}
            fill
            className="object-cover rounded-lg"
            style={{ pointerEvents: 'none' }} // 确保图片不会阻止点击事件传播
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

export default function PackDetailPage({ params }: PackDetailPageProps) {
  const router = useRouter()
  const { uid, setUserInfo, userInfo, openLoginModal } = useAuthStore()
  
  // 状态管理 - 确保所有hooks都在条件返回之前调用
  const [collectionId, setCollectionId] = useState<string>('')
  const [packId, setPackId] = useState<string>('')
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  
  // 确保页面可以滚动 - 清理任何残留的滚动锁
  useEffect(() => {
    // Reset any stuck body scroll locks when component mounts
    try { forceUnlockBodyScroll(); } catch {}
    
    // Cleanup when component unmounts
    return () => {
      try { forceUnlockBodyScroll(); } catch {}
    }
  }, [])
  
  // Get text based on rarity
  const getRarityText = (rarity: number) => {
    switch (rarity) {
      case 1: return 'Common'
      case 2: return 'Rare'
      case 3: return 'Super Rare'
      case 4: return 'Epic'
      case 5: return 'Legendary'
      default: return `Rarity: ${rarity}`
    }
  }
  
  // 状态管理
  const [pack, setPack] = useState<Pack | null>(null)
  const [cards, setCards] = useState<Card[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  
  // 抽卡相关状态
  const [drawCount, setDrawCount] = useState(1)
  const [skipAnimation, setSkipAnimation] = useState(false)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawnCards, setDrawnCards] = useState<(UserCard & { unique_id: string })[]>([])
  const [showDrawModal, setShowDrawModal] = useState(false)
  const [showGif, setShowGif] = useState(true)
  const [showModalCards, setShowModalCards] = useState(false)
  const [showCards, setShowCards] = useState<boolean[]>([])
  const [cardVisible, setCardVisible] = useState<boolean[]>([]) // 控制卡片移动动画
  const [cardAnimationComplete, setCardAnimationComplete] = useState<boolean[]>([]) // 控制动画完成状态
  const [currentAudio, setCurrentAudio] = useState<HTMLAudioElement | null>(null)
  const [flippingCards, setFlippingCards] = useState<boolean[]>([]) // 当前播放的音频
  const [selectedCards, setSelectedCards] = useState<boolean[]>([]) // 选中要销毁的卡片
  const [isDestroying, setIsDestroying] = useState(false) // 销毁中状态
  // Centered redeem confirmation state
  const [redeemConfirm, setRedeemConfirm] = useState<{ open: boolean; count: number; points: number }>({ open: false, count: 0, points: 0 })
  const [redeemIndices, setRedeemIndices] = useState<number[]>([])
  
  // Lock body scroll while redeem confirmation modal is open
  useEffect(() => {
    if (redeemConfirm.open) {
      lockBodyScroll()
      return () => {
        unlockBodyScroll()
      }
    }
  }, [redeemConfirm.open])
  
  // 视频播放器引用
  const videoPlayerRef = useRef<CanvasVideoPlayerRef>(null)

  // Calculate responsive video box (no fixed aspect ratio; video is letterboxed inside)
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 900
  const calcW = Math.min(vw * 0.98, 1200) // nearly full width on mobile
  const calcH = Math.min(vh * 0.92, 900)  // taller box so portrait videos fill better
  const [showDestroyButton, setShowDestroyButton] = useState(false) // 显示销毁按钮
  const [gifTimeoutId, setGifTimeoutId] = useState<NodeJS.Timeout | null>(null)
  const [isDemoMode, setIsDemoMode] = useState(false) // 是否为demo模式
  const [cachedVideoUrl, setCachedVideoUrl] = useState<string>('') // 缓存的视频URL
  const [videoLoadProgress, setVideoLoadProgress] = useState<number>(0) // 视频加载进度
  
  // Particle burst states
  const [particleBursts, setParticleBursts] = useState<Array<{
    id: string;
    color: 'orange' | 'red' | 'purple' | 'blue' | 'green';
    position: { x: number; y: number };
    trigger: boolean;
    intensity?: number;
  }>>([])
  const cardRefs = useRef<(HTMLDivElement | null)[]>([])

  // Refresh user points after spending or earning (using efficient endpoint)
  const refreshUserPoints = async () => {
    try {
      const pointsData = await userApi.getUserPointsBalance()
      // Update only the points-related fields in the user info
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

  // 解析 params - 确保在所有其他hooks之后
  useEffect(() => {
    const resolveParams = async () => {
      const resolvedParams = await params
      setCollectionId(resolvedParams.collectionId)
      setPackId(resolvedParams.packId)
    }
    resolveParams()
  }, [params])

  // 注册CSS Paint Worklet和初始化音频管理器
  useEffect(() => {
    if (typeof window !== 'undefined' && 'CSS' in window && 'paintWorklet' in CSS) {
      CSS.paintWorklet.addModule('/starry-sky.js').catch(err => {
        console.log('Paint Worklet registration failed:', err);
      });
    }
    
    // 初始化音频管理器
    initializeAudioManager().catch(error => {
      console.warn('Failed to initialize audio manager:', error);
    });
  }, []);
  
  // Removed custom scroll handling and restore flags on detail page
  
  // 打开卡片详情弹窗
  const handleCardClick = (card: Card) => {
    setSelectedCard(card)
    setIsModalOpen(true)
  }
  
  // 关闭卡片详情弹窗
  const handleCloseModal = () => {
    setIsModalOpen(false)
  }
  
  // Demo抽卡函数
  const handleDemoDrawMultipleCards = async () => {
    if (isDrawing || !packId || !collectionId) return
    
    try {
      setIsDrawing(true)
      setIsDemoMode(true) // 设置为demo模式
      setShowDestroyButton(false) // 确保Demo模式下不显示销毁按钮
      setShowCards(new Array(drawCount).fill(false))
      
      // 调用Demo抽卡API
      const response = await userApi.demoDrawMultipleCards(packId, collectionId, drawCount)
      // 确保result是数组格式，并为每张卡片添加唯一ID
      const result = (Array.isArray(response) ? response : (response.cards || [])).map((card, index) => ({
        ...card,
        unique_id: `${card.id || card.card_reference || 'card'}-${index}-${Math.random()}`
      }));
      
      // Debug logging for drawn cards
      console.log('Demo Cards Drawn:', result.map((card, idx) => ({
        index: idx,
        name: card.name,
        color: card.color,
        rarity: card.rarity
      })));
      
      setDrawnCards(result)
      
      // 获取缓存的视频URL（仅在首次请求时下载）
      try {
        const videoUrl = await getDrawAnimationUrl((progress) => {
          setVideoLoadProgress(progress);
          console.log(`Loading draw animation: ${progress}%`);
        });
        setCachedVideoUrl(videoUrl);
        console.log('Draw animation ready for playback');
      } catch (error) {
        console.warn('Failed to get cached video URL, using fallback:', error);
        setCachedVideoUrl(''); // 使用fallback URL
      }
      
      // API返回数据后显示抽卡动画弹窗
      setShowDrawModal(true)
      setShowGif(true)
      setShowModalCards(false)
      
      if (skipAnimation) {
        // 播放抽卡音效 - 移动端优化
        try {
          const audio = new Audio('/draw/draw-sound.wav')
          setCurrentAudio(audio)
          audio.play().catch((error) => {
            console.log('Draw sound playback failed (this is normal on mobile):', error.message)
          })
        } catch (error) {
          console.log('Failed to create draw sound:', error)
        }
        
        // 跳过动画时直接显示卡片
        setShowGif(false)
        setShowModalCards(true)
        setShowCards(new Array(drawCount).fill(false))
        setCardVisible(new Array(drawCount).fill(false))
        setCardAnimationComplete(new Array(drawCount).fill(false))
        setFlippingCards(new Array(drawCount).fill(false))
        
        // 逐个显示卡片移动动画
        result.forEach((card, index) => {
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
        
        // 跳过动画时不自动翻开卡片，等待用户手动点击
        setTimeout(() => {
          setIsDrawing(false)
          // Cards are now ready to be manually flipped by user
        }, drawCount * 200 + 1000)
      } else {
        // 播放抽卡音效 - 移动端优化
        try {
          const audio = new Audio('/draw/draw-sound.wav')
          setCurrentAudio(audio)
          audio.play().catch((error) => {
            console.log('Draw sound playback failed (this is normal on mobile):', error.message)
          })
        } catch (error) {
          console.log('Failed to create draw sound:', error)
        }
        
        // 视频播放完成后会自动触发handleSkipGif，这里不需要设置定时器
        // 但为了兼容跳过动画的情况，仍然保留一个备用定时器
        const timeoutId = setTimeout(() => {
          // 如果视频播放超时（比如加载失败），则强制显示卡片
          if (showGif) {
            console.log('Video playback timeout, forcing card display')
            handleSkipGif()
          }
        }, 15000) // 15秒超时保护
        
        setGifTimeoutId(timeoutId)
      }
    } catch (error) {
      console.error('Demo draw failed:', error)
      setError('Demo draw failed, please try again later')
      setIsDrawing(false)
      // 关闭抽卡弹窗
      setShowDrawModal(false)
      setShowGif(true)
      setShowModalCards(false)
      setDrawnCards([])
      setShowCards([])
      setCardVisible([])
      setCardAnimationComplete([])
    }
  }

  // 抽卡函数
  const handleDraw = async () => {
    console.log(uid)
    
    // Check if user is logged in
    if (!uid) {
      openLoginModal()
      return
    }
    
    if (isDrawing || !packId || !collectionId) return
    
    // Frontend validation: Check if user has enough points
    const requiredPoints = (pack?.price || 5.95) * drawCount;
    const userPoints = userInfo?.pointsBalance || 0;
    
    if (userPoints < requiredPoints) {
      // Open top-up modal instead of showing error
      setIsTopUpModalOpen(true);
      return;
    }
    
    try {
      setIsDrawing(true)
      setIsDemoMode(false) // 设置为正式抽卡模式
      setShowDestroyButton(false) // 初始化销毁按钮状态
      setShowCards(new Array(drawCount).fill(false))
      
      // 调用抽卡API
      const response = await userApi.drawMultipleCards(packId, collectionId, drawCount)
      // 确保result是数组格式，并为每张卡片添加唯一ID
      const result = (Array.isArray(response) ? response : (response.cards || [])).map((card, index) => ({
        ...card,
        unique_id: `${card.id || card.card_reference || 'card'}-${index}-${Math.random()}`
      }));
      
      // Debug logging for drawn cards
      console.log('Real Cards Drawn:', result.map((card, idx) => ({
        index: idx,
        name: card.name,
        color: card.color,
        rarity: card.rarity
      })));
      
      setDrawnCards(result)
      
      // 获取缓存的视频URL（仅在首次请求时下载）
      try {
        const videoUrl = await getDrawAnimationUrl((progress) => {
          setVideoLoadProgress(progress);
          console.log(`Loading draw animation: ${progress}%`);
        });
        setCachedVideoUrl(videoUrl);
        console.log('Draw animation ready for playback');
      } catch (error) {
        console.warn('Failed to get cached video URL, using fallback:', error);
        setCachedVideoUrl(''); // 使用fallback URL
      }
      
      // API返回数据后显示抽卡动画弹窗
      setShowDrawModal(true)
      setShowGif(true)
      setShowModalCards(false)
      
      if (skipAnimation) {
        // 播放抽卡音效 - 使用优化的音频管理器
        audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })
        
        // 跳过动画时直接显示卡片
        setShowGif(false)
        setShowModalCards(true)
        setShowCards(new Array(drawCount).fill(false))
        setCardVisible(new Array(drawCount).fill(false))
        setCardAnimationComplete(new Array(drawCount).fill(false))
        setFlippingCards(new Array(drawCount).fill(false))
        
        // 逐个显示卡片移动动画
        result.forEach((card, index) => {
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
        
        // 跳过动画时不自动翻开卡片，等待用户手动点击
        setTimeout(() => {
          setIsDrawing(false)
          // Cards are now ready to be manually flipped by user
          // Destroy button will appear after user manually flips all cards
        }, drawCount * 150 + 1000)
      } else {
        // 播放抽卡音效 - 使用优化的音频管理器
        audioManager.playSound(SOUND_PATHS.DRAW, { volume: 0.8 })
        
        // 视频播放完成后会自动触发handleSkipGif，这里不需要设置定时器
        // 但为了兼容跳过动画的情况，仍然保留一个备用定时器
        const timeoutId = setTimeout(() => {
          // 如果视频播放超时（比如加载失败），则强制显示卡片
          if (showGif) {
            console.log('Video playback timeout, forcing card display')
            handleSkipGif()
          }
        }, 15000) // 15秒超时保护
        
        setGifTimeoutId(timeoutId)
      }
      
      // Refresh user points after successful draw
      await refreshUserPoints()
      
    } catch (error: any) {
      console.error('Draw failed:', error)
      
      // Check if it's an insufficient funds error
      if (error.code === 'INSUFFICIENT_FUNDS') {
        // Parse the error detail to extract the points information
        const detail = error.detail || error.message || '';
        const match = detail.match(/You have (\d+) points, but need (\d+) points/);
        if (match) {
          const [, currentPoints, requiredPoints] = match;
          setError(`Insufficient funds. You have ${currentPoints} points, but need ${requiredPoints} points to draw ${drawCount} card${drawCount > 1 ? 's' : ''}.`);
        } else {
          setError('Insufficient funds to draw cards.');
        }
      } else if (error.response?.status === 400 && error.response?.data?.detail?.includes('Insufficient points balance')) {
        // Fallback for direct API error
        const detail = error.response.data.detail;
        const match = detail.match(/You have (\d+) points, but need (\d+) points/);
        if (match) {
          const [, currentPoints, requiredPoints] = match;
          setError(`Insufficient funds. You have ${currentPoints} points, but need ${requiredPoints} points to draw ${drawCount} card${drawCount > 1 ? 's' : ''}.`);
        } else {
          setError('Insufficient funds to draw cards.');
        }
      } else {
        setError('Draw failed, please try again later')
      }
      
      setIsDrawing(false)
      // 关闭抽卡弹窗
      setShowDrawModal(false)
      setShowGif(true)
      setShowModalCards(false)
      setDrawnCards([])
      setShowCards([])
      setCardVisible([])
      setCardAnimationComplete([])
    }
  }
  
  // 处理翻转动画完成
  const handleFlipAnimationEnd = (index: number) => {
    // 确保索引有效
    if (index < 0 || index >= drawnCards.length) return
    
    // 重置翻转状态
    setFlippingCards(prev => {
      const newFlipping = [...prev]
      newFlipping[index] = false
      return newFlipping
    })
    
    // 设置卡片为已显示状态（动画完成后显示卡面）
    setShowCards(prev => {
      const newShow = [...prev]
      newShow[index] = true
      
      // 检查是否所有卡片都已翻开
      const allCardsRevealed = newShow.every((shown, i) => shown || i >= drawnCards.length)
      if (allCardsRevealed && drawnCards.length > 0) {
        // 在非Demo模式下设置销毁按钮和选择框状态
        if (!isDemoMode) {
          setShowDestroyButton(true)
          setSelectedCards(new Array(drawnCards.length).fill(false))
          console.log('所有卡片已翻开，显示销毁按钮和选择框(正常模式)')
        } else {
          console.log('所有卡片已翻开(Demo模式，不显示销毁功能)')
        }
      }
      
      return newShow
    })
  }

  // 抽卡结果卡片点击
  const handleDrawnCardClick = (index: number) => {
    // Initialize audio context on first user interaction
    audioManager.initializeOnUserInteraction()
    
    // 如果卡片正面已经显示，则点击卡片正面时选择/取消选择该卡片 - Demo模式下也允许选择
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
    
    // 如果卡片背面显示，则执行翻转逻辑
    if (isDrawing || showCards[index] || !drawnCards[index] || flippingCards[index]) {
      return;
    }

    const card = drawnCards[index];

    // 设置翻转状态
    setFlippingCards(prev => {
      const newFlipping = [...prev];
      newFlipping[index] = true;
      return newFlipping;
    });
    
    // Trigger particle burst for special color cards
    if (card.color === 'orange' || card.color === 'red' || card.color === 'purple') {
      const cardElement = cardRefs.current[index];
      if (cardElement) {
        const rect = cardElement.getBoundingClientRect();
        const burstId = `burst-${index}-${Date.now()}`;
        // Intensity based on rarity
        const burstIntensity = card.color === 'red' ? 1.5 : 
                               card.color === 'orange' ? 1.3 : 1.1;
        
        // Calculate position - getBoundingClientRect already gives viewport-relative coordinates
        // which is what we need for the fixed-position particle canvas
        const posX = rect.left + rect.width / 2;
        const posY = rect.top + rect.height / 2;
        
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
        
        // Remove burst after animation completes
        setTimeout(() => {
          setParticleBursts(prev => prev.filter(b => b.id !== burstId));
        }, 3000); // Increased to 3 seconds for the more complex animation
      }
    }

    // 播放卡片翻转音效 - 使用优化的音频管理器
    audioManager.playSound(SOUND_PATHS.FLIP, { volume: 0.7 })

    // 根据颜色播放稀有度音效
    let raritySound = null
    if (card.color === 'red') {
      raritySound = SOUND_PATHS.RARITY_3 // 红色用3
    } else if (card.color === 'orange') {
      raritySound = SOUND_PATHS.RARITY_2 // 橙色用2
    } else if (card.color === 'purple') {
      raritySound = SOUND_PATHS.RARITY_1 // 紫色用1
    }
    // blue和green不播放稀有度音效

    // 播放稀有度音效（只有红橙紫色才播放）
    if (raritySound) {
      // 延迟一点播放稀有度音效，让翻转音效先播放
      setTimeout(() => {
        audioManager.playSound(raritySound!, { volume: 0.8, interrupt: true })
      }, 200)
    }

// 使用 requestAnimationFrame 以获得更流畅的动画，并预热合成层
    requestAnimationFrame(() => {
      // add a short prewarm window before flipping
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

    // 翻转动画完成后重置翻转状态
    setTimeout(() => {
      setFlippingCards(prev => {
        const newFlipping = [...prev];
        newFlipping[index] = false;
        return newFlipping;
      });
    }, 500); // 动画时间为0.5秒
  };

  // Check if all cards are revealed to show the destroy button
  useEffect(() => {
    if (drawnCards.length > 0 && showCards.every(shown => shown)) {
      setShowDestroyButton(true);
      setSelectedCards(new Array(drawnCards.length).fill(false));
    }
  }, [showCards, drawnCards]);

  // 翻转所有未翻转的卡片
  const handleFlipAll = useCallback(() => {
    // 找出所有未翻转的卡片索引
    const unflippedIndices = showCards
      .map((isFlipped, index) => !isFlipped ? index : null)
      .filter(index => index !== null);
    
    if (unflippedIndices.length === 0) return;
    
    // 依次翻转每张未翻转的卡片
    unflippedIndices.forEach((index, i) => {
      setTimeout(() => {
        handleDrawnCardClick(index);
      }, i * 100); // 每张卡片间隔100ms翻转
    });
  }, [showCards, handleDrawnCardClick]);

  // 切换卡片选中状态
  const handleCardSelect = useCallback((index: number) => {
    // 确保卡片存在且已翻开
    if (!drawnCards[index] || !showCards[index]) {
      console.log(`选择被阻止 - 卡片${index}:`, {
        cardExists: !!drawnCards[index],
        cardShown: showCards[index],
        showDestroyButton,
        isDemoMode
      });
      return; // 只有翻开的卡片才能选择
    }
    
    // 打印调试信息
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

  // 销毁选中的卡片
  const handleDestroyCards = async () => {
    const selectedIndices = selectedCards.map((selected, index) => selected ? index : -1).filter(i => i !== -1)
    if (selectedIndices.length === 0) {
      toast.error('Please select cards to redeem')
      return
    }

    // Calculate total points to be redeemed
    const totalPoints = selectedIndices.reduce((sum, index) => {
      return sum + (drawnCards[index].point_worth || 0)
    }, 0)

    // Open centered in-component confirmation overlay
    setRedeemIndices(selectedIndices)
    setRedeemConfirm({ open: true, count: selectedIndices.length, points: totalPoints })
  }

  // Perform redeem using indices stored in state
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
        subcollection_name: collectionId // Use the current collection as subcollection_name
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
  
  // 跳过GIF动画或视频播放完成后的处理
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
        }, index * 200)
      })
      
      // 根据抽卡模式决定后续行为
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
  
  // 关闭抽卡弹窗
  const handleCloseDrawModal = () => {
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
    setDrawnCards([])
    setShowCards([])
    setCardVisible([])
    setCardAnimationComplete([])
    setSelectedCards([])
    setShowDestroyButton(false)
    setIsDestroying(false)
    setIsDrawing(false)
    setIsDemoMode(false) // 重置demo模式状态
  }
  
  // Reset drawCount to 1 for free packs
  useEffect(() => {
    if (pack?.price === 0 && drawCount > 1) {
      setDrawCount(1)
    }
  }, [pack?.price, drawCount])
  
  // 获取卡包详情和卡片列表
  useEffect(() => {
    // 确保useEffect总是被调用，避免hooks数量不一致
    if (!collectionId || !packId) {
      // 如果参数不存在，保持loading状态
      return
    }
    
    const fetchPackDetails = async () => {
      try {
        setLoading(true)
        setError('') // 清除之前的错误
        
        // Restrict access to daily box pack - redirect to events page
        if (packId === '8e03ce64-8111-45f6-aed4-d516c1b00755' && collectionId === 'pokemon') {
          setError('This pack is only available through Events. Redirecting...')
          setTimeout(() => {
            router.push('/events/freedaily-box')
          }, 2000)
          return
        }
        
        // 获取卡包详情 - 移动端优化错误处理
        const packData = await packsApi.getPackDetails(packId, collectionId)
        setPack(packData)
        
        // 获取卡包中的卡片
        const cardsData = await packsApi.getPackCards(collectionId, packId)
        setCards(cardsData)
      } catch (err: any) {
        console.error('Failed to fetch pack details:', err)
        
        // Mobile-friendly error handling
        let errorMessage = 'Failed to fetch pack details, please try again later'
        
        if (err?.response?.status === 404) {
          errorMessage = 'Pack does not exist or has been deleted'
        } else if (err?.response?.status === 401) {
          errorMessage = 'Please login first'
        } else if (err?.response?.status >= 500) {
          errorMessage = 'Server temporarily unavailable, please try again later'
        } else if (err?.code === 'NETWORK_ERROR' || err?.message?.includes('Network Error')) {
          errorMessage = 'Network connection failed, please check network and try again'
        } else if (err?.code === 'TIMEOUT' || err?.message?.includes('timeout')) {
          errorMessage = 'Request timeout, please try again'
        }
        
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }
    
    fetchPackDetails()
  }, [collectionId, packId])
  // Auto-open card modal when ?card= changes or when cards load
  const searchParams = useSearchParams()
  useEffect(() => {
    const cardId = searchParams?.get('card')
    if (!cardId || !cards || cards.length === 0) return
    const match = cards.find((c: any) => c.id === cardId || c.document_id === cardId || c.card_reference === cardId)
    if (match) {
      setSelectedCard(match as Card)
      setIsModalOpen(true)
    }
  }, [searchParams, cards])
  
  // 返回上一页
  const handleGoBack = () => {
    router.back()
  }
  
  // 渲染加载状态
  const renderLoadingState = () => (
    <div className="container mx-auto p-4">
      <div className="animate-pulse space-y-6">
        {/* 返回按钮占位 */}
        <div className="h-10 w-24 bg-gray-700 rounded"></div>
        
        {/* 卡包标题占位 */}
        <div className="h-8 w-64 bg-gray-700 rounded mx-auto"></div>
        
        {/* 卡包图片占位 */}
        <div className="aspect-square max-w-md mx-auto bg-gray-700 rounded-lg"></div>
        
        {/* 卡包信息占位 */}
        <div className="flex justify-between max-w-md mx-auto">
          <div className="h-6 w-20 bg-gray-700 rounded"></div>
          <div className="h-6 w-20 bg-gray-700 rounded"></div>
          <div className="h-6 w-20 bg-gray-700 rounded"></div>
        </div>
        
        {/* 卡片列表占位 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-8">
          {Array(8).fill(null).map((_, i) => (
            <div key={`card-skeleton-${i}`} className="aspect-[3/4] bg-gray-700 rounded-lg"></div>
          ))}
        </div>
      </div>
    </div>
  )
  
  // 重试加载函数
  const handleRetry = () => {
    if (!collectionId || !packId) return
    
    const fetchPackDetails = async () => {
      try {
        setLoading(true)
        setError('') // 清除之前的错误
        
        // 获取卡包详情 - 移动端优化错误处理
        const packData = await packsApi.getPackDetails(packId, collectionId)
        setPack(packData)
        
        // 获取卡包中的卡片
        const cardsData = await packsApi.getPackCards(collectionId, packId)
        setCards(cardsData)
      } catch (err: any) {
        console.error('Failed to fetch pack details:', err)
        
        // Mobile-friendly error handling
        let errorMessage = 'Failed to fetch pack details, please try again later'
        
        if (err?.response?.status === 404) {
          errorMessage = 'Pack does not exist or has been deleted'
        } else if (err?.response?.status === 401) {
          errorMessage = 'Please login first'
        } else if (err?.response?.status >= 500) {
          errorMessage = 'Server temporarily unavailable, please try again later'
        } else if (err?.code === 'NETWORK_ERROR' || err?.message?.includes('Network Error')) {
          errorMessage = 'Network connection failed, please check network and try again'
        } else if (err?.code === 'TIMEOUT' || err?.message?.includes('timeout')) {
          errorMessage = 'Request timeout, please try again'
        }
        
        setError(errorMessage)
      } finally {
        setLoading(false)
      }
    }
    
    fetchPackDetails()
  }

  // 渲染错误状态
  const renderErrorState = () => (
    <div className="container mx-auto p-4 text-center">
      <div className="flex flex-col items-center space-y-4">
        <button 
          onClick={handleGoBack}
          className={`px-4 py-2 text-white rounded transition-all duration-300 ${getPackColorTheme(pack?.price).buttonBg}`}
        >
          Back
        </button>
        <div className="text-red-500 text-xl mb-4">{error}</div>
        {/* 移动端友好的重试按钮 */}
        <button 
          onClick={handleRetry}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-lg font-medium"
        >
          Retry
        </button>
      </div>
    </div>
  )
  
  // 渲染卡包不存在状态
  const renderPackNotFoundState = () => (
    <div className="container mx-auto p-4 text-center">
      <button 
        onClick={handleGoBack}
        className={`mb-4 px-4 py-2 text-white rounded transition-all duration-300 ${getPackColorTheme(pack?.price).buttonBg}`}
      >
        Back
      </button>
      <div className="text-xl text-white">Pack not found or has been deleted</div>
    </div>
  )
  
  // 条件渲染逻辑
  if (loading) {
    return renderLoadingState()
  }
  
  if (error) {
    return renderErrorState()
  }
  
  if (!pack) {
    return renderPackNotFoundState()
  }
  
  // Determine if fusion should be available: either backend says the pack has recipes
  // OR any card in this pack indicates it is used in a fusion
  // Be robust to backends that may serialize used_in_fusion as a JSON string or other truthy value
  const hasFusionRecipes = Boolean(pack?.has_fusion_recipes) || cards.some((c: any) => {
    const u = c?.used_in_fusion as any
    if (!u) return false
    if (Array.isArray(u)) return u.length > 0
    // Handle stringified JSON or other structures
    try {
      const parsed = typeof u === 'string' ? JSON.parse(u) : u
      return Array.isArray(parsed) ? parsed.length > 0 : Boolean(parsed)
    } catch {
      return Boolean(u)
    }
  })
  
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

        {/* Guide button - same style as inventory */}
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
      
      {/* 卡包详情 */}
      <div className="w-full relative z-10">
        <h1 className={`text-3xl font-bold text-center mb-8 ${styles.pageTitle}`}>{pack.name || 'AMG Vs BMW'}</h1>
        
        {/* 卡包详情 - 左右布局 */}
        <div className={`gap-8 mb-12 ${styles.packDetailContainer} ${styles.infoContainer}`}>
          {/* 左侧 - 卡包图片 */}
          <div className={`md:w-1/2 ${styles.imageWrapper}`}>
            <div className={`aspect-square w-full ${styles.packImageContainer} relative rounded-lg p-[2px] ${getPackColorTheme(pack?.price).boxShadow}`}>
              <div className={`absolute inset-0 rounded-lg ${getPackColorTheme(pack?.price).bgGradient} opacity-60`}></div>
              <div
                className="relative w-full h-full rounded-lg overflow-hidden p-2"
                style={{ background: 'transparent' }}
              >
                {pack.image_url ? (
                  <Image 
                    src={optimizeImage(pack.image_url, { width: 400, height: 400, quality: 85 })} 
                    alt={pack.name} 
                    fill
                    className="object-contain"
                    priority
                  />
                ) : (
                  <Image 
                    src="/cards/legendary1.jpg.svg" 
                    alt="Crypto King" 
                    fill
                    className="object-contain"
                    priority
                  />
                )}
              </div>
            </div>
          </div>
          
          {/* 右侧 - 卡包信息和按钮 */}
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
                    className={`${styles.numberButton} ${drawCount === 3 ? styles.active : ''} ${pack?.price === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => pack?.price === 0 ? null : setDrawCount(3)}
                    disabled={pack?.price === 0}
                  >
                    3x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 5 ? styles.active : ''} ${pack?.price === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => pack?.price === 0 ? null : setDrawCount(5)}
                    disabled={pack?.price === 0}
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

              {/* 开启卡包按钮 */}
              <button 
                className={`w-full py-4 text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg mb-4 ${getPackColorTheme(pack?.price).buttonBg} ${styles.buttonPulse} ${isDrawing ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={handleDraw}
                disabled={isDrawing}
              >
                <span>{isDrawing ? 'Opening...' : 'Open For'}</span>
                <Image 
                  src="/users/coin.png" 
                  alt="Coin" 
                  width={20} 
                  height={20} 
                />
                <span className="font-bold">{pack.price === 0 ? 'Free' : pack.price ? (pack.price * drawCount).toFixed(2) : (5.95 * drawCount).toFixed(2)}</span>
              </button>

              {/* Fusion button - show if pack or any of its cards have fusion recipes */}
              {hasFusionRecipes && (
                <Link 
                  href={`/synthesis?collection=${collectionId}&pack=${packId}`}
                  className="w-full py-4 mb-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl transition-all duration-300 flex items-center justify-center gap-2 text-lg hover:from-purple-700 hover:to-pink-700"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                  <span className="font-bold">View Fusion Recipes</span>
                </Link>
              )}

              {/* 盲盒信息 with colored theme */}
<div className={`flex justify-between items-center text-sm px-4 py-3 rounded-lg bg-gradient-to-b from-black/20 to-black/40 ${styles.statsContainer}`}>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Max return</div>
                  <div className={`${getPackColorTheme(pack?.price).textColor} font-bold text-lg`}>{pack.max_win || '250'}</div>
                </div>
                <div className={`border-l ${getPackColorTheme(pack?.price).borderColor} h-8 opacity-30`}></div>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Win rate</div>
                  <div className="text-green-400 font-bold text-lg">{pack.win_rate ? `${pack.win_rate}%` : '30%'}</div>
                </div>
                <div className={`border-l ${getPackColorTheme(pack?.price).borderColor} h-8 opacity-30`}></div>
                <div className="text-center">
                  <div className="text-gray-400 text-xs">Min return</div>
                  <div className={`${getPackColorTheme(pack?.price).textColor} font-bold text-lg`}>{pack.min_win || '180'}</div>
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
              // Convert color names to RGB values for transparency
              const getRGBColor = (colorName: string | undefined) => {
                if (!colorName) return '139, 92, 246'; // Default purple RGB
                
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
              
              // Check if this card can be created through fusion (is a result card)
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
                {/* Inner card */}
                <div className="rounded-lg overflow-hidden relative" style={{ backgroundColor: `rgba(${rgbColor}, 0.05)` }}>
                  {/* Info提示框 - 相对于整个卡片容器定位 */}
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
                    {/* 卡片图片 */}
                    	<div className={`${styles.cardImageContainer} aspect-[3/4] relative rounded-md overflow-hidden`}>
                      {card.image_url ? (
                        <Image 
                          src={optimizeImage(card.image_url, { width: 300, height: 400, quality: 85 })} 
                          alt={card.card_name || card.name} 
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full bg-gray-700 text-gray-400">
                          No Image
                        </div>
                      )}
                      
                      {/* 融合徽章 - 显示在右上角 */}
                      <FusionBadge 
                        fusionInfo={card.used_in_fusion} 
                        isResultCard={isResultCard}
                        className="absolute top-1.5 right-1.5"
                        size="small"
                        showTooltip={true}
                      />
                    </div>
                    
                    {/* 卡片名称 */}
                    	<div className={`${styles.cardTitle} mt-1 text-center`}>
                      	<p className="text-white text-sm font-medium truncate">{card.card_name || card.name || 'Unknown Card'}</p>
                    	</div>
                  </div>
                  
                  {/* 价格和概率容器 */}
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
                          // API returns probability in percent units already (e.g., 0.1 => 0.1%)
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
            暂无卡片信息
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
                      // 视频播放完成后自动显示卡片
                      console.log('Draw animation video ended, showing cards')
                      handleSkipGif()
                    }}
                    onLoadedData={() => {
                      console.log('Draw animation video loaded')
                      // 视频加载完成后开始播放
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
              

              
              {/* Control button area - destroy button and confirm/flip all button on the same line */}
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
      
      {/* Points Top-up Modal */}
      <PointsTopUpModal
        isOpen={isTopUpModalOpen}
        onClose={() => setIsTopUpModalOpen(false)}
      />
    </div>
  )
}