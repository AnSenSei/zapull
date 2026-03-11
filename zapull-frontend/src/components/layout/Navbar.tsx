'use client'
import Link from 'next/link'
import Image from 'next/image'
import { useState, useEffect, useRef, createContext, useContext } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated, getCurrentUserId } from '@/lib/authUtils'
import { userApi } from '@/lib/userApi'
import { packsApi, CollectionMetadata } from '@/lib/packsApi'
import { paymentApi } from '@/lib/paymentApi'

import toast from 'react-hot-toast'
import { trackFusionNavigation } from '@/lib/analytics'
import { getImageProps } from '@/lib/image-loader'

// Create a Context to share selected collection globally
export interface CollectionContextType {
  selectedCollectionId: string;
  setSelectedCollectionId: (id: string) => void;
  collections: CollectionMetadata[];
  loadingCollections: boolean;
}

export const CollectionContext = createContext<CollectionContextType | null>(null);

// Custom Hook to get selected collection in other components
export const useCollection = () => {
  const context = useContext(CollectionContext);
  if (!context) {
    throw new Error('useCollection must be used within a CollectionProvider');
  }
  return context;
}

// Split Navbar component into two parts: CollectionProvider and actual navbar
export const CollectionProvider = ({ children }: { children: React.ReactNode }) => {
  const [collections, setCollections] = useState<CollectionMetadata[]>([])
  const [selectedCollectionId, setSelectedCollectionId] = useState<string>('')
  const [loadingCollections, setLoadingCollections] = useState(true)
  const pathname = usePathname()
  
  // Get collection metadata
  useEffect(() => {
    const fetchCollections = async () => {
      try {
        setLoadingCollections(true)
        const collectionsData = await packsApi.getCollectionMetadata()
        setCollections(collectionsData)
        
        // Get URL parameters
        const urlParams = new URLSearchParams(window.location.search)
        const collectionParam = urlParams.get('collection')
        
        // If URL has collection parameter and it's not undefined, set it as selected
        if (collectionParam && collectionParam !== 'undefined') {
          setSelectedCollectionId(collectionParam)
        } 
        // Otherwise, if there's collection data, default to pokemon
        else if (collectionsData.length > 0) {
          const pokemonCollection = collectionsData.find(c => c.id === 'pokemon')
          if (pokemonCollection) {
            setSelectedCollectionId('pokemon')
          } else {
            setSelectedCollectionId(collectionsData[0].id)
          }
        }
      } catch (error) {
        console.error('Failed to get collection metadata:', error)
      } finally {
        setLoadingCollections(false)
      }
    }

    fetchCollections()
  }, [])
  
  // This part has been moved to CollectionProvider component

  // Values provided to Context
  const collectionContextValue = {
    selectedCollectionId,
    setSelectedCollectionId,
    collections,
    loadingCollections
  }
  
  return (
    <CollectionContext.Provider value={collectionContextValue}>
      {children}
    </CollectionContext.Provider>
  )
}

