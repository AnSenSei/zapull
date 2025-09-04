<template>
  <div class="shipping-container">
    <el-card class="search-card">
      <el-form ref="searchFormRef" inline>

        <el-form-item label="物流状态" prop="status">
          <el-select 
            v-model="searchForm.status" 
            placeholder="请选择物流状态" 
            clearable 
            style="width: 220px;"
          >
            <el-option label="处理中" value="processing" />
            <el-option label="标签已创建" value="label_created" />
            <el-option label="已发货" value="shipped" />
            <el-option label="运输中" value="in_transit" />
            <el-option label="已送达" value="delivered" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序字段" prop="sortBy">
          <el-select v-model="searchForm.sortBy" placeholder="请选择排序字段" style="width: 150px;" clearable>
            <el-option label="创建时间" value="created_at" />
            <el-option label="状态" value="status" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序方式" prop="sortOrder">
          <el-select v-model="searchForm.sortOrder" placeholder="请选择排序方式" style="width: 150px;" clearable>
            <el-option label="升序" value="asc" />
            <el-option label="降序" value="desc" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table 
        :data="tableData" 
        border 
        stripe 
        v-loading="loading"
        style="width: 100%"
        :default-sort="{ prop: 'created_at', order: 'descending' }"
        @sort-change="handleSortChange"
      >
        <el-table-column prop="id" label="物流ID" width="120" sortable="custom" />
        <el-table-column prop="user_id" label="用户ID" width="120" sortable="custom" />
        <el-table-column prop="tracking_number" label="追踪号" width="150" sortable="custom">
          <template #default="{ row }">
            <el-tooltip effect="dark" :content="`点击复制: ${row.tracking_number}`" placement="top">
              <span class="tracking-number" @click="copyToClipboard(row.tracking_number)">{{ row.tracking_number }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="card_count" label="卡片数量" width="100" sortable="custom" />
        <el-table-column prop="status" label="状态" width="120" sortable="custom">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>

        <el-table-column prop="shipping_address.name" label="收件人" width="100" sortable="custom" />
        <el-table-column label="地址" min-width="200">
          <template #default="{ row }">
            <el-tooltip effect="dark" :content="formatAddress(row.shipping_address)" placement="top">
              <div class="address-ellipsis">{{ formatAddress(row.shipping_address) }}</div>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" sortable="custom" />
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleView(row)">查看</el-button>
            <el-button link type="primary" @click="handleUpdateStatus(row)">更新状态</el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <div class="pagination-info">
          <span>每页 {{ searchForm.limit }} 条，共 {{ tableData.length }} 条</span>
          <el-button 
            v-if="hasMore" 
            type="primary" 
            plain 
            size="small" 
            @click="loadMore"
            :loading="loadingMore"
          >
            加载更多
          </el-button>
        </div>
      </div>
    </el-card>
    
    <!-- 查看物流信息抽屉 -->
    <el-drawer
      v-model="viewDialogVisible"
      title="物流详情"
      size="50%"
      :destroy-on-close="false"
      direction="rtl"
    >
      <div v-loading="viewLoading">
        <!-- 基本信息 -->
        <el-descriptions title="基本信息" :column="2" border>
          <el-descriptions-item label="物流ID">{{ currentViewShipment?.id }}</el-descriptions-item>
          <el-descriptions-item label="用户ID">{{ currentViewShipment?.user_id }}</el-descriptions-item>
          <el-descriptions-item label="追踪号">
            <div class="tracking-info">
              <span>{{ currentViewShipment?.tracking_number }}</span>
              <el-button v-if="currentViewShipment?.tracking_number" type="primary" link @click="copyToClipboard(currentViewShipment?.tracking_number)">
                复制
              </el-button>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="卡片数量">{{ currentViewShipment?.card_count }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(currentViewShipment?.status)">{{ getStatusText(currentViewShipment?.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="物流状态">
            <el-tag :type="getStatusType(currentViewShipment?.shipping_status)">{{ getStatusText(currentViewShipment?.shipping_status) }}</el-tag>
          </el-descriptions-item>

          <el-descriptions-item label="创建时间">{{ currentViewShipment?.created_at }}</el-descriptions-item>
          <el-descriptions-item label="请求时间">{{ currentViewShipment?.request_date }}</el-descriptions-item>
        </el-descriptions>

        <!-- 收件人信息 -->
        <el-descriptions title="收件人信息" :column="2" border class="mt-20">
          <el-descriptions-item label="收件人">{{ currentViewShipment?.shipping_address?.name }}</el-descriptions-item>
          <el-descriptions-item label="地址ID">{{ currentViewShipment?.shipping_address?.id }}</el-descriptions-item>
          <el-descriptions-item label="详细地址" :span="2">
            {{ formatAddress(currentViewShipment?.shipping_address) }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- Shippo信息 -->
        <el-descriptions title="Shippo信息" :column="2" border class="mt-20">
          <el-descriptions-item label="Shippo地址ID">{{ currentViewShipment?.shippo_address_id }}</el-descriptions-item>
          <el-descriptions-item label="Shippo包裹ID">{{ currentViewShipment?.shippo_parcel_id }}</el-descriptions-item>
          <el-descriptions-item label="Shippo运单ID">{{ currentViewShipment?.shippo_shipment_id }}</el-descriptions-item>
          <el-descriptions-item label="Shippo交易ID">{{ currentViewShipment?.shippo_transaction_id }}</el-descriptions-item>
          <el-descriptions-item label="运单标签" :span="2">
            <div v-if="currentViewShipment?.shippo_label_url">
              <el-link :href="currentViewShipment?.shippo_label_url" target="_blank" type="primary">查看运单标签</el-link>
            </div>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="追踪链接" :span="2">
            <div v-if="currentViewShipment?.tracking_url">
              <el-link :href="currentViewShipment?.tracking_url" target="_blank" type="primary">查看物流追踪</el-link>
            </div>
            <span v-else>-</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 卡片信息 -->
        <div class="mt-20">
          <div class="section-header">
            <span class="section-title">卡片信息</span>
          </div>
          <el-table :data="currentViewShipment?.cards || []" border stripe style="width: 100%">
            <el-table-column prop="card_name" label="卡片名称" min-width="120" />
            <el-table-column prop="id" label="卡片ID" min-width="120" />
            <el-table-column prop="quantity" label="数量" width="80" />
            <el-table-column prop="rarity" label="稀有度" width="80" />
            <el-table-column prop="point_worth" label="点数价值" width="100" />
            <el-table-column label="图片" width="120">
              <template #default="{ row }">
                <el-image 
                  style="width: 80px; height: 80px" 
                  :src="row.image_url" 
                  :preview-src-list="[row.image_url]"
                  fit="cover"
                />
              </template>
            </el-table-column>
            <el-table-column label="获取时间" min-width="180">
              <template #default="{ row }">
                {{ row.date_got || '-' }}
              </template>
            </el-table-column>
          </el-table>
        </div>

        <!-- 操作区域 -->
        <div class="action-area mt-20">
          <el-button type="primary" @click="handleUpdateStatus(currentViewShipment)">更新状态</el-button>
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </div>
      </div>
    </el-drawer>

    <!-- 更新状态对话框 -->
    <el-dialog
      v-model="updateStatusDialogVisible"
      title="更新物流状态"
      width="400px"
    >
      <el-form :model="updateStatusForm" label-width="100px">
        <el-form-item label="当前状态">
          <el-tag :type="getStatusType(currentUpdateShipment?.status)">{{ getStatusText(currentUpdateShipment?.status) }}</el-tag>
        </el-form-item>
        <el-form-item label="新状态" prop="status">
          <el-select v-model="updateStatusForm.status" placeholder="请选择新状态" style="width: 100%">
            <el-option label="处理中" value="processing" />
            <el-option label="标签已创建" value="label_created" />
            <el-option label="已发货" value="shipped" />
            <el-option label="运输中" value="in_transit" />
            <el-option label="已送达" value="delivered" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        <el-form-item label="物流状态" prop="shipping_status">
          <el-select v-model="updateStatusForm.shipping_status" placeholder="请选择物流状态" style="width: 100%">
            <el-option label="处理中" value="processing" />
            <el-option label="标签已创建" value="label_created" />
            <el-option label="已发货" value="shipped" />
            <el-option label="运输中" value="in_transit" />
            <el-option label="已送达" value="delivered" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="updateStatusDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="confirmUpdateStatus" :loading="updateStatusLoading">确认更新</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, onDeactivated } from 'vue'
import { useRouter } from 'vue-router'
import { 
  getShippingList,
  getInactiveShippingList,
  getShippingDetail,
  updateShippingStatus,
  updateShippingActiveStatus,
  type ShippingInfo,
  type UpdateShippingStatusParams
} from '../../api/shipping-new'
import { ElMessage } from 'element-plus'

const router = useRouter()

defineOptions({
  name: 'ShippingNewIndex'
})

// 搜索表单数据
const searchForm = reactive({
  status: '',
  sortBy: 'created_at',
  sortOrder: 'desc',
  limit: 10,
  cursor: ''
})

// 激活状态筛选，默认全部
const activeStatus = ref('all')

// 表格数据
const tableData = ref<ShippingInfo[]>([])
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(false)

// 查看物流信息相关
const viewDialogVisible = ref(false)
const viewLoading = ref(false)
const currentViewShipment = ref<ShippingInfo | null>(null)

// 更新状态相关
const updateStatusDialogVisible = ref(false)
const updateStatusLoading = ref(false)
const currentUpdateShipment = ref<ShippingInfo | null>(null)
const updateStatusForm = reactive<UpdateShippingStatusParams>({
  status: '',
  shipping_status: ''
})

// 获取物流列表
const fetchShippingList = async (reset = true) => {
  if (reset) {
    loading.value = true
    searchForm.cursor = ''
    tableData.value = []
  } else {
    loadingMore.value = true
  }
  
  try {
    const params: any = {
      limit: searchForm.limit,
      sort_by: searchForm.sortBy,
      sort_order: searchForm.sortOrder
    }
    
    // 添加状态筛选
    if (searchForm.status) {
      params.status = searchForm.status
    }
    
    // 添加游标
    if (searchForm.cursor && !reset) {
      params.cursor = searchForm.cursor
    }
    
    // 根据激活状态选择不同的API
    let response
    if (activeStatus.value === 'inactive') {
      response = await getInactiveShippingList(params)
    } else {
      response = await getShippingList(params)
    }
    
    if (reset) {
      tableData.value = response.withdraw_requests
    } else {
      tableData.value = [...tableData.value, ...response.withdraw_requests]
    }
    
    // 更新游标和是否有更多数据
    searchForm.cursor = response.pagination.next_cursor || ''
    hasMore.value = response.pagination.has_more
  } catch (error) {
    console.error('获取物流列表失败：', error)
    ElMessage.error('获取物流列表失败')
  } finally {
    loading.value = false
    loadingMore.value = false
  }
}

// 加载更多
const loadMore = () => {
  if (searchForm.cursor) {
    fetchShippingList(false)
  }
}

// 获取状态类型
const getStatusType = (status: string | undefined) => {
  if (!status) return ''
  const statusMap: Record<string, string> = {
    'processing': 'info',
    'label_created': 'warning',
    'shipped': 'primary',
    'in_transit': 'success',
    'delivered': 'success',
    'cancelled': 'danger'
  }
  return statusMap[status] || ''
}

// 获取状态文本
const getStatusText = (status: string | undefined) => {
  if (!status) return ''
  const statusMap: Record<string, string> = {
    'processing': '处理中',
    'label_created': '标签已创建',
    'shipped': '已发货',
    'in_transit': '运输中',
    'delivered': '已送达',
    'cancelled': '已取消'
  }
  return statusMap[status] || status
}

// 格式化地址
const formatAddress = (address: any) => {
  if (!address) return ''
  return `${address.street}, ${address.city}, ${address.state}, ${address.zip}, ${address.country}`
}

// 处理激活状态变化
const handleActiveStatusChange = () => {
  fetchShippingList()
}

// 重置方法
const handleReset = () => {
  activeStatus.value = 'all'
  searchForm.status = ''
  searchForm.sortBy = 'created_at'
  searchForm.sortOrder = 'desc'
  searchForm.cursor = ''
  fetchShippingList()
}

// 搜索方法
const handleSearch = () => {
  fetchShippingList()
}

// 表格排序变更
const handleSortChange = (column: { prop: string, order: string }) => {
  if (column.prop && column.order) {
    searchForm.sortBy = column.prop
    searchForm.sortOrder = column.order === 'ascending' ? 'asc' : 'desc'
    fetchShippingList()
  }
}

// 复制到剪贴板
const copyToClipboard = (text: string) => {
  navigator.clipboard.writeText(text)
    .then(() => {
      ElMessage.success('已复制到剪贴板')
    })
    .catch(() => {
      ElMessage.error('复制失败')
    })
}

// 查看物流信息
const handleView = async (row: ShippingInfo) => {
  viewDialogVisible.value = true
  viewLoading.value = true
  try {
    const response = await getShippingDetail(row.user_id, row.id)
    currentViewShipment.value = response
  } catch (error) {
    console.error('获取物流详情失败：', error)
    ElMessage.error('获取物流详情失败')
  } finally {
    viewLoading.value = false
  }
}

// 更新物流状态
const handleUpdateStatus = (row: ShippingInfo) => {
  currentUpdateShipment.value = row
  updateStatusForm.status = row.status
  updateStatusForm.shipping_status = row.shipping_status
  updateStatusDialogVisible.value = true
}

// 确认更新状态
const confirmUpdateStatus = async () => {
  if (!currentUpdateShipment.value) return
  
  updateStatusLoading.value = true
  try {
    await updateShippingStatus(
      currentUpdateShipment.value.user_id,
      currentUpdateShipment.value.id,
      { 
        status: updateStatusForm.status,
        shipping_status: updateStatusForm.shipping_status 
      }
    )
    ElMessage.success('更新物流状态成功')
    updateStatusDialogVisible.value = false
    fetchShippingList() // 刷新列表
  } catch (error) {
    console.error('更新物流状态失败：', error)
    ElMessage.error('更新物流状态失败')
  } finally {
    updateStatusLoading.value = false
  }
}

// 切换激活状态
const toggleActiveStatus = async (row: ShippingInfo) => {
  try {
    await updateShippingActiveStatus(row.user_id, row.id, !row.is_active)
    ElMessage.success(`${row.is_active ? '停用' : '激活'}物流成功`)
    fetchShippingList() // 刷新列表
  } catch (error) {
    console.error('更新物流激活状态失败：', error)
    ElMessage.error('更新物流激活状态失败')
  }
}

// 初始化
onMounted(() => {
  fetchShippingList()
})

// 保存状态到localStorage
onDeactivated(() => {
  localStorage.setItem('shipping_new_state', JSON.stringify({
    activeStatus: activeStatus.value,
    searchForm: {
      status: searchForm.status,
      sortBy: searchForm.sortBy,
      sortOrder: searchForm.sortOrder,
      limit: searchForm.limit
    }
  }))
})

// 从localStorage恢复状态
onActivated(() => {
  const savedState = localStorage.getItem('shipping_new_state')
  
  if (savedState) {
    const parsed = JSON.parse(savedState)
    
    // 恢复激活状态
    if (parsed.activeStatus) {
      activeStatus.value = parsed.activeStatus
    }
    
    // 恢复搜索表单
    if (parsed.searchForm) {
      searchForm.status = parsed.searchForm.status || ''
      searchForm.sortBy = parsed.searchForm.sortBy || 'created_at'
      searchForm.sortOrder = parsed.searchForm.sortOrder || 'desc'
      searchForm.limit = parsed.searchForm.limit || 10
    }
  }
  
  fetchShippingList()
})
</script>

<style scoped lang="scss">
.shipping-container {
  .search-card {
    margin-bottom: 16px;
  }

  .table-card {
    .pagination-container {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
      
      .pagination-info {
        display: flex;
        align-items: center;
        gap: 16px;
      }
    }
    
    .tracking-number {
      color: #409EFF;
      cursor: pointer;
      text-decoration: underline;
      &:hover {
        color: #66b1ff;
      }
    }
    
    .address-ellipsis {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
  }
  
  .mt-20 {
    margin-top: 20px;
  }
  
  .section-header {
    margin-bottom: 16px;
    border-bottom: 1px solid #ebeef5;
    padding-bottom: 10px;
    
    .section-title {
      font-size: 16px;
      font-weight: bold;
    }
  }
  
  .tracking-info,
  .active-status-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  .action-area {
    display: flex;
    justify-content: center;
    gap: 16px;
  }
}
</style>