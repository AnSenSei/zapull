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
