<template>
  <div class="virtual-user-manage-container">
    <el-card class="main-card">
      <template #header>
        <div class="card-header">
          <span>虚拟用户管理</span>
          <el-tag type="info">管理员工具</el-tag>
        </div>
      </template>

      <!-- 用户选择/创建区域 -->
      <el-form :model="formData" label-width="120px" class="config-form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="选择用户" required>
              <el-select
                v-model="formData.email"
                placeholder="选择或输入用户邮箱"
                style="width: 100%"
                filterable
                allow-create
                :loading="adminUsersLoading"
                @change="handleEmailChange"
              >
                <el-option
                  v-for="user in adminUsers"
                  :key="user.id"
                  :label="`${user.email} (${user.display_name})`"
                  :value="user.email"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="用户信息">
              <div v-if="selectedUser" class="user-info">
                <el-avatar :src="selectedUser.avatar" :size="32" />
                <span class="user-name">{{ selectedUser.display_name }}</span>
                <el-tag type="success" size="small">{{ selectedUser.points_balance }} 积分</el-tag>
                <el-tag type="info" size="small">Lv.{{ selectedUser.level }}</el-tag>
              </div>
              <div v-else-if="formData.email && !lookupLoading" class="no-user-actions">
                <span class="no-user">未找到用户</span>
                <el-button type="primary" size="small" @click="showCreateUserDialog = true">
                  创建用户
                </el-button>
              </div>
              <span v-else class="no-user">请选择用户</span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <el-alert
        title="功能说明"
        type="info"
        :closable="false"
        class="info-alert"
      >
        <template #default>
          <ul>
            <li>管理虚拟用户的成就</li>
            <li>可以手动授予或撤销成就</li>
            <li>修改用户基本信息（头像、名称、积分）</li>
          </ul>
        </template>
      </el-alert>
    </el-card>

    <!-- 创建用户对话框 -->
    <el-dialog
      v-model="showCreateUserDialog"
      title="创建新用户"
      width="500px"
    >
      <el-form :model="newUserForm" label-width="100px">
        <el-form-item label="邮箱" required>
          <el-input v-model="newUserForm.email" :disabled="true" />
        </el-form-item>
        <el-form-item label="显示名称" required>
          <el-input v-model="newUserForm.display_name" placeholder="输入显示名称" />
        </el-form-item>
        <el-form-item label="头像">
          <div class="avatar-upload-section">
            <el-avatar :src="avatarPreview" :size="64" />
            <div class="avatar-actions">
              <el-upload
                :show-file-list="false"
                :before-upload="handleAvatarUpload"
                accept="image/*"
              >
                <el-button size="small" type="primary">上传头像</el-button>
              </el-upload>
              <el-button size="small" @click="resetAvatar">使用默认</el-button>
            </div>
            <span class="avatar-hint">默认使用显示名称生成头像</span>
          </div>
        </el-form-item>
        <el-form-item label="初始积分">
          <el-input-number v-model="newUserForm.initial_points" :min="0" :step="1000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreateUserDialog = false">取消</el-button>
        <el-button type="primary" @click="handleCreateUser" :loading="createUserLoading">
          创建
        </el-button>
      </template>
    </el-dialog>

    <!-- 编辑用户对话框 -->
    <el-dialog
      v-model="showEditUserDialog"
      title="编辑用户信息"
      width="500px"
    >
      <el-form :model="editUserForm" label-width="100px">
        <el-form-item label="邮箱">
          <el-input v-model="editUserForm.email" :disabled="true" />
        </el-form-item>
        <el-form-item label="显示名称">
          <el-input v-model="editUserForm.display_name" placeholder="输入显示名称" />
        </el-form-item>
        <el-form-item label="头像">
          <div class="avatar-upload-section">
            <el-avatar :src="editAvatarPreview" :size="64" />
            <div class="avatar-actions">
              <el-upload
                :show-file-list="false"
                :before-upload="handleEditAvatarUpload"
                accept="image/*"
              >
                <el-button size="small" type="primary">更换头像</el-button>
              </el-upload>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="积分余额">
          <el-input-number v-model="editUserForm.points_balance" :min="0" :step="1000" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showEditUserDialog = false">取消</el-button>
        <el-button type="primary" @click="handleUpdateUser" :loading="updateUserLoading">
          保存
        </el-button>
      </template>
    </el-dialog>

    <!-- 用户详情卡片 -->
    <el-card v-if="selectedUser" class="user-detail-card">
      <template #header>
        <div class="card-header">
          <span>用户详情</span>
          <el-button type="primary" size="small" @click="openEditUserDialog">
            编辑信息
          </el-button>
        </div>
      </template>

      <div class="user-detail-content">
        <div class="user-profile">
          <el-avatar :src="selectedUser.avatar" :size="80" />
          <div class="user-meta">
            <h3>{{ selectedUser.display_name }}</h3>
            <p class="email">{{ selectedUser.email }}</p>
            <div class="stats">
              <el-tag type="success">{{ selectedUser.points_balance }} 积分</el-tag>
              <el-tag type="info">等级 {{ selectedUser.level }}</el-tag>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 成就管理卡片 -->
    <el-card v-if="selectedUser" class="achievements-card">
      <template #header>
        <div class="card-header">
          <span>成就管理</span>
          <el-button size="small" @click="loadUserAchievements" :loading="userAchievementsLoading">
            刷新
          </el-button>
        </div>
      </template>

      <!-- 已获得的成就 -->
      <div class="section">
        <h4>已获得的成就 ({{ userAchievementIds.size }})</h4>
        <div v-if="acquiredAchievements.length > 0" class="achievements-grid">
          <div
            v-for="achievement in acquiredAchievements"
            :key="achievement.id"
            class="achievement-item acquired"
          >
            <div class="achievement-content">
              <span class="achievement-name">{{ achievement.name }}</span>
              <span class="achievement-desc">{{ achievement.description }}</span>
              <el-tag size="small" :type="getConditionTagType(achievement.condition?.type)">
                {{ formatConditionType(achievement.condition?.type) }}
              </el-tag>
            </div>
            <el-button
              type="danger"
              size="small"
              :loading="revokingAchievementId === achievement.id"
              @click="handleRevokeAchievement(achievement)"
            >
              撤销
            </el-button>
          </div>
        </div>
        <el-empty v-else description="暂无已获得的成就" />
      </div>

      <el-divider />

      <!-- 可授予的成就 -->
      <div class="section">
        <h4>可授予的成就 ({{ availableAchievements.length }})</h4>
        <el-input
          v-model="achievementSearchQuery"
          placeholder="搜索成就名称..."
          clearable
          class="search-input"
        />
        <div v-if="filteredAvailableAchievements.length > 0" class="achievements-grid">
          <div
            v-for="achievement in filteredAvailableAchievements"
            :key="achievement.id"
            class="achievement-item available"
          >
            <div class="achievement-content">
              <span class="achievement-name">{{ achievement.name }}</span>
              <span class="achievement-desc">{{ achievement.description }}</span>
              <el-tag size="small" :type="getConditionTagType(achievement.condition?.type)">
                {{ formatConditionType(achievement.condition?.type) }}
              </el-tag>
            </div>
            <el-button
              type="primary"
              size="small"
              :loading="grantingAchievementId === achievement.id"
              @click="handleGrantAchievement(achievement)"
            >
              授予
            </el-button>
          </div>
        </div>
        <el-empty v-else-if="achievementSearchQuery" description="未找到匹配的成就" />
        <el-empty v-else description="所有成就已授予" />
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import type { UploadProps } from 'element-plus'
import {
  getAdminUsers,
  createAdminUser,
  getAllAchievements,
  getUserAchievements,
  grantAchievement,
  revokeAchievement,
  updateAdminUser,
  type AdminUser,
  type Achievement,
  type UserAchievement
} from '@/api/admin'

