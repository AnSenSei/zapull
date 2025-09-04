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
              <el-option label="创建时间" value="createdAt" />
              <el-option label="显示名称" value="displayName" />
              <el-option label="等级" value="level" />
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
        <el-table-column prop="totalAchievements" label="成就数量" width="100" />
        <el-table-column prop="createdAt" label="创建时间" width="180">
          <template #default="{ row }">
            {{ formatDate(row.createdAt) }}
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" size="small" @click="handleViewDetail(row)">查看详情</el-button>
            <el-button type="success" size="small" @click="handleAwardAchievement(row)">颁发成就</el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { getUserList, getUserDetail, awardAchievementToUser, getUserAchievements, type User, type GetUserListParams, type AwardAchievementParams, type UserAchievement } from '@/api/users'
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

// 搜索表单
const searchForm = reactive<GetUserListParams>({
  page: 1,
  per_page: 10,
  sort_by: 'createdAt',
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
  searchForm.sort_by = 'createdAt'
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
}
</style>