<template>
  <div class="profile-container">
    <el-row :gutter="20">
      <el-col :span="8">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>个人信息</span>
              <el-button type="primary" link @click="handleEdit">编辑</el-button>
            </div>
          </template>
          <div class="user-info">
            <div class="avatar-container">
              <el-avatar :size="100" :src="userInfo.avatar" />
              <h3 class="username">{{ userInfo.username }}</h3>
              <p class="role">{{ userInfo.role }}</p>
            </div>
            <el-descriptions direction="vertical" :column="1">
              <el-descriptions-item label="邮箱">{{ userInfo.email }}</el-descriptions-item>
              <el-descriptions-item label="手机">{{ userInfo.phone }}</el-descriptions-item>
              <el-descriptions-item label="部门">{{ userInfo.department }}</el-descriptions-item>
              <el-descriptions-item label="注册时间">{{ userInfo.createTime }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </el-card>
      </el-col>
      <el-col :span="16">
        <el-card>
          <template #header>
            <div class="card-header">
              <span>最近操作</span>
            </div>
          </template>
          <el-timeline>
            <el-timeline-item
              v-for="(activity, index) in activities"
              :key="index"
              :timestamp="activity.timestamp"
              :type="activity.type"
            >
              {{ activity.content }}
            </el-timeline-item>
          </el-timeline>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const userInfo = ref({
  username: '管理员',
  role: '超级管理员',
  avatar: 'https://placeholder.com/150',
  email: 'admin@example.com',
  phone: '13800138000',
  department: '技术部',
  createTime: '2024-01-01'
})

const activities = ref([
  {
    content: '更新了系统配置',
    timestamp: '2024-01-15 12:00:00',
    type: 'primary'
  },
  {
    content: '新增用户权限',
    timestamp: '2024-01-14 15:30:00',
    type: 'success'
  },
  {
    content: '修改个人信息',
    timestamp: '2024-01-13 10:20:00',
    type: 'info'
  }
])

const handleEdit = () => {
  // 实现编辑功能
}
</script>

<style scoped lang="scss">
.profile-container {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .user-info {
    .avatar-container {
      text-align: center;
      margin-bottom: 20px;

      .username {
        margin: 10px 0 5px;
        font-size: 18px;
      }

      .role {
        color: #909399;
        font-size: 14px;
        margin: 0;
      }
    }
  }
}
</style>