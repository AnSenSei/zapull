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

// 验证Firebase配置
const validateFirebaseConfig = () => {
  const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId']
  const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig])
  
  if (missingFields.length > 0) {
    console.error('Missing Firebase configuration fields:', missingFields)
    console.error('Current config:', firebaseConfig)
    throw new Error(`Missing Firebase configuration: ${missingFields.join(', ')}`)
  }
  
  console.log('Firebase configuration loaded successfully')
}

// 验证配置
validateFirebaseConfig()

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