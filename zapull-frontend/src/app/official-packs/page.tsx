'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { officialPacksApi, OfficialPack } from '@/lib/officialPacksApi'
import { getPackColorTheme } from '@/lib/packColorUtils'

// Guide Modal Component
function OfficialPackGuideModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  useEffect(() => {
    if (isOpen) {
      // Lock body scroll when modal opens
      document.body.style.overflow = 'hidden'
      document.body.style.position = 'fixed'
      document.body.style.width = '100%'
      document.body.style.height = '100%'
      
      // Add slide animation styles if they don't exist
      const styleId = 'modal-animation-styles'
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style')
        style.id = styleId
        style.textContent = `
          @keyframes slide-up {
            from {
              transform: translateY(100%);
              opacity: 0;
            }
            to {
              transform: translateY(0);
              opacity: 1;
            }
          }
          @keyframes slide-down {
            from {
              transform: translateY(0);
              opacity: 1;
            }
            to {
              transform: translateY(100%);
              opacity: 0;
            }
          }
          .animate-slide-up {
            animation: slide-up 0.3s ease-out;
          }
          .animate-slide-down {
            animation: slide-down 0.3s ease-out;
          }
          @media (min-width: 768px) {
            .animate-slide-up,
            .animate-slide-down {
              animation: none;
            }
          }
        `
        document.head.appendChild(style)
      }
    } else {
      // Unlock body scroll when modal closes
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
    }
    
    // Cleanup function to ensure scroll is unlocked when component unmounts
    return () => {
      document.body.style.overflow = 'unset'
      document.body.style.position = 'unset'
      document.body.style.width = 'unset'
      document.body.style.height = 'unset'
      // Remove animation styles when component unmounts
      const existingStyle = document.getElementById('modal-animation-styles')
      if (existingStyle) {
        existingStyle.remove()
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4 md:p-4"
      onClick={(e) => {
        // Close modal if clicking on backdrop
        if (e.target === e.currentTarget) {
          onClose()
        }
      }}
      onWheel={(e) => e.preventDefault()}
      onTouchMove={(e) => e.preventDefault()}
      style={{ overflow: 'hidden' }}
    >
      <div className={`bg-gradient-to-br from-[#1A1B2E] via-[#2A2B4E] to-[#1A1B2E] rounded-xl max-w-2xl w-full max-h-[70vh] sm:max-h-[85vh] overflow-y-auto border border-purple-500/30 shadow-2xl transition-all duration-300 ease-out ${
        isOpen 
          ? 'md:animate-none animate-slide-up translate-y-0 opacity-100' 
          : 'md:animate-none animate-slide-down translate-y-full opacity-0'
      } md:rounded-xl rounded-t-xl md:mb-0 mb-0 md:mt-0 mt-auto`}>
        <div className="p-4 sm:p-6">
          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-white mb-2">Official Odds Packs Guide</h2>
            <p className="text-gray-300 text-sm">Authentic card experiences with guaranteed value</p>
          </div>

          {/* Key Benefits - Compact Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            <div className="bg-gradient-to-r from-purple-600/20 to-purple-800/20 p-3 rounded-lg border border-purple-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">🎴</span>
                <h3 className="text-sm font-bold text-white">Official Odds</h3>
              </div>
              <p className="text-gray-300 text-xs">Same Pull Rates as Official Packs</p>
            </div>
            
            <div className="bg-gradient-to-r from-green-600/20 to-green-800/20 p-3 rounded-lg border border-green-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">💰</span>
                <h3 className="text-sm font-bold text-white">Lower Price</h3>
              </div>
              <p className="text-gray-300 text-xs">No scalper markups</p>
            </div>
            
            <div className="bg-gradient-to-r from-yellow-600/20 to-yellow-800/20 p-3 rounded-lg border border-yellow-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">⚡</span>
                <h3 className="text-sm font-bold text-white">Instant Buyback</h3>
              </div>
              <p className="text-gray-300 text-xs">Sell cards back instantly</p>
            </div>
            
            <div className="bg-gradient-to-r from-blue-600/20 to-blue-800/20 p-3 rounded-lg border border-blue-500/30">
              <div className="flex items-center mb-2">
                <span className="text-lg mr-2">📦</span>
                <h3 className="text-sm font-bold text-white">Ship to Door</h3>
              </div>
              <p className="text-gray-300 text-xs">Easy physical withdrawal</p>
            </div>
            
          </div>

          {/* Pack Structure */}
          <div className="bg-gradient-to-r from-orange-600/20 to-orange-800/20 p-4 rounded-lg border border-orange-500/30 mb-6">
            <div className="flex items-center mb-3">
              <span className="text-2xl mr-2">📦</span>
              <h3 className="text-lg font-bold text-white">10 Cards per Pack</h3>
            </div>
            
            {/* Exact Slot Structure */}
            <div className="bg-black/30 p-3 rounded-lg">
              <h4 className="text-sm font-bold text-white mb-2">🎯 Exact Slot Configuration:</h4>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-gray-300">Common:</span>
                  </span>
                  <span className="text-green-400 font-semibold">4 slots - even probability</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-gray-300">Uncommon:</span>
                  </span>
                  <span className="text-blue-400 font-semibold">3 slots - even probability</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-gray-300">Reverse Holo:</span>
                  </span>
                  <span className="text-purple-400 font-semibold">2 slots - weighted probability</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="flex items-center gap-1">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-gray-300">Rare+:</span>
                  </span>
                  <span className="text-orange-400 font-semibold">1 slot - guaranteed rare+</span>
                </div>
              </div>
              <div className="mt-3 pt-2 border-t border-gray-600">
                <p className="text-xs text-gray-400">💡 Purple reverse holo probabilities: Common(5), Uncommon(4), Rare(1)</p>
                <p className="text-xs text-gray-400">🎯 Orange slot: 100% total probability for rare and above cards</p>
              </div>
            </div>
          </div>


          {/* Close Button */}
          <div className="text-center">
            <button 
              onClick={onClose}
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white px-6 py-2 rounded-lg font-bold text-sm transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 w-full sm:w-auto"
            >
              Start Opening Packs! 🎴
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function OfficialPacksPage() {
  const router = useRouter()
  const { userInfo } = useAuthStore()
  const [packs, setPacks] = useState<OfficialPack[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    loadOfficialPacks()
    
    // Show guide modal if user hasn't seen it before
    const hasSeenGuide = localStorage.getItem('officialPacksGuideSeen')
    if (!hasSeenGuide) {
      setShowGuide(true)
    }
  }, [])

  const handleCloseGuide = () => {
    setShowGuide(false)
    localStorage.setItem('officialPacksGuideSeen', 'true')
    // Ensure body scroll is unlocked
    document.body.style.overflow = 'unset'
  }

  const handleShowGuide = () => {
    setShowGuide(true)
  }

  const loadOfficialPacks = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await officialPacksApi.getAllPacks()
      setPacks(response.packs)
    } catch (error) {
      console.error('Failed to load official packs:', error)
      setError('Failed to load official packs')
      toast.error('Failed to load official packs')
    } finally {
      setLoading(false)
    }
  }

  const handlePackClick = (packId: string) => {
    router.push(`/official-packs/${packId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1A1B2E] text-white px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-4">Official Packs</h1>
            <p className="text-gray-300">Draw cards with guaranteed official odds structure</p>
          </div>
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            <p className="text-gray-300 mt-4">Loading official packs...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A1B2E] text-white px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-white mb-4">Official Packs</h1>
            <p className="text-gray-300">Draw cards with guaranteed official odds structure</p>
          </div>
          <div className="text-center">
            <p className="text-red-400 mb-4">{error}</p>
            <button 
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg transition-colors"
              onClick={loadOfficialPacks}
            >
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1A1B2E] text-white px-4 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header Section */}
        <div className="text-center mb-12">
          <div className="mb-6">
            <div className="mb-4">
              <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-400 via-yellow-400 to-orange-500 bg-clip-text text-transparent">
                Official Odds Packs
              </h1>
            </div>
            <p className="text-xl text-gray-300 mb-4">
              Authentic card experiences with guaranteed value protection
            </p>
          </div>
          
          {/* Action Buttons */}
          <div className="flex justify-center gap-4 mb-8">
            <button 
              onClick={handleShowGuide}
              className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 py-3 rounded-xl font-bold transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 flex items-center gap-2"
            >
              <span>📖</span>
              How It Works
            </button>
          </div>
          
          {/* Stats Section */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-2xl mx-auto">
            <div className="bg-gradient-to-r from-purple-600/20 to-purple-800/20 p-4 rounded-xl border border-purple-500/30">
              <span className="text-gray-400 block text-sm">Available Packs</span>
              <span className="text-white font-bold text-2xl">{packs.length}</span>
            </div>
            <div className="bg-gradient-to-r from-blue-600/20 to-blue-800/20 p-4 rounded-xl border border-blue-500/30">
              <span className="text-gray-400 block text-sm">Your Points</span>
              <div className="flex items-center justify-center gap-1">
                <Image src="/users/coin.png" alt="Coin" width={20} height={20} />
                <span className="text-white font-bold text-2xl">{userInfo?.pointsBalance?.toLocaleString() || 0}</span>
              </div>
            </div>
            <div className="bg-gradient-to-r from-green-600/20 to-green-800/20 p-4 rounded-xl border border-green-500/30">
              <span className="text-gray-400 block text-sm">Cards Per Draw</span>
              <span className="text-white font-bold text-2xl">10 🎴</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6 2xl:grid-cols-6 gap-2 sm:gap-4">
          {packs.map((pack) => {
            const colorTheme = getPackColorTheme(pack.price)
            
            return (
              <Link 
                key={pack.id} 
                href={`/official-packs/${pack.id}`} 
                className="block relative hover:scale-105 transition-transform duration-300"
              >
                <div className={`rounded-lg overflow-hidden ${colorTheme.boxShadow}`}>
                  {/* Pack image section with subtle gradient background */}
                  <div className="aspect-square relative flex items-center justify-center p-4 bg-[#1A1B2E]">
                    {pack.image_url && (
                      <Image 
                        src={pack.image_url}
                        alt={pack.name || pack.id} 
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 16.6vw"
                      />
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
                      <span className="truncate text-center font-bold text-[15px] text-white drop-shadow-lg">{pack.name || pack.id}</span>
                    </div>
                    
                    
                    {/* Price section */}
                    <div className="w-full py-3 text-white transition-all duration-300 border-t border-white/10">
                      <div className="flex items-center justify-center gap-2">
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
                </div>
              </Link>
            )
          })}
        </div>

        {packs.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">📦</div>
            <h3 className="text-xl font-bold text-white mb-2">No Official Packs Available</h3>
            <p className="text-gray-400">Check back later for new official pack releases!</p>
          </div>
        )}
      </div>
      
      {/* Guide Modal */}
      <OfficialPackGuideModal isOpen={showGuide} onClose={handleCloseGuide} />
    </div>
  )
}
