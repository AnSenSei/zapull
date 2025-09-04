# 现金出售和积分出售API接口集成总结

## 概述
本文档总结了现金出售和积分出售功能的API接口集成情况，包括已实现的功能和相关接口说明。

## 已实现的功能

### 1. 卡片挂售功能
- **接口**: `POST /users/{user_id}/listings`
- **功能**: 创建新的卡片挂售
- **支持**: 积分出售和现金出售
- **实现位置**: `SellCardModal.tsx` 中的 `handleSell` 函数

#### 请求参数
```javascript
{
  collection_id: string,
  card_id: string,
  quantity: number,
  pricePoints: number,  // 积分价格，现金出售时为0
  priceCash: number,    // 现金价格，积分出售时为0
  expiresAt: string,    // ISO格式的过期时间
  card_name: string
}
```

### 2. 用户挂售管理
- **获取挂售列表**: `GET /users/{user_id}/listings`
- **获取挂售详情**: `GET /users/{user_id}/listings/{listing_id}`
- **删除挂售**: `DELETE /users/{user_id}/listings/{listing_id}`

### 3. 报价系统
#### 积分报价
- **创建报价**: `POST /users/{user_id}/listings/{listing_id}/offers/points`
- **删除报价**: `DELETE /users/{user_id}/listings/{listing_id}/offers/points/{offer_id}`
- **更新报价**: `PUT /users/{user_id}/listings/{listing_id}/offers/points/{offer_id}`

#### 现金报价
- **创建报价**: `POST /users/{user_id}/listings/{listing_id}/offers/cash`
- **删除报价**: `DELETE /users/{user_id}/listings/{listing_id}/offers/cash/{offer_id}`
- **更新报价**: `PUT /users/{user_id}/listings/{listing_id}/offers/cash/{offer_id}`

### 4. 购买功能
#### 积分购买
- **通过报价购买**: `POST /users/{user_id}/listings/{listing_id}/offers/{offer_id}/pay`
- **直接购买**: `POST /users/{user_id}/listings/{listing_id}/pay_price_point`

#### 现金购买
- **直接购买**: `POST /users/{user_id}/listings/{listing_id}/pay_price_point`

### 5. 交易管理
- **接受最高报价**: `POST /users/{user_id}/listings/{listing_id}/accept`
- **获取买家交易记录**: `GET /users/{user_id}/transactions/buyer`
- **获取卖家交易记录**: `GET /users/{user_id}/transactions/seller`

## 前端集成实现

### SellCardModal组件
- 支持积分和现金两种出售方式
- 动态显示推荐价格（积分：卡片价值×0.9，现金：卡片价值×0.1）
- 实时计算手续费（5%平台费用）
- 集成用户认证和API调用

### 关键代码实现
```javascript
// 售卖处理函数
const handleSell = async () => {
  const listingParams = {
    collection_id: card.collection_id,
    card_id: card.card_id,
    quantity: 1,
    pricePoints: sellType === 'points' ? price : 0,
    priceCash: sellType === 'cash' ? price : 0,
    expiresAt: expiresAt.toISOString(),
    card_name: card.card_name
  }
  
  await marketplaceApi.updateUserListing(user.id, listingParams)
}
```

## API接口状态

### ✅ 已完成集成
1. 卡片挂售（积分/现金）
2. 获取用户挂售列表
3. 删除挂售
4. 创建积分/现金报价
5. 购买功能（积分/现金）
6. 交易记录查询

### 📝 注意事项
1. **现金购买接口**: API文档中现金购买使用的是 `pay_price_point` 接口，与积分购买相同
2. **积分购买方式**: 支持两种方式 - 通过报价购买和直接按标价购买
3. **过期时间**: 挂售默认设置为30天后过期
4. **手续费**: 平台收取5%的交易手续费

## 测试文件
创建了测试文件 `src/test/sellCardTest.js` 用于验证API集成的正确性，包括：
- 积分出售测试
- 现金出售测试
- 获取挂售列表测试

## 总结
现金出售和积分出售的API接口已完全集成到前端应用中。所有相关的接口都已在 `marketplaceApi.ts` 中实现，并在 `SellCardModal.tsx` 组件中成功集成。用户现在可以通过界面选择积分或现金出售方式，系统会自动调用相应的后端API完成挂售操作。