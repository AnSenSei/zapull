<template>
  <div class="cache-container">
    <el-row :gutter="20">
      <el-col :span="8" v-for="item in cacheInfo" :key="item.type">
        <el-card class="cache-card">
          <template #header>
            <div class="card-header">
              <span>{{ item.title }}</span>
              <el-button type="danger" link @click="handleClear(item.type)">
                清除
              </el-button>
            </div>
          </template>
          <div class="cache-stats">
            <el-row>
              <el-col :span="12">
                <div class="stat-item">
                  <div class="label">已用空间</div>
                  <div class="value">{{ item.used }}</div>
                </div>
              </el-col>
              <el-col :span="12">
                <div class="stat-item">
                  <div class="label">键数量</div>
                  <div class="value">{{ item.keys }}</div>
                </div>
              </el-col>
            </el-row>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-card class="mt-4">
      <template #header>
        <div class="card-header">
          <span>缓存列表</span>
          <el-input
            v-model="searchKey"
            placeholder="搜索缓存键"
            style="width: 200px"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
        </div>
      </template>

      <el-table :data="cacheList" style="width: 100%">
        <el-table-column prop="key" label="缓存键" />
        <el-table-column prop="type" label="类型" width="100" />
        <el-table-column prop="size" label="大小" width="100" />
        <el-table-column prop="ttl" label="过期时间" width="180" />
        <el-table-column label="操作" width="150">
          <template #default="{ row }">
            <el-button-group>
              <el-button type="primary" link @click="handleView(row)">
                查看
              </el-button>
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
import { Search, Delete } from '@element-plus/icons-vue'

const cacheInfo = ref([
  {
    type: 'redis',
    title: 'Redis缓存',
    used: '1.2GB',
    keys: '1,234'
  },
  {
    type: 'memory',
    title: '内存缓存',
    used: '256MB',
    keys: '532'
  },
  {
    type: 'file',
    title: '文件缓存',
    used: '3.1GB',
    keys: '2,891'
  }
])

const searchKey = ref('')

const cacheList = ref([
  {
    key: 'user:profile:1',
    type: 'string',
    size: '1.2KB',
    ttl: '1小时'
  },
  {
    key: 'system:config',
    type: 'hash',
    size: '4.5KB',
    ttl: '永久'
  }
])

const handleClear = (_type: string) => {
  // 实现清除缓存功能
}

const handleView = (_row: any) => {
  // 实现查看缓存内容功能
}

const handleDelete = (_row: any) => {
  // 实现删除单个缓存功能
}
</script>

<style scoped lang="scss">
.cache-container {
  .cache-card {
    margin-bottom: 20px;

    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .cache-stats {
      .stat-item {
        text-align: center;
        padding: 10px;

        .label {
          color: #909399;
          font-size: 14px;
          margin-bottom: 5px;
        }

        .value {
          font-size: 20px;
          font-weight: bold;
          color: #303133;
        }
      }
    }
  }

  .mt-4 {
    margin-top: 20px;
  }
}
</style>