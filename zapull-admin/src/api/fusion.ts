import request from '../utils/request'

// 配方材料类型
export interface RecipeIngredient {
  card_id: string
  quantity: number
}

// 创建配方参数
export interface CreateRecipeParams {
  result_card_id: string
  card_collection_id: string
  pack_id: string
  pack_collection_id: string
  collection_metadata_id?: string // 添加collection_metadata_id字段，用于存储卡包的分类ID
  ingredients: RecipeIngredient[]
}

// 配方材料详情类型
export interface IngredientDetail {
  card_collection_id: string
  card_id: string
  card_reference: string
  quantity: number
  card_name?: string
  probability?: number
  point_worth?: number
  image_url?: string
}

// 配方卡牌类型
export interface RecipeCard {
  result_card_id: string
  card_collection_id: string
  card_reference: string
  pack_id: string
  pack_collection_id: string
  ingredients: IngredientDetail[]
  cards_needed: number
  total_cards_needed: number
  result_card_name?: string
  result_card_image_url?: string
  result_card_point_worth?: number
}

// 配方包类型
export interface RecipePack {
  pack_id: string
  pack_collection_id: string
  cards: RecipeCard[]
  cards_count: number
}

// 配方分类类型
export interface RecipeCollection {
  collection_id: string
  packs: RecipePack[]
  packs_count: number
}

// 分页信息类型
export interface PaginationInfo {
  total_items: number
  total_pages: number
  current_page: number
  per_page: number
}

// 过滤信息类型
export interface FilterInfo {
  sort_by: string
  sort_order: string
  search_query: string
}

// 配方列表响应类型
export interface RecipeListResponse {
  collections: RecipeCollection[]
  pagination: PaginationInfo
  filters: FilterInfo
}

// 创建合成配方
export const createFusionRecipe = async (params: CreateRecipeParams): Promise<any> => {
  return request.post('/fusion_recipes/', params)
}

// 获取合成配方列表
export const getFusionRecipes = async (params: {
  collection_id?: string
  user_id?: string
  page?: number
  per_page?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  search_query?: string
  card_name_search?: string
  pack_name_search?: string
}): Promise<RecipeListResponse> => {
  return request.get('/fusion_recipes/', { params })
}

// 获取配方详情
export const getFusionRecipeDetail = async (
  packCollectionId: string,
  packId: string,
  resultCardId: string
): Promise<RecipeCard> => {
  return request.get(`/fusion_recipes/${packCollectionId}/${packId}/cards/${resultCardId}`)
}

// 修改配方
export interface UpdateRecipeParams {
  card_collection_id: string
  pack_id: string
  pack_collection_id: string
  added_ingredients?: RecipeIngredient[]
  deleted_ingredients?: RecipeIngredient[]
}

export const updateFusionRecipe = async (
  packCollectionId: string,
  packId: string,
  resultCardId: string,
  params: UpdateRecipeParams
): Promise<any> => {
  return request.put(`/fusion_recipes/${packCollectionId}/${packId}/cards/${resultCardId}`, params)
}

// 删除配方
export const deleteFusionRecipe = async (
  packCollectionId: string,
  packId: string,
  resultCardId: string
): Promise<any> => {
  return request.delete(`/fusion_recipes/${packCollectionId}/${packId}/cards/${resultCardId}`)
}

// 获取分类中有融合配方的卡包列表
export interface FusionPack {
  pack_id: string
  pack_name: string
  fusion_count: number
}

export interface FusionPacksResponse {
  collection_id: string
  packs: FusionPack[]
  pagination: PaginationInfo
}

export const getFusionPacksInCollection = async (
  collectionId: string,
  params?: {
    page?: number
    per_page?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    search_query?: string
  }
): Promise<FusionPacksResponse> => {
  return request.get(`/fusion_recipes/collections/${collectionId}/packs`, { params })
}

// 获取特定卡包的所有融合配方
export const getFusionRecipesByPack = async (
  packCollectionId: string,
  packId: string,
  params?: {
    user_id?: string
    page?: number
    per_page?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    card_name_search?: string
  }
): Promise<any> => {
  return request.get('/fusion_recipes/', { 
    params: {
      ...params,
      collection_id: packCollectionId,
      pack: packId
    }
  })
}

// 获取分类中配方列表
export const getCollectionRecipes = async (
  collectionId: string,
  params: {
    user_id?: string
    page?: number
    per_page?: number
    sort_by?: string
    sort_order?: 'asc' | 'desc'
    search_query?: string
  }
): Promise<RecipeListResponse> => {
  return request.get(`/fusion_recipes/${collectionId}/recipes`, { params })
}
