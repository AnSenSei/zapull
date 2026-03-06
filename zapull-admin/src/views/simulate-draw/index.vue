<template>
  <div class="simulate-draw-container">
    <el-card class="main-card">
      <template #header>
        <div class="card-header">
          <span>模拟抽卡</span>
          <el-tag type="info">管理员工具</el-tag>
        </div>
      </template>

      <!-- 配置表单 -->
      <el-form :model="formData" label-width="120px" class="config-form">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="用户邮箱" required>
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
              <div v-if="userInfo?.found" class="user-info">
                <el-avatar :src="userInfo.avatar" :size="32" />
                <span class="user-name">{{ userInfo.display_name }}</span>
                <el-tag type="success" size="small">{{ userInfo.points_balance }} 积分</el-tag>
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

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="卡包集合" required>
              <el-select
                v-model="formData.collection_id"
                placeholder="选择卡包集合"
                style="width: 100%"
                @change="handleCollectionChange"
                :loading="collectionsLoading"
              >
                <el-option
                  v-for="collection in collections"
                  :key="collection.id"
                  :label="collection.name"
                  :value="collection.id.toString()"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="卡包" required>
              <el-select
                v-model="formData.pack_id"
                placeholder="选择卡包"
                style="width: 100%"
                filterable
                :loading="packsLoading"
              >
                <el-option
                  v-for="pack in packs"
                  :key="pack.id"
                  :label="`${pack.name} (${pack.price}积分)`"
                  :value="pack.id"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>

        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="每次抽卡数">
              <el-radio-group v-model="formData.draw_count">
                <el-radio-button :label="1">1张</el-radio-button>
                <el-radio-button :label="3">3张</el-radio-button>
                <el-radio-button :label="5">5张</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="抽卡次数">
              <el-input-number
                v-model="batchIterations"
                :min="1"
                :max="50"
                :step="1"
              />
              <span class="batch-hint">（共抽 {{ formData.draw_count * batchIterations }} 张）</span>
            </el-form-item>
          </el-col>
        </el-row>

        <!-- 操作按钮 -->
        <el-form-item label=" ">
          <el-button
            type="primary"
            size="large"
            @click="handleBatchDraw"
            :loading="drawLoading"
            :disabled="!canDraw"
          >
            <el-icon><MagicStick /></el-icon>
            开始抽卡 ({{ batchIterations }}次 × {{ formData.draw_count }}张)
          </el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>

      <!-- 功能说明 -->
      <el-alert
        title="功能说明"
        type="info"
        :closable="false"
        class="info-alert"
      >
        <template #default>
          <ul>
            <li>自动检查用户积分余额，不足时自动充值</li>
            <li>根据卡包概率随机抽取卡牌</li>
            <li>更新周榜消费记录 (weekly_spent) 和用户等级</li>
            <li>高稀有度卡牌自动添加到 top_hits</li>
            <li><strong>点击抽到的卡牌可添加到用户 Highlights</strong></li>
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

    <!-- 用户 Highlights -->
    <el-card v-if="userInfo?.found" class="result-card highlights-card">
      <template #header>
        <div class="card-header">
          <span>用户 Highlights</span>
          <el-button size="small" @click="loadUserHighlights" :loading="highlightsLoading">
            刷新
          </el-button>
        </div>
      </template>

      <div v-if="userHighlights.length === 0" class="empty-highlights">
        <el-empty description="暂无 Highlights" />
      </div>
      <div v-else class="cards-grid">
        <div 
          v-for="card in userHighlights" 
          :key="card.id"
          class="card-item clickable highlighted"
          :class="getCardColorClass(card.color)"
          @click="handleRemoveHighlight(card)"
        >
          <el-image 
            :src="card.image_url" 
            fit="cover" 
            class="card-image"
          >
            <template #error>
              <div class="image-placeholder">
                <el-icon><Picture /></el-icon>
              </div>
            </template>
          </el-image>
          <div class="card-info">
            <div class="card-name">{{ card.card_name }}</div>
            <div class="card-details">
              <el-tag :type="getColorTagType(card.color)" size="small">{{ card.color }}</el-tag>
              <span class="point-worth">{{ card.point_worth }}分</span>
            </div>
          </div>
          <div class="highlight-badge">
            <el-icon><Star /></el-icon>
          </div>
          <div class="remove-hint">点击移除</div>
        </div>
      </div>
    </el-card>

    <!-- 抽卡结果 -->
    <el-card v-if="allDrawnCards.length > 0" class="result-card">
      <template #header>
        <div class="card-header">
          <span>抽卡结果</span>
          <el-tag type="success">共 {{ allDrawnCards.length }} 张</el-tag>
        </div>
      </template>

      <!-- 统计摘要 -->
      <el-row :gutter="16" class="stats-row">
        <el-col :span="6">
          <el-statistic title="抽取卡牌" :value="allDrawnCards.length" suffix="张" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="总消费积分" :value="totalSpent" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="高稀有度卡牌" :value="highRarityCount" suffix="张" />
        </el-col>
        <el-col :span="6">
          <el-statistic title="自动充值" :value="totalToppedUp" suffix="积分" />
        </el-col>
      </el-row>

      <!-- 周榜更新信息 -->
      <div v-if="weeklySpentInfo.weekId" class="weekly-spent-info">
        <el-tag type="primary" size="large">
          周榜 ({{ weeklySpentInfo.weekId }}): 
          {{ weeklySpentInfo.previousSpent }} → {{ weeklySpentInfo.newSpent }}
          <span style="color: #67c23a; margin-left: 8px;">+{{ weeklySpentInfo.newSpent - weeklySpentInfo.previousSpent }}</span>
        </el-tag>
      </div>

      <!-- 提示 -->
      <el-alert
        title="点击卡牌可添加到用户 Highlights"
        type="warning"
        :closable="false"
        style="margin: 16px 0"
      />

      <!-- 抽取的卡牌列表 -->
      <div class="cards-grid">
        <div 
          v-for="(card, index) in allDrawnCards" 
          :key="`${card.id}-${index}`"
          class="card-item clickable"
          :class="[getCardColorClass(card.color), { 'highlighted': highlightedCards.has(card.id) }]"
          @click="handleAddHighlight(card)"
        >
          <el-image 
            :src="card.image_url" 
            fit="cover" 
            class="card-image"
          >
            <template #error>
              <div class="image-placeholder">
                <el-icon><Picture /></el-icon>
              </div>
            </template>
          </el-image>
          <div class="card-info">
            <div class="card-name">{{ card.card_name }}</div>
            <div class="card-details">
              <el-tag :type="getColorTagType(card.color)" size="small">{{ card.color }}</el-tag>
              <span class="point-worth">{{ card.point_worth }}分</span>
            </div>
          </div>
          <div class="card-badge">#{{ card.iteration }}-{{ card.num_draw }}</div>
          <div v-if="highlightedCards.has(card.id)" class="highlight-badge">
            <el-icon><Star /></el-icon>
          </div>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { MagicStick, Picture, Star } from '@element-plus/icons-vue'
