src/
  ├── app/                    # 应用路由
  │   ├── page.tsx            # 首页
  │   ├── detail/[id]/page.tsx # 详情页
  │   ├── auth/               # 用户认证
  │   │   ├── login/page.tsx
  │   │   ├── register/page.tsx
  │   │   └── forgot-password/page.tsx
  │   ├── synthesis/          # 合成系统
  │   │   └── page.tsx
  │   ├── shop/               # 商城
  │   │   └── page.tsx
  │   ├── points/             # 积分
  │   │   └── page.tsx
  │   ├── leaderboard/        # 排行榜
  │   │   └── page.tsx
  │   ├── purchase/           # 购买
  │   │   └── page.tsx
  │   ├── user/               # 用户中心
  │   │   ├── page.tsx
  │   │   ├── profile/page.tsx # 用户资料页
  │   │   ├── backpack/page.tsx # 背包
  │   │   ├── promotion/page.tsx # 推广系统
  │   │   └── settings/page.tsx # 设置
  │   ├── mail/               # 邮寄系统
  │   │   └── page.tsx
  │   └── info/               # 静态信息页
  │       ├── about/page.tsx
  │       ├── terms/page.tsx
  │       └── privacy/page.tsx
  ├── components/             # 共享组件
  │   ├── ui/                 # UI组件
  │   ├── layout/             # 布局组件
  │   └── features/           # 功能组件
  ├── lib/                    # 工具函数和库
  ├── hooks/                  # 自定义Hooks
  ├── context/                # 上下文状态管理
  ├── services/               # API服务
  ├── styles/                 # 全局样式
  └── types/                  # TypeScript类型定义
public/                       # 静态资源