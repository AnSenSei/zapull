'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { userApi } from '@/lib/userApi'
import { useAuthStore } from '@/store/authStore'
import toast from 'react-hot-toast'
import { toastSuccess } from '@/lib/toast'

export default function DailyRewardPage() {
  const router = useRouter()
  const { userInfo, setUserInfo } = useAuthStore()
  const [rewardStatus, setRewardStatus] = useState<{
    has_claimed: boolean
    today_date: string
    claim_id: string | null
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimedCard, setClaimedCard] = useState<{
    card_name: string
    point_worth: number
    image_url: string
    rarity: number
    color?: string
  } | null>(null)
  const [showCardModal, setShowCardModal] = useState(false)

  // Fetch daily reward status on component mount
  useEffect(() => {
    const fetchRewardStatus = async () => {
      try {
        setIsLoading(true)
        const status = await userApi.checkDailyRewardStatus()
        setRewardStatus(status)
      } catch (error) {
        console.error('Failed to check daily reward status:', error)
        toast.error('Failed to check daily reward status')
      } finally {
        setIsLoading(false)
      }
    }

    fetchRewardStatus()
  }, [])

  // Refresh user points information
  const refreshUserPoints = async () => {
    try {
      const updatedUserInfo = await userApi.getUserInfo()
      setUserInfo(updatedUserInfo)
    } catch (error) {
      console.error('Failed to refresh user points:', error)
    }
  }

  // Handle claiming daily reward
  const handleClaimReward = async () => {
    if (!rewardStatus || rewardStatus.has_claimed || isClaiming) return

    try {
      setIsClaiming(true)
      const result = await userApi.claimDailyReward()
      
      // Update reward status
      setRewardStatus(prev => prev ? { ...prev, has_claimed: true } : null)
      
      // Show claimed card
      setClaimedCard(result.card)
      setShowCardModal(true)
      
      // Refresh user points
      await refreshUserPoints()
      
      toastSuccess(`${result.message} You received ${result.card.point_worth} points!`)
    } catch (error: any) {
      console.error('Failed to claim daily reward:', error)
      
      // Handle specific error cases
      if (error.response?.status === 403) {
        const detail = error.response?.data?.detail
        if (typeof detail === 'string' && detail.includes('already claimed')) {
          toast.error('You have already claimed your daily reward today')
          // Update status to reflect this
          setRewardStatus(prev => prev ? { ...prev, has_claimed: true } : null)
        } else {
          toast.error('You have already claimed your daily reward today')
        }
      } else {
        toast.error('Failed to claim daily reward. Please try again.')
      }
    } finally {
      setIsClaiming(false)
    }
  }

  // Close card modal
  const handleCloseModal = () => {
    setShowCardModal(false)
    setClaimedCard(null)
  }

  // Map rarity number to color for visual effects
  const getRarityColor = (rarity: number): string => {
    switch (rarity) {
      case 1: return '#10B981' // green - common
      case 2: return '#3B82F6' // blue - rare
      case 3: return '#8B5CF6' // purple - epic
      case 4: return '#F59E0B' // orange - legendary
      default: return '#10B981'
    }
  }

  // Map rarity number to name
  const getRarityName = (rarity: number): string => {
    switch (rarity) {
      case 1: return 'Common'
      case 2: return 'Rare'
      case 3: return 'Epic'
      case 4: return 'Legendary'
      default: return 'Common'
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#1A1B2E] via-[#16213E] to-[#0F172A] flex items-center justify-center">
        <div className="text-white text-xl">Loading daily reward...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1A1B2E] via-[#16213E] to-[#0F172A]">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button */}
        <div className="mb-6">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <span className="text-xl">←</span>
            <span>Back</span>
          </button>
        </div>

        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            📦 Daily Free Points Box
          </h1>
          <p className="text-gray-300 text-lg">
            Claim your daily free points box and build up your point balance!
          </p>
        </div>

        {/* Pack Display */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-gradient-to-br from-[#2A2B3D] to-[#1E1F2E] rounded-2xl p-8 border border-purple-500/20 shadow-2xl">
            {/* Pack Image */}
            <div className="aspect-square max-w-md mx-auto mb-8 relative">
              <div className="w-full h-full bg-gradient-to-br from-purple-600/20 to-blue-600/20 rounded-xl flex items-center justify-center border-2 border-purple-500/30">
                <div className="text-center">
                  <div className="text-8xl mb-4">📦</div>
                  <div className="text-white text-xl font-semibold">Daily Free Box</div>
                </div>
              </div>
            </div>

            {/* Pack Info */}
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-white mb-4">Daily Free Points Box</h2>
              <p className="text-gray-300 mb-6">
                Contains random points based on card rarity. Available every 24 hours!
              </p>
              
              {/* Reward Details */}
              <div className="bg-[#1A1B2E] rounded-lg p-4 mb-6">
                <h3 className="text-white font-semibold mb-3">Possible Rewards:</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-green-400">Common (40%)</span>
                    <span className="text-white">Low points</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-400">Rare (50%)</span>
                    <span className="text-white">Medium points</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-purple-400">Epic (10%)</span>
                    <span className="text-white">High points</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-orange-400">Legendary</span>
                    <span className="text-white">Max points</span>
                  </div>
                </div>
              </div>

              {/* Status Display */}
              {rewardStatus && (
                <div className="mb-6">
                  <div className="flex items-center justify-center gap-2 text-sm text-gray-400 mb-4">
                    <span>📅</span>
                    <span>Today: {rewardStatus.today_date}</span>
                  </div>
                  
                  {rewardStatus.has_claimed ? (
                    <div className="bg-green-500/20 border border-green-500/30 rounded-lg p-4">
                      <div className="text-green-400 font-semibold mb-2">✅ Already Claimed</div>
                      <div className="text-green-300 text-sm">
                        You have already claimed your daily reward today. Come back tomorrow!
                      </div>
                    </div>
                  ) : (
                    <div className="bg-purple-500/20 border border-purple-500/30 rounded-lg p-4">
                      <div className="text-purple-400 font-semibold mb-2">🎁 Available</div>
                      <div className="text-purple-300 text-sm">
                        Your daily reward is ready to claim!
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Claim Button */}
              <button
                onClick={handleClaimReward}
                disabled={!rewardStatus || rewardStatus.has_claimed || isClaiming}
                className={`w-full py-4 px-8 rounded-xl font-bold text-lg transition-all ${
                  !rewardStatus || rewardStatus.has_claimed || isClaiming
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transform hover:scale-105 shadow-lg'
                }`}
              >
                {isClaiming ? (
                  <div className="flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Claiming...
                  </div>
                ) : rewardStatus?.has_claimed ? (
                  'Already Claimed Today'
                ) : (
                  '🎁 Claim Daily Reward'
                )}
              </button>

              {/* Next Claim Info */}
              {rewardStatus?.has_claimed && (
                <div className="mt-4 text-gray-400 text-sm">
                  Next claim available tomorrow
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Current Points Display */}
        {userInfo && (
          <div className="max-w-md mx-auto mt-8">
            <div className="bg-[#1A1B2E] rounded-lg p-4 text-center border border-gray-700">
              <div className="text-gray-400 text-sm mb-1">Current Balance</div>
              <div className="flex items-center justify-center gap-2">
                <Image 
                  src="/users/coin.png" 
                  alt="Coin" 
                  width={20} 
                  height={20} 
                />
                <span className="text-white font-bold text-xl">
                  {userInfo.pointsBalance?.toLocaleString() || 0}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Claimed Card Modal */}
      {showCardModal && claimedCard && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-[#2A2B3D] to-[#1E1F2E] rounded-2xl p-8 max-w-lg w-full border border-purple-500/30 relative">
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-gray-400 hover:text-white text-2xl"
            >
              ×
            </button>

            {/* Modal Content */}
            <div className="text-center">
              <div className="text-4xl mb-4">🎉</div>
              <h2 className="text-2xl font-bold text-white mb-4">
                Daily Reward Claimed!
              </h2>
              
              {/* Card Display */}
              <div className="bg-[#1A1B2E] rounded-lg p-6 mb-6">
                {claimedCard.image_url && (
                  <div className="aspect-square max-w-48 mx-auto mb-4 relative">
                    <Image
                      src={claimedCard.image_url}
                      alt={claimedCard.card_name}
                      fill
                      className="object-contain rounded-lg"
                    />
                  </div>
                )}
                
                <h3 className="text-xl font-bold text-white mb-2">
                  {claimedCard.card_name}
                </h3>
                
                <div 
                  className="inline-block px-3 py-1 rounded-full text-sm font-semibold mb-3"
                  style={{ 
                    backgroundColor: getRarityColor(claimedCard.rarity) + '20',
                    color: getRarityColor(claimedCard.rarity),
                    border: `1px solid ${getRarityColor(claimedCard.rarity)}30`
                  }}
                >
                  {getRarityName(claimedCard.rarity)}
                </div>
                
                <div className="flex items-center justify-center gap-2">
                  <Image 
                    src="/users/coin.png" 
                    alt="Coin" 
                    width={24} 
                    height={24} 
                  />
                  <span className="text-white font-bold text-2xl">
                    +{claimedCard.point_worth}
                  </span>
                </div>
              </div>

              <button
                onClick={handleCloseModal}
                className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
              >
                Awesome!
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
