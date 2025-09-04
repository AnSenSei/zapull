'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

interface RankingGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function RankingGuideModal({ isOpen, onClose }: RankingGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'weekly' | 'prizes'>('weekly')

  // Close on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    if (isOpen) document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
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
            <h2 className="text-2xl font-bold text-white">Weekly Ranking Guide</h2>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
              aria-label="Close"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('weekly')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'weekly' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              🗓️ Weekly Rules
            </button>
            <button
              onClick={() => setActiveTab('prizes')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'prizes' ? 'text-purple-400 border-b-2 border-purple-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              🏆 Prizes
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            {activeTab === 'weekly' && (
              <div className="space-y-4 text-gray-300">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-2">How it works</h3>
                  <ul className="list-disc list-inside space-y-2 text-sm">
                    <li>The weekly cycle ends every <span className="text-white font-semibold">Monday 12:00 AM EDT</span>.</li>
                    <li>Only <span className="text-yellow-300 font-semibold">points spent on pulls</span> count toward the leaderboard.</li>
                    <li>Your personal stats show your current rank, points spent this week, and potential prize if you’re in Top 10.</li>
                    <li>Ties are resolved by the earlier time reaching the final points value.</li>
                  </ul>
                </div>
                <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
                  <h4 className="text-blue-400 font-semibold mb-2">Tips</h4>
                  <ul className="list-disc list-inside space-y-1 text-blue-200 text-sm">
                    <li>The header shows the remaining time this week.</li>
                    <li>Click a player row to view their profile.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'prizes' && (
              <div className="space-y-4 text-gray-300">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-2">Top 10 Prize Pool</h3>
                  <p className="text-sm">
                    The Top 10 receive point prizes. Current distribution on the page applies; examples:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-sm mt-2">
                    <li><span className="text-yellow-300">1st</span>: 25,000 pts</li>
                    <li><span className="text-yellow-300">2nd</span>: 20,000 pts</li>
                    <li><span className="text-yellow-300">3rd</span>: 15,000 pts</li>
                    <li>… decreasing down to 10th: 5,000 pts</li>
                  </ul>
                </div>
                <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
                  <h4 className="text-red-400 font-semibold mb-2">Notes</h4>
                  <ul className="list-disc list-inside space-y-1 text-red-200 text-sm">
                    <li>Prizes are credited after the weekly cycle ends.</li>
                    <li>Accounts flagged for abuse may be disqualified.</li>
                  </ul>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
