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
            <el-option label="物流公司" value="carrier" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序方式" prop="sortOrder">
          <el-select v-model="searchForm.sortOrder" placeholder="请选择排序方式" style="width: 150px;" clearable>
            <el-option label="升序" value="asc" />
            <el-option label="降序" value="desc" />
          </el-select>
        </el-form-item>
        <el-form-item label="搜索" prop="searchQuery">
          <el-input v-model="searchForm.searchQuery" placeholder="请输入订单号或追踪号" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <div class="header-actions">
        <el-button type="primary" @click="handleAdd">添加物流信息</el-button>
        <el-button type="success" @click="handleExport" :loading="exportLoading">导出物流信息</el-button>
      </div>
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
        <el-table-column prop="order_id" label="订单ID" width="120" sortable="custom" />
        <el-table-column prop="tracking_number" label="追踪号" width="150" sortable="custom">
          <template #default="{ row }">
            <el-tooltip effect="dark" :content="`点击复制: ${row.tracking_number}`" placement="top">
              <span class="tracking-number" @click="copyToClipboard(row.tracking_number)">{{ row.tracking_number }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="carrier" label="物流公司" width="120" sortable="custom" />
        <el-table-column prop="status" label="状态" width="100" sortable="custom">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="estimated_delivery_date" label="预计送达日期" width="120" sortable="custom" />
        <el-table-column prop="actual_delivery_date" label="实际送达日期" width="120" sortable="custom">
          <template #default="{ row }">
            {{ row.actual_delivery_date || '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="shipping_address.recipient_name" label="收件人" width="100" sortable="custom" />
        <el-table-column label="地址" min-width="200">
          <template #default="{ row }">
            <el-tooltip effect="dark" :content="formatAddress(row.shipping_address)" placement="top">
              <div class="address-ellipsis">{{ formatAddress(row.shipping_address) }}</div>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="创建时间" width="180" sortable="custom" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleView(row)">查看</el-button>
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 添加物流信息抽屉 -->
    <el-drawer
      v-model="addDrawerVisible"
      title="添加物流信息"
      size="50%"
      :destroy-on-close="false"
    >
      <el-form 
        ref="addFormRef" 
        :model="addFormData" 
        :rules="addRules" 
        label-width="120px"
        v-loading="addLoading"
      >
        <el-form-item label="订单ID" prop="order_id">
          <el-input v-model="addFormData.order_id" placeholder="请输入订单ID" />
        </el-form-item>
        
        <el-form-item label="追踪号" prop="tracking_number">
          <el-input v-model="addFormData.tracking_number" placeholder="请输入追踪号" />
        </el-form-item>
        
        <el-form-item label="物流公司" prop="carrier">
          <el-select v-model="addFormData.carrier" placeholder="请选择物流公司" filterable allow-create>
            <el-option 
              v-for="item in carrierOptions" 
              :key="item.value" 
              :label="item.label" 
              :value="item.value" 
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="状态" prop="status">
          <el-select v-model="addFormData.status" placeholder="请选择物流状态">
            <el-option label="处理中" value="processing" />
            <el-option label="已发货" value="shipped" />
            <el-option label="运输中" value="in_transit" />
            <el-option label="已送达" value="delivered" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="预计送达日期" prop="estimated_delivery_date">
          <el-date-picker
            v-model="addFormData.estimated_delivery_date"
            type="date"
            placeholder="选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        
        <el-divider>收件人信息</el-divider>
        
        <el-form-item label="收件人姓名" prop="shipping_address.recipient_name">
          <el-input v-model="addFormData.shipping_address.recipient_name" placeholder="请输入收件人姓名" />
        </el-form-item>
        
        <el-form-item label="街道地址" prop="shipping_address.street_address">
          <el-input v-model="addFormData.shipping_address.street_address" placeholder="请输入街道地址" />
        </el-form-item>
        
        <el-form-item label="城市" prop="shipping_address.city">
          <el-input v-model="addFormData.shipping_address.city" placeholder="请输入城市" />
        </el-form-item>
        
        <el-form-item label="省/州" prop="shipping_address.state">
          <el-input v-model="addFormData.shipping_address.state" placeholder="请输入省/州" />
        </el-form-item>
        
        <el-form-item label="邮政编码" prop="shipping_address.postal_code">
          <el-input v-model="addFormData.shipping_address.postal_code" placeholder="请输入邮政编码" />
        </el-form-item>
        
        <el-form-item label="国家" prop="shipping_address.country">
          <el-input v-model="addFormData.shipping_address.country" placeholder="请输入国家" />
        </el-form-item>
        
        <el-form-item label="电话号码" prop="shipping_address.phone_number">
          <el-input v-model="addFormData.shipping_address.phone_number" placeholder="请输入电话号码" />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitAddForm">添加</el-button>
          <el-button @click="resetAddForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 编辑物流信息抽屉 -->
    <el-drawer
      v-model="editDrawerVisible"
      title="编辑物流信息"
      size="50%"
      :destroy-on-close="false"
    >
      <el-form 
        ref="editFormRef" 
        :model="editFormData" 
        :rules="editRules" 
        label-width="120px"
        v-loading="editLoading"
      >
        <el-form-item label="追踪号" prop="tracking_number">
          <el-input v-model="editFormData.tracking_number" placeholder="请输入追踪号" />
        </el-form-item>
        
        <el-form-item label="物流公司" prop="carrier">
          <el-select v-model="editFormData.carrier" placeholder="请选择物流公司" filterable allow-create>
            <el-option 
              v-for="item in carrierOptions" 
              :key="item.value" 
              :label="item.label" 
              :value="item.value" 
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="状态" prop="status">
          <el-select v-model="editFormData.status" placeholder="请选择物流状态">
            <el-option label="处理中" value="processing" />
            <el-option label="已发货" value="shipped" />
            <el-option label="运输中" value="in_transit" />
            <el-option label="已送达" value="delivered" />
            <el-option label="已取消" value="cancelled" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="预计送达日期" prop="estimated_delivery_date">
          <el-date-picker
            v-model="editFormData.estimated_delivery_date"
            type="date"
            placeholder="选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        
        <el-form-item label="实际送达日期" prop="actual_delivery_date">
          <el-date-picker
            v-model="editFormData.actual_delivery_date"
            type="date"
            placeholder="选择日期"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
          />
        </el-form-item>
        
        <el-divider>收件人信息</el-divider>
        
        <el-form-item label="收件人姓名" prop="shipping_address.recipient_name">
          <el-input v-model="editFormData.shipping_address.recipient_name" placeholder="请输入收件人姓名" />
        </el-form-item>
        
        <el-form-item label="街道地址" prop="shipping_address.street_address">
          <el-input v-model="editFormData.shipping_address.street_address" placeholder="请输入街道地址" />
        </el-form-item>
        
        <el-form-item label="城市" prop="shipping_address.city">
          <el-input v-model="editFormData.shipping_address.city" placeholder="请输入城市" />
        </el-form-item>
        
        <el-form-item label="省/州" prop="shipping_address.state">
          <el-input v-model="editFormData.shipping_address.state" placeholder="请输入省/州" />
        </el-form-item>
        
        <el-form-item label="邮政编码" prop="shipping_address.postal_code">
          <el-input v-model="editFormData.shipping_address.postal_code" placeholder="请输入邮政编码" />
        </el-form-item>
        
        <el-form-item label="国家" prop="shipping_address.country">
          <el-input v-model="editFormData.shipping_address.country" placeholder="请输入国家" />
        </el-form-item>
        
        <el-form-item label="电话号码" prop="shipping_address.phone_number">
          <el-input v-model="editFormData.shipping_address.phone_number" placeholder="请输入电话号码" />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitEditForm">保存</el-button>
          <el-button @click="editDrawerVisible = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 查看物流信息对话框 -->
    <el-dialog
      v-model="viewDialogVisible"
      title="物流详情"
      width="600px"
    >
      <el-descriptions :column="1" border>
        <el-descriptions-item label="物流ID">{{ currentViewShipment?.id }}</el-descriptions-item>
        <el-descriptions-item label="订单ID">{{ currentViewShipment?.order_id }}</el-descriptions-item>
        <el-descriptions-item label="追踪号">{{ currentViewShipment?.tracking_number }}</el-descriptions-item>
        <el-descriptions-item label="物流公司">{{ currentViewShipment?.carrier }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag :type="getStatusType(currentViewShipment?.status)">{{ getStatusText(currentViewShipment?.status) }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="预计送达日期">{{ currentViewShipment?.estimated_delivery_date }}</el-descriptions-item>
        <el-descriptions-item label="实际送达日期">{{ currentViewShipment?.actual_delivery_date || '-' }}</el-descriptions-item>
        <el-descriptions-item label="收件人">{{ currentViewShipment?.shipping_address?.recipient_name }}</el-descriptions-item>
        <el-descriptions-item label="地址">
          {{ formatAddress(currentViewShipment?.shipping_address) }}
        </el-descriptions-item>
        <el-descriptions-item label="电话号码">{{ currentViewShipment?.shipping_address?.phone_number }}</el-descriptions-item>
        <el-descriptions-item label="创建时间">{{ currentViewShipment?.created_at }}</el-descriptions-item>
        <el-descriptions-item label="更新时间">{{ currentViewShipment?.updated_at }}</el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="viewDialogVisible = false">关闭</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 删除确认对话框 -->
    <el-dialog
      v-model="deleteDialogVisible"
      title="确认删除"
      width="400px"
    >
      <p>确定要删除该物流信息吗？此操作不可恢复。</p>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="deleteDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="confirmDelete">
            <el-icon><Delete /></el-icon>
            确认删除
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, onDeactivated } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import { 
  getShippingList,
  getShippingDetail,
  createShipping,
  updateShipping,
  deleteShipping,
  type ShippingInfo,
  type CreateShippingParams,
  type UpdateShippingParams
} from '../../api/shipping'
import { ElMessage, ElMessageBox } from 'element-plus'

defineOptions({
  name: 'ShippingIndex'
})

// 搜索表单数据
const searchForm = reactive({
  status: '',
  sortBy: 'created_at',
  sortOrder: 'desc',
  searchQuery: ''
})

// 表格数据
const tableData = ref<ShippingInfo[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 添加抽屉相关
const addDrawerVisible = ref(false)
const addLoading = ref(false)
const addFormRef = ref()

// 添加表单数据
const addFormData = reactive<CreateShippingParams>({
  order_id: '',
  tracking_number: '',
  carrier: '',
  status: 'processing',
  estimated_delivery_date: '',
  shipping_address: {
    recipient_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    phone_number: ''
  }
})

// 添加表单验证规则
const addRules = {
  order_id: [
    { required: true, message: '请输入订单ID', trigger: 'blur' }
  ],
  tracking_number: [
    { required: true, message: '请输入追踪号', trigger: 'blur' }
  ],
  carrier: [
    { required: true, message: '请输入物流公司', trigger: 'blur' }
  ],
  status: [
    { required: true, message: '请选择物流状态', trigger: 'change' }
  ],
  estimated_delivery_date: [
    { required: true, message: '请选择预计送达日期', trigger: 'change' }
  ],
  'shipping_address.recipient_name': [
    { required: true, message: '请输入收件人姓名', trigger: 'blur' }
  ],
  'shipping_address.street_address': [
    { required: true, message: '请输入街道地址', trigger: 'blur' }
  ],
  'shipping_address.city': [
    { required: true, message: '请输入城市', trigger: 'blur' }
  ],
  'shipping_address.state': [
    { required: true, message: '请输入省/州', trigger: 'blur' }
  ],
  'shipping_address.postal_code': [
    { required: true, message: '请输入邮政编码', trigger: 'blur' }
  ],
  'shipping_address.country': [
    { required: true, message: '请输入国家', trigger: 'blur' }
  ],
  'shipping_address.phone_number': [
    { required: true, message: '请输入电话号码', trigger: 'blur' }
  ]
}

// 编辑抽屉相关
const editDrawerVisible = ref(false)
const editLoading = ref(false)
const editFormRef = ref()
const currentEditShipment = ref<ShippingInfo | null>(null)

// 编辑表单数据
const editFormData = reactive<UpdateShippingParams>({
  tracking_number: '',
  carrier: '',
  status: '',
  estimated_delivery_date: '',
  actual_delivery_date: '',
  shipping_address: {
    recipient_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    phone_number: ''
  }
})

// 编辑表单验证规则
const editRules = {
  tracking_number: [
    { required: true, message: '请输入追踪号', trigger: 'blur' }
  ],
  carrier: [
    { required: true, message: '请输入物流公司', trigger: 'blur' }
  ],
  status: [
    { required: true, message: '请选择物流状态', trigger: 'change' }
  ],
  'shipping_address.recipient_name': [
    { required: true, message: '请输入收件人姓名', trigger: 'blur' }
  ]
}

// 查看物流信息相关
const viewDialogVisible = ref(false)
const currentViewShipment = ref<ShippingInfo | null>(null)

// 删除物流信息相关
const deleteDialogVisible = ref(false)
const currentDeleteId = ref('')

// 导出相关
const exportLoading = ref(false)

// 常用物流公司列表
const carrierOptions = [
  { label: '顺丰速运', value: '顺丰速运' },
  { label: '中通快递', value: '中通快递' },
  { label: '圆通速递', value: '圆通速递' },
  { label: '申通快递', value: '申通快递' },
  { label: '韵达速递', value: '韵达速递' },
  { label: '百世快递', value: '百世快递' },
  { label: 'EMS', value: 'EMS' },
  { label: '京东物流', value: '京东物流' },
  { label: '德邦快递', value: '德邦快递' },
  { label: '天天快递', value: '天天快递' },
  { label: 'FedEx', value: 'FedEx' },
  { label: 'UPS', value: 'UPS' },
  { label: 'DHL', value: 'DHL' },
  { label: '其他', value: '其他' }
]

// 获取物流列表
const fetchShippingList = async () => {
  loading.value = true
  try {
    const params: any = {
      page: currentPage.value,
      per_page: pageSize.value,
      sort_by: searchForm.sortBy,
      sort_order: searchForm.sortOrder,
      search_query: searchForm.searchQuery
    }
    
    // 添加状态筛选
    if (searchForm.status) {
      params.status = searchForm.status
    }
    
    const response = await getShippingList(params)
    tableData.value = response.data.shipments
    total.value = response.data.pagination.total_items
  } catch (error) {
    console.error('获取物流列表失败：', error)
    ElMessage.error('获取物流列表失败')
  } finally {
    loading.value = false
  }
}

// 获取状态类型
const getStatusType = (status: string | undefined) => {
  if (!status) return ''
  const statusMap: Record<string, string> = {
    'processing': 'info',
    'shipped': 'warning',
    'in_transit': 'primary',
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
  return `${address.street_address}, ${address.city}, ${address.state}, ${address.postal_code}, ${address.country}`
}

// 重置方法
const handleReset = () => {
  searchForm.status = ''
  searchForm.sortBy = 'created_at'
  searchForm.sortOrder = 'desc'
  searchForm.searchQuery = ''
  currentPage.value = 1
  fetchShippingList()
}

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  fetchShippingList()
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  fetchShippingList()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
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

// 添加物流信息 - 打开抽屉
const handleAdd = () => {
  addDrawerVisible.value = true
}

// 提交添加表单
const submitAddForm = async () => {
  if (!addFormRef.value) return
  
  await addFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      addLoading.value = true
      try {
        await createShipping(addFormData)
        ElMessage.success('添加物流信息成功')
        addDrawerVisible.value = false
        resetAddForm()
        fetchShippingList() // 刷新列表
      } catch (error) {
        console.error('添加物流信息失败：', error)
        ElMessage.error('添加物流信息失败')
      } finally {
        addLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 重置添加表单
const resetAddForm = () => {
  if (!addFormRef.value) return
  addFormRef.value.resetFields()
  addFormData.order_id = ''
  addFormData.tracking_number = ''
  addFormData.carrier = ''
  addFormData.status = 'processing'
  addFormData.estimated_delivery_date = ''
  addFormData.shipping_address = {
    recipient_name: '',
    street_address: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
    phone_number: ''
  }
}

// 查看物流信息
const handleView = async (row: ShippingInfo) => {
  try {
    const response = await getShippingDetail(row.id)
    currentViewShipment.value = response.data
    viewDialogVisible.value = true
  } catch (error) {
    console.error('获取物流详情失败：', error)
    ElMessage.error('获取物流详情失败')
  }
}

// 编辑物流信息
const handleEdit = async (row: ShippingInfo) => {
  try {
    const response = await getShippingDetail(row.id)
    currentEditShipment.value = response.data
    
    // 填充编辑表单
    editFormData.tracking_number = response.data.tracking_number
    editFormData.carrier = response.data.carrier
    editFormData.status = response.data.status
    editFormData.estimated_delivery_date = response.data.estimated_delivery_date
    editFormData.actual_delivery_date = response.data.actual_delivery_date || ''
    editFormData.shipping_address = { ...response.data.shipping_address }
    
    editDrawerVisible.value = true
  } catch (error) {
    console.error('获取物流详情失败：', error)
    ElMessage.error('获取物流详情失败')
  }
}

// 提交编辑表单
const submitEditForm = async () => {
  if (!editFormRef.value || !currentEditShipment.value) return
  
  await editFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      editLoading.value = true
      try {
        await updateShipping(currentEditShipment.value.id, editFormData)
        ElMessage.success('更新物流信息成功')
        editDrawerVisible.value = false
        fetchShippingList() // 刷新列表
      } catch (error) {
        console.error('更新物流信息失败：', error)
        ElMessage.error('更新物流信息失败')
      } finally {
        editLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 删除物流信息
const handleDelete = (row: ShippingInfo) => {
  currentDeleteId.value = row.id
  deleteDialogVisible.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!currentDeleteId.value) return
  
  try {
    await deleteShipping(currentDeleteId.value)
    ElMessage.success('删除物流信息成功')
    deleteDialogVisible.value = false
    fetchShippingList() // 刷新列表
  } catch (error) {
    console.error('删除物流信息失败：', error)
    ElMessage.error('删除物流信息失败')
  }
}

// 导出物流信息
const handleExport = async () => {
  exportLoading.value = true
  try {
    // 构建查询参数，与当前筛选条件一致
    const params: any = {
      sort_by: searchForm.sortBy,
      sort_order: searchForm.sortOrder,
      search_query: searchForm.searchQuery
    }
    
    // 添加状态筛选
    if (searchForm.status) {
      params.status = searchForm.status
    }
    
    // 获取所有数据（不分页）
    const response = await getShippingList({
      ...params,
      page: 1,
      per_page: 1000 // 设置一个较大的值，获取所有数据
    })
    
    if (!response.data.shipments || response.data.shipments.length === 0) {
      ElMessage.warning('没有数据可导出')
      exportLoading.value = false
      return
    }
    
    // 准备CSV数据
    const headers = ['物流ID', '订单ID', '追踪号', '物流公司', '状态', '预计送达日期', '实际送达日期', '收件人', '地址', '电话号码', '创建时间', '更新时间']
    const rows = response.data.shipments.map((item: ShippingInfo) => [
      item.id,
      item.order_id,
      item.tracking_number,
      item.carrier,
      getStatusText(item.status),
      item.estimated_delivery_date,
      item.actual_delivery_date || '',
      item.shipping_address.recipient_name,
      formatAddress(item.shipping_address),
      item.shipping_address.phone_number,
      item.created_at,
      item.updated_at
    ])
    
    // 生成CSV内容
    let csvContent = headers.join(',') + '\n'
    rows.forEach(row => {
      // 处理CSV中的特殊字符
      const processedRow = row.map(cell => {
        const cellStr = String(cell)
        // 如果单元格包含逗号、引号或换行符，则用引号包裹并处理内部引号
        if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
          return '"' + cellStr.replace(/"/g, '""') + '"'
        }
        return cellStr
      })
      csvContent += processedRow.join(',') + '\n'
    })
    
    // 创建Blob对象
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    
    // 创建下载链接
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `物流信息_${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    ElMessage.success('导出成功')
  } catch (error) {
    console.error('导出物流信息失败：', error)
    ElMessage.error('导出物流信息失败')
  } finally {
    exportLoading.value = false
  }
}

// 初始化
onMounted(() => {
  fetchShippingList()
})

// 保存状态到localStorage
onDeactivated(() => {
  localStorage.setItem('shipping_state', JSON.stringify({
    searchForm: {
      status: searchForm.status,
      sortBy: searchForm.sortBy,
      sortOrder: searchForm.sortOrder,
      searchQuery: searchForm.searchQuery
    },
    pagination: {
      currentPage: currentPage.value,
      pageSize: pageSize.value
    }
  }))
})

// 从localStorage恢复状态
onActivated(() => {
  const savedState = localStorage.getItem('shipping_state')
  
  if (savedState) {
    const parsed = JSON.parse(savedState)
    
    // 恢复搜索表单
    if (parsed.searchForm) {
      searchForm.status = parsed.searchForm.status || ''
      searchForm.sortBy = parsed.searchForm.sortBy || 'created_at'
      searchForm.sortOrder = parsed.searchForm.sortOrder || 'desc'
      searchForm.searchQuery = parsed.searchForm.searchQuery || ''
    }
    
    // 恢复分页
    if (parsed.pagination) {
      currentPage.value = parsed.pagination.currentPage || 1
      pageSize.value = parsed.pagination.pageSize || 10
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
    .header-actions {
      margin-bottom: 16px;
      display: flex;
      gap: 10px;
    }

    .pagination-container {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
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
}
</style>