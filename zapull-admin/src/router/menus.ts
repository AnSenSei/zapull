const menus = [
  {
    path: '/system',
    meta: { title: '系统管理' },
    icon: 'Setting',
    children: [
      {
        path: '/system/users',
        meta: { title: '用户管理' },
        icon: 'User'
      }
    ]
  },

  {
    path: '/points-exchange',
    meta: { title: '积分兑换', hidden: true },
    icon: 'ShoppingCart',
    children: [
      {
        path: '/points-exchange/products',
        meta: { title: '兑换商品列表', hidden: true },
        icon: 'ShoppingCart'
      },
      {
        path: '/points-exchange/inventory',
        meta: { title: '库存管理', hidden: true },
        icon: 'Collection'
      }
    ]
  },
  {
    path: '/rankings',
    meta: { title: '排行榜管理', hidden: true },
    icon: 'TrendCharts',
    children: [
      {
        path: '/rankings/list',
        meta: { title: '数据查询', hidden: true },
        icon: 'TrendCharts'
      }
    ]
  },
  {
    path: '/payment',
    meta: { title: '支付与充值', hidden: true },
    icon: 'Money',
    children: [
      {
        path: '/payment/orders',
        meta: { title: '订单列表', hidden: true },
        icon: 'Money'
      }
    ]
  },

  {
    path: '/card-packs',
    meta: { title: '卡牌管理' },
    icon: 'Collection',
    children: [
      {
        path: '/card-packs/list',
        meta: { title: '卡牌列表' },
        icon: 'Collection'
      }
    ]
  },
  {
    path: '/card-synthesis',
    meta: { title: '卡牌合成' },
    icon: 'MagicStick',
    children: [
      {
        path: '/card-synthesis/recipes',
        meta: { title: '配方管理' },
        icon: 'Document'
      }
      // {
      //   path: '/card-synthesis/requests',
      //   meta: { title: '合成请求列表' },
      //   icon: 'TrendCharts'
      // }
    ]
  },
  // 在菜单配置中添加卡片存储管理菜单
  {
    path: '/storage',
    meta: { title: '卡片存储管理' },
    icon: 'Folder',
    children: [
      {
        path: '/storage/cards',
        meta: { title: '卡片管理' },
        icon: 'Collection'
      },
      {
        path: '/storage/collections',
        meta: { title: '卡片分类管理' },
        icon: 'Folder'
      },
      {
        path: '/storage/packs',
        meta: { title: '卡包管理' },
        icon: 'Present'
      }
    ]
  },
  // 添加市场管理菜单
  {
    path: '/marketplace',
    meta: { title: '市场管理' },
    icon: 'ShoppingBag',
    children: [
      {
        path: '/marketplace',
        meta: { title: '官方市场' },
        icon: 'ShoppingCart'
      }
    ]
  },
  // 添加成就管理菜单
  {
    path: '/achievements',
    meta: { title: '成就管理' },
    icon: 'Trophy',
    children: [
      {
        path: '/achievements',
        meta: { title: '成就列表' },
        icon: 'Medal'
      }
    ]
  },

  // 添加物流管理菜单
  {
    path: '/shipping',
    meta: { title: '物流管理' },
    icon: 'Van',
    children: [
      {
        path: '/shipping',
        meta: { title: '物流信息' },
        icon: 'Van'
      }
    ]
  },
  // 虚拟用户管理
  {
    path: '/virtual-user',
    meta: { title: '虚拟用户管理' },
    icon: 'UserFilled',
    children: [
      {
        path: '/virtual-user/draw',
        meta: { title: '模拟抽卡' },
        icon: 'MagicStick'
      },
      {
        path: '/virtual-user/manage',
        meta: { title: '用户管理' },
        icon: 'User'
      }
    ]
  }
]

export default menus
