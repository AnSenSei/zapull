'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { getRecentWinners, Winner } from '@/lib/winnerService'
import { packsApi, Pack } from '@/lib/packsApi'
import { useCollection } from '@/components/layout/Navbar'
import { getPackColorTheme } from '@/lib/packColorUtils';
import PacksFilterPanel from '@/components/PacksFilterPanel'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/authUtils'
import PointsTopUpModal from '@/components/PointsTopUpModal'
import EventBanner from '@/components/home/EventBanner'

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

// Debug logger (enable by setting sessionStorage.setItem('home:debugFilters','1'))
const debugLog = (...args: any[]) => {
  try { if (sessionStorage.getItem('home:debugFilters') === '1') console.log(...args) } catch {}
}

// Helper to get initial filters once on first client render
function getInitialFilters(): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('home:packFilters')
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // debugLog('[home] initial filters from storage:', parsed)
    return parsed
  } catch (e) {
    // debugLog('[home] initial filters parse failed', e)
    return null
  }
}

export default function Home() {
  // Read initial filters from sessionStorage on first client render
const initialFilters = useRef(getInitialFilters());

  const [sortBy, setSortBy] = useState(initialFilters.current?.sortBy || 'popularity');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialFilters.current?.sortOrder === 'asc' || initialFilters.current?.sortOrder === 'desc' ? initialFilters.current.sortOrder : 'desc');
  const [winners, setWinners] = useState<Winner[]>([])  
  const [loading, setLoading] = useState(true)
  const [isSticky, setIsSticky] = useState(false)
  const stickyRef = useRef<HTMLDivElement>(null)
  const [stickyOffset, setStickyOffset] = useState(0)
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState(initialFilters.current?.searchQuery ?? '');
  const [minPrice, setMinPrice] = useState<number | null>(typeof initialFilters.current?.minPrice === 'number' ? initialFilters.current.minPrice : null);
  const [maxPrice, setMaxPrice] = useState<number | null>(typeof initialFilters.current?.maxPrice === 'number' ? initialFilters.current.maxPrice : null);
  const [activeSection, setActiveSection] = useState<string>('feature')
  const [isMobile, setIsMobile] = useState(false)
  const stickyContentRef = useRef<HTMLDivElement>(null)
  const [stickyHeight, setStickyHeight] = useState(0)

  // Utility function to capitalize first letter
  const capitalizeFirst = (str: string | undefined): string => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  // Map collection id to a friendly display name to avoid placeholders like "Unnamed Pack"
  const displayNameForCollection = (id: string | undefined, fallback?: string): string => {
    switch (id) {
      case 'one_piece':
        return 'One Piece'
      case 'pokemon':
        return 'Pokemon'
      case 'magic':
        return 'Magic'
      default:
        return capitalizeFirst(fallback || id || '')
    }
  }
  
  // Add scroll animation styles
  useEffect(() => {
    const styleId = 'scroll-animation-styles'
    
    // Check if styles already exist
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style')
      style.id = styleId
      style.textContent = `
        @keyframes scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-scroll { 
          animation: scroll 60s linear infinite; 
          will-change: transform;
        }
        .animate-scroll:hover { 
          animation-play-state: paused; 
        }
        body[data-panel-open='true'] .animate-scroll {
          animation-play-state: paused !important;
        }
      `
      document.head.appendChild(style)
      
      // Cleanup function to remove styles when component unmounts
      return () => {
        const existingStyle = document.getElementById(styleId)
        if (existingStyle) {
          existingStyle.remove()
        }
      }
    }
  }, [])
  
  // Use collection selection state provided by navbar
  const { selectedCollectionId, collections, loadingCollections } = useCollection()
  const { openRegisterModal } = useAuthStore()
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  
  // Packs list related state
  const [packs, setPacks] = useState<Pack[]>([])
  const [allPacks, setAllPacks] = useState<Pack[]>([]) // Store all fetched packs before filtering
  const [loadingPacks, setLoadingPacks] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  
  // Fetch winners data
  useEffect(() => {
    const fetchWinners = async () => {
      try {
        setLoading(true)
        const winnersData = await getRecentWinners(20)
        setWinners(winnersData)
      } catch (error) {
        console.error('Failed to fetch winners data:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchWinners()
    
    // Set up auto-refresh every minute
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && (document.body as any)?.dataset?.panelOpen === 'true') return
      fetchWinners()
    }, 60000) // 60 seconds = 1 minute
    
    // Clean up timer
    return () => clearInterval(interval)
  }, [])

  // Calculate initial offset and responsive helpers
  useEffect(() => {
    const calculate = () => {
      setIsMobile(window.innerWidth < 768)
      if (stickyRef.current) {
        const rect = stickyRef.current.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const navHeight = window.innerWidth < 768 ? 56 : 64;
        setStickyOffset(rect.top + scrollTop - navHeight);
      }
      if (stickyContentRef.current) {
        setStickyHeight(stickyContentRef.current.offsetHeight)
      }
    };

    const timer = setTimeout(calculate, 100);
    window.addEventListener('resize', calculate, { passive: true })
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', calculate)
    }
  }, []);

  // Listen to scroll events for sticky effect
  useEffect(() => {
    let ticking = false;
    
    const handleScroll = () => {
      // If filter panel is open, skip sticky work entirely
      if (document?.body?.dataset?.panelOpen === 'true') return
      if (!ticking) {
        requestAnimationFrame(() => {
           const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
           // Use more sensitive trigger for mobile
           const isMobile = window.innerWidth < 768;
           const threshold = isMobile ? stickyOffset - 10 : stickyOffset; // Mobile triggers 10px earlier
           const shouldStick = scrollTop >= threshold;
           
           if (shouldStick !== isSticky) {
               setIsSticky(shouldStick);
             }
           ticking = false;
         });
        ticking = true;
      }
    };

    const handleResize = () => {
      // If filter panel is open, skip resize work entirely
      if (document?.body?.dataset?.panelOpen === 'true') return
      // Recalculate offset
      if (stickyRef.current) {
        const rect = stickyRef.current.getBoundingClientRect();
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        const navHeight = window.innerWidth < 768 ? 56 : 64;
        setStickyOffset(rect.top + scrollTop - navHeight);
      }
      handleScroll();
    };

    // Initial check
    handleScroll();
    
    // Add event listeners
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize, { passive: true });
    // Mobile touch scroll support
    window.addEventListener('touchmove', handleScroll, { passive: true });
    // Mobile address bar change support
    window.addEventListener('orientationchange', handleResize, { passive: true });
    // iOS Safari address bar hide/show handling
    if (typeof window !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
      window.addEventListener('touchstart', handleScroll, { passive: true });
      window.addEventListener('touchend', handleScroll, { passive: true });
    }
    
    return () => {
       window.removeEventListener('scroll', handleScroll);
       window.removeEventListener('resize', handleResize);
       window.removeEventListener('touchmove', handleScroll);
       window.removeEventListener('orientationchange', handleResize);
       if (typeof window !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
         window.removeEventListener('touchstart', handleScroll);
         window.removeEventListener('touchend', handleScroll);
       }
     };
  }, [isSticky, stickyOffset]);

  // Dev-only: check ancestors for sticky blockers on mobile (overflow/transform/contain/filter)
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return
    if (!stickyRef.current) return
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (!isMobile) return

    try {
      const offenders: string[] = []
      let el: HTMLElement | null = stickyRef.current
      while (el && el !== document.body) {
        const cs = window.getComputedStyle(el)
        const hasOverflow = cs.overflow !== 'visible' || cs.overflowX !== 'visible' || cs.overflowY !== 'visible'
        const hasTransform = !!cs.transform && cs.transform !== 'none'
        const hasContain = !!cs.contain && cs.contain !== 'none'
        const hasFilter = (!!cs.filter && cs.filter !== 'none') || ((cs as any).backdropFilter && (cs as any).backdropFilter !== 'none')
        if (hasOverflow || hasTransform || hasContain || hasFilter) {
          offenders.push(`${el.tagName.toLowerCase()}#${el.id || '-'}${el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : ''}`)
        }
        el = el.parentElement
      }
      if (offenders.length) {
        // eslint-disable-next-line no-console
        console.warn('[Sticky diagnostics] Potential sticky blockers found (closest first):', offenders)
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[Sticky diagnostics] Failed to inspect ancestors', e)
    }
  }, []);

  // Track active section based on scroll position
  useEffect(() => {
    const sections = ['feature', 'hunt', 'special', 'other']
    const observerOptions = {
      root: null,
      rootMargin: '-20% 0px -70% 0px', // Trigger when section is in upper portion of viewport
      threshold: 0
    }

    const observerCallback = (entries: IntersectionObserverEntry[]) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.id.replace('section-', '')
          setActiveSection(sectionId)
        }
      })
    }

    const observer = new IntersectionObserver(observerCallback, observerOptions)

    // Observe all sections
    sections.forEach(section => {
      const element = document.getElementById(`section-${section}`)
      if (element) {
        observer.observe(element)
      }
    })

    return () => {
      sections.forEach(section => {
        const element = document.getElementById(`section-${section}`)
        if (element) {
          observer.unobserve(element)
        }
      })
    }
  }, [packs]) // Re-run when packs change

  
  // Collection metadata is provided by navbar component, no need to fetch here
  
  // Function to scroll to a specific section
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(`section-${sectionId}`)
    if (element) {
      const yOffset = -128 // Account for sticky header height
      const y = element.getBoundingClientRect().top + window.pageYOffset + yOffset
      window.scrollTo({ top: y, behavior: 'smooth' })
    }
  }
  
  // Fetch packs list
  useEffect(() => {
    const fetchPacks = async () => {
      // Skip fetching packs if no collection is selected or collections still loading
      if (loadingCollections || !selectedCollectionId || selectedCollectionId === 'undefined') {
        return
      }
      
      try {
        setLoadingPacks(true)
        // Fetch ALL packs at once
        const packsResponse = await packsApi.getPacksByCollection(selectedCollectionId, {
          page: 1,
          per_page: 1000, // Get all packs at once
          sort_order: 'desc',
          sort_by: 'popularity'
        })
        
        setAllPacks(packsResponse.packs)
        setCurrentPage(1)
        setTotalPages(1) // Single page since we're getting all
      } catch (error) {
        console.error('Failed to fetch packs list:', error)
      } finally {
        setLoadingPacks(false)
      }
    }

    // Only fetch packs list when selectedCollectionId is valid
    if (!loadingCollections && selectedCollectionId && selectedCollectionId !== 'undefined') {
      fetchPacks()
    }
  }, [loadingCollections, selectedCollectionId]) // Only refetch when collection changes
  
  // Helper to restore filters from sessionStorage
  const restoreFiltersFromStorage = () => {
    try {
      const saved = sessionStorage.getItem('home:packFilters')
      debugLog('[home] restore: raw storage =', saved)
      if (saved) {
        const { searchQuery: s, minPrice: min, maxPrice: max, sortBy: sb, sortOrder: so } = JSON.parse(saved)
        debugLog('[home] restore: parsed =', { s, min, max, sb, so })
        if (typeof s === 'string') setSearchQuery(s)
        if (min === null || typeof min === 'number') setMinPrice(min)
        if (max === null || typeof max === 'number') setMaxPrice(max)
        if (typeof sb === 'string') setSortBy(sb)
        if (so === 'asc' || so === 'desc') setSortOrder(so)
      }
    } catch (e) {
      debugLog('[home] restore: failed to parse storage', e)
    }
  }

  // No-op: initial filters are read synchronously above to avoid race on mount
  useEffect(() => {
    try { sessionStorage.removeItem('home:restore') } catch {}
  }, [])

  // Also restore filters on history navigation or bfcache restore
  useEffect(() => {
const onPopState = () => { debugLog('[home] popstate'); restoreFiltersFromStorage() }
const onPageShow = (e: PageTransitionEvent | any) => {
      debugLog('[home] pageshow', { persisted: (e as any)?.persisted, visibility: document.visibilityState })
      if ((e as any)?.persisted || document.visibilityState === 'visible') {
        restoreFiltersFromStorage()
      }
    }
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow as any)
    return () => {
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow as any)
    }
  }, [])

  // Persist filters to sessionStorage whenever they change
  useEffect(() => {
    try {
      const payload = JSON.stringify({
        searchQuery,
        minPrice,
        maxPrice,
        sortBy,
        sortOrder,
      })
      sessionStorage.setItem('home:packFilters', payload)
      debugLog('[home] persist:', { searchQuery, minPrice, maxPrice, sortBy, sortOrder })
    } catch (e) {
      debugLog('[home] persist: failed', e)
    }
  }, [searchQuery, minPrice, maxPrice, sortBy, sortOrder])

  // Group packs by separation
  const [groupedPacks, setGroupedPacks] = useState<Record<string, Pack[]>>({})
  const [visiblePacksCount, setVisiblePacksCount] = useState(20) // Start by showing 20 packs
  
  // Apply all filters and group by separation
  useEffect(() => {
    let filteredPacks = [...allPacks]
    
    // Apply search filter
    if (searchQuery) {
      filteredPacks = filteredPacks.filter(pack => 
        pack.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }
    
    // Apply price range filter
    if (minPrice !== null) {
      filteredPacks = filteredPacks.filter(pack => pack.price >= minPrice)
    }
    if (maxPrice !== null) {
      filteredPacks = filteredPacks.filter(pack => pack.price <= maxPrice)
    }
    
    // Apply sorting
    filteredPacks.sort((a, b) => {
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
        case 'win_rate':
          aVal = a.win_rate || 0
          bVal = b.win_rate || 0
          break
        case 'max_win':
          aVal = a.max_win || 0
          bVal = b.max_win || 0
          break
        case 'min_win':
          aVal = a.min_win || 0
          bVal = b.min_win || 0
          break
        case 'created_at':
          aVal = a.created_at || ''
          bVal = b.created_at || ''
          break
        case 'popularity':
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
    
    // Group packs by separation field
    const grouped: Record<string, Pack[]> = {
      'hunt': [],
      'feature': [],
      'special': [],
      'other': []
    }
    
    filteredPacks.forEach(pack => {
      const separation = pack.separation || 'other'
      if (!grouped[separation]) {
        grouped[separation] = []
      }
      grouped[separation].push(pack)
    })
    
    setGroupedPacks(grouped)
    setPacks(filteredPacks)
    // Reset visible packs count when filters change
    setVisiblePacksCount(20)
  }, [allPacks, minPrice, maxPrice, searchQuery, sortBy, sortOrder])
  
  // Debounce for search used by infinite scroll fetches
  const [searchDebounce, setSearchDebounce] = useState(searchQuery)
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounce(searchQuery), 300)
    return () => clearTimeout(t)
  }, [searchQuery])

  // Load more packs function - for infinite scroll rendering
  const loadMorePacks = () => {
    setVisiblePacksCount(prev => Math.min(prev + 20, packs.length))
  }
  
