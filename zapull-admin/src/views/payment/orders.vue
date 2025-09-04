<template>
  <div class="orders-container">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="订单号">
          <el-input v-model="searchForm.orderNo" placeholder="请输入订单号" clearable />
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="searchForm.userId" placeholder="请输入用户ID" clearable />
        </el-form-item>
        <el-form-item label="订单状态">
          <el-select v-model="searchForm.status" placeholder="请选择订单状态" clearable>
            <el-option label="待支付" value="pending" />
            <el-option label="支付成功" value="success" />
            <el-option label="支付失败" value="failed" />
            <el-option label="已退款" value="refunded" />
          </el-select>
        </el-form-item>
        <el-form-item label="支付方式">
          <el-select v-model="searchForm.paymentMethod" placeholder="请选择支付方式" clearable>
            <el-option label="支付宝" value="alipay" />
            <el-option label="微信" value="wechat" />
            <el-option label="银联" value="unionpay" />
          </el-select>
        </el-form-item>
        <el-form-item label="创建时间">
          <el-date-picker
            v-model="searchForm.dateRange"
            type="daterange"
            range-separator="至"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column prop="orderNo" label="订单号" width="180" />
        <el-table-column prop="userId" label="用户ID" width="120" />
        <el-table-column prop="amount" label="金额" width="120">
          <template #default="{ row }">
            ¥{{ row.amount.toFixed(2) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="订单状态" width="120">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">{{ getStatusText(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="paymentMethod" label="支付方式" width="120" />
        <el-table-column prop="createTime" label="创建时间" width="180" />
        <el-table-column prop="payTime" label="支付时间" width="180" />
        <el-table-column label="操作" fixed="right" width="150">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleDetail(row)">查看详情</el-button>
            <el-button v-if="row.status === 'success'" link type="warning" @click="handleRefund(row)">申请退款</el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'

// 搜索表单数据
const searchForm = reactive({
  orderNo: '',
  userId: '',
  status: '',
  paymentMethod: '',
  dateRange: []
})

// 表格数据
const tableData = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 获取状态类型
const getStatusType = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: 'warning',
    success: 'success',
    failed: 'danger',
    refunded: 'info'
  }
  return statusMap[status] || 'info'
}

// 获取状态文本
const getStatusText = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: '待支付',
    success: '支付成功',
    failed: '支付失败',
    refunded: '已退款'
  }
  return statusMap[status] || status
}

// 搜索方法
const handleSearch = () => {
  loading.value = true
  // TODO: 调用接口获取数据
  setTimeout(() => {
    loading.value = false
  }, 1000)
}

// 重置方法
const handleReset = () => {
  searchForm.orderNo = ''
  searchForm.userId = ''
  searchForm.status = ''
  searchForm.paymentMethod = ''
  searchForm.dateRange = []
  handleSearch()
}

// 查看详情
const handleDetail = (row: any) => {
  console.log('查看详情', row)
}

// 申请退款
const handleRefund = (row: any) => {
  console.log('申请退款', row)
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  handleSearch()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  handleSearch()
}

// 初始化加载数据
handleSearch()
</script>

<style scoped lang="scss">
.orders-container {
  .search-card {
    margin-bottom: 16px;
  }

  .table-card {
    .pagination-container {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
  }
}
</style>