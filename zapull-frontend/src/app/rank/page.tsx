'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import styles from './rank.module.css'
import rankApi from '@/lib/rankApi'
import { useAuthStore } from '@/store/authStore'
import { getCurrentUserId } from '@/lib/authUtils'
import RankingGuideModal from '@/components/RankingGuideModal'
import { getImageProps } from '@/lib/image-loader'

// Validate and process avatar URL
function getValidAvatarUrl(avatarUrl: string | undefined): string {
  // If URL is not provided or is empty string, use default avatar
  if (!avatarUrl || avatarUrl.trim() === '' || avatarUrl === 'string') {
    return '/avatars/default.svg'
  }
  
  try {
    // Try to create URL object to validate URL format
    new URL(avatarUrl)
    return avatarUrl
  } catch (error) {
    // If URL is invalid, use default avatar
    console.error('Invalid avatar URL:', avatarUrl)
    return '/avatars/default.svg'
  }
}

// Get prize amount based on rank
function getPrizeAmount(rank: number): number {
  const prizes = {
    1: 25000,
    2: 20000,
    3: 15000,
    4: 12500,
    5: 10000,
    6: 7500,
    7: 6875,
    8: 6250,
    9: 5625,
    10: 5000
  }
  return prizes[rank as keyof typeof prizes] || 0
}

// Calculate remaining time for this week using US Central timezone (America/Chicago)
// This ensures all users see the same countdown regardless of their local timezone
function getWeekRemainingTime(): string {
  // Get current time in US Central timezone
  const nowInCentral = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Chicago"}))
  const dayOfWeek = nowInCentral.getDay() // 0 is Sunday, 1 is Monday, etc.
  
  // If it's Sunday (0), the week ends today. Otherwise, calculate days until Sunday
  const daysUntilEndOfWeek = dayOfWeek === 0 ? 0 : 7 - dayOfWeek
  
  // Calculate Sunday 23:59:59 of this week in US Central timezone
  const endOfWeek = new Date(nowInCentral)
  endOfWeek.setDate(nowInCentral.getDate() + daysUntilEndOfWeek)
  endOfWeek.setHours(23, 59, 59, 999)
  
  // Calculate remaining time (milliseconds)
  const remainingTime = endOfWeek.getTime() - nowInCentral.getTime()
  
  // Convert to days, hours, minutes
  const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  const minutes = Math.floor((remainingTime % (1000 * 60 * 60)) / (1000 * 60))
  
  return `${days}d ${hours}h ${minutes}m`
}

type RankingType = 'points' | 'rank' | 'challenger'

// Ranking user data interface
interface RankUser {
  user_id: string;
  total_drawn?: number;  // For level rankings
  spent?: number;        // For weekly spending rankings
  level: number;
  display_name: string;
  avatar: string;
}

// Challenger card data interface
interface TopCard {
  card_name: string;
  point_worth: number;
  collection_name: string;
  card_doc_id: string;
  image_url?: string;
  rarity?: number;
}

// Challenger ranking user data interface
interface ChallengerRankUser {
  user_id: string;
  display_name: string;
  avatar: string;
  total_value: number;
  rank: number;
  card_count: number;
  top_cards: TopCard[];
  updated_at?: string;
}

