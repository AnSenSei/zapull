// 用户相关的 API 接口
import request from '@/utils/request'

// 用户信息接口
export interface User {
  id: string
  createdAt: string
  displayName: string
  email: string
  addresses: any[]
  avatar: string
  level: number
  pointsBalance: number
  totalCashRecharged: number
  totalPointsSpent: number
  totalFusion: number
  clientSeed: string
  referred_by: string
  total_point_refered: number
  stripe_account_id: string
  totalAchievements: number
}

// 用户列表响应接口
export interface UserListResponse {
  users: User[]
  pagination: {
    total_items: number
    total_pages: number
    current_page: number
    per_page: number
  }
  filters: {
    sort_by: string
    sort_order: string
    search_query: string
  }
}

// 获取用户列表参数接口
export interface GetUserListParams {
  page: number
  per_page: number
  sort_by?: 'pointsBalance' | 'totalCashRecharged' | 'totalPointsSpent' | 'total_point_refered'
  sort_order?: 'asc' | 'desc'
  search_query?: string
}

// 获取用户列表
export function getUserList(params: GetUserListParams) {
  return request<UserListResponse>({
    url: '/users/',
    method: 'get',
    params
  })
}

// 获取用户详情
export function getUserDetail(userId: string) {
  return request<User>({
    url: `/users/${userId}`,
    method: 'get'
  })
}

// 检查用户是否为管理员
export function checkUserIsAdmin(userId: string) {
  return request<{ isAdmin: boolean }>({
    url: `/users/${userId}/is-admin`,
    method: 'get'
  })
}

// 用户成就相关接口
export interface UserAchievement {
  id: string
  user_id: string
  achievement_id: string
  earned_at: string
  notes?: string
  achievement_name?: string
  achievement_description?: string
}

export interface AwardAchievementParams {
  achievement_id: string
  notes?: string
}

export interface AwardAchievementResponse {
  success: boolean
  message: string
  user_achievement?: UserAchievement
}

export interface UserAchievementsResponse {
  achievements: UserAchievement[]
  total: number
  page: number
  size: number
}

// 为用户颁发成就
export function awardAchievementToUser(userId: string, params: AwardAchievementParams) {
  return request<AwardAchievementResponse>({
    url: `/users/${userId}/award-achievement`,
    method: 'post',
    params
  })
}

// 获取用户的成就列表
export function getUserAchievements(userId: string, page: number = 1, size: number = 10) {
  return request<UserAchievementsResponse>({
    url: `/users/${userId}/achievements`,
    method: 'get',
    params: { page, size }
  })
}

// 添加积分相关接口
export interface AddPointsRequest {
  points: number
  reason?: string
}

export interface AddPointsResponse {
  success: boolean
  message: string
  user_id: string
  points_added: number
  new_balance: number
  previous_balance: number
}

// 为用户添加积分
export function addPointsToUser(userId: string, params: AddPointsRequest) {
  return request<AddPointsResponse>({
    url: `/users/${userId}/add-points`,
    method: 'post',
    data: params
  })
}
