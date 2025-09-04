'use client'

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'

interface PackGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function PackGuideModal({ isOpen, onClose }: PackGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

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
            <h2 className="text-2xl font-bold text-white">Pack Information Guide</h2>
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            <div className="space-y-6">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-400 mb-3">🎲 Provably Fair System</h3>
                <div className="space-y-4 text-gray-300">
                  <div>
                    <p className="mb-2 font-medium">What is Provably Fair?</p>
                    <p className="text-sm mb-3">
                      Our provably fair system ensures that all pack openings are completely random and verifiable. 
                      You can independently verify that we haven't manipulated the results.
                    </p>
                  </div>
                  <div>
                    <p className="mb-2 font-medium">How to Verify:</p>
                    <ul className="list-disc list-inside space-y-1 text-sm">
                      <li>Each pack opening generates a unique hash</li>
                      <li>The server seed and client seed combine to determine results</li>
                      <li>You can verify past results using the provided seeds</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-blue-400 mb-3">📊 Verification Steps</h3>
                <div className="space-y-3">
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-white font-medium mb-1">Step 1: Access History</p>
                    <p className="text-gray-400 text-sm">
                      Go to your <Link href="/history" className="text-purple-400 hover:text-purple-300 underline">History page</Link> to view all past pack openings
                    </p>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-white font-medium mb-1">Step 2: View Details</p>
                    <p className="text-gray-400 text-sm">Click on any pack opening to see the server seed, client seed, and nonce</p>
                  </div>
                  <div className="bg-gray-900 p-3 rounded-lg">
                    <p className="text-white font-medium mb-1">Step 3: Verify</p>
                    <p className="text-gray-400 text-sm">Use the provided information to independently verify the results</p>
                  </div>
                </div>
              </div>

              <div className="bg-purple-900/30 border border-purple-500 rounded-lg p-4">
                <h3 className="text-lg font-semibold text-purple-400 mb-2">🔍 Learn More</h3>
                <p className="text-gray-300 text-sm mb-3">
                  For detailed information about our provably fair system and how to verify results:
                </p>
                <div className="flex gap-3">
                  <Link 
                    href="/history" 
                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
                  >
                    View History
                  </Link>
                  <Link 
                    href="/provably-fair" 
                    className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm font-medium"
                  >
                    Provably Fair Info
                  </Link>
                </div>
              </div>
            </div>
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  )
}
