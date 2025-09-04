'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'

interface FusionGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function FusionGuideModal({ isOpen, onClose }: FusionGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'normal' | 'special'>('overview')

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
            <h2 className="text-2xl font-bold text-white">How Fusion Works</h2>
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('overview')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'overview'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🧪 Overview
            </button>
            <button
              onClick={() => setActiveTab('special')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'special'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ✨ Special Fusion
            </button>
            <button
              onClick={() => setActiveTab('normal')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'normal'
                  ? 'text-purple-400 border-b-2 border-purple-400'
                  : 'text-gray-400 hover:text-white'
              }`}
              disabled
              title="Coming soon"
            >
              🔧 Normal Fusion
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            {activeTab === 'overview' && (
              <div className="space-y-4 text-gray-300">
                <p>Fusion lets you combine cards to obtain new, rarer or more valuable cards. There are two modes:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Special Fusion</strong>: Use predefined recipes per pack to fuse exact target cards.</li>
                  <li><strong>Normal Fusion</strong> (coming soon): Combine two cards of the same collection for a random result.</li>
                </ul>
              </div>
            )}

            {activeTab === 'special' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">📦 Selecting a Pack</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li>Choose a collection; packs are grouped under it.</li>
                    <li>Expand a pack to view its fusion recipes and your ownership status.</li>
                  </ul>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">🧩 Recipes & Requirements</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li>Each recipe requires specific input cards from the same pack.</li>
                    <li>You must own the required cards in your inventory to fuse.</li>
                  </ul>
                </div>
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">⚙️ Performing Fusion</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li>Click Fuse on an available recipe. Required cards will be consumed.</li>
                    <li>If successful, the result card is added to your inventory.</li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'normal' && (
              <div className="space-y-4 text-gray-300">
                <p>Normal fusion is coming soon. It will allow combining two cards from the same collection for a chance at higher rarity.</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex justify-between items-center">
              <Link href="/support" className="text-purple-400 hover:text-purple-300 text-xs underline" aria-label="Go to Support Center">
                Visit Support Center
              </Link>
              <button
                onClick={onClose}
                className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-lg transition-colors"
              >
                Got it!
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

