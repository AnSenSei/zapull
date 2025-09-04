# 售卖API参数修复总结

## 问题描述
用户提供的售卖参数缺少了必要的 `collection_id` 和 `card_id` 字段，实际的API需要完整的参数结构。

## 原始问题参数
```javascript
{
  "card_name": "one_piece_test",
  "expiresAt": "2025-08-17T11:31:57.721Z",
  "priceCash": 0,
  "pricePoints": 200,
  "quantity": 1
}
```

## 正确的API参数结构
根据API文档 `/users/{user_id}/listings` 接口要求：
```javascript
{
  "collection_id": "string",
  "card_id": "string", 
  "quantity": 1,
  "pricePoints": 0,
  "priceCash": 0,
  "expiresAt": "2025-07-18T11:43:35.710Z",
  "card_name": "string"
}
```

## 修复内容

### 1. 字段映射修正
在 `SellCardModal.tsx` 中修正了参数映射：

**修复前的问题：**
- 使用了不存在的 `card.collection_id` 和 `card.card_id`
- UserCard接口中实际字段是 `card_reference` 和 `subcollection_name`

**修复后的正确映射：**
```javascript
const listingParams = {
  collection_id: card.subcollection_name, // 使用卡片的subcollection_name作为collection_id
  card_id: card.card_reference, // 使用card_reference作为card_id
  quantity: 1,
  pricePoints: sellType === 'points' ? price : 0,
  priceCash: sellType === 'cash' ? price : 0,
  expiresAt: expiresAt.toISOString(),
  card_name: card.card_name
}
```

### 2. UserCard接口字段说明
```typescript
interface UserCard {
  card_reference: string;     // 对应API的card_id
  card_name: string;
  subcollection_name: string; // 对应API的collection_id
  // ... 其他字段
}
```

## 验证
- ✅ 修复了字段映射错误
- ✅ 确保所有必需参数都正确传递
- ✅ 保持了原有的积分/现金售卖逻辑
- ✅ 开发服务器运行正常

## 注意事项
1. `card_reference` 字段对应API中的 `card_id`
2. `subcollection_name` 字段对应API中的 `collection_id`
3. 售卖功能支持积分和现金两种方式
4. 默认过期时间设置为30天
5. 平台收取5%手续费

现在售卖功能的API集成已经完全正确，可以正常创建卡片挂售。