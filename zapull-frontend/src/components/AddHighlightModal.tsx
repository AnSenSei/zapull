'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { userApi, UserCard, UserCardsResponse } from '@/lib/userApi'
import { packsApi, CollectionMetadata } from '@/lib/packsApi'
import { auth } from '@/lib/firebase'
import CustomDropdown from './CustomDropdown'
import SimpleCardDetailModal from '@/components/SimpleCardDetailModal'

interface AddHighlightModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AddHighlightModal({ isOpen, onClose, onSuccess }: AddHighlightModalProps) {
  const [collections, setCollections] = useState<CollectionMetadata[]>([])
  const [selectedCollection, setSelectedCollection] = useState<string>('pokemon')
  const [userCards, setUserCards] = useState<UserCard[]>([])
  const [allCardsRaw, setAllCardsRaw] = useState<UserCard[]>([])
  const [loading, setLoading] = useState(false)
  const [cardsLoading, setCardsLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'price' | 'date_got'>('price')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [selectedCard, setSelectedCard] = useState<UserCard | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

  // Get card collections
  const fetchCollections = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await packsApi.getCollectionMetadata()
      setCollections(response)
      
      // Default to pokemon collection
      const pokemonCollection = response.find(c => c.id === 'pokemon')
      if (pokemonCollection) {
        setSelectedCollection('pokemon')
      } else if (response.length > 0) {
        // If no pokemon, select first collection
        const firstCollection = response[0].id
        setSelectedCollection(firstCollection)
      }
    } catch (error) {
      console.error('Failed to fetch collections:', error)
      setError('Failed to fetch collections, please try again later')
    } finally {
      setLoading(false)
    }
  }

  // Helper: apply frontend search + sort to raw list
  const applyFiltersAndSort = (source: UserCard[]) => {
    // search by card_name (case-insensitive)
    const filtered = searchQuery
      ? source.filter(c => (c.card_name || '').toLowerCase().includes(searchQuery.toLowerCase()))
      : source

    // sort
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === 'price') {
        return (b.point_worth || 0) - (a.point_worth || 0)
      }
      // date_got desc
      const da = new Date(a.date_got || 0).getTime()
      const db = new Date(b.date_got || 0).getTime()
      return db - da
    })

    setUserCards(sorted)
  }

  // Get user cards (backend only fetch, no backend search/sort)
  const fetchUserCards = async (isLoadMore = false) => {
    if (!auth.currentUser?.uid || !selectedCollection) return
    
    if (isLoadMore) {
      setLoadingMore(true)
    } else {
      setCardsLoading(true)
    }
    
    try {
      setError('')
      const response = await userApi.getUserCards({
        collection_id: selectedCollection,
        page: isLoadMore ? currentPage + 1 : 1,
        per_page: isLoadMore ? 30 : 200 // Fetch 200 cards initially, then 30 for load more
        // No backend search/sort; do it on frontend
      })
      
      // Merge all subcollection cards and attach subcollection_name for detail fetching
      let allCards = response.subcollections.flatMap(sub => 
        sub.cards.map(card => ({ ...card, subcollection_name: sub.subcollection_name }))
      )
      
      // Update raw list and then apply frontend filters/sort
      if (isLoadMore) {
        setAllCardsRaw(prev => {
          const merged = [...prev, ...allCards]
          applyFiltersAndSort(merged)
          return merged
        })
        setCurrentPage(prev => prev + 1)
      } else {
        setAllCardsRaw(allCards)
        applyFiltersAndSort(allCards)
        setCurrentPage(1)
      }
      
      // Use first subcollection's pagination info
      if (response.subcollections.length > 0) {
        setTotalPages(response.subcollections[0].pagination.total_pages)
      }
    } catch (error) {
      console.error('Failed to fetch user cards:', error)
      setError('Failed to fetch user cards, please try again later')
      if (!isLoadMore) {
        setUserCards([])
      }
    } finally {
      setCardsLoading(false)
      setLoadingMore(false)
    }
  }

  // Select card for preview
  const handleSelectCard = (card: UserCard) => {
    if (highlightedIds.has(card.id)) return
    setSelectedCard(card)
    // Only show detail modal on mobile
    if (window.innerWidth < 640) {
      setShowDetail(true)
    }
  }

  // Confirm add to highlights
  const handleConfirmAdd = async () => {
    if (!auth.currentUser?.uid || !selectedCard) return
    
    try {
      setIsConfirming(true)
      await userApi.addCardToHighlights(selectedCollection, selectedCard.id)
      onSuccess()
      onClose()
      setSelectedCard(null)
    } catch (error) {
      console.error('Failed to add to highlights:', error)
      setError('Failed to add to highlights, please try again later')
    } finally {
      setIsConfirming(false)
    }
  }

  // Get rarity text
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

  // Get rarity color
  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 1: return 'from-gray-400 to-gray-600'
      case 2: return 'from-green-400 to-green-600'
      case 3: return 'from-blue-400 to-blue-600'
      case 4: return 'from-purple-400 to-purple-600'
      case 5: return 'from-yellow-400 to-yellow-600'
      default: return 'from-gray-400 to-gray-600'
    }
  }

  // Handle collection change
  const handleCollectionChange = (collectionId: string) => {
    setSelectedCollection(collectionId)
    setCurrentPage(1)
    setSearchQuery('')
    setUserCards([])
  }

  // Handle search (frontend only)
  const handleSearch = () => {
    setCurrentPage(1)
    applyFiltersAndSort(allCardsRaw)
  }


  useEffect(() => {
    if (isOpen) {
      fetchCollections()
      // Reset state
      setSelectedCard(null)
      setSearchQuery('')
      setCurrentPage(1)
      setError('')
    }
  }, [isOpen])

  useEffect(() => {
    if (selectedCollection && isOpen) {
      fetchUserCards(false)
    }
  }, [selectedCollection, isOpen])

  // Fetch current highlights to disable already highlighted cards
  useEffect(() => {
    const fetchHighlights = async () => {
      try {
        const resp = await userApi.getHighlights({ page: 1, per_page: 200 })
        const ids = new Set<string>((resp.cards || []).map((c: any) => c.id))
        setHighlightedIds(ids)
      } catch (e) {
        console.warn('Unable to fetch highlights list to disable cards', e)
        setHighlightedIds(new Set())
      }
    }
    if (isOpen) {
      fetchHighlights()
    }
  }, [isOpen])

  // Re-apply filters/sort when query or sortBy changes
  useEffect(() => {
    applyFiltersAndSort(allCardsRaw)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, sortBy])

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
        rootMargin: '100px',
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
  }, [loadingMore, currentPage, totalPages, selectedCollection])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 sm:flex sm:items-center sm:justify-center z-50 sm:p-4">
      <div className="bg-gradient-to-br from-[#1A1B2C] to-[#2A2B3D] sm:rounded-[20px] w-full h-full sm:max-w-4xl sm:max-h-[90vh] overflow-hidden sm:border-2 sm:border-[#8868FF]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#3F3F5F]">
          <h2 className="text-lg sm:text-2xl font-bold text-white">EDIT HIGHLIGHTS</h2>
          <button
            onClick={onClose}
            className="cursor-pointer bg-none border-none p-0 text-[20px] text-white"
          >
            <Image src="/icons/close.png" alt="Close" width={24} height={24} />
          </button>
        </div>

        {/* Content area - Mobile optimized with preview on top */}
        <div className="flex flex-col sm:flex-row h-[calc(100vh-80px)] sm:h-[calc(90vh-120px)] overflow-hidden">
          {/* Mobile: Preview at top, Desktop: Preview on left */}
          <div className="w-full sm:w-1/2 sm:max-w-[460px] flex-shrink-0 h-[320px] sm:h-full p-3 sm:p-6 border-b sm:border-b-0 sm:border-r border-[#3F3F5F] flex flex-col items-center sm:items-stretch overflow-y-auto">
            {/* Desktop header */}
            <div className="hidden sm:flex items-center mb-4">
              <div className="w-6 h-6 bg-[#8B5CF6] rounded-full flex items-center justify-center mr-3">
                <span className="text-white text-sm font-bold">✨</span>
              </div>
              <h3 className="text-lg font-semibold text-white">Highlights</h3>
            </div>
            
            {/* Preview card */}
            <div className="bg-[#3F3F5F] rounded-lg p-3 sm:p-4 w-full mx-auto flex items-center justify-center">
              {selectedCard ? (
                <div className="w-[165px] sm:w-[320px] md:w-[360px] relative aspect-[3/4]">
                  {selectedCard.image_url ? (
                    <Image
                      src={selectedCard.image_url}
                      alt={selectedCard.card_name}
                      fill
                      className="object-contain rounded-lg"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 bg-[#4A4B5F] rounded-lg">
                      No Image
                    </div>
                  )}
                  {/* Rarity label removed */}
                </div>
              ) : (
                <div className="w-[165px] sm:w-[320px] md:w-[360px] relative aspect-[3/4] bg-[#4A4B5F] rounded-lg flex flex-col items-center justify-center">
                  <span className="text-2xl sm:text-4xl mb-2 sm:mb-3">🎴</span>
                  <p className="text-gray-400 text-xs sm:text-sm">Select a card to preview</p>
                </div>
              )}
            </div>
            
            {/* Confirm button */}
            <button 
              onClick={handleConfirmAdd}
              disabled={!selectedCard || isConfirming}
              className="w-full mt-3 sm:mt-6 py-2 sm:py-3 bg-[#8B5CF6] text-white rounded-lg font-semibold hover:bg-[#7C3AED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {isConfirming ? 'Adding...' : 'Confirm'}
            </button>
          </div>
          
          {/* Card selection area */}
          <div className="flex-1 sm:w-1/2 p-3 sm:p-6 overflow-y-auto" role="region" aria-label="Select a card to highlight">
            {error && (
              <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg text-red-400">
                {error}
              </div>
            )}

            {/* Collection, search, and sort */}
            <div className="mb-2 sm:mb-3">
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                {loading ? (
                  <div className="w-32 sm:w-48 h-8 bg-[#3F3F5F] rounded-lg animate-pulse flex-shrink-0"></div>
                ) : (
                  <div className="w-28 sm:w-48 flex-shrink-0">
                    <CustomDropdown
                      value={selectedCollection}
                      onChange={handleCollectionChange}
                      options={collections}
                      placeholder="Select Collection"
                      className="w-full"
                    />
                  </div>
                )}

                {/* Search */}
                	<div className="flex-1 min-w-[120px] relative">
                  	<input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search"
                    className="w-full pl-8 pr-2 py-1.5 sm:py-2 bg-[#3F3F5F] text-white rounded-lg border border-[#4F4F6F] focus:border-[#8B5CF6] focus:outline-none text-xs sm:text-sm"
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  	<svg className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    	<path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  	</svg>
                	</div>

                {/* Sort */}
                	<div className="w-32 sm:w-40">
                  	<CustomDropdown
                    value={sortBy}
                    onChange={(id: string) => setSortBy(id as 'price' | 'date_got')}
                    options={[
                      { id: 'price', name: 'Most Expensive' },
                      { id: 'date_got', name: 'Newest' },
                    ] as unknown as CollectionMetadata[]}
                    placeholder="Sort By"
                    className="w-full"
                  />
                	</div>
              </div>
            </div>

            {/* Card grid - Mobile shows 3 columns */}
            <div className="mt-2">
              {cardsLoading ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className="aspect-[3/4] bg-[#3F3F5F] rounded-lg animate-pulse"></div>
                  ))}
                </div>
              ) : userCards.length > 0 ? (
                <div className="grid grid-cols-4 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 sm:gap-4">
                  {userCards.map(card => (
                    <div
                      key={card.id}
                      className={`rounded-md sm:rounded-lg overflow-hidden relative group transition-all duration-200 ${
                        highlightedIds.has(card.id)
                          ? 'bg-[#2A2B3D] saturate-0 opacity-50'
                          : 'bg-[#3F3F5F] hover:transform hover:scale-105'
                      } ${selectedCard?.id === card.id && !highlightedIds.has(card.id) ? 'ring-2 ring-[#8B5CF6]' : ''}`}
                    >
                      <div
                        className={`w-full ${highlightedIds.has(card.id) ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => handleSelectCard(card)}
                        aria-disabled={highlightedIds.has(card.id)}
                      >
                        <div className="aspect-[3/4] relative">
                          {card.image_url ? (
                            <Image src={card.image_url} alt={card.card_name} fill className="object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400">No Image</div>
                          )}
                        </div>
                        <div className="p-1 sm:p-2 hidden md:block">
                          <h4 className="text-white text-xs font-semibold truncate" title={card.card_name}>{card.card_name}</h4>
                          <div className="flex items-center gap-1 mt-1">
                            <img src="/users/coin.png" alt="Coin" className="w-3 h-3" />
                            <span className="text-yellow-400 text-xs font-medium">{(card.point_worth || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                      
                      {highlightedIds.has(card.id) && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white font-semibold pointer-events-none">
                          In Highlights
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-gray-400 text-lg mb-2">No cards found</div>
                  <p className="text-gray-500 text-sm">No cards found in this collection</p>
                </div>
              )}
            </div>

            {/* Infinite Scroll Trigger */}
            {!cardsLoading && currentPage < totalPages && (
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
        </div>
      </div>

      {/* Card Detail Modal */}
      <SimpleCardDetailModal
        card={selectedCard as any}
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        showDeleteButton={false}
      />

      {/* Mobile floating close button */}
      <button
        onClick={onClose}
        aria-label="Close"
        className="sm:hidden fixed bottom-4 right-4 z-[60] w-12 h-12 rounded-full bg-[#8B5CF6] text-white shadow-lg flex items-center justify-center"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  )
}
