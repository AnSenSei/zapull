'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Image from 'next/image'
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, TwitterAuthProvider, FacebookAuthProvider } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

function ReauthContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const { setUid, setUserInfo, setToken } = useAuthStore()
  
  // 获取重定向URL，默认为主页
  const redirectUrl = searchParams.get('redirect') || '/'

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password)
      const userId = userCredential.user.uid
      setUid(userId)
      
      // 获取并缓存token
      try {
        const token = await userCredential.user.getIdToken()
        setToken(token, Date.now() + 3600000) // 缓存1小时
        console.log('重新登录token已缓存')
      } catch (tokenErr) {
        console.error('获取token失败:', tokenErr)
      }
      
      // 获取用户信息
      try {
        const userInfo = await userApi.getUserInfo(userId)
        setUserInfo(userInfo)
        console.log('重新登录用户信息已获取:', userInfo)
        
        // 登录成功，跳转到原页面
        router.push(redirectUrl)
      } catch (createErr) {
        console.error('获取用户信息失败:', createErr)
        setError('登录成功但获取用户信息失败，请稍后重试')
        setLoading(false)
      }
    } catch (error: any) {
      console.error('重新登录失败:', error)
      setError('登录失败，请检查邮箱和密码')
      setLoading(false)
    }
  }

  const handleSocialLogin = async (provider: GoogleAuthProvider | TwitterAuthProvider | FacebookAuthProvider) => {
    setLoading(true)
    setError('')

    try {
      const userCredential = await signInWithPopup(auth, provider)
      const userId = userCredential.user.uid
      setUid(userId)
      
      // 获取并缓存token
      try {
        const token = await userCredential.user.getIdToken()
        setToken(token, Date.now() + 3600000) // 缓存1小时
        console.log('社交登录token已缓存')
      } catch (tokenErr) {
        console.error('获取token失败:', tokenErr)
      }
      
      // 获取用户信息
      try {
        const userInfo = await userApi.getUserInfo(userId)
        setUserInfo(userInfo)
        console.log('社交登录用户信息已获取:', userInfo)
        
        // 登录成功，跳转到原页面
        router.push(redirectUrl)
      } catch (createErr) {
        console.error('获取用户信息失败:', createErr)
        // 如果用户不存在，尝试创建
        try {
          const newUserInfo = await userApi.createUser({
            uid: userId,
            email: userCredential.user.email || '',
            display_name: userCredential.user.displayName || '',
            photo_url: userCredential.user.photoURL || ''
          })
          setUserInfo(newUserInfo)
          console.log('新用户创建成功:', newUserInfo)
          
          // 登录成功，跳转到原页面
          router.push(redirectUrl)
        } catch (createErr) {
          console.error('创建账户失败:', createErr)
          setError('创建账户失败，请稍后重试')
          setLoading(false)
        }
      }
    } catch (error: any) {
      console.error('社交登录失败:', error)
      setError('登录失败，请稍后重试')
      setLoading(false)
    }
  }

  const handleGoHome = () => {
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0F111C] to-[#1F2235] flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md"
        style={{
          background: 'linear-gradient(0deg, #0F111C 0%, #1F2235 99%)',
          borderRadius: '20px',
          border: '2px solid #8B5CF6'
        }}
      >
        <div className="p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-white mb-2">Sign In Required</h1>
            <p className="text-gray-400 mb-4">Please sign in to continue.</p>
            {redirectUrl !== '/' && (
              <p className="text-sm text-purple-400">You will be redirected back to your previous page after signing in.</p>
            )}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/20 border border-red-500 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
            <div>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-[#25262B] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
                disabled={loading}
              />
            </div>

            <div>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 bg-[#25262B] text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                required
                disabled={loading}
              />
            </div>

            <button
              type="submit"
              className="w-full bg-purple-600 text-white py-3 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <div className="text-center mb-6">
            <span className="text-gray-500">or continue with</span>
          </div>

          <div className="grid grid-cols-3 gap-3 mb-6">
            <button
              onClick={() => handleSocialLogin(new FacebookAuthProvider())}
              className="flex items-center justify-center px-4 py-2 bg-[#25262B] text-white rounded-lg hover:bg-opacity-80 transition-colors"
              disabled={loading}
            >
              <img src="/facebook.png" alt="Facebook" className="w-5 h-5" />
            </button>

            <button
              onClick={() => handleSocialLogin(new GoogleAuthProvider())}
              className="flex items-center justify-center px-4 py-2 bg-[#25262B] text-white rounded-lg hover:bg-opacity-80 transition-colors"
              disabled={loading}
            >
              <img src="/google.png" alt="Google" className="w-5 h-5" />
            </button>

            <button
              onClick={() => handleSocialLogin(new TwitterAuthProvider())}
              className="flex items-center justify-center px-4 py-2 bg-[#25262B] text-white rounded-lg hover:bg-opacity-80 transition-colors"
              disabled={loading}
            >
              <img src="/twitter.png" alt="Twitter" className="w-5 h-5" />
            </button>
          </div>

          <div className="text-center">
            <button
              onClick={handleGoHome}
              className="text-gray-400 hover:text-white transition-colors text-sm"
            >
              Go to Home Page
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ReauthPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-b from-[#0F111C] to-[#1F2235] flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <ReauthContent />
    </Suspense>
  )
}