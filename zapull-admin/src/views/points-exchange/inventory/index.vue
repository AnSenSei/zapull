<template>
  <div class="points-exchange-inventory">
    <div class="header">
      <el-input
        v-model="searchKeyword"
        placeholder="请输入商品名称搜索"
        style="width: 200px"
        clearable
      />
    </div>

    <el-table :data="inventoryList" border style="width: 100%">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="商品名称" />
      <el-table-column prop="total" label="总库存" width="100" />
      <el-table-column prop="available" label="可用库存" width="100" />
      <el-table-column prop="locked" label="锁定库存" width="100" />
      <el-table-column prop="warning" label="库存预警" width="100">
        <template #default="{ row }">
          <el-tag :type="row.available <= row.warning ? 'danger' : 'success'">
            {{ row.warning }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="180" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleAdjust(row)">调整库存</el-button>
          <el-button link type="primary" @click="handleWarning(row)">设置预警</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      v-model:current-page="currentPage"
      v-model:page-size="pageSize"
      :total="total"
      :page-sizes="[10, 20, 50, 100]"
      layout="total, sizes, prev, pager, next"
      class="pagination"
    />

    <!-- 调整库存弹窗 -->
    <el-dialog
      v-model="adjustDialogVisible"
      title="调整库存"
      width="500px"
    >
      <el-form :model="adjustForm" label-width="100px">
        <el-form-item label="当前库存">
          <span>{{ selectedProduct?.available || 0 }}</span>
        </el-form-item>
        <el-form-item label="调整数量">
          <el-input-number
            v-model="adjustForm.amount"
            :min="-selectedProduct?.available"
            placeholder="请输入调整数量"
          />
          <div class="tip">正数为入库，负数为出库</div>
        </el-form-item>
        <el-form-item label="调整原因">
          <el-input
            v-model="adjustForm.reason"
            type="textarea"
            placeholder="请输入调整原因"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="adjustDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitAdjust">确认</el-button>
      </template>
    </el-dialog>

    <!-- 设置预警弹窗 -->
    <el-dialog
      v-model="warningDialogVisible"
      title="设置库存预警"
      width="500px"
    >
      <el-form :model="warningForm" label-width="100px">
        <el-form-item label="预警数量">
          <el-input-number
            v-model="warningForm.warning"
            :min="0"
            placeholder="请输入预警数量"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="warningDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitWarning">确认</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const inventoryList = ref([])

// 调整库存相关
const adjustDialogVisible = ref(false)
const selectedProduct = ref<any>(null)
const adjustForm = ref({
  amount: 0,
  reason: ''
})

// 设置预警相关
const warningDialogVisible = ref(false)
const warningForm = ref({
  warning: 0
})

const handleAdjust = (row: any) => {
  selectedProduct.value = row
  adjustDialogVisible.value = true
}

const handleWarning = (row: any) => {
  selectedProduct.value = row
  warningForm.value.warning = row.warning
  warningDialogVisible.value = true
}

const submitAdjust = () => {
  // 实现提交库存调整逻辑
}

const submitWarning = () => {
  // 实现提交预警设置逻辑
}
</script>

<style scoped>
.points-exchange-inventory {
  padding: 20px;
}

.header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.tip {
  color: #909399;
  font-size: 12px;
  margin-top: 5px;
}
</style>