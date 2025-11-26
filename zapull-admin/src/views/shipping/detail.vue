<template>
  <div class="shipping-detail-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>物流详情</span>
          <el-button @click="goBack" plain>返回列表</el-button>
        </div>
      </template>

      <div v-loading="loading">
        <!-- 基本信息 -->
        <el-descriptions title="基本信息" :column="2" border>
          <el-descriptions-item label="物流ID">{{ shippingDetail?.id }}</el-descriptions-item>
          <el-descriptions-item label="用户ID">{{ shippingDetail?.user_id }}</el-descriptions-item>
          <el-descriptions-item label="追踪号">
            <div class="tracking-info">
              <span>{{ shippingDetail?.tracking_number }}</span>
              <el-button v-if="shippingDetail?.tracking_number" type="primary" link @click="copyToClipboard(shippingDetail?.tracking_number)">
                复制
              </el-button>
            </div>
          </el-descriptions-item>
          <el-descriptions-item label="卡片数量">{{ shippingDetail?.card_count }}</el-descriptions-item>
          <el-descriptions-item label="状态">
            <el-tag :type="getStatusType(shippingDetail?.status)">{{ getStatusText(shippingDetail?.status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="物流状态">
            <el-tag :type="getStatusType(shippingDetail?.shipping_status)">{{ getStatusText(shippingDetail?.shipping_status) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">{{ shippingDetail?.created_at }}</el-descriptions-item>
          <el-descriptions-item label="请求时间">{{ shippingDetail?.request_date }}</el-descriptions-item>
        </el-descriptions>

        <!-- 收件人信息 -->
        <el-descriptions title="收件人信息" :column="2" border class="mt-20">
          <el-descriptions-item label="收件人">{{ shippingDetail?.shipping_address?.name }}</el-descriptions-item>
          <el-descriptions-item label="地址ID">{{ shippingDetail?.shipping_address?.id }}</el-descriptions-item>
          <el-descriptions-item label="详细地址" :span="2">
            {{ formatAddress(shippingDetail?.shipping_address) }}
          </el-descriptions-item>
        </el-descriptions>

        <!-- Shippo信息 -->
        <el-descriptions title="Shippo信息" :column="2" border class="mt-20">
          <el-descriptions-item label="Shippo地址ID">{{ shippingDetail?.shippo_address_id }}</el-descriptions-item>
          <el-descriptions-item label="Shippo包裹ID">{{ shippingDetail?.shippo_parcel_id }}</el-descriptions-item>
          <el-descriptions-item label="Shippo运单ID">{{ shippingDetail?.shippo_shipment_id }}</el-descriptions-item>
          <el-descriptions-item label="Shippo交易ID">{{ shippingDetail?.shippo_transaction_id }}</el-descriptions-item>
          <el-descriptions-item label="运单标签" :span="2">
            <div v-if="shippingDetail?.shippo_label_url">
              <el-link :href="shippingDetail?.shippo_label_url" target="_blank" type="primary">查看运单标签</el-link>
            </div>
            <span v-else>-</span>
          </el-descriptions-item>
          <el-descriptions-item label="追踪链接" :span="2">
            <div v-if="shippingDetail?.tracking_url">
              <el-link :href="shippingDetail?.tracking_url" target="_blank" type="primary">查看物流追踪</el-link>
            </div>
            <span v-else>-</span>
          </el-descriptions-item>
        </el-descriptions>

        <!-- 卡片信息 -->
        <div class="mt-20">
          <div class="section-header">
            <span class="section-title">卡片信息</span>
          </div>
          <el-table :data="shippingDetail?.cards || []" border stripe style="width: 100%">
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
          <el-button type="primary" @click="handleUpdateStatus">更新状态</el-button>
          <el-button @click="goBack">返回列表</el-button>
        </div>
      </div>
    </el-card>

    <!-- 更新状态对话框 -->
    <el-dialog
      v-model="updateStatusDialogVisible"
      title="更新物流状态"
      width="400px"
    >
      <el-form :model="updateStatusForm" label-width="100px">
        <el-form-item label="当前状态">
          <el-tag :type="getStatusType(shippingDetail?.status)">{{ getStatusText(shippingDetail?.status) }}</el-tag>
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
import { ref, reactive, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { 
  getShippingDetail,
  getShopOrderDetail,
  updateShippingStatus,
  updateShopOrderStatus,
  type ShippingInfo,
  type UpdateShippingStatusParams
} from '../../api/shipping-new'
import { ElMessage } from 'element-plus'

defineOptions({
  name: 'ShippingDetail'
})

const route = useRoute()
const router = useRouter()
const userId = ref(route.params.userId as string)
const requestId = ref(route.params.requestId as string)

// Detect if this is a shop order based on ID format
const isShopOrder = computed(() => requestId.value.startsWith('order_'))

// 物流详情数据
const shippingDetail = ref<ShippingInfo | null>(null)
const loading = ref(false)

// 更新状态相关
const updateStatusDialogVisible = ref(false)
const updateStatusLoading = ref(false)
const updateStatusForm = reactive<UpdateShippingStatusParams>({
  status: '',
  shipping_status: ''
})

// 获取物流详情
const fetchShippingDetail = async () => {
  if (!userId.value || !requestId.value) {
    ElMessage.error('缺少必要参数')
    return
  }

  loading.value = true
  try {
    // Use appropriate API based on whether it's a shop order or withdraw request
    const response = isShopOrder.value 
      ? await getShopOrderDetail(userId.value, requestId.value)
      : await getShippingDetail(userId.value, requestId.value)
    shippingDetail.value = response.data
    
    // 初始化更新状态表单
    if (shippingDetail.value) {
      updateStatusForm.status = shippingDetail.value.status
      updateStatusForm.shipping_status = shippingDetail.value.shipping_status
    }
  } catch (error) {
    console.error('获取物流详情失败：', error)
    ElMessage.error('获取物流详情失败')
  } finally {
    loading.value = false
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

// 返回列表
const goBack = () => {
  router.push('/shipping')
}

// 更新物流状态
const handleUpdateStatus = () => {
  updateStatusDialogVisible.value = true
}

// 确认更新状态
const confirmUpdateStatus = async () => {
  if (!shippingDetail.value) return
  
  updateStatusLoading.value = true
  try {
    // Use appropriate API based on whether it's a shop order or withdraw request
    const updateFn = isShopOrder.value ? updateShopOrderStatus : updateShippingStatus
    await updateFn(
      userId.value,
      requestId.value,
      { 
        status: updateStatusForm.status,
        shipping_status: updateStatusForm.shipping_status 
      }
    )
    ElMessage.success('更新物流状态成功')
    updateStatusDialogVisible.value = false
    fetchShippingDetail() // 刷新详情
  } catch (error) {
    console.error('更新物流状态失败：', error)
    ElMessage.error('更新物流状态失败')
  } finally {
    updateStatusLoading.value = false
  }
}

// 初始化
onMounted(() => {
  fetchShippingDetail()
})
</script>

<style scoped lang="scss">
.shipping-detail-container {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
  
  .tracking-info {
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