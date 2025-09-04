'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

interface AffiliateGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AffiliateGuideModal({ isOpen, onClose }: AffiliateGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'howto' | 'faq'>('overview')

  // ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey)
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
        <motion.div 
          ref={modalRef}
          className="relative w-full max-w-3xl max-h-[85vh] overflow-hidden"
          style={{
            background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
            borderRadius: '20px',
            border: '2px solid #8B5CF6'
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="relative p-4 text-center border-b border-gray-700">
            <h2 className="text-2xl font-bold text-white">Affiliate Program Guide</h2>
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'overview' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              💎 Overview
            </button>
            <button
              onClick={() => setActiveTab('howto')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'howto' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🔗 How to Use
            </button>
            <button
              onClick={() => setActiveTab('faq')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'faq' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ❓ FAQ
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">💡 How affiliate works</h3>
                  <div className="space-y-4 text-gray-300 text-sm">
                    <p>• Share your affiliate code with friends.</p>
                    <p>• When users apply your affiliate code and recharge points, you earn <span className="text-green-400 font-bold">5%</span> of the recharged amount in points.</p>
                    <p>• Earnings are automatically accumulated under your account.</p>
                  </div>
                </div>

                <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-green-400 mb-2">🧮 Example</h3>
                  <div className="text-gray-300 text-sm space-y-2">
                    <p>If a referred user recharges $25 (3,000 points with bonus), you earn <span className="text-green-400 font-bold">125 points</span> (5% of $25).</p>
                    <p>If they recharge $100 (12,000 points with bonus), you earn <span className="text-green-400 font-bold">500 points</span> (5% of $100).</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'howto' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">🔗 Steps</h3>
                  <ol className="list-decimal list-inside space-y-2 text-gray-300 text-sm">
                    <li>Copy your affiliate code from the My Affiliate page.</li>
                    <li>Share it with friends.</li>
                    <li>They enter your code when recharging points.</li>
                    <li>You automatically receive 5% of their recharge amount in points.</li>
                  </ol>
                </div>
                <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-400 mb-2">📎 Tips</h3>
                  <ul className="list-disc list-inside space-y-1 text-gray-300 text-sm">
                    <li>Each user can apply an affiliate code once per account.</li>
                    <li>Ensure your friends are logged in before applying the code.</li>
                    <li>Bonuses post automatically after successful recharge.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'faq' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">❓ Frequently Asked</h3>
                  <div className="space-y-3 text-gray-300 text-sm">
                    <div>
                      <p className="font-medium text-white">When do I receive the 5%?</p>
                      <p>Immediately after the referred user's recharge succeeds.</p>
                    </div>
                    <div>
                      <p className="font-medium text-white">Where can I see my total earnings?</p>
                      <p>On this page under Total Earnings.</p>
                    </div>
                    <div>
                      <p className="font-medium text-white">Can a referred user change codes?</p>
                      <p>No, referral binding is one-time per account.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  )
}

