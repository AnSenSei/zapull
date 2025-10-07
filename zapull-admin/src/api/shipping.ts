// 物流相关API接口
import request from '../utils/request'

// 物流信息类型定义
export interface ShippingInfo {
  id: string
  order_id: string
  tracking_number: string
  carrier: string
  status: string
  estimated_delivery_date: string
  actual_delivery_date: string | null
  shipping_address: {
    recipient_name: string
    street_address: string
    city: string
    state: string
    postal_code: string
    country: string
    phone_number: string
  }
  created_at: string
  updated_at: string
}

// 物流列表响应类型
export interface ShippingListResponse {
  status: string
  message: string
  data: {
    shipments: ShippingInfo[]
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

// 获取物流列表
export const getShippingList = async (
  params: {
    page?: number
    per_page?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    search_query?: string
    status?: string
  }
): Promise<ShippingListResponse> => {
  return request.get('/shipping/shipments', { params })
}

// 获取单个物流信息
export const getShippingDetail = async (id: string): Promise<{ status: string, message: string, data: ShippingInfo }> => {
  return request.get(`/shipping/shipments/${id}`)
}

// 创建物流信息
export interface CreateShippingParams {
  order_id: string
  tracking_number: string
  carrier: string
  status: string
  estimated_delivery_date: string
  shipping_address: {
    recipient_name: string
    street_address: string
    city: string
    state: string
    postal_code: string
    country: string
    phone_number: string
  }
}

export const createShipping = async (params: CreateShippingParams): Promise<any> => {
  return request.post('/shipping/shipments', params)
}

// 更新物流信息
export interface UpdateShippingParams {
  tracking_number?: string
  carrier?: string
  status?: string
  estimated_delivery_date?: string
  actual_delivery_date?: string
  shipping_address?: {
    recipient_name?: string
    street_address?: string
    city?: string
    state?: string
    postal_code?: string
    country?: string
    phone_number?: string
  }
}

export const updateShipping = async (id: string, params: UpdateShippingParams): Promise<any> => {
  return request.put(`/shipping/shipments/${id}`, params)
}

// 删除物流信息
export const deleteShipping = async (id: string): Promise<any> => {
  return request.delete(`/shipping/shipments/${id}`)
}

// 获取商店订单列表
export const getShopOrders = async (
  params: {
    page?: number
    per_page?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    search_query?: string
    status?: string
  }
): Promise<ShippingListResponse> => {
  return request.get('/shipping/shop-orders', { params })
}
