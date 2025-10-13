'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useSearchParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { OfficialCard, OfficialListingsResponse } from '@/lib/marketplaceApi'
import marketplaceApi from '@/lib/marketplaceApi'
import CardDetailModal from '@/components/CardDetailModal'
import ShopGuideModal from '@/components/ShopGuideModal'
import CheckoutModal from '@/components/CheckoutModal'
import { useAuthStore } from '@/store/authStore'
import CustomDropdown from '@/components/CustomDropdown'
import ActiveFilters from '@/components/ActiveFilters'
import { Card } from '@/lib/packsApi'
import { getAuthHeaders } from '@/lib/authUtils'
import toast from 'react-hot-toast'

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
  } catch (error) {
    // If URL parsing fails (e.g., relative URLs), return the original URL
    // Next.js Image component will handle relative URLs directly
    return url
  }
}

interface CollectionItem {
  id: string
  name: string
}

export default function ShopPage() {
  const { uid, openLoginModal } = useAuthStore()
  const userId = uid || ''
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [sortBy, setSortBy] = useState<'priceCash' | 'createdAt'>('priceCash')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [selectedType, setSelectedType] = useState<string>('')  // 'box', 'card', 'pack', or ''
  const [allCards, setAllCards] = useState<OfficialCard[]>([]) // All filtered/sorted cards
  const [cards, setCards] = useState<OfficialCard[]>([]) // Cards currently shown on page
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
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false)
  
  // Lock body scroll when filter modal is open
  useEffect(() => {
    if (isFilterModalOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isFilterModalOpen])
  
  // Multi-select state (always enabled)
  const [selectedCards, setSelectedCards] = useState<Map<string, { card: OfficialCard; quantity: number }>>(new Map())
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false)
  
  // Track scroll position and clicked element to restore after modal close
  const lastScrollRef = useRef<number | null>(null)
  const lastClickedElRef = useRef<HTMLElement | null>(null)
  

  // Fetch shop data
  const fetchShopData = useCallback(async () => {
    console.debug('[Shop] fetchShopData invoked', { selectedCategory, searchQuery, currentPage })
    setLoading(true)
    try {
      // Fetch official marketplace data - no sorting on backend
      // Backend limits per_page to 100, so we'll fetch all pages
      const params: any = {
        collection_id: selectedCategory || undefined,
        page: 1,
        per_page: 100, // Max allowed by backend
        search_query: searchQuery || undefined
      }
      
      const firstResponse: OfficialListingsResponse = await marketplaceApi.getOfficialListings(params)
      
      // Fetch remaining pages if there are more
      let allCards = [...firstResponse.cards]
      const backendTotalPages = firstResponse.pagination.total_pages
      
      if (backendTotalPages > 1) {
        const remainingPagePromises = []
        for (let page = 2; page <= backendTotalPages; page++) {
          remainingPagePromises.push(
            marketplaceApi.getOfficialListings({ ...params, page })
          )
        }
        const remainingResponses = await Promise.all(remainingPagePromises)
        remainingResponses.forEach(response => {
          allCards = [...allCards, ...response.cards]
        })
      }
      
      // Filter by type client-side
      let filteredCards = allCards
      if (selectedType) {
        filteredCards = filteredCards.filter(card => {
          // Check if card has a type field and it matches the selected type
          const cardType = (card as any).type || ''
          return cardType.toLowerCase() === selectedType.toLowerCase()
        })
      }
      
      // Sort client-side
      const sortedCards = [...filteredCards].sort((a, b) => {
        let aValue: any
        let bValue: any
        
        if (sortBy === 'priceCash') {
          aValue = a.priceCash || 0
          bValue = b.priceCash || 0
        } else if (sortBy === 'createdAt') {
          aValue = a.date_got_in_stock || ''
          bValue = b.date_got_in_stock || ''
        } else {
          aValue = 0
          bValue = 0
        }
        
        if (sortOrder === 'asc') {
          return aValue > bValue ? 1 : aValue < bValue ? -1 : 0
        } else {
          return aValue < bValue ? 1 : aValue > bValue ? -1 : 0
        }
      })
      
      // Store all sorted cards and apply pagination
      setAllCards(sortedCards)
      const totalItems = sortedCards.length
      const totalPages = Math.ceil(totalItems / perPage)
      const startIdx = (currentPage - 1) * perPage
      const endIdx = startIdx + perPage
      const paginatedCards = sortedCards.slice(startIdx, endIdx)
      
      setCards(paginatedCards)
      setTotalPages(totalPages)
      setTotalItems(totalItems)
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
      setAllCards(mockCards)
      setCards(mockCards.slice(0, perPage))
      setTotalPages(Math.ceil(mockCards.length / perPage))
      setTotalItems(mockCards.length)
    } finally {
      setLoading(false)
    }
  }, [selectedCategory, searchQuery, sortBy, sortOrder, selectedType, currentPage, perPage])

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

  // Check for payment success redirect
  useEffect(() => {
    const success = searchParams.get('success')
    if (success === 'true') {
      toast.success('Order successful! Check your order in Orders', {
        duration: 5000,
        icon: '🎉'
      })
      // Clean up URL without the success parameter
      window.history.replaceState({}, '', '/shop')
    }
  }, [searchParams])

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
  
  // Scroll to top when page changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [currentPage])

  // Handle category selection
  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId)
    setCurrentPage(1)
  }

  // Handle search
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    setCurrentPage(1)
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
            <p className="text-gray-400 text-center text-sm mt-2">Purchase with cash</p>
          </div>

          {/* 移动端工具栏 - 更紧凑的布局 */}
          <div className="space-y-3 mb-4">
            {/* Collection dropdown stays outside */}
            <CustomDropdown
              value={selectedCategory}
              onChange={handleCategorySelect}
              options={collections}
              placeholder="Select Collection"
              className="w-full"
            />

            {/* Filter + Compact buttons in one line */}
            <div className="flex items-center gap-2">
              {/* Filter Button - filled when active */}
              <button
                onClick={() => setIsFilterModalOpen(true)}
                className={`px-3 py-2 text-white rounded-lg transition-colors flex items-center gap-2 ${
                  (searchQuery || selectedType || (sortBy !== 'priceCash' || sortOrder !== 'desc'))
                    ? 'bg-purple-600 border border-purple-500 hover:bg-purple-700'
                    : 'bg-[#1E1F35] border border-gray-600 hover:border-purple-500'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
                </svg>
                <span className="text-sm">Filter</span>
              </button>

              {/* Compact buttons */}
              <button
                onClick={() => router.push('/user/withdrawals?tab=shop')}
                className="px-2 py-2 text-xs font-medium rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow hover:shadow-md transition-all border border-blue-500/50 flex-1"
                aria-label="Orders"
              >
                Orders
              </button>
              <button
                onClick={() => {
                  setSelectedCards(new Map())
                  fetchShopData()
                }}
                disabled={loading}
                className={`px-2 py-2 text-xs font-medium rounded-lg transition-all flex-1
                  ${loading
                    ? 'bg-gray-700 text-gray-300 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-fuchsia-500 text-white shadow hover:shadow-md'}
                  border border-purple-500/50`}
                aria-label="Refresh"
              >
                {loading ? '...' : 'Refresh'}
              </button>
              <button
                className="px-2 py-2 bg-[#1E1F35] rounded-lg hover:opacity-80 transition-opacity border border-gray-600"
                onClick={() => setIsGuideModalOpen(true)}
                aria-label="Operation"
              >
                <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
              </button>
            </div>
          </div>


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
              <p className="text-gray-400 mt-2">Purchase with cash</p>
            </div>

            {/* Toolbar - single line layout */}
            <div className="flex items-center justify-between mb-6 flex-wrap xl:flex-nowrap gap-4">
              {/* Collection dropdown */}
              <CustomDropdown
                value={selectedCategory}
                onChange={handleCategorySelect}
                options={collections}
                placeholder="Select Collection"
              />
              
              {/* Filter Button */}
              <button
                onClick={() => setIsFilterModalOpen(true)}
                className="px-4 py-2 bg-[#1E1F35] text-white border border-gray-600 rounded-lg hover:border-purple-500 transition-colors flex items-center gap-2"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M2.628 1.601C5.028 1.206 7.49 1 10 1s4.973.206 7.372.601a.75.75 0 01.628.74v2.288a2.25 2.25 0 01-.659 1.59l-4.682 4.683a2.25 2.25 0 00-.659 1.59v3.037c0 .684-.31 1.33-.844 1.757l-1.937 1.55A.75.75 0 018 18.25v-5.757a2.25 2.25 0 00-.659-1.591L2.659 6.22A2.25 2.25 0 012 4.629V2.34a.75.75 0 01.628-.74z" clipRule="evenodd" />
                </svg>
                <span>Filter</span>
              </button>

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
                  onClick={() => router.push('/user/withdrawals?tab=shop')}
                  className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-md transition-all bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow hover:shadow-md hover:scale-[1.02] active:scale-[0.99] border border-blue-500/50"
                  aria-label="View Orders"
                  title="View your shop orders"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                    <path d="M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 3H6.28l-.31-1.243A1 1 0 005 1H3zM16 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM6.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
                  </svg>
                  <span>View Orders</span>
                </button>
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
                  }
              }] : []),
              ...((sortBy !== 'priceCash' || sortOrder !== 'desc') ? [{
                key: 'sort',
                label: 'Sort',
                value: sortBy === 'priceCash' 
                  ? (sortOrder === 'asc' ? 'Price: Low to High' : 'Price: High to Low')
                  : 'Recently Added',
                onClear: () => {
                  setSortBy('priceCash')
                  setSortOrder('desc')
                  setCurrentPage(1)
                }
              }] : []),
                ...(selectedType ? [{
                  key: 'type',
                  label: 'Type',
                  value: selectedType.charAt(0).toUpperCase() + selectedType.slice(1),
                  onClear: () => {
                    setSelectedType('')
                  }
                }] : [])
              ]}
              onClearAll={() => {
                setSelectedCategory('pokemon')
                setSearchQuery('')
                setSortBy('priceCash')
                setSortOrder('desc')
                setSelectedType('')
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
      
      {/* Shop guide modal */}
      <ShopGuideModal
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
      
      {/* Filter Modal */}
      {isFilterModalOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[997] bg-black/50" onClick={() => setIsFilterModalOpen(false)} />
          <div className="fixed inset-0 z-[998] flex items-start justify-center overflow-y-auto">
            <div className="mt-16 mb-8 w-full max-w-xl bg-[#2A2B3D] border border-[#8B5CF6]/30 rounded-lg shadow-2xl mx-4">
              <div className="sticky top-0 bg-[#2A2B3D] p-4 border-b border-[#3F3F5F] flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">Filter Shop</h3>
                <button
                  onClick={() => setIsFilterModalOpen(false)}
                  className="p-1 hover:bg-[#3F3F5F] rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 sm:p-6 space-y-4">
                {/* Search Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Search Cards
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by card name..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-[#1E1F2E] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] placeholder-gray-500"
                    />
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
                
                {/* Sort By Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sort By
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => { setSortBy('createdAt'); setSortOrder('desc'); }}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        sortBy === 'createdAt' && sortOrder === 'desc'
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      Recently Added
                    </button>
                    <button
                      onClick={() => { setSortBy('priceCash'); setSortOrder('asc'); }}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        sortBy === 'priceCash' && sortOrder === 'asc'
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      Price: Low to High
                    </button>
                    <button
                      onClick={() => { setSortBy('priceCash'); setSortOrder('desc'); }}
                      className={`px-4 py-2 rounded-lg transition-colors col-span-2 ${
                        sortBy === 'priceCash' && sortOrder === 'desc'
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      Price: High to Low
                    </button>
                  </div>
                </div>
                
                {/* Type Filter Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Product Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setSelectedType('')}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        selectedType === ''
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSelectedType('card')}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        selectedType === 'card'
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      Card
                    </button>
                    <button
                      onClick={() => setSelectedType('pack')}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        selectedType === 'pack'
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      Pack
                    </button>
                    <button
                      onClick={() => setSelectedType('box')}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        selectedType === 'box'
                          ? 'bg-[#8B5CF6] text-white'
                          : 'bg-[#1E1F2E] text-gray-300 hover:bg-[#2A2B3D]'
                      }`}
                    >
                      Box
                    </button>
                  </div>
                </div>
              </div>
              <div className="sticky bottom-0 bg-[#2A2B3D] p-4 border-t border-[#3F3F5F] flex gap-3">
                <button
                  onClick={() => {
                    setSearchQuery('')
                    setSortBy('createdAt')
                    setSortOrder('desc')
                    setSelectedType('')
                    setCurrentPage(1)
                  }}
                  className="flex-1 px-4 py-2 bg-[#3F3F5F] hover:bg-[#4F4F6F] text-white rounded-lg transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={() => setIsFilterModalOpen(false)}
                  className="flex-1 px-4 py-2 bg-[#8B5CF6] hover:bg-[#7C3AED] text-white rounded-lg transition-colors"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