export default function RankPage() {
  const [rankingType, setRankingType] = useState<RankingType>('points')
  const [weeklyRankData, setWeeklyRankData] = useState<RankUser[]>([])
  const [levelRankData, setLevelRankData] = useState<RankUser[]>([])
  const [challengerRankData, setChallengerRankData] = useState<ChallengerRankUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [weeklyError, setWeeklyError] = useState('')
  const [levelError, setLevelError] = useState('')
  const [challengerError, setChallengerError] = useState('')
  const { userInfo } = useAuthStore()
  const router = useRouter()
  const [isGuideOpen, setIsGuideOpen] = useState(false)
  
  // Fetch data for active ranking type
  useEffect(() => {
    const fetchRankData = async () => {
      setLoading(true)
      setError('')
      
      try {
        if (rankingType === 'points') {
          // Only fetch if we don't have data yet
          if (weeklyRankData.length === 0) {
            try {
              const weeklyData = await rankApi.getWeeklySpentRanking(100)
              setWeeklyRankData(weeklyData)
              setWeeklyError('')
            } catch (err) {
              console.error('Failed to get weekly spending ranking:', err)
              setWeeklyError('Failed to load weekly spending rankings')
            }
          }
        } else if (rankingType === 'rank') {
          // Only fetch if we don't have data yet
          if (levelRankData.length === 0) {
            try {
              const levelData = await rankApi.getTopLevelRanking(100)
              setLevelRankData(levelData)
              setLevelError('')
            } catch (err) {
              console.error('Failed to get level ranking:', err)
              setLevelError('Failed to load level rankings')
            }
          }
        } else if (rankingType === 'challenger') {
          // Only fetch if we don't have data yet
          if (challengerRankData.length === 0) {
            try {
              const challengerData = await rankApi.getChallengerRanking()
              setChallengerRankData(challengerData)
              setChallengerError('')
            } catch (err) {
              console.error('Failed to get challenger ranking:', err)
              setChallengerError('Failed to load challenger rankings')
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch ranking data:', err)
        setError('Failed to get ranking data, please try again later')
      } finally {
        setLoading(false)
      }
    }
    
    fetchRankData()
  }, [rankingType, weeklyRankData.length, levelRankData.length, challengerRankData.length])
  
  return (
    <div className={styles.container}>
      <RankingGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
      <div className={styles.tabContainer}>
        <button 
          className={`${styles.tab} ${rankingType === 'points' ? styles.activeTab : ''}`}
          onClick={() => setRankingType('points')}
        >
          Points Ranking
        </button>
        <button 
          className={`${styles.tab} ${rankingType === 'rank' ? styles.activeTab : ''}`}
          onClick={() => setRankingType('rank')}
        >
          Rank Ranking
        </button>
        <button 
          className={`${styles.tab} ${rankingType === 'challenger' ? styles.activeTab : ''}`}
          onClick={() => setRankingType('challenger')}
        >
          Challenger Ranking
        </button>
      </div>

      {error && (
        <div className={styles.error} style={{marginBottom: '20px'}}>
          {error}
        </div>
      )}
      
      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : rankingType === 'points' ? (
        <PointsRanking 
          data={weeklyRankData} 
          loading={loading} 
          error={weeklyError} 
          router={router}
          onOpenGuide={() => setIsGuideOpen(true)}
        />
      ) : rankingType === 'rank' ? (
        <RankRanking 
          data={levelRankData} 
          loading={loading} 
          error={levelError} 
          router={router}
        />
      ) : (
        <ChallengerRanking 
          data={challengerRankData} 
          loading={loading} 
          error={challengerError} 
          router={router}
        />
      )}
    </div>
  )
}

function PointsRanking({ data, loading, error, router, onOpenGuide }: { 
  data: RankUser[];
  loading: boolean;
  error: string;
  router: any;
  onOpenGuide: () => void;
}) {
  const [displayCount, setDisplayCount] = useState(20) // Start with showing 20 items
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  
  // 确保data是数组，且限制最多100条
  const safeData = Array.isArray(data) ? data.slice(0, 100) : []
  
  // 计算当前用户的排名
  const userId = getCurrentUserId()
  const userRank = userId ? safeData.findIndex(user => user.user_id === userId) + 1 : -1
  const userPoints = userId && userRank > 0 ? (safeData[userRank - 1].spent || 0) : 0
  
  // 获取前三名玩家
  const topThreePlayers = safeData.slice(0, 3)
  
  // 获取当前显示的数据
  const currentDisplayData = safeData.slice(0, displayCount)
  
  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (target.isIntersecting && !loadingMore && displayCount < safeData.length) {
          setLoadingMore(true)
          // Simulate loading delay for smooth experience
          setTimeout(() => {
            setDisplayCount(prev => Math.min(prev + 20, safeData.length))
            setLoadingMore(false)
          }, 300)
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
  }, [loadingMore, displayCount, safeData.length])
  
  if (loading) {
    return <div className={styles.loading}>加载中...</div>
  }
  
  return (
    <>
      <div className={styles.header}>
        <div className={styles.rankingTitle}>
          <h1>Weekly Spending Ranking</h1>
          <div
            className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg px-3 py-2 flex items-center gap-2"
            onClick={onOpenGuide}
            role="button"
            aria-label="Open ranking guide"
            style={{ zIndex: 10 }}
          >
            <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
            <span className="text-white text-sm">Guide</span>
          </div>
        </div>
        <div className={styles.endTime}>
          <span>Time remaining this week: {getWeekRemainingTime()}</span>
        </div>
      </div>

      <div className={styles.statsSection}>
        <h2>Your Statistics</h2>
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <label>Rank:</label>
            <span>{userRank > 0 ? userRank : '-'}</span>
          </div>
          <div className={styles.statCard}>
            <label>Points Spent:</label>
            <span>{userPoints > 0 ? userPoints.toLocaleString() : '-'}</span>
          </div>
          <div className={styles.statCard}>
            <label>Prize:</label>
            <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              {userId && userRank > 0 && userRank <= 10 ? (
                <>
                  <Image 
                    src="/payment/coin.png" 
                    alt="Prize" 
                    width={20} 
                    height={20} 
                  />
                  {getPrizeAmount(userRank).toLocaleString()}
                </>
              ) : '-'}
            </span>
          </div>
        </div>
      </div>

      <div className={styles.topPlayers}>
        {/* Second place */}
        {topThreePlayers.length >= 2 && (
          <div className={styles.playerCard + ' ' + styles.secondPlace}>
            <div className={styles.crown}>
              <span>2</span>
            </div>
            <div 
              className={styles.avatar}
              onClick={() => router.push(`/user/${topThreePlayers[1].user_id}?from=ranking`)}
              style={{ cursor: 'pointer' }}
            >
              <Image 
                {...getImageProps(getValidAvatarUrl(topThreePlayers[1].avatar))}
                alt={`${topThreePlayers[1].display_name || 'Player'} avatar`} 
                width={80} 
                height={80} 
              />
            </div>
            <div className={styles.playerInfo}>
              <h3>{topThreePlayers[1].display_name}</h3>
              <p>{(topThreePlayers[1].spent || 0).toLocaleString()}<span>pts</span></p>
            </div>
          </div>
        )}

        {/* First place */}
        {topThreePlayers.length >= 1 && (
          <div className={styles.playerCard + ' ' + styles.firstPlace}>
            <div className={styles.crown}>
              <span>1</span>
            </div>
            <div 
              className={styles.avatar}
              onClick={() => router.push(`/user/${topThreePlayers[0].user_id}?from=ranking`)}
              style={{ cursor: 'pointer' }}
            >
              <Image 
                {...getImageProps(getValidAvatarUrl(topThreePlayers[0].avatar))}
                alt={`${topThreePlayers[0].display_name || 'Player'} avatar`} 
                width={80} 
                height={80} 
              />
            </div>
            <div className={styles.playerInfo}>
              <h3>{topThreePlayers[0].display_name}</h3>
              <p>{(topThreePlayers[0].spent || 0).toLocaleString()}<span>pts</span></p>
            </div>
          </div>
        )}

        {/* Third place */}
        {topThreePlayers.length >= 3 && (
          <div className={styles.playerCard + ' ' + styles.thirdPlace}>
            <div className={styles.crown}>
              <span>3</span>
            </div>
            <div 
              className={styles.avatar}
              onClick={() => router.push(`/user/${topThreePlayers[2].user_id}?from=ranking`)}
              style={{ cursor: 'pointer' }}
            >
              <Image 
                {...getImageProps(getValidAvatarUrl(topThreePlayers[2].avatar))}
                alt={`${topThreePlayers[2].display_name || 'Player'} avatar`} 
                width={80} 
                height={80} 
              />
            </div>
            <div className={styles.playerInfo}>
              <h3>{topThreePlayers[2].display_name}</h3>
              <p>{(topThreePlayers[2].spent || 0).toLocaleString()}<span>pts</span></p>
            </div>
          </div>
        )}
      </div>

      {/* Ranking table */}
      <div className={styles.rankingTable}>
        <div className={styles.tableHeader}>
          <div>Rank</div>
          <div>Player</div>
          <div>Points Spent</div>
          <div>Prize</div>
        </div>
        <div className={styles.tableBody}>
          {currentDisplayData.length > 0 ? (
            currentDisplayData.map((user, index) => {
              const rank = index + 1;
              return (
                <div key={user.user_id} className={`${styles.tableRow} ${styles.pointsTableRow}`}>
                  <div className={styles.rank}>{rank}</div>
                  <div 
                    className={styles.player}
                    onClick={() => router.push(`/user/${user.user_id}?from=ranking`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Image 
                      {...getImageProps(getValidAvatarUrl(user.avatar))}
                      alt={`${user.display_name || 'Player'} avatar`} 
                      width={40} 
                      height={40} 
                    />
                    <span>{user.display_name}</span>
                  </div>
                  <div className={styles.points}>{(user.spent || 0).toLocaleString()}<span>pts</span></div>
                  <div className={styles.grade}>
                    {rank <= 10 ? (
                      <span style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <Image 
                          src="/payment/coin.png" 
                          alt="Prize" 
                          width={20} 
                          height={20} 
                        />
                        {getPrizeAmount(rank).toLocaleString()}
                      </span>
                    ) : (
                      <span>-</span>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.noDataRow}>No ranking data available</div>
          )}
        </div>
      </div>
      
      {/* Infinite scroll trigger and loading indicator */}
      {displayCount < safeData.length && (
        <div ref={loadMoreRef} className={styles.loadMoreContainer}>
          {loadingMore ? (
            <div className={styles.loadingMore}>Loading more...</div>
          ) : (
            <div className={styles.scrollHint}>Scroll for more</div>
          )}
        </div>
      )}
      {displayCount >= safeData.length && safeData.length > 0 && (
        <div className={styles.endMessage}>
          Showing top {safeData.length} players
        </div>
      )}
    </>
  )
}

function RankRanking({ data, loading, error, router }: { 
  data: RankUser[];
  loading: boolean;
  error: string;
  router: any;
}) {
  const [displayCount, setDisplayCount] = useState(20) // Start with showing 20 items
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  
  // 确保data是数组，且限制最多100条
  const safeData = Array.isArray(data) ? data.slice(0, 100) : []
  
  // 获取用户信息
  const { userInfo } = useAuthStore();
  
  // 获取当前显示的数据
  const currentDisplayData = safeData.slice(0, displayCount)
  
  // Infinite scroll with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (target.isIntersecting && !loadingMore && displayCount < safeData.length) {
          setLoadingMore(true)
          // Simulate loading delay for smooth experience
          setTimeout(() => {
            setDisplayCount(prev => Math.min(prev + 20, safeData.length))
            setLoadingMore(false)
          }, 300)
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
  }, [loadingMore, displayCount, safeData.length])
  
  return (
    <>
      <div className={styles.header}>
        <div className={styles.rankingTitle}>
          <h1>Level Ranking</h1>
        </div>
      </div>

      <div className={styles.statsSection}>
        <h2>Your Statistics</h2>
        <div className={styles.statsBar}>
          <div className={styles.statItem}>Level: {userInfo?.level || '-'}</div>
        </div>
      </div>

      {loading ? (
        <div className={styles.loading}>Loading...</div>
      ) : (
        <div className={styles.rankCards}>
          {safeData.length > 0 && safeData.slice(0, 3).map((user, index) => (
            <div key={user.user_id} className={styles.rankCard}>
              <div 
                className={styles.avatar}
                onClick={() => router.push(`/user/${user.user_id}?from=ranking`)}
                style={{ cursor: 'pointer' }}
              >
                <Image 
                  {...getImageProps(getValidAvatarUrl(user.avatar))}
                  alt={`${user.display_name || 'Player'} avatar`} 
                  width={40} 
                  height={40} 
                />
              </div>
              <div className={styles.playerInfo}>
                <h3>{user.display_name}</h3>
                <div className={styles.badges}>
                  {/* 根据等级显示徽章 */}
                  <span>Level {user.level}</span>
                </div>
              </div>
              <div className={styles.points}>{(user.total_drawn || 0).toLocaleString()}<span>pts</span></div>
            </div>
          ))}
          {(safeData.length === 0 && !error) && (
            <div className={styles.noData}>No ranking data available</div>
          )}
          {error && (
            <div className={styles.noData}>Failed to load ranking data</div>
          )}
        </div>
      )}

      <div className={styles.rankingTable}>
        <div className={styles.tableHeader}>
          <div>Rank</div>
          <div>Player</div>
          <div>Total Spent</div>
          <div>Level</div>
        </div>
        <div className={styles.tableBody}>
          {!loading && !error && currentDisplayData.length > 0 ? (
            currentDisplayData.map((user, index) => {
              const rank = index + 1;
              return (
                <div key={user.user_id} className={`${styles.tableRow} ${styles.rankTableRow}`}>
                  <div className={styles.rank}>{rank}</div>
                  <div 
                    className={styles.player}
                    onClick={() => router.push(`/user/${user.user_id}?from=ranking`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <Image 
                      {...getImageProps(getValidAvatarUrl(user.avatar))}
                      alt={`${user.display_name || 'Player'} avatar`} 
                      width={40} 
                      height={40} 
                    />
                    <span>{user.display_name}</span>
                  </div>
                  <div className={styles.points}>{(user.total_drawn || 0).toLocaleString()}<span>pts</span></div>
                  <div className={styles.grade}>
                    <span>Level {user.level}</span>
                    <div className={styles.badges}>
                      {/* 等级徽章 */}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.noDataRow}>No ranking data available</div>
          )}
        </div>
      </div>

      {/* Infinite scroll trigger and loading indicator */}
      {displayCount < safeData.length && (
        <div ref={loadMoreRef} className={styles.loadMoreContainer}>
          {loadingMore ? (
            <div className={styles.loadingMore}>Loading more...</div>
          ) : (
            <div className={styles.scrollHint}>Scroll for more</div>
          )}
        </div>
      )}
      {displayCount >= safeData.length && safeData.length > 0 && (
        <div className={styles.endMessage}>
          Showing top {safeData.length} players
        </div>
      )}
    </>
  )
}

function ChallengerRanking({ data, loading, error, router }: { 
  data: ChallengerRankUser[];
  loading: boolean;
  error: string;
  router: any;
}) {
  const [displayCount, setDisplayCount] = useState(20)
  const [loadingMore, setLoadingMore] = useState(false)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  
  const safeData = Array.isArray(data) ? data : []
  const currentDisplayData = safeData.slice(0, displayCount)
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (target.isIntersecting && !loadingMore && displayCount < safeData.length) {
          setLoadingMore(true)
          setTimeout(() => {
            setDisplayCount(prev => Math.min(prev + 20, safeData.length))
            setLoadingMore(false)
          }, 300)
        }
      },
      { root: null, rootMargin: '100px', threshold: 0.1 }
    )

    const currentRef = loadMoreRef.current
    if (currentRef) observer.observe(currentRef)
    return () => { if (currentRef) observer.unobserve(currentRef) }
  }, [loadingMore, displayCount, safeData.length])
  
  if (loading) return <div className={styles.loading}>Loading challenger rankings...</div>
  
  return (
    <>
      <div className={styles.header}>
        <div className={styles.rankingTitle}>
          <h1>Challenger Rankings</h1>
          <div className="flex flex-col gap-2">
            <div className="text-center text-sm text-gray-400 bg-[#1E1F35] rounded-lg px-3 py-2">
              Based on top 3 most valuable cards
            </div>
            <div className="text-center bg-gradient-to-r from-blue-500/20 to-purple-500/20 border border-blue-400/30 rounded-lg px-4 py-2 animate-pulse">
              <div className="flex items-center justify-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span className="text-blue-300 font-medium text-sm">
                  🔄 Refreshed Every Hour
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.rankingTable}>
        <div className={styles.tableHeader}>
          <div>Rank</div>
          <div>Challenger</div>
          <div>Total Value</div>
          <div>Top Cards</div>
        </div>
        <div className={styles.tableBody}>
          {!loading && !error && currentDisplayData.length > 0 ? (
            currentDisplayData.map((challenger) => (
              <div key={challenger.user_id} className={`${styles.tableRow} ${styles.rankTableRow}`}>
                <div className={styles.rank}>#{challenger.rank}</div>
                <div 
                  className={styles.player}
                  onClick={() => router.push(`/user/${challenger.user_id}?from=ranking`)}
                  style={{ cursor: 'pointer' }}
                >
                  <Image 
                    {...getImageProps(getValidAvatarUrl(challenger.avatar))}
                    alt={`${challenger.display_name || 'Challenger'} avatar`} 
                    width={40} 
                    height={40} 
                  />
                  <span>{challenger.display_name}</span>
                </div>
                <div className={styles.points}>
                  {challenger.total_value.toLocaleString()}
                  <span>pts</span>
                </div>
                <div className={styles.topCards}>
                  <div className={styles.cardsList}>
                    {challenger.top_cards.slice(0, 3).map((card, cardIndex) => (
                      <div key={cardIndex} className={styles.cardItem}>
                        {card.image_url && (
                          <div className={styles.cardImage}>
                            <Image 
                              {...getImageProps(card.image_url)}
                              alt={card.card_name} 
                              width={30} 
                              height={30} 
                            />
                          </div>
                        )}
                        <div className={styles.cardInfo}>
                          <div className={styles.cardName}>{card.card_name}</div>
                          <div className={styles.cardValue}>{card.point_worth.toLocaleString()}pts</div>
                        </div>
                      </div>
                    ))}
                    {challenger.top_cards.length === 0 && (
                      <div className={styles.noCards}>No cards</div>
                    )}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className={styles.noDataRow}>
              {error ? 'Failed to load challenger rankings' : 'No challenger rankings available'}
            </div>
          )}
        </div>
      </div>

      {displayCount < safeData.length && (
        <div ref={loadMoreRef} className={styles.loadMoreContainer}>
          {loadingMore ? (
            <div className={styles.loadingMore}>Loading more...</div>
          ) : (
            <div className={styles.scrollHint}>Scroll for more</div>
          )}
        </div>
      )}
      {displayCount >= safeData.length && safeData.length > 0 && (
        <div className={styles.endMessage}>
          Showing top {safeData.length} challengers
        </div>
      )}
    </>
  )
}