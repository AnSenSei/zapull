<template>
  <div class="simulate-draw-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>模拟抽卡</span>
          <el-tag type="warning">此操作会更新用户的weekly_spent和top_hits</el-tag>
        </div>
      </template>

      <!-- 模拟抽卡表单 -->
      <el-form :model="form" :rules="rules" ref="formRef" label-width="120px" style="max-width: 600px;">
        <el-form-item label="用户邮箱" prop="email">
          <el-select
            v-model="form.email"
            placeholder="搜索或选择用户邮箱"
            filterable
            remote
            :remote-method="searchUsers"
            :loading="usersLoading"
            style="width: 100%"
            @change="handleEmailChange"
          >
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="`${user.email} (${user.displayName})`"
              :value="user.email"
            />
          </el-select>
        </el-form-item>

        <!-- 用户信息显示 -->
        <el-form-item label="用户信息" v-if="userInfo">
          <el-descriptions :column="2" border size="small">
            <el-descriptions-item label="用户ID">{{ userInfo.user_id }}</el-descriptions-item>
            <el-descriptions-item label="昵称">{{ userInfo.display_name }}</el-descriptions-item>
            <el-descriptions-item label="邮箱">{{ userInfo.email }}</el-descriptions-item>
            <el-descriptions-item label="积分余额">
              <el-tag type="success">{{ userInfo.points_balance }}</el-tag>
            </el-descriptions-item>
          </el-descriptions>
        </el-form-item>

        <el-form-item label="卡包分类" prop="collection_id">
          <el-select 
            v-model="form.collection_id" 
            placeholder="选择卡包分类" 
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

        <el-form-item label="卡包" prop="pack_id">
          <el-select 
            v-model="form.pack_id" 
            placeholder="选择卡包" 
            style="width: 100%"
            :loading="packsLoading"
            filterable
          >
            <el-option
              v-for="pack in packs"
              :key="pack.id"
              :label="`${pack.name} (价格: ${pack.price})`"
              :value="pack.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="抽卡数量" prop="count">
          <el-radio-group v-model="form.count">
            <el-radio-button :label="1">1张</el-radio-button>
            <el-radio-button :label="3">3张</el-radio-button>
            <el-radio-button :label="5">5张</el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="添加到背包">
          <el-switch v-model="form.add_to_collection" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px;">
            开启后卡片会添加到用户的卡片收藏中
          </span>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handleSimulateDraw" :loading="simulateLoading" :disabled="!userInfo">
            执行模拟抽卡
          </el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 抽卡结果 -->
    <el-card v-if="drawResult" style="margin-top: 20px;">
      <template #header>
        <div class="card-header">
          <span>抽卡结果</span>
          <div>
            <el-tag type="success" style="margin-right: 10px;">
              Weekly Spent +{{ drawResult.total_simulated_spent }}
            </el-tag>
            <el-tag v-if="drawResult.top_hits_added > 0" type="warning">
              Top Hits +{{ drawResult.top_hits_added }}
            </el-tag>
          </div>
        </div>
      </template>

      <!-- 结果概要 -->
      <el-descriptions :column="3" border style="margin-bottom: 20px;">
        <el-descriptions-item label="用户">{{ drawResult.user.display_name }}</el-descriptions-item>
        <el-descriptions-item label="卡包价格">{{ drawResult.pack.price }}</el-descriptions-item>
        <el-descriptions-item label="抽卡数量">{{ drawResult.draw_count }}</el-descriptions-item>
        <el-descriptions-item label="模拟消费总额">
          <el-tag type="success">{{ drawResult.total_simulated_spent }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="高稀有度卡片">
          <el-tag type="warning">{{ drawResult.high_rarity_cards_count }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="添加到Top Hits">
          <el-tag :type="drawResult.top_hits_added > 0 ? 'success' : 'info'">
            {{ drawResult.top_hits_added }}
          </el-tag>
        </el-descriptions-item>
      </el-descriptions>

      <!-- Weekly Spent 更新详情 -->
      <el-alert 
        v-if="drawResult.weekly_spent_updated.success"
        :title="`Weekly Spent 更新成功 (${drawResult.weekly_spent_updated.week_id})`"
        type="success"
        :description="`操作: ${drawResult.weekly_spent_updated.action}, 新增: ${drawResult.weekly_spent_updated.amount_added}, 当前总额: ${drawResult.weekly_spent_updated.new_spent}`"
        show-icon
        style="margin-bottom: 20px;"
      />

      <!-- 抽到的卡片 -->
      <h4>抽到的卡片</h4>
      <div class="cards-grid">
        <div 
          v-for="card in drawResult.drawn_cards" 
          :key="card.num_draw" 
          class="card-item"
          :class="getCardColorClass(card.color)"
        >
          <el-image 
            :src="card.image_url" 
            fit="contain"
            style="width: 120px; height: 160px;"
            :preview-src-list="[card.image_url]"
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
              <span class="card-points">{{ card.point_worth }} pts</span>
            </div>
          </div>
        </div>
      </div>
    </el-card>

    <!-- 批量抽卡区域 -->
    <el-card style="margin-top: 20px;">
      <template #header>
        <div class="card-header">
          <span>批量模拟抽卡</span>
          <el-tag type="danger">适用于快速生成大量数据</el-tag>
        </div>
      </template>

      <el-form :model="batchForm" label-width="120px" style="max-width: 600px;">
        <el-form-item label="迭代次数">
          <el-input-number v-model="batchForm.iterations" :min="1" :max="100" />
          <span style="margin-left: 10px; color: #909399; font-size: 12px;">
            每次迭代抽5张卡 (最多100次)
          </span>
        </el-form-item>

        <el-form-item>
          <el-button 
            type="danger" 
            @click="handleBatchSimulate" 
            :loading="batchLoading"
            :disabled="!userInfo || !form.collection_id || !form.pack_id"
          >
            执行批量模拟 ({{ batchForm.iterations * 5 }}张卡)
          </el-button>
        </el-form-item>
      </el-form>

      <!-- 批量结果 -->
      <el-alert 
        v-if="batchResult"
        :title="`批量模拟完成`"
        type="success"
        show-icon
        style="margin-top: 20px;"
      >
        <template #default>
          <div>
            <p>完成迭代: {{ batchResult.iterations_completed }}</p>
            <p>总抽卡数: {{ batchResult.total_cards_drawn }}</p>
            <p>模拟消费总额: {{ batchResult.total_simulated_spent }}</p>
            <p>高稀有度卡片: {{ batchResult.total_high_rarity_cards }}</p>
          </div>
        </template>
      </el-alert>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import { 
  lookupUserByEmail, 
  simulateDraw, 
  batchSimulateDraw,
  type UserLookupResponse, 
  type SimulateDrawResponse,
  type BatchSimulateDrawResponse
} from '@/api/admin'
import { getPackCollections, getPackList, type PackCollection, type PackDetail } from '@/api/packs'
import { getUserList, type User } from '@/api/users'

// Form ref
const formRef = ref<FormInstance>()

// Loading states
const lookupLoading = ref(false)
const usersLoading = ref(false)
const collectionsLoading = ref(false)
const packsLoading = ref(false)
const simulateLoading = ref(false)
const batchLoading = ref(false)

// Data
const userInfo = ref<UserLookupResponse | null>(null)
const userOptions = ref<User[]>([])
const collections = ref<PackCollection[]>([])
const packs = ref<PackDetail[]>([])
const drawResult = ref<SimulateDrawResponse | null>(null)
const batchResult = ref<BatchSimulateDrawResponse | null>(null)

// Form data
const form = reactive({
  email: '',
  collection_id: '',
  pack_id: '',
  count: 5,
  add_to_collection: false
})

// Batch form
const batchForm = reactive({
  iterations: 10
})

// Form rules
const rules: FormRules = {
  email: [
    { required: true, message: '请输入用户邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效的邮箱地址', trigger: 'blur' }
  ],
  collection_id: [
    { required: true, message: '请选择卡包分类', trigger: 'change' }
  ],
  pack_id: [
    { required: true, message: '请选择卡包', trigger: 'change' }
  ],
  count: [
    { required: true, message: '请选择抽卡数量', trigger: 'change' }
  ]
}

// Look up user by email
const lookupUser = async () => {
  if (!form.email) {
    ElMessage.warning('请输入用户邮箱')
    return
  }

  lookupLoading.value = true
  try {
    const response = await lookupUserByEmail(form.email)
    if (response.found) {
      userInfo.value = response
      ElMessage.success(`找到用户: ${response.display_name}`)
    } else {
      userInfo.value = null
      ElMessage.warning('未找到该邮箱对应的用户')
    }
  } catch (error: any) {
    console.error('查找用户失败:', error)
    ElMessage.error(error.response?.data?.detail || '查找用户失败')
  } finally {
    lookupLoading.value = false
  }
}

// Handle email selection change
const handleEmailChange = (email: string) => {
  if (email) {
    lookupUser()
  }
}

// Search users for dropdown
const searchUsers = async (query: string) => {
  if (!query && userOptions.value.length > 0) {
    return
  }
  
  usersLoading.value = true
  try {
    const response = await getUserList({
      page: 1,
      per_page: 50,
      search_query: query || undefined
    })
    userOptions.value = response.users
  } catch (error: any) {
    console.error('搜索用户失败:', error)
  } finally {
    usersLoading.value = false
  }
}

// Fetch initial users
const fetchInitialUsers = async () => {
  usersLoading.value = true
  try {
    const response = await getUserList({
      page: 1,
      per_page: 50
    })
    userOptions.value = response.users
  } catch (error: any) {
    console.error('获取用户列表失败:', error)
  } finally {
    usersLoading.value = false
  }
}

// Fetch collections
const fetchCollections = async () => {
  collectionsLoading.value = true
  try {
    const response = await getPackCollections()
    collections.value = response
    // Auto select first collection if available
    if (response.length > 0 && !form.collection_id) {
      form.collection_id = response[0].id.toString()
      await fetchPacks()
    }
  } catch (error: any) {
    console.error('获取分类列表失败:', error)
    ElMessage.error('获取分类列表失败')
  } finally {
    collectionsLoading.value = false
  }
}

// Fetch packs for selected collection
const fetchPacks = async () => {
  if (!form.collection_id) {
    packs.value = []
    return
  }

  packsLoading.value = true
  try {
    const response = await getPackList(form.collection_id, {
      page: 1,
      per_page: 100
    })
    packs.value = response.packs as unknown as PackDetail[]
    form.pack_id = '' // Reset pack selection
  } catch (error: any) {
    console.error('获取卡包列表失败:', error)
    ElMessage.error('获取卡包列表失败')
  } finally {
    packsLoading.value = false
  }
}

const handleCollectionChange = () => {
  fetchPacks()
}

// Simulate draw
const handleSimulateDraw = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (!valid) return

    if (!userInfo.value) {
      ElMessage.warning('请先查找用户')
      return
    }

    try {
      await ElMessageBox.confirm(
        `确定要为用户 ${userInfo.value.display_name} 模拟抽取 ${form.count} 张卡片吗？\n这将更新 weekly_spent 和 top_hits。`,
        '确认模拟抽卡',
        {
          confirmButtonText: '确定',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
    } catch {
      return
    }

    simulateLoading.value = true
    try {
      const response = await simulateDraw({
        email: form.email,
        collection_id: form.collection_id,
        pack_id: form.pack_id,
        count: form.count,
        add_to_collection: form.add_to_collection
      })
      
      drawResult.value = response
      ElMessage.success('模拟抽卡成功！')
      
      // Refresh user info to show updated data
      await lookupUser()
    } catch (error: any) {
      console.error('模拟抽卡失败:', error)
      ElMessage.error(error.response?.data?.detail || '模拟抽卡失败')
    } finally {
      simulateLoading.value = false
    }
  })
}

// Batch simulate
const handleBatchSimulate = async () => {
  if (!userInfo.value || !form.collection_id || !form.pack_id) {
    ElMessage.warning('请先填写完整的表单信息')
    return
  }

  try {
    await ElMessageBox.confirm(
      `确定要为用户 ${userInfo.value.display_name} 执行 ${batchForm.iterations} 次模拟抽卡吗？\n` +
      `这将抽取 ${batchForm.iterations * 5} 张卡片并更新 weekly_spent 和 top_hits。`,
      '确认批量模拟',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
  } catch {
    return
  }

  batchLoading.value = true
  batchResult.value = null
  try {
    const response = await batchSimulateDraw({
      email: form.email,
      collection_id: form.collection_id,
      pack_id: form.pack_id,
      iterations: batchForm.iterations,
      add_to_collection: form.add_to_collection
    })
    
    batchResult.value = response
    ElMessage.success(`批量模拟完成！共抽取 ${response.total_cards_drawn} 张卡片`)
    
    // Refresh user info
    await lookupUser()
  } catch (error: any) {
    console.error('批量模拟失败:', error)
    ElMessage.error(error.response?.data?.detail || '批量模拟失败')
  } finally {
    batchLoading.value = false
  }
}

// Reset form
const resetForm = () => {
  formRef.value?.resetFields()
  userInfo.value = null
  drawResult.value = null
  batchResult.value = null
}

// Get card color class
const getCardColorClass = (color: string) => {
  const colorMap: Record<string, string> = {
    red: 'card-red',
    orange: 'card-orange',
    purple: 'card-purple',
    blue: 'card-blue',
    green: 'card-green',
    white: 'card-white'
  }
  return colorMap[color.toLowerCase()] || 'card-white'
}

// Get tag type for color
const getColorTagType = (color: string) => {
  const colorMap: Record<string, string> = {
    red: 'danger',
    orange: 'warning',
    purple: '',
    blue: 'primary',
    green: 'success',
    white: 'info'
  }
  return colorMap[color.toLowerCase()] || 'info'
}

// Initialize
onMounted(() => {
  fetchCollections()
  fetchInitialUsers()
})
</script>

<style scoped lang="scss">
.simulate-draw-container {
  padding: 20px;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .cards-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 16px;
    margin-top: 16px;

    .card-item {
      background: #fff;
      border-radius: 8px;
      padding: 12px;
      text-align: center;
      border: 2px solid #eee;
      transition: all 0.3s;

      &:hover {
        transform: translateY(-4px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      }

      &.card-red {
        border-color: #f56c6c;
        background: linear-gradient(135deg, #fff 0%, #fef0f0 100%);
      }

      &.card-orange {
        border-color: #e6a23c;
        background: linear-gradient(135deg, #fff 0%, #fdf6ec 100%);
      }

      &.card-purple {
        border-color: #9b59b6;
        background: linear-gradient(135deg, #fff 0%, #f5e6ff 100%);
      }

      &.card-blue {
        border-color: #409eff;
        background: linear-gradient(135deg, #fff 0%, #ecf5ff 100%);
      }

      &.card-green {
        border-color: #67c23a;
        background: linear-gradient(135deg, #fff 0%, #f0f9eb 100%);
      }

      .card-info {
        margin-top: 8px;

        .card-name {
          font-size: 12px;
          font-weight: 600;
          color: #303133;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .card-details {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
          margin-top: 4px;

          .card-points {
            font-size: 11px;
            color: #67c23a;
            font-weight: 500;
          }
        }
      }

      .image-placeholder {
        width: 120px;
        height: 160px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f5f7fa;
        color: #c0c4cc;
        font-size: 40px;
      }
    }
  }
}
</style>
