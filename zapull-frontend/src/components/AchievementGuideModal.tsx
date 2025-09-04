'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'

interface AchievementGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function AchievementGuideModal({ isOpen, onClose }: AchievementGuideModalProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }

    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [isOpen])

  if (!mounted || !isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal Content */}
      <div className="relative bg-[#1E1F35] rounded-xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
        
        {/* Title */}
        <h2 className="text-2xl font-bold text-white mb-6">How Achievements Work</h2>
        
        {/* Content */}
        <div className="space-y-4 text-gray-300">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🎯</span>
              Achievement System
            </h3>
            <p className="leading-relaxed">
              Achievements are special milestones you can reach by playing the game. Each achievement has specific goals to complete.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🏆</span>
              Types of Achievements
            </h3>
            <ul className="space-y-1 ml-8 list-disc">
              <li>Level Achievements - Reach certain user levels</li>
              <li>Fusion Achievements - Complete card fusions</li>
              <li>Draw Achievements - Draw cards of specific rarities</li>
              <li>Trading Achievements - Buy or sell cards in the marketplace</li>
              <li>Withdrawal Achievements - Complete card withdrawals</li>
            </ul>
          </div>


          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">🔔</span>
              Automatic Notifications
            </h3>
            <p className="leading-relaxed bg-purple-600/20 border border-purple-600/30 rounded-lg p-3">
              <strong>When you complete an achievement, a notification will automatically pop up</strong> to congratulate you and show your rewards. You don't need to check manually - we'll let you know as soon as you reach your goal!
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <span className="text-2xl">📊</span>
              Tracking Progress
            </h3>
            <p className="leading-relaxed">
              Each achievement shows a progress bar indicating how close you are to completing it. Check the "All" tab to see all available achievements, or the "Done" tab to view your completed achievements.
            </p>
          </div>
        </div>
        
        {/* Action button */}
        <button
          onClick={onClose}
          className="mt-6 w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition-colors"
        >
          Got it!
        </button>
      </div>
    </div>
  )
}