import { getPackCollections, getPackList, type PackCollection, type PackDetail } from '@/api/packs'
import { 
  lookupUserByEmail, 
  automatedDraw, 
  highlightCard,
  getUserHighlights,
  removeHighlightCard,
  getAdminUsers,
  createAdminUser,
  type UserLookupResponse,
  type AutomatedDrawResponse,
  type DrawnCard,
  type HighlightCardData,
  type AdminUser
} from '@/api/admin'

// Extended drawn card with iteration info
interface ExtendedDrawnCard extends DrawnCard {
  iteration: number
}

// 表单数据
const formData = reactive({
  email: '',
  collection_id: '',
  pack_id: '',
  draw_count: 5
})

// 批量次数
const batchIterations = ref(1)

// 加载状态
const lookupLoading = ref(false)
const collectionsLoading = ref(false)
const packsLoading = ref(false)
const drawLoading = ref(false)
const highlightLoading = ref(false)
const highlightsLoading = ref(false)
const adminUsersLoading = ref(false)
const createUserLoading = ref(false)

// 对话框状态
const showCreateUserDialog = ref(false)
const newUserForm = reactive({
  email: '',
  display_name: '',
  initial_points: 10000,
  avatar: '' as string
})
const avatarPreview = computed(() => {
  if (newUserForm.avatar) return newUserForm.avatar
  const name = newUserForm.display_name || 'User'
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128&length=1`
})

// 数据
const userInfo = ref<UserLookupResponse | null>(null)
const collections = ref<PackCollection[]>([])
const packs = ref<PackDetail[]>([])
const adminUsers = ref<AdminUser[]>([])
const allDrawnCards = ref<ExtendedDrawnCard[]>([])
const highlightedCards = ref<Set<string>>(new Set())
const userHighlights = ref<HighlightCardData[]>([])
const totalSpent = ref(0)
const totalToppedUp = ref(0)
const highRarityCount = ref(0)
const weeklySpentInfo = ref<{
  weekId: string
  previousSpent: number
  newSpent: number
}>({
  weekId: '',
  previousSpent: 0,
  newSpent: 0
})

// 计算是否可以抽卡
const canDraw = computed(() => {
  return userInfo.value?.found && formData.collection_id && formData.pack_id
})

// 加载管理员创建的用户列表
const loadAdminUsers = async () => {
  adminUsersLoading.value = true
  try {
    const result = await getAdminUsers()
    adminUsers.value = result.users || []
  } catch (error: any) {
    console.error('加载用户列表失败:', error)
  } finally {
    adminUsersLoading.value = false
  }
}

// 加载用户 Highlights
const loadUserHighlights = async () => {
  if (!formData.email) return
  
  highlightsLoading.value = true
  try {
    const result = await getUserHighlights(formData.email)
    userHighlights.value = result.highlights || []
    // Update highlightedCards set
    highlightedCards.value = new Set(result.highlights.map(h => h.id))
  } catch (error: any) {
    console.error('加载 Highlights 失败:', error)
  } finally {
    highlightsLoading.value = false
  }
}

// 处理邮箱选择/输入变化
const handleEmailChange = async (email: string) => {
  if (!email) {
    userInfo.value = null
    return
  }
  await handleLookupUser()
}

// 查找用户
const handleLookupUser = async () => {
  if (!formData.email) return
  
  lookupLoading.value = true
  try {
    const result = await lookupUserByEmail(formData.email)
    userInfo.value = result
    if (!result.found) {
      // 未找到用户，准备创建用户表单
      newUserForm.email = formData.email
      newUserForm.display_name = formData.email.split('@')[0]
      newUserForm.avatar = ''
      userHighlights.value = []
      highlightedCards.value = new Set()
    } else {
      ElMessage.success(`找到用户: ${result.display_name}`)
      // Load user highlights
      await loadUserHighlights()
    }
  } catch (error: any) {
    console.error('查找用户失败:', error)
    ElMessage.error(error.response?.data?.detail || '查找用户失败')
    userInfo.value = null
  } finally {
    lookupLoading.value = false
  }
}

// 处理头像上传
const handleAvatarUpload = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    newUserForm.avatar = e.target?.result as string
  }
  reader.readAsDataURL(file)
  return false // 阻止自动上传
}

// 重置头像为默认
const resetAvatar = () => {
  newUserForm.avatar = ''
}

// 创建用户
const handleCreateUser = async () => {
  if (!newUserForm.email || !newUserForm.display_name) {
    ElMessage.warning('请填写完整信息')
    return
  }
  
  createUserLoading.value = true
  try {
    await createAdminUser({
      email: newUserForm.email,
      display_name: newUserForm.display_name,
      initial_points: newUserForm.initial_points,
      avatar: newUserForm.avatar || undefined
    })
    
    ElMessage.success(`用户 ${newUserForm.email} 创建成功`)
    showCreateUserDialog.value = false
    
    // 刷新用户列表和当前用户信息
    await loadAdminUsers()
    await handleLookupUser()
  } catch (error: any) {
    console.error('创建用户失败:', error)
    ElMessage.error(error.response?.data?.detail || '创建用户失败')
  } finally {
    createUserLoading.value = false
  }
}

// 加载卡包集合
const loadCollections = async () => {
  collectionsLoading.value = true
  try {
    collections.value = await getPackCollections()
  } catch (error) {
    console.error('加载卡包集合失败:', error)
    ElMessage.error('加载卡包集合失败')
  } finally {
    collectionsLoading.value = false
  }
}

// 处理集合变化
const handleCollectionChange = async () => {
  formData.pack_id = ''
  packs.value = []
  
  if (!formData.collection_id) return
  
  packsLoading.value = true
  try {
    const result = await getPackList(formData.collection_id, {
      page: 1,
      per_page: 100
    })
    packs.value = result.packs as any
  } catch (error) {
    console.error('加载卡包列表失败:', error)
    ElMessage.error('加载卡包列表失败')
  } finally {
    packsLoading.value = false
  }
}

// 批量抽卡 (with auto top-up)
const handleBatchDraw = async () => {
  if (!canDraw.value) {
    ElMessage.warning('请先完成配置')
    return
  }
  
  drawLoading.value = true
  // Reset draw results (keep highlightedCards from existing highlights)
  allDrawnCards.value = []
  totalSpent.value = 0
  totalToppedUp.value = 0
  highRarityCount.value = 0
  weeklySpentInfo.value = { weekId: '', previousSpent: 0, newSpent: 0 }
  
  try {
    let initialWeeklySpent: number | null = null
    let lastWeeklySpent = 0
    let weekId = ''
    
    // Execute multiple draws sequentially
    for (let i = 0; i < batchIterations.value; i++) {
      const result = await automatedDraw({
        email: formData.email,
        collection_id: formData.collection_id,
        pack_id: formData.pack_id,
        draw_count: formData.draw_count
      })
      
      // Track weekly spent from first draw
      if (i === 0 && result.weekly_spent_updated) {
        weekId = result.weekly_spent_updated.week_id || ''
        initialWeeklySpent = result.weekly_spent_updated.previous_spent || 0
      }
      
      // Track latest weekly spent
      if (result.weekly_spent_updated) {
        lastWeeklySpent = result.weekly_spent_updated.new_spent || 0
      }
      
      // Add iteration info to each card
      const cardsWithIteration = (result.drawn_cards || []).map(card => ({
        ...card,
        iteration: i + 1
      }))
      
      allDrawnCards.value.push(...cardsWithIteration)
      totalSpent.value += result.total_simulated_spent || 0
      totalToppedUp.value += result.automation_summary?.points_auto_topped_up || 0
      highRarityCount.value += result.high_rarity_cards_count || 0
    }
    
    // Update weekly spent info
    if (weekId && initialWeeklySpent !== null) {
      weeklySpentInfo.value = {
        weekId,
        previousSpent: initialWeeklySpent,
        newSpent: lastWeeklySpent
      }
    }
    
    ElMessage.success(`抽卡完成！共抽取 ${allDrawnCards.value.length} 张卡牌`)
    
    // 刷新用户信息
    await handleLookupUser()
  } catch (error: any) {
    console.error('抽卡失败:', error)
    ElMessage.error(error.response?.data?.detail || '抽卡失败')
  } finally {
    drawLoading.value = false
  }
}

// 点击卡牌添加到 Highlights
const handleAddHighlight = async (card: ExtendedDrawnCard) => {
  if (highlightedCards.value.has(card.id)) {
    ElMessage.info('该卡牌已添加到 Highlights')
    return
  }
  
  try {
    await ElMessageBox.confirm(
      `确定要将「${card.card_name}」添加到用户 Highlights 吗？`,
      '添加到 Highlights',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'info'
      }
    )
    
    highlightLoading.value = true
    
    const result = await highlightCard({
      email: formData.email,
      card_collection_id: card.collection_id,
      card_id: card.id,
      card_data: {
        card_name: card.card_name,
        image_url: card.image_url,
        point_worth: card.point_worth,
        rarity: card.rarity,
        color: card.color
      }
    })
    
    if (result.success) {
      highlightedCards.value.add(card.id)
      // Reload highlights to update the display
      await loadUserHighlights()
      if (result.action === 'already_exists') {
        ElMessage.warning('该卡牌已在 Highlights 中')
      } else {
        ElMessage.success(`已将「${card.card_name}」添加到 Highlights`)
      }
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('添加 Highlight 失败:', error)
      ElMessage.error(error.response?.data?.detail || '添加失败')
    }
  } finally {
    highlightLoading.value = false
  }
}

// 从 Highlights 移除卡牌
const handleRemoveHighlight = async (card: HighlightCardData) => {
  try {
    await ElMessageBox.confirm(
      `确定要将「${card.card_name}」从 Highlights 移除吗？`,
      '移除 Highlight',
      {
        confirmButtonText: '移除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    highlightLoading.value = true
    
    const result = await removeHighlightCard(formData.email, card.id)
    
    if (result.success) {
      highlightedCards.value.delete(card.id)
      // Reload highlights to update the display
      await loadUserHighlights()
      ElMessage.success(`已将「${card.card_name}」从 Highlights 移除`)
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('移除 Highlight 失败:', error)
      ElMessage.error(error.response?.data?.detail || '移除失败')
    }
  } finally {
    highlightLoading.value = false
  }
}

// 重置
const handleReset = () => {
  formData.email = ''
  formData.collection_id = ''
  formData.pack_id = ''
  formData.draw_count = 5
  batchIterations.value = 1
  userInfo.value = null
  packs.value = []
  allDrawnCards.value = []
  highlightedCards.value = new Set()
  userHighlights.value = []
  totalSpent.value = 0
  totalToppedUp.value = 0
  highRarityCount.value = 0
  weeklySpentInfo.value = { weekId: '', previousSpent: 0, newSpent: 0 }
}

// 获取卡牌颜色类名
const getCardColorClass = (color: string) => {
  const colorMap: Record<string, string> = {
    red: 'card-red',
    orange: 'card-orange',
    purple: 'card-purple',
    blue: 'card-blue',
    green: 'card-green',
    white: 'card-white'
  }
  return colorMap[color?.toLowerCase()] || 'card-white'
}

// 获取颜色标签类型
const getColorTagType = (color: string) => {
  const typeMap: Record<string, string> = {
    red: 'danger',
    orange: 'warning',
    purple: 'primary',
    blue: 'primary',
    green: 'success',
    white: 'info'
  }
  return typeMap[color?.toLowerCase()] || 'info'
}

// 组件挂载
onMounted(() => {
  loadCollections()
  loadAdminUsers()
})
</script>

<style scoped lang="scss">
.simulate-draw-container {
  padding: 20px;

  .main-card {
    margin-bottom: 20px;
  }

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .config-form {
    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;

      .user-name {
        font-weight: 500;
      }
    }

    .no-user {
      color: #909399;
    }

    .no-user-actions {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .avatar-upload-section {
      display: flex;
      align-items: center;
      gap: 16px;

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

    .batch-hint {
      margin-left: 10px;
      color: #909399;
      font-size: 12px;
    }
  }

  .info-alert {
    margin-top: 20px;

    ul {
      margin: 0;
      padding-left: 20px;

      li {
        line-height: 1.8;
      }
    }
  }

  .result-card {
    margin-bottom: 20px;

    .stats-row {
      margin-bottom: 20px;
    }

    .automation-summary {
      margin: 20px 0;
    }

    .weekly-spent-info {
      margin: 16px 0;
    }

    .cards-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
      gap: 16px;
      margin-top: 20px;

      .card-item {
        border-radius: 8px;
        overflow: hidden;
        position: relative;
        background: #fff;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        transition: transform 0.2s;

        &:hover {
          transform: translateY(-4px);
        }

        &.card-red {
          border: 3px solid #f56c6c;
        }

        &.card-orange {
          border: 3px solid #e6a23c;
        }

        &.card-purple {
          border: 3px solid #9b59b6;
        }

        &.card-blue {
          border: 3px solid #409eff;
        }

        &.card-green {
          border: 3px solid #67c23a;
        }

        &.card-white {
          border: 3px solid #dcdfe6;
        }

        .card-image {
          width: 100%;
          height: 200px;
        }

        .image-placeholder {
          width: 100%;
          height: 200px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f5f7fa;
          color: #909399;
          font-size: 32px;
        }

        .card-info {
          padding: 12px;

          .card-name {
            font-weight: 500;
            font-size: 14px;
            margin-bottom: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .card-details {
            display: flex;
            justify-content: space-between;
            align-items: center;

            .point-worth {
              font-weight: 600;
              color: #67c23a;
            }
          }
        }

        .card-badge {
          position: absolute;
          top: 8px;
          right: 8px;
          background: rgba(0, 0, 0, 0.6);
          color: #fff;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 12px;
        }

        .highlight-badge {
          position: absolute;
          top: 8px;
          left: 8px;
          background: #e6a23c;
          color: #fff;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
        }

        &.clickable {
          cursor: pointer;
        }

        &.highlighted {
          box-shadow: 0 0 0 3px #e6a23c, 0 4px 12px rgba(230, 162, 60, 0.4);
        }

        .remove-hint {
          position: absolute;
          bottom: 0;
          left: 0;
          right: 0;
          background: rgba(245, 108, 108, 0.9);
          color: #fff;
          text-align: center;
          padding: 4px;
          font-size: 12px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        &:hover .remove-hint {
          opacity: 1;
        }
      }
    }

    .empty-highlights {
      padding: 20px 0;
    }
  }

  .highlights-card {
    .cards-grid {
      margin-top: 0;
    }
  }
}
</style>
