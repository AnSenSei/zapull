<template>
  <div class="rankings-container">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="用户ID">
          <el-input v-model="searchForm.userId" placeholder="请输入用户ID" clearable />
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="searchForm.username" placeholder="请输入用户名" clearable />
        </el-form-item>
        <el-form-item label="排名类型">
          <el-select v-model="searchForm.type" placeholder="请选择排名类型" clearable>
            <el-option label="积分排名" value="points" />
            <el-option label="等级排名" value="rank" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column type="index" label="序号" width="80" />
        <el-table-column prop="userId" label="用户ID" width="120" />
        <el-table-column prop="username" label="用户名" width="150" />
        <el-table-column prop="points" label="积分" width="120" />
        <el-table-column prop="rank" label="等级" width="120" />
        <el-table-column prop="updateTime" label="更新时间" width="180" />
        <el-table-column label="操作" fixed="right" width="120">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleDetail(row)">查看详情</el-button>
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
  userId: '',
  username: '',
  type: ''
})

// 表格数据
const tableData = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

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
  searchForm.userId = ''
  searchForm.username = ''
  searchForm.type = ''
  handleSearch()
}

// 查看详情
const handleDetail = (row: any) => {
  console.log('查看详情', row)
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
.rankings-container {
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