// 成就相关API接口
import request from '../utils/request'

// 成就类型定义
export interface Achievement {
  id: string
  name: string
  description: string
  condition: {
    type: string
    target?: number // Optional for special achievements
    point_worth?: number // Point worth threshold for draw_by_rarity achievements (e.g., 2000, 5000, 10000, 30000)
    rarity?: number // Deprecated - no longer used for draw_by_rarity
  }
  reward: Array<{
    type: string
    amount?: number // 当type为point时，此字段为必填且为number类型
    emblemId?: string
    url?: string
    image?: string // base64格式的徽章图片
  }>
  rarity: number // 修改为number类型，为空时默认为0
  rank: number | null
}

// 成就列表响应类型
export interface AchievementListResponse {
  status: string
  message: string
  data: {
    items: Achievement[]
    total: number
    page: number
    size: number
  }
}

// 获取成就列表
export const getAchievementList = async (
  params: {
    page?: number
    size?: number
    condition_type?: string
    sort_by?: 'rank' | 'rarity' | 'created_at'
    sort_direction?: 'asc' | 'desc'
  }
): Promise<AchievementListResponse> => {
  // 为获取成就列表接口特别设置请求头，与Swagger一致
  return request.get('/achievements/', { 
    params,
    headers: {
      'Accept': 'application/json',
      'Referer': `${import.meta.env.VITE_API_URL || 'https://backend-351785787544.us-central1.run.app/gacha/api/v1'}/docs`,
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    }
  })
}

// 获取单个成就
export const getAchievement = async (id: string): Promise<{ data: Achievement }> => {
  // 为获取单个成就接口特别设置请求头，与Swagger一致
  return request.get(`/achievements/${id}`, {
    headers: {
      'Accept': 'application/json',
      'Referer': `${import.meta.env.VITE_API_URL || 'https://backend-351785787544.us-central1.run.app/gacha/api/v1'}/docs`,
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    }
  })
}

// 更新成就
export interface UpdateAchievementParams {
  id: string
  name?: string
  description?: string
  condition?: {
    type: string
    target?: number // Optional for special achievements
    point_worth?: number // Point worth threshold for draw_by_rarity achievements (e.g., 2000, 5000, 10000, 30000)
    rarity?: number // Deprecated - no longer used for draw_by_rarity
  }
  reward?: Array<{
    type: string
    amount?: number // 当type为point时，此字段为必填且为number类型
    emblemId?: string
    url?: string
    image?: string // base64格式的徽章图片
  }>
  rarity?: number // 修改为number类型，为空时默认为0
  rank?: number
}

export const updateAchievement = async (id: string, params: Omit<UpdateAchievementParams, 'id'>): Promise<any> => {
  // 处理condition中的rarity和外层rarity，确保为空时默认值为0
  const processedParams = { ...params };
  
  // Remove rarity field from condition for all types as it's deprecated
  if (processedParams.condition && processedParams.condition.rarity !== undefined) {
    const { rarity, ...restCondition } = processedParams.condition;
    processedParams.condition = restCondition;
  }
  
  // 处理外层rarity，如果为空则设置为0
  if (processedParams.rarity === undefined) {
    processedParams.rarity = 0;
  }
  
  // 为更新成就接口特别设置请求头，与Swagger一致
  return request.put(`/achievements/${id}`, processedParams, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Referer': `${import.meta.env.VITE_API_URL || 'https://backend-351785787544.us-central1.run.app/gacha/api/v1'}/docs`,
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    }
  })
}

// 删除成就
export const deleteAchievement = async (id: string): Promise<any> => {
  // 为删除成就接口特别设置请求头，与Swagger一致
  return request.delete(`/achievements/${id}`, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Referer': `${import.meta.env.VITE_API_URL || 'https://backend-351785787544.us-central1.run.app/gacha/api/v1'}/docs`,
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    }
  })
}

// 新增成就
export interface AddAchievementParams {
  name: string
  description: string
  condition: {
    type: string
    target?: number // Optional for special achievements
    point_worth?: number // Point worth threshold for draw_by_rarity achievements (e.g., 2000, 5000, 10000, 30000)
    rarity?: number // Deprecated - no longer used for draw_by_rarity
  }
  reward: Array<{
    type: string
    amount?: number // 当type为point时，此字段为必填且为number类型
    emblemId?: string
    url?: string
    image?: string // base64格式的徽章图片
  }>
  rarity?: number // 修改为number类型，为空时默认为0
  rank?: number
}

export const addAchievement = async (params: AddAchievementParams): Promise<any> => {
  // 处理condition中的rarity和外层rarity，确保为空时默认值为0
  const processedParams = { ...params };
  
  // Remove rarity field from condition for all types as it's deprecated
  if (processedParams.condition && processedParams.condition.rarity !== undefined) {
    const { rarity, ...restCondition } = processedParams.condition;
    processedParams.condition = restCondition;
  }
  
  // 处理外层rarity，如果为空则设置为0
  if (processedParams.rarity === undefined) {
    processedParams.rarity = 0;
  }
  
  // 为添加成就接口特别设置请求头，与Swagger一致
  return request.post('/achievements/', processedParams, {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Referer': `${import.meta.env.VITE_API_URL || 'https://backend-351785787544.us-central1.run.app/gacha/api/v1'}/docs`,
      'sec-ch-ua': '"Not)A;Brand";v="8", "Chromium";v="138", "Google Chrome";v="138"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'
    }
  })
}