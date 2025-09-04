'use client'

import { useState, useEffect, useRef, memo, useMemo } from 'react'
import { createPortal } from 'react-dom'
import Image from 'next/image'
import { lockBodyScroll, unlockBodyScroll } from '@/lib/scrollLock'
import CustomDropdown from './CustomDropdown'

interface PacksFilterPanelProps {
  sortBy: string
  setSortBy: (value: string) => void
  sortOrder: 'asc' | 'desc'
  setSortOrder: (value: 'asc' | 'desc') => void
  searchQuery: string
  setSearchQuery: (value: string) => void
  minPrice: number | null
  setMinPrice: (value: number | null) => void
  maxPrice: number | null
  setMaxPrice: (value: number | null) => void
  onApplyFilters: (searchQuery?: string) => void
  onResetFilters: () => void
}

export default function PacksFilterPanel({
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  searchQuery,
  setSearchQuery,
  minPrice,
  setMinPrice,
  maxPrice,
  setMaxPrice,
  onApplyFilters,
  onResetFilters
}: PacksFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const [hasLocalEdits, setHasLocalEdits] = useState(false)
  const [localMinPrice, setLocalMinPrice] = useState(minPrice?.toString() || '')
  const [localMaxPrice, setLocalMaxPrice] = useState(maxPrice?.toString() || '')

  // Check if mobile
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])
  
  // No body scroll lock: we use anchored panels/popovers that should not block page scroll
  useEffect(() => {
    // Mark panel open on body so outer listeners can throttle/skip expensive work
    if (isOpen) {
      document.body.dataset.panelOpen = 'true'
    } else {
      delete (document.body.dataset as any).panelOpen
    }
    return () => {
      delete (document.body.dataset as any).panelOpen
    }
  }, [isOpen])

  // Update local state when props change (only when panel opens)
  useEffect(() => {
    if (isOpen) {
      setLocalSearchQuery(searchQuery)
      setLocalMinPrice(minPrice?.toString() || '')
      setLocalMaxPrice(maxPrice?.toString() || '')
    }
  }, [isOpen]) // Only sync when panel opens
  
  const handleOpen = () => {
    setLocalSearchQuery(searchQuery)
    setIsOpen(true)
  }

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      try { lockBodyScroll() } catch (e) {}
    } else {
      try { unlockBodyScroll() } catch (e) {}
    }
    return () => {
      try { unlockBodyScroll() } catch (e) {}
    }
  }, [isOpen])

  // No anchoring/repositioning needed for modal

  const handleApply = () => {
    setSearchQuery(localSearchQuery || '')
    const minParsed = localMinPrice ? parseFloat(localMinPrice) : null
    const maxParsed = localMaxPrice ? parseFloat(localMaxPrice) : null
    setMinPrice(isNaN(minParsed as number) ? null : minParsed)
    setMaxPrice(isNaN(maxParsed as number) ? null : maxParsed)
    // Pass the new search query directly to avoid stale closure issue
    onApplyFilters(localSearchQuery || '')
    setHasLocalEdits(false)
    setIsOpen(false)
  }
  
  // Check if there are pending changes (for mobile)
  const hasPendingChanges = isMobile && (
    (localSearchQuery !== (searchQuery || '')) ||
    (localMinPrice !== (minPrice?.toString() || '')) ||
    (localMaxPrice !== (maxPrice?.toString() || ''))
  )

  const handleReset = () => {
    setLocalSearchQuery('')
    setLocalMinPrice('')
    setLocalMaxPrice('')
    setSearchQuery('')
    setMinPrice(null)
    setMaxPrice(null)
    setSortBy('popularity')
    setSortOrder('desc')
    onResetFilters()
    setHasLocalEdits(false)
    setIsOpen(false)
  }

  // Sort options (exclude default so it can't be selected)
  const sortOptions = [
    { value: 'price', label: 'Price' },
    { value: 'win_rate', label: 'Win Rate' },
    { value: 'max_win', label: 'Max Win' },
    { value: 'min_win', label: 'Min Win' }
  ]

  // Count active filters
  const activeFilterCount = [
    searchQuery,
    minPrice !== null,
    maxPrice !== null,
    sortBy !== 'popularity' || sortOrder !== 'desc'
  ].filter(Boolean).length


  return (
    <>
      {/* Filter Button */}
      <button
        ref={filterButtonRef}
        onClick={handleOpen}
        className="relative px-4 py-2 bg-[#2A2B3D] text-white rounded-lg hover:bg-[#3F3F5F] transition-colors focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] flex items-center gap-2"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        <span>Filters</span>
        {activeFilterCount > 0 && (
          <span className="absolute top-0 right-0 w-6 h-6 sm:w-5 sm:h-5 bg-[#8B5CF6] text-white text-[11px] sm:text-xs leading-none rounded-full flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>

      {/* Filter Panel/Modal */}
      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          <div className="fixed inset-0 z-[997] bg-black/50" onClick={() => setIsOpen(false)} />
          <div className="fixed inset-0 z-[998] flex items-start justify-center overflow-y-auto">
            <div className="mt-16 mb-8 w-full max-w-xl bg-[#2A2B3D] border border-[#8B5CF6]/30 rounded-lg shadow-2xl">
              <div className="sticky top-0 bg-[#2A2B3D] p-4 border-b border-[#3F3F5F] flex items-center justify-between sm:backdrop-blur-lg">
                <h3 className="text-lg font-bold text-white">Filter Packs</h3>
                <button
                  onClick={() => setIsOpen(false)}
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
                    Search Packs
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search by pack name..."
                      value={localSearchQuery}
                      onChange={(e) => {
                        setLocalSearchQuery(e.target.value)
                        setHasLocalEdits(true)
                      }}
                      className="w-full pl-10 pr-4 py-2 bg-[#1E1F2E] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] placeholder-gray-500"
                    />
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>

                {/* Price Range Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Price Range
                  </label>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="Min"
                        value={localMinPrice}
                        onChange={(e) => { 
                          setLocalMinPrice(e.target.value)
                          setHasLocalEdits(true)
                        }}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 bg-[#1E1F2E] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] placeholder-gray-500"
                      />
                    </div>
                    <span className="text-gray-400">-</span>
                    <div className="flex-1">
                      <input
                        type="number"
                        inputMode="decimal"
                        placeholder="Max"
                        value={localMaxPrice}
                        onChange={(e) => { 
                          setLocalMaxPrice(e.target.value)
                          setHasLocalEdits(true)
                        }}
                        min="0"
                        step="0.01"
                        className="w-full px-3 py-2 bg-[#1E1F2E] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-[#8B5CF6] placeholder-gray-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Sort Section */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Sort By
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <CustomDropdown
                      value={sortBy}
                      onChange={(val) => {
                        setSortBy(val)
                        if (!isMobile) {
                          onApplyFilters(localSearchQuery || '')
                        }
                      }}
                      options={sortOptions.map(o => ({ id: o.value, name: o.label }))}
                      placeholder="Default"
                      className="w-full"
                    />
                    <CustomDropdown
                      value={sortOrder}
                      onChange={(val) => {
                        setSortOrder(val as 'asc' | 'desc')
                        if (!isMobile) {
                          onApplyFilters(localSearchQuery || '')
                        }
                      }}
                      options={[
                        { id: 'desc', name: 'High to Low' },
                        { id: 'asc', name: 'Low to High' },
                      ]}
                      placeholder={sortBy === 'popularity' ? 'Default order' : 'Choose order'}
                      className="w-full"
                      disabled={sortBy === 'popularity'}
                    />
                  </div>
                </div>

                {/* Quick Color Filters */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Quick Filters
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setLocalMinPrice('0')
                        setLocalMaxPrice('499.99')
                        setHasLocalEdits(true)
                      }}
                      className="px-3 py-1 bg-green-500/20 border border-green-500 text-green-400 text-sm rounded-full hover:bg-green-500/30 transition-colors"
                    >
                      Under 500
                    </button>
                    <button
                      onClick={() => {
                        setLocalMinPrice('500')
                        setLocalMaxPrice('1999.99')
                        setHasLocalEdits(true)
                      }}
                      className="px-3 py-1 bg-blue-500/20 border border-blue-500 text-blue-400 text-sm rounded-full hover:bg-blue-500/30 transition-colors"
                    >
                      500-2000
                    </button>
                    <button
                      onClick={() => {
                        setLocalMinPrice('2000')
                        setLocalMaxPrice('4999.99')
                        setHasLocalEdits(true)
                      }}
                      className="px-3 py-1 bg-purple-500/20 border border-purple-500 text-purple-400 text-sm rounded-full hover:bg-purple-500/30 transition-colors"
                    >
                      2000-5000
                    </button>
                    <button
                      onClick={() => {
                        setLocalMinPrice('5000')
                        setLocalMaxPrice('')
                        setHasLocalEdits(true)
                      }}
                      className="px-3 py-1 bg-orange-500/20 border border-orange-500 text-orange-400 text-sm rounded-full hover:bg-orange-500/30 transition-colors"
                    >
                      5000+
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={handleReset}
                    className="flex-1 px-4 py-2 bg-[#1E1F2E] text-white rounded-lg hover:bg-[#3F3F5F] transition-colors"
                  >
                    Reset All
                  </button>
                  <button
                    onClick={handleApply}
                    className={`flex-1 px-4 py-2 text-white rounded-lg transition-colors ${
                      hasPendingChanges 
                        ? 'bg-[#EC4899] hover:bg-[#DB2777] animate-pulse' 
                        : 'bg-[#8B5CF6] hover:bg-[#7C3AED]'
                    }`}
                  >
                    {hasPendingChanges ? 'Apply Changes' : 'Apply Filters'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  )
}