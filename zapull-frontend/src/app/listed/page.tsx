'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { getCurrentUserId, getAuthHeaders, isAuthenticated } from '@/lib/authUtils'
import { useAuthStore } from '@/store/authStore'
import UserNavigation from '@/components/UserNavigation'
import EditOfferModal from '@/components/EditOfferModal'
import DeleteOfferModal from '@/components/DeleteOfferModal'
import ListingDetailModal from '@/components/ListingDetailModal'
import CardDetailModal from '@/components/CardDetailModal'
import { Card } from '@/lib/packsApi'
import SelectAddressModal from '@/components/SelectAddressModal'
import marketplaceApi from '@/lib/marketplaceApi'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'
import paymentApi from '@/lib/paymentApi'
import MarketplacePaymentModal from '@/components/MarketplacePaymentModal'
import CustomDropdown from '@/components/CustomDropdown'


interface ListedCard {
  id: string
  card_name: string
  card_reference: string
  priceCash: number
  pricePoints: number
  image_url: string
  highestOfferPoints?: {
    amount: number
    offererRef: string
    offerreference: string
    at: string
    type: string
  }
  highestOfferCash?: {
    amount: number
    offererRef: string
    offerreference: string
    at: string
    type: string
  }
  quantity: number
  expiresAt: string
  status?: string
  has_offer?: boolean
}

interface OfferCard {
  offerreference: string
  card_reference: string
  amount: number
  status: string
  image_url: string
  expiresAt: string
  listingId: string
  type: 'cash' | 'points'
  at: string // Add timestamp field for sorting
}

interface EditOfferModalState {
  isOpen: boolean
  offer: OfferCard | null
}

interface DeleteOfferModalState {
  isOpen: boolean
  offer: OfferCard | null
}

interface ListingDetailModalState {
  isOpen: boolean
  listing: ListedCard | null
}

interface OfferCardDetailModalState {
  isOpen: boolean
  card: Card | null
  offer: OfferCard | null
  listing?: any
}

