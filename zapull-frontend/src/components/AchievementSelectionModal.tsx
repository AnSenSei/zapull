'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { achievementApi, Achievement } from '@/lib/achievementApi'
import { auth } from '@/lib/firebase'
import AchievementDetailModal from './AchievementDetailModal'

interface AchievementSelectionModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export default function AchievementSelectionModal({ isOpen, onClose, onSuccess }: AchievementSelectionModalProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [userAchievements, setUserAchievements] = useState<Achievement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null)
  const [isConfirming, setIsConfirming] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())

  // 获取所有成就
  const fetchAchievements = async () => {
    try {
      setLoading(true)
      setError('')
      
      // Fetch user's achievements (completed)
      const userAchievementsResponse = await achievementApi.getUserAchievements()
      const userAchievementsList = userAchievementsResponse.achievements || []
      setAchievements(userAchievementsList)
      setUserAchievements(userAchievementsList)

      // Also fetch current highlighted achievements to prevent duplicates
      const highlightsResp = await achievementApi.getUserAchievementHighlights()
      const ids = new Set<string>((highlightsResp.achievements || []).map(a => a.id))
      setHighlightedIds(ids)
    } catch (error) {
      console.error('Failed to fetch achievements:', error)
      setError('Failed to fetch achievements, please try again later')
    } finally {
      setLoading(false)
    }
  }

  // 过滤成就
  const filteredAchievements = achievements.filter(achievement => {
    const matchesSearch = achievement.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         achievement.description.toLowerCase().includes(searchQuery.toLowerCase())
    
    return matchesSearch
  })

  // 选择成就进行预览
  const handleSelectAchievement = (achievement: Achievement) => {
    // Prevent selecting an already highlighted achievement
    if (highlightedIds.has(achievement.id)) {
      return
    }
    setSelectedAchievement(achievement)
    // Mobile: just select, do not open detail
    // Desktop: also just select
    // No modal opening here per new UX
  }

  // Confirm add to emblems
  const handleConfirmAdd = async () => {
    if (!auth.currentUser?.uid || !selectedAchievement) return
    
    try {
      setIsConfirming(true)
      await achievementApi.bindAchievementHighlight(selectedAchievement.id)
      onSuccess()
      onClose()
      setSelectedAchievement(null)
    } catch (error) {
      console.error('Failed to add achievement emblem:', error)
      setError('Failed to add achievement emblem, please try again later')
    } finally {
      setIsConfirming(false)
    }
  }

  // 获取成就完成状态
  const getAchievementStatus = (achievement: Achievement) => {
    const userAchievement = userAchievements.find(ua => ua.id === achievement.id)
    return {
      isCompleted: true, // All user achievements are completed
      progress: achievement.condition?.target || 0,
      completedAt: achievement.awardedAt
    }
  }

  // 获取稀有度颜色
  const getRarityColor = (rarity: string | undefined) => {
    if (!rarity) return 'from-gray-400 to-gray-600'
    
    switch (rarity.toLowerCase()) {
      case 'common': return 'from-gray-400 to-gray-600'
      case 'rare': return 'from-green-400 to-green-600'
      case 'epic': return 'from-blue-400 to-blue-600'
      case 'legendary': return 'from-purple-400 to-purple-600'
      case 'mythic': return 'from-yellow-400 to-yellow-600'
      default: return 'from-gray-400 to-gray-600'
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchAchievements()
      setSelectedAchievement(null)
      setSearchQuery('')
      setError('')
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 sm:flex sm:items-center sm:justify-center z-50 sm:p-4">
      <div className="bg-gradient-to-br from-[#1A1B2C] to-[#2A2B3D] sm:rounded-[20px] w-full h-full sm:max-w-4xl sm:max-h-[90vh] overflow-hidden sm:border-2 sm:border-[#8868FF]">
        {/* 头部 */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-[#3F3F5F]">
          <h2 className="text-lg sm:text-2xl font-bold text-white">EDIT EMBLEMS</h2>
          <button
            onClick={onClose}
            className="cursor-pointer bg-none border-none p-0 text-[20px] text-white"
          >
            <Image src="/icons/close.png" alt="Close" width={24} height={24} />
          </button>
        </div>

        {/* 内容区域 - Mobile optimized layout */}
        <div className="flex flex-col sm:flex-row h-[calc(100vh-80px)] sm:h-[calc(90vh-120px)] overflow-hidden">
          {/* 预览区域 - Mobile shows at top */}
          <div className="w-full sm:w-1/2 sm:max-w-[460px] flex-shrink-0 h-[320px] sm:h-full p-3 sm:p-6 border-b sm:border-b-0 sm:border-r border-[#3F3F5F] flex flex-col items-center sm:items-stretch">
            <div className="hidden sm:flex items-center mb-4">
              <div className="w-6 h-6 bg-[#8B5CF6] rounded-full flex items-center justify-center mr-3">
                <span className="text-white text-sm font-bold">🏆</span>
              </div>
              <h3 className="text-lg font-semibold text-white">Emblems</h3>
            </div>
            
          {/* Preview achievement */}
            <div className="bg-[#3F3F5F] rounded-lg p-3 sm:p-4 w-full mx-auto flex items-center justify-center">
              {selectedAchievement ? (
                <>
                    		<div className="w-[165px] sm:w-[320px] md:w-[360px] relative aspect-[3/4] flex flex-col items-center justify-center">
                    		  <div className="w-24 sm:w-28 h-24 sm:h-28 rounded-full bg-[#1E1F2E] flex items-center justify-center mb-3 sm:mb-4">
                      {selectedAchievement.emblemUrl ? (
                        <Image 
                          src={selectedAchievement.emblemUrl} 
                          alt={selectedAchievement.name}
                          width={40}
                          height={40}
                          className="object-contain sm:w-16 sm:h-16"
                        />
                      ) : (
                        <span className="text-2xl sm:text-3xl">🏆</span>
                      )}
                    </div>
                    <h4 className="text-base sm:text-lg font-bold text-white text-center mb-2 px-2">{selectedAchievement.name}</h4>
                    <p className="text-gray-300 text-xs sm:text-sm text-center mb-3 sm:mb-4 line-clamp-3 px-2">{selectedAchievement.description}</p>
                    

                    
                    {/* 奖励信息 - hidden on all breakpoints per UX */}
                  </div>
                </>
              ) : (
                <div className="w-[165px] sm:w-[320px] md:w-[360px] relative aspect-[3/4] bg-[#4A4B5F] rounded-lg flex flex-col items-center justify-center">
                  <span className="text-3xl sm:text-4xl mb-3">🏆</span>
                  <p className="text-gray-400 text-xs sm:text-sm">Select an achievement to preview</p>
                </div>
              )}
            </div>
            
            {/* Confirm button */}
            <button 
              onClick={handleConfirmAdd}
              disabled={!selectedAchievement || highlightedIds.has(selectedAchievement?.id || '') || isConfirming}
              className="w-full mt-3 sm:mt-6 py-2 sm:py-3 bg-[#8B5CF6] text-white rounded-lg font-semibold hover:bg-[#7C3AED] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
            >
              {selectedAchievement && highlightedIds.has(selectedAchievement.id) ? 'Already added' : (isConfirming ? 'Adding...' : 'Confirm')}
            </button>
          </div>

          {/* Achievement selection area */}
          <div className="flex-1 sm:w-1/2 p-3 sm:p-6 overflow-y-auto" role="region" aria-label="Select an achievement to highlight">
            {/* Search */}
            <div className="mb-2 sm:mb-3">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search achievements..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2 py-1.5 sm:py-2 bg-[#3F3F5F] text-white rounded-lg border border-[#4F4F6F] focus:border-[#8B5CF6] focus:outline-none text-xs sm:text-sm"
                />
                <svg className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Error message */}
            {error && (
              <div className="bg-red-500/20 border border-red-500 rounded-lg p-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            {/* Achievement grid */}
            <div className="grid grid-cols-4 sm:grid-cols-3 lg:grid-cols-3 gap-1.5 sm:gap-4">
              {loading ? (
                [...Array(12)].map((_, i) => (
                  <div key={i} className="aspect-square bg-[#3F3F5F] rounded-lg animate-pulse"></div>
                ))
              ) : (
                filteredAchievements.map((achievement) => {
                  const status = getAchievementStatus(achievement)
                  const isSelected = selectedAchievement?.id === achievement.id
                  
                  const isHighlighted = highlightedIds.has(achievement.id)
                  return (
                    <div
                      key={achievement.id}
                      onClick={() => !isHighlighted && handleSelectAchievement(achievement)}
                      className={`rounded-md sm:rounded-lg overflow-hidden relative group transition-all duration-200 bg-[#3F3F5F] ${
                        isHighlighted ? 'opacity-50 cursor-not-allowed' : 'hover:transform hover:scale-105'
                      } ${isSelected ? 'ring-2 ring-[#8B5CF6]' : ''}`}
                    >
                      <div className="w-full p-2 sm:p-4">
                        <div className="flex flex-col items-center text-center">
                        <div className={`w-16 sm:w-20 h-16 sm:h-20 rounded-full flex items-center justify-center mb-2 sm:mb-3`} style={{ background: '#1E1F2E' }}>
                          {achievement.emblemUrl ? (
                            <Image 
                              src={achievement.emblemUrl} 
                              alt={achievement.name}
                              width={28}
                              height={28}
                              className="object-contain sm:w-12 sm:h-12"
                            />
                          ) : (
                            <span className="text-lg sm:text-2xl">🏆</span>
                          )}
                        </div>
                        
                          <h4 className="text-white text-[10px] sm:text-sm font-semibold mb-1 line-clamp-2 px-1 hidden sm:block">{achievement.name}</h4>
                        
                          {/* Status badge */}
                          {status.isCompleted && (
                            <div className="absolute top-1 right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-[8px]">✓</span>
                            </div>
                          )}
                          {isHighlighted && (
                            <div className="absolute inset-0 flex items-center justify-center text-[10px] sm:text-xs font-semibold text-gray-300">
                              Displayed
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            
            {!loading && filteredAchievements.length === 0 && (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-[#3F3F5F] flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl">🔍</span>
                </div>
                <p className="text-gray-400">No achievements found</p>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Achievement Detail Modal for mobile */}
      {selectedAchievement && (
        <AchievementDetailModal
          achievement={selectedAchievement}
          isOpen={showDetail}
          onClose={() => setShowDetail(false)}
        />
      )}

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
