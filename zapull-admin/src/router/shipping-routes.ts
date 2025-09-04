import { RouteRecordRaw } from 'vue-router'

export const shippingRoutes: RouteRecordRaw[] = [
  {
    path: '/shipping',
    component: () => import('@/views/shipping/index.vue'),
    meta: {
      title: '物流管理',
      icon: 'truck',
      roles: ['admin', 'shipping_manager']
    }
  },
  {
    path: '/shipping/new',
    component: () => import('@/views/shipping/new-index.vue'),
    meta: {
      title: '物流管理(新)',
      icon: 'truck',
      roles: ['admin', 'shipping_manager']
    }
  },
  {
    path: '/shipping/detail/:userId/:requestId',
    component: () => import('@/views/shipping/detail.vue'),
    meta: {
      title: '物流详情',
      icon: 'truck',
      roles: ['admin', 'shipping_manager'],
      activeMenu: '/shipping/new'
    }
  }
]