// Admin related API interfaces
import request from '@/utils/request'

// User lookup response
export interface UserLookupResponse {
  found: boolean
  user_id?: string
  email?: string
  display_name?: string
  avatar?: string
  points_balance?: number
}

// Drawn card info
export interface DrawnCard {
  id: string
  collection_id: string
  card_reference: string
  image_url: string
  card_name: string
  point_worth: number
  rarity: number
  num_draw: number
  color: string
}

// Weekly spent update info
export interface WeeklySpentUpdate {
  success: boolean
  week_id?: string
  action?: string
  amount_added?: number
  previous_spent?: number
  new_spent?: number
  error?: string
}

// Simulate draw request
export interface SimulateDrawRequest {
  email: string
  collection_id: string
  pack_id: string
  count: number
  add_to_collection: boolean
}

// Simulate draw response
export interface SimulateDrawResponse {
  success: boolean
  user: {
    id: string
    email: string
    display_name: string
  }
  pack: {
    id: string
    collection_id: string
    price: number
  }
  draw_count: number
  total_simulated_spent: number
  drawn_cards: DrawnCard[]
  high_rarity_cards_count: number
  weekly_spent_updated: WeeklySpentUpdate
  top_hits_added: number
  cards_added_to_collection: boolean
}

// Batch simulate draw response
export interface BatchSimulateDrawResponse {
  success: boolean
  email: string
  iterations_completed: number
  total_cards_drawn: number
  total_simulated_spent: number
  total_high_rarity_cards: number
  cards_added_to_collection: boolean
  iteration_details: {
    iteration: number
    cards_drawn: number
    high_rarity_count: number
    spent: number
  }[]
}

// Look up user by email
export function lookupUserByEmail(email: string) {
  return request<UserLookupResponse>({
    url: '/admin/lookup-user',
    method: 'get',
    params: { email }
  })
}

// Simulate draw for a user
export function simulateDraw(params: SimulateDrawRequest) {
  return request<SimulateDrawResponse>({
    url: '/admin/simulate-draw',
    method: 'post',
    data: params
  })
}

// Batch simulate draws
export function batchSimulateDraw(params: {
  email: string
  collection_id: string
  pack_id: string
  iterations: number
  add_to_collection: boolean
}) {
  return request<BatchSimulateDrawResponse>({
    url: '/admin/batch-simulate-draw',
    method: 'post',
    params
  })
}

// Automated draw request
export interface AutomatedDrawRequest {
  email: string
  collection_id: string
  pack_id: string
  draw_count: number
}

// Automation summary
export interface AutomationSummary {
  points_auto_topped_up: number
  cards_added_to_collection: boolean
  most_expensive_card: {
    id: string
    name: string
    point_worth: number
    highlighted: boolean
  } | null
}

// Automated draw response (extends simulate draw)
export interface AutomatedDrawResponse extends SimulateDrawResponse {
  automation_summary: AutomationSummary
  highlight_added?: {
    success: boolean
    action: string
    card_id: string
    card_name?: string
  }
}

// Add points response
export interface AddPointsResponse {
  success: boolean
  email: string
  user_id: string
  points_added: number
  previous_balance: number
  new_balance: number
}

// Fully automated draw (one button - auto topup, add to collection, highlight best card)
export function automatedDraw(params: AutomatedDrawRequest) {
  return request<AutomatedDrawResponse>({
    url: '/admin/automated-draw',
    method: 'post',
    data: params
  })
}

// Add points to user by email
export function addPointsToUser(params: {
  email: string
  points: number
  reason?: string
}) {
  return request<AddPointsResponse>({
    url: '/admin/add-points',
    method: 'post',
    params
  })
}

// Highlight card request
export interface HighlightCardRequest {
  email: string
  card_collection_id: string
  card_id: string
  card_data: Record<string, any>
}

// Highlight card response
export interface HighlightCardResponse {
  success: boolean
  action: string
  card_id: string
  card_name?: string
  email?: string
}

// Add a card to user's highlights
export function highlightCard(params: HighlightCardRequest) {
  return request<HighlightCardResponse>({
    url: '/admin/highlight-card',
    method: 'post',
    data: params
  })
}

