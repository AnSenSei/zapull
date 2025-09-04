<template>
  <div class="user-cards-container">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="用户ID">
          <el-input v-model="searchForm.userId" placeholder="请输入用户ID" clearable />
        </el-form-item>
        <el-form-item label="卡牌名称">
          <el-input v-model="searchForm.cardName" placeholder="请输入卡牌名称" clearable />
        </el-form-item>
        <el-form-item label="卡牌品质">
          <el-select v-model="searchForm.quality" placeholder="请选择品质" clearable>
            <el-option label="普通" value="normal" />
            <el-option label="稀有" value="rare" />
            <el-option label="史诗" value="epic" />
            <el-option label="传说" value="legendary" />
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
        <el-table-column prop="userId" label="用户ID" width="120" />
        <el-table-column prop="cardName" label="卡牌名称" />
        <el-table-column prop="quality" label="品质" width="100">
          <template #default="{ row }">
            <el-tag :type="getQualityType(row.quality)">
              {{ getQualityText(row.quality) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="count" label="数量" width="100" />
        <el-table-column prop="obtainTime" label="获得时间" width="180" />
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleDetail(row)">查看详情</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
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
import { ElMessage, ElMessageBox } from 'element-plus'

// 搜索表单数据
const searchForm = reactive({
  userId: '',
  cardName: '',
  quality: ''
})

// 表格数据
const tableData = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 获取品质类型
const getQualityType = (quality: string) => {
  const qualityMap: Record<string, string> = {
    normal: 'info',
    rare: 'success',
    epic: 'warning',
    legendary: 'danger'
  }
  return qualityMap[quality] || 'info'
}

// 获取品质文本
const getQualityText = (quality: string) => {
  const qualityMap: Record<string, string> = {
    normal: '普通',
    rare: '稀有',
    epic: '史诗',
    legendary: '传说'
  }
  return qualityMap[quality] || quality
}

// 删除用户卡牌
const handleDelete = (row: any) => {
  ElMessageBox.confirm('确定要删除该用户卡牌吗？删除后无法恢复！', '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      // TODO: 调用删除用户卡牌API
      // await deleteUserCard(row.id, row.collectionMetadataId)
      
      ElMessage.success('删除成功')
      // 重新加载数据
      handleSearch()
    } catch (error) {
      console.error('删除失败:', error)
      ElMessage.error('删除失败')
    }
  }).catch(() => {
    // 取消删除操作
  })
}

// 查看详情
const handleDetail = (row: any) => {
  // TODO: 实现查看详情逻辑
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
  searchForm.userId = ''
  searchForm.cardName = ''
  searchForm.quality = ''
  handleSearch()
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
.user-cards-container {
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