const Navbar = () => {
  const router = useRouter()
  const pathname = usePathname()
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState("/header/collection-1.webp")

  const [isRefreshing, setIsRefreshing] = useState(false)
  const navRef = useRef<HTMLDivElement | null>(null)
  const { openLoginModal, openRegisterModal, userInfo, setUserInfo, authInitialized } = useAuthStore()
  
  // Use CollectionContext
  const { collections, selectedCollectionId, setSelectedCollectionId, loadingCollections } = useCollection()

  // Friendly display name for known collections
  const displayNameForCollection = (id: string, fallback?: string): string => {
    switch (id) {
      case 'one_piece':
        return 'One Piece'
      case 'pokemon':
        return 'Pokemon'
      case 'magic':
        return 'Magic'
      default:
        return (fallback || id || '').charAt(0).toUpperCase() + (fallback || id || '').slice(1)
    }
  }
  
  // Refresh user profile
  const handleRefreshPoints = async () => {
    const userId = getCurrentUserId()
    if (!userId || isRefreshing) return
    
    try {
      setIsRefreshing(true)
      const updatedUserInfo = await userApi.getUserInfo()
      setUserInfo(updatedUserInfo)
    } catch (error) {
      console.error('Failed to refresh user info:', error)
    } finally {
      setIsRefreshing(false)
    }
  }
  
  // Handle Stripe Connect click
  const handleStripeConnect = async () => {
    // Helper to robustly open external URLs, always in new tab/window
    const openExternal = (url: string) => {
      // Always try to open in new tab/window
      const win = window.open(url, '_blank', 'noopener,noreferrer')
      
      // If popup was blocked, show user a message instead of redirecting current page
      if (!win) {
        toast.error('Popup blocked. Please allow popups for this website.')
        // Optionally copy URL to clipboard
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).catch(() => {})
        }
      }
    }

    try {
      // First check Stripe Connect status
      const status = await paymentApi.getStripeConnectStatus()
      
      if (status.status === 'not_connected') {
        // If not connected, create new Stripe Connect account
        const result = await paymentApi.createStripeConnect()
        if (result.onboarding_url) {
          openExternal(result.onboarding_url)
        } else {
          toast.error('No onboarding URL returned from Stripe')
        }
      } else if (status.status === 'incomplete') {
        // If not completed, get onboarding link again
        const result = await paymentApi.createStripeConnect()
        if (result.onboarding_url) {
          openExternal(result.onboarding_url)
        } else {
          toast.error('No onboarding URL returned from Stripe')
        }
      } else {
        // If completed, get dashboard link
        const result = await paymentApi.getStripeDashboardLink()
        if (result.login_url) {
          openExternal(result.login_url)
        } else {
          toast.error('No dashboard URL returned from Stripe')
        }
      }
      
      // Close dropdown menu
      setIsUserMenuOpen(false)
    } catch (error) {
      console.error('Failed to handle Stripe Connect:', error)
      toast.error('Unable to open Stripe Connect, please try again later')
    }
  }
  
  useEffect(() => {
    // Only check login state after auth has been initialized to prevent showing wrong UI on refresh
    if (authInitialized) {
      setIsLoggedIn(isAuthenticated())
    }
    
    // If user is logged in but no user info, try to get user info
    const userId = getCurrentUserId()
    if (userId && !userInfo) {
      handleRefreshPoints()
    }
  }, [userInfo, authInitialized])
  
  // Set icon based on selectedCollectionId
  useEffect(() => {
    if (selectedCollectionId && collections.length > 0) {
      // Map collection ID to specific image
      const getCollectionImage = (collectionId: string) => {
        switch (collectionId) {
          case 'official':
            return '/first_landing_page/logo_vertical.png'
          case 'one_piece':
            return '/header/collection-3.webp'
          case 'pokemon':
            return '/header/collection-2.webp'
          case 'magic':
            return '/header/collection-5.webp'
          case 'yogiho':
            return '/header/collection-1.webp'
          default:
            // For other collections, use index mapping
            const collectionIndex = collections.findIndex(c => c.id === collectionId)
            return collectionIndex !== -1 ? `/header/collection-${collectionIndex + 1}.webp` : '/header/collection-1.webp'
        }
      }
      
      setSelectedCategory(getCollectionImage(selectedCollectionId))
    }
  }, [selectedCollectionId, collections])
  
  // Click outside to close dropdown menus
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (isCategoryMenuOpen && !target.closest('.category-menu-container')) {
        setIsCategoryMenuOpen(false);
      }
      if (isUserMenuOpen && !target.closest('.user-menu-container')) {
        setIsUserMenuOpen(false);
      }
      if (isMenuOpen && !target.closest('.mobile-menu-container') && !target.closest('.mobile-menu-button')) {
        setIsMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCategoryMenuOpen, isUserMenuOpen, isMenuOpen]);

  // When selected collection changes and on homepage, update URL parameters
  useEffect(() => {
    if (selectedCollectionId && pathname === '/') {
      // Update URL parameters without reloading page
      const url = new URL(window.location.href)
      url.searchParams.set('collection', selectedCollectionId)
      window.history.pushState({}, '', url)
    }
  }, [selectedCollectionId, pathname])

  // Set official logo when on official packs page, reset to collection when on home
  useEffect(() => {
    if (pathname === '/official-packs') {
      setSelectedCategory('/first_landing_page/logo_vertical.png')
    } else if (pathname === '/' && collections.length > 0) {
      // When navigating back to home, reset to the current collection from URL or default
      const urlParams = new URLSearchParams(window.location.search)
      const collectionParam = urlParams.get('collection')
      
      let targetCollectionId = ''
      if (collectionParam && collectionParam !== 'undefined') {
        // Set to URL collection parameter
        targetCollectionId = collectionParam
      } else {
        // Reset to default collection (pokemon or first available)
        const pokemonCollection = collections.find(c => c.id === 'pokemon')
        targetCollectionId = pokemonCollection ? 'pokemon' : collections[0].id
      }
      
      // Update both collection ID and icon together
      setSelectedCollectionId(targetCollectionId)
      
      // Update icon based on collection
      const getCollectionImage = (collectionId: string) => {
        switch (collectionId) {
          case 'official':
            return '/first_landing_page/logo_vertical.png'
          case 'one_piece':
            return '/header/collection-3.webp'
          case 'pokemon':
            return '/header/collection-2.webp'
          case 'magic':
            return '/header/collection-5.webp'
          case 'yogiho':
            return '/header/collection-1.webp'
          default:
            // For other collections, use index mapping
            const collectionIndex = collections.findIndex(c => c.id === collectionId)
            return collectionIndex !== -1 ? `/header/collection-${collectionIndex + 1}.webp` : '/header/collection-1.webp'
        }
      }
      
      setSelectedCategory(getCollectionImage(targetCollectionId))
    }
  }, [pathname, collections, setSelectedCollectionId])

  // Measure navbar height and set CSS var and body padding on mobile
  useEffect(() => {
    const updateNavHeight = () => {
      const navEl = navRef.current
      if (!navEl) return
      const h = navEl.offsetHeight
      // Set CSS variable for use in inline styles
      document.documentElement.style.setProperty('--navbar-height-mobile', `${h}px`)
      // Apply body padding only on small screens
      if (window.innerWidth < 768) {
        document.body.style.paddingTop = `${h}px`
      } else {
        document.body.style.paddingTop = ''
      }
    }

    // Initial measure after next paint
    requestAnimationFrame(updateNavHeight)

    // Recalculate on resize and orientation changes
    window.addEventListener('resize', updateNavHeight)
    window.addEventListener('orientationchange', updateNavHeight)

    return () => {
      window.removeEventListener('resize', updateNavHeight)
      window.removeEventListener('orientationchange', updateNavHeight)
    }
  }, [])

  // Lock background scroll when mobile menu is open (mobile only)
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile && isMenuOpen) {
      const prevBody = document.body.style.overflow
      const prevHtml = document.documentElement.style.overflow
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevBody
        document.documentElement.style.overflow = prevHtml
      }
    }
    return
  }, [isMenuOpen])

  // Lock background scroll when user dropdown is open (mobile only). Do not lock for collection dropdown.
  useEffect(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
    if (isMobile && isUserMenuOpen) {
      const prevBody = document.body.style.overflow
      const prevHtml = document.documentElement.style.overflow
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = prevBody
        document.documentElement.style.overflow = prevHtml
      }
    }
    return
  }, [isUserMenuOpen])

  return (
    <>
<nav ref={navRef} className="bg-[#2A2B3D] py-2 border-b border-gray-700 fixed top-0 left-0 right-0 z-[60] md:sticky md:top-0 md:z-50">
        <div className="w-full px-0">
          {/* Centered desktop logo (show only on very large screens 1920px+ to avoid overlap with nav) */}
          <div className="absolute inset-0 hidden min-[1920px]:flex items-center justify-center pointer-events-none">
            <Link href="/" className="pointer-events-auto">
              <img
                src="https://draw.zapull.fun/zapull_logo.jpg"
                alt="Zapull"
                className="h-12 lg:h-14 w-auto"
              />
            </Link>
          </div>
          <div className="flex justify-between items-center px-3 md:px-4">
          {/* Logo and main navigation */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center pl-0 md:hidden">
            <img 
              src="https://draw.zapull.fun/zapull_logo.jpg" 
              alt="Zapull" 
              className="h-8 w-auto"
            />
            </Link>
            
            {/* Collection dropdown menu */}
            <div className="relative ml-2 category-menu-container">
              <button 
                className="flex items-center p-1.5 md:p-2 bg-[#1E1F2E] hover:bg-[#3F3F5F] rounded-md transition-colors"
                onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
              >
                <Image src={selectedCategory} alt="Categories" width={28} height={28} className="w-6 h-6 md:w-7 md:h-7" />
                <svg 
                  className={`w-4 h-4 md:w-5 md:h-5 ml-1 text-gray-400 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`} 
                  fill="none" 
                  stroke="currentColor" 
                  viewBox="0 0 24 24" 
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {/* Shop button - Mobile only */}
              <Link 
                href="/shop" 
                className="md:hidden absolute left-[calc(100%+8px)] top-0 flex flex-col items-center justify-center p-1.5 bg-[#1E1F2E] hover:bg-[#3F3F5F] rounded-md transition-colors group min-w-[50px]"
              >
                <svg className="w-5 h-5 text-gray-300 group-hover:text-white mb-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M7 4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v0H7V4zm0 2V5h10v1h3c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h3zM4 8v11h16V8H4zm6 3h4v2h-4v-2z"/>
                </svg>
                <span className="text-gray-300 group-hover:text-white text-[10px] leading-tight">Shop</span>
              </Link>
              
              {/* Dropdown menu (modal-sized, scrollable) */}
              {isCategoryMenuOpen && (
                <div className="absolute left-0 top-[calc(100%+8px)] w-[56px] bg-[#2A2B3D] border border-purple-500/20 rounded-[10px] shadow-xl overflow-hidden z-[100] max-h-[60vh] overflow-y-auto">
                  <div className="py-0.5 flex flex-col items-center">
                    {/* Generate collection buttons dynamically based on metadata */}
                    {loadingCollections ? (
                      // Loading state
                      <div className="flex justify-center items-center w-full py-4 text-sm text-gray-400">
                        <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      </div>
                    ) : collections.length > 0 ? (
                      // Show Official option first, then collection buttons
                      <>
                        <button 
                          className="flex justify-center items-center w-full py-2 text-sm text-gray-300 hover:bg-purple-500/20 transition-colors relative group"
                          onClick={() => {
                            setIsCategoryMenuOpen(false);
                            router.push('/official-packs');
                          }}
                        >
                          <Image src="/first_landing_page/logo_vertical.png" alt="Official" width={32} height={32} className="w-8 h-8" style={{ height: 'auto' }} />
                          {/* Name shown on hover */}
                          <div className="absolute left-full ml-2 bg-black text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none">
                            Official
                          </div>
                        </button>
                        {collections.map((collection, index) => {
                          // Map collection ID to specific image
                          const getCollectionImage = (collectionId: string) => {
                            switch (collectionId) {
                              case 'one_piece':
                                return '/header/collection-3.webp'
                              case 'pokemon':
                                return '/header/collection-2.webp'
                              case 'magic':
                                return '/header/collection-5.webp'
                              default:
                                // For other collections, use index mapping
                                return `/header/collection-${index + 1}.webp`
                            }
                          }
                          const iconPath = getCollectionImage(collection.id);
                          return (
                            <button 
                              key={collection.id}
                              className="flex justify-center items-center w-full py-2 text-sm text-gray-300 hover:bg-purple-500/20 transition-colors relative group"
                              onClick={() => {
                                setSelectedCategory(iconPath);
                                setSelectedCollectionId(collection.id);
                                setIsCategoryMenuOpen(false);
                                 
                                // If not on homepage, navigate to homepage with selected collection ID
                                if (pathname !== '/') {
                                  router.push(`/?collection=${collection.id}`);
                                }
                                // If on homepage, URL params update is handled by CollectionProvider's useEffect
                              }}
                            >
                              <Image src={iconPath} alt={collection.name} width={24} height={24} className="w-6 h-6" style={{ height: 'auto' }} />
                              {/* Name shown on hover */}
                              <div className="absolute left-full ml-2 bg-black text-white text-xs rounded py-1 px-2 opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap pointer-events-none">
                                {displayNameForCollection(collection.id, collection.name)}
                              </div>
                            </button>
                          )
                        })}
                      </>
                    ) : (
                      // No collection data
                      <div className="flex justify-center items-center w-full py-4 text-sm text-gray-400">
                        No collections
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            {/* Main navigation links - Desktop */}
            <div className="hidden md:flex items-center ml-4 space-x-2">
              <Link href="/" className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors">
                <Image src="/header/home.webp" alt="Home" width={18} height={18} className="w-[18px] h-[18px]" />
              </Link>
              
              {/* Wrap events, official odds, synthesis, marketplace, achievement, rank in a div */}
              <div className="flex items-center mx-4 bg-[rgba(74,62,119,0.2)] rounded-md px-2 space-x-3">
                <Link href="/shop" className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M7 4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v0H7V4zm0 2V5h10v1h3c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h3zM4 8v11h16V8H4zm6 3h4v2h-4v-2z"/>
                  </svg>
                  <span className="ml-1">Shop</span>
                </Link>
                <Link href="/official-packs" className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors">
                  <svg className="w-[18px] h-[18px]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 1l3.09 6.26L22 9l-5 4.87L18.18 21 12 17.77 5.82 21 7 13.87 2 9l6.91-1.74L12 1z"/>
                  </svg>
                  <span className="ml-1">Official Odds</span>
                </Link>
                <Link 
                  href="/synthesis" 
                  className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors"
                  onClick={() => {
                    // Track fusion navigation event
                    trackFusionNavigation('synthesis', 'desktop', userInfo?.id)
                  }}
                >
                  <Image src="/header/synthesis.webp" alt="Fusion" width={18} height={18} className="w-[18px] h-[18px]" />
                  <span className="ml-1">Fusion</span>
                </Link>
                <Link href="/marketplace" className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors">
                  <Image src="/header/Marketplace.webp" alt="Marketplace" width={18} height={18} className="w-[18px] h-[18px]" />
                  <span className="ml-1">Marketplace</span>
                </Link>
                <Link href="/achievements" className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors">
                  <Image src="/header/achievement.webp" alt="Achievement" width={18} height={18} className="w-[18px] h-[18px]" />
                  <span className="ml-1">Achievement</span>
                </Link>
                <Link href="/rank" className="flex items-center px-3 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors">
                  <Image src="/header/rankIcon.webp" alt="Ranking" width={18} height={18} className="w-[18px] h-[18px]" />
                  <span className="ml-1">Ranking</span>
                </Link>
                <Link
                  href="https://discord.gg/9x3YX7DXQj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center px-2 py-2 text-gray-300 hover:text-white border-b-2 border-transparent hover:border-purple-500 transition-colors"
                >
                  <Image src="/payment/gift.png" alt="Gift Code" width={18} height={18} className="w-[18px] h-[18px]" />
                  <span className="ml-1">Gift Code</span>
                </Link>
              </div>
            </div>
          </div>

          {/* Right side features */}
          <div className="flex items-center space-x-4 pr-0">
            {!authInitialized ? (
              // Show loading state during auth initialization to prevent flickering
              <div className="hidden md:flex items-center space-x-2">
                <div className="w-8 h-8 rounded-full bg-gray-700 animate-pulse"></div>
                <div className="w-16 h-4 bg-gray-700 rounded animate-pulse"></div>
              </div>
            ) : isLoggedIn ? (
              // Logged in state - Show user info and balance
              <div className="hidden md:flex items-center space-x-4">
                {/* Balance display and refresh button */}
                <div className="flex items-center space-x-2">
                  {/* Balance display */}
                  <div 
                    className="flex items-center text-yellow-400 bg-[#1E1F2E] px-3 py-1 rounded-full"
                  >
                    <Image src="/marketplace/coin.png" alt="Points" width={16} height={16} className="mr-1" />
                    <span>{userInfo?.pointsBalance || 0.00}</span>
                  </div>
                  
                  {/* Refresh points button */}
                   <button 
                     className={`flex items-center justify-center w-8 h-8 text-gray-400 hover:text-white bg-[#1E1F2E] hover:bg-[#2A2B3D] rounded-full transition-colors ${isRefreshing ? 'cursor-not-allowed opacity-50' : ''}`}
                     onClick={handleRefreshPoints}
                     disabled={isRefreshing}
                     title={isRefreshing ? 'Refreshing...' : 'Refresh user info'}
                   >
                     <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                     </svg>
                   </button>
                </div>
                
                {/* User avatar and dropdown menu */}
                <div className="relative user-menu-container">
                  <button 
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center space-x-2 text-white hover:text-[#8B5CF6] transition-colors"
                  >
                    <div className="flex items-center">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-gray-700 flex items-center justify-center border-2 border-purple-500">
{userInfo?.avatar ? (
                          <Image {...getImageProps(userInfo.avatar)} alt="User" width={32} height={32} className="w-full h-full object-cover" />
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <span className="ml-2">{userInfo?.displayName || 'User'}</span>
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </button>
                  
                  {/* User dropdown menu */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-[calc(100%+6px)] w-40 bg-[#2A2B3D] rounded-md shadow-xl border border-purple-500/20 py-1 z-[100] max-h-[50vh] overflow-y-auto max-[768px]:right-[-1rem] max-[768px]:w-[50vw] max-[768px]:max-w-[260px]">
                      <div className="px-3 py-2 border-b border-gray-600">
                        <p className="text-white font-semibold text-sm">{userInfo?.displayName || 'User'}</p>
                        <p className="text-gray-400 text-xs">{userInfo?.email || 'user@example.com'}</p>
                      </div>
                      
                      <div className="py-2">
                        <Link href="/user" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/setting.png" alt="Profile" width={14} height={14} className="mr-2" />
                          Profile
                        </Link>
                        <Link href="/user/address" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/box.png" alt="Addresses" width={14} height={14} className="mr-2" />
                          Addresses
                        </Link>
                        <Link href="/inventory" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/inventory.png" alt="Inventory" width={14} height={14} className="mr-2" />
                          Inventory
                        </Link>
                        <Link href="/listed" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/listing.png" alt="My Listing" width={14} height={14} className="mr-2" />
                          Listings
                        </Link>
                        <Link href="/user/withdrawals" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/withdrawals.png" alt="Orders" width={14} height={14} className="mr-2" />
                          Orders
                        </Link>
                        <Link href="/user/affiliate" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/affiliate.png" alt="Affiliate" width={14} height={14} className="mr-2" />
                          Affiliate
                        </Link>
                        <Link href="/history" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/history.png" alt="History" width={14} height={14} className="mr-2" />
                          History
                        </Link>
                        <Link href="/support" className="flex items-center px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium" onClick={() => setIsUserMenuOpen(false)}>
                          <Image src="/users/support.png" alt="Support" width={14} height={14} className="mr-2" />
                          Support
                        </Link>
                      </div>
                      
                      <div className="border-t border-gray-600 py-2">
                        <button 
                          onClick={() => {
                            handleStripeConnect();
                            setIsUserMenuOpen(false);
                          }}
                          className="flex items-center w-full text-left px-3 py-1.5 text-sm text-gray-300 hover:bg-[#3F3F5F] hover:text-white transition-all duration-200 font-medium"
                        >
                          <Image src="/payment/stripe.png" alt="Stripe Connect" width={14} height={14} className="mr-2" />
                          Stripe Connect
                        </button>
                        
                        <button 
                          onClick={async () => {
                            const { logout } = useAuthStore.getState();
                            
                            // Sign out from Firebase
                            try {
                              const { signOut } = await import('firebase/auth');
                              const { auth } = await import('@/lib/firebase');
                              await signOut(auth);
                            } catch (error) {
                              console.error('Firebase signout error:', error);
                            }
                            
                            // Clear auth store
                            logout();
                            
                            // Clear all session storage
                            sessionStorage.clear();
                            
                            // Clear specific localStorage items related to auth
                            localStorage.removeItem('auth-storage');
                            
                            setIsUserMenuOpen(false);
                            
                            // Optionally reload the page to ensure clean state
                            window.location.href = '/';
                          }}
                          className="flex items-center w-full text-left px-3 py-1.5 text-sm text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200 font-medium mt-1"
                        >
                          <Image src="/users/out.png" alt="Sign Out" width={14} height={14} className="mr-2" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              // Not logged in - Show login/register buttons
              <div className="hidden md:flex items-center space-x-2">
                <button 
                  onClick={openLoginModal}
                  className="px-4 py-2 text-white hover:text-[#8B5CF6] transition-colors"
                >
                  Sign in
                </button>
                <button 
                  onClick={openRegisterModal}
                  className="px-4 py-2 bg-[#8B5CF6] text-white rounded-md hover:bg-[#7C3AED] transition-colors"
                >
                  Sign Up
                </button>
              </div>
            )}

            {/* Mobile points display and hamburger menu */}
            <div className="md:hidden flex items-center space-x-2">
              {/* Points display for mobile - shown when logged in */}
              {authInitialized && isLoggedIn && (
                <div 
                  className="flex items-center text-yellow-400 bg-[#1E1F2E] px-2 py-1 rounded-full text-sm"
                >
                  <Image src="/marketplace/coin.png" alt="Points" width={12} height={12} className="mr-1" />
                  <span className="font-medium">{userInfo?.pointsBalance || 0.00}</span>
                </div>
              )}
              
              {/* Hamburger menu button */}
              <button 
                className="text-gray-300 hover:text-white focus:outline-none mobile-menu-button" 
                onClick={() => setIsMenuOpen(!isMenuOpen)}
              >
                {isMenuOpen ? (
                  <Image src="/icons/close.png" alt="Close" width={24} height={24} />
                ) : (
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
</nav>
      
      {/* Dropdown modal backdrop for user dropdown only (mobile). Collection dropdown does not lock background. */}
      {isUserMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/40 z-[70] md:hidden"
          onClick={() => { setIsUserMenuOpen(false); }}
        />
      )}

      {/* Mobile menu overlay and panel (mobile only) */}
      {isMenuOpen && (
        <>
          {/* Backdrop below navbar */}
          <div 
            className="fixed left-0 right-0 bg-black/50 md:hidden z-[50]" 
            style={{ top: 'var(--navbar-height-mobile, 56px)', bottom: 0 }}
            onClick={() => setIsMenuOpen(false)}
          />

          {/* Menu panel positioned below navbar */}
          <div 
            className="fixed left-0 right-0 md:hidden z-[55] mobile-menu-container flex justify-center"
            style={{ top: 'var(--navbar-height-mobile, 56px)', bottom: 0 }}
            onClick={() => setIsMenuOpen(false)}
          >
            <div className="h-full w-full overflow-hidden flex justify-center">
              <div className="mt-3 border-t border-gray-700 bg-[#2A2B3D] rounded-lg shadow-lg w-[88vw] max-w-[380px] max-h-[66vh] overflow-y-auto px-2 pb-2"
                   onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col space-y-1 py-2 text-sm">
                  <Link href="/" className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" onClick={() => setIsMenuOpen(false)}>
                    <Image src="/header/home.webp" alt="Home" width={16} height={16} className="w-[16px] h-[16px]" />
                    <span className="ml-2 font-medium">Home</span>
                  </Link>
                  
                  {/* Mobile menu events, official odds, synthesis, marketplace, achievement, rank group */}
                  <div className="bg-[rgba(74,62,119,0.3)] rounded-md py-1 px-1 space-y-1 border border-purple-500/20">
                    <Link href="/shop" className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" onClick={() => setIsMenuOpen(false)}>
                      <svg className="w-[16px] h-[16px]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M7 4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2v0H7V4zm0 2V5h10v1h3c1.1 0 2 .9 2 2v11c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V8c0-1.1.9-2 2-2h3zM4 8v11h16V8H4zm6 3h4v2h-4v-2z"/>
                      </svg>
                      <span className="ml-2 font-medium">Shop</span>
                    </Link>
                    <Link href="/official-packs" className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" onClick={() => setIsMenuOpen(false)}>
                      <svg className="w-[16px] h-[16px]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 1l3.09 6.26L22 9l-5 4.87L18.18 21 12 17.77 5.82 21 7 13.87 2 9l6.91-1.74L12 1z"/>
                      </svg>
                      <span className="ml-2 font-medium">Official Odds</span>
                    </Link>
                    <Link 
                      href="/synthesis" 
                      className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" 
                      onClick={() => {
                        // Track fusion navigation event
                        trackFusionNavigation('synthesis', 'mobile', userInfo?.id)
                        setIsMenuOpen(false)
                      }}
                    >
                      <Image src="/header/synthesis.webp" alt="Fusion" width={16} height={16} className="w-[16px] h-[16px]" />
                      <span className="ml-2 font-medium">Fusion</span>
                    </Link>
                    <Link href="/marketplace" className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/header/Marketplace.webp" alt="Marketplace" width={16} height={16} className="w-[16px] h-[16px]" />
                      <span className="ml-2 font-medium">Marketplace</span>
                    </Link>
                    <Link href="/achievements" className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/header/achievement.webp" alt="Achievement" width={16} height={16} className="w-[16px] h-[16px]" />
                      <span className="ml-2 font-medium">Achievement</span>
                    </Link>
                    <Link href="/rank" className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/header/rankIcon.webp" alt="Ranking" width={16} height={16} className="w-[16px] h-[16px]" />
                      <span className="ml-2 font-medium">Ranking</span>
                    </Link>
                    <Link
                      href="https://discord.gg/9x3YX7DXQj"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-1.5 px-2 rounded-md flex items-center transition-all duration-200"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      <Image src="/payment/gift.png" alt="Gift Code" width={16} height={16} className="w-[16px] h-[16px]" />
                      <span className="ml-2 font-medium">Gift Code</span>
                    </Link>
                  </div>
                </div>
                {!authInitialized ? (
                  // Show loading state during auth initialization
                  <div className="flex flex-col space-y-3 mt-4 p-4 bg-[rgba(74,62,119,0.1)] rounded-lg border border-purple-500/20">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 rounded-full bg-gray-700 animate-pulse"></div>
                      <div className="flex-1">
                        <div className="w-20 h-4 bg-gray-700 rounded animate-pulse mb-1"></div>
                        <div className="w-16 h-3 bg-gray-700 rounded animate-pulse"></div>
                      </div>
                    </div>
                  </div>
                ) : isLoggedIn ? (
                  // Logged in state - Mobile user menu
                  <div className="flex flex-col space-y-2 mt-3 p-3 bg-[rgba(74,62,119,0.1)] rounded-lg border border-purple-500/20 text-sm">
                    <div className="flex items-center justify-between px-2.5 py-2.5 bg-[rgba(74,62,119,0.3)] rounded-md border border-purple-500/30">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center mr-3 border-2 border-purple-400 shadow-lg">
{userInfo?.avatar ? (
                            <Image {...getImageProps(userInfo.avatar)} alt="User" width={40} height={40} className="w-full h-full object-cover" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="text-white font-semibold">{userInfo?.displayName || 'User'}</div>
                          <div className="text-yellow-400 text-sm flex items-center">
                            <div 
                              className="mr-2 flex items-center"
                            >
                              <Image src="/marketplace/coin.png" alt="Points" width={16} height={16} className="mr-1" />
                              <span className="font-medium">{userInfo?.pointsBalance || 0.00}</span>
                            </div>
                            <button 
                              onClick={handleRefreshPoints}
                              disabled={isRefreshing}
                              className="ml-1 p-1 hover:bg-gray-600 rounded-full transition-colors"
                              title="Refresh user info"
                            >
                              <svg 
                                xmlns="http://www.w3.org/2000/svg" 
                                className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} 
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <Link href="/user" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/users/setting.png" alt="Profile" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                      Profile
                    </Link>
                    <Link href="/user/address" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/users/box.png" alt="Addresses" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                      Addresses
                    </Link>
                    <Link href="/inventory" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/users/inventory.png" alt="Inventory" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                      Inventory
                    </Link>
                    <Link href="/listed" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/users/listing.png" alt="My Listing" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                      My Listing
                    </Link>
                    <Link href="/user/withdrawals" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/users/withdrawals.png" alt="Orders" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                      Orders
                    </Link>
                    <Link href="/user/affiliate" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                      <Image src="/users/affiliate.png" alt="Affiliate" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                      Affiliate
                    </Link>
                    
                    <div className="border-t border-gray-600 pt-2 mt-2">
                      <button 
                        onClick={() => {
                          handleStripeConnect();
                          setIsMenuOpen(false);
                        }}
                        className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md w-full text-left transition-all duration-200 font-medium"
                      >
                        <Image src="/payment/stripe.png" alt="Stripe Connect" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                        Stripe Connect
                      </button>
                      <Link href="/history" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                        <Image src="/users/history.png" alt="History" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                        History
                      </Link>
                      <Link href="/support" className="flex items-center px-2.5 py-2 text-gray-300 hover:bg-[#3F3F5F] hover:text-white rounded-md transition-all duration-200 font-medium" onClick={() => setIsMenuOpen(false)}>
                        <Image src="/users/support.png" alt="Support" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                        Support
                      </Link>
                      <button 
                        onClick={async () => {
                          const { logout } = useAuthStore.getState();
                          
                          // Sign out from Firebase
                          try {
                            const { signOut } = await import('firebase/auth');
                            const { auth } = await import('@/lib/firebase');
                            await signOut(auth);
                          } catch (error) {
                            console.error('Firebase signout error:', error);
                          }
                          
                          // Clear auth store
                          logout();
                          
                          // Clear all session storage
                          sessionStorage.clear();
                          
                          // Clear specific localStorage items related to auth
                          localStorage.removeItem('auth-storage');
                          
                          setIsMenuOpen(false);
                          
                          // Optionally reload the page to ensure clean state
                          window.location.href = '/';
                        }}
                        className="flex items-center px-2.5 py-2 text-red-400 hover:bg-red-500/10 hover:text-red-300 rounded-md w-full text-left transition-all duration-200 font-medium mt-2"
                      >
                        <Image src="/users/out.png" alt="Sign Out" width={16} height={16} className="w-[16px] h-[16px] mr-2" />
                        Sign Out
                      </button>
                    </div>
                  </div>
                ) : (
                  // Not logged in - Mobile login/register buttons
                  <div className="flex flex-col space-y-3 mt-4 p-4 bg-[rgba(74,62,119,0.1)] rounded-lg border border-purple-500/20">
                    <button 
                      onClick={() => {
                        openLoginModal();
                        setIsMenuOpen(false);
                      }}
                      className="text-gray-300 hover:text-white hover:bg-[#3F3F5F] py-3 px-4 text-center rounded-md transition-all duration-200 font-medium"
                    >
                      Sign in
                    </button>
                    <button 
                      onClick={() => {
                        openRegisterModal();
                        setIsMenuOpen(false);
                      }}
                      className="bg-gradient-to-r from-[#8B5CF6] to-[#7C3AED] text-white py-3 px-4 rounded-lg hover:from-[#7C3AED] hover:to-[#6D28D9] transition-all duration-200 text-center font-semibold shadow-lg"
                    >
                      Sign Up
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
        
    </>
  )
}

export default Navbar
