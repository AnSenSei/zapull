'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentUserId, getAuthHeaders } from '@/lib/authUtils'

interface EditOfferModalProps {
  isOpen: boolean
  onClose: () => void
  offer: {
    offerreference: string
    listingId: string
    amount: number
    type: 'cash' | 'points'
    card_reference: string
    image_url?: string
    expiresAt?: string
  } | null
  onSuccess: () => void
}

export default function EditOfferModal({ isOpen, onClose, offer, onSuccess }: EditOfferModalProps) {
  const [amount, setAmount] = useState(0)
  const [expiredDays, setExpiredDays] = useState(7) // Default to 7 days
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false) // 控制展开/折叠状态

  useEffect(() => {
    if (offer) {
      setAmount(offer.amount)
    }
  }, [offer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!offer) return

    const userId = getCurrentUserId()
    if (!userId) {
      setError('User not logged in')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      const url = offer.type === 'cash'
        ? `${apiBaseUrl}/marketplace/listings/${offer.listingId}/offers/cash/${offer.offerreference}`
        : `${apiBaseUrl}/marketplace/listings/${offer.listingId}/offers/points/${offer.offerreference}`

      const body = offer.type === 'cash' 
        ? { cash: amount }
        : { points: amount }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(body)
      })

      if (response.ok) {
        onSuccess()
        onClose()
      } else {
        const errorData = await response.text()
        setError(`Failed to update offer: ${errorData}`)
      }
    } catch (err) {
      setError('Network error, please try again')
      console.error('Failed to update offer:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!offer) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={`relative w-[95vw] max-w-sm sm:max-w-2xl h-auto flex flex-col m-4 ${
              isExpanded ? 'max-h-[90vh] overflow-hidden' : 'max-h-none'
            }`}
            style={{
              background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
              borderRadius: '20px',
              border: '2px solid #8B5CF6'
            }}
          >
            {/* 模态框标题 */}
            <div className="relative p-4 text-center flex-shrink-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Edit {offer.type === 'cash' ? 'Cash' : 'Points'} Offer
              </h2>
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 内容区域 */}
            <div className={`flex-1 p-4 sm:p-6 flex flex-col sm:flex-row gap-4 sm:gap-6 ${
              isExpanded ? 'overflow-y-auto' : ''
            }`}>
              {/* 移动端：卡片图片和详情横向布局 */}
              <div className="flex sm:contents gap-4 sm:gap-0">
                {/* 卡片图片 */}
                <div className="w-24 h-32 sm:w-1/3 sm:aspect-square relative rounded-md overflow-hidden flex-shrink-0 border border-purple-500/30">
                  <img 
                    src={offer.image_url || '/cards/card1.jpg'} 
                    alt={offer.card_reference} 
                    className="w-full h-full object-cover"
                  />
                </div>

                {/* 卡片详情 */}
                <div className="flex-1 sm:flex-1 text-white overflow-hidden">
                  <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-4">{offer.card_reference}</h3>
                  
                  <div className="space-y-2 sm:space-y-3">
                    <div>
                      <div className="text-gray-400 text-xs sm:text-sm">Current Offer</div>
                      <div className="flex items-center gap-2">
                        {offer.type === 'points' ? (
                          <>
                            <img src="/users/coin.png" alt="Points" className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span className="text-yellow-400 font-bold text-sm sm:text-lg">{offer.amount} Points</span>
                          </>
                        ) : (
                          <span className="text-green-400 font-bold text-sm sm:text-lg">${offer.amount}</span>
                        )}
                      </div>
                    </div>
                    
                    <div>
                      <div className="text-gray-400 text-xs sm:text-sm">Offer Type</div>
                      <div className="flex items-center gap-2">
                        {offer.type === 'points' ? (
                          <>
                            <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                            <span className="text-xs sm:text-sm">Points Offer</span>
                          </>
                        ) : (
                          <>
                            <span className="text-green-400 font-bold text-xs sm:text-sm">$</span>
                            <span className="text-xs sm:text-sm">Cash Offer</span>
                          </>
                        )}
                      </div>
                    </div>
                    
                    {offer.expiresAt && (
                      <div>
                        <div className="text-gray-400 text-xs sm:text-sm">Expiry Time</div>
                        <div className="text-xs sm:text-sm">{new Date(offer.expiresAt).toLocaleDateString()}</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* 编辑区域 */}
              <div className="w-full sm:w-1/3 flex-shrink-0 space-y-3 sm:space-y-4">
                <form onSubmit={handleSubmit} className="space-y-3 sm:space-y-4">
                  {/* 新出价输入 */}
                  <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                    <div className="text-gray-400 text-xs sm:text-sm mb-2">New Offer Amount</div>
                    <div className="relative">
                      {offer.type === 'points' ? (
                        <>
                          <img src="/users/coin.png" alt="Points" className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5" />
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            placeholder="0"
                            className="w-full bg-gray-700 text-yellow-400 text-base sm:text-lg font-bold py-2 sm:py-3 pl-8 sm:pl-10 pr-3 sm:pr-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                            required
                          />
                        </>
                      ) : (
                        <>
                          <span className="absolute left-2 sm:left-3 top-1/2 transform -translate-y-1/2 text-white text-base sm:text-lg">$</span>
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={amount}
                            onChange={(e) => setAmount(Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full bg-gray-700 text-white text-base sm:text-lg font-bold py-2 sm:py-3 pl-6 sm:pl-8 pr-3 sm:pr-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                            required
                          />
                        </>
                      )}
                    </div>
                  </div>

                  {/* 有效期选择 */}
                  <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                    <div className="text-gray-400 text-xs sm:text-sm mb-2">Validity Period</div>
                    <select
                      value={expiredDays}
                      onChange={(e) => setExpiredDays(Number(e.target.value))}
                      className="w-full bg-gray-700 text-white py-2 sm:py-3 px-3 sm:px-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none text-sm sm:text-base"
                    >
                      <option value={1}>1 day</option>
                      <option value={3}>3 days</option>
                      <option value={7}>7 days</option>
                      <option value={14}>14 days</option>
                      <option value={30}>30 days</option>
                    </select>
                  </div>

                  {/* 展开/折叠按钮 */}
                  <button
                    type="button"
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="w-full bg-gray-700 hover:bg-gray-600 text-white py-2 px-3 rounded-lg transition-colors flex items-center justify-between text-sm"
                  >
                    <span>Price Comparison</span>
                    <svg 
                      className={`w-4 h-4 transition-transform ${
                        isExpanded ? 'rotate-180' : ''
                      }`} 
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* 价格对比 - 可折叠内容 */}
                  {isExpanded && (
                     <div className="bg-gray-800 rounded-lg p-3 sm:p-4">
                       <div className="text-gray-400 text-xs sm:text-sm mb-2">Price Comparison</div>
                       <div className="space-y-1.5 sm:space-y-2 text-xs sm:text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-400">Original Offer:</span>
                            {offer.type === 'points' ? (
                              <div className="flex items-center gap-1">
                                <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="text-yellow-400">{offer.amount}</span>
                              </div>
                            ) : (
                              <span className="text-white">${offer.amount}</span>
                            )}
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-400">New Offer:</span>
                            {offer.type === 'points' ? (
                              <div className="flex items-center gap-1">
                                <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                                <span className="text-green-400">{amount || 0}</span>
                              </div>
                            ) : (
                              <span className="text-green-400">${amount || 0}</span>
                            )}
                          </div>
                          <div className="border-t border-gray-600 pt-1.5 sm:pt-2 mt-1.5 sm:mt-2">
                            <div className="flex justify-between font-bold">
                              <span className="text-gray-300">Difference:</span>
                              {offer.type === 'points' ? (
                                <div className="flex items-center gap-1">
                                  <img src="/users/coin.png" alt="Points" className="w-3 h-3 sm:w-4 sm:h-4" />
                                  <span className={amount > offer.amount ? 'text-red-400' : amount < offer.amount ? 'text-green-400' : 'text-gray-400'}>
                                    {amount > offer.amount ? '+' : ''}{(amount - offer.amount).toFixed(0)}
                                  </span>
                                </div>
                              ) : (
                                <span className={amount > offer.amount ? 'text-red-400' : amount < offer.amount ? 'text-green-400' : 'text-gray-400'}>
                                  {amount > offer.amount ? '+' : ''}${(amount - offer.amount).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  {error && (
                    <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg border border-red-500/30">
                      {error}
                    </div>
                  )}

                  {/* 按钮 */}
                  <div className="flex gap-2 sm:gap-3">
                    <button
                      type="button"
                      onClick={onClose}
                      className="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-lg transition-colors text-sm sm:text-base"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={loading || amount <= 0}
                      className="flex-1 py-2.5 sm:py-3 px-3 sm:px-4 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-sm sm:text-base"
                    >
                      {loading ? (
                        <div className="animate-spin rounded-full h-4 w-4 sm:h-5 sm:w-5 border-b-2 border-white"></div>
                      ) : (
                        'Update Offer'
                      )}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}