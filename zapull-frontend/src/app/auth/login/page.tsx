'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { useAuthStore } from '@/store/authStore'
import { userApi } from '@/lib/userApi'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const { setUid, setUserInfo, setToken } = useAuthStore()

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
        console.log('邮箱登录token已缓存')
      } catch (tokenErr) {
        console.error('获取token失败:', tokenErr)
      }
      
      try {
        // 获取用户信息并存储到全局状态
        const userInfo = await userApi.getUserInfo()
        setUserInfo(userInfo)
        console.log('登录成功:', userCredential.user)
        router.push('/inventory')
      } catch (apiErr) {
        console.error('获取用户信息失败:', apiErr)
        setError('登录成功但获取用户信息失败，请稍后重试')
      }
    } catch (err: unknown) {
      console.error('登录失败:', err)
      setError((err as { code?: string })?.code === 'auth/invalid-credential' ? '邮箱或密码错误' : '登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError('')

    try {
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({
        prompt: 'select_account'
      })
      const userCredential = await signInWithPopup(auth, provider)
      const userId = userCredential.user.uid
      setUid(userId)
      
      // 获取并缓存token
      try {
        const token = await userCredential.user.getIdToken()
        setToken(token, Date.now() + 3600000) // 缓存1小时
        console.log('Google登录token已缓存')
      } catch (tokenErr) {
        console.error('获取token失败:', tokenErr)
      }
      
      try {
        // 谷歌登录成功后，调用服务端接口获取用户信息
        const userInfo = await userApi.getUserInfo()
        setUserInfo(userInfo)
        console.log('Google登录成功:', userCredential.user)
        router.push('/inventory')
      } catch (apiErr) {
        console.error('获取用户信息失败:', apiErr)
        setError('Google登录成功但获取用户信息失败，请稍后重试')
      }
    } catch (err: unknown) {
      console.error('Google登录失败:', err)
      setError('Google登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-md mx-auto bg-white p-8 rounded-lg shadow-md">
      <h1 className="text-2xl font-bold mb-6 text-center">用户登录</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">邮箱</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
            disabled={loading}
          />
        </div>
        
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">密码</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
            required
            disabled={loading}
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-500 text-white py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
          disabled={loading}
        >
          {loading ? '登录中...' : '邮箱登录'}
        </button>
      </form>

      <div className="mt-4 text-center">
        <span className="text-gray-500">或</span>
      </div>

      <button
        onClick={handleGoogleLogin}
        className="w-full mt-4 bg-white border border-gray-300 text-gray-700 py-2 rounded-md hover:bg-gray-50 disabled:opacity-50 flex items-center justify-center"
        disabled={loading}
      >
        <Image src="/google.png" alt="Google" width={20} height={20} className="mr-2" />
        使用Google登录
      </button>

      <div className="mt-4 text-center text-sm">
        <Link href="/auth/forgot-password" className="text-blue-500 hover:underline">
          忘记密码？
        </Link>
        <span className="mx-2">·</span>
        <Link href="/auth/register" className="text-blue-500 hover:underline">
          注册账号
        </Link>
      </div>
    </div>
  )
}