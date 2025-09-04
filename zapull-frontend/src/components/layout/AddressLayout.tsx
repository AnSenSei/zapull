'use client'

import { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface AddressLayoutProps {
  children: ReactNode
}

export default function AddressLayout({ children }: AddressLayoutProps) {
  const pathname = usePathname()
  
  return (
    <div className="container mx-auto px-4 py-6 max-w-6xl">
      {/* 移动端响应式导航 */}
      <div className="md:hidden mb-6">
        <div className="bg-[#2A2B3D] rounded-lg p-4">
          <div className="flex space-x-4 overflow-x-auto scrollbar-thin scrollbar-thumb-[#3F3F5F] scrollbar-track-transparent pb-2">
            <Link 
              href="/user" 
              className={`whitespace-nowrap px-4 py-2 rounded-md ${pathname === '/user' ? 'bg-[#8B5CF6] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Profile
            </Link>
            <Link 
              href="/user/address" 
              className={`whitespace-nowrap px-4 py-2 rounded-md ${pathname.includes('/user/address') ? 'bg-[#8B5CF6] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Addresses
            </Link>
            <Link 
              href="/inventory" 
              className={`whitespace-nowrap px-4 py-2 rounded-md ${pathname === '/inventory' ? 'bg-[#8B5CF6] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Inventory
            </Link>
            <Link 
              href="/user/withdrawals" 
              className={`whitespace-nowrap px-4 py-2 rounded-md ${pathname.includes('/user/withdrawals') ? 'bg-[#8B5CF6] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Withdrawals
            </Link>
            <Link 
              href="/user/affiliate" 
              className={`whitespace-nowrap px-4 py-2 rounded-md ${pathname.includes('/user/affiliate') ? 'bg-[#8B5CF6] text-white' : 'text-gray-400 hover:text-white'}`}
            >
              Affiliate
            </Link>
          </div>
        </div>
      </div>
      
      {/* 内容区域 */}
      <div className="bg-[#1E1E2E] rounded-lg p-6">
        {children}
      </div>
    </div>
  )
}