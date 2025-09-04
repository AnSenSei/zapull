// Firebase配置和初始化
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'

// Firebase配置
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
}

// 初始化Firebase
const app = initializeApp(firebaseConfig)

// 初始化Firebase Auth
export const auth = getAuth(app)

// 配置认证提供商
export const googleProvider = new GoogleAuthProvider()

// 设置Google认证的额外参数
googleProvider.setCustomParameters({
  prompt: 'select_account'
})

export default app