export default function ListingsPage() {
  const router = useRouter()
  const [sortBy, setSortBy] = useState('Most Expensive')
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all') // 'all', 'has_offers', 'accepted'
  const [currentView, setCurrentView] = useState('listed') // 'listed', 'offer_make', 'offer_to_buy'
  const [offerMakeSubTab, setOfferMakeSubTab] = useState<'cash' | 'points'>('cash') // Sub-tab for offer make view
  const { userInfo, authInitialized } = useAuthStore()
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [listedCards, setListedCards] = useState<ListedCard[]>([])
  const [offerMakeCards, setOfferMakeCards] = useState<OfferCard[]>([]) // Cash offers made
  const [pointOffersMade, setPointOffersMade] = useState<OfferCard[]>([]) // Points offers made
  const [acceptedCashOffers, setAcceptedCashOffers] = useState<OfferCard[]>([]) // Accepted cash offers
  const [acceptedPointOffers, setAcceptedPointOffers] = useState<OfferCard[]>([]) // Accepted point offers
  const [acceptedOfferSubTab, setAcceptedOfferSubTab] = useState<'cash' | 'points'>('cash') // Sub-tab for accepted offers
  const [editOfferModal, setEditOfferModal] = useState<EditOfferModalState>({ isOpen: false, offer: null })
  const [deleteOfferModal, setDeleteOfferModal] = useState<DeleteOfferModalState>({ isOpen: false, offer: null })
  const [listingDetailModal, setListingDetailModal] = useState<ListingDetailModalState>({ isOpen: false, listing: null })
  const [offerCardDetailModal, setOfferCardDetailModal] = useState<OfferCardDetailModalState>({ isOpen: false, card: null, offer: null, listing: null })
  const [selectAddressModal, setSelectAddressModal] = useState({ isOpen: false, pendingOffer: null as OfferCard | null })
  const [paymentModal, setPaymentModal] = useState({ 
    isOpen: false, 
    listing: null as any, 
    offer: null as any,
    buyerAddressId: ''
  })

  // API调用函数
  const fetchUserListings = async () => {
    if (!userId) return
    
    try {
      setLoading(true)
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      
      // Build query parameters
      const params = new URLSearchParams()
      if (filterType !== 'all') {
        params.append('filter_type', filterType)
      }
      // Ensure we load at least 100 at once and start from first page
      params.append('per_page', '100')
      params.append('page', '1')
      
      const queryString = params.toString()
      const url = `${apiBaseUrl}/marketplace/listings${queryString ? `?${queryString}` : ''}`
      
      const response = await fetch(url, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...authHeaders
        }
      })
      if (response.ok) {
        const data = await response.json()
        console.log('Received listings data:', data) // Debug log
        // Ensure data is an array
        if (Array.isArray(data)) {
          setListedCards(data)
        } else if (data && Array.isArray(data.listings)) {
          // Handle case where API returns an object with listings array
          setListedCards(data.listings)
        } else {
          console.error('Invalid data format received:', data)
          setListedCards([])
        }
      } else {
        console.error('Failed to fetch listings, status:', response.status)
        const errorText = await response.text()
        console.error('Error response:', errorText)
        // Set empty array when API fails
        setListedCards([])
      }
    } catch (error) {
      console.error('Failed to fetch user listings:', error)
      // Set empty array instead of mock data when there's an error
      setListedCards([])
    } finally {
      setLoading(false)
    }
  }

  const fetchUserOffers = async (offerType: 'cash' | 'points') => {
    if (!userId) return
    
    try {
      setLoading(true)
      
      
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      // Use all_offers endpoint to get all offers (not just accepted ones)
      const response = await fetch(`${apiBaseUrl}/marketplace/all_offers/${offerType === 'cash' ? 'cash' : 'point'}`, {
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          ...authHeaders
        }
      })
      if (response.ok) {
        const data = await response.json()
        if (offerType === 'cash') {
          setOfferMakeCards(data.offers || [])
        } else {
          // For points, we need to separate offers made vs offers to buy
          // This might need backend clarification, but for now treating all points offers as "offers to buy"
          setPointOffersMade(data.offers || [])
        }
      } else {
        console.error('Failed to fetch offers, status:', response.status)
        // Set empty arrays when API fails
        if (offerType === 'cash') {
          setOfferMakeCards([])
        } else {
          setPointOffersMade([])
        }
      }
    } catch (error) {
      console.error(`Failed to fetch ${offerType} offers:`, error)
      // Set empty arrays when there's an error
      if (offerType === 'cash') {
        setOfferMakeCards([])
      } else {
        setPointOffersMade([])
      }
    } finally {
      setLoading(false)
    }
  }

  const fetchAcceptedOffers = async (offerType: 'cash' | 'point') => {
    if (!userId) return
    
    try {
      setLoading(true)
      
      
      const data = await marketplaceApi.getAcceptedOffers(offerType)
      if (offerType === 'cash') {
        setAcceptedCashOffers(data.offers || [])
      } else {
        setAcceptedPointOffers(data.offers || [])
      }
    } catch (error) {
      console.error(`Failed to fetch accepted ${offerType} offers:`, error)
      // Set empty arrays when there's an error
      if (offerType === 'cash') {
        setAcceptedCashOffers([])
      } else {
        setAcceptedPointOffers([])
      }
    } finally {
      setLoading(false)
    }
  }

  // 页面加载时获取数据
  // Check authentication on mount (wait for auth initialization to avoid false negatives)
  useEffect(() => {
    if (!authInitialized) return;
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
    }
  }, [authInitialized, router]);

  // 获取用户ID
  useEffect(() => {
    const currentUserId = getCurrentUserId()
    setUserId(currentUserId)
  }, [userInfo])

  // 当用户ID变化时获取数据
  useEffect(() => {
    if (userId) {
      fetchUserListings()
      fetchUserOffers('cash')  // This will set offerMakeCards (cash offers made)
      fetchUserOffers('points') // This will set pointOffersMade
      fetchAcceptedOffers('cash') // This will set acceptedCashOffers
      fetchAcceptedOffers('point') // This will set acceptedPointOffers
    }
  }, [userId])

  // When filter type changes, refetch listings
  useEffect(() => {
    if (userId && currentView === 'listed') {
      fetchUserListings()
    }
  }, [filterType, userId])

  // Handle main tab changes
  useEffect(() => {
    if (!userId) return
    
    if (currentView === 'listed') {
      fetchUserListings()
    } else if (currentView === 'offer_make') {
      // Fetch based on current sub-tab
      if (offerMakeSubTab === 'cash') {
        fetchUserOffers('cash')
      } else {
        fetchUserOffers('points')
      }
    } else if (currentView === 'offer_to_buy') {
      // Fetch based on current sub-tab
      if (acceptedOfferSubTab === 'cash') {
        fetchAcceptedOffers('cash')
      } else {
        fetchAcceptedOffers('point')
      }
    }
  }, [currentView, userId])

  // Handle offer make sub-tab changes
  useEffect(() => {
    if (!userId || currentView !== 'offer_make') return
    
    if (offerMakeSubTab === 'cash') {
      fetchUserOffers('cash')
    } else {
      fetchUserOffers('points')
    }
  }, [offerMakeSubTab, userId])

  // Handle accepted offer sub-tab changes
  useEffect(() => {
    if (!userId || currentView !== 'offer_to_buy') return
    
    if (acceptedOfferSubTab === 'cash') {
      fetchAcceptedOffers('cash')
    } else {
      fetchAcceptedOffers('point')
    }
  }, [acceptedOfferSubTab, userId])

  // When test mode changes, refetch all data
  useEffect(() => {
    if (userId) {
      fetchUserListings()
      fetchUserOffers('cash')
      fetchUserOffers('points')
      fetchAcceptedOffers('cash')
      fetchAcceptedOffers('point')
    }
  }, [userId])

  // 处理编辑出价
  const handleEditOffer = (offer: OfferCard) => {
    setEditOfferModal({ isOpen: true, offer })
  }

  const handleEditOfferSuccess = () => {
    // 重新获取数据
    if (currentView === 'offer_make') {
      fetchUserOffers('cash')
      fetchUserOffers('points') // Refresh both types
    } else if (currentView === 'offer_to_buy') {
      fetchAcceptedOffers('cash')
      fetchAcceptedOffers('point')
    }
  }

  // 处理删除出价
  const handleDeleteOffer = (offer: OfferCard) => {
    setDeleteOfferModal({ isOpen: true, offer })
  }

  const handleDeleteOfferSuccess = () => {
    // Optimistically remove the offer from UI
    const offer = deleteOfferModal.offer
    if (offer && currentView === 'offer_make') {
      if (offerMakeSubTab === 'cash') {
        setOfferMakeCards((prev) => prev.filter((o) => o.offerreference !== offer.offerreference))
      } else {
        setPointOffersMade((prev) => prev.filter((o) => o.offerreference !== offer.offerreference))
      }
    }

    // Re-fetch shortly after to sync state with backend
    setTimeout(() => {
      if (currentView === 'offer_make') {
        fetchUserOffers('cash')
        fetchUserOffers('points') // Refresh both types
      } else if (currentView === 'offer_to_buy') {
        fetchAcceptedOffers('cash')
        fetchAcceptedOffers('point')
      }
    }, 600)
  }

  // 处理查看挂售详情
  const handleViewListingDetail = (listing: ListedCard) => {
    setListingDetailModal({ isOpen: true, listing })
  }

  // 处理查看报价卡片详情
  const handleViewOfferCardDetail = async (offer: OfferCard) => {
    try {
      // Get listing details to fetch card information
      const listingDetails = await marketplaceApi.getUserListingDetail(offer.listingId)
      
      // Convert to Card format for CardDetailModal
      const cardData: Card = {
        id: offer.listingId,
        document_id: offer.listingId,
        name: offer.card_reference,
        point_worth: listingDetails.pricePoints || 0,
        cash_worth: listingDetails.priceCash || 0,
        rarity: 3, // Default rarity
        image_url: offer.image_url || '/cards/common1.jpg.svg',
        probability: 0.1, // Default probability
        condition: 'Mint', // Default condition
        globalRef: offer.listingId,
        collection_id: listingDetails.collection_id || 'default'
      }
      
      setOfferCardDetailModal({ isOpen: true, card: cardData, offer, listing: listingDetails })
    } catch (error) {
      console.error('Failed to fetch listing details:', error)
      // Still open modal with basic info if API fails
      const cardData: Card = {
        id: offer.listingId,
        document_id: offer.listingId,
        name: offer.card_reference,
        point_worth: 0,
        cash_worth: 0,
        rarity: 3,
        image_url: offer.image_url || '/cards/common1.jpg.svg',
        probability: 0.1,
        condition: 'Mint',
        globalRef: offer.listingId,
        collection_id: 'default'
      }
      setOfferCardDetailModal({ isOpen: true, card: cardData, offer, listing: null })
    }
  }

  // 处理支付
  const handlePayment = async (offer: OfferCard) => {
    try {
      if (acceptedOfferSubTab === 'cash') {
        // 现金支付需要先选择地址
        setSelectAddressModal({ isOpen: true, pendingOffer: offer })
      } else {
        // 处理积分支付
        await marketplaceApi.payWithPointsOffer(offer.listingId, offer.offerreference)
        toastSuccess('Payment successful!')
        // 刷新数据
        fetchAcceptedOffers('point')
      }
    } catch (error) {
      console.error('Payment failed:', error)
      toast.error('Payment failed, please try again')
    }
  }

  // 处理地址选择后的支付
  const handleAddressSelected = async (addressId: string) => {
    const offer = selectAddressModal.pendingOffer
    if (!offer) return

    // Close address modal
    setSelectAddressModal({ isOpen: false, pendingOffer: null })

    // Find the listing data for the offer
    const listingData = acceptedCashOffers.find(o => o.offerreference === offer.offerreference)
    
    // Open payment modal with the necessary data
    setPaymentModal({
      isOpen: true,
      listing: {
        id: offer.listingId,
        card_name: listingData?.card_reference || 'Card',
        image_url: offer.image_url,
        priceCash: offer.amount
      },
      offer: {
        offerreference: offer.offerreference,
        amount: offer.amount
      },
      buyerAddressId: addressId
    })
  }


  const getCurrentCards = () => {
    switch (currentView) {
      case 'offer_make':
        // Return cards based on the sub-tab selection
        return offerMakeSubTab === 'cash' 
          ? (Array.isArray(offerMakeCards) ? offerMakeCards : [])
          : (Array.isArray(pointOffersMade) ? pointOffersMade : [])
      case 'offer_to_buy':
        // Return cards based on the sub-tab selection for accepted offers
        return acceptedOfferSubTab === 'cash'
          ? (Array.isArray(acceptedCashOffers) ? acceptedCashOffers : [])
          : (Array.isArray(acceptedPointOffers) ? acceptedPointOffers : [])
      default:
        return Array.isArray(listedCards) ? listedCards : []
    }
  }

  const cards = getCurrentCards()

  // Visible count for infinite scrolling on listed view
  const [visibleListedCount, setVisibleListedCount] = useState(40)
  const loadMoreRef = useState<HTMLDivElement | null>(null)[0] as unknown as React.MutableRefObject<HTMLDivElement | null>
  const [sentinelEl, setSentinelEl] = useState<HTMLDivElement | null>(null)

  // Reset visible count when inputs change (listed view only)
  useEffect(() => {
    if (currentView === 'listed') {
      setVisibleListedCount(40)
    }
  }, [searchQuery, sortBy, filterType, currentView])

  // Infinite scroll observer (listed view only)
  useEffect(() => {
    if (currentView !== 'listed') return
    if (!sentinelEl) return
    const observer = new IntersectionObserver((entries) => {
      const e = entries[0]
      if (e.isIntersecting) {
        setVisibleListedCount((prev) => prev + 40)
      }
    }, { root: null, rootMargin: '200px', threshold: 0 })
    observer.observe(sentinelEl)
    return () => observer.disconnect()
  }, [sentinelEl, currentView])

  // Filter and sort cards
  const getFilteredAndSortedCards = () => {
    // Ensure cards is always an array
    let filteredCards = Array.isArray(cards) ? cards : []
    
    // Filter by search query
    if (searchQuery && currentView === 'listed') {
      filteredCards = filteredCards.filter(card => 
        'card_name' in card && card.card_name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Filter out accepted offers in offer_make view
    if (currentView === 'offer_make') {
      filteredCards = filteredCards.filter(card => {
        // Check if it's an OfferCard and filter out accepted offers
        if ('status' in card) {
          return card.status !== 'accepted'
        }
        return true
      })
    }
    
    // Show only accepted offers in offer_to_buy view (now "Accepted offer")
    if (currentView === 'offer_to_buy') {
      filteredCards = filteredCards.filter(card => {
        // Check if it's an OfferCard and show only accepted offers
        if ('status' in card) {
          return card.status === 'accepted'
        }
        return false
      })
    }
    
    // Sort cards
    if (currentView === 'listed') {
      filteredCards.sort((a, b) => {
        if (!('priceCash' in a) || !('priceCash' in b)) return 0
        
        switch (sortBy) {
          case 'Most Expensive':
            return b.priceCash - a.priceCash
          case 'Least Expensive':
            return a.priceCash - b.priceCash
          case 'Newest':
            return new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime()
          case 'Oldest':
            return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
          default:
            return 0
        }
      })
    } else if (currentView === 'offer_make' || currentView === 'offer_to_buy') {
      // Sort offers by date (at field) - newest first
      filteredCards.sort((a, b) => {
        if ('at' in a && 'at' in b) {
          return new Date(b.at).getTime() - new Date(a.at).getTime()
        }
        return 0
      })
    }
    
    return filteredCards
  }

  // API操作函数
  const deleteListing = async (listingId: string) => {
    if (!userId) return
    
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${apiBaseUrl}/marketplace/listings/${listingId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      })
      if (response.ok) {
        // Optimistically remove from UI
        setListedCards((prev) => prev.filter((l) => l.id !== listingId))
        // Close detail modal if it was open for this listing
        if (listingDetailModal.isOpen && listingDetailModal.listing?.id === listingId) {
          setListingDetailModal({ isOpen: false, listing: null })
        }
        toastSuccess('Listing withdrawn')
        // Revalidate after a short delay to avoid eventual consistency showing the item again
        setTimeout(() => {
          fetchUserListings().catch(() => undefined)
        }, 800)
      } else {
        console.error('Failed to withdraw listing')
        toast.error('Failed to withdraw listing')
      }
    } catch (error) {
      console.error('Failed to withdraw listing:', error)
      toast.error('Network error, please try again')
    }
  }

  const acceptOffer = async (listingId: string, offerType: 'cash' | 'points') => {
    if (!userId) return
    
    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      const response = await fetch(`${apiBaseUrl}/marketplace/listings/${listingId}/accept`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          offer_type: offerType
        })
      })
      if (response.ok) {
        await fetchUserListings()
      } else {
        console.error('接受报价失败')
      }
    } catch (error) {
      console.error('接受报价失败:', error)
    }
  }

  return (
    <div className="space-y-6">
      {/* 用户导航组件 */}
      <UserNavigation />

      {/* 搜索筛选行 */}
      <div className="bg-[#1A1B2E] p-4 rounded-lg">
        {/* 移动端：分行布局 */}
        <div className="md:hidden space-y-3">
          {/* 第一行：视图选择（无标签，仅紫色下拉） */}
          <div>
            <CustomDropdown
              value={currentView}
              onChange={setCurrentView}
              options={[
                { id: 'listed', name: 'Listing' },
                { id: 'offer_make', name: 'Offer made' },
                { id: 'offer_to_buy', name: 'Pending payment' }
              ]}
              className="w-full bg-[#8B5CF6] text-white"
            />
          </div>
        </div>
        
        {/* 桌面端：原有布局 */}
        <div className="hidden md:flex items-center justify-between">
          {/* 左侧：筛选和搜索 */}
          <div className="flex items-center space-x-4">
            {currentView === 'listed' && (
              <>
                <span className="text-white text-sm">Filter:</span>
                <CustomDropdown
                  value={filterType}
                  onChange={setFilterType}
                  options={[
                    { id: 'all', name: 'All Listings' },
                    { id: 'has_offers', name: 'Has Offers' },
                    { id: 'accepted', name: 'Accepted Offers' }
                  ]}
                  className="w-44"
                />
              </>
            )}
            
            <span className="text-white text-sm">Sort by:</span>
            <CustomDropdown
              value={sortBy}
              onChange={setSortBy}
              options={[
                { id: 'Most Expensive', name: 'Most Expensive' },
                { id: 'Newest', name: 'Newest' },
                { id: 'Oldest', name: 'Oldest' },
                { id: 'Least Expensive', name: 'Least Expensive' }
              ]}
              className="w-44"
            />
            
            <div className="flex items-center space-x-2">
              {currentView === 'listed' && (
                <>
                  <input
                    type="text"
                    placeholder="Search by card name"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-4 py-2 bg-[#2A2B3D] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-sm w-64"
                  />
                  
                  <button className="p-2 bg-[#2A2B3D] text-white rounded hover:bg-[#3F3F5F] transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
          
          {/* 右侧：功能按钮 */}
          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentView('listed')}
              className={`px-4 py-2 ${currentView === 'listed' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <span>📋</span>
              <span>Listing</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentView('offer_make')}
              className={`px-4 py-2 ${currentView === 'offer_make' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <span>💰</span>
              <span>offer made</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setCurrentView('offer_to_buy')}
              className={`px-4 py-2 ${currentView === 'offer_to_buy' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <span>✅</span>
              <span>Pending payment</span>
            </motion.button>
          </div>
        </div>
        
        {/* 移动端：筛选和排序（交换位置至此） */}
        <div className="md:hidden">
          <div className="flex flex-col space-y-2">
            {currentView === 'listed' && (
              <div className="flex items-center space-x-2">
                <span className="w-16 shrink-0 text-white text-sm whitespace-nowrap">Filter:</span>
                <CustomDropdown
                  value={filterType}
                  onChange={setFilterType}
                  options={[
                    { id: 'all', name: 'All Listings' },
                    { id: 'has_offers', name: 'Has Offers' },
                    { id: 'accepted', name: 'Accepted Offers' }
                  ]}
                  className="flex-1 min-w-0"
                />
              </div>
            )}
            <div className="flex items-center space-x-2">
              <span className="w-16 shrink-0 text-white text-sm whitespace-nowrap">Sort:</span>
              <CustomDropdown
                value={sortBy}
                onChange={setSortBy}
                options={[
                  { id: 'Most Expensive', name: 'Most Expensive' },
                  { id: 'Newest', name: 'Newest' },
                  { id: 'Oldest', name: 'Oldest' },
                  { id: 'Least Expensive', name: 'Least Expensive' }
                ]}
                className="flex-1 min-w-0"
              />
            </div>

            {/* 移动端：搜索框移动到底部 */}
            {currentView === 'listed' && (
              <div className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder="Search by card name"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1 px-4 py-2 bg-[#2A2B3D] text-white rounded focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] text-sm"
                />
                <button className="p-2 bg-[#2A2B3D] text-white rounded hover:bg-[#3F3F5F] transition-colors min-w-[44px] h-[44px] flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 标题 */}
      <div className="mb-6 text-center">
        <h1 
          className="text-3xl font-bold"
          style={{
            background: 'linear-gradient(89deg, #BDA9FF 0%, #F4F1FF 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            fontSize: '32px'
          }}
        >
          {currentView === 'listed' && 'Listing'}
          {currentView === 'offer_make' && 'offer made'}
          {currentView === 'offer_to_buy' && 'Pending payment'}
        </h1>
      </div>

      {/* Sub-tabs for offer make view */}
      {currentView === 'offer_make' && (
        <div className="mb-6">
          {/* 移动端：垂直布局 */}
          <div className="md:hidden flex flex-col space-y-2 px-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setOfferMakeSubTab('cash')}
              className={`w-full px-4 py-3 ${offerMakeSubTab === 'cash' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-lg hover:bg-[#7C3AED] transition-colors text-sm flex items-center justify-center space-x-2 min-h-[44px]`}
            >
              <span>💵</span>
              <span>Cash Offers</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setOfferMakeSubTab('points')}
              className={`w-full px-4 py-3 ${offerMakeSubTab === 'points' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-lg hover:bg-[#7C3AED] transition-colors text-sm flex items-center justify-center space-x-2 min-h-[44px]`}
            >
              <img src="/marketplace/coin.png" alt="Points" className="w-4 h-4" />
              <span>Points Offers</span>
            </motion.button>
          </div>
          
          {/* 桌面端：水平布局 */}
          <div className="hidden md:flex justify-center space-x-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setOfferMakeSubTab('cash')}
              className={`px-6 py-2 ${offerMakeSubTab === 'cash' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <span>💵</span>
              <span>Cash Offers</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setOfferMakeSubTab('points')}
              className={`px-6 py-2 ${offerMakeSubTab === 'points' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <img src="/marketplace/coin.png" alt="Points" className="w-4 h-4" />
              <span>Points Offers</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* Sub-tabs for accepted offers view */}
      {currentView === 'offer_to_buy' && (
        <div className="mb-6">
          {/* 移动端：垂直布局 */}
          <div className="md:hidden flex flex-col space-y-2 px-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAcceptedOfferSubTab('cash')}
              className={`w-full px-4 py-3 ${acceptedOfferSubTab === 'cash' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-lg hover:bg-[#7C3AED] transition-colors text-sm flex items-center justify-center space-x-2 min-h-[44px]`}
            >
              <span>💵</span>
              <span>Cash Offers</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAcceptedOfferSubTab('points')}
              className={`w-full px-4 py-3 ${acceptedOfferSubTab === 'points' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-lg hover:bg-[#7C3AED] transition-colors text-sm flex items-center justify-center space-x-2 min-h-[44px]`}
            >
              <img src="/marketplace/coin.png" alt="Points" className="w-4 h-4" />
              <span>Points Offers</span>
            </motion.button>
          </div>
          
          {/* 桌面端：水平布局 */}
          <div className="hidden md:flex justify-center space-x-4">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAcceptedOfferSubTab('cash')}
              className={`px-6 py-2 ${acceptedOfferSubTab === 'cash' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <span>💵</span>
              <span>Cash Offers</span>
            </motion.button>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setAcceptedOfferSubTab('points')}
              className={`px-6 py-2 ${acceptedOfferSubTab === 'points' ? 'bg-[#8B5CF6]' : 'bg-[#2A2B3D]'} text-white rounded-full hover:bg-[#7C3AED] transition-colors text-sm flex items-center space-x-2`}
            >
              <img src="/marketplace/coin.png" alt="Points" className="w-4 h-4" />
              <span>Points Offers</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* 加载状态 */}
      {loading && (
        <div className="flex justify-center items-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#8B5CF6]"></div>
          <span className="ml-2 text-white">Loading...</span>
        </div>
      )}

      {/* 卡片网格 */}
      {!loading && getFilteredAndSortedCards().length === 0 ? (
        <div className="text-center py-16">
          <p className="text-gray-400 text-lg mb-4">
            {currentView === 'listed' && 'You have no listings'}
            {currentView === 'offer_make' && 'You have not made any offers'}
            {currentView === 'offer_to_buy' && 'You have no offers to buy'}
          </p>
          <p className="text-gray-500 text-sm">
            {currentView === 'listed' && 'List cards for sale from your inventory'}
            {currentView === 'offer_make' && 'Make offers on cards in the marketplace'}
            {currentView === 'offer_to_buy' && 'Browse the marketplace to find cards'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
          {getFilteredAndSortedCards().slice(0, currentView === 'listed' ? visibleListedCount : undefined).map((card, index) => {
          const cardId = 'id' in card ? card.id : card.offerreference
          return (
            <motion.div
              key={cardId}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => {
                if (currentView === 'listed' && 'card_name' in card) {
                  handleViewListingDetail(card as ListedCard)
                } else if (currentView === 'offer_make' && 'offerreference' in card) {
                  handleViewOfferCardDetail(card as OfferCard)
                }
              }}
              className="relative bg-[#2A2B3D] p-2 rounded-lg border border-[#4A4B5D] hover:border-[#8B5CF6] transition-all duration-200 cursor-pointer group"
            >
              <div className="aspect-[3/4] bg-gradient-to-b from-[#4A4B5D] to-[#3F3F5F] rounded-md overflow-hidden mb-2 relative shadow-lg">
                <img
                  src={card.image_url || '/cards/card1.jpg'}
                  alt={'card_name' in card ? card.card_name : card.card_reference}
                  loading="lazy"
                  className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </div>
              
              {/* Card details based on view type */}
              {currentView === 'listed' && 'card_name' in card && (
                <>
                  <div>
                    <div className="text-center mb-3 sm:mb-2">
                      <h3 className="text-white text-sm sm:text-xs font-medium truncate px-1">{card.card_name}</h3>
                    </div>
                    
                    {/* Highest offers display */}
                    <div className="space-y-2 sm:space-y-1 mb-3 sm:mb-2">
                      {/* Show cash offer if listing has cash price */}
                      {card.priceCash > 0 && (
                        <div className="flex justify-between items-center px-1">
                          <div className="text-gray-400 text-xs sm:text-[10px]">Cash:</div>
                          <div className="text-green-400 font-bold text-sm sm:text-xs">
                            {card.highestOfferCash && card.highestOfferCash.amount > 0 
                              ? `$${card.highestOfferCash.amount}` 
                              : 'No offer'}
                          </div>
                        </div>
                      )}
                      
                      {/* Show points offer if listing has points price */}
                      {card.pricePoints > 0 && (
                        <div className="flex justify-between items-center px-1">
                          <div className="text-gray-400 text-xs sm:text-[10px]">Points:</div>
                          <div className="text-yellow-400 font-bold text-sm sm:text-xs flex items-center gap-0.5">
                            {card.highestOfferPoints && card.highestOfferPoints.amount > 0 ? (
                              <>
                                <img src="/marketplace/coin.png" alt="Points" className="w-3 sm:w-2.5 h-3 sm:h-2.5" />
                                {card.highestOfferPoints.amount}
                              </>
                            ) : (
                              'No offer'
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteListing(cardId)
                      }}
                      className="w-full py-2 sm:py-1.5 bg-[#FF4444] text-white rounded text-sm sm:text-xs hover:bg-[#CC0000] transition-colors flex items-center justify-center"
                    >
                      <span className="mr-1 text-xs sm:text-[10px]">❌</span>
                      Withdraw
                    </button>
                  </div>
                </>
              )}
              
              {/* Offer views display */}
              {(currentView === 'offer_make' || currentView === 'offer_to_buy') && 'offerreference' in card && (
                <>
                  <div className="text-center mb-3 sm:mb-2">
                    <h3 className="text-white text-sm sm:text-xs font-medium truncate px-1">{card.card_reference}</h3>
                  </div>
                  
                  {/* Offer amount */}
                  <div className="text-center mb-3 sm:mb-2">
                    <div className="text-gray-400 text-xs sm:text-[10px] mb-1">Your Offer</div>
                    {(currentView === 'offer_make' ? offerMakeSubTab === 'cash' : acceptedOfferSubTab === 'cash') ? (
                      <div className="text-green-400 font-bold text-base sm:text-sm">${card.amount}</div>
                    ) : (
                      <div className="text-yellow-400 font-bold text-base sm:text-sm flex items-center justify-center gap-0.5">
                        <img src="/marketplace/coin.png" alt="Points" className="w-4 sm:w-3 h-4 sm:h-3" />
                        {card.amount}
                      </div>
                    )}
                  </div>
                  
                  {/* Status badge */}
                  {card.status === 'accepted' && (
                    <div className="bg-green-500/20 rounded px-2 sm:px-1 py-1 sm:py-0.5 mb-2 sm:mb-1 text-center">
                      <span className="text-green-400 text-xs sm:text-[10px] font-medium">Accepted</span>
                    </div>
                  )}
                </>
              )}

              {/* Offer make 视图 */}
              {currentView === 'offer_make' && (
                <>
                  
                  <div className="flex flex-col space-y-2 sm:space-y-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleEditOffer({
                          ...(card as OfferCard),
                          type: offerMakeSubTab // Use the current sub-tab type
                        })
                      }}
                      className="w-full py-2 sm:py-1 bg-[#8B5CF6] text-white rounded text-sm sm:text-[10px] hover:bg-[#7C3AED] transition-colors flex items-center justify-center"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDeleteOffer({
                          ...(card as OfferCard),
                          type: offerMakeSubTab // Use the current sub-tab type
                        })
                      }}
                      className="w-full py-2 sm:py-1 bg-[#3F3F5F] text-white rounded text-sm sm:text-[10px] hover:bg-[#4F4F6F] transition-colors flex items-center justify-center"
                    >
                      Cancel
                    </button>
                  </div>
                </>
              )}

              {/* Offer to buy 视图 - 已接受的报价 */}
              {currentView === 'offer_to_buy' && (
                <>
                  
                  <div className="flex flex-col space-y-2 sm:space-y-1">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation()
                        handlePayment(card as OfferCard)
                      }}
                      className="w-full py-2 sm:py-2 bg-[#8B5CF6] text-white rounded text-sm hover:bg-[#7C3AED] transition-colors flex items-center justify-center"
                    >
                      Payment
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          )
        })}
          {/* Infinite scroll sentinel (listed view) */}
          {currentView === 'listed' && getFilteredAndSortedCards().length > visibleListedCount && (
            <div ref={setSentinelEl} className="col-span-full flex justify-center py-6">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#8B5CF6]" />
            </div>
          )}
        </div>
      )}

      {/* 编辑出价弹窗 */}
      <EditOfferModal
        isOpen={editOfferModal.isOpen}
        onClose={() => setEditOfferModal({ isOpen: false, offer: null })}
        offer={editOfferModal.offer}
        onSuccess={handleEditOfferSuccess}
      />

      {/* 删除出价弹窗 */}
      <DeleteOfferModal
        isOpen={deleteOfferModal.isOpen}
        onClose={() => setDeleteOfferModal({ isOpen: false, offer: null })}
        offer={deleteOfferModal.offer}
        onSuccess={handleDeleteOfferSuccess}
      />

      {/* 挂售详情弹窗 */}
      <ListingDetailModal
        isOpen={listingDetailModal.isOpen}
        onClose={() => {
          setListingDetailModal({ isOpen: false, listing: null })
          fetchUserListings() // Refresh listings after closing
        }}
        listing={listingDetailModal.listing}
      />

      {/* 报价卡片详情弹窗 */}
      <CardDetailModal
        card={offerCardDetailModal.card}
        isOpen={offerCardDetailModal.isOpen}
        onClose={() => {
          setOfferCardDetailModal({ isOpen: false, card: null, offer: null, listing: null })
        }}
        channel="player"
        listingId={offerCardDetailModal.offer?.listingId}
        userId={userId || undefined}
        isOfferView={true}
        existingOffer={offerCardDetailModal.offer}
        listing={offerCardDetailModal.listing}
      />

      {/* 地址选择弹窗 */}
      <SelectAddressModal
        isOpen={selectAddressModal.isOpen}
        onClose={() => setSelectAddressModal({ isOpen: false, pendingOffer: null })}
        onSelect={handleAddressSelected}
      />

      {/* 支付弹窗 */}
      <MarketplacePaymentModal
        isOpen={paymentModal.isOpen}
        onClose={() => setPaymentModal({ 
          isOpen: false, 
          listing: null, 
          offer: null,
          buyerAddressId: ''
        })}
        listing={paymentModal.listing}
        offer={paymentModal.offer}
        buyerAddressId={paymentModal.buyerAddressId}
        onSuccess={() => {
          setPaymentModal({ 
            isOpen: false, 
            listing: null, 
            offer: null,
            buyerAddressId: ''
          })
          // Refresh accepted offers
          fetchAcceptedOffers('cash')
          fetchAcceptedOffers('point')
        }}
      />

    </div>
  )
}