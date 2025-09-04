import request from '../utils/request'

// 卡包集合类型定义
export interface PackCollection {
  id: number
  name: string
  win_rate?: number
  popularity?: number
  price?: number
  max_win?: number
  min_win?: number
  is_active: boolean
  created_at?: string
  separation?: string
}

// 卡包详情类型定义
export interface PackDetail {
  id: string
  name: string
  image_url: string
  win_rate: number
  max_win: number
  min_win: number
  popularity: number
  price: number
  created_at: string
  is_active: boolean | null
  separation?: string
}

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

// 创建卡片参数
export interface CreateCardParams {
  collection_metadata_id: string
  document_id: string
  probability: number
  color: string
}

// API 响应类型
export interface PackListResponse {
  packs: PackCollection[];
  pagination: {
    total_items: number;
    total_pages: number;
    current_page: number;
    per_page: number;
  };
  filters: {
    sort_by: string;
    sort_order: string;
    search_query: string;
  };
  next_cursor: string | null;
}

// 获取卡包类别列表
export const getPackCollections = async (): Promise<PackCollection[]> => {
  return request.get('/packs/packs_collection')
}

// 获取卡包类别列表并自动查找pokemen相关的分类
export const getPackCollectionsWithPokemen = async (): Promise<{ collections: PackCollection[], pokemenCollection: string | null }> => {
  const collections = await getPackCollections()
  
  // 查找名称中包含pokemon或pokemen的分类（不区分大小写）
  let pokemenCollection = null
  const pokemonRegex = /pokemon|pokemen/i
  
  for (const collection of collections) {
    if (pokemonRegex.test(collection.name)) {
      pokemenCollection = collection.id.toString()
      break
    }
  }
  
  // 如果没有找到pokemon或pokemen相关的分类，则返回第一个分类的ID
  if (!pokemenCollection && collections.length > 0) {
    pokemenCollection = collections[0].id.toString()
  }
  
  return { collections, pokemenCollection }
}

// 获取卡包列表
export const getPackList = async (
  collectionId: string,
  params: {
    page: number
    per_page: number
    search_query?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }
): Promise<PackListResponse> => {
  return request.get(`/packs/collection/${collectionId}`, { params })
}

// 获取非活跃卡包列表
export const getInactivePackList = async (
  collectionId: string,
  params?: {
    page?: number
    per_page?: number
    search_query?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  }
): Promise<PackListResponse> => {
  return request.get(`/packs/collection/${collectionId}/inactive`, { params })
}

// 获取卡包详情
export const getPackDetail = async (packId: string, collectionId: string): Promise<PackDetail> => {
  return request.get(`/packs/${packId}`, { params: { collection_id: collectionId } })
}

// 创建卡包
export interface CreatePackParams {
  pack_name: string
  collection_id: string
  price: number
  win_rate?: number
  max_win?: number
  min_win?: number
  popularity?: string
  separation?: string
  image_file?: string
}

export const createPack = async (params: CreatePackParams): Promise<any> => {
  // Always use FormData since the backend expects multipart/form-data format
  const formData = new FormData();
  
  for (const key in params) {
    if (params.hasOwnProperty(key) && params[key as keyof CreatePackParams] !== undefined) {
      formData.append(key, params[key as keyof CreatePackParams]!.toString());
    }
  }
  
  // Let axios/browser set the correct Content-Type with boundary for FormData
  return request.post('/packs/', formData, {
    headers: {
      // Clear the default Content-Type so browser can set multipart/form-data with boundary
      'Content-Type': undefined as any
    }
  });
}

