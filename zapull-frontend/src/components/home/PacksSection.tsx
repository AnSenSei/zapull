'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Pack, packsApi } from '@/lib/packsApi'
import { getPackColorTheme } from '@/lib/packColorUtils'
import { useCollection } from '@/components/layout/Navbar'
import PacksFilterPanel from '@/components/PacksFilterPanel'

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

export default function PacksSection() {
  const { selectedCollectionId, collections, loadingCollections } = useCollection()

  // State for filtering and sorting
  const [sortBy, setSortBy] = useState('popularity')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [minPrice, setMinPrice] = useState<number | null>(null)
  const [maxPrice, setMaxPrice] = useState<number | null>(null)

  // State for packs data
  const [allPacks, setAllPacks] = useState<Pack[]>([])
  const [loadingPacks, setLoadingPacks] = useState(false)
  const [visiblePacksCount, setVisiblePacksCount] = useState(20)
  const loadMoreRef = useRef<HTMLDivElement>(null)

  const fetchPacks = useCallback(async () => {
    if (loadingCollections || !selectedCollectionId || selectedCollectionId === 'undefined') {
      return
    }
    
    try {
      setLoadingPacks(true)
      const packsResponse = await packsApi.getPacksByCollection(selectedCollectionId, {
        page: 1,
        per_page: 1000,
        sort_order: 'desc',
        sort_by: 'popularity'
      })
      
      setAllPacks(packsResponse.packs)
    } catch (error) {
      console.error('Failed to fetch packs list:', error)
    } finally {
      setLoadingPacks(false)
    }
  }, [loadingCollections, selectedCollectionId])

  useEffect(() => {
    fetchPacks()
  }, [fetchPacks])

  const filteredPacks = useMemo(() => {
    let filtered = [...allPacks]
    
    if (searchQuery) {
      filtered = filtered.filter(pack => 
        pack.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    if (minPrice !== null) {
      filtered = filtered.filter(pack => pack.price >= minPrice)
    }
    if (maxPrice !== null) {
      filtered = filtered.filter(pack => pack.price <= maxPrice)
    }
    
    filtered.sort((a, b) => {
      let aVal, bVal
      switch(sortBy) {
        case 'price':
          aVal = a.price || 0
          bVal = b.price || 0
          break
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        default:
          aVal = a.popularity || 0
          bVal = b.popularity || 0
          break
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0
      }
    })
    
    return filtered
  }, [allPacks, minPrice, maxPrice, searchQuery, sortBy, sortOrder])

  const loadMorePacks = useCallback(() => {
    setVisiblePacksCount(prev => Math.min(prev + 20, filteredPacks.length))
  }, [filteredPacks.length])

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMorePacks()
        }
      },
      { rootMargin: '100px' }
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
  }, [loadMorePacks])

  return (
    <section className="space-y-4">
      <PacksFilterPanel 
        sortBy={sortBy}
        setSortBy={setSortBy}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        minPrice={minPrice}
        setMinPrice={setMinPrice}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        onApplyFilters={() => {}}
        onResetFilters={() => {
          setSearchQuery('')
          setMinPrice(null)
          setMaxPrice(null)
        }}
      />

      {loadingPacks ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
          {Array(12).fill(null).map((_, i) => (
            <div key={`pack-skeleton-${i}`} className="bg-[#2A2B3D] rounded-lg overflow-hidden animate-pulse">
              <div className="aspect-square bg-[#3F3F5F]" />
              <div className="p-2">
                <div className="h-4 bg-[#3F3F5F] rounded w-full mb-2" />
                <div className="h-8 bg-[#3F3F5F] rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-4">
          {filteredPacks.slice(0, visiblePacksCount).map((pack) => {
            const colorTheme = getPackColorTheme(pack.price);
            return (
              <Link key={pack.id} href={`/packs/${selectedCollectionId}/${pack.id}`} className="block relative hover:scale-105 transition-transform duration-300">
                <div className={`rounded-lg overflow-hidden ${colorTheme.boxShadow}`}>
                  <div className="aspect-square relative flex items-center justify-center p-4 bg-[#1A1B2E]">
                    {pack.image_url && (
                      <Image 
                        src={optimizeImage(pack.image_url, { width: 240, height: 240, quality: 80 })} 
                        alt={pack.name} 
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                        className="object-contain"
                      />
                    )}
                  </div>
                  <div style={{ background: `linear-gradient(135deg, ${colorTheme.hexColor}60 0%, ${colorTheme.hexColor}80 100%)` }}>
                    <div className="flex items-center justify-center py-2 px-2">
                      <span className="truncate text-center font-bold text-[15px] text-white drop-shadow-lg">{pack.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs px-2 sm:px-3 py-2 gap-1 sm:gap-0">
                      <span className="text-white font-semibold drop-shadow">Max {pack.max_win || '?'}</span>
                      <div className="w-1 sm:w-px h-6 sm:h-8 bg-gradient-to-b from-transparent via-white/70 sm:via-white/50 to-transparent" />
                      <span className="text-green-400 font-semibold drop-shadow">Win {pack.win_rate ? `${pack.win_rate}%` : '?'}</span>
                      <div className="w-1 sm:w-px h-6 sm:h-8 bg-gradient-to-b from-transparent via-white/70 sm:via-white/50 to-transparent" />
                      <span className="text-white font-semibold drop-shadow">Min {pack.min_win || '?'}</span>
                    </div>
                    <div className="w-full py-3 text-white transition-all duration-300 flex items-center justify-center gap-2 border-t border-white/10">
                      <Image 
                        src="/users/coin.png" 
                        alt="Coin" 
                        width={16} 
                        height={16} 
                      />
                      <span className="font-bold text-[16px] drop-shadow">{pack.price ? pack.price.toFixed(2) : 'Free'}</span>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {visiblePacksCount < filteredPacks.length && (
        <div ref={loadMoreRef} className="flex justify-center py-8">
          <div className="flex flex-col items-center gap-2">
            <svg className="animate-spin h-8 w-8 text-purple-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="text-gray-400 text-sm">Loading more packs...</span>
          </div>
        </div>
      )}
    </section>
  )
}
