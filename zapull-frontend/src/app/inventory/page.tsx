'use client';

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { userApi, UserCard } from '@/lib/userApi'
import { getCurrentUserId, isAuthenticated } from '@/lib/authUtils'
import { useCollection } from '@/components/layout/Navbar'
import CustomDropdown from '@/components/CustomDropdown'
import SellCardModal from '@/components/SellCardModal'
import InventoryCardDetailModal from '@/components/InventoryCardDetailModal'
import UserNavigation from '@/components/UserNavigation'
import DestroyCardsModal from '@/components/DestroyCardsModal'
import toast from 'react-hot-toast'
import WithdrawCardsModal from '@/components/WithdrawCardsModal'
import ConfirmWithdrawModal from '@/components/ConfirmWithdrawModal'
import InventoryGuideModal from '@/components/InventoryGuideModal'
import { toastSuccess } from '@/lib/toast'
import FusionBadge from '@/components/FusionBadge'
import InventoryPriceRangeSelector from '@/components/InventoryPriceRangeSelector'
import { useCardSelection } from '@/hooks/useCardSelection'
import { useCollectionSelection } from '@/hooks/useCollectionSelection'

// Simple helper to optimize images with Cloudflare Image Resizing
const optimizeImage = (url: string, options: { quality?: number; width?: number; height?: number } = {}) => {
  if (!url) return url
  
  // Extract the domain from the image URL
  const urlObj = new URL(url)
  const domain = urlObj.origin
  const path = urlObj.pathname + urlObj.search
  
  const { quality = 80, width, height } = options
  const params = [`format=auto`, `quality=${quality}`]
  
  if (width) params.push(`width=${width}`)
  if (height) params.push(`height=${height}`)
  
  return `${domain}/cdn-cgi/image/${params.join(',')}${path}`
}