// Handle filter apply - now just updates the search query state since filtering is client-side
  const handleApplyFilters = (newSearchQuery?: string) => {
    debugLog('[home] apply filters (search only):', newSearchQuery)
    if (newSearchQuery !== undefined) {
      setSearchQuery(newSearchQuery)
    }
  }
  
  // Handle filter reset
  const handleResetFilters = () => {
    // Reset all filter states
    setSearchQuery('')
    setMinPrice(null)
    setMaxPrice(null)
  }
  

  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (target.isIntersecting && visiblePacksCount < packs.length) {
          loadMorePacks()
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
  }, [visiblePacksCount, packs.length]) // eslint-disable-line react-hooks/exhaustive-deps
  
  return (
    <>
      {/* Points Top Up Modal */}
      <PointsTopUpModal 
        isOpen={isTopUpModalOpen} 
        onClose={() => setIsTopUpModalOpen(false)}
        onSuccess={() => {
          // Optionally refresh user data or show success message
          setIsTopUpModalOpen(false);
        }}
      />
      
      <div className="space-y-4 sm:space-y-6">
      
      {/* Event Banner */}
      <EventBanner isMobile={isMobile} />

      {/* Winners Section */}
      <section className="space-y-2 sm:space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Image 
              src="/home/winner-icon.png" 
              alt="Winners Icon" 
              width={62} 
              height={60} 
              className="object-contain"
            /> 
            <span style={{ background: 'linear-gradient(89deg, #BDA9FF 0%, #F4F1FF 100%)', WebkitTextFillColor: 'transparent', WebkitBackgroundClip: 'text' }}>Winners</span>
          </h2>
          </div>
        <div className="relative overflow-hidden">
          <div className="flex gap-2 sm:gap-4 animate-scroll">
            {loading ? (
              // 加载状态显示骨架屏
              Array(8).fill(null).map((_, i) => (
                <div key={`winner-skeleton-${i}`} className="bg-[#2A2B3D] rounded-lg overflow-hidden animate-pulse flex-shrink-0 w-[100px] sm:w-[120px]">
                  {/* 用户信息部分 */}
                  <div className="flex items-center gap-2 text-white p-2" style={{ fontSize: '12px' }}>
                    <span className="text-[#8B5CF6]">★</span>
                    <span>Loading...</span>
                  </div>
                  
                  {/* 卡片内容 */}
                  <div className="bg-[#1E1F2E] rounded-lg overflow-hidden">
                    {/* 卡片图片 */}
                  <div className="aspect-square bg-[#3F3F5F]"></div>
                    
                    {/* 卡片名称和价格 */}
                    <div className="p-2 text-center bg-[#2B2C4E]">
                      <div className="h-4 bg-[#3F3F5F] rounded w-20 mx-auto"></div>
                      <div className="flex items-center justify-center mt-2">
                        <div className="h-4 w-4 bg-[#3F3F5F] rounded-full mr-1"></div>
                        <div className="h-4 bg-[#3F3F5F] rounded w-12"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : winners.length > 0 ? (
              // 显示获取到的获奖者数据，复制一份用于无缝滚动
              [...winners, ...winners].map((winner, index) => (
                <div key={`${winner.id}-${index}`} className="bg-[#2A2B3D] rounded-lg overflow-hidden flex-shrink-0 w-[100px] sm:w-[120px] hover:transform hover:scale-105 transition-transform duration-200">
                  {/* 用户信息部分 */}
                  <div 
                    className="flex items-center gap-2 text-white p-2 cursor-pointer hover:bg-[#3F3F5F] transition-colors" 
                    style={{ fontSize: '12px' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (winner.userId) {
                        router.push(`/user/${winner.userId}?from=home`);
                      }
                    }}
                  >
                    <span className="text-[#8B5CF6]">★</span>
                    <span className="truncate">{winner.username || 'Unknown'}</span>
                  </div>
                  
                  {/* 卡片内容 */}
                  <div 
                    className="bg-[#1E1F2E] rounded-lg overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (winner.pack_id && winner.pack_collection_id) {
                        router.push(`/packs/${winner.pack_collection_id}/${winner.pack_id}`);
                      }
                    }}
                  >
                    {/* 卡片图片 */}
                    <div className="relative overflow-hidden aspect-square">
                      {winner.imageUrl && (
                        <Image 
                          src={optimizeImage(winner.imageUrl, { width: 120, height: 120, quality: 80 })}
                          alt={typeof winner.itemName === 'object' ? winner.itemName.name : String(winner.itemName)} 
                          fill
                          className="object-contain"
                          sizes="(max-width: 640px) 100px, 120px"
                          loading="lazy"
                        />
                      )}
                    </div>
                    
                    {/* 卡片名称和价格 */}
                    <div className="p-2 text-center bg-[#2B2C4E]">
                      <h3 className="text-white font-medium truncate text-xs">
                        {typeof winner.itemName === 'object' ? winner.itemName.name : String(winner.itemName)}
                      </h3>
                      <div className="flex items-center justify-center text-white font-bold mt-1" style={{ fontSize: '16px' }}>
                        <Image 
                          src="/users/coin.png" 
                          alt="Coin" 
                          width={16} 
                          height={16} 
                          className="mr-1"
                        />
                        {winner.amount.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              // 没有数据时显示提示
              <div className="text-center py-8 text-gray-400 w-full">
                No winners yet
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Packs列表部分 */}
      <section className="space-y-2 sm:space-y-4 overflow-visible">
        {/* 筛选和搜索区域 - 吸顶效果 */}
          {/* Spacer to avoid layout shift when we force fixed on mobile */}
          {isMobile && isSticky && (
            <div style={{ height: stickyHeight }} />
          )}
          <div 
            ref={stickyRef}
            className={`${isMobile && isSticky ? 'fixed inset-x-0 top-14 z-40' : 'sticky top-14 sm:top-16 z-40'} bg-[#1A1B2E]/95 sm:backdrop-blur-lg`}
            style={{
              boxShadow: '0 4px 20px rgba(139, 92, 246, 0.1)'
            }}
          >
            <div className="mx-auto max-w-[1600px] px-2 sm:px-3 md:px-4 lg:px-6 xl:px-8 2xl:px-10">
              <div ref={stickyContentRef} className="py-3 transition-all duration-300">
                <div className="space-y-2">
            {/* Section Navigation Labels */}
            <div className="flex items-center gap-1 sm:gap-2 overflow-x-auto scrollbar-hide">
              {/* Only show labels for sections that have packs */}
              {groupedPacks.feature && groupedPacks.feature.length > 0 && (
                <button
                  onClick={() => scrollToSection('feature')}
                  title="Feature Packs"
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    activeSection === 'feature' 
                      ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/50' 
                      : 'bg-[#2A2B3D] text-gray-400 hover:text-gray-200 border border-gray-600/30'
                  }`}
                >
                  <span className="inline sm:hidden text-lg">⭐</span>
                  <span className="hidden sm:inline">⭐ Feature</span>
                </button>
              )}
              
              {groupedPacks.hunt && groupedPacks.hunt.length > 0 && (
                <button
                  onClick={() => scrollToSection('hunt')}
                  title="Hunt Packs"
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    activeSection === 'hunt' 
                      ? 'bg-orange-500/20 text-orange-400 border border-orange-500/50' 
                      : 'bg-[#2A2B3D] text-gray-400 hover:text-gray-200 border border-gray-600/30'
                  }`}
                >
                  <span className="inline sm:hidden text-lg">🎯</span>
                  <span className="hidden sm:inline">🎯 Hunt</span>
                </button>
              )}
              
              {groupedPacks.special && groupedPacks.special.length > 0 && (
                <button
                  onClick={() => scrollToSection('special')}
                  title="Special Packs"
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    activeSection === 'special' 
                      ? 'bg-purple-500/20 text-purple-400 border border-purple-500/50' 
                      : 'bg-[#2A2B3D] text-gray-400 hover:text-gray-200 border border-gray-600/30'
                  }`}
                >
                  <span className="inline sm:hidden text-lg">💎</span>
                  <span className="hidden sm:inline">💎 Special</span>
                </button>
              )}
              
              {groupedPacks.other && groupedPacks.other.length > 0 && (
                <button
                  onClick={() => scrollToSection('other')}
                  title="Other Packs"
                  className={`px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    activeSection === 'other' 
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/50' 
                      : 'bg-[#2A2B3D] text-gray-400 hover:text-gray-200 border border-gray-600/30'
                  }`}
                >
                  <span className="inline sm:hidden text-lg">📦</span>
                  <span className="hidden sm:inline">📦 Other</span>
                </button>
              )}
              
              {/* Divider - only show if there are sections */}
              {(
                (groupedPacks.feature && groupedPacks.feature.length > 0) ||
                (groupedPacks.hunt && groupedPacks.hunt.length > 0) ||
                (groupedPacks.special && groupedPacks.special.length > 0) ||
                (groupedPacks.other && groupedPacks.other.length > 0)
              ) && (
                <div className="h-5 sm:h-6 w-px bg-gray-600/50 mx-1 sm:mx-2"></div>
              )}
              
              {/* Filter Panel */}
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
                onApplyFilters={handleApplyFilters}
                onResetFilters={handleResetFilters}
              />
            </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-white">
            {loadingCollections ? 'Packs' : (() => {
              const current = collections.find(c => c.id === selectedCollectionId)
              const friendly = displayNameForCollection(current?.id, current?.name)
              // If backend name already ends with "Pack"/"Packs", strip it before appending our plural
              const base = friendly.replace(/\b[Pp]acks?$/,'').trim()
              return `${base} Packs`
            })()}
          </h2>

        </div>
        
        {/* Display packs grouped by separation */}
        {loadingPacks ? (
          // Loading state
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 gap-2 sm:gap-4">
            {Array(6).fill(null).map((_, i) => (
              <div key={`pack-skeleton-${i}`} className="p-4 rounded-[15px] space-y-4 animate-pulse" style={{ background: 'linear-gradient(-3deg, rgba(136,104,255,0.2), rgba(136,104,255,0.1))', borderImage: 'linear-gradient(0deg, #8868FF, #8868FF) 10 10' }}>
                <div className="flex items-center justify-center">
                  <div className="h-4 bg-[#3F3F5F] rounded w-24"></div>
                </div>
                {/* 骨架屏标题下方装饰图标，添加14px上边距 */}
                <div className="flex justify-center mt-[14px]">
                  <Image 
                    src="/home/boxhead-icon.png" 
                    alt="卡包装饰图标" 
                    width={0}
                    height={0}
                    sizes="100vw"
                    className="w-full h-auto object-contain"
                  />
                </div>
                {/* 添加间距 */}
                <div className="mt-4 aspect-square bg-[#3F3F5F] rounded-lg relative p-8">
                  <div className="h-full w-full relative"></div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-[#3F3F5F] rounded w-16"></div>
                  <div className="border-t border-white h-[10px] w-0"></div>
                  <div className="h-3 bg-[#3F3F5F] rounded w-16"></div>
                  <div className="border-t border-white h-[10px] w-0"></div>
                  <div className="h-3 bg-[#3F3F5F] rounded w-16"></div>
                </div>
                <div className="h-8 bg-[#8868FF] rounded-[8px] flex items-center justify-center">
                  <div className="h-4 bg-[#3F3F5F] rounded w-16 mx-auto"></div>
                </div>
              </div>
            ))}
          </div>
        ) : packs.length > 0 ? (
          // Display grouped packs
          <div className="space-y-8">
            {/* Render each separation group */}
            {(() => {
              let packsRendered = 0
              // Order: Feature first, then Hunt, then Special, then Other
              const separationOrder = ['feature', 'hunt', 'special', 'other']
              
              return separationOrder.map(separation => {
                const separationPacks = groupedPacks[separation] || []
                
                // Skip empty groups entirely
                if (separationPacks.length === 0) return null
                
                // Calculate how many packs to show in this section
                const remainingToShow = visiblePacksCount - packsRendered
                const packsToShow = Math.min(separationPacks.length, Math.max(0, remainingToShow))
                packsRendered += packsToShow
                
                // Always render the section container for navigation, even if no packs are visible yet
                // This ensures the scroll targets exist in the DOM
                
                // Define section titles, icons and colors
                const sectionConfig: Record<string, { title: string; icon: string; color: string }> = {
                  'hunt': { 
                    title: 'Hunt Packs',
                    icon: '🎯',  // Target/hunting icon
                    color: 'text-orange-400'
                  },
                  'feature': { 
                    title: 'Feature Packs',
                    icon: '⭐',  // Star for featured
                    color: 'text-yellow-400'
                  },
                  'special': { 
                    title: 'Special Packs',
                    icon: '💎',  // Diamond for special
                    color: 'text-purple-400'
                  },
                  'other': { 
                    title: 'Other Packs',
                    icon: '📦',  // Box for general packs
                    color: 'text-blue-400'
                  }
                }
                
                const config = sectionConfig[separation] || { title: separation, icon: '📦', color: 'text-white' }
                
                return (
                  <div key={separation} id={`section-${separation}`} className="space-y-4 scroll-mt-32">
                    {/* Section header with icon */}
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{config.icon}</span>
                      <h3 className={`text-lg font-bold ${config.color}`}>
                        {config.title}
                      </h3>
                      <span className="text-gray-400 text-sm">
                        ({separationPacks.length} packs)
                      </span>
                    </div>
                    
                    {/* Packs grid for this section - only show if there are packs to display */}
                    {packsToShow > 0 && (
                      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 gap-2 sm:gap-4">
                        {
                        separationPacks.slice(0, packsToShow).map((pack) => {
              const colorTheme = getPackColorTheme(pack.price);
              
              
              
              return (
                <Link key={pack.id} href={`/packs/${selectedCollectionId}/${pack.id}`} className="block relative hover:scale-105 transition-transform duration-300">
                  <div className={`rounded-lg overflow-hidden ${colorTheme.boxShadow}`}>
                    {/* Pack image section with subtle gradient background */}
                    <div className="aspect-square relative flex items-center justify-center p-4 bg-[#1A1B2E]">
                      {pack.image_url && (
                        <Image 
                          src={optimizeImage(pack.image_url, { width: 240, height: 240, quality: 80 })}
                          alt={pack.name} 
                          fill
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16.6vw"
                        />
                      )}
                      {/* Fusion Badge */}
                      {pack.has_fusion_recipes && (
                        <div className="absolute top-2 right-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-full px-3 py-1 shadow-lg z-10">
                          <span className="text-white text-xs font-bold flex items-center gap-1">
                            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            Fusion
                          </span>
                        </div>
                      )}
                      {/* Gradient overlay that flows from bottom to create smooth transition */}
                      <div 
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: `linear-gradient(to top, ${colorTheme.hexColor}80 0%, ${colorTheme.hexColor}40 20%, ${colorTheme.hexColor}20 40%, transparent 70%)` }}
                      ></div>
                    </div>
                    
                    {/* Bottom section: Name + Stats + Price with uniform gradient */}
                    <div style={{ background: `linear-gradient(135deg, ${colorTheme.hexColor}60 0%, ${colorTheme.hexColor}80 100%)` }}>
                      {/* Pack name */}
                      <div className="flex items-center justify-center py-2 px-2">
                        <span className="truncate text-center font-bold text-[15px] text-white drop-shadow-lg">{pack.name}</span>
                      </div>
                      
                      {/* Stats section */}
                      <div className="flex items-center justify-between text-xs px-2 sm:px-3 py-2 gap-1 sm:gap-0">
                        <span className="text-white font-semibold drop-shadow">Max {pack.max_win || '?'}</span>
                        <div className="w-1 sm:w-px h-6 sm:h-8 bg-gradient-to-b from-transparent via-white/70 sm:via-white/50 to-transparent"></div>
                        <span className="text-green-400 font-semibold drop-shadow">Win {pack.win_rate ? `${pack.win_rate}%` : '?'}</span>
                        <div className="w-1 sm:w-px h-6 sm:h-8 bg-gradient-to-b from-transparent via-white/70 sm:via-white/50 to-transparent"></div>
                        <span className="text-white font-semibold drop-shadow">Min {pack.min_win || '?'}</span>
                      </div>
                      
                      {/* Price button - same background as parent, no additional gradient */}
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
                      })
                      }
                    </div>
                    )}
                    
                    {/* Show loading message if section exists but packs aren't visible yet */}
                    {packsToShow === 0 && separationPacks.length > 0 && (
                      <div className="text-center py-8 text-gray-400">
                        <span className="text-sm">Scroll down to load more packs to see this section...</span>
                      </div>
                    )}
                </div>
              )
            })
            })()}
          </div>
        ) : (
          // No data
          <div className="text-center py-8 text-gray-400">
            No packs available
          </div>
        )}
        
        {/* Infinite Scroll Trigger */}
        {visiblePacksCount < packs.length && (
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
      
      {/* Daily Rewards Box - Fixed to lower right corner */}
      <Link href="/events/freedaily-box">
        <Image 
          src="/home/daily_free.png" 
          alt="Daily Free Box" 
          width={160} 
          height={160}
          className="fixed bottom-4 right-4 z-50 cursor-pointer hover:scale-105 transition-transform shadow-xl"
        />
      </Link>
      
      </div>
    </>
  )
}
