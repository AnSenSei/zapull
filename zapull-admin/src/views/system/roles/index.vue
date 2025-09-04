<template>
  <div class="roles-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>角色列表</span>
          <el-button type="primary" @click="handleAdd">新增角色</el-button>
        </div>
      </template>

      <el-table :data="tableData" style="width: 100%">
        <el-table-column prop="id" label="ID" width="80" />
        <el-table-column prop="name" label="角色名称" />
        <el-table-column prop="code" label="角色标识" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="操作" width="250">
          <template #default="{ row }">
            <el-button-group>
              <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
              <el-button type="success" link @click="handlePermissions(row)">权限设置</el-button>
              <el-button type="danger" link @click="handleDelete(row)">
                <el-icon><Delete /></el-icon>
                删除
              </el-button>
            </el-button-group>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Delete } from '@element-plus/icons-vue'

const tableData = ref([
  {
    id: 1,
    name: '超级管理员',
    code: 'SUPER_ADMIN',
    description: '系统最高权限角色'
  },
  {
    id: 2,
    name: '普通管理员',
    code: 'ADMIN',
    description: '一般管理权限'
  }
  // 添加更多模拟数据...
])

const handleAdd = () => {
  // 实现新增角色逻辑
}

const handleEdit = (_row: any) => {
  // 实现编辑角色逻辑
}

const handlePermissions = (_row: any) => {
  // 实现权限设置逻辑
}

const handleDelete = (_row: any) => {
  // 实现删除角色逻辑
}
</script>

<style scoped lang="scss">
.roles-container {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>