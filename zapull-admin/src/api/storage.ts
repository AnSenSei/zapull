// 卡片存储相关API接口
import request from '../utils/request'
import { createOptimizedApiFunction } from '../utils/throttle'

// 卡片类型定义
export interface Card {
  id: string
  card_name: string
  rarity: number
  point_worth: number
  date_got_in_stock: string
  image_url: string
  quantity: number
  condition: string
  used_in_fusion: any[]
}

// 卡片列表响应类型
export interface CardListResponse {
  cards: Card[]
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

// 卡片分类类型
export interface CardCollection {
  name: string
  firestoreCollection: string
  storagePrefix: string
}

// 卡片合成信息类型
export interface CardFusion {
  fusion_id: string
  result_card_id: string
  pack_reference: string
}

// 卡片合成列表响应类型
export interface CardFusionResponse {
  card_id: string
  collection_id: string
  fusions: CardFusion[]
}

// 获取卡片列表 - 应用请求优化以防止过度请求
const _getCardList = async (
  params: {
    collectionName: string
    page: number
    per_page: number
    sort_by?: 'point_worth' | 'card_name' | 'date_got_in_stock' | 'quantity' | 'rarity'
    sort_order?: 'desc' | 'asc'
    search_query?: string
    card_id?: string
  }
): Promise<CardListResponse> => {
  console.log('📡 API CALL: getCardList', params)
  return request.get('/storage/cards', { params })
}

// 创建优化的API函数，包含节流和去重
export const getCardList = createOptimizedApiFunction(
  _getCardList,
  2000, // 2秒节流
  (params) => {
    // 生成缓存键，忽略时间戳字段以提高缓存命中率
    const { collectionName, page, per_page, sort_by, sort_order, search_query, card_id } = params
    return `getCardList:${JSON.stringify({ collectionName, page, per_page, sort_by, sort_order, search_query, card_id })}`
  }
)

// 获取单个卡片详情
export const getCardDetail = async (
  documentId: string,
  collectionMetadataId: string
): Promise<Card> => {
  return request.get(`/storage/cards/${documentId}`, { 
    params: { collection_metadata_id: collectionMetadataId } 
  })
}

// 修改卡片
export interface UpdateCardParams {
  collection_metadata_id: string
  card_name?: string
  rarity?: number
  point_worth?: number
  date_got_in_stock?: string
  quantity?: number
  condition?: string
}

export const updateCard = async (
  documentId: string,
  params: UpdateCardParams
): Promise<Card> => {
  // 从params中提取collection_metadata_id，其余参数作为请求体
  const { collection_metadata_id, ...bodyParams } = params;
  
  // 添加当前时间作为date_got_in_stock参数
  const updatedParams = {
    ...bodyParams,
    date_got_in_stock: new Date().toISOString()
  };
  
  return request.put(
    `/storage/cards/${documentId}?collection_metadata_id=${collection_metadata_id}`, 
    updatedParams,
    {
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

// 删除卡片
export const deleteCard = async (
  documentId: string,
  collectionMetadataId: string
): Promise<any> => {
  return request.delete(`/storage/cards/${documentId}`, { 
    data: { collection_metadata_id: collectionMetadataId } 
  })
}

// 获取卡片可合成列表
export const getCardFusions = async (
  collectionId: string,
  cardId: string
): Promise<CardFusionResponse> => {
  return request.get(`/storage/cards/${collectionId}/${cardId}/fusions`)
}

// 修改卡片数量
export const updateCardQuantity = async (
  documentId: string,
  collectionMetadataId: string,
  quantityChange: number
): Promise<Card> => {
  return request.patch(
    `/storage/cards/${documentId}/quantity?collection_metadata_id=${collectionMetadataId}`,
    { quantity_change: quantityChange },
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
}

// 获取卡片分类
export const getCardCollections = async (): Promise<CardCollection[]> => {
  const response: CardCollection[] = await request.get('/storage/collection-metadata')
  // 直接返回响应数据，不需要再通过.data访问
  return response
}

// 获取卡片分类并自动选择pokemen相关分类
export const getCardCollectionsWithPokemen = async (): Promise<{collections: CardCollection[], pokemenCollection: string}> => {
  const response: CardCollection[] = await request.get('/storage/collection-metadata')
  // 查找与pokemon或pokemen相关的分类
  const pokemenCollection = response.find((collection: CardCollection) => 
    collection.name.toLowerCase().includes('pokemon') || 
    collection.name.toLowerCase().includes('pokemen') || 
    collection.firestoreCollection.toLowerCase().includes('pokemon') || 
    collection.firestoreCollection.toLowerCase().includes('pokemen')
  )
  
  return {
    collections: response,
    pokemenCollection: pokemenCollection ? pokemenCollection.name : (response.length > 0 ? response[0].name : '')
  }
}

// 新增卡片分类
export const createCardCollection = async (params: CardCollection): Promise<any> => {
  return request.post('/storage/collection-metadata', params)
}

// 获取卡片描述
export const getCardCollectionDetail = async (collectionName: string): Promise<any> => {
  return request.get(`/storage/collection-metadata/${collectionName}`)
}

// 删除卡片分类
export const deleteCardCollection = async (collectionName: string): Promise<any> => {
  return request.delete(`/storage/collection-metadata/${collectionName}`)
}

// 创建卡片
export interface CreateCardParams {
  image_file?: string
  image_base64?: string
  card_name: string
  rarity: string
  point_worth: number
  collection_metadata_id: string
  quantity?: number
  condition?: string
  date_got_in_stock?: string
}

export const createCard = async (params: CreateCardParams): Promise<any> => {
  // 处理 image_file 格式
  if (params.image_file) {
    let processedImageData = params.image_file;
    
    // 如果已经是 data URL 格式，提取纯 base64 部分
    if (processedImageData.startsWith('data:')) {
      processedImageData = processedImageData.split(',')[1];
    }
    
    // 确保 base64 字符串长度是 4 的倍数
    // 如果不是，添加缺少的 '=' 填充字符
    const remainder = processedImageData.length % 4;
    if (remainder > 0) {
      processedImageData = processedImageData + '='.repeat(4 - remainder);
    }
    
    // 添加 data:image/png;base64, 前缀
    processedImageData = 'data:image/png;base64,' + processedImageData;
    
    params = { ...params, image_base64: processedImageData };
  }
  
  // 将参数转换为 FormData 格式
  const formData = new FormData();
  for (const key in params) {
    if (params.hasOwnProperty(key) && params[key] !== undefined) {
      formData.append(key, params[key].toString());
    }
  }
  
  return request.post('/storage/upload_card', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    }
  })
}