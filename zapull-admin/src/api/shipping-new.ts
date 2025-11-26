// 物流相关API接口 - 基于ai-study规范重构
import request from '../utils/request'

// 物流信息类型定义
export interface ShippingCard {
  card_reference: string
  card_name: string
  date_got: string
  id: string
  image_url: string
  point_worth: number
  quantity: number
  rarity: number
  locked_quantity: number
  expireAt: string | null
  buybackexpiresAt: string | null
  request_date: string | null
}

export interface ShippingAddress {
  zip: string
  city: string
  state: string
  country: string
  street: string
  name: string
  id: string
}

export interface ShippingInfo {
  id: string
  created_at: string
  request_date: string
  status: string
  user_id: string
  user_email: string
  card_count: number
  shipping_address: ShippingAddress
  shippo_address_id: string
  shippo_parcel_id: string
  shippo_shipment_id: string
  shippo_transaction_id: string
  shippo_label_url: string
  tracking_number: string
  tracking_url: string
  shipping_status: string
  card_status?: string
  is_active: boolean
  cards: ShippingCard[]
}

// 物流列表响应类型
export interface ShippingListResponse {
  withdraw_requests: ShippingInfo[]
  pagination: {
    next_cursor: string | null
    limit: number
    has_more: boolean
  }
}

// 获取物流列表
export const getShippingList = async (
  params: {
    limit?: number
    cursor?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }
): Promise<ShippingListResponse> => {
  return request.get('/shipping/withdraw-requests', { params })
}

// 获取未激活物流列表
export const getInactiveShippingList = async (
  params: {
    limit?: number
    cursor?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }
): Promise<ShippingListResponse> => {
  return request.get('/shipping/withdraw-requests/inactive', { params })
}

// 获取单个物流信息
export const getShippingDetail = async (userId: string, requestId: string): Promise<{ data: ShippingInfo }> => {
  return request.get(`/shipping/withdraw-requests/${userId}/${requestId}`)
}

// 修改物流状态
export interface UpdateShippingStatusParams {
  status: string
  card_status?: string
  tracking_number?: string
}

export const updateShippingStatus = async (
  userId: string,
  requestId: string,
  params: UpdateShippingStatusParams
): Promise<any> => {
  return request.put(`/shipping/withdraw-requests/${userId}/${requestId}/status`, params)
}

// 更新物流激活状态
export const updateShippingActiveStatus = async (
  userId: string,
  requestId: string,
  isActive: boolean
): Promise<any> => {
  return request.patch(`/shipping/withdraw-requests/${userId}/${requestId}/activate`, { is_active: isActive })
}

// 获取单个商店订单详情
export const getShopOrderDetail = async (userId: string, orderId: string): Promise<{ data: ShippingInfo }> => {
  return request.get(`/shipping/shop-orders/${userId}/${orderId}`)
}

// 更新商店订单状态
export const updateShopOrderStatus = async (
  userId: string,
  orderId: string,
  params: UpdateShippingStatusParams
): Promise<any> => {
  return request.put(`/shipping/shop-orders/${userId}/${orderId}/status`, params)
}


// 归档物流
export const archiveShipping = async (userId: string, requestId: string): Promise<any> => {
  return request.post(`/shipping/withdraw-requests/${userId}/${requestId}/archive`)
}

// 获取已归档物流列表
export const getArchivedShippingList = async (
  params: {
    limit?: number
    cursor?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    status?: string
    card_status?: string
  }
): Promise<ShippingListResponse> => {
  return request.get('/shipping/withdraw-requests/archived', { params })
}

// 取消归档物流
export const unarchiveShipping = async (userId: string, requestId: string): Promise<any> => {
  return request.post(`/shipping/withdraw-requests/${userId}/${requestId}/unarchive`)
}
