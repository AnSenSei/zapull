// API服务：处理历史记录相关的接口调用

import { getAuthHeaders } from '@/lib/authUtils'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://user-backend-351785787544.us-central1.run.app/users/api/v1'

// 通用请求函数
async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const url = `${API_BASE_URL}${endpoint}`
  const authHeaders = await getAuthHeaders()
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    // 检测401错误并跳转到重新登录页面
    if (response.status === 401) {
      // 获取当前页面URL作为重定向参数
      const currentUrl = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/'
      const redirectUrl = `/auth/reauth?redirect=${encodeURIComponent(currentUrl)}`
      
      // 在客户端环境下进行跳转
      if (typeof window !== 'undefined') {
        window.location.href = redirectUrl
      }
      
      throw new Error('Authentication required')
    }
    
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  return response.json()
}

// Pack Opening历史记录接口
export interface PackOpeningItem {
  id: number
  pack_type: string
  pack_count: number
  price_points: number
  client_seed: string
  nonce: number
  server_seed_hash: string
  server_seed: string
  random_hash: string
  opened_at: string
}

export interface PackOpeningHistoryResponse {
  pack_openings: PackOpeningItem[]
  total_count: number
}

// Boxes历史记录接口（基于packs API）
export interface BoxHistoryItem {
  id: string
  box_name?: string
  cost_points?: number
  created_at: string
  pack_id?: string
  collection_id?: string
  collection_name?: string
  cards_received?: {
    card_id: string
    card_name: string
    rarity: string
    image_url: string
  }[]
  // 新增字段以匹配实际API返回
  buyer_id?: string
  seller_id?: string
  card_id?: string
  listing_id?: string
  price_cash?: number | null
  price_points?: number | null
  quantity?: number
  traded_at?: string
}

export interface BoxHistoryResponse {
  transactions: BoxHistoryItem[]
  pagination: {
    current_page: number
    total_pages: number
    total_items: number
    per_page: number
  }
}

// 获取用户Pack Opening历史
export async function getUserPackOpeningHistory(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<PackOpeningHistoryResponse> {
  try {
    const response = await apiRequest(
      `/history/pack-opening?page=${page}&per_page=${pageSize}`
    )
    return response
  } catch (error) {
    console.error('Failed to fetch pack opening history:', error)
    // 返回空数据作为fallback
    return {
      pack_openings: [],
      total_count: 0
    }
  }
}

// 获取用户开箱历史
export async function getUserBoxHistory(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<BoxHistoryResponse> {
  try {
    const response = await apiRequest(
      `/history/marketplace/buyer?page=${page}&page_size=${pageSize}`
    )
    return response
  } catch (error) {
    console.error('Failed to fetch box history:', error)
    // 返回模拟数据作为fallback
    return {
      transactions: [
        {
          id: 'box_001',
          box_name: 'Roby Shinies',
          cost_points: 5600,
          created_at: '2024-01-15T10:30:00Z',
          pack_id: 'pack_123',
          collection_id: 'col_001',
          collection_name: 'Fantasy Collection',
          cards_received: [
            {
              card_id: 'card_001',
              card_name: 'Jukai Preserver',
              rarity: 'rare',
              image_url: '/cards/common1.jpg.svg'
            }
          ]
        },
        {
          id: 'box_002',
          box_name: 'Epic Legends',
          cost_points: 8900,
          created_at: '2024-01-14T15:45:00Z',
          pack_id: 'pack_124',
          collection_id: 'col_002',
          collection_name: 'Adventure Collection',
          cards_received: [
            {
              card_id: 'card_002',
              card_name: 'Dragon Slayer',
              rarity: 'legendary',
              image_url: '/cards/common2.jpg.svg'
            }
          ]
        }
      ],
      pagination: {
        current_page: page,
        total_pages: 3,
        total_items: 25,
        per_page: pageSize
      }
    }
  }
}

// Marketplace历史记录接口
export interface MarketplaceItem {
  quantity: number
  price_points: number | null
  price_cash: number | null
  traded_at: string
  card_name: string | null
  signed_url: string | null
}

export interface MarketplaceResponse {
  transactions: MarketplaceItem[]
  pagination: {
    current_page: number
    total_pages: number
    total_items: number
    per_page: number
  }
}

// 获取用户作为买家的交易历史
export async function getUserMarketplaceHistoryAsBuyer(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<MarketplaceResponse> {
  try {
    const response = await apiRequest(
      `/history/marketplace/buyer?page=${page}&per_page=${pageSize}`
    )
    return response
  } catch (error) {
    console.error('Failed to fetch buyer marketplace history:', error)
    // 返回空数据作为fallback
    return {
      transactions: [],
      pagination: {
        current_page: page,
        total_pages: 0,
        total_items: 0,
        per_page: pageSize
      }
    }
  }
}

// 获取用户作为卖家的交易历史
export async function getUserMarketplaceHistoryAsSeller(
  userId: string,
  page: number = 1,
  pageSize: number = 10
): Promise<MarketplaceResponse> {
  try {
    const response = await apiRequest(
      `/history/marketplace/seller?page=${page}&per_page=${pageSize}`
    )
    return response
  } catch (error) {
    console.error('Failed to fetch seller marketplace history:', error)
    // 返回空数据作为fallback
    return {
      transactions: [],
      pagination: {
        current_page: page,
        total_pages: 0,
        total_items: 0,
        per_page: pageSize
      }
    }
  }
}

// 获取包集合列表
export async function getPackCollections() {
  try {
    const response = await apiRequest('/packs/packs_collection')
    return response
  } catch (error) {
    console.error('Failed to fetch pack collections:', error)
    return { collections: [] }
  }
}

// 获取特定集合中的包列表
export async function getPacksInCollection(
  collectionId: string,
  page: number = 1,
  pageSize: number = 10
) {
  try {
    const response = await apiRequest(
      `/packs/collection/${collectionId}?page=${page}&page_size=${pageSize}`
    )
    return response
  } catch (error) {
    console.error('Failed to fetch packs in collection:', error)
    return { packs: [], pagination: {} }
  }
}

// 获取特定包的详细信息
export async function getPackDetails(packId: string) {
  try {
    const response = await apiRequest(`/packs/${packId}`)
    return response
  } catch (error) {
    console.error('Failed to fetch pack details:', error)
    return null
  }
}

// 获取包中的卡片信息
export async function getPackCards(collectionId: string, packId: string) {
  try {
    const response = await apiRequest(`/packs/${collectionId}/${packId}/cards`)
    return response
  } catch (error) {
    console.error('Failed to fetch pack cards:', error)
    return { cards: [] }
  }
}