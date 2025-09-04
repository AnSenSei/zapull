'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { officialPacksApi, CardInfo, ColorSection, DrawOfficialOddsResponse, OfficialPack } from '@/lib/officialPacksApi'
import { getPackColorTheme } from '@/lib/packColorUtils'
import styles from '../../packs/packs.module.css'

// Simple helper to optimize images
const optimizeImage = (url: string, options: { width: number, height: number, quality?: number }) => {
  return url // For now, just return the original URL
}

interface OfficialPackDetailsPageProps {
  params: { packId: string }
}

type DrawCount = 1 | 3 | 5

export default function OfficialPackDetailsPage({ params }: OfficialPackDetailsPageProps) {
  const router = useRouter()
  
  if (!params) {
    return <div>Loading...</div>
  }
  
  const packId = params.packId as string
  const { userInfo: user, setUserInfo, openLoginModal } = useAuthStore()
  
  const [pack, setPack] = useState<OfficialPack | null>(null)
  const [cardSections, setCardSections] = useState<ColorSection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawCount, setDrawCount] = useState<1 | 3 | 5>(1)
  const [showResults, setShowResults] = useState(false)
  const [drawResults, setDrawResults] = useState<any>(null)
  const [animatingCardIndex, setAnimatingCardIndex] = useState(0)
  const [revealedCards, setRevealedCards] = useState<any[]>([])
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [showTopUpModal, setShowTopUpModal] = useState(false)
  const [selectedCards, setSelectedCards] = useState<Set<number>>(new Set())
  const [priceFilter, setPriceFilter] = useState({ min: 0, max: 10000 })
  const [showFilters, setShowFilters] = useState(false)
  const [showCardReveal, setShowCardReveal] = useState(false)
  const [currentCardIndex, setCurrentCardIndex] = useState(0)

  useEffect(() => {
    loadPackInfo()
  }, [packId])

  const loadPackInfo = async () => {
    try {
      setLoading(true)
      setError(null)
      
      // Load pack details
      const packResponse = await fetch(`/users/api/v1/official-odds/packs/${packId}`)
      if (!packResponse.ok) throw new Error('Pack not found')
      
      const packData = await packResponse.json()
      setPack(packData)
      
      // Load card sections
      const cardsResponse = await fetch(`/users/api/v1/official-odds/packs/${packId}/cards`)
      if (!cardsResponse.ok) throw new Error('Failed to load cards')
      
      const cardsData = await cardsResponse.json()
      setCardSections(cardsData.sections || [])
      
    } catch (err) {
      console.error('Failed to load pack info:', err)
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  const handleDraw = async () => {
    if (!user) {
      setShowLoginModal(true)
      return
    }

    if (!user.points || user.points < (pack?.price || 0) * drawCount) {
      setShowTopUpModal(true)
      return
    }

    try {
      setIsDrawing(true)
      
      const token = await user.getIdToken()
      const response = await fetch(`/users/api/v1/official-odds/draw/${packId}?count=${drawCount}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        throw new Error('Failed to draw cards')
      }

      const results = await response.json()
      setDrawResults(results)
      
      // Update user points
      if (user.points) {
        setUserInfo({
          ...user,
          points: user.points - ((pack?.price || 0) * drawCount)
        })
      }
      
      setShowResults(true)
      
    } catch (error) {
      console.error('Draw error:', error)
      toast.error('Failed to draw cards')
    } finally {
      setIsDrawing(false)
    }
  }

  const getCardColorClass = (color: string) => {
    switch (color.toLowerCase()) {
      case 'green': return styles.cardGreen
      case 'blue': return styles.cardBlue
      case 'purple': return styles.cardPurple
      case 'orange': return styles.cardOrange
      default: return styles.cardDefault
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1E1F35] flex items-center justify-center">
        <div className="text-white text-xl">Loading pack details...</div>
      </div>
    )
  }

  if (error || !pack) {
    return (
      <div className="min-h-screen bg-[#1E1F35] flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-400 text-xl mb-4">Error: {error || 'Pack not found'}</div>
          <Link href="/official-packs" className="text-blue-400 hover:text-blue-300">
            ← Back to Official Packs
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen bg-[#1E1F35] ${styles.pageContainer}`}>
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-radial from-purple-500/10 via-transparent to-transparent"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-radial from-blue-500/10 via-transparent to-transparent"></div>
      </div>

      <div className="p-6">
        <button 
          className="flex items-center gap-2 text-white hover:text-gray-300 transition-colors bg-[#1E1F35] rounded-lg px-4 py-2"
          onClick={() => router.push('/official-packs')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5"></path>
            <path d="M12 19l-7-7 7-7"></path>
          </svg>
          <span>Back</span>
        </button>
      </div>
      
      <div className="w-full relative z-10">
        <h1 className={`text-3xl font-bold text-center mb-8 ${styles.pageTitle}`}>{pack.name || pack.id}</h1>
        
        {/* Pack details - left right layout */}
        <div className={`gap-8 mb-12 ${styles.packDetailContainer} ${styles.infoContainer}`}>
          {/* Left side - Pack image */}
          <div className={`md:w-1/2 ${styles.imageWrapper}`}>
            <div className={`aspect-square w-full ${styles.packImageContainer} relative rounded-lg p-[2px] ${getPackColorTheme(pack?.price).boxShadow}`}>
              <div className={`absolute inset-0 rounded-lg ${getPackColorTheme(pack?.price).bgGradient} opacity-60`}></div>
              <div
                className="relative w-full h-full rounded-lg overflow-hidden p-2"
                style={{ background: 'transparent' }}
              >
                {pack.image_url ? (
                  <Image 
                    src={optimizeImage(pack.image_url, { width: 400, height: 400, quality: 85 })} 
                    alt={pack.name || pack.id} 
                    fill
                    className="object-contain"
                    priority
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-400">
                    <div className="text-center">
                      <div className="text-6xl mb-4">📦</div>
                      <p>No Image</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Right side - Pack info and buttons */}
          <div className={`md:w-1/2 flex flex-col justify-center ${styles.infoWrapper}`}>
            <div className={`${styles.rightPanelContainer}`}>
              {/* Draw button group */}
              <div className={`${styles.buttonGroup} mb-6`}>
                {/* Number button group */}
                <div className={styles.numberButtonGroup}>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 1 ? styles.active : ''}`}
                    onClick={() => setDrawCount(1)}
                  >
                    1x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 3 ? styles.active : ''}`}
                    onClick={() => setDrawCount(3)}
                  >
                    3x
                  </button>
                  <button 
                    className={`${styles.numberButton} ${drawCount === 5 ? styles.active : ''}`}
                    onClick={() => setDrawCount(5)}
                  >
                    5x
                  </button>
                </div>
                
                {/* Demo and Skip buttons */}
                <div className={styles.iconButtonWrapper}>
                  <button className={`${styles.iconButton}`}>
                    <span>🎮</span>
                    <span>Demo</span>
                  </button>
                </div>
                
                <div className={styles.iconButtonWrapper}>
                  <button className={`${styles.iconButton}`}>
                    <span>⏭️</span>
                    <span>Skip</span>
                  </button>
                </div>
              </div>

              {/* Main draw button */}
              <button 
                onClick={handleDraw}
                disabled={isDrawing}
                className={`${styles.openButton} ${styles.buttonPulse} mb-6`}
              >
                <Image src="/users/coin.png" alt="Coin" width={20} height={20} />
                {isDrawing ? 'Opening...' : (
                  <span className="flex items-center gap-2">
                    Open For <Image src="/users/coin.png" alt="Coin" width={16} height={16} /> {(pack?.price || 0) * drawCount}.00
                  </span>
                )}
              </button>

              {/* Fusion button */}
              <button className={`${styles.openButton} mb-6`} style={{ background: 'linear-gradient(135deg, #E91E63 0%, #AD1457 100%)' }}>
                <span>⭐</span>
                View Fusion Recipes
              </button>

              {/* Stats */}
              <div className={styles.statsContainer}>
                <div className={styles.statItem}>
                  <div className={styles.statLabel}>Max return</div>
                  <div className={styles.statValue} style={{ color: '#4FC3F7' }}>7400</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statLabel}>Win rate</div>
                  <div className={styles.statValue} style={{ color: '#66BB6A' }}>36%</div>
                </div>
                <div className={styles.statItem}>
                  <div className={styles.statLabel}>Min return</div>
                  <div className={styles.statValue} style={{ color: '#42A5F5' }}>200</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card sections */}
        {cardSections.map((section, sectionIndex) => (
          <div key={section.color} className="mb-12">
            <h2 className={`${styles.sectionTitle} text-center mb-8`}>
              {section.color.charAt(0).toUpperCase() + section.color.slice(1)} Cards ({section.cards.length})
            </h2>
            
            <div className="max-w-7xl mx-auto px-4">
              <div className="text-center text-gray-400 mb-6">
                <p>Click on any card to see details</p>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3 sm:gap-4">
                  {section.cards.map((card: CardInfo, index: number) => {
                    // Color-specific styling
                    const colorStyles = {
                      orange: {
                        gradient: 'linear-gradient(135deg, rgba(255, 152, 0, 0.2) 0%, rgba(255, 152, 0, 0.6) 100%)',
                        border: '2px solid #FF9800',
                        shadow: '0 8px 32px rgba(255, 152, 0, 0.3)',
                        bg: '#1A0F00'
                      },
                      purple: {
                        gradient: 'linear-gradient(135deg, rgba(156, 39, 176, 0.2) 0%, rgba(156, 39, 176, 0.6) 100%)',
                        border: '2px solid #9C27B0', 
                        shadow: '0 8px 32px rgba(156, 39, 176, 0.3)',
                        bg: '#1A0A1A'
                      },
                      blue: {
                        gradient: 'linear-gradient(135deg, rgba(33, 150, 243, 0.2) 0%, rgba(33, 150, 243, 0.6) 100%)',
                        border: '2px solid #2196F3',
                        shadow: '0 8px 32px rgba(33, 150, 243, 0.3)', 
                        bg: '#0A1A2A'
                      },
                      green: {
                        gradient: 'linear-gradient(135deg, rgba(76, 175, 80, 0.2) 0%, rgba(76, 175, 80, 0.6) 100%)',
                        border: '2px solid #4CAF50',
                        shadow: '0 8px 32px rgba(76, 175, 80, 0.3)',
                        bg: '#0A1A0A'
                      }
                    }

                    const style = colorStyles[section.color as keyof typeof colorStyles] || colorStyles.green

                    return (
                      <div 
                        key={card.card_id} 
                        className={`${styles.cardListItem} transition-all duration-300 cursor-pointer`}
                        style={{
                          background: style.gradient,
                          border: style.border,
                          boxShadow: style.shadow,
                        }}
                      >
                        <div className="rounded-lg overflow-hidden relative" style={{ backgroundColor: style.bg }}>
                          <div className="p-3">
                            <div className={`${styles.cardImageContainer} aspect-[3/4] relative rounded-md overflow-hidden`}>
                              {card.image_url ? (
                                <Image 
                                  src={card.image_url} 
                                  alt={card.name} 
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="flex items-center justify-center h-full bg-gray-700 text-gray-400">
                                  <div className="text-center">
                                    <div className="text-4xl mb-2">🎴</div>
                                    <p className="text-xs">No Image</p>
                                  </div>
                                </div>
                              )}
                            </div>
                            <h3 className={`${styles.cardTitle} text-white text-sm font-medium text-center mt-2 truncate`}>
                              {card.name}
                            </h3>
                          </div>
                          
                          <div className={`${styles.probabilityTag} ${styles[`rarityTag${card.rarity || 1}` as keyof typeof styles]}`}>
                            {card.probability}%
                          </div>
                          
                          <div className={`${styles.cardInfoTooltip}`}>
                            <div>Rarity: {card.rarity || 1}</div>
                            <div>Probability: {card.probability}%</div>
                            {card.point_worth && <div>Points: {card.point_worth}</div>}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
            </div>
          </div>
        ))}
      </div>

      {/* Draw Results Modal */}
      {showResults && drawResults && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl w-full max-w-7xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-white">Pack Opening Results</h2>
                <button 
                  onClick={() => setShowResults(false)}
                  className="text-gray-400 hover:text-white text-2xl"
                >
                  ×
                </button>
              </div>
              
              <div className="space-y-8">
                <div className="text-center">
                  <p className="text-gray-400">Opened {drawCount} pack{drawCount > 1 ? 's' : ''}</p>
                  <p className="text-gray-400">Total cards received: {drawResults.cards.length}</p>
                  <p className="text-gray-400">Points spent: {(pack?.price || 0) * drawCount}</p>
                </div>
                
                {/* Filter and Action Controls */}
                <div className="flex flex-wrap gap-4 justify-center items-center border-b border-gray-700 pb-4">
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                  >
                    {showFilters ? 'Hide Filters' : 'Show Filters'}
                  </button>
                  
                  {selectedCards.size > 0 && (
                    <div className="flex gap-2 items-center">
                      <span className="text-gray-300">{selectedCards.size} cards selected</span>
                      <button 
                        onClick={async () => {
                          if (!user) return
                          
                          try {
                            const cardsToDestroy = Array.from(selectedCards).map(index => 
                              drawResults.cards[index]
                            )
                            
                            // Get token once before making API calls
                            const token = await user.getIdToken()
                            
                            // Call destroy API for each selected card
                            const destroyPromises = cardsToDestroy.map(card => 
                              fetch(`/users/api/v1/users/${user.uid}/cards/${card.card_id}`, {
                                method: 'DELETE',
                                headers: {
                                  'Authorization': `Bearer ${token}`
                                }
                              })
                            )
                            
                            await Promise.all(destroyPromises)
                            
                            // Remove destroyed cards from local state
                            const remainingCards = drawResults.cards.filter((_: any, index: number) => 
                              !selectedCards.has(index)
                            )
                            
                            setDrawResults({
                              ...drawResults,
                              cards: remainingCards
                            })
                            
                            setSelectedCards(new Set())
                            
                            // Show success message
                            alert(`Successfully destroyed ${cardsToDestroy.length} cards`)
                            
                          } catch (error) {
                            console.error('Error destroying cards:', error)
                            alert('Failed to destroy cards. Please try again.')
                          }
                        }}
                        className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg transition-colors"
                        disabled={!user}
                      >
                        Destroy Selected
                      </button>
                      <button 
                        onClick={() => setSelectedCards(new Set())}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-2 rounded-lg transition-colors"
                      >
                        Clear Selection
                      </button>
                    </div>
                  )}
                </div>
                
                {/* Price Range Filter */}
                {showFilters && (
                  <div className="bg-gray-800 rounded-lg p-4">
                    <h3 className="text-white font-semibold mb-3">Filter by Point Worth</h3>
                    <div className="flex gap-4 items-center">
                      <div className="flex items-center gap-2">
                        <label className="text-gray-300 text-sm">Min:</label>
                        <input 
                          type="number" 
                          value={priceFilter.min}
                          onChange={(e) => setPriceFilter({...priceFilter, min: parseInt(e.target.value) || 0})}
                          className="bg-gray-700 text-white px-2 py-1 rounded w-20 text-sm"
                          min="0"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-gray-300 text-sm">Max:</label>
                        <input 
                          type="number" 
                          value={priceFilter.max}
                          onChange={(e) => setPriceFilter({...priceFilter, max: parseInt(e.target.value) || 10000})}
                          className="bg-gray-700 text-white px-2 py-1 rounded w-20 text-sm"
                          min="0"
                        />
                      </div>
                      <button 
                        onClick={() => setPriceFilter({ min: 0, max: 10000 })}
                        className="bg-gray-600 hover:bg-gray-700 text-white px-3 py-1 rounded text-sm transition-colors"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {drawResults.cards
                    .filter((card: any) => {
                      const cardPoints = card.point_worth || 0
                      return cardPoints >= priceFilter.min && cardPoints <= priceFilter.max
                    })
                    .map((card: any, index: number) => {
                      const isSelected = selectedCards.has(index)
                      return (
                        <div 
                          key={index} 
                          className={`rounded-xl p-1 transition-all duration-300 cursor-pointer ${
                            isSelected ? 'bg-blue-600 ring-2 ring-blue-400' : 'bg-gray-700 hover:bg-gray-600'
                          }`}
                          onClick={() => {
                            const newSelected = new Set(selectedCards)
                            if (isSelected) {
                              newSelected.delete(index)
                            } else {
                              newSelected.add(index)
                            }
                            setSelectedCards(newSelected)
                          }}
                        >
                          <div className="rounded-lg overflow-hidden relative bg-gray-800">
                            {isSelected && (
                              <div className="absolute top-2 right-2 z-10 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                                ✓
                              </div>
                            )}
                            <div className="p-3">
                              <div className="aspect-[3/4] relative rounded-md overflow-hidden mb-2">
                                {card.image_url ? (
                                  <Image 
                                    src={card.image_url} 
                                    alt={card.name} 
                                    fill
                                    className="object-cover"
                                  />
                                ) : (
                                  <div className="flex items-center justify-center h-full bg-gray-700 text-gray-400">
                                    No Image
                                  </div>
                                )}
                              </div>
                              <p className="text-white text-sm font-medium text-center truncate">{card.name}</p>
                            </div>
                            <div className="flex justify-between items-center px-3 py-2 bg-gray-700">
                              <span className="text-xs text-gray-300">Pack {card.pack_number}</span>
                              <span className="text-xs text-gray-300">Slot {card.slot}</span>
                              <span className="text-xs text-gray-300">Pts: {card.point_worth || 0}</span>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-white mb-4">Login Required</h2>
            <p className="text-gray-400 mb-6">You need to be logged in to open packs</p>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setShowLoginModal(false)
                  openLoginModal()
                }}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg"
              >
                Login
              </button>
              <button 
                onClick={() => setShowLoginModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Up Modal */}
      {showTopUpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl p-8 max-w-md w-full">
            <h2 className="text-2xl font-bold text-white mb-4">Insufficient Points</h2>
            <p className="text-gray-400 mb-6">
              You need {(pack?.price || 0) * drawCount} points but only have {user?.points || 0} points.
            </p>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setShowTopUpModal(false)
                  // Navigate to top-up page or open top-up modal
                }}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg"
              >
                Top Up
              </button>
              <button 
                onClick={() => setShowTopUpModal(false)}
                className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-bold py-3 px-6 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
