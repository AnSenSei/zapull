'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import styles from './history.module.css'
import FairModal from '@/components/FairModal'
import { paymentApi, RechargeRecord, PaginatedRechargeHistoryResponse } from '@/lib/paymentApi'
import { useAuthStore } from '@/store/authStore'
import { isAuthenticated } from '@/lib/authUtils'
import { 
  getUserPackOpeningHistory,
  getUserMarketplaceHistoryAsBuyer,
  getUserMarketplaceHistoryAsSeller,
  PackOpeningItem,
  PackOpeningHistoryResponse,
  MarketplaceItem,
  MarketplaceResponse
} from '@/services/historyApi'

export default function HistoryPage() {
  const router = useRouter()
  // 标签页状态
  const [activeTab, setActiveTab] = useState('topup') // 'topup', 'cards', 'marketplace'
  const [marketplaceSubTab, setMarketplaceSubTab] = useState('buyer') // 'buyer' or 'seller'
  // 弹窗状态
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedItem, setSelectedItem] = useState<PackOpeningItem | null>(null)
  // 图片查看状态
  const [selectedImage, setSelectedImage] = useState<{url: string, name: string} | null>(null)
  
  // 充值历史数据状态
  const [rechargeHistory, setRechargeHistory] = useState<RechargeRecord[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize] = useState(10)
  const [totalRecords, setTotalRecords] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  
  // Pack Opening历史数据状态
  const [packHistory, setPackHistory] = useState<PackOpeningItem[]>([])
  const [packTotalCount, setPackTotalCount] = useState(0)
  const [packCurrentPage, setPackCurrentPage] = useState(1)
  const [packPageSize] = useState(10)
  const [isPackLoading, setIsPackLoading] = useState(false)

  // Marketplace历史数据状态
  const [marketplaceHistory, setMarketplaceHistory] = useState<MarketplaceItem[]>([])
  const [marketplacePagination, setMarketplacePagination] = useState({
    current_page: 1,
    total_pages: 1,
    total_items: 0,
    per_page: 10
  })
  const [isMarketplaceLoading, setIsMarketplaceLoading] = useState(false)
  
  // 获取用户信息
  const { userInfo, uid, openLoginModal, authInitialized } = useAuthStore()
  
  // 获取充值历史数据
  const fetchRechargeHistory = async (page: number = 1) => {
    const userId = userInfo?.id || uid
    if (!userId) {
      return
    }
    
    try {
      setIsLoading(true)
      const response: PaginatedRechargeHistoryResponse = await paymentApi.getRechargeHistoryPaginated(
        userId, 
        page, 
        pageSize
      )
      
      setRechargeHistory(response.recharge_history)
      setTotalRecords(response.total_count)
      // 计算总页数
      const calculatedTotalPages = Math.ceil(response.total_count / pageSize)
      setTotalPages(calculatedTotalPages)
    } catch (error) {
      console.error('获取充值历史失败:', error)
    } finally {
      setIsLoading(false)
    }
  }

  // 获取Pack Opening历史数据
  const fetchPackHistory = async (page: number = 1) => {
    const userId = userInfo?.id || uid
    if (!userId) return
    
    setIsPackLoading(true)
    try {
      const response: PackOpeningHistoryResponse = await getUserPackOpeningHistory(userId, page, packPageSize)
      setPackHistory(response.pack_openings)
      setPackTotalCount(response.total_count)
      setPackCurrentPage(page)
    } catch (error) {
      console.error('Error fetching pack opening history:', error)
    } finally {
      setIsPackLoading(false)
    }
  }

  // 获取市场交易历史数据
  const fetchMarketplaceHistory = async (page: number = 1) => {
    const userId = userInfo?.id || uid
    if (!userId) return
    
    setIsMarketplaceLoading(true)
    try {
      let response: MarketplaceResponse
      if (marketplaceSubTab === 'buyer') {
        response = await getUserMarketplaceHistoryAsBuyer(userId, page, 10)
      } else {
        response = await getUserMarketplaceHistoryAsSeller(userId, page, 10)
      }
      setMarketplaceHistory(response.transactions || [])
      setMarketplacePagination(response.pagination)
    } catch (error) {
      console.error('Error fetching marketplace history:', error)
      // 确保在错误情况下设置空数组
      setMarketplaceHistory([])
      setMarketplacePagination({
        current_page: 1,
        total_pages: 1,
        total_items: 0,
        per_page: 10
      })
    } finally {
      setIsMarketplaceLoading(false)
    }
  }
  
  // Check authentication on mount
  useEffect(() => {
    // Wait for auth initialization before checking authentication
    if (!authInitialized) {
      return;
    }
    
    if (!isAuthenticated()) {
      // Open login modal from auth store
      const { openLoginModal } = useAuthStore.getState();
      openLoginModal();
      // Redirect to home page
      router.push('/');
      return;
    }
  }, [router, authInitialized]);

  // 页面加载时获取数据
  useEffect(() => {
    const userId = userInfo?.id || uid
    if (userId) {
      if (activeTab === 'topup') {
        fetchPackHistory(1)
      } else if (activeTab === 'cards') {
        fetchRechargeHistory(currentPage)
      } else if (activeTab === 'marketplace') {
        fetchMarketplaceHistory(1)
      }
    }
  }, [activeTab, userInfo?.id, uid])
  
  // 当marketplace子标签切换时重新获取数据
  useEffect(() => {
    const userId = userInfo?.id || uid
    if (userId && activeTab === 'marketplace') {
      fetchMarketplaceHistory(1)
    }
  }, [marketplaceSubTab])
  
  // 格式化日期时间
  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString)
    const dateStr = date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit'
    })
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
    return { dateStr, timeStr }
  }
  

  
  // 分页处理
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    if (activeTab === 'cards') {
      fetchRechargeHistory(page)
    }
  }
  
  // Pack历史分页处理
  const handlePackPageChange = (page: number) => {
    fetchPackHistory(page)
  }
  
  // Marketplace历史分页处理
  const handleMarketplacePageChange = (page: number) => {
    setMarketplacePagination(prev => ({ ...prev, current_page: page }))
    fetchMarketplaceHistory(page)
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
    <div className={styles.historyContainer}>
      {/* 标签页导航 */}
      <div className="flex space-x-2 sm:space-x-4 mb-6 overflow-x-auto scrollbar-hide">
        <motion.button
          className={`${styles.tabButton} ${activeTab === 'topup' ? styles.tabButtonActive : styles.tabButtonInactive} flex-shrink-0`}
          onClick={() => setActiveTab('topup')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="mr-1 sm:mr-2">📦</span>
          <span className="text-sm sm:text-base">Pulls</span>
        </motion.button>
        <motion.button
          className={`${styles.tabButton} ${activeTab === 'cards' ? styles.tabButtonActive : styles.tabButtonInactive} flex-shrink-0`}
          onClick={() => setActiveTab('cards')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="mr-1 sm:mr-2">💰</span>
          <span className="text-sm sm:text-base">recharge</span>
        </motion.button>
        <motion.button
          className={`${styles.tabButton} ${activeTab === 'marketplace' ? styles.tabButtonActive : styles.tabButtonInactive} flex-shrink-0`}
          onClick={() => setActiveTab('marketplace')}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <span className="mr-1 sm:mr-2">🛒</span>
          <span className="text-sm sm:text-base">marketplace</span>
        </motion.button>
      </div>

      {/* 内容区域 */}
      <div className={styles.tableContainer}>
        {/* Pulls 历史 */}
        {activeTab === 'topup' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {!uid ? (
              <div className={styles.loginPrompt}>
                <p>Please log in to view your pull history.</p>
                <button onClick={openLoginModal} className={styles.loginButton}>
                  Log In
                </button>
              </div>
            ) : (
              <>
                {isPackLoading ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingText}>Loading pull history...</div>
                  </div>
                ) : (
                  <table className={styles.historyTable}>
                    <thead>
                      <tr>
                        <th>Pack</th>
                        <th>Time</th>
                        <th>Provably Fair</th>
                      </tr>
                    </thead>
                    <tbody>
                      {packHistory.length === 0 ? (
                        <tr>
                          <td colSpan={3} className={styles.emptyState}>
                            No pull records found
                          </td>
                        </tr>
                      ) : (
                        packHistory.map((item, index) => {
                           const { dateStr, timeStr } = formatDateTime(item.opened_at)
                           return (
                            <motion.tr 
                              key={item.id} 
                              className={styles.historyRow}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <td>
                                <div className="flex flex-col">
                                  <span className="text-white font-medium text-sm sm:text-base">
                                    {item.pack_type.split('/').pop()?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Unknown Pack'}
                                  </span>
                                  <div className={styles.pointsAmount}>
                                    <img src="/payment/coin.png" alt="coin" className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                    <span className="text-xs sm:text-sm">{item.price_points.toLocaleString()}</span>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className={styles.idTimeContainer}>
                                  <span className={`${styles.timeText} text-xs sm:text-sm`}>{dateStr} {timeStr}</span>
                                </div>
                              </td>
                              <td>
                                <motion.button 
                                  className={`${styles.viewButton} text-xs sm:text-sm px-2 sm:px-4 py-1 sm:py-1`}
                                  whileHover={{ scale: 1.05 }}
                                  whileTap={{ scale: 0.95 }}
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setIsModalOpen(true);
                                  }}
                                >
                                  View
                                </motion.button>
                              </td>
                            </motion.tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Recharge 历史 */}
        {activeTab === 'cards' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {!uid ? (
              <div className={styles.loginPrompt}>
                <p>Please log in to view your recharge history.</p>
                <button onClick={openLoginModal} className={styles.loginButton}>
                  Log In
                </button>
              </div>
            ) : (
              <>
                {isLoading ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingText}>Loading recharge history...</div>
                  </div>
                ) : (
                  <>
                    <table className={styles.historyTable}>
                      <thead>
                        <tr>
                          <th>top up points</th>
                          <th>Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rechargeHistory.length === 0 ? (
                          <tr>
                            <td colSpan={2} className={styles.emptyState}>
                              No recharge records found
                            </td>
                          </tr>
                        ) : (
                          rechargeHistory.map((record, index) => {
                            const { dateStr, timeStr } = formatDateTime(record.created_at)
                            return (
                              <motion.tr 
                                key={record.id} 
                                className={styles.historyRow}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.05 }}
                              >
                                <td>
                                  <div className={styles.pointsAmount}>
                                    <img src="/payment/coin.png" alt="coin" className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                    <span className={`${styles.pointsGranted} text-sm sm:text-base`}>
                                      {(record.points_granted || 0).toLocaleString()}
                                    </span>
                                  </div>
                                </td>
                                <td>
                                  <div className={styles.idTimeContainer}>
                                    <span className={`${styles.timeText} text-xs sm:text-sm`}>{dateStr} {timeStr}</span>
                                  </div>
                                </td>
                              </motion.tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* Marketplace 历史 */}
        {activeTab === 'marketplace' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {!uid ? (
              <div className={styles.loginPrompt}>
                <p>Please log in to view your marketplace history.</p>
                <button onClick={openLoginModal} className={styles.loginButton}>
                  Log In
                </button>
              </div>
            ) : (
              <>
                {/* Buyer/Seller 子标签 */}
                <div className="flex space-x-2 mb-4">
                  <motion.button
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      marketplaceSubTab === 'buyer' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    onClick={() => setMarketplaceSubTab('buyer')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Purchases
                  </motion.button>
                  <motion.button
                    className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      marketplaceSubTab === 'seller' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                    }`}
                    onClick={() => setMarketplaceSubTab('seller')}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Sales
                  </motion.button>
                </div>
                
                {isMarketplaceLoading ? (
                  <div className={styles.loadingContainer}>
                    <div className={styles.loadingText}>Loading marketplace history...</div>
                  </div>
                ) : (
                  <table className={styles.historyTable}>
                    <thead>
                      <tr>
                        <th>Price</th>
                        <th className={styles.cardNameCol}>Card Name</th>
                        <th>Image</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {marketplaceHistory.length === 0 ? (
                        <tr>
                          <td colSpan={4} className={styles.emptyState}>
                            No {marketplaceSubTab} records found
                          </td>
                        </tr>
                      ) : (
                        marketplaceHistory.map((item, index) => {
                           const { dateStr, timeStr } = formatDateTime(item.traded_at)
                           return (
                            <motion.tr 
                              key={`${item.traded_at}-${index}`} 
                              className={styles.historyRow}
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: index * 0.05 }}
                            >
                              <td>
                                <div className={styles.pointsAmount}>
                                  {item.price_cash && item.price_cash > 0 ? (
                                    <span className="text-sm sm:text-base">${item.price_cash.toLocaleString()}</span>
                                  ) : (
                                    <>
                                      <img src="/payment/coin.png" alt="coin" className="w-3 h-3 sm:w-4 sm:h-4 mr-1" />
                                      <span className="text-xs sm:text-sm">{(item.price_points || 0).toLocaleString()}</span>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className={styles.cardNameCol}>
                                <span className="text-white font-medium text-sm sm:text-base">
                                  {item.card_name || 'Unknown Card'}
                                </span>
                              </td>
                              <td>
                                <div 
                                  className={`${styles.cardImage} cursor-pointer`}
                                  onClick={() => {
                                    if (item.signed_url) {
                                      setSelectedImage({
                                        url: item.signed_url,
                                        name: item.card_name || 'Card'
                                      })
                                    }
                                  }}
                                >
                                  {item.signed_url ? (
                                    <Image 
                                      src={item.signed_url} 
                                      alt={item.card_name || 'card'} 
                                      width={80}
                                      height={80}
                                      className="w-full h-full object-cover rounded hover:opacity-80 transition-opacity"
                                      onError={(e) => {
                                        e.currentTarget.src = '/cards/common1.jpg.svg'
                                      }}
                                    />
                                  ) : (
                                    <Image 
                                      src="/cards/common1.jpg.svg"
                                      alt="card placeholder" 
                                      width={80}
                                      height={80}
                                      className="w-full h-full object-cover rounded"
                                    />
                                  )}
                                </div>
                              </td>
                              <td>
                                <div className={styles.idTimeContainer}>
                                  <span className={`${styles.timeText} text-xs sm:text-sm`}>{dateStr}</span>
                                  <span className={`${styles.timeText} text-xs sm:text-sm`}>{timeStr}</span>
                                </div>
                              </td>
                            </motion.tr>
                          )
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </>
            )}
          </motion.div>
        )}
      </div>

      {/* 分页控件 */}
      {/* Pulls 分页 */}
      {activeTab === 'topup' && packHistory.length > 0 && (
        <div className={styles.paginationContainer}>
          <div className={styles.paginationInfo}>
            Total {packTotalCount} records, {packPageSize} per page
          </div>
          <div className={styles.paginationControls}>
            <motion.button 
              className={styles.paginationButton}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                const newPage = packCurrentPage - 1
                handlePackPageChange(newPage)
              }}
              disabled={packCurrentPage <= 1}
            >
              &lt;
            </motion.button>
            
            {Array.from({ length: Math.min(5, Math.ceil(packTotalCount / packPageSize)) }, (_, i) => {
              const pageNum = i + 1
              return (
                <motion.button 
                  key={pageNum}
                  className={`${styles.paginationButton} ${packCurrentPage === pageNum ? styles.paginationButtonActive : ''}`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    handlePackPageChange(pageNum)
                  }}
                >
                  {pageNum}
                </motion.button>
              )
            })}
            
            <motion.button 
              className={styles.paginationButton}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                const newPage = packCurrentPage + 1
                handlePackPageChange(newPage)
              }}
              disabled={packCurrentPage >= Math.ceil(packTotalCount / packPageSize)}
            >
              &gt;
            </motion.button>
          </div>
        </div>
      )}

      {/* Recharge 分页 */}
      {activeTab === 'cards' && rechargeHistory.length > 0 && (
        <div className={styles.paginationContainer}>
          <div className={styles.paginationInfo}>
            Total {totalRecords} records, {pageSize} per page
          </div>
          <div className={styles.paginationControls}>
            <motion.button 
              className={styles.paginationButton}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
              disabled={currentPage <= 1}
            >
              &lt;
            </motion.button>
            
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const pageNum = i + 1
              return (
                <motion.button 
                  key={pageNum}
                  className={`${styles.paginationButton} ${currentPage === pageNum ? styles.paginationButtonActive : ''}`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handlePageChange(pageNum)}
                >
                  {pageNum}
                </motion.button>
              )
            })}
            
            <motion.button 
              className={styles.paginationButton}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
            >
              &gt;
            </motion.button>
          </div>
          <div className="flex items-center space-x-2">
            <span className={styles.paginationInfo}>Go to page</span>
            <input 
              type="number" 
              className={styles.paginationInput}
              value={currentPage}
              onChange={(e) => {
                const page = parseInt(e.target.value)
                if (page >= 1 && page <= totalPages) {
                  setCurrentPage(page)
                }
              }}
              min={1}
              max={totalPages}
            />
            <motion.button 
              className={styles.confirmButton}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fetchRechargeHistory(currentPage)}
            >
              Confirm
            </motion.button>
          </div>
        </div>
      )}

      {/* Marketplace 分页 */}
      {activeTab === 'marketplace' && marketplaceHistory.length > 0 && (
        <div className={styles.paginationContainer}>
          <div className={styles.paginationInfo}>
            Total {marketplacePagination.total_items} records, {marketplacePagination.per_page} per page
          </div>
          <div className={styles.paginationControls}>
            <motion.button 
              className={styles.paginationButton}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                const newPage = marketplacePagination.current_page - 1
                handleMarketplacePageChange(newPage)
              }}
              disabled={marketplacePagination.current_page <= 1}
            >
              &lt;
            </motion.button>
            
            {Array.from({ length: Math.min(5, marketplacePagination.total_pages) }, (_, i) => {
              const pageNum = i + 1
              return (
                <motion.button 
                  key={pageNum}
                  className={`${styles.paginationButton} ${marketplacePagination.current_page === pageNum ? styles.paginationButtonActive : ''}`}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => {
                    handleMarketplacePageChange(pageNum)
                  }}
                >
                  {pageNum}
                </motion.button>
              )
            })}
            
            <motion.button 
              className={styles.paginationButton}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => {
                const newPage = marketplacePagination.current_page + 1
                handleMarketplacePageChange(newPage)
              }}
              disabled={marketplacePagination.current_page >= marketplacePagination.total_pages}
            >
              &gt;
            </motion.button>
          </div>
        </div>
      )}

      {/* Provably Fair 弹窗 */}
      <AnimatePresence>
        {isModalOpen && selectedItem && (
          <FairModal 
            isOpen={isModalOpen}
            onClose={() => setIsModalOpen(false)}
            transactionId={selectedItem.id.toString()}
            date={formatDateTime(selectedItem.opened_at).dateStr}
            time={formatDateTime(selectedItem.opened_at).timeStr}
            packData={{
              pack_type: selectedItem.pack_type,
              price_points: selectedItem.price_points,
              client_seed: selectedItem.client_seed,
              server_seed: selectedItem.server_seed,
              server_seed_hash: selectedItem.server_seed_hash,
              nonce: selectedItem.nonce,
              random_hash: selectedItem.random_hash
            }}
          />
        )}
      </AnimatePresence>

      {/* 图片查看弹窗 */}
      <AnimatePresence>
        {selectedImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80"
            onClick={() => setSelectedImage(null)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative max-w-4xl max-h-[90vh] p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setSelectedImage(null)}
                className="absolute top-2 right-2 z-10 bg-black bg-opacity-50 rounded-full p-2 hover:bg-opacity-70 transition-all"
              >
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <Image
                src={selectedImage.url}
                alt={selectedImage.name}
                width={800}
                height={800}
                className="rounded-lg object-contain max-h-[85vh] w-auto"
                onError={(e) => {
                  e.currentTarget.src = '/cards/common1.jpg.svg'
                }}
              />
              <p className="text-white text-center mt-4 text-lg font-medium">
                {selectedImage.name}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}