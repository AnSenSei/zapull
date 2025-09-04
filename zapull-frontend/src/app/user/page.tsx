'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/authUtils'
import { signOut } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import ProfileModal from '@/components/ProfileModal'
import AddHighlightModal from '@/components/AddHighlightModal'
import AchievementSelectionModal from '@/components/AchievementSelectionModal'
import AchievementDetailModal from '@/components/AchievementDetailModal'
import SimpleCardDetailModal from '@/components/SimpleCardDetailModal'
import PaymentMethodsManager from '@/components/PaymentMethodsManager'
import { userApi, HighlightCard, HighlightsResponse } from '@/lib/userApi'
import { achievementApi, Achievement } from '@/lib/achievementApi'
import Image from 'next/image'
import { getImageProps } from '@/lib/image-loader'

export default function UserCenter() {
  const router = useRouter();
  const { userInfo, logout, uid, authInitialized } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isAddHighlightModalOpen, setIsAddHighlightModalOpen] = useState(false);
  const [isAchievementModalOpen, setIsAchievementModalOpen] = useState(false);
  const [deletingCardId, setDeletingCardId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);
  
  // Card detail modal states
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [showCardDetail, setShowCardDetail] = useState(false);
  
  // Highlights相关状态
  const [highlights, setHighlights] = useState<HighlightCard[]>([]);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [highlightsError, setHighlightsError] = useState('');
  
  // 成就相关状态
  const [achievementHighlights, setAchievementHighlights] = useState<Achievement[]>([]);
  const [achievementsLoading, setAchievementsLoading] = useState(false);
  const [achievementsError, setAchievementsError] = useState('');
  const [selectedAchievement, setSelectedAchievement] = useState<Achievement | null>(null);
  const [showAchievementDetail, setShowAchievementDetail] = useState(false);
  
  // Payment methods section state
  const [activeSection, setActiveSection] = useState<'profile' | 'payment'>('profile');
  
  // 默认用户数据，如果API获取失败则使用
  const user = {
    name: userInfo?.displayName || 'Flying fish',
    joinDate: userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString() : 'Jun 9, 2023',
    leaderboard: 0,
    accomplishments: 0,
    composite: 1
  };
  
  // 获取highlights数据的函数
  const fetchHighlights = async () => {
    const { uid } = useAuthStore.getState();
    if (!uid) {
      console.log('User not logged in, cannot fetch highlights');
      return;
    }
    
    try {
      setHighlightsLoading(true);
      setHighlightsError('');
      console.log('Fetching highlights, user ID:', uid);
      const response = await userApi.getHighlights(uid, {
        page: 1,
        per_page: 8,
        sort_by: 'date_got',
        sort_order: 'desc'
      });
      console.log('获取highlights成功:', response);
      // Add subcollection_name to each card for card detail fetching
      const cardsWithCollection = (response.cards || []).map(card => ({
        ...card,
        subcollection_name: response.subcollection_name
      }));
      setHighlights(cardsWithCollection);
    } catch (error) {
      console.error('Failed to fetch highlights:', error);
      setHighlightsError('Failed to fetch highlights, please try again later');
    } finally {
      setHighlightsLoading(false);
    }
  };

  // Show delete confirmation modal
  const showDeleteConfirmation = (cardId: string) => {
    setCardToDelete(cardId);
    setShowDeleteConfirm(true);
  };
  
  // Handle card click to show details
  const handleCardClick = (card: HighlightCard) => {
    setSelectedCard(card);
    setShowCardDetail(true);
  };

  // Confirm delete highlight card
  const confirmDeleteHighlight = async () => {
    const userId = useAuthStore.getState().uid;
    if (!userId || !cardToDelete) return;
    
    try {
      setDeletingCardId(cardToDelete);
      await userApi.removeCardFromHighlights(cardToDelete);
      // 重新获取highlights数据
      fetchHighlights();
      setShowDeleteConfirm(false);
      setCardToDelete(null);
    } catch (error) {
      console.error('Failed to delete highlight card:', error);
      setHighlightsError('Failed to delete highlight card');
    } finally {
      setDeletingCardId(null);
    }
  };

  // Cancel delete
  const cancelDelete = () => {
    setShowDeleteConfirm(false);
    setCardToDelete(null);
  };

  // Remove this duplicate useEffect - the one below will handle authentication

  // Fetch achievement highlights
  const fetchAchievementHighlights = async () => {
    const { uid } = useAuthStore.getState();
    if (!uid) {
      console.log('User not logged in, cannot fetch achievement highlights');
      return;
    }
    
    try {
      setAchievementsLoading(true);
      setAchievementsError('');
      console.log('Fetching achievement highlights, user ID:', uid);
      const response = await achievementApi.getUserAchievementHighlights();
      console.log('Fetched achievement highlights:', response);
      // Extract achievements array from response
      setAchievementHighlights(response.achievements || []);
    } catch (error) {
      console.error('Failed to fetch achievement highlights:', error);
      setAchievementsError('Failed to fetch achievement highlights, please try again later');
    } finally {
      setAchievementsLoading(false);
    }
  };
  
  // Remove achievement highlight
  const handleRemoveAchievementHighlight = async (achievementId: string) => {
    const userId = useAuthStore.getState().uid;
    if (!userId) return;
    
    try {
      await achievementApi.deleteAchievementHighlight(achievementId);
      // Refetch achievement highlights
      fetchAchievementHighlights();
    } catch (error) {
      console.error('Failed to remove achievement highlight:', error);
      setAchievementsError('Failed to remove achievement highlight');
    }
  };

  // Check authentication on mount - only after auth is initialized
  useEffect(() => {
    if (!authInitialized) {
      // Still initializing, keep loading
      return;
    }
    
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
      return;
    }
    setLoading(false);
  }, [router, authInitialized]);

  // 监听认证状态变化，当用户登录后获取highlights数据
  useEffect(() => {
    const { uid } = useAuthStore.getState();
    if (uid) {
      fetchHighlights();
      fetchAchievementHighlights();
    }
  }, [userInfo]);


  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      logout();
      router.push('/');
    } catch (error) {
      console.error('Sign out failed:', error);
    }
  };

  // Get rarity text (not used here, but keep in English to avoid non-English UI)
  const getRarityText = (rarity: number) => {
    switch (rarity) {
      case 1: return 'Common';
      case 2: return 'Rare';
      case 3: return 'Super Rare';
      case 4: return 'Epic';
      case 5: return 'Legendary';
      default: return `Rarity: ${rarity}`;
    }
  };

  // 获取稀有度颜色
  const getRarityColor = (rarity: number) => {
    switch (rarity) {
      case 1: return 'from-gray-400 to-gray-600';
      case 2: return 'from-green-400 to-green-600';
      case 3: return 'from-blue-400 to-blue-600';
      case 4: return 'from-purple-400 to-purple-600';
      case 5: return 'from-yellow-400 to-yellow-600';
      default: return 'from-gray-400 to-gray-600';
    }
  }



  if (loading || !authInitialized) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }
  
  return (
    <div className="text-white max-w-6xl mx-auto">
      {/* 个人资料编辑弹窗 */}
      {userInfo && (
        <ProfileModal 
          isOpen={isProfileModalOpen} 
          onClose={() => setIsProfileModalOpen(false)} 
          userId={auth.currentUser?.uid || ''}
        />
      )}
      
      {/* 添加高光卡片弹窗 */}
      <AddHighlightModal 
        isOpen={isAddHighlightModalOpen}
        onClose={() => setIsAddHighlightModalOpen(false)}
        onSuccess={() => {
          fetchHighlights();
          setIsAddHighlightModalOpen(false);
        }}
      />
      
      {/* 成就选择弹窗 */}
      <AchievementSelectionModal 
        isOpen={isAchievementModalOpen}
        onClose={() => setIsAchievementModalOpen(false)}
        onSuccess={() => {
          fetchAchievementHighlights();
          setIsAchievementModalOpen(false);
        }}
      />
      
      {/* 删除确认弹窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-[#2A2B3D] rounded-lg p-6 max-w-md w-full mx-4 border border-[#4A4B5F]">
            <h3 className="text-lg font-semibold text-white mb-4">Delete Highlight Card</h3>
            <p className="text-gray-300 mb-6">Are you sure you want to remove this card from your highlights? This action cannot be undone.</p>
            <div className="flex space-x-3">
              <button
                onClick={cancelDelete}
                className="flex-1 px-4 py-2 bg-[#4A4B5F] text-white rounded-lg hover:bg-[#5A5B6F] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteHighlight}
                disabled={deletingCardId === cardToDelete}
                className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deletingCardId === cardToDelete ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      

      
      {/* 统计信息卡片 */}
      						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-6 p-3 sm:p-4 rounded-lg" style={{ backgroundColor: 'rgba(16, 17, 37, 0.6)' }}>
        						<StatCard iconPath="/users/public-point.png" title="Points spent" value={userInfo?.totalPointsSpent || 0} color="#FFC34F" />
        						<StatCard iconPath="/users/accomplishment.png" title="Achievements" value={userInfo?.totalAchievements || 0} color="#59ABFF" />
        						<StatCard iconPath="/users/craftingCard.png" title="Card fusions" value={userInfo?.totalFusion || 1} color="#F372F8" />
      </div>
      
      {/* 用户信息栏 */}
      <div className="bg-[#2A2B3D] rounded-lg p-4 sm:p-6 mb-6">
        {/* 桌面端布局 */}
        <div className="hidden sm:flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="relative">
              <Image
                {...getImageProps(userInfo?.avatar || "/avatars/default.svg")}
                alt="Profile"
                width={96}
                height={96}
                className="w-24 h-24 rounded-full bg-[#3F3F5F] object-cover"
              />
              <span className="absolute bottom-0 right-0 w-5 h-5 bg-green-500 rounded-full border-2 border-[#2A2B3D]"></span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-2xl font-bold">{userInfo?.displayName || user.name}</h2>
                <button 
                  className="text-[#8B5CF6] hover:text-[#7C3AED]"
                  onClick={() => setIsProfileModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" className="w-5 h-5">
                    <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-4 text-gray-400 text-sm">
                <span>Level {userInfo?.level || 1}</span>
                <span>•</span>
                <span>{userInfo?.totalAchievements || 0} Achievements</span>
                <span>•</span>
                <span>Joined {userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString() : user.joinDate}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center">
            {/* One-click sharing removed */}
          </div>
        </div>

        {/* 移动端布局 */}
        <div className="sm:hidden">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="relative">
              <Image
                {...getImageProps(userInfo?.avatar || "/avatars/default.svg")}
                alt="Profile"
                width={80}
                height={80}
                className="w-20 h-20 rounded-full bg-[#3F3F5F] object-cover"
              />
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 rounded-full border-2 border-[#2A2B3D]"></span>
            </div>
            <div className="flex flex-col items-center space-y-2">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold">{userInfo?.displayName || user.name}</h2>
                <button 
                  className="text-[#8B5CF6] hover:text-[#7C3AED]"
                  onClick={() => setIsProfileModalOpen(true)}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path fill="currentColor" d="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-col items-center gap-1 text-gray-400 text-sm">
                <div className="flex items-center gap-2">
                  <span>Level {userInfo?.level || 1}</span>
                  <span>•</span>
                  <span>{userInfo?.totalAchievements || 0} Achievements</span>
                </div>
                <span>Joined {userInfo?.createdAt ? new Date(userInfo.createdAt).toLocaleDateString() : user.joinDate}</span>
              </div>
            </div>
            {/* One-click sharing removed on mobile as well */}
          </div>
        </div>
      </div>
      
      {/* Section Navigation Tabs */}
      <div className="bg-[#2A2B3D] rounded-lg p-2 mb-6">
        <div className="flex space-x-2">
          <button
            onClick={() => setActiveSection('profile')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeSection === 'profile'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-[#1E1F2E] text-gray-400 hover:text-white hover:bg-[#3F3F5F]'
            }`}
          >
            <span className="flex items-center justify-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Profile & Achievements</span>
            </span>
          </button>
          <button
            onClick={() => setActiveSection('payment')}
            className={`flex-1 px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
              activeSection === 'payment'
                ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                : 'bg-[#1E1F2E] text-gray-400 hover:text-white hover:bg-[#3F3F5F]'
            }`}
          >
            <span className="flex items-center justify-center space-x-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span>Payment Methods</span>
            </span>
          </button>
        </div>
      </div>
        
      {/* Conditional Content Based on Active Section */}
      {activeSection === 'profile' ? (
        <>
          {/* 徽章和高亮展示 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[#2A2B3D] rounded-lg p-6">
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
            {achievementsError && (
              <p className="text-red-400 text-sm">{achievementsError}</p>
            )}
          </div>
          
          {/* 成就徽章展示 */}
          <div className="grid grid-cols-5 gap-3">
            {achievementsLoading ? (
              // 加载状态
              [...Array(5)].map((_, i) => (
                <div 
                  key={`loading-${i}`} 
                  className="w-24 h-24 rounded-full bg-[#3F3F5F] animate-pulse"
                />
              ))
            ) : (
              // 显示真实数据和空位置
              [...Array(10)].map((_, i) => {
                const achievement = achievementHighlights[i];
                if (achievement) {
                  return (
                    	<div 
                      key={achievement.id}
                      className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity group relative"
                      style={{ background: '#1E1F2E', border: '1px solid #4A3E77' }}
                      onClick={() => {
                        setSelectedAchievement(achievement);
                        setShowAchievementDetail(true);
                      }}
                    >
                      {achievement.emblemUrl ? (
                        <Image 
                          src={achievement.emblemUrl} 
                          alt={achievement.name}
                          width={80}
                          height={80}
                          className="object-contain w-14 h-14 sm:w-20 sm:h-20" />
                      ) : (
                        <span className="text-xl">🏆</span>
                      )}
                      
                      {/* 悬浮提示 */}
                      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-black bg-opacity-75 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-30">
                        {achievement.name}
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div 
                      key={`empty-${i}`}
                      className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity group"
                      style={{ background: '#0E0E20', border: '1px solid #4A3E77' }}
                      onClick={() => setIsAchievementModalOpen(true)}
                    >
                      <svg 
                        className="w-5 h-5 text-gray-500 group-hover:text-gray-400 transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  );
                }
              })
            )}
          </div>
        </div>

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
            {highlightsError && (
              <p className="text-red-400 text-sm">{highlightsError}</p>
            )}
          </div>
          
          {/* Highlights卡片展示 */}
          <div className="grid grid-cols-5 gap-3">
            {highlightsLoading ? (
              // 加载状态
              [...Array(5)].map((_, i) => (
                <div 
                  key={`loading-${i}`} 
                  className="bg-[#1E1F2E] rounded-lg animate-pulse aspect-[3/4]"
                />
              ))
            ) : (
              // 显示真实数据和空位置
              [...Array(5)].map((_, i) => {
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
                            No image
                          </div>
                        )}
                      </div>
                      
                      {/* 卡片信息悬浮层 */}
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-all duration-200 flex items-end z-10 pointer-events-none">
                        <div className="w-full p-3 text-white transform translate-y-full group-hover:translate-y-0 transition-transform duration-200">
                          <h4 className="font-semibold text-sm truncate">{card.card_name}</h4>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-gray-300 text-xs">Quantity: {card.quantity}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div 
                      key={`empty-${i}`}
                      className="bg-[#1E1F2E] rounded-lg flex items-center justify-center cursor-pointer hover:bg-[#2F3040] transition-colors group aspect-[3/4]"
                      onClick={() => setIsAddHighlightModalOpen(true)}
                    >
                      <svg 
                        className="w-4 h-4 text-gray-500 group-hover:text-gray-400 transition-colors" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                    </div>
                  );
                }
              })
            )}

          </div>
        </div>
      </div>
        </>
      ) : (
        /* Payment Methods Section */
        <div className="bg-[#2A2B3D] rounded-lg p-6">
          <PaymentMethodsManager />
        </div>
      )}
      
      {/* Card Detail Modal */}
      <SimpleCardDetailModal
        card={selectedCard}
        isOpen={showCardDetail}
        onClose={() => {
          setShowCardDetail(false);
          setSelectedCard(null);
        }}
        onDelete={showDeleteConfirmation}
        showDeleteButton={true}
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
        onDelete={handleRemoveAchievementHighlight}
        showDeleteButton={true}
      />
    </div>
  )
}

function StatCard({ iconPath, title, value, color }: { iconPath: string, title: string, value: number, color: string }) {
  return (
    <div className="h-[53px] flex items-center justify-center sm:justify-start space-x-2 px-2 sm:px-0">
      <Image 
        src={iconPath} 
        alt={title} 
        width={16} 
        height={16} 
        className="object-contain flex-shrink-0"
      />
      <p className="text-lg sm:text-xl font-bold flex-shrink-0" style={{ color }}>{value}</p>
      <p className="text-gray-400 text-xs sm:text-sm truncate">{title}</p>
    </div>
  )
}