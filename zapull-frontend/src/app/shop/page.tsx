'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { OfficialCard, OfficialListingsResponse } from '@/lib/marketplaceApi'
import marketplaceApi from '@/lib/marketplaceApi'
import CardDetailModal from '@/components/CardDetailModal'
import MarketplaceGuideModal from '@/components/MarketplaceGuideModal'
import CheckoutModal from '@/components/CheckoutModal'
import { useAuthStore } from '@/store/authStore'
import CustomDropdown from '@/components/CustomDropdown'
import ImprovedSortDropdown from '@/components/ImprovedSortDropdown'
import PriceRangeFilter from '@/components/PriceRangeFilter'
import ActiveFilters from '@/components/ActiveFilters'
import { Card } from '@/lib/packsApi'
import { getAuthHeaders } from '@/lib/authUtils'
import toast from 'react-hot-toast'

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

interface CollectionItem {
  id: string
  name: string
}

export default function ShopPage() {
  const { uid, openLoginModal } = useAuthStore()
  const userId = uid || ''
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortValue, setSortValue] = useState('createdAt_desc') // Combined sort value
  const [cards, setCards] = useState<OfficialCard[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [perPage] = useState(20)
  const [collections, setCollections] = useState<CollectionItem[]>([])
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<OfficialCard | null>(null)
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
  const [minPriceCash, setMinPriceCash] = useState<number | undefined>(undefined)
  const [maxPriceCash, setMaxPriceCash] = useState<number | undefined>(undefined)
  
  // Multi-select state (always enabled)
  const [selectedCards, setSelectedCards] = useState<Map<string, { card: OfficialCard; quantity: number }>>(new Map())
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  
  // Track scroll position and clicked element to restore after modal close
  const lastScrollRef = useRef<number | null>(null)
  const lastClickedElRef = useRef<HTMLElement | null>(null)
  
  // Parse sort value to get sortBy and sortOrder
  const [sortBy, sortOrder] = sortValue.split('_') as [string, 'asc' | 'desc']

  // Fetch shop data
  const fetchShopData = useCallback(async () => {
    console.debug('[Shop] fetchShopData invoked', { selectedCategory, sortBy, sortOrder, searchQuery, currentPage, minPriceCash, maxPriceCash })
    setLoading(true)
    try {
      // Fetch official marketplace data
      const params: any = {
        collection_id: selectedCategory || undefined,
        page: currentPage,
        per_page: perPage,
        sort_by: 'priceCash' as const,
        sort_order: sortOrder,
        search_query: searchQuery || undefined
      }
      
      const response: OfficialListingsResponse = await marketplaceApi.getOfficialListings(params)
      setCards(response.cards)
      setTotalPages(response.pagination.total_pages)
      setTotalItems(response.pagination.total_items)
    } catch (error) {
      console.error('Failed to fetch shop data:', error)
      // If API call fails, use mock data
      const mockCards: OfficialCard[] = Array.from({ length: 15 }, (_, i) => ({
        id: `official-card-${i}`,
        card_name: '2024 Official Trading Card Collection #' + (i + 1),
        card_reference: `${selectedCategory || 'pokemon'}/official-card-${i}`,
        image_url: '/cards/common1.jpg.svg',
        pricePoints: 100 + (i * 50),
        priceCash: (100 + (i * 50)) / 100,
        collection_id: selectedCategory || 'pokemon',
        quantity: 10 + (i * 5),
        condition: 'near_mint',
        date_got_in_stock: new Date().toISOString(),
        rarity: 1
      }))
      setCards(mockCards)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, sortBy, sortOrder, searchQuery, currentPage, perPage, minPriceCash, maxPriceCash])

  // Set hardcoded collections
  const fetchCollections = () => {
    // Use hardcoded collections (excluding 'official')
    const hardcodedCollections = [
      { id: 'pokemon', name: 'pokemon' },
      { id: 'one_piece', name: 'one_piece' },
      { id: 'magic', name: 'magic' }
    ]
    setCollections(hardcodedCollections)
    
    // If no category is selected, default to Pokemon
    if (!selectedCategory && hardcodedCollections.length > 0) {
      setSelectedCategory('pokemon')
    }
  }

  // Use useEffect to fetch data
  useEffect(() => {
    fetchCollections()
  }, [])

  // Only fetch shop data after collections are loaded and category is set
  useEffect(() => {
    if (collections.length > 0 && selectedCategory) {
      fetchShopData()
    }
  }, [fetchShopData, collections.length, selectedCategory])

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId)
    setCurrentPage(1) // Reset to first page
  }

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1) // Reset to first page
  }

  // Handle card selection for multi-select
  const handleCardSelect = (card: OfficialCard, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedCards(prev => {
      const newMap = new Map(prev)
      if (newMap.has(card.id)) {
        newMap.delete(card.id)
      } else {
        newMap.set(card.id, { card, quantity: 1 })
      }
      return newMap
    })
  }

  // Handle quantity change for selected card
  const handleQuantityChange = (cardId: string, quantity: number) => {
    setSelectedCards(prev => {
      const newMap = new Map(prev)
      const item = newMap.get(cardId)
      if (item && quantity > 0 && quantity <= item.card.quantity) {
        newMap.set(cardId, { ...item, quantity })
      }
      return newMap
    })
  }

  // Handle card click event - Always handle selection, no modal
  const handleCardClick = (card: OfficialCard, el?: HTMLElement) => {
    // Always handle selection in shop
    return
    
    // Old modal code (kept for reference but not used)
    // Record current scroll and clicked element for restoration on close
    if (typeof window !== 'undefined') {
      lastScrollRef.current = window.scrollY
    }
    if (el) {
      lastClickedElRef.current = el
    } else {
      lastClickedElRef.current = null
    }
    
    // Convert official card to Card format for modal
    const cardData: Card = {
      id: card.id,
      name: card.card_name || 'Unknown Card',
      image_url: card.image_url || '/cards/common1.jpg.svg',
      rarity: 3, // Default rarity
      point_worth: card.pricePoints || 0,
      cash_worth: 0,
      collection_id: card.collection_id || selectedCategory || 'unknown'
    }
    
    setSelectedCard(cardData)
    setSelectedListing(card)
    setIsModalOpen(true)
  }

  // Calculate total price
  const calculateTotal = () => {
    let total = 0
    selectedCards.forEach(item => {
      total += item.card.priceCash * item.quantity
    })
    return total
  }

  // Open checkout modal
  const handleCheckoutClick = () => {
    // Check if user is logged in first
    if (!uid) {
      toast('Please sign in to checkout', { icon: 'ℹ️', duration: 3000 })
      openLoginModal()
      return
    }

    if (selectedCards.size === 0) return
    setIsCheckoutModalOpen(true)
  }

  // Handle successful checkout
  const handleCheckoutSuccess = () => {
    setSelectedCards(new Map())
    fetchShopData()
  }

  // Handle purchase event
  const handlePurchase = (type: 'cash' | 'points', card: Card) => {
    console.log(`Purchase type: ${type}, Card:`, card)
    // Purchase logic is already implemented in CardDetailModal
    // Additional post-purchase logic can be added here, such as refreshing data
    fetchShopData()
  }

  return (
    <div className="min-h-screen bg-[#2A2B47]">
      {/* 移动端布局 */}
      <div className="sm:hidden">
        <div className="p-4 pt-8">
          {/* 移动端标题 */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white text-center">Official Shop</h1>
            <p className="text-gray-400 text-center text-sm mt-2">Purchase official cards with cash</p>
          </div>

          {/* 移动端工具栏 - 垂直布局 */}
          <div className="space-y-3 mb-4">
            {/* 搜索框 */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="bg-[#1E1F35] text-white border border-gray-600 rounded-lg pl-10 pr-4 py-2 w-full focus:outline-none focus:border-purple-500"
              />
              <Image 
                src="/marketplace/serach.png" 
                alt="search" 
                width={16} 
                height={16} 
                className="absolute left-3 top-1/2 transform -translate-y-1/2"
              />
            </div>

            {/* Collection dropdown */}
            <CustomDropdown
              value={selectedCategory}
              onChange={handleCategorySelect}
              options={collections}
              placeholder="Select Collection"
              className="w-full"
            />

            {/* 排序选项 */}
            <ImprovedSortDropdown
              value={sortValue}
              onChange={(value) => {
                setSortValue(value)
                setCurrentPage(1)
              }}
              options={[
                { id: 'recent', label: 'Recently Added', value: 'createdAt', order: 'desc', icon: '🕐' },
                { id: 'cash_low', label: 'Price: Low to High', value: 'priceCash', order: 'asc', icon: '💵' },
                { id: 'cash_high', label: 'Price: High to Low', value: 'priceCash', order: 'desc', icon: '💵' },
              ]}
              className="w-full"
            />

            {/* 价格过滤 */}
            <PriceRangeFilter
              type="cash"
              minValue={minPriceCash}
              maxValue={maxPriceCash}
              onMinChange={(value) => {
                setMinPriceCash(value)
                setCurrentPage(1)
              }}
              onMaxChange={(value) => {
                setMaxPriceCash(value)
                setCurrentPage(1)
              }}
              className="w-full"
            />

            {/* 操作按钮 + 刷新 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setSelectedCards(new Map())
                  fetchShopData()
                }}
                disabled={loading}
                className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all
                  ${loading
                    ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow hover:shadow-md hover:scale-[1.02] active:scale-[0.99]'}
                  border border-purple-500/50`}
                aria-label="Refresh listings"
                title={loading ? 'Refreshing…' : 'Refresh listings'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}>
                  <path fillRule="evenodd" d="M3.172 7.172a8 8 0 111.414 1.414L3 6v4h4L5.636 8.636A6 6 0 1010 4v2a.75.75 0 01-1.28.53L6.53 4.34a.75.75 0 010-1.06L8.72 1.09A.75.75 0 0110 1.62V4a8 8 0 00-6.828 3.172z" clipRule="evenodd" />
                </svg>
                <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
              </button>
              <div className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg p-3" onClick={() => setIsGuideModalOpen(true)}>
                <div className="text-white font-medium flex items-center justify-center">
                  <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
                </div>
                <div className="text-gray-400 text-xs">Operation</div>
              </div>
            </div>
          </div>

          {/* Active Filters Display */}
          <ActiveFilters
            filters={[
              ...(selectedCategory && selectedCategory !== 'pokemon' ? [{
                key: 'collection',
                label: 'Collection',
                value: collections.find(c => c.id === selectedCategory)?.name || selectedCategory,
                onClear: () => {
                  setSelectedCategory('pokemon')
                  setCurrentPage(1)
                }
              }] : []),
              ...(searchQuery ? [{
                key: 'search',
                label: 'Search',
                value: searchQuery,
                onClear: () => {
                  setSearchQuery('')
                  setCurrentPage(1)
                }
              }] : []),
              ...(minPriceCash !== undefined || maxPriceCash !== undefined ? [{
                key: 'price_cash',
                label: 'Price',
                value: `$${minPriceCash || '0'} - $${maxPriceCash || '∞'}`,
                onClear: () => {
                  setMinPriceCash(undefined)
                  setMaxPriceCash(undefined)
                  setCurrentPage(1)
                }
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedCategory('pokemon')
              setSearchQuery('')
              setMinPriceCash(undefined)
              setMaxPriceCash(undefined)
              setCurrentPage(1)
            }}
            resultCount={totalItems}
            className="mb-4"
          />

          {/* 移动端加载状态 */}
          {loading && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-500"></div>
              <span className="ml-2 text-gray-400 text-sm">Loading...</span>
            </div>
          )}

          {/* 移动端卡片网格 - 2列布局 */}
          {!loading && (
            <div className="grid grid-cols-2 gap-3">
              {cards.map((card, index) => {
                const cardName = card.card_name || 'Unknown Card'
                const cardImage = card.image_url || '/cards/common1.jpg.svg'
                const cardCash = card.priceCash || 0
                const isSelected = selectedCards.has(card.id)
                
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={(e) => handleCardSelect(card, e)}
                    tabIndex={-1}
                    className={`bg-[#1E1F35] rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer group border-2 ${
                      isSelected ? 'border-green-500 shadow-green-500/50' : 'border-gray-700/50 hover:border-purple-500/50'
                    }`}
                  >
                    <div className="flex items-center justify-between px-2 py-1 bg-[#252641]">
                      <Image 
                        src="/marketplace/head.png" 
                        alt="head" 
                        width={16} 
                        height={16} 
                      />
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                    </div>
                    
                    <div
                      className="aspect-[3/4] relative rounded-md p-2"
                      style={{
                        background:
                          'linear-gradient(135deg, rgba(42,43,71,0.95) 0%, rgba(30,31,53,0.95) 100%), \
radial-gradient(2px 2px at 20% 25%, rgba(255,255,255,0.12) 50%, transparent 51%), \
radial-gradient(1.5px 1.5px at 70% 35%, rgba(255,255,255,0.10) 50%, transparent 51%), \
radial-gradient(1.5px 1.5px at 40% 80%, rgba(255,255,255,0.10) 50%, transparent 51%), \
radial-gradient(2px 2px at 85% 60%, rgba(255,255,255,0.12) 50%, transparent 51%), \
radial-gradient(1px 1px at 15% 70%, rgba(255,255,255,0.08) 50%, transparent 51%)'
                      }}
                    >
                      <Image
                        src={optimizeImage(cardImage, { width: 300, height: 400, quality: 85 })}
                        alt={cardName}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                        className="object-contain"
                      />
                    </div>
                    
                    <div className="p-2">
                      <h3 className="text-white text-xs font-medium line-clamp-2 mb-1 h-8">
                        {cardName}
                      </h3>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1">
                          <span className="text-green-400 font-bold text-xs">
                            ${cardCash.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="text-gray-400 text-xs mt-1">
                        Stock: {card.quantity}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* 移动端分页 */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-center mt-6 space-x-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-3 py-2 bg-[#1E1F35] text-white border border-gray-600 rounded text-sm hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                ←
              </button>
              
              <span className="text-gray-400 px-2 text-sm">
                {currentPage}/{totalPages}
              </span>
              
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-2 bg-[#1E1F35] text-white border border-gray-600 rounded text-sm hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                →
              </button>
            </div>
          )}
          
          {/* Floating Checkout Bar - Mobile */}
          {selectedCards.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-[#1E1F35] border-t-2 border-green-500 p-4 shadow-lg z-50">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-white font-bold text-sm">{selectedCards.size} item{selectedCards.size > 1 ? 's' : ''} selected</div>
                  <div className="text-green-400 font-bold text-lg">${calculateTotal().toFixed(2)}</div>
                </div>
                <button
                  onClick={handleCheckoutClick}
                  className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition-all"
                >
                  Checkout
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 桌面端布局 */}
      <div className="hidden sm:block">
        <div className="w-full">
          <div className="p-4 lg:p-6">
            {/* 桌面端标题 */}
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold text-white">Official Shop</h1>
              <p className="text-gray-400 mt-2">Purchase official cards with cash</p>
            </div>

            {/* Toolbar - single line layout */}
            <div className="flex items-center justify-between mb-6 flex-wrap xl:flex-nowrap gap-4">
              {/* Sort */}
              <ImprovedSortDropdown
                value={sortValue}
                onChange={(value) => {
                  setSortValue(value)
                  setCurrentPage(1)
                }}
                options={[
                  { id: 'recent', label: 'Recently Added', value: 'createdAt', order: 'desc', icon: '🕐' },
                  { id: 'cash_low', label: 'Price: Low to High', value: 'priceCash', order: 'asc', icon: '💵' },
                  { id: 'cash_high', label: 'Price: High to Low', value: 'priceCash', order: 'desc', icon: '💵' },
                ]}
              />

              {/* Collection dropdown */}
              <CustomDropdown
                value={selectedCategory}
                onChange={handleCategorySelect}
                options={collections}
                placeholder="Select Collection"
              />

              {/* Price filter */}
              <PriceRangeFilter
                type="cash"
                minValue={minPriceCash}
                maxValue={maxPriceCash}
                onMinChange={(value) => {
                  setMinPriceCash(value)
                  setCurrentPage(1)
                }}
                onMaxChange={(value) => {
                  setMaxPriceCash(value)
                  setCurrentPage(1)
                }}
              />

              {/* Search box */}
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  className="bg-[#1E1F35] text-white border border-gray-600 rounded-lg pl-10 pr-4 py-1.5 w-48 focus:outline-none focus:border-purple-500"
                />
                <Image 
                  src="/marketplace/serach.png" 
                  alt="search" 
                  width={16} 
                  height={16} 
                  className="absolute left-3 top-1/2 transform -translate-y-1/2"
                />
              </div>
              
              {/* Operation + Refresh */}
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    setSelectedCards(new Map())
                    fetchShopData()
                  }}
                  disabled={loading}
                  className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all
                    ${loading
                      ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow hover:shadow-md hover:scale-[1.02] active:scale-[0.99]'}
                    border border-purple-500/50`}
                  aria-label="Refresh listings"
                  title={loading ? 'Refreshing…' : 'Refresh listings'}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`}>
                    <path fillRule="evenodd" d="M3.172 7.172a8 8 0 111.414 1.414L3 6v4h4L5.636 8.636A6 6 0 1010 4v2a.75.75 0 01-1.28.53L6.53 4.34a.75.75 0 010-1.06L8.72 1.09A.75.75 0 0110 1.62V4a8 8 0 00-6.828 3.172z" clipRule="evenodd" />
                  </svg>
                  <span>{loading ? 'Refreshing…' : 'Refresh'}</span>
                </button>
                <div className="text-center cursor-pointer hover:opacity-80 transition-opacity" onClick={() => setIsGuideModalOpen(true)}>
                  <div className="text-white font-medium flex items-center justify-center">
                    <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
                  </div>
                  <div className="text-gray-400 text-xs">Operation</div>
                </div>
              </div>
            </div>

            {/* Active Filters Display */}
            <ActiveFilters
              filters={[
                ...(selectedCategory && selectedCategory !== 'pokemon' ? [{
                  key: 'collection',
                  label: 'Collection',
                  value: collections.find(c => c.id === selectedCategory)?.name || selectedCategory,
                  onClear: () => {
                    setSelectedCategory('pokemon')
                    setCurrentPage(1)
                  }
                }] : []),
                ...(searchQuery ? [{
                  key: 'search',
                  label: 'Search',
                  value: searchQuery,
                  onClear: () => {
                    setSearchQuery('')
                    setCurrentPage(1)
                  }
                }] : []),
                ...(minPriceCash !== undefined || maxPriceCash !== undefined ? [{
                  key: 'price_cash',
                  label: 'Price',
                  value: `$${minPriceCash || '0'} - $${maxPriceCash || '∞'}`,
                  onClear: () => {
                    setMinPriceCash(undefined)
                    setMaxPriceCash(undefined)
                    setCurrentPage(1)
                  }
                }] : [])
              ]}
              onClearAll={() => {
                setSelectedCategory('pokemon')
                setSearchQuery('')
                setMinPriceCash(undefined)
                setMaxPriceCash(undefined)
                setCurrentPage(1)
              }}
              resultCount={totalItems}
              className="mb-6"
            />

            {/* Loading state */}
            {loading && (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                <span className="ml-2 text-gray-400">Loading...</span>
              </div>
            )}

            {/* Card grid */}
            {!loading && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
                {cards.map((card, index) => {
                  const cardName = card.card_name || 'Unknown Card'
                  const cardImage = card.image_url || '/cards/common1.jpg.svg'
                  const cardCash = card.priceCash || 0
                  const isSelected = selectedCards.has(card.id)
                  
                  return (
                    <motion.div
                      key={card.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      onClick={(e) => handleCardSelect(card, e)}
                      tabIndex={-1}
                      className={`bg-[#1E1F35] rounded-lg overflow-hidden hover:shadow-lg transition-all cursor-pointer group border-2 ${
                        isSelected ? 'border-green-500 shadow-green-500/50' : 'border-gray-700/50 hover:border-purple-500/50'
                      }`}
                    >
                      {/* Card header - avatar icon */}
                      <div className="flex items-center justify-between px-3 py-2 bg-[#252641]">
                        <Image 
                          src="/marketplace/head.png" 
                          alt="head" 
                          width={24} 
                          height={24} 
                        />
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                          isSelected ? 'bg-green-500 border-green-500' : 'bg-gray-700 border-gray-500'
                        }`}>
                          {isSelected && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                      </div>
                      
                      <div
                        className="aspect-[3/4] relative rounded-md p-2"
                        style={{
                          background:
                            'linear-gradient(135deg, rgba(42,43,71,0.95) 0%, rgba(30,31,53,0.95) 100%), \
radial-gradient(2px 2px at 20% 25%, rgba(255,255,255,0.12) 50%, transparent 51%), \
radial-gradient(1.5px 1.5px at 70% 35%, rgba(255,255,255,0.10) 50%, transparent 51%), \
radial-gradient(1.5px 1.5px at 40% 80%, rgba(255,255,255,0.10) 50%, transparent 51%), \
radial-gradient(2px 2px at 85% 60%, rgba(255,255,255,0.12) 50%, transparent 51%), \
radial-gradient(1px 1px at 15% 70%, rgba(255,255,255,0.08) 50%, transparent 51%)'
                        }}
                      >
                        <Image
                          src={optimizeImage(cardImage, { width: 300, height: 400, quality: 85 })}
                          alt={cardName}
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, (max-width: 1280px) 20vw, 16vw"
                          className="object-contain"
                        />
                      </div>
                      
                      <div className="p-3">
                        <h3 className="text-white text-sm font-medium line-clamp-2 mb-2 h-10">
                          {cardName}
                        </h3>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center space-x-1">
                            <span className="text-green-400 font-bold text-sm">
                              ${cardCash.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <div className="text-gray-400 text-sm">
                          Stock: {card.quantity}
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Pagination */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center mt-8 space-x-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-2 bg-[#1E1F35] text-white border border-gray-600 rounded hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Previous
                </button>
                
                <span className="text-gray-400 px-4">
                  Page {currentPage} of {totalPages}
                </span>
                
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 bg-[#1E1F35] text-white border border-gray-600 rounded hover:border-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            )}
            
            {/* Floating Checkout Bar - Desktop */}
            {selectedCards.size > 0 && (
              <div className="fixed bottom-0 left-0 right-0 bg-[#1E1F35] border-t-2 border-green-500 p-6 shadow-lg z-50">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                  <div>
                    <div className="text-white font-bold text-lg">{selectedCards.size} item{selectedCards.size > 1 ? 's' : ''} selected</div>
                    <div className="text-green-400 font-bold text-2xl">${calculateTotal().toFixed(2)}</div>
                  </div>
                  <button
                    onClick={handleCheckoutClick}
                    className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-8 rounded-lg shadow-lg transition-all text-lg"
                  >
                    Checkout
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Card details modal */}
      <CardDetailModal
        card={selectedCard}
        isOpen={isModalOpen}
        onClose={() => {
          // Just close the modal. We refresh only after successful actions via onPurchase.
          console.debug('[Shop] Modal closed')
          setIsModalOpen(false)
          // Restore scroll and focus after closing modal
          setTimeout(() => {
            if (typeof window !== 'undefined' && lastScrollRef.current !== null) {
              window.scrollTo({ top: lastScrollRef.current, left: 0, behavior: 'auto' })
            }
            if (lastClickedElRef.current) {
              lastClickedElRef.current.focus()
            }
          }, 0)
        }}
        channel="official"
        userId={userId}
        listingId={selectedCard?.id}
        onPurchase={handlePurchase}
        listing={selectedListing}
        collectionName={collections.find(c => c.id === selectedListing?.collection_id)?.name}
      />
      
      {/* Marketplace guide modal */}
      <MarketplaceGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
      
      {/* Checkout modal */}
      <CheckoutModal
        isOpen={isCheckoutModalOpen}
        onClose={() => setIsCheckoutModalOpen(false)}
        selectedItems={selectedCards}
        onSuccess={handleCheckoutSuccess}
        userId={userId}
      />
    </div>
  )
}
