'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { userApi } from '@/lib/userApi'
import Image from 'next/image'
import { getImageProps } from '@/lib/image-loader'
import SimpleCardDetailModal from '@/components/SimpleCardDetailModal'
import AchievementDetailModal from '@/components/AchievementDetailModal'

interface PublicProfileData {
  displayName: string;
  avatar: string;
  level: number;
  totalAchievements: number;
  highlights: Array<{
    id: string;
    card_name: string;
    image_url: string;
    point_worth: number;
    rarity: number;
    card_collection_id?: string;
    card_reference?: string;
  }>;
  achievementHighlights: Array<{
    id: string;
    name: string;
    description: string;
    emblemUrl: string;
    achieved: boolean;
    awardedAt: any;
  }>;
}

export default function PublicUserProfile() {
  const params = useParams();
  const userId = params.userId as string;
  const searchParams = useSearchParams();
  const router = useRouter();
  const fromPage = searchParams.get('from');
  
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState<PublicProfileData | null>(null);
  const [error, setError] = useState('');
  
  // Card detail modal states
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [selectedAchievement, setSelectedAchievement] = useState<any>(null);
  const [showAchievementDetail, setShowAchievementDetail] = useState(false);
  
  // Fetch public profile data
  const fetchPublicProfile = async () => {
    if (!userId) return;
    
    try {
      setLoading(true);
      setError('');
      const data = await userApi.getPublicProfile(userId);
      setProfileData(data);
    } catch (error) {
      console.error('Failed to fetch public profile:', error);
      setError('Failed to load user profile');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchPublicProfile();
  }, [userId]);
  
  // Handle card click to show details
  const handleCardClick = (card: any) => {
    setSelectedCard(card);
    setShowCardDetail(true);
  };
  
  // Get rarity text and color functions (same as in the original user page)
  const getRarityText = (rarity: number) => {
    switch (rarity) {
      case 1: return '普通';
      case 2: return '稀有';
      case 3: return '超稀有';
      case 4: return '史诗';
      case 5: return '传说';
      default: return `稀有度: ${rarity}`;
    }
  };

  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 1: return 'from-gray-400 to-gray-600';
      case 2: return 'from-green-400 to-green-600';
      case 3: return 'from-blue-400 to-blue-600';
      case 4: return 'from-purple-400 to-purple-600';
      case 5: return 'from-yellow-400 to-yellow-600';
      default: return 'from-gray-400 to-gray-600';
    }
  };
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }
  
  if (error || !profileData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-white">
        <p className="text-xl mb-4">{error || 'User not found'}</p>
        <Link href="/" className="text-purple-500 hover:text-purple-400">
          Back to Home
        </Link>
      </div>
    );
  }
  
  const { displayName, avatar, level, totalAchievements, highlights, achievementHighlights } = profileData;
  
  // Helper function to get emblem URL (similar to the logic in achievementApi.ts)
  const getEmblemUrl = (achievement: any) => {
    if (achievement.emblemUrl) {
      return achievement.emblemUrl;
    }
    // Extract emblem URL from reward array if emblemUrl is null
    const emblemFromReward = Array.isArray(achievement.reward)
      ? achievement.reward.find((r: any) => r?.type === 'emblem' && (r.url || r.emblemUrl))
      : undefined;
    return emblemFromReward?.url || emblemFromReward?.emblemUrl || null;
  };
  
  return (
    <div className="text-white max-w-6xl mx-auto pt-8 sm:pt-4">
      {/* Back button - similar to pack detail page */}
      {fromPage && (
        <button
          onClick={() => {
            if (fromPage === 'ranking') {
              router.push('/rank');
            } else if (fromPage === 'home') {
              router.push('/');
            } else {
              router.push('/');
            }
          }}
          className="flex items-center gap-2 mb-4 px-4 py-2 bg-[#2A2B3D] rounded-lg hover:bg-[#3A3B4D] transition-colors"
        >
          <svg 
            width="20" 
            height="20" 
            viewBox="0 0 20 20" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
          >
            <path 
              d="M12.5 15L7.5 10L12.5 5" 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
          <span>Back to {fromPage === 'ranking' ? 'Ranking' : fromPage === 'home' ? 'Home' : 'Home'}</span>
        </button>
      )}
      
      {/* 用户信息栏 */}
      <div className="bg-[#2A2B3D] rounded-lg p-6 mb-6">
        <div className="flex items-start gap-6">
          <div className="relative">
            <Image 
              {...getImageProps(avatar || "/avatars/default.svg")}
              alt="Profile" 
              width={96}
              height={96}
              className="w-24 h-24 rounded-full bg-[#3F3F5F] object-cover"
            />
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold mb-2">{displayName || 'Unknown User'}</h2>
            <div className="flex items-center gap-4 text-gray-400">
              <span>Level {level}</span>
              <span>•</span>
              <span>{totalAchievements} Achievements</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Emblems/Achievements Section */}
      {achievementHighlights && achievementHighlights.length > 0 && (
        <div className="bg-[#2A2B3D] rounded-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold flex items-center space-x-2">
              <Image 
                src="/users/emblems.png" 
                alt="Emblems" 
                width={20} 
                height={20} 
                className="object-contain"
              />
              <span>Emblems</span>
            </h3>
          </div>
          
          <div className="flex flex-wrap gap-4">
            {achievementHighlights.map((achievement) => (
              <div 
                key={achievement.id}
                className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity group relative"
                style={{ background: 'linear-gradient(135deg, #8B5CF6, #EC4899)', border: '2px solid #4A3E77' }}
                onClick={() => {
                  setSelectedAchievement(achievement);
                  setShowAchievementDetail(true);
                }}
              >
                {getEmblemUrl(achievement) ? (
                  <Image 
                    src={getEmblemUrl(achievement)} 
                    alt={achievement.name}
                    width={80}
                    height={80}
                    className="object-contain w-14 h-14 sm:w-20 sm:h-20"
                  />
                ) : (
                  <span className="text-xl">🏆</span>
                )}
                
                {/* 悬浮提示 */}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black bg-opacity-75 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-30">
                  {achievement.name}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
        
      {/* 高亮展示 */}
      <div className="bg-[#2A2B3D] rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold flex items-center space-x-2">
            <Image 
              src="/users/highlights.png" 
              alt="Highlights" 
              width={20} 
              height={20} 
              className="object-contain"
            />
            <span>Highlights</span>
          </h3>
        </div>
        
        {/* Highlights卡片展示 */}
        <div className="grid grid-cols-5 gap-3">
          {[...Array(5)].map((_, i) => {
            const card = highlights[i];
            if (card) {
              return (
                <div 
                  key={card.id} 
                  className="bg-[#1E1F2E] rounded-lg overflow-hidden relative group cursor-pointer hover:transform hover:scale-105 transition-all duration-200"
                  onClick={() => handleCardClick(card)}
                >
                  <div className="aspect-[3/4] relative">
                    {card.image_url ? (
                      <Image 
                        src={card.image_url} 
                        alt={card.card_name} 
                        fill
                        className="object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400">
                        无图片
                      </div>
                    )}
                  </div>
                  
                  {/* 卡片信息悬浮层 */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all duration-200 flex items-end z-10 pointer-events-none">
                    <div className="w-full p-3 text-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                      <h4 className="font-semibold text-sm truncate">{card.card_name}</h4>
                    </div>
                  </div>
                </div>
              );
            } else {
              return (
                <div 
                  key={`empty-${i}`}
                  className="bg-[#1E1F2E] rounded-lg flex items-center justify-center aspect-[3/4]"
                >
                  <span className="text-gray-500">-</span>
                </div>
              );
            }
          })}
        </div>
      </div>
      
      {/* Card Detail Modal */}
      <SimpleCardDetailModal
        card={selectedCard}
        isOpen={showCardDetail}
        onClose={() => {
          setShowCardDetail(false);
          setSelectedCard(null);
        }}
      />
      
      {/* 成就详情弹窗 */}
      <AchievementDetailModal
        isOpen={showAchievementDetail}
        onClose={() => {
          setShowAchievementDetail(false);
          setSelectedAchievement(null);
        }}
        achievementId={selectedAchievement?.id || null}
        initialAchievement={selectedAchievement}
      />
    </div>
  )
}

