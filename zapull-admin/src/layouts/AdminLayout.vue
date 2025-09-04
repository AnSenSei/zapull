<template>
  <el-container class="layout-container">
    <el-aside width="200px">
      <el-menu
        :default-active="route.path"
        class="el-menu-vertical"
        :collapse="isCollapse"
        router
      >
        <template v-for="menu in menus" :key="menu.path">
          <!-- 没有子菜单且不隐藏的情况 -->
          <el-menu-item v-if="!menu.children && menu.meta && !menu.meta.hidden" :index="menu.path">
            <el-icon v-if="menu.icon">
              <component :is="icons[menu.icon]" />
            </el-icon>
            <template #title>{{ menu.meta.title }}</template>
          </el-menu-item>

          <!-- 有子菜单且不隐藏的情况 -->
          <el-sub-menu v-else-if="menu.children && menu.meta && !menu.meta.hidden" :index="menu.path">
            <template #title>
              <el-icon v-if="menu.icon">
                <component :is="icons[menu.icon]" />
              </el-icon>
              <span>{{ menu.meta.title }}</span>
            </template>

            <el-menu-item
              v-for="child in menu.children"
              :key="child.path"
              :index="child.path"
            >
              <el-icon v-if="child.icon">
                <component :is="icons[child.icon]" />
              </el-icon>
              {{ child.meta.title }}
            </el-menu-item>
          </el-sub-menu>
        </template>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header>
        <div class="header-left">
          <el-button @click="toggleSidebar">
            <el-icon><Fold v-if="!isCollapse" /><Expand v-else /></el-icon>
          </el-button>

          <Breadcrumb class="ml-4" />
        </div>
        <div class="header-right">
          <el-dropdown>
            <span class="user-dropdown">
              管理员 <el-icon><CaretBottom /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="handleLogout">退出登录</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main>
        <!-- 移除这一行 -->
        <keep-alive>
          <router-view v-if="$route.meta.keepAlive !== false"></router-view>
        </keep-alive>
        <router-view v-if="$route.meta.keepAlive === false"></router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import Breadcrumb from '../components/Breadcrumb.vue'
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import menus from '../router/menus'
import {
  DataLine,
  Setting,
  Document,
  Fold,
  Expand,
  CaretBottom,
  Present,
  ShoppingCart,
  TrendCharts,
  Money,
  Collection,
  Medal,
  Van,
  User,
  Lock,
  Folder,
  ShoppingBag,
  Trophy,
  MagicStick,
  Delete
} from '@element-plus/icons-vue'

// 注册图标组件
const icons = {
  DataLine,
  Setting,
  Document,
  Fold,
  Expand,
  CaretBottom,
  Present,
  ShoppingCart,
  TrendCharts,
  Money,
  Collection,
  Medal,
  Van,
  User,
  Lock,
  Folder,
  ShoppingBag,
  Trophy,
  MagicStick,
  Delete
}

const route = useRoute()
const router = useRouter()
const isCollapse = ref(false)

const toggleSidebar = () => {
  isCollapse.value = !isCollapse.value
}

// 退出登录
const handleLogout = () => {
  // 清除所有认证信息
  localStorage.removeItem('token')
  localStorage.removeItem('googleUserId')
  ElMessage.success('已退出登录')
  router.push('/login')
}
</script>

<style scoped lang="scss">
.header-left {
    display: flex;
    align-items: center;
}
.layout-container {
  height: 100vh;

  .el-aside {
    transition: width 0.3s;

    .el-menu {
      border-right: none;
    }
  }

  .el-header {
    background-color: #fff;
    border-bottom: 1px solid #dcdfe6;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 20px;

    .user-dropdown {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 8px;
    }
  }

  .el-main {
    background-color: #f0f2f5;
    padding: 20px;
  }
}

.el-menu-vertical:not(.el-menu--collapse) {
  width: 200px;
}
.ml-4 {
  margin-left: 16px;
}
</style>