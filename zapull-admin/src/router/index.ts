import { createRouter, createWebHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'
import Layout from '@/layouts/AdminLayout.vue'
import menus from './menus'

const routes: Array<RouteRecordRaw> = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/login/index.vue'),
    meta: { title: '登录', hidden: true }
  },
  {
    path: '/',
    component: Layout,
    redirect: (to) => {
      // 检查是否已登录（需要同时有token和Google用户ID）
      const token = localStorage.getItem('token')
      const googleUserId = localStorage.getItem('googleUserId')
      return (token && googleUserId) ? '/card-packs/list' : '/login'
    }
  },
  {
    path: '/system',
    component: Layout,
    redirect: '/system/users',
    meta: { title: '系统管理', icon: 'Setting', hidden: true },
    children: [
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/views/system/users/index.vue'),
        meta: { title: '用户管理', hidden: true }
      },
      {
        path: 'roles',
        name: 'Roles',
        component: () => import('@/views/system/roles/index.vue'),
        meta: { title: '角色管理', hidden: true }
      },
      {
        path: 'permissions',
        name: 'Permissions',
        component: () => import('@/views/system/permissions/index.vue'),
        meta: { title: '权限管理', hidden: true }
      }
    ]
  },
  {
    path: '/user',
    component: Layout,
    redirect: '/user/profile',
    meta: { title: '个人中心', icon: 'User', hidden: true },
    children: [
      {
        path: 'profile',
        name: 'Profile',
        component: () => import('@/views/user/profile/index.vue'),
        meta: { title: '个人信息', hidden: true }
      }
    ]
  },

  {
    path: '/points-exchange',
    component: Layout,
    redirect: '/points-exchange/products',
    meta: { title: '积分兑换', icon: 'ShoppingCart', hidden: true },
    children: [
      {
        path: 'products',
        name: 'PointsExchangeProducts',
        component: () => import('@/views/points-exchange/products/index.vue'),
        meta: { title: '兑换商品列表', hidden: true }
      },
      {
        path: 'inventory',
        name: 'PointsExchangeInventory',
        component: () => import('@/views/points-exchange/inventory/index.vue'),
        meta: { title: '库存管理', hidden: true }
      }
    ]
  },
  {
    path: '/rankings',
    component: Layout,
    redirect: '/rankings/list',
    meta: { title: '排行榜管理', icon: 'TrendCharts', hidden: true },
    children: [
      {
        path: 'list',
        name: 'RankingsList',
        component: () => import('@/views/rankings/list.vue'),
        meta: { title: '数据查询', hidden: true }
      }
    ]
  },
  {    path: '/payment',
    component: Layout,
    redirect: '/payment/orders',
    meta: { title: '支付与充值', icon: 'Money', hidden: true },
    children: [
      {
        path: 'orders',
        name: 'PaymentOrders',
        component: () => import('@/views/payment/orders.vue'),
        meta: { title: '订单列表', hidden: true }
      }
    ]
  },

  {
    path: '/card-packs',
    component: Layout,
    redirect: '/card-packs/list',
    meta: { title: '卡牌管理', icon: 'Collection' },
    children: [
      {
        path: 'list',
        name: 'CardPacksList',
        component: () => import('@/views/storage/index.vue'), // 修改为已存在的卡片管理组件
        meta: { title: '卡牌列表' }
      }
    ]
  },
  {
    path: '/card-synthesis',
    component: Layout,
    redirect: '/card-synthesis/recipes',
    meta: { title: '卡牌合成', icon: 'MagicStick' },
    children: [
      {
        path: 'recipes',
        name: 'CardSynthesisRecipes',
        component: () => import('@/views/card-synthesis/recipes.vue'),
        meta: { title: '配方管理' }
      },
      {
        path: 'requests',
        name: 'CardSynthesisRequests',
        component: () => import('@/views/card-synthesis/requests.vue'),
        meta: { title: '合成请求列表' }
      }
    ]
  },
  {
    path: '/storage',
    component: Layout,
    redirect: '/storage/cards',
    meta: { title: '卡片存储管理', icon: 'Folder' },
    children: [
      {
        path: 'cards',
        name: 'StorageCards',
        component: () => import('@/views/storage/index.vue'),
        meta: { title: '卡片管理' }
      },
      {
        path: 'collections',
        name: 'StorageCollections',
        component: () => import('@/views/storage/collections.vue'),
        meta: { title: '卡片分类管理' }
      },
      {
        path: 'packs',
        name: 'StoragePacks',
        component: () => import('@/views/storage/packs/index.vue'),
        meta: { title: '卡包管理' }
      },
      {
        path: 'packs/create',
        name: 'StoragePacksCreate',
        component: () => import('@/views/storage/packs/create.vue'),
        meta: { title: '创建卡包', activeMenu: '/storage/packs' }
      },
      {
        path: 'packs/:id',
        name: 'StoragePacksDetail',
        component: () => import('@/views/storage/packs/detail.vue'),
        meta: { title: '卡包详情', activeMenu: '/storage/packs' }
      }
    ]
  },
  // 添加市场管理路由
  {
    path: '/marketplace',
    component: Layout,
    redirect: '/marketplace',
    meta: { title: '市场管理', icon: 'ShoppingBag' },
    children: [
      {
        path: '',
        name: 'Marketplace',
        component: () => import('@/views/marketplace/index.vue'),
        meta: { title: '官方市场' }
      }
    ]
  },
  // 添加成就管理路由
  {
    path: '/achievements',
    component: Layout,
    redirect: '/achievements',
    meta: { title: '成就管理', icon: 'Trophy' },
    children: [
      {
        path: '',
        name: 'Achievements',
        component: () => import('@/views/achievements/index.vue'),
        meta: { title: '成就列表' }
      }
    ]
  },

  // 添加物流管理路由
  {
    path: '/shipping',
    component: Layout,
    redirect: '/shipping',
    meta: { title: '物流管理', icon: 'Van' },
    children: [
      {
        path: '',
        name: 'Shipping',
        component: () => import('@/views/shipping/index.vue'),
        meta: { title: '物流信息' }
      }
    ]
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// 路由守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  const appTitle = import.meta.env.VITE_APP_TITLE || 'Boxed Admin'
  document.title = to.meta.title as string || appTitle

  // 检查是否已登录（需要同时有token和Google用户ID）
  const token = localStorage.getItem('token')
  const googleUserId = localStorage.getItem('googleUserId')
  const isAuthenticated = token && googleUserId

  // 如果访问的不是登录页面且未登录，则重定向到登录页面
  if (to.path !== '/login' && !isAuthenticated) {
    // 清除可能存在的不完整认证信息
    localStorage.removeItem('token')
    localStorage.removeItem('googleUserId')
    next('/login')
  } else {
    next()
  }
})

export default router