// 变更卡包活跃状态
export const updatePackActiveStatus = async (
  collectionId: string,
  packId: string,
  isActive: boolean
): Promise<any> => {
  // 根据isActive参数选择不同的接口路径
  const endpoint = isActive ? 
    `/packs/${collectionId}/${packId}/activate` : 
    `/packs/${collectionId}/${packId}/inactivate`;
  
  return request.patch(endpoint, { is_active: isActive }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 变更卡包max_win值
export const updatePackMaxWin = async (
  collectionId: string,
  packId: string,
  maxWin: number
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/max_win`, { max_win: maxWin }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 变更卡包min_win值
export const updatePackMinWin = async (
  collectionId: string,
  packId: string,
  minWin: number
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/min_win`, { min_win: minWin }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 变更卡包价格
export const updatePackPrice = async (
  collectionId: string,
  packId: string,
  price: number
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/price`, { price: price }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 变更卡包胜率
export const updatePackWinRate = async (
  collectionId: string,
  packId: string,
  winRate: number
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/win_rate`, { win_rate: winRate }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 修改卡包名称
export const updatePackName = async (
  collectionId: string,
  packId: string,
  name: string
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/name`, { name: name }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 修改卡包热度
export const updatePackPopularity = async (
  collectionId: string,
  packId: string,
  popularity: number
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/popularity`, { popularity: popularity }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 修改卡包分类
export const updatePackSeparation = async (
  collectionId: string,
  packId: string,
  separation: string
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/separation`, { separation: separation }, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  })
}

// 修改卡包图片
export const updatePackImage = async (
  collectionId: string,
  packId: string,
  imageFile: File | string
): Promise<any> => {
  const formData = new FormData();
  
  if (imageFile instanceof File) {
    // If it's a File object, append it as 'file'
    formData.append('file', imageFile);
  } else if (typeof imageFile === 'string' && imageFile) {
    // If it's a string (base64), append it as 'image_file'
    formData.append('image_file', imageFile);
  } else {
    throw new Error('Invalid image data provided');
  }
  
  // The request interceptor will handle removing Content-Type for FormData
  return request.patch(`/packs/${collectionId}/${packId}/image`, formData);
}

// 删除卡包
export const deletePack = async (collectionId: string, packId: string): Promise<any> => {
  return request.delete(`/packs/${collectionId}/${packId}`)
}

// 获取卡包内卡片列表
export const getPackCards = async (
  collectionId: string,
  packId: string,
  params?: { sort_by?: string }
): Promise<Card[]> => {
  return request.get(`/packs/${collectionId}/${packId}/cards`, { params })
}

// 创建卡片
export const createCard = async (
  collectionId: string,
  packId: string,
  params: CreateCardParams
): Promise<any> => {
  return request.post(`/packs/${collectionId}/${packId}/cards`, params)
}

// 删除所有卡片
export const deleteCards = async (collectionId: string, packId: string): Promise<any> => {
  return request.delete(`/packs/${collectionId}/${packId}/cards`)
}

// 删除单个卡片
export const deleteCard = async (collectionId: string, packId: string, documentId: string): Promise<any> => {
  return request.delete(`/packs/${collectionId}/${packId}/cards`, {
    data: { document_id: documentId }
  })
}

// 更新卡片参数类型
export interface UpdateCardParams {
  probability?: number
  color?: string
}

// 更新卡片的概率和颜色
export const updateCard = async (
  collectionId: string,
  packId: string,
  documentId: string,
  params: UpdateCardParams
): Promise<any> => {
  return request.patch(`/packs/${collectionId}/${packId}/cards/${documentId}`, params)
}

// 统一更新卡包的多个字段
export interface UpdatePackUnifiedParams {
  name?: string
  price?: number
  win_rate?: number
  max_win?: number
  min_win?: number
  popularity?: number
  separation?: string
  image_file?: string
}

export const updatePackUnified = async (
  collectionId: string,
  packId: string,
  params: UpdatePackUnifiedParams
): Promise<any> => {
  const formData = new FormData()
  
  // Add all non-undefined fields to FormData
  Object.keys(params).forEach(key => {
    const value = params[key as keyof UpdatePackUnifiedParams]
    if (value !== undefined) {
      formData.append(key, value.toString())
    }
  })
  
  // The request interceptor will handle removing Content-Type for FormData
  return request.patch(`/packs/${collectionId}/${packId}`, formData)
}