// Highlight card data from backend
export interface HighlightCardData {
  id: string
  card_name?: string
  image_url?: string
  point_worth?: number
  rarity?: number
  color?: string
  card_collection_id?: string
  added_at?: any
}

// Get user highlights response
export interface GetUserHighlightsResponse {
  success: boolean
  email: string
  user_id: string
  highlights: HighlightCardData[]
}

// Get user's highlights
export function getUserHighlights(email: string) {
  return request<GetUserHighlightsResponse>({
    url: '/admin/user-highlights',
    method: 'get',
    params: { email }
  })
}

// Remove a card from user's highlights
export function removeHighlightCard(email: string, cardId: string) {
  return request<HighlightCardResponse>({
    url: '/admin/highlight-card',
    method: 'delete',
    params: { email, card_id: cardId }
  })
}

// Admin user data
export interface AdminUser {
  id: string
  email: string
  display_name: string
  avatar: string
  points_balance: number
  level: number
}

// Create admin user request
export interface CreateAdminUserRequest {
  email: string
  display_name: string
  initial_points?: number
  avatar?: string
}

// Create admin user response
export interface CreateAdminUserResponse {
  success: boolean
  user: {
    id: string
    email: string
    displayName: string
    pointsBalance: number
  }
}

// Get admin users response
export interface GetAdminUsersResponse {
  success: boolean
  users: AdminUser[]
}

// Create a new user via admin panel
export function createAdminUser(params: CreateAdminUserRequest) {
  return request<CreateAdminUserResponse>({
    url: '/admin/create-user',
    method: 'post',
    data: params
  })
}

// Get all admin-created users
export function getAdminUsers() {
  return request<GetAdminUsersResponse>({
    url: '/admin/admin-users',
    method: 'get'
  })
}

// Achievement data
export interface Achievement {
  id: string
  name: string
  description: string
  condition: {
    type: string
    target?: number
    point_worth?: number
  }
  reward: Array<{
    type: string
    amount?: number
    emblemId?: string
    url?: string
  }>
  rarity: number
  rank: number
}

// User achievement data
export interface UserAchievement {
  achievement_id: string
  acquired: boolean
  awardedAt?: any
  progress?: number
}

// Get all achievements response
export interface GetAllAchievementsResponse {
  success: boolean
  achievements: Achievement[]
}

// Get user achievements response
export interface GetUserAchievementsResponse {
  success: boolean
  email: string
  user_id: string
  achievements: UserAchievement[]
}

// Grant achievement response
export interface GrantAchievementResponse {
  success: boolean
  action?: string
  achievement_id: string
  achievement_name?: string
  email?: string
  error?: string
}

// Update admin user request
export interface UpdateAdminUserRequest {
  user_id: string
  display_name?: string
  avatar?: string
  points_balance?: number
}

// Update admin user response
export interface UpdateAdminUserResponse {
  success: boolean
  action?: string
  user_id: string
  user?: {
    id: string
    email: string
    display_name: string
    avatar: string
    points_balance: number
    level: number
  }
}

// Get all achievements
export function getAllAchievements() {
  return request<GetAllAchievementsResponse>({
    url: '/admin/achievements',
    method: 'get'
  })
}

// Get user achievements
export function getUserAchievements(email: string) {
  return request<GetUserAchievementsResponse>({
    url: '/admin/user-achievements',
    method: 'get',
    params: { email }
  })
}

// Grant achievement to user
export function grantAchievement(params: { email: string; achievement_id: string }) {
  return request<GrantAchievementResponse>({
    url: '/admin/grant-achievement',
    method: 'post',
    data: params
  })
}

// Revoke achievement from user
export function revokeAchievement(email: string, achievementId: string) {
  return request<GrantAchievementResponse>({
    url: '/admin/revoke-achievement',
    method: 'delete',
    params: { email, achievement_id: achievementId }
  })
}

// Update admin user
export function updateAdminUser(params: UpdateAdminUserRequest) {
  return request<UpdateAdminUserResponse>({
    url: '/admin/admin-user',
    method: 'put',
    data: params
  })
}
