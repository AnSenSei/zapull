'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/authUtils'
import { userApi } from '@/lib/userApi'
import AffiliateGuideModal from '@/components/AffiliateGuideModal'
import { getImageProps } from '@/lib/image-loader'
// 导入类型定义

interface ReferralsData {
  total_referred: number;
  total_point_refered: number;
}

export default function AffiliatePage() {
  const router = useRouter();
  const { userInfo, authInitialized } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [copySuccess, setCopySuccess] = useState(false);
  const [navTab, setNavTab] = useState('affiliate'); // 导航栏当前选中的标签
  
  // 推广数据状态
  const [referCode, setReferCode] = useState('');
  const [referrals, setReferrals] = useState<ReferralsData>({
    total_referred: 0,
    total_point_refered: 0
  });
  
  // Guide modal visibility
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  
  useEffect(() => {
    // Wait for auth initialization before checking authentication
    if (!authInitialized) {
      return;
    }
    
    // 检查用户是否已登录
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
      return;
    }
    
    // 获取用户ID
    const userId = useAuthStore.getState().uid;
    if (!userId) {
      setLoading(false);
      return;
    }
    
    // 获取邀请码
    const fetchReferCode = async () => {
      try {
        const response = await userApi.getReferCode(userId);
        setReferCode(response.refer_code);
      } catch (error) {
        console.error('获取邀请码失败:', error);
      }
    };
    
    // 获取邀请用户列表
    const fetchReferrals = async () => {
      try {
        const response = await userApi.getReferrals(userId);
        setReferrals({
          total_referred: response.total_referred,
          total_point_refered: response.total_point_refered || 0
        });
      } catch (error) {
        console.error('获取邀请列表失败:', error);
      }
    };
    
    // 调用API
    Promise.all([fetchReferCode(), fetchReferrals()])
      .finally(() => setLoading(false));
  }, [router, userInfo, authInitialized]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referCode);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };
  
  // Removed handleShowUsers - clicking is disabled

  if (loading || !authInitialized) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6 text-white">
      {/* 用户信息栏和功能栏 - 从inventory页面添加的导航栏 */}
      <div className="bg-[#2A2B3D] rounded-lg overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center p-4 space-y-4 md:space-y-0">
          <div className="flex items-center space-x-4 w-full md:w-auto">
            <div className="relative">
              <Image
                {...getImageProps(userInfo?.avatar || "/avatars/default.svg")}
                alt="Profile"
                width={64}
                height={64}
                className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#3F3F5F] object-cover"
              />
              <span className="absolute bottom-0 right-0 w-3 h-3 md:w-4 md:h-4 bg-green-500 rounded-full border-2 border-[#2A2B3D]"></span>
            </div>
            <div>
              <h2 className="text-lg md:text-xl font-semibold text-white">{userInfo?.displayName || 'User'}</h2>
              <p className="text-gray-400 text-xs md:text-sm">View public profile</p>
            </div>
            {/* 分隔线 */}
            <div className="hidden md:block border-l border-[#c5c5c5] h-[36px] mx-4"></div>
          </div>
           
          <div className="flex flex-wrap gap-2 md:flex-nowrap md:space-x-4 md:ml-4 w-full md:w-auto">
            <Link
              href="/inventory"
              className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center ${navTab === 'inventory' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5]'}`}
            >
              Inventory
            </Link>
            <Link
              href="/user/withdrawals"
              className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center ${navTab === 'withdrawals' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5]'}`}
            >
              Withdrawals
            </Link>
            <Link
              href="/synthesis"
              className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center ${navTab === 'synthesis' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5]'}`}
            >
              Synthesis
            </Link>
            <button
              onClick={() => setNavTab('settings')}
              className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base ${navTab === 'settings' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5]'}`}
            >
              Settings
            </button>
          </div>
        </div>
      </div>
      
      {/* 页面标题 - 使用渐变色和居中 */}
      <h1 
        className="text-[32px] font-bold text-center mt-6 mb-[26px] px-4"
        style={{
          background: 'linear-gradient(89deg, #BDA9FF 0%, #F4F1FF 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text'
        }}
      >
        My Affiliate
      </h1>

      {/* 推广中心内容 - 使用特定背景和圆角 */}
      <div className="w-[95%] sm:w-[90%] md:w-[85%] lg:w-[80%] mx-auto px-2 sm:px-3 md:px-4">
        <div className="bg-[#101125] rounded-[10px] p-4 sm:p-5 md:p-6 flex items-center justify-center">
            {/* 使用flex布局的模块，使用justify-between分隔code和统计模块 */}
            <div className="flex flex-col md:flex-row gap-6 md:gap-8 w-full items-center justify-between md:flex-wrap lg:flex-nowrap">
            {/* 推广码部分 */}
            <div className="w-[544px] max-w-full md:w-full lg:w-[544px]">
              <h2 className="text-lg font-semibold mb-2 flex items-center justify-between">
                <span className="flex items-center">
                  My Affiliate Code
                </span>
                {/* Guide button - same style as pack detail/inventory */}
                <button 
                  type="button"
                  onClick={() => setIsGuideOpen(true)}
                  className="text-center cursor-pointer hover:opacity-80 transition-opacity bg-[#1E1F35] rounded-lg px-3 py-2 ml-3 flex items-center gap-2"
                >
                  <Image src="/marketplace/operation.png" alt="operation" width={20} height={20} />
                  <span className="text-gray-300 text-xs">Guide</span>
                </button>
              </h2>
              <div className="flex items-center overflow-hidden" style={{ background: 'rgba(136,104,255,0.2)', borderRadius: '15px', border: '1px solid #8868FF', height: '60px' }}>
                <div className="flex-grow p-4">
                  <p className="text-white break-all">{referCode || 'Loading...'}</p>
                </div>
                <button 
                  onClick={handleCopyCode}
                  className={`text-white px-4 py-4 h-full transition-colors ${copySuccess ? 'bg-green-500' : ''}`}
                  style={{ background: '#8868FF', borderRadius: '10px', color: '#fff' }}
                  disabled={!referCode}
                >
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            {/* 统计数据 */}
            <div className="flex flex-col sm:flex-col md:flex-row gap-4 md:gap-6 lg:gap-8 items-center justify-between w-full md:w-auto">
              {/* 用户数量 */}
              <div className="relative w-[262px] h-[164px] sm:w-full md:w-[230px] lg:w-[262px] overflow-hidden rounded-[15px]">
                {/* 使用深色背景和渐变 */}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(167,131,6,0.1), rgba(255,213,65,0.05))', borderRadius: '15px', border: '2px solid rgba(255,216,98,0.79)' }}></div>
                <div className="relative px-[26px] py-[12px] flex flex-col justify-between h-full">
                  <div className="flex w-full">
                    <div className="rounded-full flex">
                      <Image src="/affiliate/user.png" alt="Users" width={32} height={32} />
                    </div>
                  </div>
                  <div className="w-full mt-auto">
                    <h3 className="text-gray-400 mb-2">Users</h3>
                    <p className="text-2xl font-bold">{referrals.total_referred}</p>
                  </div>
                </div>
              </div>
              
              {/* 收益 */}
              <div className="relative w-[262px] h-[164px] sm:w-full md:w-[230px] lg:w-[262px] overflow-hidden rounded-[15px]">
                {/* 使用深色背景和渐变 */}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(0deg, rgba(38,21,101,0.1), rgba(164,140,255,0.05))', borderRadius: '15px', border: '2px solid rgba(170,147,255,0.79)' }}></div>
                <div className="relative px-[26px] py-[12px] flex flex-col justify-between h-full">
                  <div className="flex w-full">
                    <div className="rounded-full flex">
                      <Image src="/users/coin.png" alt="Earnings" width={32} height={32} />
                    </div>
                  </div>
                  <div className="w-full mt-auto">
                    <h3 className="text-gray-400 mb-2">Total Earnings</h3>
                    <p className="text-2xl font-bold flex items-center">
                      <Image src="/users/coin.png" alt="Coin" width={18} height={18} className="mr-1" />
                      {referrals.total_point_refered.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* Affiliate guide modal */}
      <AffiliateGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />
    </div>
  )
}
