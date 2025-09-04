'use client'

import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { getAuthHeaders } from '@/lib/authUtils'

export default function TestTokenPage() {
  const { token, tokenExpiry, isTokenValid, uid } = useAuthStore()
  const [authHeaders, setAuthHeaders] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  const testGetAuthHeaders = async () => {
    setLoading(true)
    try {
      const headers = await getAuthHeaders()
      setAuthHeaders(headers)
    } catch (error) {
      console.error('测试获取认证头失败:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatExpiry = (expiry: number | null) => {
    if (!expiry) return '无'
    return new Date(expiry).toLocaleString()
  }

  const getTimeRemaining = (expiry: number | null) => {
    if (!expiry) return '无'
    const remaining = expiry - Date.now()
    if (remaining <= 0) return '已过期'
    const minutes = Math.floor(remaining / 60000)
    const seconds = Math.floor((remaining % 60000) / 1000)
    return `${minutes}分${seconds}秒`
  }

  useEffect(() => {
    const interval = setInterval(() => {
      // 强制重新渲染以更新剩余时间
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">Token缓存测试页面</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 用户状态 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">用户状态</h2>
            <div className="space-y-2">
              <p><strong>用户ID:</strong> {uid || '未登录'}</p>
              <p><strong>登录状态:</strong> {uid ? '已登录' : '未登录'}</p>
            </div>
          </div>

          {/* Token状态 */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Token状态</h2>
            <div className="space-y-2">
              <p><strong>Token存在:</strong> {token ? '是' : '否'}</p>
              <p><strong>Token有效:</strong> {isTokenValid() ? '是' : '否'}</p>
              <p><strong>过期时间:</strong> {formatExpiry(tokenExpiry)}</p>
              <p><strong>剩余时间:</strong> {getTimeRemaining(tokenExpiry)}</p>
            </div>
          </div>

          {/* Token详情 */}
          <div className="bg-white p-6 rounded-lg shadow md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">Token详情</h2>
            <div className="space-y-2">
              <p><strong>Token (前50字符):</strong></p>
              <p className="font-mono text-sm bg-gray-100 p-2 rounded break-all">
                {token ? token.substring(0, 50) + '...' : '无Token'}
              </p>
            </div>
          </div>

          {/* 测试功能 */}
          <div className="bg-white p-6 rounded-lg shadow md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">测试功能</h2>
            <div className="space-y-4">
              <button
                onClick={testGetAuthHeaders}
                disabled={loading}
                className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
              >
                {loading ? '测试中...' : '测试获取认证头'}
              </button>
              
              {authHeaders && (
                <div>
                  <p><strong>认证头结果:</strong></p>
                  <pre className="bg-gray-100 p-2 rounded text-sm overflow-auto">
                    {JSON.stringify(authHeaders, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>

          {/* 说明 */}
          <div className="bg-yellow-50 p-6 rounded-lg shadow md:col-span-2">
            <h2 className="text-xl font-semibold mb-4">功能说明</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Token会在用户登录时自动获取并缓存到本地存储</li>
              <li>Token默认缓存1小时，过期后会自动从Firebase重新获取</li>
              <li>页面刷新后Token仍然保持有效，避免重复获取</li>
              <li>Google登录时会自动获取并缓存Token</li>
              <li>用户登出时会清除所有缓存的Token</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}