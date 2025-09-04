<template>
  <div class="login-container">
    <el-card class="login-card">
      <template #header>
        <h2 class="login-title">管理员登录</h2>
      </template>
      
      <!-- 邮箱密码登录 -->
      <el-form
        ref="loginFormRef"
        :model="loginForm"
        :rules="loginRules"
        @keyup.enter="handleEmailLogin"
      >
        <el-form-item prop="email">
          <el-input
            v-model="loginForm.email"
            placeholder="邮箱"
            :prefix-icon="Message"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="loginForm.password"
            type="password"
            placeholder="密码"
            :prefix-icon="Lock"
            show-password
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :loading="loading"
            class="login-button"
            @click="handleEmailLogin"
          >
            邮箱登录
          </el-button>
        </el-form-item>
      </el-form>
      
      <el-divider>或</el-divider>
      
      <!-- 第三方登录 -->
      <div class="social-login">
        <el-button
          type="primary"
          :loading="loading"
          class="social-button"
          @click="handleGoogleLogin"
        >
          Google 登录
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Message, Lock } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { checkUserIsAdmin } from '@/api/users'
import { signInWithEmailAndPassword, signInWithPopup, onAuthStateChanged } from 'firebase/auth'
import { auth, googleProvider } from '@/utils/firebase'

const router = useRouter()
const loading = ref(false)
const loginForm = ref({
  email: '',
  password: ''
})

const loginRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱格式', trigger: 'blur' }
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }]
}

// 验证管理员权限
const verifyAdminAccess = async (userId: string) => {
  try {
    const result = await checkUserIsAdmin(userId)
    if (result.is_admin) {
      // 存储Google用户ID
      localStorage.setItem('googleUserId', userId)
      ElMessage.success('登录成功')
      await router.push('/card-packs/list')
    } else {
      ElMessage.error('您没有管理员权限，无法访问此系统')
      // 清除所有认证信息
      localStorage.removeItem('token')
      localStorage.removeItem('googleUserId')
    }
  } catch (error) {
    console.error('验证管理员权限失败:', error)
    ElMessage.error('验证管理员权限失败')
    localStorage.removeItem('token')
    localStorage.removeItem('googleUserId')
  }
}

// 邮箱密码登录
  const handleEmailLogin = async () => {
    loading.value = true
    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginForm.value.email, loginForm.value.password)
      const token = await userCredential.user.getIdToken()
      localStorage.setItem('token', token)
      
      // 使用Firebase返回的localId（即用户的uid）调用isAdmin接口
      await verifyAdminAccess(userCredential.user.uid)
    } catch (error: any) {
      console.error('邮箱登录失败:', error)
      let errorMessage = '登录失败，请检查邮箱和密码'
      
      // 根据Firebase错误代码提供更具体的错误信息
      if (error.code === 'auth/user-not-found') {
        errorMessage = '用户不存在，请检查邮箱地址'
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = '密码错误，请重新输入'
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = '邮箱格式不正确'
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = '该用户账户已被禁用'
      }
      
      ElMessage.error(errorMessage)
      // 清除所有认证信息
      localStorage.removeItem('token')
      localStorage.removeItem('googleUserId')
    } finally {
      loading.value = false
    }
  }

// Google登录
 const handleGoogleLogin = async () => {
   loading.value = true
   try {
     const result = await signInWithPopup(auth, googleProvider)
     const token = await result.user.getIdToken()
     localStorage.setItem('token', token)
     
     // 使用Google返回的localId（即Firebase用户的uid）调用isAdmin接口
     await verifyAdminAccess(result.user.uid)
   } catch (error: any) {
     console.error('Google登录失败:', error)
     let errorMessage = 'Google登录失败'
     
     // 根据Firebase错误代码提供更具体的错误信息
     if (error.code === 'auth/popup-closed-by-user') {
       errorMessage = '登录窗口被用户关闭'
     } else if (error.code === 'auth/popup-blocked') {
       errorMessage = '登录弹窗被浏览器阻止，请允许弹窗后重试'
     } else if (error.code === 'auth/cancelled-popup-request') {
       errorMessage = '登录请求被取消'
     }
     
     ElMessage.error(errorMessage)
     // 清除所有认证信息
     localStorage.removeItem('token')
     localStorage.removeItem('googleUserId')
   } finally {
     loading.value = false
   }
 }

// 自动登录检查
onMounted(() => {
  // 监听Firebase认证状态变化
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      // 用户已登录，自动验证管理员权限
      loading.value = true
      try {
        const token = await user.getIdToken()
        localStorage.setItem('token', token)
        
        // 验证管理员权限并自动跳转
        await verifyAdminAccess(user.uid)
      } catch (error) {
        console.error('自动登录失败:', error)
        // 如果自动登录失败，清除认证状态
        localStorage.removeItem('token')
        localStorage.removeItem('googleUserId')
      } finally {
        loading.value = false
      }
    }
  })
})

</script>

<style scoped lang="scss">
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f5f5f5;
}

.login-card {
  width: 100%;
  max-width: 400px;
  margin: 20px;
}

.login-title {
  text-align: center;
  margin: 0;
  color: #303133;
}

.login-button {
  width: 100%;
}

.social-login {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.social-button {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
</style>