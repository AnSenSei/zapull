<template>
  <div class="materials-container">
    <el-card class="search-card">
      <div class="header-actions">
        <el-button type="primary" @click="handleAdd">新增材料</el-button>
      </div>
      <el-form :model="searchForm" inline class="mt-4">
        <el-form-item label="材料名称">
          <el-input v-model="searchForm.name" placeholder="请输入材料名称" clearable />
        </el-form-item>
        <el-form-item label="材料类型">
          <el-select v-model="searchForm.type" placeholder="请选择材料类型" clearable>
            <el-option label="基础材料" value="basic" />
            <el-option label="进阶材料" value="advanced" />
            <el-option label="稀有材料" value="rare" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-select v-model="searchForm.status" placeholder="请选择状态" clearable>
            <el-option label="启用" value="enabled" />
            <el-option label="禁用" value="disabled" />
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
        <el-table-column prop="name" label="材料名称" />
        <el-table-column prop="type" label="材料类型">
          <template #default="{ row }">
            <el-tag :type="getMaterialType(row.type)">
              {{ getMaterialText(row.type) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="description" label="描述" show-overflow-tooltip />
        <el-table-column prop="obtainMethod" label="获取方式" show-overflow-tooltip />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'enabled' ? 'success' : 'danger'">
              {{ row.status === 'enabled' ? '启用' : '禁用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link :type="row.status === 'enabled' ? 'danger' : 'success'" @click="handleToggleStatus(row)">
              {{ row.status === 'enabled' ? '禁用' : '启用' }}
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { deleteMaterial } from '@/api/fusion'

// 搜索表单数据
const searchForm = reactive({
  name: '',
  type: '',
  status: ''
})

// 表格数据
const tableData = ref([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 获取材料类型样式
const getMaterialType = (type: string) => {
  const typeMap: Record<string, string> = {
    basic: '',
    advanced: 'success',
    rare: 'warning'
  }
  return typeMap[type] || ''
}

// 获取材料类型文本
const getMaterialText = (type: string) => {
  const typeMap: Record<string, string> = {
    basic: '基础材料',
    advanced: '进阶材料',
    rare: '稀有材料'
  }
  return typeMap[type] || type
}

// 新增材料
const handleAdd = () => {
  // TODO: 实现新增材料逻辑
}

// 编辑材料
const handleEdit = (row: any) => {
  // TODO: 实现编辑材料逻辑
}

// 切换状态
const handleToggleStatus = (row: any) => {
  // TODO: 实现切换状态逻辑
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
  searchForm.name = ''
  searchForm.type = ''
  searchForm.status = ''
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
.materials-container {
  .search-card {
    margin-bottom: 16px;
  }

  .header-actions {
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