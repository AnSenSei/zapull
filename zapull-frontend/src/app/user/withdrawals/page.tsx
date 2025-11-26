'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/authUtils'
import UserNavigation from '@/components/UserNavigation'
import { userApi, WithdrawRequest, WithdrawRequestsResponse } from '@/lib/userApi'
import { paymentApi, ShopOrder } from '@/lib/paymentApi'
import CreateWithdrawModal from '@/components/CreateWithdrawModal'
import WithdrawDetailsModal from '@/components/WithdrawDetailsModal'
import ShopOrderDetailsModal from '@/components/ShopOrderDetailsModal'
import toast from 'react-hot-toast'

export default function WithdrawalsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState<'cards' | 'shop'>('cards')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawRequest[]>([])
  const [shopOrders, setShopOrders] = useState<ShopOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalItems, setTotalItems] = useState(0)
  const [pendingCards, setPendingCards] = useState<{ card_name: string; quantity: number; subcollection_name: string }[] | null>(null)
  const [cancelConfirmId, setCancelConfirmId] = useState<string | null>(null)
  const [cancelShopOrderId, setCancelShopOrderId] = useState<string | null>(null)
  const [detailsRequestId, setDetailsRequestId] = useState<string | null>(null)
  const [shopOrderDetailsId, setShopOrderDetailsId] = useState<string | null>(null)
  const { userInfo, authInitialized } = useAuthStore() // 获取用户信息

  // Check for tab query parameter and set active tab
  useEffect(() => {
    const tabParam = searchParams.get('tab')
    if (tabParam === 'shop') {
      setActiveTab('shop')
    } else if (tabParam === 'cards') {
      setActiveTab('cards')
    }
  }, [searchParams])

  // Check authentication and pending withdraw cards from inventory page
  useEffect(() => {
    // Wait for auth initialization before checking authentication
    if (!authInitialized) {
      return;
    }
    
    // Check if user is logged in
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
      return;
    }
    const pendingWithdrawCardsStr = sessionStorage.getItem('pendingWithdrawCards')
    if (pendingWithdrawCardsStr) {
      try {
        const cards = JSON.parse(pendingWithdrawCardsStr)
        setPendingCards(cards)
        setIsModalOpen(true)
        // Clear the session storage
        sessionStorage.removeItem('pendingWithdrawCards')
      } catch (error) {
        console.error('Failed to parse pending withdraw cards:', error)
      }
    }
  }, [authInitialized])

  // 获取提现历史数据
  const fetchWithdrawRequests = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await userApi.getWithdrawRequests({
        page: currentPage,
        per_page: 10,
        sort_by: 'created_at',
        sort_order: 'desc'
      })
      setWithdrawalHistory(response.withdraw_requests)
      setTotalPages(response.pagination.total_pages)
      setTotalItems(response.pagination.total_items)
    } catch (err) {
      console.error('获取提现历史失败:', err)
      setError('Failed to load withdrawal history')
    } finally {
      setLoading(false)
    }
  }

  // 获取商店订单数据
  const fetchShopOrders = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await paymentApi.getShopOrders(
        currentPage,
        10,
        'created_at',
        'desc'
      )
      setShopOrders(response.shop_orders)
      setTotalPages(response.pagination.total_pages)
      setTotalItems(response.pagination.total_items)
    } catch (err) {
      console.error('获取商店订单失败:', err)
      setError('Failed to load shop orders')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (activeTab === 'cards') {
      fetchWithdrawRequests()
    } else if (activeTab === 'shop') {
      fetchShopOrders()
    }
  }, [currentPage, activeTab])

  // 处理查看详情
  const handleViewDetails = (requestId: string) => {
    setDetailsRequestId(requestId)
  }

  // 处理删除提现请求
  const handleDeleteRequest = async (requestId: string) => {
    try {
      await userApi.deleteWithdrawRequest(requestId)
      setCancelConfirmId(null)
      // 重新获取数据
      fetchWithdrawRequests()
    } catch (error) {
      console.error('删除提现请求失败:', error)
      alert('Failed to cancel withdrawal request')
    }
  }

  // 处理取消商店订单
  const handleCancelShopOrder = async (orderId: string) => {
    try {
      await paymentApi.cancelShopOrder(orderId)
      setCancelShopOrderId(null)
      // 重新获取数据
      fetchShopOrders()
      toast.success('Order cancelled successfully! Stock has been restored and payment authorization released.')
    } catch (error) {
      console.error('取消商店订单失败:', error)
      toast.error('Failed to cancel shop order. It may have already been processed.')
    }
  }

  // 处理分页
  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page)
    }
  }

  // 处理创建提现请求成功
  const handleWithdrawSuccess = () => {
    setPendingCards(null)
    fetchWithdrawRequests()
  }


  // Show loading while auth is initializing
  if (!authInitialized) {
    return (
      <div className="flex justify-center items-center h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Create Withdraw Modal */}
      <CreateWithdrawModal 
        isOpen={isModalOpen} 
        onClose={() => {
          setIsModalOpen(false)
          setPendingCards(null)
        }} 
        cardsToWithdraw={pendingCards}
        onSuccess={handleWithdrawSuccess}
      />
      
      {/* 用户信息栏和功能栏 */}
      <UserNavigation />

      {/* 提现管理区域 */}
      <div className="bg-[#2A2B3D] rounded-lg p-6">
        <h2 className="text-xl font-semibold text-white mb-6">Shipping</h2>
        
        {/* Tabs */}
        <div className="flex space-x-4 mb-6 border-b border-[#3F3F5F]">
          <button
            onClick={() => setActiveTab('cards')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'cards'
                ? 'text-[#8B5CF6]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Cards
            {activeTab === 'cards' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8B5CF6]"></div>
            )}
          </button>
          <button
            onClick={() => setActiveTab('shop')}
            className={`pb-3 px-2 font-medium transition-colors relative ${
              activeTab === 'shop'
                ? 'text-[#8B5CF6]'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            Shop
            {activeTab === 'shop' && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#8B5CF6]"></div>
            )}
          </button>
        </div>

        {/* Cards Tab Content */}
        {activeTab === 'cards' && (
          <>
            {/* 加载状态 */}
            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="text-white">Loading...</div>
              </div>
            )}

            {/* 错误状态 */}
            {error && (
              <div className="bg-red-500/20 text-red-500 p-4 rounded-lg mb-4">
                {error}
              </div>
            )}

            {/* 提现历史表格 */}
            {!loading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-white">
              <thead>
                <tr className="text-gray-400 border-b border-[#3F3F5F]">
                  <th className="py-3 text-left">Status</th>
                  <th className="py-3 text-left">Order time</th>
                  <th className="py-3 text-left">Cards</th>
                  <th className="py-3 text-left">Tracking</th>
                  <th className="py-3 text-right">Operation</th>
                </tr>
              </thead>
              <tbody>
                {withdrawalHistory.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-400">
                      No card shipping requests found
                    </td>
                  </tr>
                ) : (
                  withdrawalHistory.map((item) => {
                    const formatDate = (dateString: string) => {
                      const date = new Date(dateString)
                      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
                    }

                    const getStatusColor = (status: string) => {
                      switch (status.toLowerCase()) {
                        case 'pending':
                          return 'bg-yellow-500/20 text-yellow-500'
                        case 'processing':
                          return 'bg-blue-500/20 text-blue-500'
                        case 'shipped':
                          return 'bg-green-500/20 text-green-500'
                        case 'delivered':
                          return 'bg-green-600/20 text-green-600'
                        case 'cancelled':
                          return 'bg-red-500/20 text-red-500'
                        case 'insufficient_funds':
                          return 'bg-orange-500/20 text-orange-500'
                        default:
                          return 'bg-gray-500/20 text-gray-500'
                      }
                    }

                    return (
                      <tr key={item.id} className="border-b border-[#3F3F5F]">
                        <td className="py-4">
                          <span className={`inline-block px-2 py-1 rounded-full text-xs ${getStatusColor(item.status)}`}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                          </span>
                        </td>
                        <td className="py-4">{formatDate(item.created_at)}</td>
                        <td className="py-4">{item.card_count} cards</td>
                        <td className="py-4">
                          {item.tracking_number ? (
                            <a 
                              href={item.tracking_url || '#'} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-blue-400 hover:text-blue-300 underline"
                            >
                              {item.tracking_number}
                            </a>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="py-4 text-right">
                          <div className="flex space-x-2 justify-end">
                            <button 
                              onClick={() => handleViewDetails(item.id)}
                              className="px-3 py-1 bg-[#3F3F5F] text-white rounded-lg hover:bg-[#4F4F6F] transition-colors text-sm"
                            >
                              View Details
                            </button>
                            {(item.status.toLowerCase() === 'pending' || item.status.toLowerCase() === 'insufficient_funds') && (
                              <button 
                                onClick={() => setCancelConfirmId(item.id)}
                                className="px-3 py-1 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
            )}

            {/* 分页 */}
            {!loading && !error && totalPages > 1 && (
              <div className="flex justify-between items-center mt-6">
                <div className="text-gray-400 text-sm">
                  共{totalItems}条记录 {currentPage}/{totalPages}页
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`w-8 h-8 flex items-center justify-center rounded-md text-white ${
                      currentPage === 1 
                        ? 'bg-gray-600 cursor-not-allowed' 
                        : 'bg-[#3F3F5F] hover:bg-[#4F4F6F]'
                    }`}
                  >
                    &lt;
                  </button>
                  
                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 flex items-center justify-center rounded-md text-white ${
                          currentPage === pageNum 
                            ? 'bg-[#8B5CF6]' 
                            : 'bg-[#3F3F5F] hover:bg-[#4F4F6F]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button 
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`w-8 h-8 flex items-center justify-center rounded-md text-white ${
                      currentPage === totalPages 
                        ? 'bg-gray-600 cursor-not-allowed' 
                        : 'bg-[#3F3F5F] hover:bg-[#4F4F6F]'
                    }`}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Shop Tab Content */}
        {activeTab === 'shop' && (
          <>
            {/* 加载状态 */}
            {loading && (
              <div className="flex justify-center items-center py-8">
                <div className="text-white">Loading...</div>
              </div>
            )}

            {/* 错误状态 */}
            {error && (
              <div className="bg-red-500/20 text-red-500 p-4 rounded-lg mb-4">
                {error}
              </div>
            )}

            {/* 商店订单表格 */}
            {!loading && !error && (
              <div className="overflow-x-auto">
                <table className="w-full text-white">
                  <thead>
                    <tr className="text-gray-400 border-b border-[#3F3F5F]">
                      <th className="py-3 text-left">Status</th>
                      <th className="py-3 text-left">Order time</th>
                      <th className="py-3 text-left">Items</th>
                      <th className="py-3 text-left">Amount</th>
                      <th className="py-3 text-left">Tracking</th>
                      <th className="py-3 text-right">Operation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shopOrders.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-gray-400">
                          No shop orders found
                        </td>
                      </tr>
                    ) : (
                      shopOrders.map((order) => {
                        const formatDate = (dateString: string) => {
                          const date = new Date(dateString)
                          return date.toLocaleDateString() + ' ' + date.toLocaleTimeString()
                        }

                        const getStatusColor = (status: string) => {
                          switch (status.toLowerCase()) {
                            case 'pending':
                            case 'authorized':
                              return 'bg-yellow-500/20 text-yellow-500'
                            case 'confirmed':
                            case 'processing':
                              return 'bg-blue-500/20 text-blue-500'
                            case 'shipped':
                              return 'bg-green-500/20 text-green-500'
                            case 'delivered':
                              return 'bg-green-600/20 text-green-600'
                            case 'cancelled':
                              return 'bg-red-500/20 text-red-500'
                            default:
                              return 'bg-gray-500/20 text-gray-500'
                          }
                        }

                        return (
                          <tr key={order.id} className="border-b border-[#3F3F5F]">
                            <td className="py-4">
                              <span className={`inline-block px-2 py-1 rounded-full text-xs ${getStatusColor(order.status)}`}>
                                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                              </span>
                            </td>
                            <td className="py-4">{formatDate(order.created_at)}</td>
                            <td className="py-4">{order.card_count} items</td>
                            <td className="py-4">${order.amount_paid.toFixed(2)}</td>
                            <td className="py-4">
                              {(order as any).tracking_number ? (
                                <a 
                                  href={(order as any).tracking_url || '#'} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 underline"
                                >
                                  {(order as any).tracking_number}
                                </a>
                              ) : (
                                <span className="text-gray-400">-</span>
                              )}
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex space-x-2 justify-end">
                                <button 
                                  onClick={() => setShopOrderDetailsId(order.id)}
                                  className="px-3 py-1 bg-[#3F3F5F] text-white rounded-lg hover:bg-[#4F4F6F] transition-colors text-sm"
                                >
                                  View Details
                                </button>
                                {order.status.toLowerCase() === 'authorized' && (
                                  <button 
                                    onClick={() => setCancelShopOrderId(order.id)}
                                    className="px-3 py-1 bg-red-500/20 text-red-500 rounded-lg hover:bg-red-500/30 transition-colors text-sm"
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* 分页 */}
            {!loading && !error && totalPages > 1 && (
              <div className="flex justify-between items-center mt-6">
                <div className="text-gray-400 text-sm">
                  共{totalItems}条记录 {currentPage}/{totalPages}页
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className={`w-8 h-8 flex items-center justify-center rounded-md text-white ${
                      currentPage === 1 
                        ? 'bg-gray-600 cursor-not-allowed' 
                        : 'bg-[#3F3F5F] hover:bg-[#4F4F6F]'
                    }`}
                  >
                    &lt;
                  </button>
                  
                  {/* 页码按钮 */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }
                    
                    return (
                      <button
                        key={pageNum}
                        onClick={() => handlePageChange(pageNum)}
                        className={`w-8 h-8 flex items-center justify-center rounded-md text-white ${
                          currentPage === pageNum 
                            ? 'bg-[#8B5CF6]' 
                            : 'bg-[#3F3F5F] hover:bg-[#4F4F6F]'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                  
                  <button 
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className={`w-8 h-8 flex items-center justify-center rounded-md text-white ${
                      currentPage === totalPages 
                        ? 'bg-gray-600 cursor-not-allowed' 
                        : 'bg-[#3F3F5F] hover:bg-[#4F4F6F]'
                    }`}
                  >
                    &gt;
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Withdraw Details Modal */}
      <WithdrawDetailsModal
        isOpen={!!detailsRequestId}
        onClose={() => setDetailsRequestId(null)}
        requestId={detailsRequestId || ''}
        onUpdate={() => {
          fetchWithdrawRequests()
          setDetailsRequestId(null)
        }}
      />

      {/* Shop Order Details Modal */}
      <ShopOrderDetailsModal
        isOpen={!!shopOrderDetailsId}
        onClose={() => setShopOrderDetailsId(null)}
        orderId={shopOrderDetailsId || ''}
      />

      {/* Cancel Confirmation Modal - Card Withdrawals */}
      {cancelConfirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-4">
              Confirm Cancellation
            </h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to cancel this withdrawal request? 
              The cards will be returned to your inventory.
            </p>
            <div className="bg-yellow-500/20 border border-yellow-500/50 rounded-lg p-3 mb-6">
              <p className="text-yellow-400 text-sm">
                <strong>Note:</strong> This action cannot be undone. You will need to create a new withdrawal request if you change your mind.
              </p>
            </div>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setCancelConfirmId(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Keep Request
              </button>
              <button
                onClick={() => handleDeleteRequest(cancelConfirmId)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes, Cancel Request
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal - Shop Orders */}
      {cancelShopOrderId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-[#1A1B2E] rounded-lg p-6 max-w-md w-full">
            <h3 className="text-xl font-semibold text-white mb-4">
              Cancel Shop Order
            </h3>
            <p className="text-gray-300 mb-6">
              Are you sure you want to cancel this shop order? 
              This will release the payment authorization (no charge) and restore stock.
            </p>
            <div className="bg-blue-500/20 border border-blue-500/50 rounded-lg p-3 mb-6">
              <p className="text-blue-400 text-sm">
                <strong>Note:</strong> You can only cancel orders before they are confirmed and shipped. 
                Once confirmed, orders cannot be cancelled.
              </p>
            </div>
            <div className="flex justify-end space-x-4">
              <button
                onClick={() => setCancelShopOrderId(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Keep Order
              </button>
              <button
                onClick={() => handleCancelShopOrder(cancelShopOrderId)}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                Yes, Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}