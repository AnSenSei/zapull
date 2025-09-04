'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import styles from './achievements.module.css'
import achievementApi, { Achievement, AchievementsResponse, GroupedAchievementsResponse } from '@/lib/achievementApi'

import { auth } from '@/lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import AchievementDetailModal from '@/components/AchievementDetailModal'
import AchievementGuideModal from '@/components/AchievementGuideModal'

type FilterType = 'All' | 'Done'

export default function AchievementsPage() {
  const [filterType, setFilterType] = useState<FilterType>('All')
  const [achievements, setAchievements] = useState<Achievement[]>([])
  const [groupedAchievements, setGroupedAchievements] = useState<{ [key: string]: Achievement[] }>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [sortBy, setSortBy] = useState('awardedAt')
  const [expandedGroups, setExpandedGroups] = useState<{ [key: string]: boolean }>({})
  
  // 详情弹窗状态
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const [selectedAchievementId, setSelectedAchievementId] = useState<string | null>(null)
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null)
  
  // Guide modal state
  const [isGuideModalOpen, setIsGuideModalOpen] = useState(false)
  
  const [userId, setUserId] = useState<string | null>(null)
  const [authReady, setAuthReady] = useState(false)

  // Subscribe to auth state to reliably know when userId is ready
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUserId(user?.uid ?? null)
      setAuthReady(true)
    })
    return () => unsub()
  }, [])

  // 获取成就数据
  useEffect(() => {
    const fetchAchievements = async () => {
      // Allow viewing All achievements without login
      if (filterType === 'Done') {
        // Wait for auth to initialize; avoid disabling or erroring prematurely
        if (!authReady) {
          return
        }
        if (!userId) {
          setError('Please login to view your completed achievements')
          setLoading(false)
          return
        }
      }
      
      setLoading(true)
      setError('')
      
      try {
        if (filterType === 'All') {
          // 获取分组成就
          const groupedResponse = await achievementApi.getGroupedAchievements({
            page: currentPage,
            per_page: 300  // Get more since we're displaying by groups
          })
          
          setGroupedAchievements(groupedResponse.groups)
          setTotalPages(Math.ceil(groupedResponse.total / 300))
          
          // Initialize all groups as collapsed by default
          const initialExpanded: { [key: string]: boolean } = {}
          Object.keys(groupedResponse.groups).forEach(key => {
            initialExpanded[key] = false
          })
          setExpandedGroups(initialExpanded)
          
          // Flatten for compatibility with existing code
          const flattened: Achievement[] = []
          Object.values(groupedResponse.groups).forEach(group => {
            flattened.push(...group)
          })
          setAchievements(flattened)
        } else {
          // 获取用户已完成的成就
          const response = await achievementApi.getUserAchievements({
            page: currentPage,
            per_page: 60,
            sort_by: sortBy,  // Don't lowercase - keep camelCase
            sort_order: 'desc'
          })
          // All achievements returned by getUserAchievements are already completed
          // Mark them as achieved for display purposes
          response.achievements = response.achievements.map(achievement => ({
            ...achievement,
            achieved: true,
            progress: achievement.condition?.target || 1
          }))
          
          setAchievements(response.achievements)
          setGroupedAchievements({}) // Clear grouped view for Done filter
          setTotalPages(response.pagination.total_pages)
        }
      } catch (err) {
        console.error('获取成就数据失败:', err)
        setError('获取成就数据失败，请稍后重试')
      } finally {
        setLoading(false)
      }
    }
    
    fetchAchievements()
  }, [userId, authReady, filterType, currentPage, sortBy])

  // 获取成就图标
  const getAchievementIcon = (achievement: Achievement) => {
    if (achievement.emblemUrl) {
      return achievement.emblemUrl
    }
    // Return a default trophy icon if no emblem
    return '/user/achievements.svg'
  }

  // 获取成就进度百分比
  const getProgressPercentage = (achievement: Achievement) => {
    if (achievement.achieved) return 100
    if (achievement.condition?.type === 'special') return 0 // Special achievements don't show progress
    if (!achievement.progress || !achievement.condition?.target) return 0
    return Math.min((achievement.progress / achievement.condition.target) * 100, 100)
  }

  // 格式化条件类型名称
  const formatConditionType = (type: string) => {
    const typeMap: { [key: string]: string } = {
      'level_reached': 'Level Achievements',
      'fusion_reached': 'Fusion Achievements',
      'draw_by_rarity': 'Draw Achievements',
      'buy_deal_reached': 'Trading Achievements (Buy)',
      'sell_deal_reached': 'Trading Achievements (Sell)',
      'withdraw_reached': 'Withdrawal Achievements',
      'special': 'Special Achievements'
    }
    return typeMap[type] || type
  }

  // 处理成就卡片点击
  const handleAchievementClick = (achievement: Achievement) => {
    setSelectedAchievement(achievement)
    setSelectedAchievementId(achievement.id)
    setIsDetailModalOpen(true)
  }

  // 关闭详情弹窗
  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false)
    setSelectedAchievementId(null)
    setSelectedAchievement(null)
  }

  // Toggle group expansion
  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }))
  }

  // Expand/Collapse all groups
  const toggleAllGroups = (expand: boolean) => {
    const newExpanded: { [key: string]: boolean } = {}
    Object.keys(groupedAchievements).forEach(key => {
      newExpanded[key] = expand
    })
    setExpandedGroups(newExpanded)
  }

  return (
    <div className={styles.container}>
      {/* 头部导航 */}
      <div className={styles.header}>
        <div className={styles.filterTabs}>
          <button 
            className={`${styles.tab} ${filterType === 'All' ? styles.activeTab : ''}`}
            onClick={() => {
              setFilterType('All')
              setCurrentPage(1)
            }}
          >
            All
          </button>
          	<button 
            className={`${styles.tab} ${filterType === 'Done' ? styles.activeTab : ''}`}
            onClick={() => {
              setFilterType('Done')
              setCurrentPage(1)
            }}
            disabled={authReady && !userId}
            title={!authReady ? '' : (!userId ? 'Login to view your achievements' : '')}
          >
            Done
          </button>
        </div>
        
        {filterType === 'All' && (
          <div className={styles.controlsContainer}>
            <div className={styles.expandControls}>
              <button 
                className={styles.expandButton}
                onClick={() => toggleAllGroups(true)}
              >
                Expand All
              </button>
              <button 
                className={styles.expandButton}
                onClick={() => toggleAllGroups(false)}
              >
                Collapse All
              </button>
              {/* Operation Button - same style as marketplace */}
              <div 
                className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg p-3 ml-3"
                onClick={() => setIsGuideModalOpen(true)}
              >
                <div className="text-white font-medium flex items-center justify-center">
                  <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
                </div>
                <div className="text-gray-400 text-xs">Guide</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 成就展示 */}
      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : error ? (
        <div className={styles.error}>{error}</div>
      ) : achievements.length === 0 ? (
        <div className={styles.noData}>No achievements found</div>
      ) : filterType === 'All' && Object.keys(groupedAchievements).length > 0 ? (
        // 分组显示成就
        <div className={styles.groupedContainer}>
          {Object.entries(groupedAchievements).map(([conditionType, groupAchievements]) => (
            <div key={conditionType} className={styles.achievementGroup}>
              <div 
                className={styles.groupHeader}
                onClick={() => toggleGroup(conditionType)}
              >
                <h2 className={styles.groupTitle}>
                  <span className={styles.dropdownArrow}>
                    {expandedGroups[conditionType] ? '▼' : '▶'}
                  </span>
                  {formatConditionType(conditionType)}
                  <span className={styles.groupCount}>({groupAchievements.length})</span>
                </h2>
              </div>
              {expandedGroups[conditionType] && (
                <div className={styles.achievementsGrid}>
                  {groupAchievements.map((achievement) => (
                  <div 
                    key={achievement.id} 
                    className={`${styles.achievementCard} ${achievement.achieved ? styles.achieved : styles.notAchieved}`}
                    onClick={() => handleAchievementClick(achievement)}
                  >
                    {/* 成就图标 */}
                    <div className={styles.achievementIcon}>
                      <Image
                        src={getAchievementIcon(achievement)}
                        alt={achievement.name}
                        width={48}
                        height={48}
                        className={styles.iconImage}
                      />
                      {achievement.achieved && (
                        <div className={styles.achievedBadge}>✓</div>
                      )}
                    </div>
                    
                    {/* 成就信息 */}
                    <div className={styles.achievementInfo}>
                      <h3 className={styles.achievementName}>{achievement.name}</h3>
                      <p className={styles.achievementDescription}>{achievement.description}</p>
                      
                      {/* 进度条 */}
                      <div className={styles.progressContainer}>
                        <div className={styles.progressBar}>
                          <div 
                            className={styles.progressFill}
                            style={{ width: `${getProgressPercentage(achievement)}%` }}
                          />
                        </div>
                        <span className={styles.progressText}>
                          {achievement.achieved ? 'Completed' : 
                           achievement.condition?.type === 'special' ? 'Special Achievement' :
                           `${achievement.progress || 0}/${achievement.condition?.target || 1}`}
                        </span>
                      </div>
                      
                      {/* 奖励信息 - 过滤掉emblem类型 */}
                      {achievement.reward && achievement.reward.filter(r => r.type !== 'emblem').length > 0 && (
                        <div className={styles.rewardInfo}>
                          <span className={styles.rewardLabel}>Reward:</span>
                          {achievement.reward
                            .filter(r => r.type !== 'emblem')
                            .map((r, idx) => (
                              <span key={idx} className={styles.rewardItem}>
                                {r.type === 'point' ? `${r.amount} Points` : 
                                 r.type === 'card' ? `${r.amount || 1} Card${(r.amount || 1) > 1 ? 's' : ''}` :
                                 r.type === 'pack' ? `${r.amount || 1} Pack${(r.amount || 1) > 1 ? 's' : ''}` :
                                 r.type}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // 非分组显示（Done状态）
        <div className={styles.achievementsGrid}>
          {achievements.map((achievement) => (
            <div 
              key={achievement.id} 
              className={`${styles.achievementCard} ${achievement.achieved ? styles.achieved : styles.notAchieved}`}
              onClick={() => handleAchievementClick(achievement)}
            >
              {/* 成就图标 */}
              <div className={styles.achievementIcon}>
                <Image
                  src={getAchievementIcon(achievement)}
                  alt={achievement.name}
                  width={48}
                  height={48}
                  className={styles.iconImage}
                />
                {achievement.achieved && (
                  <div className={styles.achievedBadge}>✓</div>
                )}
              </div>
              
              {/* 成就信息 */}
              <div className={styles.achievementInfo}>
                <h3 className={styles.achievementName}>{achievement.name}</h3>
                <p className={styles.achievementDescription}>{achievement.description}</p>
                
                {/* 进度条 */}
                <div className={styles.progressContainer}>
                  <div className={styles.progressBar}>
                    <div 
                      className={styles.progressFill}
                      style={{ width: `${getProgressPercentage(achievement)}%` }}
                    />
                  </div>
                  <span className={styles.progressText}>
                    {achievement.achieved ? 'Completed' : `${achievement.progress || 0}/${achievement.condition?.target || 1}`}
                  </span>
                </div>
                
                {/* 奖励信息 - 过滤掉emblem类型 */}
                {achievement.reward && achievement.reward.filter(r => r.type !== 'emblem').length > 0 && (
                  <div className={styles.rewardInfo}>
                    <span className={styles.rewardLabel}>Reward:</span>
                    {achievement.reward
                      .filter(r => r.type !== 'emblem')
                      .map((r, idx) => (
                        <span key={idx} className={styles.rewardItem}>
                          {r.type === 'point' ? `${r.amount} Points` : 
                           r.type === 'card' ? `${r.amount || 1} Card${(r.amount || 1) > 1 ? 's' : ''}` :
                           r.type === 'pack' ? `${r.amount || 1} Pack${(r.amount || 1) > 1 ? 's' : ''}` :
                           r.type}
                        </span>
                      ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className={styles.pagination}>
          <button 
            className={styles.pageButton}
            disabled={currentPage === 1}
            onClick={() => setCurrentPage(currentPage - 1)}
          >
            Previous
          </button>
          
          <span className={styles.pageInfo}>
            Page {currentPage} of {totalPages}
          </span>
          
          <button 
            className={styles.pageButton}
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* 成就详情弹窗 */}
      <AchievementDetailModal
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
        achievementId={selectedAchievementId}
        initialAchievement={selectedAchievement}
      />
      
      {/* Achievement Guide Modal */}
      <AchievementGuideModal
        isOpen={isGuideModalOpen}
        onClose={() => setIsGuideModalOpen(false)}
      />
    </div>
  )
}