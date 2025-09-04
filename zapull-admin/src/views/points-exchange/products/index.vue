<template>
  <div class="points-exchange-products">
    <div class="header">
      <el-button type="primary" @click="handleAdd">新增商品</el-button>
      <el-input
        v-model="searchKeyword"
        placeholder="请输入商品名称搜索"
        style="width: 200px"
        clearable
      />
    </div>

    <el-table :data="productList" border style="width: 100%">
      <el-table-column prop="id" label="ID" width="80" />
      <el-table-column prop="name" label="商品名称" />
      <el-table-column prop="points" label="所需积分" width="120" />
      <el-table-column prop="stock" label="库存数量" width="120" />
      <el-table-column prop="status" label="状态" width="100">
        <template #default="{ row }">
          <el-tag :type="row.status === 1 ? 'success' : 'info'">
            {{ row.status === 1 ? '上架' : '下架' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="操作" width="200" fixed="right">
        <template #default="{ row }">
          <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
          <el-button link type="primary" @click="handleStock(row)">库存</el-button>
          <el-button 
            link 
            :type="row.status === 1 ? 'danger' : 'primary'"
            @click="handleStatus(row)"
          >
            {{ row.status === 1 ? '下架' : '上架' }}
          </el-button>
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
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const searchKeyword = ref('')
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const productList = ref([])

const handleAdd = () => {
  // 实现新增商品逻辑
}

const handleEdit = (row: any) => {
  // 实现编辑商品逻辑
}

const handleStock = (row: any) => {
  // 实现库存管理逻辑
}

const handleStatus = (row: any) => {
  // 实现商品上下架逻辑
}
</script>

<style scoped>
.points-exchange-products {
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
</style>