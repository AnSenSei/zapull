'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Listing, OfficialCard, ListingsResponse, OfficialListingsResponse } from '@/lib/marketplaceApi'
import marketplaceApi from '@/lib/marketplaceApi'
import CardDetailModal from '@/components/CardDetailModal'
import MarketplaceGuideModal from '@/components/MarketplaceGuideModal'
import { useAuthStore } from '@/store/authStore'
import CustomDropdown from '@/components/CustomDropdown'
import CustomSortDropdown from '@/components/CustomSortDropdown'
import ImprovedSortDropdown from '@/components/ImprovedSortDropdown'
import PriceRangeFilter from '@/components/PriceRangeFilter'
import ActiveFilters from '@/components/ActiveFilters'
import { Card } from '@/lib/packsApi'
import { getAuthHeaders } from '@/lib/authUtils'

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

export default function MarketplacePage() {
  const { uid } = useAuthStore()
  const userId = uid || ''
  
  const [activeTab, setActiveTab] = useState('marketplace')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortValue, setSortValue] = useState('createdAt_desc') // Combined sort value
  const [priceRangeType, setPriceRangeType] = useState<'cash' | 'points'>('cash')
  const [cards, setCards] = useState<(Listing | OfficialCard)[]>([])
  const [loading, setLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [perPage] = useState(20)
  const [collections, setCollections] = useState<CollectionItem[]>([])
  const [selectedCard, setSelectedCard] = useState<Card | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedListing, setSelectedListing] = useState<Listing | OfficialCard | null>(null)
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
  const [minPriceCash, setMinPriceCash] = useState<number | undefined>(undefined)
  const [maxPriceCash, setMaxPriceCash] = useState<number | undefined>(undefined)
  const [minPricePoints, setMinPricePoints] = useState<number | undefined>(undefined)
  const [maxPricePoints, setMaxPricePoints] = useState<number | undefined>(undefined)
  
  // Track scroll position and clicked element to restore after modal close
  const lastScrollRef = useRef<number | null>(null)
  const lastClickedElRef = useRef<HTMLElement | null>(null)
  
  // Parse sort value to get sortBy and sortOrder
  // When sortBy is 'priceCash' -> cash filtering is active
  // When sortBy is 'pricePoints' -> points filtering is active
  // Otherwise -> both filter types can be shown based on user selection
  const [sortBy, sortOrder] = sortValue.split('_') as [string, 'asc' | 'desc']

  // Fetch marketplace data
  const fetchMarketplaceData = useCallback(async () => {
    console.debug('[Marketplace] fetchMarketplaceData invoked', { activeTab, selectedCategory, sortBy, sortOrder, searchQuery, currentPage, minPriceCash, maxPriceCash, minPricePoints, maxPricePoints })
    setLoading(true)
    try {
      if (activeTab === 'marketplace') {
        // Fetch player marketplace data
        const params: any = {
          collection_id: selectedCategory || undefined,
          per_page: perPage,
          sort_by: sortBy,
          sort_order: sortOrder,
          search_query: searchQuery || undefined,
          page: currentPage,
          filter_out_accepted: true,
          min_price_cash: minPriceCash,
          max_price_cash: maxPriceCash,
          min_price_points: minPricePoints,
          max_price_points: maxPricePoints
        }
        
        const response: ListingsResponse = await marketplaceApi.getAllListings(params)
        setCards(response.listings)
        setTotalPages(response.pagination.total_pages)
        setTotalItems(response.pagination.total_items)
      } else {
        // Fetch official marketplace data
        const params: any = {
          collection_id: selectedCategory || undefined,
          page: currentPage,
          per_page: perPage,
          sort_by: sortBy === 'priceCash' ? 'priceCash' as const : 'pricePoints' as const,
          sort_order: sortOrder,
          search_query: searchQuery || undefined
        }
        
        const response: OfficialListingsResponse = await marketplaceApi.getOfficialListings(params)
        setCards(response.cards)
        setTotalPages(response.pagination.total_pages)
      }
    } catch (error) {
      console.error('Failed to fetch marketplace data:', error)
      // If API call fails, use mock data
      const mockCards: Listing[] = Array.from({ length: 15 }, (_, i) => ({
        id: `card-${i}`,
        owner_reference: `user-${i}`,
        card_reference: `card-ref-${i}`,
        card_name: '2004 Panini Sports Mega Cracks La Liga Lionel Messi Rookie #71 PSA 10 GEM MINT',
        image_url: '/cards/common1.jpg.svg',
        pricePoints: 0,
        priceCash: 25.00 + (i * 5),
        collection_id: selectedCategory || 'One Piece',
        quantity: 500,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        highestOfferPoints: {},
        highestOfferCash: {}
      }))
      setCards(mockCards)
    } finally {
      setLoading(false)
    }
  }, [activeTab, selectedCategory, sortBy, sortOrder, searchQuery, currentPage, perPage, minPriceCash, maxPriceCash, minPricePoints, maxPricePoints])

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

  // Only fetch marketplace data after collections are loaded and category is set
  useEffect(() => {
    if (collections.length > 0 && selectedCategory) {
      fetchMarketplaceData()
    }
  }, [fetchMarketplaceData, collections.length, selectedCategory])



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

  // Handle card click event
  const handleCardClick = (card: Listing | OfficialCard, el?: HTMLElement) => {
    // Record current scroll and clicked element for restoration on close
    if (typeof window !== 'undefined') {
      lastScrollRef.current = window.scrollY
    }
    if (el) {
      lastClickedElRef.current = el
    } else {
      lastClickedElRef.current = null
    }
    
    // Convert marketplace card to Card format for modal
    const cardData: Card = {
      id: card.id,
      name: card.card_name || 'Unknown Card',
      image_url: card.image_url || '/cards/common1.jpg.svg',
      rarity: 3, // Default rarity
      point_worth: card.pricePoints || 0,
      cash_worth: ('priceCash' in card) ? card.priceCash : 0,
      collection_id: card.collection_id || selectedCategory || 'unknown'
    }
    
    setSelectedCard(cardData)
    setSelectedListing(card)
    setIsModalOpen(true)
  }

  // Handle purchase event
  const handlePurchase = (type: 'cash' | 'points', card: Card) => {
    console.log(`Purchase type: ${type}, Card:`, card)
    // Purchase logic is already implemented in CardDetailModal
    // Additional post-purchase logic can be added here, such as refreshing data
    fetchMarketplaceData()
  }


  // Handle tab switch
  const handleTabChange = (tab: string) => {
    setActiveTab(tab)
    setCurrentPage(1) // Reset to first page
    // If switching to official market and current sort is cash price, switch to points price
    if (tab === 'official' && sortBy === 'priceCash') {
      setSortValue('pricePoints_asc')
    }
  }

  return (
    <div className="min-h-screen bg-[#2A2B47]">
      {/* 移动端布局 */}
      <div className="sm:hidden">
        <div className="p-4 pt-8">
          {/* 移动端顶部标签切换 */}
          <div className="flex bg-[#6B46C1] rounded-lg p-1 mb-4 w-full">
            <button
              onClick={() => handleTabChange('marketplace')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'marketplace'
                  ? 'bg-white text-[#6B46C1]'
                  : 'text-white hover:text-gray-200'
              }`}
            >
              Marketplace
            </button>
            <button
              onClick={() => handleTabChange('official')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'official'
                  ? 'bg-white text-[#6B46C1]'
                  : 'text-white hover:text-gray-200'
              }`}
            >
              Official
            </button>
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
              options={
                activeTab === 'marketplace' 
                  ? [
                      { id: 'recent', label: 'Recently Listed', value: 'createdAt', order: 'desc', icon: '🕐' },
                      { id: 'price_low', label: 'Cash: Low to High', value: 'priceCash', order: 'asc', icon: '💵' },
                      { id: 'price_high', label: 'Cash: High to Low', value: 'priceCash', order: 'desc', icon: '💵' },
                      { id: 'points_low', label: 'Points: Low to High', value: 'pricePoints', order: 'asc', iconImage: '/marketplace/coin.png' },
                      { id: 'points_high', label: 'Points: High to Low', value: 'pricePoints', order: 'desc', iconImage: '/marketplace/coin.png' },
                    ]
                  : [
                      { id: 'recent', label: 'Recently Added', value: 'createdAt', order: 'desc', icon: '🕐' },
                      { id: 'points_low', label: 'Points: Low to High', value: 'pricePoints', order: 'asc', iconImage: '/marketplace/coin.png' },
                      { id: 'points_high', label: 'Points: High to Low', value: 'pricePoints', order: 'desc', iconImage: '/marketplace/coin.png' },
                    ]
              }
              className="w-full"
            />

            {/* 价格过滤 */}
            <PriceRangeFilter
              type={sortBy === 'priceCash' ? 'cash' : 'points'}
              minValue={sortBy === 'priceCash' ? minPriceCash : minPricePoints}
              maxValue={sortBy === 'priceCash' ? maxPriceCash : maxPricePoints}
              onMinChange={(value) => {
                if (sortBy === 'priceCash') {
                  setMinPriceCash(value)
                } else {
                  setMinPricePoints(value)
                }
                setCurrentPage(1)
              }}
              onMaxChange={(value) => {
                if (sortBy === 'priceCash') {
                  setMaxPriceCash(value)
                } else {
                  setMaxPricePoints(value)
                }
                setCurrentPage(1)
              }}
              className="w-full"
            />

            {/* 操作按钮 + 刷新 */}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => fetchMarketplaceData()}
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
              }] : []),
              ...(minPricePoints !== undefined || maxPricePoints !== undefined ? [{
                key: 'price_points',
                label: 'Points',
                value: `${minPricePoints || '0'} - ${maxPricePoints || '∞'}`,
                onClear: () => {
                  setMinPricePoints(undefined)
                  setMaxPricePoints(undefined)
                  setCurrentPage(1)
                }
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedCategory('pokemon')
              setSearchQuery('')
              setMinPriceCash(undefined)
              setMaxPriceCash(undefined)
              setMinPricePoints(undefined)
              setMaxPricePoints(undefined)
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
                const cardName = 'card_name' in card ? card.card_name : (card as any).name || 'Unknown Card'
                const cardImage = card.image_url || '/cards/common1.jpg.svg'
                const cardPoints = card.pricePoints || 0
                const cardCash = 'priceCash' in card ? card.priceCash : 0
                
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={(e) => handleCardClick(card, e.currentTarget as HTMLElement)}
                    tabIndex={-1}
                    className="bg-[#1E1F35] rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border border-gray-700/50 hover:border-purple-500/50"
                  >
                    <div className="flex items-center justify-center py-1 bg-[#252641]">
                      <Image 
                        src="/marketplace/head.png" 
                        alt="head" 
                        width={16} 
                        height={16} 
                      />
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
                        {cardPoints > 0 && (
                          <div className="flex items-center space-x-1">
                            <Image src="/marketplace/coin.png" alt="coin" width={12} height={12} />
                            <span className="text-yellow-400 font-bold text-xs">
                              {cardPoints.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {cardCash > 0 && (
                          <span className="text-purple-400 font-bold text-xs">
                            ${cardCash.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Show quantity for official listings */}
                      {activeTab === 'official' && 'quantity' in card && (
                        <div className="text-gray-400 text-xs mt-1">
                          Stock: {card.quantity}
                        </div>
                      )}
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
        </div>
      </div>

      {/* 桌面端布局 */}
      <div className="hidden sm:block">
        <div className="w-full">
          <div className="p-4 lg:p-6">
          {/* Top tab switch */}
          <div className="flex bg-[#6B46C1] rounded-lg p-1 mb-6 w-full">
            <button
              onClick={() => handleTabChange('marketplace')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'marketplace'
                  ? 'bg-white text-[#6B46C1]'
                  : 'text-white hover:text-gray-200'
              }`}
            >
              Marketplace
            </button>
            <button
              onClick={() => handleTabChange('official')}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                activeTab === 'official'
                  ? 'bg-white text-[#6B46C1]'
                  : 'text-white hover:text-gray-200'
              }`}
            >
              Official redemption
            </button>
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
              options={
                activeTab === 'marketplace' 
                  ? [
                      { id: 'recent', label: 'Recently Listed', value: 'createdAt', order: 'desc', icon: '🕐' },
                      { id: 'price_low', label: 'Cash: Low to High', value: 'priceCash', order: 'asc', icon: '💵' },
                      { id: 'price_high', label: 'Cash: High to Low', value: 'priceCash', order: 'desc', icon: '💵' },
                      { id: 'points_low', label: 'Points: Low to High', value: 'pricePoints', order: 'asc', iconImage: '/marketplace/coin.png' },
                      { id: 'points_high', label: 'Points: High to Low', value: 'pricePoints', order: 'desc', iconImage: '/marketplace/coin.png' },
                    ]
                  : [
                      { id: 'recent', label: 'Recently Added', value: 'createdAt', order: 'desc', icon: '🕐' },
                      { id: 'points_low', label: 'Points: Low to High', value: 'pricePoints', order: 'asc', iconImage: '/marketplace/coin.png' },
                      { id: 'points_high', label: 'Points: High to Low', value: 'pricePoints', order: 'desc', iconImage: '/marketplace/coin.png' },
                    ]
              }
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
              type={sortBy === 'priceCash' ? 'cash' : 'points'}
              minValue={sortBy === 'priceCash' ? minPriceCash : minPricePoints}
              maxValue={sortBy === 'priceCash' ? maxPriceCash : maxPricePoints}
              onMinChange={(value) => {
                if (sortBy === 'priceCash') {
                  setMinPriceCash(value)
                } else {
                  setMinPricePoints(value)
                }
                setCurrentPage(1)
              }}
              onMaxChange={(value) => {
                if (sortBy === 'priceCash') {
                  setMaxPriceCash(value)
                } else {
                  setMaxPricePoints(value)
                }
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
                onClick={() => fetchMarketplaceData()}
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
              }] : []),
              ...(minPricePoints !== undefined || maxPricePoints !== undefined ? [{
                key: 'price_points',
                label: 'Points',
                value: `${minPricePoints || '0'} - ${maxPricePoints || '∞'}`,
                onClear: () => {
                  setMinPricePoints(undefined)
                  setMaxPricePoints(undefined)
                  setCurrentPage(1)
                }
              }] : [])
            ]}
            onClearAll={() => {
              setSelectedCategory('pokemon')
              setSearchQuery('')
              setMinPriceCash(undefined)
              setMaxPriceCash(undefined)
              setMinPricePoints(undefined)
              setMaxPricePoints(undefined)
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
                // Compatible with different data structures
                const cardName = 'card_name' in card ? card.card_name : (card as any).name || 'Unknown Card'
                const cardImage = card.image_url || '/cards/common1.jpg.svg'
                const cardPoints = card.pricePoints || 0
                const cardCash = 'priceCash' in card ? card.priceCash : 0
                
                return (
                  <motion.div
                    key={card.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={(e) => handleCardClick(card, e.currentTarget as HTMLElement)}
                    tabIndex={-1}
                    className="bg-[#1E1F35] rounded-lg overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group border border-gray-700/50 hover:border-purple-500/50"
                  >
                    {/* Card header - avatar icon */}
                    <div className="flex items-center justify-center py-2 bg-[#252641]">
                      <Image 
                        src="/marketplace/head.png" 
                        alt="head" 
                        width={24} 
                        height={24} 
                      />
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
                        {cardPoints > 0 && (
                          <div className="flex items-center space-x-1">
                            <Image src="/marketplace/coin.png" alt="coin" width={14} height={14} />
                            <span className="text-yellow-400 font-bold text-sm">
                              {cardPoints.toLocaleString()}
                            </span>
                          </div>
                        )}
                        {cardCash > 0 && (
                          <span className="text-purple-400 font-bold text-sm">
                            ${cardCash.toFixed(2)}
                          </span>
                        )}
                      </div>
                      {/* Show quantity for official listings */}
                      {activeTab === 'official' && 'quantity' in card && (
                        <div className="text-gray-400 text-sm">
                          Stock: {card.quantity}
                        </div>
                      )}
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
          </div>
        </div>
      </div>
      
      {/* Card details modal */}
      <CardDetailModal
        card={selectedCard}
        isOpen={isModalOpen}
        onClose={() => {
          // Just close the modal. We refresh only after successful actions via onPurchase.
          console.debug('[Marketplace] Modal closed')
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
        channel={activeTab === 'official' ? 'official' : 'player'}
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
    </div>
  )
}
