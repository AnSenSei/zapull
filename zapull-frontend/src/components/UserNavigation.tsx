'use client'

import Link from 'next/link'
import Image from 'next/image'
import { getImageProps } from '@/lib/image-loader'
import { useAuthStore } from '@/store/authStore'
import { usePathname } from 'next/navigation'

interface UserNavigationProps {
  className?: string
}

export default function UserNavigation({ className = '' }: UserNavigationProps) {
  const { userInfo } = useAuthStore()
  const pathname = usePathname()

  // 根据当前路径确定活跃的tab
  const getActiveTab = () => {
    if (pathname.includes('/inventory')) return 'inventory'
    if (pathname.includes('/withdrawals')) return 'withdrawals'
    if (pathname.includes('/synthesis')) return 'fusion'
    if (pathname.includes('/listed')) return 'listings'
    return ''
  }

  const activeTab = getActiveTab()

  return (
    <div className={`bg-[#2A2B3D] rounded-lg overflow-hidden ${className}`}>
      <div className="flex flex-col md:flex-row items-start md:items-center p-4 space-y-4 md:space-y-0">
        <div className="flex items-center space-x-4 w-full md:w-auto">
          <div className="relative">
            <Image
              {...getImageProps(userInfo?.avatar || "/avatars/default.svg")}
              alt="Profile"
              width={64}
              height={64}
              className="w-12 h-12 md:w-16 md:h-16 rounded-full bg-[#3F3F5F]"
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
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center transition-colors ${
              activeTab === 'inventory' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5] hover:bg-[#3A3366]'
            }`}
          >
            Inventory
          </Link>
          <Link
            href="/user/withdrawals"
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center transition-colors ${
              activeTab === 'withdrawals' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5] hover:bg-[#3A3366]'
            }`}
          >
            Withdrawals
          </Link>
          <Link
            href="/synthesis"
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center transition-colors ${
              activeTab === 'fusion' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5] hover:bg-[#3A3366]'
            }`}
          >
            Fusion
          </Link>
          <Link
            href="/listed"
            className={`flex-1 md:flex-none px-3 md:px-4 py-2 rounded-[19px] text-sm md:text-base text-center transition-colors ${
              activeTab === 'listings' ? 'bg-[#8868FF] text-white' : 'bg-[#282251] text-[#c5c5c5] hover:bg-[#3A3366]'
            }`}
          >
            Listings
          </Link>
        </div>
      </div>
    </div>
  )
}