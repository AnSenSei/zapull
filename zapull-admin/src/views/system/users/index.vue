<template>
  <div class="users-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>用户列表</span>
        </div>
      </template>

      <!-- 搜索表单 -->
      <div class="search-form">
        <el-form :model="searchForm" inline>
          <el-form-item label="排序字段">
            <el-select v-model="searchForm.sort_by" placeholder="请选择排序字段" style="width: 180px">
              <el-option label="积分余额" value="pointsBalance" />
              <el-option label="充值总额" value="totalCashRecharged" />
              <el-option label="消费总额" value="totalPointsSpent" />
              <el-option label="推荐积分" value="total_point_refered" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序方式">
            <el-select v-model="searchForm.sort_order" placeholder="请选择排序方式" style="width: 120px">
              <el-option label="升序" value="asc" />
              <el-option label="降序" value="desc" />
            </el-select>
          </el-form-item>
          <el-form-item label="搜索">
            <el-input
              v-model="searchForm.search_query"
              placeholder="请输入搜索关键词"
              style="width: 200px"
              clearable
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch">搜索</el-button>
            <el-button @click="handleReset">重置</el-button>
          </el-form-item>
        </el-form>
      </div>

      <!-- 用户表格 -->
      <el-table :data="tableData" style="width: 100%" v-loading="loading">
        <el-table-column prop="id" label="用户ID" width="200" show-overflow-tooltip />
        <el-table-column prop="displayName" label="显示名称" width="150" />
        <el-table-column prop="email" label="邮箱" width="200" show-overflow-tooltip />
        <el-table-column prop="level" label="等级" width="80" />
        <el-table-column prop="pointsBalance" label="积分余额" width="120">
          <template #default="{ row }">
            <el-tag type="success">{{ row.pointsBalance }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalCashRecharged" label="充值总额" width="120">
          <template #default="{ row }">
            <span>${{ row.totalCashRecharged }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="totalPointsSpent" label="消费总额" width="120" />
        <el-table-column prop="totalFusion" label="合成次数" width="100" />
        <el-table-column prop="total_point_refered" label="推荐积分" width="100">
          <template #default="{ row }">
            <el-tag type="warning">{{ row.total_point_refered || 0 }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="totalAchievements" label="成就数量" width="100" />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="380" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleViewDetail(row)">查看详情</el-button>
            <el-button type="info" size="small" @click="handleViewCards(row)">查看卡片</el-button>
            <el-button type="success" size="small" @click="handleAwardAchievement(row)">颁发成就</el-button>
            <el-button type="warning" size="small" @click="handleAddPoints(row)">添加积分</el-button>
          </template>
        </el-table-column>
      </el-table>

      <!-- 分页 -->
      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :total="total"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>

    <!-- 用户详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="用户详情"
      width="600px"
      :destroy-on-close="true"
    >
      <div v-if="selectedUser" v-loading="detailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="用户ID">{{ selectedUser.id }}</el-descriptions-item>
          <el-descriptions-item label="显示名称">{{ selectedUser.displayName }}</el-descriptions-item>
          <el-descriptions-item label="邮箱">{{ selectedUser.email }}</el-descriptions-item>
          <el-descriptions-item label="等级">{{ selectedUser.level }}</el-descriptions-item>
          <el-descriptions-item label="积分余额">
            <el-tag type="success">{{ selectedUser.pointsBalance }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="充值总额">${{ selectedUser.totalCashRecharged }}</el-descriptions-item>
          <el-descriptions-item label="消费总额">{{ selectedUser.totalPointsSpent }}</el-descriptions-item>
          <el-descriptions-item label="合成次数">{{ selectedUser.totalFusion }}</el-descriptions-item>
          <el-descriptions-item label="推荐人">{{ selectedUser.referred_by || '无' }}</el-descriptions-item>
          <el-descriptions-item label="推荐积分">{{ selectedUser.total_point_refered }}</el-descriptions-item>
          <el-descriptions-item label="成就数量">{{ selectedUser.totalAchievements }}</el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ formatDate(selectedUser.createdAt) }}</el-descriptions-item>
        </el-descriptions>
        
        <div v-if="selectedUser.avatar" class="avatar-section">
          <h4>头像</h4>
          <el-image :src="selectedUser.avatar" style="width: 100px; height: 100px" fit="cover" />
        </div>
      </div>
    </el-dialog>

    <!-- 颁发成就对话框 -->
    <el-dialog
      v-model="awardDialogVisible"
      title="颁发成就"
      width="500px"
      :destroy-on-close="true"
    >
      <div v-if="awardFormData.selectedUser" v-loading="awardLoading">
        <el-form :model="awardFormData" label-width="80px">
          <el-form-item label="用户">
            <el-input v-model="awardFormData.selectedUser.displayName" disabled />
          </el-form-item>
          <el-form-item label="成就" required>
            <el-select
              v-model="awardFormData.achievement_id"
              placeholder="请选择成就"
              style="width: 100%"
              filterable
              :loading="achievementsLoading"
            >
              <el-option
                v-for="achievement in achievementsList"
                :key="achievement.id"
                :label="`${achievement.name} - ${achievement.description}`"
                :value="achievement.id"
              >
                <div>
                  <div style="font-weight: bold;">{{ achievement.name }}</div>
                  <div style="font-size: 12px; color: #666;">{{ achievement.description }}</div>
                </div>
              </el-option>
            </el-select>
          </el-form-item>
          <el-form-item label="备注">
            <el-input
              v-model="awardFormData.notes"
              type="textarea"
              :rows="3"
              placeholder="可选的备注信息"
            />
          </el-form-item>
        </el-form>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="cancelAwardAchievement">取消</el-button>
          <el-button
            type="primary"
            @click="confirmAwardAchievement"
            :loading="awardLoading"
            :disabled="!awardFormData.achievement_id"
          >
            颁发成就
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 添加积分对话框 -->
    <el-dialog
      v-model="addPointsDialogVisible"
      title="添加积分"
      width="500px"
      :destroy-on-close="true"
    >
      <div v-if="addPointsFormData.selectedUser" v-loading="addPointsLoading">
        <el-form :model="addPointsFormData" label-width="80px" ref="addPointsForm">
          <el-form-item label="用户">
            <el-input v-model="addPointsFormData.selectedUser.displayName" disabled />
          </el-form-item>
          <el-form-item
            label="积分数量"
            required
            prop="points"
            :rules="[
              { required: true, message: '请输入积分数量', trigger: 'blur' },
              { type: 'number', min: 1, message: '积分数量必须大于0', trigger: 'blur' }
            ]"
          >
            <el-input-number
              v-model="addPointsFormData.points"
              :min="1"
              :max="999999"
              placeholder="请输入要添加的积分数量"
              style="width: 100%"
            />
          </el-form-item>
          <el-form-item label="添加原因">
            <el-input
              v-model="addPointsFormData.reason"
              type="textarea"
              :rows="3"
              placeholder="可选的添加积分原因说明"
            />
          </el-form-item>
        </el-form>
      </div>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="cancelAddPoints">取消</el-button>
          <el-button
            type="primary"
            @click="confirmAddPoints"
            :loading="addPointsLoading"
            :disabled="!addPointsFormData.points || addPointsFormData.points <= 0"
          >
            添加积分
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看卡片对话框 -->
    <el-dialog
      v-model="cardsDialogVisible"
      :title="`用户卡片 - ${cardsFormData.selectedUser?.displayName}`"
      width="80%"
      :destroy-on-close="true"
    >
      <div v-if="cardsFormData.selectedUser" v-loading="cardsLoading">
        <!-- 搜索和筛选 -->
        <div class="cards-filter">
          <el-form inline>
            <el-form-item label="集合">
              <el-select v-model="cardsFormData.collection_id" placeholder="全部集合" clearable @change="handleCardsFilter">
                <el-option 
                  v-for="collection in availableCollections" 
                  :key="collection" 
                  :label="collection" 
                  :value="collection" 
                />
              </el-select>
            </el-form-item>
            <el-form-item label="搜索">
              <el-input 
                v-model="cardsFormData.search_query" 
                placeholder="输入卡片名称" 
                clearable 
                @clear="handleCardsFilter"
                @keyup.enter="handleCardsFilter"
              />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handleCardsFilter">搜索</el-button>
            </el-form-item>
          </el-form>
        </div>

        <!-- 统计信息 -->
        <div class="cards-stats" v-if="cardsData.collections">
          <el-row :gutter="16">
            <el-col :span="6" v-for="(stats, collection) in cardsData.collections" :key="collection">
              <el-statistic 
                :title="collection" 
                :value="stats.count" 
                suffix="张"
              >
                <template #suffix>
                  <span>张 (价值: {{ stats.total_value }})</span>
                </template>
              </el-statistic>
            </el-col>
          </el-row>
        </div>

        <!-- 卡片表格 -->
        <el-table :data="cardsData.cards" style="width: 100%; margin-top: 20px;">
          <el-table-column label="卡片图片" width="120">
            <template #default="{ row }">
              <el-image 
                v-if="row.image_url"
                :src="row.image_url" 
                style="width: 80px; height: 80px" 
                fit="cover"
                :preview-src-list="[row.image_url]"
              />
              <span v-else>无图片</span>
            </template>
          </el-table-column>
          <el-table-column prop="card_name" label="卡片名称" width="200" show-overflow-tooltip />
          <el-table-column prop="collection_name" label="集合" width="120" />
          <el-table-column prop="quantity" label="数量" width="80">
            <template #default="{ row }">
              <el-tag type="info">{{ row.quantity }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="rarity" label="稀有度" width="80">
            <template #default="{ row }">
              <el-tag :type="getRarityType(row.rarity)">{{ row.rarity }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="point_worth" label="点数价值" width="100">
            <template #default="{ row }">
              <el-tag type="success">{{ row.point_worth }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="date_got" label="获得时间" width="180">
            <template #default="{ row }">
              {{ row.date_got ? formatDate(row.date_got) : '-' }}
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="cards-pagination">
          <el-pagination
            v-model:current-page="cardsCurrentPage"
            v-model:page-size="cardsPageSize"
            :total="cardsData.pagination?.total_items || 0"
            :page-sizes="[10, 20, 50, 100]"
            layout="total, sizes, prev, pager, next"
            @size-change="handleCardsSizeChange"
            @current-change="handleCardsCurrentChange"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserList, getUserDetail, awardAchievementToUser, getUserAchievements, addPointsToUser, getUserCards, type User, type GetUserListParams, type AwardAchievementParams, type UserAchievement, type AddPointsRequest, type AddPointsResponse, type GetUserCardsParams, type UserCardsResponse } from '@/api/users'
import { getAchievementList, type Achievement } from '@/api/achievements'

// 响应式数据
const tableData = ref<User[]>([])
const loading = ref(false)
const detailLoading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const detailDialogVisible = ref(false)
const selectedUser = ref<User | null>(null)
const userAchievements = ref<UserAchievement[]>([])
const userAchievementsLoading = ref(false)

// 颁发成就相关数据
const awardDialogVisible = ref(false)
const awardLoading = ref(false)
const achievementsList = ref<Achievement[]>([])
const achievementsLoading = ref(false)
const awardFormData = reactive<AwardAchievementParams & { selectedUser?: User }>({
  achievement_id: '',
  notes: '',
  selectedUser: null
})

// 添加积分相关数据
const addPointsDialogVisible = ref(false)
const addPointsLoading = ref(false)
const addPointsFormData = reactive<AddPointsRequest & { selectedUser?: User }>({
  points: 0,
  reason: '',
  selectedUser: null
})

// 查看卡片相关数据
const cardsDialogVisible = ref(false)
const cardsLoading = ref(false)
const cardsCurrentPage = ref(1)
const cardsPageSize = ref(20)
const availableCollections = ref<string[]>([])
const cardsData = reactive<Partial<UserCardsResponse>>({ cards: [], pagination: undefined, collections: {} })
const cardsFormData = reactive<GetUserCardsParams & { selectedUser?: User | null }>({
  page: 1,
  per_page: 20,
  sort_by: 'date_got',
  sort_order: 'desc',
  search_query: '',
  collection_id: undefined,
  selectedUser: null
})

// 搜索表单
const searchForm = reactive<GetUserListParams>({
  page: 1,
  per_page: 10,
  sort_by: 'pointsBalance',
  sort_order: 'desc',
  search_query: ''
})

// 格式化日期
const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

// 获取用户列表
const fetchUserList = async () => {
  loading.value = true
  try {
    const params = {
      ...searchForm,
      page: currentPage.value,
      per_page: pageSize.value
    }
    const response = await getUserList(params)
    tableData.value = response.users
    total.value = response.pagination.total_items
  } catch (error) {
    console.error('获取用户列表失败:', error)
    ElMessage.error('获取用户列表失败')
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchUserList()
}

// 重置搜索
const handleReset = () => {
  searchForm.sort_by = 'pointsBalance'
  searchForm.sort_order = 'desc'
  searchForm.search_query = ''
  currentPage.value = 1
  fetchUserList()
}

// 分页大小变化
const handleSizeChange = (size: number) => {
  pageSize.value = size
  currentPage.value = 1
  fetchUserList()
}

// 当前页变化
const handleCurrentChange = (page: number) => {
  currentPage.value = page
  fetchUserList()
}

// 查看用户详情
const handleViewDetail = async (user: User) => {
  selectedUser.value = user
  detailDialogVisible.value = true
  
  // 获取完整的用户详情
  detailLoading.value = true
  try {
    const userDetail = await getUserDetail(user.id)
    selectedUser.value = userDetail
  } catch (error) {
    console.error('获取用户详情失败:', error)
    ElMessage.error('获取用户详情失败')
  } finally {
    detailLoading.value = false
  }
}

// 获取成就列表
const fetchAchievementsList = async () => {
  achievementsLoading.value = true
  try {
    const response = await getAchievementList({ page: 1, size: 100 }) // Get first 100 achievements
    achievementsList.value = response.items
  } catch (error) {
    console.error('获取成就列表失败:', error)
    ElMessage.error('获取成就列表失败')
  } finally {
    achievementsLoading.value = false
  }
}

// 颁发成就
const handleAwardAchievement = async (user: User) => {
  awardFormData.selectedUser = user
  awardFormData.achievement_id = ''
  awardFormData.notes = ''
  awardDialogVisible.value = true
  
  // 获取成就列表
  if (achievementsList.value.length === 0) {
    await fetchAchievementsList()
  }
}

// 确认颁发成就
const confirmAwardAchievement = async () => {
  if (!awardFormData.selectedUser || !awardFormData.achievement_id) {
    ElMessage.error('请选择成就')
    return
  }
  
  awardLoading.value = true
  try {
    const params: AwardAchievementParams = {
      achievement_id: awardFormData.achievement_id,
      notes: awardFormData.notes || undefined
    }
    
    const response = await awardAchievementToUser(awardFormData.selectedUser.id, params)
    
    if (response.success) {
      ElMessage.success(response.message)
      awardDialogVisible.value = false
      // 刷新用户列表以更新成就数量
      await fetchUserList()
    } else {
      ElMessage.error('颁发成就失败')
    }
  } catch (error: any) {
    console.error('颁发成就失败:', error)
    if (error.response?.data?.detail) {
      ElMessage.error(error.response.data.detail)
    } else {
      ElMessage.error('颁发成就失败')
    }
  } finally {
    awardLoading.value = false
  }
}

// 取消颁发成就
const cancelAwardAchievement = () => {
  awardDialogVisible.value = false
  awardFormData.achievement_id = ''
  awardFormData.notes = ''
  awardFormData.selectedUser = null
}

// 添加积分
const handleAddPoints = async (user: User) => {
  addPointsFormData.selectedUser = user
  addPointsFormData.points = 0
  addPointsFormData.reason = ''
  addPointsDialogVisible.value = true
}

// 确认添加积分
const confirmAddPoints = async () => {
  if (!addPointsFormData.selectedUser || !addPointsFormData.points || addPointsFormData.points <= 0) {
    ElMessage.error('请输入有效的积分数量')
    return
  }
  
  addPointsLoading.value = true
  try {
    const params: AddPointsRequest = {
      points: addPointsFormData.points,
      reason: addPointsFormData.reason || undefined
    }
    
    const response = await addPointsToUser(addPointsFormData.selectedUser.id, params)
    
    if (response.success) {
      ElMessage.success(`成功为用户添加了 ${response.points_added} 积分，新余额: ${response.new_balance}`)
      addPointsDialogVisible.value = false
      // 刷新用户列表以更新积分余额
      await fetchUserList()
    } else {
      ElMessage.error('添加积分失败')
    }
  } catch (error: any) {
    console.error('添加积分失败:', error)
    if (error.response?.data?.detail) {
      ElMessage.error(error.response.data.detail)
    } else {
      ElMessage.error('添加积分失败')
    }
  } finally {
    addPointsLoading.value = false
  }
}

// 取消添加积分
const cancelAddPoints = () => {
  addPointsDialogVisible.value = false
  addPointsFormData.points = 0
  addPointsFormData.reason = ''
  addPointsFormData.selectedUser = null
}

// 查看用户卡片
const handleViewCards = async (user: User) => {
  cardsFormData.selectedUser = user
  cardsFormData.page = 1
  cardsFormData.per_page = 20
  cardsFormData.search_query = ''
  cardsFormData.collection_id = undefined
  cardsCurrentPage.value = 1
  cardsPageSize.value = 20
  cardsDialogVisible.value = true
  
  await fetchUserCards()
}

// 获取用户卡片列表
const fetchUserCards = async () => {
  if (!cardsFormData.selectedUser) return
  
  cardsLoading.value = true
  try {
    const params: GetUserCardsParams = {
      page: cardsCurrentPage.value,
      per_page: cardsPageSize.value,
      sort_by: cardsFormData.sort_by,
      sort_order: cardsFormData.sort_order,
      search_query: cardsFormData.search_query || undefined,
      collection_id: cardsFormData.collection_id || undefined
    }
    
    const response = await getUserCards(cardsFormData.selectedUser.id, params)
    
    // 更新数据
    cardsData.cards = response.cards
    cardsData.pagination = response.pagination
    cardsData.collections = response.collections
    availableCollections.value = response.available_collections || []
    
  } catch (error: any) {
    console.error('获取用户卡片失败:', error)
    ElMessage.error('获取用户卡片失败')
  } finally {
    cardsLoading.value = false
  }
}

// 卡片筛选
const handleCardsFilter = () => {
  cardsCurrentPage.value = 1
  fetchUserCards()
}

// 卡片分页大小变化
const handleCardsSizeChange = (size: number) => {
  cardsPageSize.value = size
  cardsCurrentPage.value = 1
  cardsFormData.per_page = size
  fetchUserCards()
}

// 卡片当前页变化
const handleCardsCurrentChange = (page: number) => {
  cardsCurrentPage.value = page
  cardsFormData.page = page
  fetchUserCards()
}

// 获取稀有度类型
const getRarityType = (rarity: number) => {
  if (rarity >= 5) return 'danger'  // 红色 - 传说
  if (rarity >= 4) return 'warning' // 橙色 - 稀有
  if (rarity >= 3) return 'success' // 绿色 - 不常见
  return 'info'  // 蓝色 - 普通
}

// 组件挂载时获取数据
onMounted(() => {
  fetchUserList()
})
</script>

<style scoped lang="scss">
.users-container {
  padding: 20px;

  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .search-form {
    margin-bottom: 20px;
    padding: 20px;
    background-color: #f5f7fa;
    border-radius: 4px;
  }

  .pagination-container {
    margin-top: 20px;
    display: flex;
    justify-content: center;
  }

  .avatar-section {
    margin-top: 20px;
    padding-top: 20px;
    border-top: 1px solid #ebeef5;

    h4 {
      margin-bottom: 10px;
      color: #303133;
    }
  }

  .cards-filter {
    margin-bottom: 20px;
    padding: 20px;
    background-color: #f5f7fa;
    border-radius: 4px;
  }

  .cards-stats {
    margin-bottom: 20px;
    padding: 20px;
    background-color: #fafbfc;
    border-radius: 4px;
  }

  .cards-pagination {
    margin-top: 20px;
    display: flex;
    justify-content: center;
  }
}
</style>