export default function InventoryPage() {
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [selectedCardsData, setSelectedCardsData] = useState<Map<string, UserCard>>(new Map())
  const [cards, setCards] = useState<UserCard[]>([])
  const [allCards, setAllCards] = useState<UserCard[]>([]) // Store all fetched cards
  const [displayedCards, setDisplayedCards] = useState<UserCard[]>([]) // Cards shown after filtering
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [showSellModal, setShowSellModal] = useState(false)
  const [selectedCardForSell, setSelectedCardForSell] = useState<UserCard | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [selectedCardForDetail, setSelectedCardForDetail] = useState<UserCard | null>(null)
  const [showDestroyModal, setShowDestroyModal] = useState(false)
  const [showWithdrawModal, setShowWithdrawModal] = useState(false)
  const [showConfirmWithdrawModal, setShowConfirmWithdrawModal] = useState(false)
  const [pendingWithdrawCards, setPendingWithdrawCards] = useState<{ card_name: string; quantity: number; subcollection_name: string }[]>([])
  const [sortBy, setSortBy] = useState<string>('date_got')
  const [sortOrder, setSortOrder] = useState<string>('desc')
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false)
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 40 }) // Track which cards should load images
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
  const { userInfo, uid } = useAuthStore()
  const { collections, loadingCollections } = useCollection()
  const isFetchingRef = useRef(false)
  const { authInitialized } = useAuthStore()
  
  // Check if user is a new account
  const isNewAccount = userInfo?.new_account === true
  
  // Use custom hooks for state management with persistence
  const cardSelection = useCardSelection({
    ttl: 30 * 60 * 1000, // 30 minutes TTL
    clearOnRefresh: true // Clear card selection on page refresh
  })
  const { selectedCards, toggleCard: handleCardSelect, clearSelection } = cardSelection
  
  const collectionSelection = useCollectionSelection({
    defaultCollection: 'pokemon'
  })
  const { selectedCollection: selectedCollectionId, updateCollection: setSelectedCollectionId } = collectionSelection
  
  // Utility function to capitalize first letter
  const capitalizeFirst = (str: string | undefined): string => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  // Handle refresh button click - clear selections and fetch cards
  const handleRefresh = async () => {
    // Clear card selection when refresh is clicked
    clearSelection()
    // Also clear the selected cards data map
    setSelectedCardsData(new Map())
    // Fetch fresh card data
    await fetchUserCards(false)
  }

  // 获取用户卡片数据
  const fetchUserCards = async (isLoadMore = false) => {
    const userId = getCurrentUserId()
    console.log('fetchUserCards called, userId:', userId, 'collectionId:', selectedCollectionId, 'isLoadMore:', isLoadMore)
    if (!userId) {
      console.log('No userId, skipping API call')
      return;
    }
    
    // Don't fetch if no collection is selected yet
    if (!selectedCollectionId) {
      console.log('No collection selected, skipping API call')
      setLoading(false)
      return;
    }
    
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log('Already fetching, skipping duplicate request')
      return;
    }
    
    try {
      isFetchingRef.current = true
      if (isLoadMore) {
        setLoadingMore(true)
      } else {
        setLoading(true)
      }
      setError('')
      
      const response = await userApi.getUserCards({
        collection_id: selectedCollectionId,
        page: isLoadMore ? currentPage + 1 : 1,
        per_page: isLoadMore ? 30 : 200, // Fetch 200 cards initially, then 30 for load more
        // Don't send search_query or sort params to backend - all done on frontend
      })
      
      // 合并所有子集合的卡片，并确保每张卡片都有subcollection_name
      const newCards = response.subcollections.flatMap(sub => 
        sub.cards.map(card => ({
          ...card,
          subcollection_name: sub.subcollection_name
        }))
      )

      if (isLoadMore) {
        // Append to existing cards
        setAllCards(prev => [...prev, ...newCards])
        setCurrentPage(prev => prev + 1)
      } else {
        // Replace cards (new search or collection change)
        setAllCards(newCards)
      }
      
      // 使用第一个子集合的分页信息（假设所有子集合的分页信息相同）
      if (response.subcollections.length > 0) {
        const pagination = response.subcollections[0].pagination
        setTotalPages(pagination.total_pages)
        setTotalItems(pagination.total_items)
      }
    } catch (err) {
      console.error('获取用户卡片失败:', err)
      setError('Failed to load cards')
    } finally {
      setLoading(false)
      setLoadingMore(false)
      isFetchingRef.current = false
    }
  }

  // Check authentication on mount - wait for auth to be initialized
  useEffect(() => {
    // Don't check authentication until auth is properly initialized
    if (!authInitialized) {
      return;
    }
    
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
      return;
    }
  }, [router, authInitialized]);

  // 设置默认分类为pokemon如果可用
  useEffect(() => {
    if (!loadingCollections && collections.length > 0 && selectedCollectionId === '') {
      const pokemonCollection = collections.find(c => c.id === 'pokemon')
      if (pokemonCollection) {
        setSelectedCollectionId('pokemon')
      } else {
        setSelectedCollectionId(collections[0].id)
      }
    }
  }, [collections, loadingCollections])

  // Reset when collection changes
  useEffect(() => {
    if (selectedCollectionId) {
      setCurrentPage(1)
      setAllCards([])
      setDisplayedCards([])
      setCards([])
    }
  }, [selectedCollectionId])

  // Load initial data when collection changes (not sort - that's frontend only)
  useEffect(() => {
    if (!loadingCollections && selectedCollectionId && uid) {
      // Add a small delay to prevent double loading when collection changes and page resets
      const timer = setTimeout(() => {
        fetchUserCards(false) // Initial load, not a "load more"
      }, 50)
      return () => clearTimeout(timer)
    }
  }, [selectedCollectionId, loadingCollections, uid]) // Removed sortBy, sortOrder - frontend only

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 500) // Wait 500ms after user stops typing
    
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Sort function for cards
  const sortCards = useCallback((cardsToSort: UserCard[]) => {
    const sorted = [...cardsToSort].sort((a, b) => {
      let compareValue = 0;
      
      switch (sortBy) {
        case 'date_got':
          // Sort by time to expiration (Expires in)
          const expA = new Date(a.buybackexpiresAt || 0).getTime();
          const expB = new Date(b.buybackexpiresAt || 0).getTime();
          // Earlier expiration should come first when ascending
          compareValue = expA - expB;
          break;
        case 'rarity':
          // Sort by rarity
          compareValue = (b.rarity || 0) - (a.rarity || 0); // Highest rarity first
          break;
        case 'name':
          // Sort alphabetically by card name
          compareValue = a.card_name.localeCompare(b.card_name);
          break;
        case 'quantity':
          // Sort by quantity
          compareValue = (b.quantity || 0) - (a.quantity || 0); // Most quantity first
          break;
        case 'point_worth':
          // Sort by point worth
          compareValue = (b.point_worth || 0) - (a.point_worth || 0); // Highest points first
          break;
        default:
          // Default to expiration time as well
          const defA = new Date(a.buybackexpiresAt || 0).getTime();
          const defB = new Date(b.buybackexpiresAt || 0).getTime();
          compareValue = defA - defB;
      }
      
      // Apply sort order (asc/desc)
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });
    
    return sorted;
  }, [sortBy, sortOrder]);

  // Filter and sort cards based on search query and sort settings (frontend filtering & sorting)
  useEffect(() => {
    let processedCards = [...allCards];
    
    // Apply search filter
    if (debouncedSearchQuery) {
      processedCards = processedCards.filter(card => 
        card.card_name.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
      );
    }
    
    // Apply sorting
    processedCards = sortCards(processedCards);
    
    setDisplayedCards(processedCards);
    setCards(processedCards);
    
    // Reset visible range when cards change
    setVisibleRange({ start: 0, end: 40 });
  }, [debouncedSearchQuery, allCards, sortCards]) // sortCards is now memoized with useCallback

  // Keep selectedCardsData in sync with latest card quantities/prices
  // NOTE: Do not clear selections when switching collections. Only update entries
  // for cards present in the current list, and keep others as-is so users can
  // select across collections before withdrawing.
  useEffect(() => {
    setSelectedCardsData(prev => {
      const next = new Map<string, UserCard>(prev);
      selectedCards.forEach(id => {
        const updated = cards.find(c => c.id === id);
        if (updated) {
          if ((updated.quantity || 0) > 0) {
            next.set(id, updated);
          } else {
            // Quantity is 0, remove from selected data
            next.delete(id);
          }
        }
        // If not found in current cards, keep previous data intact
      });
      return next;
    });

    // Cards with 0 quantity will be automatically removed from selection by the hook's logic
    // since they're no longer valid selections
  }, [cards, selectedCards]);

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (target.isIntersecting && !loadingMore && currentPage < totalPages) {
          fetchUserCards(true) // Load more cards
        }
      },
      {
        root: null,
        rootMargin: '100px', // Start loading 100px before reaching the bottom
        threshold: 0.1
      }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) {
      observer.observe(currentRef)
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef)
      }
    }
  }, [loadingMore, currentPage, totalPages, selectedCollectionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy loading for card images - expand visible range as user scrolls
  useEffect(() => {
    let scrollTimer: NodeJS.Timeout
    
    const handleScroll = () => {
      // Debounce scroll handler for better performance
      clearTimeout(scrollTimer)
      scrollTimer = setTimeout(() => {
        const scrollPosition = window.scrollY + window.innerHeight
        const pageHeight = document.documentElement.scrollHeight
        const scrollPercentage = scrollPosition / pageHeight
        
        // Calculate how many cards should be visible based on scroll
        const totalCards = cards.length
        const newEnd = Math.min(
          Math.max(40, Math.floor(scrollPercentage * totalCards * 1.5)), // Load 1.5x ahead
          totalCards
        )
        
        setVisibleRange(prev => {
          if (newEnd > prev.end) {
            return { start: 0, end: newEnd }
          }
          return prev
        })
      }, 100) // Debounce by 100ms
    }

    window.addEventListener('scroll', handleScroll)
    return () => {
      window.removeEventListener('scroll', handleScroll)
      clearTimeout(scrollTimer)
    }
  }, [cards.length])

  // Click outside to close sort dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement
      
      if (isSortDropdownOpen && !target.closest('.sort-dropdown')) {
        setIsSortDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isSortDropdownOpen])

  // Removed select-all functionality per new UX
  
  // Update selectedCardsData whenever card selection changes
  useEffect(() => {
    const newSelectedData = new Map(selectedCardsData)
    
    // Remove cards that are no longer selected
    for (const [cardId] of selectedCardsData) {
      if (!selectedCards.includes(cardId)) {
        newSelectedData.delete(cardId)
      }
    }
    
    // Add cards that are newly selected
    selectedCards.forEach(cardId => {
      if (!selectedCardsData.has(cardId)) {
        const card = cards.find(c => c.id === cardId)
        if (card) {
          newSelectedData.set(cardId, card)
        }
      }
    })
    
    if (newSelectedData.size !== selectedCardsData.size || 
        [...newSelectedData.keys()].some(id => !selectedCardsData.has(id))) {
      setSelectedCardsData(newSelectedData)
    }
  }, [selectedCards, cards])

  // Handle card selection - cards can be selected regardless of point value
  // Withdraw button will be disabled separately if minimum not met
  const handleCardSelectionWithValidation = (card: UserCard) => {
    handleCardSelect(card.id)
  }

  // 处理卡片点击 - 打开详情弹窗
  const handleCardClick = (card: UserCard, event: React.MouseEvent) => {
    // 如果点击的是选择框区域，则执行选择逻辑
    const target = event.target as HTMLElement
    if (target.closest('.card-select-area')) {
      handleCardSelectionWithValidation(card)
      return
    }
    
    // 打开详情弹窗
    setSelectedCardForDetail(card)
    setShowDetailModal(true)
  }

  // 处理售卖
  const handleSell = (price: number, card: UserCard) => {
    console.log('售卖卡片:', card.card_name, '价格:', price)
    fetchUserCards()
  }

  // 处理从详情模态框打开售卖模态框
  const handleSellFromDetail = (card: UserCard) => {
    setSelectedCardForSell(card)
    setShowSellModal(true)
  }

  // 处理从详情模态框进行单张卡片兑换
  const handleRedeemFromDetail = (card: UserCard) => {
    const isExpired = new Date(card.buybackexpiresAt).getTime() <= new Date().getTime()
    if (isExpired) {
      toast.error('Expired cards cannot be redeemed for points')
      return
    }

    // Call the existing destroy cards function with this single card
    const cardsToDestroy = [{
      card_id: card.id,
      quantity: 1,
      subcollection_name: card.subcollection_name || 'unknown',
      card_reference: card.card_reference
    }]
    
    handleConfirmDestroy(cardsToDestroy)
  }

  // Handle card destruction for points
  const handleRedeemPoints = () => {
    if (selectedCards.length === 0) {
      toast.error('Please select cards to destroy')
      return
    }

    const selectedCardData = Array.from(selectedCardsData.values())
    const hasExpiredCards = selectedCardData.some(card => 
      new Date(card.buybackexpiresAt).getTime() <= new Date().getTime()
    )

    if (hasExpiredCards) {
      toast.error('Some selected cards have expired buyback periods and cannot be destroyed')
      return
    }

    setShowDestroyModal(true)
  }

  // Handle confirm card destruction
  const handleConfirmDestroy = async (cardsToDestroy: { card_id: string; quantity: number; subcollection_name?: string; card_reference?: string }[]) => {
    try {
      setLoading(true)
      
      // Ensure each entry has subcollection_name; derive from current cards if missing
      const enriched = cardsToDestroy.map(item => {
        if (item.subcollection_name) return item
        const found = cards.find(c => c.id === item.card_id)
        const subcollection_name = (found as any)?.subcollection_name || (found?.card_reference?.includes('/') ? found.card_reference.split('/')[0] : selectedCollectionId)
        return { ...item, subcollection_name }
      })
      
      // Call destroy API with per-card subcollection names
      const result = await userApi.batchDestroyCards(enriched)
      
      // Remove destroyed cards from selection using the hook's methods
      const newSelectedData = new Map(selectedCardsData)
      enriched.forEach(c => {
        if (selectedCards.includes(c.card_id)) {
          handleCardSelect(c.card_id) // This will remove the card from selection
        }
        newSelectedData.delete(c.card_id)
      })
      
      setSelectedCardsData(newSelectedData)
      
      // Refresh card data
      await fetchUserCards()
      
      // Refresh user points information
      try {
        const updatedUserInfo = await userApi.getUserInfo()
        // Update global user info state
        const { setUserInfo } = useAuthStore.getState()
        setUserInfo(updatedUserInfo)
      } catch (refreshError) {
        console.error('Failed to refresh user points:', refreshError)
      }
      
      toastSuccess(`${result.message || `Successfully destroyed ${result.cards_destroyed} cards and received ${result.points_added} points! Current balance: ${result.remaining_points} points`}`)
      
      // Success: do not hard refresh; state has been updated and cards re-fetched
    } catch (error: any) {
      console.error('Failed to destroy cards:', error)
      
      const errorMessage = error?.response?.data?.detail || error?.message || 'Failed to destroy cards, please try again'
      
      if (errorMessage.includes('buyback period has expired')) {
        toast.error('Cannot destroy cards: Buyback period has expired. Expired cards cannot be destroyed.')
      } else {
        toast.error(`Failed to destroy cards: ${errorMessage}`)
      }
      // Error: do not refresh; keep user context
    } finally {
      setLoading(false)
      setShowDestroyModal(false)
    }
  }

  // 处理提现卡片
  const handleWithdraw = () => {
    if (selectedCards.length === 0) {
      toast.error('Please select cards to withdraw')
      return
    }

    setShowWithdrawModal(true)
  }

  // 处理确认提现 - 从第一个modal到确认modal
  const handleConfirmWithdraw = async (cardsToWithdraw: { card_id: string; card_name: string; quantity: number; subcollection_name: string }[]) => {
    // Store the cards to withdraw
    setPendingWithdrawCards(cardsToWithdraw)
    
    // Close the first modal
    setShowWithdrawModal(false)
    
    // Open the confirmation modal
    setShowConfirmWithdrawModal(true)
  }

  // 处理最终确认提现
  const handleFinalWithdrawConfirm = async () => {
    try {
      // Clear selection using the hook's methods
      selectedCards.forEach(cardId => {
        handleCardSelect(cardId) // This will remove each card from selection
      })
      setSelectedCardsData(new Map())
      
      // Close modal
      setShowConfirmWithdrawModal(false)
      
      // Show success message
      toastSuccess('Withdrawal request submitted successfully!')
      
      // Refresh the cards list to update quantities
      await fetchUserCards()
    } catch (error) {
      console.error('Failed to submit withdrawal request:', error)
      toast.error('Failed to submit withdrawal request. Please try again.')
    }
  }

  // Handle bulk selection by price range
  const handleSelectByPriceRange = (minPoints: number | undefined, maxPoints: number | undefined, excludeMaterials?: boolean, excludeExpired?: boolean) => {
    // Filter cards based on point_worth within the range
    const cardsInRange = cards.filter(card => {
      const pointWorth = card.point_worth || 0
      
      // Check if card falls within the price range
      if (minPoints !== undefined && pointWorth < minPoints) return false
      if (maxPoints !== undefined && pointWorth > maxPoints) return false
      
      // Check if we should exclude materials (cards with used_in_fusion data)
      if (excludeMaterials) {
        const isMaterial = (card as any).used_in_fusion && Array.isArray((card as any).used_in_fusion) && (card as any).used_in_fusion.length > 0
        if (isMaterial) return false
      }
      
      // Check if we should exclude expired cards
      if (excludeExpired) {
        const now = new Date().getTime()
        const expireTime = new Date(card.buybackexpiresAt).getTime()
        const isExpired = expireTime <= now
        if (isExpired) return false
      }
      
      return true
    })
    
    if (cardsInRange.length === 0) {
      let excludeText = ''
      if (excludeMaterials && excludeExpired) {
        excludeText = ' (excluding materials and expired cards)'
      } else if (excludeMaterials) {
        excludeText = ' (excluding materials)'
      } else if (excludeExpired) {
        excludeText = ' (excluding expired cards)'
      }
      toast.error(`No cards found in the specified point range${excludeText}`)
      return
    }
    
    // Clear existing selection first
    selectedCards.forEach(cardId => {
      handleCardSelect(cardId) // This will remove each card from selection
    })
    setSelectedCardsData(new Map())
    
    // Select all cards in the range
    cardsInRange.forEach(card => {
      handleCardSelect(card.id) // Now all cards will be selected since selection is cleared
    })
    
    const rangeText = `${minPoints || '0'} - ${maxPoints || '∞'} points`
    let excludeText = ''
    if (excludeMaterials && excludeExpired) {
      excludeText = ' (excluding materials and expired cards)'
    } else if (excludeMaterials) {
      excludeText = ' (excluding materials)'
    } else if (excludeExpired) {
      excludeText = ' (excluding expired cards)'
    }
    toastSuccess(`Selected ${cardsInRange.length} cards in range: ${rangeText}${excludeText}`)
  }

  return (
    <div className="space-y-6 relative">
      <UserNavigation />

      {/* Overlay for new accounts to prevent interactions except guide button */}
      {isNewAccount && (
        <div 
          className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 pointer-events-auto"
          onClick={(e) => {
            // Only allow clicks on the guide button
            const target = e.target as HTMLElement;
            if (!target.closest('.guide-button')) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        />
      )}

      <div className="bg-[#1A1B2E] rounded-lg p-4 relative">
        {isNewAccount && (
          <div className="absolute inset-0 bg-transparent z-30 pointer-events-none" />
        )}
        {/* Desktop Layout */}
        <div className="hidden md:flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            {/* Select-all control removed */}
            <div className="relative bg-[#8868FF] rounded-full px-4 py-2 flex items-center gap-2">
              <img 
                src="/marketplace/serach.png" 
                alt="Search" 
                className="w-4 h-4"
              />
              <input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-white placeholder-white/70 focus:outline-none w-48"
              />
            </div>
            <CustomDropdown
              value={selectedCollectionId}
              onChange={setSelectedCollectionId}
              options={collections}
              placeholder="Select Collection"
              className="w-[160px]"
              disabled={loadingCollections}
            />

            {/* Sort dropdown - exact same style as collection dropdown */}
            <div className="relative sort-dropdown w-[160px]">
              <button 
                type="button"
                className="bg-[#1E1F35] text-white border border-gray-600 rounded px-2 py-1 text-sm flex items-center justify-between cursor-pointer hover:bg-[#2A2B3D] w-full"
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              >
                <span className="truncate">
                  Sort: {sortBy === 'card_name' ? 'Name' : 
                         sortBy === 'rarity' ? 'Rarity' : 
                         sortBy === 'point_worth' ? 'Points' :
                         sortBy === 'quantity' ? 'Quantity' :
                         sortBy === 'date_got' ? 'Date' : 'Name'} 
                  {sortOrder === 'asc' ? ' ↑' : ' ↓'}
                </span>
                <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {isSortDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1E1F35] border border-gray-600 rounded shadow-xl overflow-hidden max-h-60 overflow-y-auto w-full z-50">
                  {[
                    { value: 'point_worth', label: 'Point Worth' },
                    { value: 'quantity', label: 'Quantity' },
                    { value: 'date_got', label: 'Date Acquired' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`w-full text-left px-3 py-2 text-sm text-white hover:bg-[#8868FF]/20 transition-colors flex items-center justify-between ${
                        sortBy === option.value ? 'bg-[#8868FF]/30' : ''
                      }`}
                        onClick={() => {
                          if (sortBy === option.value) {
                            // Toggle sort order if same option
                            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                          } else {
                            // Set new sort option with default ascending order
                            setSortBy(option.value)
                            setSortOrder('asc')
                          }
                          setIsSortDropdownOpen(false)
                          // Reset to first page when sorting changes
                          if (currentPage !== 1) {
                            setCurrentPage(1)
                          }
                        }}
                      >
                        <span>{option.label}</span>
                        {sortBy === option.value && (
                          <span className="ml-2">
                            {sortOrder === 'asc' ? '↑' : '↓'}
                          </span>
                        )}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Refresh button (desktop) - after sort and before guide */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || loadingCollections || !selectedCollectionId}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                loading || loadingCollections || !selectedCollectionId
                  ? 'text-gray-400 border-gray-700 bg-[#1E1F35] cursor-not-allowed'
                  : 'text-white border-gray-600 bg-[#1E1F35] hover:bg-[#2A2B3D]'
              }`}
              aria-label="Refresh"
              title="Refresh"
            >
              <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4.93 4.93a10 10 0 0114.14 0l.01.01M19.07 19.07a10 10 0 01-14.14 0l-.01-.01" />
                <path d="M1 12h4M19 12h4M12 1v4M12 19v4" />
              </svg>
              <span>Refresh</span>
            </button>
            
            {/* Guide button - same style as marketplace with special styling for new accounts */}
            <div 
              className={`guide-button text-center cursor-pointer hover:opacity-80 transition-all bg-[#1E1F35] rounded-lg p-3 relative pointer-events-auto z-50 ${
                isNewAccount ? 'animate-pulse bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-size-200 animate-shimmer shadow-lg shadow-purple-500/50' : ''
              }`}
              onClick={() => setIsGuideModalOpen(true)}
            >
              {isNewAccount && (
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 rounded-lg blur opacity-75 animate-pulse"></div>
              )}
              <div className="text-white font-medium flex items-center justify-center relative z-10">
                <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
              </div>
              <div className={`text-xs relative z-10 ${
                isNewAccount ? 'text-white font-semibold' : 'text-gray-400'
              }`}>Guide</div>
            </div>
          </div>
          <div className="flex items-center space-x-6">
            {/* Price Range Selector */}
            <InventoryPriceRangeSelector
              onSelectRange={handleSelectByPriceRange}
              disabled={loading || cards.length === 0}
            />
            
            {(() => {
              const selectedCardData = Array.from(selectedCardsData.values())
              const hasLowValueCards = selectedCardData.some(card => 
                (card.point_worth || 0) < 200
              );
              const canWithdraw = selectedCards.length > 0 && !hasLowValueCards && !loading;
              const tooltipText = hasLowValueCards 
                ? "Can't withdraw cards below 200 points" 
                : selectedCards.length === 0 
                ? 'Please select cards to withdraw' 
                : '';
              
              return (
                <div className="relative group">
                  <button 
                    onClick={() => {
                      if (canWithdraw) {
                        handleWithdraw()
                      } else if (hasLowValueCards) {
                        toast.error("Can't withdraw cards below 200 points")
                      } else if (selectedCards.length === 0) {
                        toast.error('Please select cards to withdraw')
                      }
                    }}
                    disabled={!canWithdraw}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                      canWithdraw
                        ? 'bg-[#8868FF] hover:bg-[#7759EE] text-white cursor-pointer' 
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <img src="/users/card-icon.png" alt="Withdraw" className="w-4 h-4" />
                    <span className="text-sm">
                      {selectedCards.length > 0 
                        ? `Withdraw (${selectedCards.length})` 
                        : 'Withdraw'
                      }
                    </span>
                  </button>
                  {!canWithdraw && tooltipText && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                      {tooltipText}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  )}
                </div>
              );
            })()}
            {(() => {
              const selectedCardData = Array.from(selectedCardsData.values())
              const hasExpiredCards = selectedCardData.some(card => 
                new Date(card.buybackexpiresAt).getTime() <= new Date().getTime()
              );
              
              return (
                <button 
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                    selectedCards.length > 0 && !hasExpiredCards
                      ? 'bg-[#8868FF] hover:bg-[#7759EE] text-white cursor-pointer' 
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleRedeemPoints}
                  disabled={selectedCards.length === 0 || loading || hasExpiredCards}
                  title={hasExpiredCards ? 'Expired cards cannot be redeemed for points' : ''}
                >
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-sm">
                    {selectedCards.length > 0 
                      ? `Redeem (${selectedCards.length})` 
                      : 'Redeem'
                    }
                  </span>
                </button>
              );
            })()}
            <div className="flex items-center space-x-2">
              <img src="/users/coin.png" alt="Coin" className="w-5 h-5" />
              <span className="text-yellow-400 text-sm font-medium">
                {userInfo?.pointsBalance?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="md:hidden space-y-4 mb-6">
          {/* Top Row: Points + Guide Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <img src="/users/coin.png" alt="Coin" className="w-5 h-5" />
              <span className="text-yellow-400 text-sm font-medium">
                {userInfo?.pointsBalance?.toFixed(2) || '0.00'}
              </span>
            </div>
            
            {/* Small Guide button for mobile */}
            <div 
              className={`guide-button text-center cursor-pointer hover:opacity-80 transition-all bg-[#1E1F35] rounded-lg p-2 relative pointer-events-auto z-50 ${
                isNewAccount ? 'animate-pulse bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-size-200 animate-shimmer shadow-lg shadow-purple-500/50' : ''
              }`}
              onClick={() => setIsGuideModalOpen(true)}
            >
              {isNewAccount && (
                <div className="absolute -inset-0.5 bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 rounded-lg blur opacity-75 animate-pulse"></div>
              )}
              <div className="text-white font-medium flex items-center justify-center relative z-10">
                <Image src="/marketplace/operation.png" alt="operation" width={14} height={14} />
              </div>
              <div className={`text-xs relative z-10 ${
                isNewAccount ? 'text-white font-semibold' : 'text-gray-400'
              }`}>Guide</div>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative bg-[#8868FF] rounded-full px-4 py-2 flex items-center gap-2">
            <img 
              src="/marketplace/serach.png" 
              alt="Search" 
              className="w-4 h-4"
            />
            <input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent text-white placeholder-white/70 focus:outline-none flex-1"
            />
          </div>

          {/* Filter Row */}
          <div className="flex space-x-2">
            {/* Collection Selector */}
            <CustomDropdown
              value={selectedCollectionId}
              onChange={setSelectedCollectionId}
              options={collections}
              placeholder="Collection"
              className="flex-1"
              disabled={loadingCollections}
            />
            
            {/* Sort dropdown - exact same style as collection dropdown for mobile */}
            <div className="relative sort-dropdown flex-1">
              <button 
                type="button"
                className="bg-[#1E1F35] text-white border border-gray-600 rounded px-2 py-1 text-sm flex items-center justify-between cursor-pointer hover:bg-[#2A2B3D] w-full"
                onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)}
              >
                <span className="truncate">
                  Sort: {sortBy === 'card_name' ? 'Name' : 
                         sortBy === 'rarity' ? 'Rarity' : 
                         sortBy === 'point_worth' ? 'Points' :
                         sortBy === 'quantity' ? 'Quantity' :
                         sortBy === 'date_got' ? 'Date' : 'Name'} 
                  {sortOrder === 'asc' ? ' ↑' : ' ↓'}
                </span>
                <svg className="w-4 h-4 ml-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {isSortDropdownOpen && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-[#1E1F35] border border-gray-600 rounded shadow-xl overflow-hidden max-h-60 overflow-y-auto w-full z-50">
                  {[
                    { value: 'point_worth', label: 'Point Worth' },
                    { value: 'quantity', label: 'Quantity' },
                    { value: 'date_got', label: 'Date Acquired' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      className={`w-full text-left px-3 py-2 text-sm text-white hover:bg-[#8868FF]/20 transition-colors flex items-center justify-between ${
                        sortBy === option.value ? 'bg-[#8868FF]/30' : ''
                      }`}
                      onClick={() => {
                        if (sortBy === option.value) {
                          // Toggle sort order if same option
                          setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
                        } else {
                          // Set new sort option with default ascending order
                          setSortBy(option.value)
                          setSortOrder('asc')
                        }
                        setIsSortDropdownOpen(false)
                        // Reset to first page when sorting changes
                        if (currentPage !== 1) {
                          setCurrentPage(1)
                        }
                      }}
                    >
                      <span>{option.label}</span>
                      {sortBy === option.value && (
                        <span className="ml-2">
                          {sortOrder === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Smaller Refresh button (mobile) */}
            <button
              type="button"
              onClick={handleRefresh}
              disabled={loading || loadingCollections || !selectedCollectionId}
              className={`px-2 py-1.5 rounded-md text-[10px] border transition-colors self-stretch ${
                loading || loadingCollections || !selectedCollectionId
                  ? 'text-gray-400 border-gray-700 bg-[#1E1F35] cursor-not-allowed'
                  : 'text-white border-gray-600 bg-[#1E1F35] hover:bg-[#2A2B3D]'
              }`}
              aria-label="Refresh"
              title="Refresh"
            >
              <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4.93 4.93a10 10 0 0114.14 0l.01.01M19.07 19.07a10 10 0 01-14.14 0l-.01-.01" />
                <path d="M1 12h4M19 12h4M12 1v4M12 19v4" />
              </svg>
              <span className="ml-1">Refresh</span>
            </button>
          </div>


          {/* Price Range Selector Row (Mobile) */}
          <div className="flex justify-center">
            <InventoryPriceRangeSelector
              onSelectRange={handleSelectByPriceRange}
              disabled={loading || cards.length === 0}
              className="w-full max-w-xs"
            />
          </div>

          {/* Action Buttons Row */}
          <div className="flex space-x-2">
            {(() => {
              const selectedCardData = Array.from(selectedCardsData.values())
              const hasLowValueCards = selectedCardData.some(card => 
                (card.point_worth || 0) < 200
              );
              const canWithdraw = selectedCards.length > 0 && !hasLowValueCards && !loading;
              const tooltipText = hasLowValueCards 
                ? "Can't withdraw cards below 200 points" 
                : selectedCards.length === 0 
                ? 'Please select cards to withdraw' 
                : '';
              
              return (
                <div className="relative group flex-1">
                  <button 
                    onClick={() => {
                      if (canWithdraw) {
                        handleWithdraw()
                      } else if (hasLowValueCards) {
                        toast.error("Can't withdraw cards below 200 points")
                      } else if (selectedCards.length === 0) {
                        toast.error('Please select cards to withdraw')
                      }
                    }}
                    disabled={!canWithdraw}
                    className={`w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                      canWithdraw
                        ? 'bg-[#8868FF] hover:bg-[#7759EE] text-white cursor-pointer' 
                        : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    <img src="/users/card-icon.png" alt="Withdraw" className="w-4 h-4" />
                    <span className="text-xs">
                      {selectedCards.length > 0 
                        ? `Withdraw (${selectedCards.length})` 
                        : 'Withdraw'
                      }
                    </span>
                  </button>
                  {!canWithdraw && tooltipText && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap pointer-events-none z-50">
                      {tooltipText}
                      <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                    </div>
                  )}
                </div>
              );
            })()}
            {(() => {
              const selectedCardData = Array.from(selectedCardsData.values())
              const hasExpiredCards = selectedCardData.some(card => 
                new Date(card.buybackexpiresAt).getTime() <= new Date().getTime()
              );
              
              return (
                <button 
                  className={`flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg transition-colors ${
                    selectedCards.length > 0 && !hasExpiredCards
                      ? 'bg-[#8868FF] hover:bg-[#7759EE] text-white cursor-pointer' 
                      : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  }`}
                  onClick={handleRedeemPoints}
                  disabled={selectedCards.length === 0 || loading || hasExpiredCards}
                  title={hasExpiredCards ? 'Expired cards cannot be redeemed for points' : ''}
                >
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span className="text-xs">
                    {selectedCards.length > 0 
                      ? `Redeem (${selectedCards.length})` 
                      : 'Redeem'
                    }
                  </span>
                </button>
              );
            })()}
          </div>
        </div>

        {!loadingCollections && (
          <div className="mb-4">
            <h2 className="text-white text-lg font-medium">
              Collection: {selectedCollectionId ? 
                capitalizeFirst(collections.find(c => c.id === selectedCollectionId)?.name) || 'Unknown' : 
                'No Collection Selected'
              }
            </h2>
          </div>
        )}

        {loading && (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <span className="ml-2 text-white">Loading cards...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <p className="text-red-400 mb-4">{error}</p>
            <button 
              onClick={fetchUserCards}
              className="bg-[#8868FF] hover:bg-[#7759EE] text-white px-4 py-2 rounded-lg transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && cards.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">No cards found</p>
            <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
          </div>
        )}

        {!loading && !error && cards.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
            {cards.map((card, index) => {
              const getTimeRemaining = (buybackExpiresAt: string) => {
                const now = new Date().getTime()
                const expireTime = new Date(buybackExpiresAt).getTime()
                const diff = expireTime - now
                
                if (diff <= 0) return 'Expired'
                
                const days = Math.floor(diff / (1000 * 60 * 60 * 24))
                const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
                
                if (days > 0) return `${days}d ${hours}h`
                return `${hours}h`
              }
              
              const isExpired = (buybackExpiresAt: string) => {
                const now = new Date().getTime()
                const expireTime = new Date(buybackExpiresAt).getTime()
                return expireTime <= now
              }
              
              const expired = isExpired(card.buybackexpiresAt)
              const canWithdraw = (card.point_worth || 0) >= 200
              
              return (
                <motion.div
                  key={card.id}
                  className={`relative overflow-hidden cursor-pointer transition-all duration-200 hover:scale-105 ${
                    selectedCards.includes(card.id) ? 'ring-2 ring-blue-500' : ''
                  }`}
                  style={{
                    background: 'linear-gradient(-3deg, rgba(136,104,255,0.2), rgba(136,104,255,0.1))',
                    borderRadius: '12px'
                  }}
                  onClick={(e) => handleCardClick(card, e)}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <div className="text-[10px] px-1 py-1.5 text-center whitespace-nowrap overflow-hidden">
                    <span style={{color: '#8B84BA'}}>Expires in: </span>
                    <span className={expired ? "text-red-400" : "text-white"}>{getTimeRemaining(card.buybackexpiresAt)}</span>
                  </div>
                
                  <div className="aspect-[3/4] bg-gradient-to-br from-blue-900 to-purple-900 relative">
                    <div className="absolute top-1 left-1 z-10 card-select-area p-1" onClick={(e) => e.stopPropagation()}>
                      {selectedCards.includes(card.id) ? (
                        <div 
                          className="w-6 h-6 md:w-5 md:h-5 rounded-full flex items-center justify-center shadow-lg bg-blue-500 cursor-pointer"
                          onClick={() => handleCardSelect(card.id)}
                        >
                          <svg className="w-4 h-4 md:w-3 md:h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      ) : (
                        <div 
                          className="w-6 h-6 md:w-5 md:h-5 border-2 rounded-full shadow-lg transition-colors border-white/80 bg-gray-800/60 cursor-pointer hover:bg-gray-700/80"
                          onClick={() => handleCardSelect(card.id)}
                        />
                      )}
                    </div>
                    
                    <Image
                      src={(() => {
                        // Only load actual image if card is within visible range
                        if (index >= visibleRange.end) {
                          return '/cards/common1.jpg.svg' // Placeholder for cards not yet visible
                        }
                        
                        if (!card.image_url || 
                            card.image_url === 'null' || 
                            card.image_url === 'undefined') {
                          return '/cards/common1.jpg.svg'
                        }
                        
                        const trimmedUrl = card.image_url.trim()
                        
                        if (trimmedUrl === '') {
                          return '/cards/common1.jpg.svg'
                        }
                        
                        try {
                          // Optimize the image if it's not a placeholder
                          if (trimmedUrl !== '/cards/common1.jpg.svg') {
                            return optimizeImage(trimmedUrl, { width: 300, height: 400, quality: 85 })
                          }
                          return trimmedUrl
                        } catch {
                          console.log('---进入到这里了')
                          if (trimmedUrl.startsWith('/') || trimmedUrl.startsWith('./')) {
                            return trimmedUrl
                          }
                          return '/cards/common1.jpg.svg'
                        }
                      })()}
                      alt={card.card_name}
                      fill
                      className="object-cover"
                      loading={index < 40 ? "eager" : "lazy"} // First 40 images load immediately
                      onError={(e) => {
                        console.log(e)
                        const target = e.target as HTMLImageElement
                        target.src = '/cards/common1.jpg.svg'
                      }}
                    />
                    {/* Fusion/Material Badge */}
                    <FusionBadge 
                      fusionInfo={(card as any)?.used_in_fusion}
                      className="absolute top-1 right-1"
                      size="small"
                      showTooltip={false}
                    />
                  </div>
                  
                  <div className="p-2">
                    <h3 className="text-white text-[11px] font-medium truncate" title={card.card_name}>
                      {card.card_name}
                    </h3>
                    
                    <div className="flex items-center justify-between mt-1 mb-1.5">
                      <div className="flex items-center gap-0.5">
                        <img src="/users/coin.png" alt="Coin" className="w-3 h-3" />
                        <span className="text-yellow-400 text-[10px] font-medium">
                          {card.point_worth?.toFixed(2) || '0.00'}
                        </span>
                      </div>
                      
                      <div className="flex items-center">
                        <span className="text-gray-300 text-[10px]">x{card.quantity}</span>
                      </div>
                    </div>
                    
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}

        {/* Infinite Scroll Trigger */}
        {!loading && currentPage < totalPages && (
          <div ref={loadMoreRef} className="flex justify-center py-8">
            {loadingMore && (
              <div className="flex flex-col items-center gap-2">
                <svg className="animate-spin h-8 w-8 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-gray-400 text-sm">Loading more cards...</span>
              </div>
            )}
          </div>
        )}
      </div>
      
      <SellCardModal
        card={selectedCardForSell}
        collectionId={selectedCollectionId}
        isOpen={showSellModal}
        onClose={() => {
          setShowSellModal(false)
          setSelectedCardForSell(null)
        }}
        onSell={handleSell}
      />
      
      <DestroyCardsModal
        isOpen={showDestroyModal}
        onClose={() => setShowDestroyModal(false)}
        cards={Array.from(selectedCardsData.values())}
        onConfirm={handleConfirmDestroy}
      />
      
      <WithdrawCardsModal
        isOpen={showWithdrawModal}
        onClose={() => setShowWithdrawModal(false)}
        cards={Array.from(selectedCardsData.values())}
        onConfirm={handleConfirmWithdraw}
      />
      
      <ConfirmWithdrawModal
        isOpen={showConfirmWithdrawModal}
        onClose={() => setShowConfirmWithdrawModal(false)}
        cardsToWithdraw={pendingWithdrawCards}
        cards={Array.from(selectedCardsData.values())}
        onConfirm={handleFinalWithdrawConfirm}
      />
      
      <InventoryGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
      
      <InventoryCardDetailModal
        card={selectedCardForDetail}
        isOpen={showDetailModal}
        onClose={() => {
          setShowDetailModal(false)
          setSelectedCardForDetail(null)
        }}
        onSell={handleSellFromDetail}
        onRedeem={handleRedeemFromDetail}
        onFusionComplete={() => fetchUserCards(false)}
      />
    </div>
  )
}




