'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'

interface MarketplaceGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function MarketplaceGuideModal({ isOpen, onClose }: MarketplaceGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'buying' | 'selling' | 'offers'>('buying')

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
            <h2 className="text-2xl font-bold text-white">How Marketplace Works</h2>
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
              onClick={() => setActiveTab('buying')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'buying' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              💰 Buying Cards
            </button>
            <button
              onClick={() => setActiveTab('selling')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'selling' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📦 Selling Cards
            </button>
            <button
              onClick={() => setActiveTab('offers')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'offers' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🤝 Making Offers
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            {activeTab === 'buying' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">🛒 Direct Purchase</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">1.</span>
                      Browse listings in the marketplace or official store
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">2.</span>
                      Click "Buy Now" to purchase at the listed price
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">3.</span>
                      Pay with points or cash (USD)
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">4.</span>
                      Card is instantly added to your inventory
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">💡 Accepted Offers</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      When a seller accepts your offer, you have 48 hours to complete payment
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Check "My Offers" to see accepted offers requiring payment
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      After payment, the card is transferred to your inventory
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'selling' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">📝 Creating Listings</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">1.</span>
                      Go to your Inventory and select a card to sell
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">2.</span>
                      Set your price in points, cash, or both
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">3.</span>
                      Choose quantity and expiration date (optional)
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">4.</span>
                      Card is locked from your inventory until sold or withdrawn
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">💳 Cash Sales Setup</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      To accept cash payments, you need a connected Stripe account
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      First-time sellers will be prompted to set up Stripe Connect
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Funds from cash sales go directly to your Stripe account
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">✅ Managing Sales</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      View all your listings in "My Listings"
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Accept or decline offers on your listings
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Withdraw listings anytime (unless offer is accepted)
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Buyers have 48 hours to pay after you accept their offer
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {activeTab === 'offers' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">🎯 Making Offers</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">1.</span>
                      Click "Make Offer" on any listing
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">2.</span>
                      Enter your offer amount (points or cash)
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">3.</span>
                      Set offer duration (1, 3, 7, 14, or 30 days)
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">4.</span>
                      Wait for seller to accept, decline, or counter
                    </li>
                  </ul>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">📈 Offer Management</h3>
                  <ul className="space-y-2 text-gray-300">
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Update your offer to a higher amount anytime
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Withdraw unaccepted offers at any time
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      View all your offers in "My Offers" section
                    </li>
                    <li className="flex items-start">
                      <span className="text-purple-400 mr-2">•</span>
                      Highest offer is displayed on the listing
                    </li>
                  </ul>
                </div>

                <div className="bg-red-900/20 border border-red-600 rounded-lg p-4">
                  <h3 className="text-red-400 font-semibold mb-2">⚠️ Important Restrictions</h3>
                  <ul className="space-y-1 text-red-300 text-sm">
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      Users with 2+ past due offers cannot make new offers
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      You can still update existing offers if restricted
                    </li>
                    <li className="flex items-start">
                      <span className="mr-2">•</span>
                      Contact support to resolve past due issues
                    </li>
                  </ul>
                </div>

                <div className="bg-blue-900/20 border border-blue-600 rounded-lg p-4">
                  <h3 className="text-blue-400 font-semibold mb-2">💰 Payment Timeline</h3>
                  <p className="text-blue-300 text-sm">
                    Once your offer is accepted, you have <strong>48 hours</strong> to complete the payment. 
                    Failure to pay on time may result in penalties and restrictions on future offers.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700">
            <div className="flex justify-between items-center">
              <p className="text-gray-400 text-xs">
                Need help? Visit our <a href="/support" className="text-purple-400 hover:text-purple-300">Support Center</a>
              </p>
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