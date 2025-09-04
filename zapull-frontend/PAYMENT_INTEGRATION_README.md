# 支付系统集成文档

本文档描述了基于 Stripe 的支付系统集成，包括用户充值、市场交易支付、支付方式管理等功能。

## 📁 文件结构

```
src/
├── lib/
│   ├── paymentApi.ts          # 支付API接口定义
│   ├── stripeIntegration.ts   # Stripe集成工具函数
│   └── authUtils.ts           # 认证工具函数
├── components/
│   ├── PointsTopUpModal.tsx   # 积分充值模态框
│   └── CreditCardModal.tsx    # 信用卡支付模态框
└── pages/
    ├── payment-success.tsx    # 支付成功页面
    ├── payment-methods.tsx    # 支付方式管理页面
    └── payment-example.tsx    # 支付示例页面
```

## 🚀 主要功能

### 1. 用户充值流程

#### 简化流程（推荐）
```typescript
import { processRechargePayment } from '@/lib/stripeIntegration';

// 直接处理充值支付
await processRechargePayment({
  amount: 10.00,  // 美元金额
  referCode: 'REF123',  // 可选的推荐码
  returnUrl: `${window.location.origin}/payment-success`,
  onSuccess: () => {
    console.log('支付成功');
  },
  onError: (error) => {
    console.error('支付失败:', error);
  }
});
```

#### 详细流程
1. 用户选择充值套餐
2. 调用 `createPaymentIntent` 创建支付意图
3. 重定向到 Stripe 支付页面
4. 用户完成支付
5. 重定向回 `payment-success` 页面
6. 验证支付状态并更新用户积分

### 2. 市场交易支付

```typescript
import { processMarketplacePayment } from '@/lib/stripeIntegration';

// 处理市场交易支付
await processMarketplacePayment({
  listingId: 'listing_123',
  buyerAddressId: 'addr_456',
  offerId: 'offer_789',  // 可选，用于接受报价
  returnUrl: `${window.location.origin}/payment-success`,
  onSuccess: () => {
    console.log('交易支付成功');
  },
  onError: (error) => {
    console.error('交易支付失败:', error);
  }
});
```

### 3. 支付方式管理

```typescript
import { 
  getUserPaymentMethods, 
  addPaymentMethod, 
  removePaymentMethod 
} from '@/lib/stripeIntegration';

// 获取用户支付方式
const methods = await getUserPaymentMethods();

// 添加支付方式
await addPaymentMethod('pm_1234567890', {
  setAsDefault: true,
  onSuccess: () => console.log('添加成功'),
  onError: (error) => console.error('添加失败:', error)
});

// 删除支付方式
await removePaymentMethod('pm_1234567890');
```

### 4. 充值历史查询

```typescript
import { getUserRechargeHistory } from '@/lib/stripeIntegration';

// 获取充值历史
const history = await getUserRechargeHistory();
console.log('充值记录:', history.records);
```

## 🔧 API 接口

### 支付相关接口

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 创建支付意图 | POST | `/users/{user_id}/payment/create-intent` | 创建用户充值支付意图 |
| 创建市场支付意图 | POST | `/users/{user_id}/payment/marketplace/create-intent` | 创建市场交易支付意图 |
| 获取充值历史 | GET | `/users/{user_id}/payment/recharge-history` | 获取用户充值记录 |
| 检查支付状态 | GET | `/payment/status/{payment_intent_id}` | 检查支付意图状态 |

### 支付方式管理接口

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 获取支付方式 | GET | `/users/{user_id}/payment/methods` | 获取用户支付方式列表 |
| 添加支付方式 | POST | `/users/{user_id}/payment/methods` | 添加新的支付方式 |
| 删除支付方式 | DELETE | `/users/{user_id}/payment/methods/{payment_method_id}` | 删除指定支付方式 |

### Stripe Connect 接口

| 接口 | 方法 | 路径 | 描述 |
|------|------|------|------|
| 创建 Connect 账户 | POST | `/users/{user_id}/stripe/connect/create` | 创建 Stripe Connect 账户 |
| 获取 Connect 状态 | GET | `/users/{user_id}/stripe/connect/status` | 获取账户状态 |
| 获取仪表盘链接 | GET | `/users/{user_id}/stripe/connect/dashboard` | 获取仪表盘登录链接 |
| 获取税务状态 | GET | `/users/{user_id}/stripe/connect/tax-status` | 获取税务信息状态 |
| 更新税务同意 | POST | `/users/{user_id}/stripe/connect/tax-consent` | 更新税务同意状态 |

## 🎨 UI 组件

### PointsTopUpModal
积分充值模态框，支持：
- 套餐选择
- 推荐码输入
- 直接跳转到 Stripe 支付页面
- 备用信用卡表单（当 Stripe 支付失败时）

### CreditCardModal
信用卡支付模态框，支持：
- 信用卡信息输入
- 表单验证
- 支付处理

### PaymentMethodsPage
支付方式管理页面，支持：
- 查看已保存的支付方式
- 删除支付方式
- 查看充值历史

### PaymentSuccessPage
支付成功页面，支持：
- 自动检查支付状态
- 显示支付结果
- 处理不同的支付状态（成功、处理中、失败）

## 🔒 安全考虑

1. **API 密钥管理**
   - Stripe 公钥存储在前端代码中
   - Stripe 私钥必须存储在后端环境变量中
   - 不要在前端代码中暴露敏感信息

2. **用户认证**
   - 所有支付相关操作都需要用户认证
   - 使用 `getCurrentUserId()` 获取当前用户ID
   - 后端需要验证用户身份和权限

3. **支付验证**
   - 支付完成后必须在后端验证支付状态
   - 使用 Stripe Webhook 处理支付事件
   - 防止重复处理同一支付

## 🛠️ 开发指南

### 环境配置

1. 安装依赖：
```bash
npm install @stripe/stripe-js
```

2. 配置环境变量：
```env
# .env.local
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### 测试

1. 使用 Stripe 测试卡号：
   - 成功支付：`4242424242424242`
   - 失败支付：`4000000000000002`
   - 需要验证：`4000002500003155`

2. 测试流程：
   - 启动开发服务器：`npm run dev`
   - 访问 `/payment-example` 测试充值流程
   - 访问 `/payment-methods` 测试支付方式管理

### 部署注意事项

1. **生产环境配置**
   - 使用生产环境的 Stripe 密钥
   - 配置正确的 Webhook 端点
   - 设置正确的返回 URL

2. **监控和日志**
   - 监控支付成功率
   - 记录支付错误日志
   - 设置支付异常告警

## 📝 更新日志

### v2.0.0 (当前版本)
- ✅ 重构支付 API，符合最新接口规范
- ✅ 简化支付流程，直接跳转到 Stripe 支付页面
- ✅ 新增 Stripe Connect 支持
- ✅ 新增支付方式管理功能
- ✅ 新增充值历史查询
- ✅ 优化错误处理和用户体验
- ✅ 移除冗余的 `check-refer` 接口调用

### v1.0.0 (之前版本)
- 基础支付功能
- 信用卡表单支付
- 简单的支付意图创建

## 🤝 贡献指南

1. 遵循现有的代码风格
2. 添加适当的类型定义
3. 编写清晰的注释
4. 测试新功能
5. 更新相关文档

## 📞 支持

如有问题或建议，请：
1. 查看 Stripe 官方文档
2. 检查浏览器控制台错误
3. 查看服务器日志
4. 联系开发团队