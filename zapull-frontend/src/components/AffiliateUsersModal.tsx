'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { getImageProps } from '@/lib/image-loader'

interface ReferralUser {
  id: string;
  displayName: string;
  avatar: string;
  createdAt: string;
}

interface AffiliateUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: ReferralUser[];
}

export default function AffiliateUsersModal({ isOpen, onClose, users }: AffiliateUsersModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
      <motion.div 
        className="relative w-full max-w-2xl overflow-y-auto max-h-[90vh]"
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ duration: 0.2 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '20px',
          border: '2px solid #8B5CF6'
        }}
      >
        <div className="p-4 sm:p-6">
        {/* 标题和关闭按钮 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h2 className="text-xl font-semibold text-white">Invited Users</h2>
          <button
            onClick={onClose}
            className="absolute -top-2 -right-2 text-white hover:text-gray-300 transition-colors z-10"
            aria-label="Close modal"
          >
            <Image src="/icons/close.png" alt="Close" width={24} height={24} />
          </button>
        </div>

        {/* 用户列表 */}
        <div className="p-4 overflow-y-auto max-h-[60vh]">
          {users.length > 0 ? (
            <div className="space-y-4">
              {users.map((user) => (
                <div key={user.id} className="flex items-center space-x-4 p-3 bg-[#1F2032] rounded-lg">
                  <div className="relative">
                    <Image
                      {...getImageProps(user.avatar || "/avatars/default.svg")}
                      alt={user.displayName}
                      width={48}
                      height={48}
                      className="w-12 h-12 rounded-full bg-[#3F3F5F] object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-medium text-white">{user.displayName}</p>
                    <p className="text-sm text-gray-400">Joined {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-16 h-16 rounded-full bg-[#3F3F5F] flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
              <p className="text-gray-400">No users invited yet</p>
            </div>
          )}
        </div>
        </div>
      </motion.div>
    </div>
  );
}