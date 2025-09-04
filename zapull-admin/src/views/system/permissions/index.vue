<template>
  <div class="permissions-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>权限列表</span>
          <el-button type="primary" @click="handleAdd">新增权限</el-button>
        </div>
      </template>

      <el-table
        :data="tableData"
        row-key="id"
        default-expand-all
        :tree-props="{ children: 'children' }"
      >
        <el-table-column prop="name" label="权限名称" />
        <el-table-column prop="code" label="权限标识" />
        <el-table-column prop="type" label="类型">
          <template #default="{ row }">
            <el-tag :type="row.type === 'menu' ? 'success' : 'info'">
              {{ row.type === 'menu' ? '菜单' : '按钮' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="path" label="路由路径" />
        <el-table-column label="操作" width="200">
          <template #default="{ row }">
            <el-button-group>
              <el-button type="primary" link @click="handleEdit(row)">编辑</el-button>
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
    name: '系统管理',
    code: 'system',
    type: 'menu',
    path: '/system',
    children: [
      {
        id: 2,
        name: '用户管理',
        code: 'system:user',
        type: 'menu',
        path: '/system/users',
        children: [
          {
            id: 3,
            name: '新增用户',
            code: 'system:user:add',
            type: 'button',
            path: ''
          }
        ]
      }
    ]
  }
  // 添加更多模拟数据...
])

const handleAdd = () => {
  // 实现新增权限逻辑
}

const handleEdit = (_row: any) => {
  // 实现编辑权限逻辑
}

const handleDelete = (_row: any) => {
  // 实现删除权限逻辑
}
</script>

<style scoped lang="scss">
.permissions-container {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>