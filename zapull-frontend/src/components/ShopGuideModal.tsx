'use client'

import { useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

interface ShopGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function ShopGuideModal({ isOpen, onClose }: ShopGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Lock body scroll and ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    if (isOpen) {
      // Lock body scroll
      document.body.style.overflow = 'hidden'
      document.addEventListener('keydown', handleEscKey)
    }

    return () => {
      // Restore body scroll
      document.body.style.overflow = 'unset'
      document.removeEventListener('keydown', handleEscKey)
    }
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4">
        <motion.div 
          ref={modalRef}
          className="relative w-full max-w-2xl max-h-[85vh] overflow-hidden"
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
            <h2 className="text-2xl font-bold text-white">Shop Operation Guide</h2>
            <button 
              onClick={onClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-160px)]">
            <div className="space-y-6">
              {/* Shipping Cost */}
              <div className="bg-gradient-to-r from-blue-900/40 to-blue-800/40 border border-blue-500/50 rounded-lg p-5">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">🚚</div>
                  <div>
                    <h3 className="text-lg font-semibold text-blue-300 mb-2">Shipping</h3>
                    <ul className="space-y-2 text-gray-300 text-sm">
                      <li className="flex items-start">
                        <span className="text-blue-400 mr-2">•</span>
                        <span>Shipping cost is calculated in real time, and the system automatically selects the most economical option</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-blue-400 mr-2">•</span>
                        <span><strong>Minimum shipping fee is $4.46</strong></span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Cancellation Policy */}
              <div className="bg-gradient-to-r from-yellow-900/40 to-yellow-800/40 border border-yellow-500/50 rounded-lg p-5">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">⚠️</div>
                  <div>
                    <h3 className="text-lg font-semibold text-yellow-300 mb-2">Cancellation Policy</h3>
                    <ul className="space-y-2 text-gray-300 text-sm">
                      <li className="flex items-start">
                        <span className="text-yellow-400 mr-2">•</span>
                        <span>You can <strong>cancel your order for free</strong> before it's processed</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-yellow-400 mr-2">•</span>
                        <span>Once the order status changes to <strong>Processed</strong>, cancellation is no longer available</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-yellow-400 mr-2">•</span>
                        <span>To view or cancel your order, go to <strong>Orders → Shop</strong></span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Processing Time */}
              <div className="bg-gradient-to-r from-purple-900/40 to-purple-800/40 border border-purple-500/50 rounded-lg p-5">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">📦</div>
                  <div>
                    <h3 className="text-lg font-semibold text-purple-300 mb-2">Order Processing</h3>
                    <ul className="space-y-2 text-gray-300 text-sm">
                      <li className="flex items-start">
                        <span className="text-purple-400 mr-2">•</span>
                        <span>Orders are usually shipped within <strong>four business days</strong> after they are processed</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-purple-400 mr-2">•</span>
                        <span>You will receive a tracking number once your order ships</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Import Information */}
              <div className="bg-gradient-to-r from-green-900/40 to-green-800/40 border border-green-500/50 rounded-lg p-5">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">🌍</div>
                  <div>
                    <h3 className="text-lg font-semibold text-green-300 mb-2">International Shipping</h3>
                    <ul className="space-y-2 text-gray-300 text-sm">
                      <li className="flex items-start">
                        <span className="text-green-400 mr-2">•</span>
                        <span><strong>All Japanese products are shipped from the USA</strong></span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-400 mr-2">•</span>
                        <span>Import duties have already been covered by us</span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-green-400 mr-2">•</span>
                        <span><strong>You don't need to pay any additional customs fees</strong></span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Product Condition */}
              <div className="bg-gradient-to-r from-indigo-900/40 to-indigo-800/40 border border-indigo-500/50 rounded-lg p-5">
                <div className="flex items-start">
                  <div className="text-3xl mr-4">✨</div>
                  <div>
                    <h3 className="text-lg font-semibold text-indigo-300 mb-2">Product Condition</h3>
                    <ul className="space-y-2 text-gray-300 text-sm">
                      <li className="flex items-start">
                        <span className="text-indigo-400 mr-2">•</span>
                        <span>Cards without a condition description in the card's name are <strong>near mint</strong></span>
                      </li>
                      <li className="flex items-start">
                        <span className="text-indigo-400 mr-2">•</span>
                        <span>Booster boxes without a condition description in the name are <strong>with shrink</strong></span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-gray-800/50 border border-gray-600 rounded-lg p-5">
                <h3 className="text-lg font-semibold text-white mb-3">Quick Actions</h3>
                <div className="flex flex-col space-y-2">
                  <a 
                    href="/user/withdrawals?tab=shop" 
                    className="inline-flex items-center justify-center px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
                  >
                    View My Orders
                  </a>
                  <a 
                    href="/support" 
                    className="inline-flex items-center justify-center px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-medium rounded-lg transition-colors"
                  >
                    Contact Support
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex justify-end">
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
