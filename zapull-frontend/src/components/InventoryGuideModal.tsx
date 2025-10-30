'use client'

import { useState, useRef, useEffect } from 'react'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { userApi } from '@/lib/userApi'
import { useAuthStore } from '@/store/authStore'

interface InventoryGuideModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function InventoryGuideModal({ isOpen, onClose }: InventoryGuideModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<'redeem' | 'withdraw'>('redeem')
  const { userInfo, setUserInfo } = useAuthStore()
  
  // Handle closing modal and marking onboarding complete for new accounts
  const handleClose = async () => {
    // If this is a new account, mark onboarding as complete
    if (userInfo?.new_account === true) {
      try {
        const updatedUserInfo = await userApi.updateNewAccountStatus(false)
        setUserInfo(updatedUserInfo)
        console.log('New account onboarding marked as complete')
      } catch (error) {
        console.error('Failed to update new account status:', error)
        // Still close the modal even if API call fails
      }
    }
    onClose()
  }

  // ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose()
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
            <h2 className="text-2xl font-bold text-white">Inventory Management Guide</h2>
            <button 
              onClick={handleClose}
              className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            >
              <Image src="/icons/close.png" alt="Close" width={20} height={20} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-gray-700">
            <button
              onClick={() => setActiveTab('redeem')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'redeem' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              💎 Redeem Cards
            </button>
            <button
              onClick={() => setActiveTab('withdraw')}
              className={`flex-1 py-3 px-4 text-sm font-medium transition-colors ${
                activeTab === 'withdraw' 
                  ? 'text-purple-400 border-b-2 border-purple-400' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📦 Withdraw Cards
            </button>
          </div>

          {/* Content */}
          <div className="p-6 overflow-y-auto max-h-[calc(85vh-200px)]">
            {activeTab === 'redeem' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">💎 How Card Redemption Works</h3>
                  <div className="space-y-4 text-gray-300">
                    <div className="bg-purple-900/30 border border-purple-500 rounded-lg p-4">
                      <p className="mb-3 font-medium text-purple-200">Card redemption is the process of converting your digital cards into points that you can use for various activities on Zapull.</p>
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3">
                          <span className="text-purple-400 font-bold">1.</span>
                          <div>
                            <p className="font-medium text-white">Select Cards to Redeem</p>
                            <p className="text-sm text-gray-300">Choose the cards you want to convert to points by clicking the circle icon on each card</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3">
                          <span className="text-purple-400 font-bold">2.</span>
                          <div>
                            <p className="font-medium text-white">Click "Redeem" Button</p>
                            <p className="text-sm text-gray-300">Press the purple "Redeem" button to start the redemption process</p>
                          </div>
                        </div>
                        <div className="flex items-start space-x-3">
                          <span className="text-purple-400 font-bold">3.</span>
                          <div>
                            <p className="font-medium text-white">Confirm Your Choice</p>
                            <p className="text-sm text-gray-300">Review your selection and confirm to convert cards into points permanently</p>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 font-medium">Buyback Period Rules:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li>All cards have a <span className="text-white font-semibold">10-day buyback period</span> from when you obtain them</li>
                        <li><span className="text-yellow-400">Only cards within their buyback period can be redeemed</span></li>
                        <li><span className="text-red-400">Expired cards cannot be redeemed for points anymore</span></li>
                      </ul>
                    </div>
                    <div>
                      <p className="mb-2 font-medium">Auto-Redemption System:</p>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li><span className="text-green-400">Low-value cards (≤ 500 points)</span> will be automatically redeemed on their expiration date</li>
                        <li><span className="text-blue-400">High-value cards (&gt; 500 points)</span> will NOT be automatically redeemed — you must redeem them manually</li>
                        <li><span className="text-purple-400">Fusion material cards</span> will NOT be auto-redeemed regardless of their point value</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-green-900/30 border border-green-500 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-green-400 mb-2">💡 Redemption Tips</h3>
                  <div className="space-y-2 text-gray-300 text-sm">
                    <p>• <span className="font-medium">Check expiration dates</span>: Cards show "Expires in: X days" at the top</p>
                    <p>• <span className="font-medium">Prioritize high-value cards</span>: These won't auto-redeem, so don't forget them!</p>
                    <p>• <span className="font-medium">Keep fusion materials</span>: Only redeem if you don't need them for card fusion</p>
                    <p>• <span className="font-medium">Bulk select</span>: Select multiple cards at once for efficient redemption</p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'withdraw' && (
              <div className="space-y-6">
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-blue-400 mb-3">📦 Physical Card Withdrawal</h3>
                  <div className="space-y-4 text-gray-300">
                    <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-4">
                      <p className="mb-3 font-medium text-blue-200">Withdraw your digital cards as physical cards delivered to your address.</p>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">How to Withdraw Cards</h4>
                      <ol className="list-decimal list-inside space-y-2 text-sm">
                        <li>Select the cards you want to withdraw physically</li>
                        <li>Click the "Withdraw" button</li>
                        <li>Choose quantities for each selected card</li>
                        <li>Confirm your withdrawal request</li>
                        <li>Your cards will be processed and shipped to your address</li>
                      </ol>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">Important Notes</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li><span className="text-yellow-400 font-semibold">Minimum requirement: Cards must have 200+ points to be withdrawn</span></li>
                        <li>Physical withdrawal is permanent - you cannot get digital copies back</li>
                        <li>Shipping costs and processing fees may apply</li>
                        <li>Processing time varies depending on location and card availability</li>
                        <li>Ensure your shipping address is correct before confirming</li>
                      </ul>
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-purple-400 mb-3">🎯 Inventory Management</h3>
                  <div className="space-y-4 text-gray-300">
                    <div>
                      <h4 className="font-medium text-white mb-2">Sorting Your Cards</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm">
                        <li><span className="font-medium">Date Acquired:</span> Sort by when you received the card</li>
                        <li><span className="font-medium">Point Worth:</span> Sort by the card's redemption value</li>
                        <li><span className="font-medium">Quantity:</span> Sort by number of copies you own</li>
                      </ul>
                    </div>
                    <div>
                      <h4 className="font-medium text-white mb-2">Finding Cards</h4>
                      <p className="text-sm">Use the search bar to quickly locate specific cards by name</p>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-900/30 border border-yellow-500 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-yellow-400 mb-2">⚠️ Before You Withdraw</h3>
                  <p className="text-gray-300 text-sm">
                    Consider if you want to redeem high-value cards for points first, or keep them for collection. Once withdrawn physically, you cannot redeem them for points anymore.
                  </p>
                </div>
              </div>
            )}
          </div>

        </motion.div>
      </div>
    </AnimatePresence>
  )
}