'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import achievementApi, { Achievement } from '@/lib/achievementApi'
import { getCurrentUserId } from '@/lib/authUtils'
import styles from './AchievementDetailModal.module.css'

interface AchievementDetailModalProps {
  isOpen: boolean
  onClose: () => void
  achievementId: string | null
  initialAchievement?: Achievement | null
  onDelete?: (achievementId: string) => void
  showDeleteButton?: boolean
}

export default function AchievementDetailModal({ 
  isOpen, 
  onClose, 
  achievementId, 
  initialAchievement,
  onDelete,
  showDeleteButton = false
}: AchievementDetailModalProps) {
  const [achievement, setAchievement] = useState<Achievement | null>(initialAchievement || null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const userId = getCurrentUserId()

  // 获取成就详情
  useEffect(() => {
    const fetchAchievementDetail = async () => {
      if (!isOpen || !achievementId || !userId) return
      
      // 如果已有初始数据，则不需要重新获取
      if (initialAchievement && initialAchievement.id === achievementId) {
        setAchievement(initialAchievement)
        return
      }
      
      setLoading(true)
      setError('')
      
      try {
        const achievementData = await achievementApi.getAchievementDetail(achievementId)
        setAchievement(achievementData)
      } catch (err) {
        console.error('Failed to fetch achievement detail:', err)
        setError('Failed to fetch achievement detail, please try again later')
      } finally {
        setLoading(false)
      }
    }
    
    fetchAchievementDetail()
  }, [isOpen, achievementId, userId, initialAchievement])

  // 关闭弹窗时重置状态
  useEffect(() => {
    if (!isOpen) {
      setError('')
      if (!initialAchievement) {
        setAchievement(null)
      }
    }
  }, [isOpen, initialAchievement])

  // Helper function to get emblem URL (similar to the logic in public profile)
  const getEmblemUrl = (achievement: Achievement) => {
    if (achievement.emblemUrl) {
      return achievement.emblemUrl
    }
    // Extract emblem URL from reward array if emblemUrl is null
    const emblemFromReward = Array.isArray(achievement.reward)
      ? achievement.reward.find((r: any) => r?.type === 'emblem' && (r.url || r.emblemUrl))
      : undefined;
    return emblemFromReward?.url || emblemFromReward?.emblemUrl || null;
  }

  // 获取成就图标
  const getAchievementIcon = (achievement: Achievement) => {
    if (achievement.icon_url) {
      return achievement.icon_url
    }
    return achievement.is_completed ? '/user/achievements.svg' : '/user/achievements.svg'
  }

  // 获取进度百分比
  const getProgressPercentage = (achievement: Achievement) => {
    // All user achievements are completed
    return 100
  }

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {/* 关闭按钮 */}
        <button className={styles.closeButton} onClick={onClose}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {loading ? (
          <div className={styles.loading}>
            <div className={styles.spinner}></div>
            <p>Loading...</p>
          </div>
        ) : error ? (
          <div className={styles.error}>
            <p>{error}</p>
            <button className={styles.retryButton} onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        ) : achievement ? (
          <div className={styles.modalBody}>
            {/* Scrollable content area */}
            <div className={styles.scrollableContent}>
              {/* 成就头部 - 简化版只显示徽章、名称和描述 */}
              <div className={styles.header} style={{ justifyContent: 'center', textAlign: 'center' }}>
                <div className={styles.iconContainer} style={{ marginBottom: '20px' }}>
                  {getEmblemUrl(achievement) ? (
                    <Image
                      src={getEmblemUrl(achievement)}
                      alt={achievement.name}
                      fill
                      className={styles.icon}
                    />
                  ) : (
                    <div className={styles.placeholderIcon}>
                      <span className={styles.placeholderEmoji}>🏆</span>
                    </div>
                  )}
                </div>
                <div className={styles.titleSection} style={{ maxWidth: '400px', margin: '0 auto' }}>
                  <h2 className={styles.title} style={{ fontSize: '24px', marginBottom: '12px' }}>{achievement.name}</h2>
                  <p className={styles.description} style={{ fontSize: '16px', color: '#9CA3AF', lineHeight: '1.6' }}>{achievement.description}</p>
                  
                  {/* Achieved date */}
                  {achievement.awardedAt && (
                    <div style={{ marginTop: '20px', textAlign: 'center' }}>
                      <p style={{ 
                        fontSize: '14px', 
                        color: '#10B981', 
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px'
                      }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M8 2v4m8-4v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                        Achieved on {formatDate(achievement.awardedAt)}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Fixed action buttons at bottom */}
            {showDeleteButton && onDelete && (
              <div className={styles.actionButtons}>
                <button
                  onClick={() => {
                    if (achievement.id) {
                      onDelete(achievement.id)
                      onClose()
                    }
                  }}
                  className={styles.deleteButton}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M3 6H5H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Remove from Highlights
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.noData}>
            <p>No achievement data</p>
          </div>
        )}
      </div>
    </div>
  )
}