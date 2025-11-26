// 市场相关API接口
import request from '../utils/request'

// 卡片类型定义
export interface MarketplaceCard {
  id: string
  card_name: string
  rarity: number
  point_worth: number
  date_got_in_stock: string
  image_url: string
  quantity: number
  condition: string
  used_in_fusion: any[]
  pricePoints: number
  priceCash: number  // This field is now returned by the API
}

// 市场列表响应类型
export interface MarketplaceListResponse {
  status: string
  message: string
  data: {
    cards: MarketplaceCard[]
    pagination: {
      total_items: number
      total_pages: number
      current_page: number
      per_page: number
    }
    filters: {
      sort_by: string
      sort_order: string
      search_query: string | null
    }
  }
}

// 获取市场列表
export const getMarketplaceList = async (
  params: {
    collection_id: string
    page?: number
    per_page?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    search_query?: string
  }
): Promise<MarketplaceListResponse> => {
  return request.get('/marketplace/official_listings', { params })
}

// 更新市场列表项
export interface UpdateMarketplaceItemParams {
  collection_id: string
  card_id: string
  priceCash: number
  type: string
}

export const updateMarketplaceItem = async (params: UpdateMarketplaceItemParams): Promise<any> => {
  // Backend expects query parameters, not body
  return request.put('/marketplace/official_listing', null, { params })
}

// 新增市场列表项
export interface AddMarketplaceItemParams {
  collection_id: string
  card_id: string
  quantity?: number
  priceCash: number
  type: string
}

export const addMarketplaceItem = async (params: AddMarketplaceItemParams): Promise<any> => {
  // Backend expects query parameters, not body
  return request.post('/marketplace/official_listing', null, { params })
}

// 修改单个数量
export interface UpdateMarketplaceQuantityParams {
  collection_id: string
  card_id: string
  quantity: number
}

export const updateMarketplaceQuantity = async (params: UpdateMarketplaceQuantityParams): Promise<any> => {
  // Backend expects query parameters, not body
  return request.post('/marketplace/official_listing', null, { params })
}

// 修改用户的购买数量
export interface UpdateUserBuyoutParams {
  user_id: string
  collection_id: string
  card_id: string
  quantity: number
}

export const updateUserBuyout = async (userId: string, params: Omit<UpdateUserBuyoutParams, 'user_id'>): Promise<any> => {
  return request.post(`/marketplace/buy_out/${userId}`, params)
}

// 撤下商品（从官方市场移除）
export interface WithdrawMarketplaceItemParams {
  collection_id: string
  card_id: string
}

export const withdrawMarketplaceItem = async (params: WithdrawMarketplaceItemParams): Promise<any> => {
  // Backend expects query parameters, not body
  return request.delete('/marketplace/official_listing', { params })
}