<template>
  <div class="dashboard-container">


    <!-- 统计信息 -->
    <div class="stats-grid">
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon card-icon">
            <el-icon><Collection /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalCards }}</div>
            <div class="stat-label">总卡片数</div>
          </div>
        </div>
      </el-card>
      
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon pack-icon">
            <el-icon><Present /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalPacks }}</div>
            <div class="stat-label">总卡包数</div>
          </div>
        </div>
      </el-card>
      
      <el-card class="stat-card">
        <div class="stat-content">
          <div class="stat-icon achievement-icon">
            <el-icon><Trophy /></el-icon>
          </div>
          <div class="stat-info">
            <div class="stat-value">{{ stats.totalAchievements }}</div>
            <div class="stat-label">总成就数</div>
          </div>
        </div>
      </el-card>
      

    </div>

    <!-- 快速操作 -->
    <el-card class="quick-actions">
      <template #header>
        <span>快速操作</span>
      </template>
      
      <div class="action-grid">

        <el-button type="success" @click="$router.push('/storage/cards')">
          <el-icon><Collection /></el-icon>
          管理卡片
        </el-button>
        <el-button type="warning" @click="$router.push('/achievements')">
          <el-icon><Trophy /></el-icon>
          管理成就
        </el-button>
        <el-button type="info" @click="$router.push('/marketplace')">
          <el-icon><ShoppingBag /></el-icon>
          管理市场
        </el-button>
      </div>
    </el-card>


  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Collection, Present, Trophy, ShoppingBag } from '@element-plus/icons-vue'

// 响应式数据

// 统计数据
const stats = reactive({
  totalCards: 0,
  totalPacks: 0,
  totalAchievements: 0
})



// 获取模拟统计数据
const fetchStats = async () => {
  // 这里可以调用实际的API获取统计数据
  // 目前使用模拟数据
  stats.totalCards = Math.floor(Math.random() * 1000) + 500
  stats.totalPacks = Math.floor(Math.random() * 100) + 50
  stats.totalAchievements = Math.floor(Math.random() * 50) + 20
}

// 工具函数
const getTypeLabel = (type: string) => {
  const labels: Record<string, string> = {
    card: '卡片',
    pack: '卡包',
    achievement: '成就',
    other: '其他'
  }
  return labels[type] || type
}

const getTypeTagType = (type: string) => {
  const types: Record<string, string> = {
    card: 'primary',
    pack: 'success',
    achievement: 'warning',
    other: 'info'
  }
  return types[type] || 'info'
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('zh-CN')
}

// 页面加载时获取数据
onMounted(() => {
  fetchStats()
})
</script>

<style scoped lang="scss">
.dashboard-container {
  
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 20px;
    
    .stat-card {
      .stat-content {
        display: flex;
        align-items: center;
        
        .stat-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-right: 16px;
          
          .el-icon {
            font-size: 24px;
            color: white;
          }
          
          &.card-icon {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          
          &.pack-icon {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          }
          
          &.achievement-icon {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
          }
          

        }
        
        .stat-info {
          .stat-value {
            font-size: 24px;
            font-weight: 600;
            color: #303133;
            margin-bottom: 4px;
          }
          
          .stat-label {
            font-size: 14px;
            color: #909399;
          }
        }
      }
    }
  }
  
  .quick-actions {
    .action-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      
      .el-button {
        height: 48px;
        
        .el-icon {
          margin-right: 8px;
        }
      }
    }
  }
  

}
</style>