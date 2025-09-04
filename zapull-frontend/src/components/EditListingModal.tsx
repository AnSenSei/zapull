'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { getCurrentUserId, getAuthHeaders } from '@/lib/authUtils'

interface EditListingModalProps {
  isOpen: boolean
  onClose: () => void
  listing: {
    id: string
    card_name: string
    card_reference: string
    priceCash: number
    pricePoints: number
    image_url?: string
    expiresAt?: string
  } | null
  onSuccess: () => void
}

export default function EditListingModal({ isOpen, onClose, listing, onSuccess }: EditListingModalProps) {
  const [priceCash, setPriceCash] = useState(0)
  const [pricePoints, setPricePoints] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (listing) {
      setPriceCash(listing.priceCash || 0)
      setPricePoints(listing.pricePoints || 0)
    }
  }, [listing])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!listing) return

    const userId = getCurrentUserId()
    if (!userId) {
      setError('User not logged in')
      return
    }

    setLoading(true)
    setError(null)

    try {
      // 由于没有专门的更新API，我们先删除旧的挂售，然后创建新的
      // 首先删除现有挂售
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1';
      const authHeaders = await getAuthHeaders();
      const deleteResponse = await fetch(`${apiBaseUrl}/marketplace/listings/${listing.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        }
      })

      if (!deleteResponse.ok) {
        throw new Error('Failed to delete original listing')
      }

      // 然后创建新的挂售
      const createResponse = await fetch(`${apiBaseUrl}/marketplace/listings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify({
          card_id: listing.card_reference,
          collection_id: 'default', // 可能需要从原数据中获取
          quantity: 1,
          priceCash: priceCash,
          pricePoints: pricePoints,
          expiresAt: listing.expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          card_name: listing.card_name
        })
      })

      if (createResponse.ok) {
        onSuccess()
        onClose()
      } else {
        const errorData = await createResponse.text()
        setError(`Failed to update listing: ${errorData}`)
      }
    } catch (err) {
      setError('Network error, please try again')
      console.error('Failed to update listing:', err)
    } finally {
      setLoading(false)
    }
  }

  if (!listing) return null

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="relative w-full max-w-2xl"
            style={{
              background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
              borderRadius: '20px',
              border: '2px solid #8B5CF6'
            }}
          >
            {/* 模态框标题 */}
            <div className="relative p-4 text-center">
              <h2 className="text-2xl font-bold text-white">
                Edit Listing Price
              </h2>
              <button 
                onClick={onClose}
                className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
              >
                <img src="/icons/close.png" alt="Close" width={24} height={24} />
              </button>
            </div>

            <div className="p-6 flex flex-row gap-6 min-h-0">
              {/* 卡片图片 */}
              <div className="w-1/3 aspect-square relative rounded-md overflow-hidden flex-shrink-0 border border-purple-500/30">
                <img 
                  src={listing.image_url || '/cards/card1.jpg'} 
                  alt={listing.card_name} 
                  className="w-full h-full object-cover"
                />
              </div>

              {/* 卡片详情 */}
              <div className="flex-1 text-white overflow-hidden">
                <h3 className="text-xl font-bold mb-4">{listing.card_name}</h3>
                
                <div className="space-y-3">
                  <div>
                    <div className="text-gray-400 text-sm">Current Cash Price</div>
                    <div className="flex items-center gap-2">
                      <span className="text-green-400 font-bold text-lg">${listing.priceCash}</span>
                    </div>
                  </div>
                  
                  <div>
                    <div className="text-gray-400 text-sm">Current Points Price</div>
                    <div className="flex items-center gap-2">
                      <img src="/users/coin.png" alt="Points" className="w-5 h-5" />
                      <span className="text-yellow-400 font-bold text-lg">{listing.pricePoints} Points</span>
                    </div>
                  </div>
                  
                  {listing.expiresAt && (
                    <div>
                      <div className="text-gray-400 text-sm">Expiration Date</div>
                      <div>{new Date(listing.expiresAt).toLocaleDateString()}</div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* 编辑区域 */}
              <div className="w-1/3 flex-shrink-0 space-y-4">
                <form onSubmit={handleSubmit} className="space-y-4">
                  {/* 现金价格输入 */}
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-gray-400 text-sm mb-2">New Cash Price</div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white text-lg">$</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={priceCash}
                        onChange={(e) => setPriceCash(Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full bg-gray-700 text-white text-lg font-bold py-3 pl-8 pr-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* 积分价格输入 */}
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-gray-400 text-sm mb-2">New Points Price</div>
                    <div className="relative">
                      <img src="/users/coin.png" alt="Points" className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5" />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={pricePoints}
                        onChange={(e) => setPricePoints(Number(e.target.value))}
                        placeholder="0"
                        className="w-full bg-gray-700 text-yellow-400 text-lg font-bold py-3 pl-10 pr-4 rounded-lg border border-gray-600 focus:border-purple-500 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  {/* 价格对比 */}
                  <div className="bg-gray-800 rounded-lg p-4">
                    <div className="text-gray-400 text-sm mb-2">Price Comparison</div>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Original Cash Price:</span>
                        <span className="text-white">${listing.priceCash}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">New Cash Price:</span>
                        <span className="text-green-400">${priceCash || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Original Points Price:</span>
                        <div className="flex items-center gap-1">
                          <img src="/users/coin.png" alt="Points" className="w-4 h-4" />
                          <span className="text-white">{listing.pricePoints}</span>
                        </div>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">New Points Price:</span>
                        <div className="flex items-center gap-1">
                          <img src="/users/coin.png" alt="Points" className="w-4 h-4" />
                          <span className="text-green-400">{pricePoints || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 错误信息 */}
                  {error && (
                    <div className="bg-red-900/50 border border-red-500 rounded-lg p-3">
                      <p className="text-red-200 text-sm">{error}</p>
                    </div>
                  )}

                  {/* 提交按钮 */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-600 text-white font-bold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Updating...
                      </>
                    ) : (
                      'Update Listing Price'
                    )}
                  </button>
                </form>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}