// State
const formData = ref({
  email: ''
})

const adminUsers = ref<AdminUser[]>([])
const adminUsersLoading = ref(false)
const lookupLoading = ref(false)
const selectedUser = ref<AdminUser | null>(null)

// Create user dialog
const showCreateUserDialog = ref(false)
const createUserLoading = ref(false)
const newUserForm = ref({
  email: '',
  display_name: '',
  initial_points: 10000,
  avatar: ''
})
const avatarPreview = computed(() => {
  if (newUserForm.value.avatar) {
    return newUserForm.value.avatar
  }
  if (newUserForm.value.display_name) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(newUserForm.value.display_name)}&background=random&color=fff&size=128&length=1`
  }
  return ''
})

// Edit user dialog
const showEditUserDialog = ref(false)
const updateUserLoading = ref(false)
const editUserForm = ref({
  user_id: '',
  email: '',
  display_name: '',
  avatar: '',
  points_balance: 0
})
const editAvatarPreview = computed(() => editUserForm.value.avatar || '')

// Achievements
const allAchievements = ref<Achievement[]>([])
const userAchievements = ref<UserAchievement[]>([])
const userAchievementsLoading = ref(false)
const achievementSearchQuery = ref('')
const grantingAchievementId = ref<string | null>(null)
const revokingAchievementId = ref<string | null>(null)

// Computed
const userAchievementIds = computed(() => {
  return new Set(userAchievements.value.filter(a => a.acquired).map(a => a.achievement_id))
})

const acquiredAchievements = computed(() => {
  return allAchievements.value.filter(a => userAchievementIds.value.has(a.id))
})

const availableAchievements = computed(() => {
  return allAchievements.value.filter(a => !userAchievementIds.value.has(a.id))
})

const filteredAvailableAchievements = computed(() => {
  if (!achievementSearchQuery.value) {
    return availableAchievements.value
  }
  const query = achievementSearchQuery.value.toLowerCase()
  return availableAchievements.value.filter(a =>
    a.name.toLowerCase().includes(query) ||
    a.description.toLowerCase().includes(query)
  )
})

// Methods
const loadAdminUsers = async () => {
  adminUsersLoading.value = true
  try {
    const response = await getAdminUsers()
    if (response.success) {
      adminUsers.value = response.users
    }
  } catch (error) {
    console.error('Failed to load admin users:', error)
  } finally {
    adminUsersLoading.value = false
  }
}

const loadAllAchievements = async () => {
  try {
    const response = await getAllAchievements()
    if (response.success) {
      allAchievements.value = response.achievements
    }
  } catch (error) {
    console.error('Failed to load achievements:', error)
  }
}

const loadUserAchievements = async () => {
  if (!formData.value.email) return

  userAchievementsLoading.value = true
  try {
    const response = await getUserAchievements(formData.value.email)
    if (response.success) {
      userAchievements.value = response.achievements
    }
  } catch (error) {
    console.error('Failed to load user achievements:', error)
    userAchievements.value = []
  } finally {
    userAchievementsLoading.value = false
  }
}

const handleEmailChange = async (email: string) => {
  if (!email) {
    selectedUser.value = null
    userAchievements.value = []
    return
  }

  // Check if it's an admin user
  const user = adminUsers.value.find(u => u.email === email)
  if (user) {
    selectedUser.value = user
    await loadUserAchievements()
  } else {
    selectedUser.value = null
    userAchievements.value = []
    // Set email for create user dialog
    newUserForm.value.email = email
  }
}

const handleAvatarUpload: UploadProps['beforeUpload'] = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    newUserForm.value.avatar = e.target?.result as string
  }
  reader.readAsDataURL(file)
  return false
}

const resetAvatar = () => {
  newUserForm.value.avatar = ''
}

const handleEditAvatarUpload: UploadProps['beforeUpload'] = (file) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    editUserForm.value.avatar = e.target?.result as string
  }
  reader.readAsDataURL(file)
  return false
}

const handleCreateUser = async () => {
  if (!newUserForm.value.email || !newUserForm.value.display_name) {
    ElMessage.warning('请填写必填项')
    return
  }

  createUserLoading.value = true
  try {
    const response = await createAdminUser({
      email: newUserForm.value.email,
      display_name: newUserForm.value.display_name,
      initial_points: newUserForm.value.initial_points,
      avatar: newUserForm.value.avatar || undefined
    })

    if (response.success) {
      ElMessage.success('用户创建成功')
      showCreateUserDialog.value = false

      // Reload admin users and select the new user
      await loadAdminUsers()
      formData.value.email = newUserForm.value.email
      await handleEmailChange(newUserForm.value.email)

      // Reset form
      newUserForm.value = {
        email: '',
        display_name: '',
        initial_points: 10000,
        avatar: ''
      }
    }
  } catch (error: any) {
    ElMessage.error(error.message || '创建用户失败')
  } finally {
    createUserLoading.value = false
  }
}

const openEditUserDialog = () => {
  if (!selectedUser.value) return

  editUserForm.value = {
    user_id: selectedUser.value.id,
    email: selectedUser.value.email,
    display_name: selectedUser.value.display_name,
    avatar: selectedUser.value.avatar,
    points_balance: selectedUser.value.points_balance
  }
  showEditUserDialog.value = true
}

const handleUpdateUser = async () => {
  updateUserLoading.value = true
  try {
    const response = await updateAdminUser({
      user_id: editUserForm.value.user_id,
      display_name: editUserForm.value.display_name,
      avatar: editUserForm.value.avatar,
      points_balance: editUserForm.value.points_balance
    })

    if (response.success) {
      ElMessage.success('用户信息已更新')
      showEditUserDialog.value = false

      // Update local state
      if (response.user && selectedUser.value) {
        selectedUser.value = {
          ...selectedUser.value,
          display_name: response.user.display_name,
          avatar: response.user.avatar,
          points_balance: response.user.points_balance,
          level: response.user.level
        }
      }

      // Reload admin users
      await loadAdminUsers()
    }
  } catch (error: any) {
    ElMessage.error(error.message || '更新用户失败')
  } finally {
    updateUserLoading.value = false
  }
}

const handleGrantAchievement = async (achievement: Achievement) => {
  if (!formData.value.email) return

  try {
    await ElMessageBox.confirm(
      `确定要授予成就 "${achievement.name}" 吗？`,
      '确认授予',
      { type: 'info' }
    )
  } catch {
    return
  }

  grantingAchievementId.value = achievement.id
  try {
    const response = await grantAchievement({
      email: formData.value.email,
      achievement_id: achievement.id
    })

    if (response.success) {
      if (response.action === 'already_exists') {
        ElMessage.info('用户已拥有此成就')
      } else {
        ElMessage.success(`成功授予成就: ${achievement.name}`)
      }
      await loadUserAchievements()
    } else {
      ElMessage.error(response.error || '授予成就失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '授予成就失败')
  } finally {
    grantingAchievementId.value = null
  }
}

const handleRevokeAchievement = async (achievement: Achievement) => {
  if (!formData.value.email) return

  try {
    await ElMessageBox.confirm(
      `确定要撤销成就 "${achievement.name}" 吗？此操作不可恢复。`,
      '确认撤销',
      { type: 'warning' }
    )
  } catch {
    return
  }

  revokingAchievementId.value = achievement.id
  try {
    const response = await revokeAchievement(formData.value.email, achievement.id)

    if (response.success) {
      ElMessage.success(`已撤销成就: ${achievement.name}`)
      await loadUserAchievements()
    } else {
      ElMessage.error(response.error || '撤销成就失败')
    }
  } catch (error: any) {
    ElMessage.error(error.message || '撤销成就失败')
  } finally {
    revokingAchievementId.value = null
  }
}

const formatConditionType = (type: string | undefined) => {
  const typeMap: Record<string, string> = {
    level_reached: '等级达成',
    fusion_reached: '合成次数',
    draw_by_rarity: '抽卡稀有度',
    buy_deal_reached: '购买交易',
    sell_deal_reached: '出售交易',
    withdraw_reached: '提现金额',
    special: '特殊成就'
  }
  return typeMap[type || ''] || type || '未知'
}

const getConditionTagType = (type: string | undefined) => {
  const typeMap: Record<string, string> = {
    level_reached: 'success',
    fusion_reached: 'warning',
    draw_by_rarity: 'primary',
    buy_deal_reached: 'info',
    sell_deal_reached: 'info',
    withdraw_reached: 'danger',
    special: ''
  }
  return typeMap[type || ''] || ''
}

// Lifecycle
onMounted(async () => {
  await Promise.all([
    loadAdminUsers(),
    loadAllAchievements()
  ])
})

// Watch for create dialog opening
watch(showCreateUserDialog, (val) => {
  if (val && formData.value.email) {
    newUserForm.value.email = formData.value.email
  }
})
</script>

<style scoped lang="scss">
.virtual-user-manage-container {
  padding: 20px;
}

.main-card {
  margin-bottom: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.config-form {
  margin-bottom: 20px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;

  .user-name {
    font-weight: 500;
  }
}

.no-user-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.no-user {
  color: #909399;
}

.info-alert {
  ul {
    margin: 0;
    padding-left: 20px;

    li {
      line-height: 1.8;
    }
  }
}

.avatar-upload-section {
  display: flex;
  align-items: center;
  gap: 15px;

  .avatar-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .avatar-hint {
    color: #909399;
    font-size: 12px;
  }
}

.user-detail-card {
  margin-bottom: 20px;
}

.user-detail-content {
  .user-profile {
    display: flex;
    align-items: center;
    gap: 20px;

    .user-meta {
      h3 {
        margin: 0 0 5px 0;
        font-size: 18px;
      }

      .email {
        color: #909399;
        margin: 0 0 10px 0;
      }

      .stats {
        display: flex;
        gap: 10px;
      }
    }
  }
}

.achievements-card {
  .section {
    margin-bottom: 20px;

    h4 {
      margin: 0 0 15px 0;
      color: #606266;
    }
  }

  .search-input {
    margin-bottom: 15px;
    max-width: 300px;
  }
}

.achievements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 15px;
}

.achievement-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-radius: 8px;
  background: #f5f7fa;
  transition: all 0.2s;

  &:hover {
    background: #e6e9ed;
  }

  &.acquired {
    background: #f0f9eb;
    border-left: 3px solid #67c23a;
  }

  &.available {
    background: #f4f4f5;
    border-left: 3px solid #909399;
  }

  .achievement-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 0;

    .achievement-name {
      font-weight: 500;
      font-size: 14px;
      color: #303133;
    }

    .achievement-desc {
      font-size: 12px;
      color: #909399;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
}
</style>
