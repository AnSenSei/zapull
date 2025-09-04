<template>
  <div class="storage-container">
    <el-card class="search-card">
      <el-form ref="searchFormRef" inline>
        <el-form-item label="卡片分类" prop="collectionName">
          <el-select 
            v-model="searchForm.collectionName" 
            placeholder="请选择卡片分类" 
            clearable 
            popper-append-to-body
            @change="handleCollectionChange"
            style="width: 150px;"
          >
            <el-option
              v-for="item in collections"
              :key="item.name"
              :label="item.name"
              :value="item.name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="排序字段" prop="sortBy">
          <el-select v-model="searchForm.sortBy" placeholder="请选择排序字段" style="width: 150px;" clearable>
            <el-option label="点数" value="point_worth" />
            <el-option label="卡片名称" value="card_name" />
            <el-option label="入库时间" value="date_got_in_stock" />
            <el-option label="数量" value="quantity" />
            <el-option label="稀有度" value="rarity" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序方式" prop="sortOrder">
          <el-select v-model="searchForm.sortOrder" placeholder="请选择排序方式" style="width: 150px;" clearable>
            <el-option label="升序" value="asc" />
            <el-option label="降序" value="desc" />
          </el-select>
        </el-form-item>
        <el-form-item label="稀有度范围" prop="rarityRange">
          <div style="display: flex; gap: 10px; align-items: center;">
            <el-select v-model="searchForm.rarity_min" placeholder="最低稀有度" clearable style="width: 120px;">
              <el-option label="不限" :value="undefined" />
              <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
            </el-select>
            <span>至</span>
            <el-select v-model="searchForm.rarity_max" placeholder="最高稀有度" clearable style="width: 120px;">
              <el-option label="不限" :value="undefined" />
              <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
            </el-select>
          </div>
        </el-form-item>
        <el-form-item label="积分范围" prop="pointRange">
          <div style="display: flex; gap: 10px; align-items: center;">
            <el-input-number v-model="searchForm.point_worth_min" placeholder="最低积分" :min="0" :precision="0" style="width: 120px;" />
            <span>至</span>
            <el-input-number v-model="searchForm.point_worth_max" placeholder="最高积分" :min="0" :precision="0" style="width: 120px;" />
          </div>
        </el-form-item>
        <el-form-item label="搜索" prop="searchQuery">
          <el-input v-model="searchForm.searchQuery" placeholder="请输入搜索关键词" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <div class="header-actions">
        <el-button type="primary" @click="handleCreate">创建卡片</el-button>
      </div>
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column prop="card_name" label="卡片名称" />
        <el-table-column prop="rarity" label="稀有度" />
        <el-table-column prop="point_worth" label="点数" />
        <el-table-column prop="quantity" label="数量" />
        <el-table-column prop="condition" label="状态" />
        <el-table-column prop="date_got_in_stock" label="入库时间" width="180" />
        <el-table-column label="图片" width="120">
          <template #default="{ row }">
            <el-image 
              v-if="row.image_url" 
              :src="row.image_url" 
              style="width: 80px; height: 80px"
              :preview-src-list="[row.image_url]"
              fit="contain"
            />
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="280" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleViewDetail(row)">详情</el-button>
            <el-button link type="primary" @click="handleViewFusions(row)">查看合成</el-button>
            <el-dropdown>
              <el-button link type="primary">更多<el-icon class="el-icon--right"><arrow-down /></el-icon></el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item @click="handleEdit(row)">编辑</el-dropdown-item>
                  <el-dropdown-item @click="handleUpdateQuantity(row)">修改数量</el-dropdown-item>
                  <el-dropdown-item divided @click="handleDelete(row)" style="color: #F56C6C">
                    删除
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </template>
        </el-table-column>
      </el-table>

      <div class="pagination-container">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          :total="total"
          layout="total, sizes, prev, pager, next, jumper"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
    
    <!-- 卡片详情抽屉 -->
    <el-drawer
      v-model="detailDrawerVisible"
      title="卡片详情"
      size="50%"
      :destroy-on-close="false"
    >
      <div v-loading="detailLoading">
        <el-descriptions :column="2" border>
          <el-descriptions-item label="卡片ID">{{ cardDetail.id }}</el-descriptions-item>
          <el-descriptions-item label="卡片名称">{{ cardDetail.card_name }}</el-descriptions-item>
          <el-descriptions-item label="稀有度">{{ cardDetail.rarity }}</el-descriptions-item>
          <el-descriptions-item label="点数">{{ cardDetail.point_worth }}</el-descriptions-item>
          <el-descriptions-item label="数量">{{ cardDetail.quantity }}</el-descriptions-item>
          <el-descriptions-item label="状态">{{ cardDetail.condition }}</el-descriptions-item>
          <el-descriptions-item label="入库时间">{{ cardDetail.date_got_in_stock || '-' }}</el-descriptions-item>
          <el-descriptions-item label="卡片图片" :span="2">
            <el-image 
              v-if="cardDetail.image_url" 
              :src="cardDetail.image_url" 
              style="max-width: 300px; max-height: 300px"
              :preview-src-list="[cardDetail.image_url]"
              fit="contain"
            />
            <span v-else>-</span>
          </el-descriptions-item>
        </el-descriptions>
      </div>
    </el-drawer>
    
    <!-- 创建卡片抽屉 -->
    <el-drawer
      v-model="createDrawerVisible"
      title="创建卡片"
      size="50%"
      :destroy-on-close="false"
    >
      <el-form 
        ref="createFormRef" 
        :model="createFormData" 
        :rules="createRules" 
        label-width="120px"
        v-loading="createLoading"
      >
        <el-form-item label="卡片名称" prop="card_name">
          <el-input v-model="createFormData.card_name" placeholder="请输入卡片名称" />
        </el-form-item>
        
        <el-form-item label="卡片分类" prop="collection_metadata_id">
          <el-select v-model="createFormData.collection_metadata_id" placeholder="请选择卡片分类">
            <el-option 
              v-for="item in collections" 
              :key="item.name" 
              :label="item.name" 
              :value="item.name" 
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="稀有度" prop="rarity">
          <el-input v-model="createFormData.rarity" placeholder="请输入稀有度" />
        </el-form-item>
        
        <el-form-item label="点数" prop="point_worth">
          <el-input-number v-model="createFormData.point_worth" :min="0" :precision="0" />
        </el-form-item>
        
        <el-form-item label="数量" prop="quantity">
          <el-input-number v-model="createFormData.quantity" :min="0" :precision="0" />
        </el-form-item>
        
        <el-form-item label="状态" prop="condition">
          <el-select v-model="createFormData.condition" placeholder="请选择状态">
            <el-option label="Gem Mint (宝石完美)" value="gem_mint" />
            <el-option label="Mint (完美)" value="mint" />
            <el-option label="Near Mint/NM (近乎完美)" value="near_mint" />
            <el-option label="Lightly Played/LP (轻度使用)" value="lightly_played" />
            <el-option label="Moderately Played/MP (中度使用)" value="moderately_played" />
            <el-option label="Heavily Played/HP (重度使用)" value="heavily_played" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="卡片图片" prop="image_base64">
          <el-upload
            class="avatar-uploader"
            action=""
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleImageChange"
          >
            <img v-if="imageUrl" :src="imageUrl" class="avatar" />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
          <div class="upload-tip">请上传卡片图片，支持jpg、png格式，大小不超过2.5MB</div>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitCreateForm">创建</el-button>
          <el-button @click="resetCreateForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 编辑卡片抽屉 -->
    <el-drawer
      v-model="editDrawerVisible"
      title="编辑卡片"
      size="50%"
      :destroy-on-close="false"
    >
      <el-form 
        ref="editFormRef" 
        :model="editFormData" 
        :rules="editRules" 
        label-width="120px"
        v-loading="editLoading"
      >
        <el-form-item label="卡片名称" prop="card_name">
          <el-input v-model="editFormData.card_name" placeholder="请输入卡片名称" />
        </el-form-item>
        
        <el-form-item label="稀有度" prop="rarity">
          <el-input-number v-model="editFormData.rarity" :min="0" :precision="0" />
        </el-form-item>
        
        <el-form-item label="点数" prop="point_worth">
          <el-input-number v-model="editFormData.point_worth" :min="0" :precision="0" />
        </el-form-item>
        
        <el-form-item label="数量" prop="quantity">
          <el-input-number v-model="editFormData.quantity" :min="0" :precision="0" />
        </el-form-item>
        
        <el-form-item label="状态" prop="condition">
          <el-select v-model="editFormData.condition" placeholder="请选择状态">
            <el-option label="Gem Mint (宝石完美)" value="gem_mint" />
            <el-option label="Mint (完美)" value="mint" />
            <el-option label="Near Mint/NM (近乎完美)" value="near_mint" />
            <el-option label="Lightly Played/LP (轻度使用)" value="lightly_played" />
            <el-option label="Moderately Played/MP (中度使用)" value="moderately_played" />
            <el-option label="Heavily Played/HP (重度使用)" value="heavily_played" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="卡片图片" prop="image_base64">
          <el-upload
            class="avatar-uploader"
            action=""
            :auto-upload="false"
            :show-file-list="false"
            :on-change="handleEditImageChange"
          >
            <img v-if="editImageUrl" :src="editImageUrl" class="avatar" />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
          <div class="upload-tip">请上传卡片图片，支持jpg、png、gif格式，大小不超过2.5MB</div>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitEditForm">保存</el-button>
          <el-button @click="editDrawerVisible = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 修改数量对话框 -->
    <el-dialog
      v-model="quantityDialogVisible"
      title="修改卡片数量"
      width="400px"
    >
      <el-form label-width="100px">
        <el-form-item label="数量变化">
          <el-input-number v-model="quantityChange" :min="-999" :max="999" :precision="0" />
          <div class="quantity-tip">正数表示增加，负数表示减少</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="quantityDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitQuantityChange">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 查看合成对话框 -->
    <el-dialog
      v-model="fusionsDialogVisible"
      title="可合成列表"
      width="600px"
    >
      <div v-loading="fusionsLoading">
        <el-empty v-if="fusionsData.fusions?.length === 0" description="暂无合成配方" />
        <el-table v-else :data="fusionsData.fusions" border stripe>
          <el-table-column prop="fusion_id" label="合成ID" />
          <el-table-column prop="result_card_id" label="结果卡片ID" />
          <el-table-column prop="pack_reference" label="卡包引用" />
        </el-table>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, onDeactivated } from 'vue'
import { debounce } from 'lodash-es'
import { 
  getCardList,
  getCardDetail,
  updateCard,
  deleteCard,
  getCardFusions,
  updateCardQuantity,
  getCardCollections,
  getCardCollectionsWithPokemen,
  createCard,
  type Card,
  type CardCollection,
  type CardFusionResponse,
  type CreateCardParams,
  type UpdateCardParams
} from '../../api/storage'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, ArrowDown } from '@element-plus/icons-vue'

defineOptions({
  name: 'StorageCards'
})

// 稀有度映射表
const rarityMap = {
  1: 'Common(普通)',
  2: 'Uncommon(非普通)',
  3: 'Rare(稀有)',
  4: 'Epic(史诗)',
  5: 'Legendary(传奇)',
  6: 'Mythic(神话)',
  7: 'Unique(唯一)'
}

// 搜索表单数据
const searchForm = reactive({
  collectionName: '',
  sortBy: 'point_worth',
  sortOrder: 'desc',
  searchQuery: '',
  cardId: '',
  rarity_min: undefined as number | undefined,
  rarity_max: undefined as number | undefined,
  point_worth_min: undefined as number | undefined,
  point_worth_max: undefined as number | undefined
})

// 表格数据
const tableData = ref<Card[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const isMounted = ref(false)
const total = ref(0)
const collections = ref<CardCollection[]>([])
let isRequestInProgress = ref(false)

// 详情抽屉相关
const detailDrawerVisible = ref(false)
const detailLoading = ref(false)
const cardDetail = ref<Card>({
  id: '',
  card_name: '',
  rarity: 0,
  point_worth: 0,
  date_got_in_stock: '',
  image_url: '',
  quantity: 0,
  condition: '',
  used_in_fusion: []
})

// 创建抽屉相关
const createDrawerVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref()
const imageUrl = ref('')

// 创建表单数据
const createFormData = reactive<CreateCardParams>({
  image_base64: '',
  card_name: '',
  rarity: '',
  point_worth: 0,
  collection_metadata_id: '',
  quantity: 0,
  condition: 'gem_mint'
})

// 创建表单验证规则
const createRules = {
  card_name: [
    { required: true, message: '请输入卡片名称', trigger: 'blur' },
    { min: 2, message: '长度至少 2 个字符', trigger: 'blur' }
  ],
  collection_metadata_id: [
    { required: true, message: '请选择卡片分类', trigger: 'change' }
  ],
  rarity: [
    { required: true, message: '请输入稀有度', trigger: 'blur' }
  ],
  point_worth: [
    { required: true, message: '请输入点数', trigger: 'blur' }
  ]
}

// 编辑抽屉相关
const editDrawerVisible = ref(false)
const editLoading = ref(false)
const editFormRef = ref()
const currentEditCard = ref<Card | null>(null)
const editImageUrl = ref('')

// 编辑表单数据
const editFormData = reactive<UpdateCardParams>({
  collection_metadata_id: '',
  card_name: '',
  rarity: 0,
  point_worth: 0,
  quantity: 0,
  condition: '',
  image_base64: ''
})

// 编辑表单验证规则
const editRules = {
  card_name: [
    { required: true, message: '请输入卡片名称', trigger: 'blur' },
    { min: 2, message: '长度至少 2 个字符', trigger: 'blur' }
  ],
  rarity: [
    { required: true, message: '请输入稀有度', trigger: 'blur' }
  ],
  point_worth: [
    { required: true, message: '请输入点数', trigger: 'blur' }
  ]
}

// 修改数量相关
const quantityDialogVisible = ref(false)
const quantityChange = ref(0)
const currentQuantityCard = ref<Card | null>(null)

// 查看合成相关
const fusionsDialogVisible = ref(false)
const fusionsLoading = ref(false)
const fusionsData = ref<CardFusionResponse>({
  card_id: '',
  collection_id: '',
  fusions: []
})

// 获取卡片分类列表
const fetchCollections = async () => {
  try {
    const { collections: collectionsList, pokemenCollection } = await getCardCollectionsWithPokemen()
    collections.value = collectionsList
    // 自动选择pokemen相关的分类
    if (pokemenCollection) {
      searchForm.collectionName = pokemenCollection
      // 如果已经挂载，则自动获取卡片列表
      if (isMounted.value) {
        debouncedFetchCardList()
      }
    }
  } catch (error) {
    ElMessage.error('获取卡片分类失败')
  }
}

// 获取卡片列表
const fetchCardList = async () => {
  // 🔥 DEBUG LOGGING - 添加详细的请求追踪
  console.log('🔥 FETCH_CARD_LIST TRIGGERED:', {
    timestamp: new Date().toISOString(),
    location: window.location.href,
    stackTrace: new Error().stack?.split('\n').slice(1, 4),
    searchForm: { ...searchForm },
    currentPage: currentPage.value,
    pageSize: pageSize.value,
    isRequestInProgress: isRequestInProgress.value
  })
  
  // 增强请求防护 - 检查是否真的需要发起请求
  if (isRequestInProgress.value) {
    console.log('🚫 REQUEST BLOCKED - Already in progress')
    return // 防止并发请求
  }
  
  // 额外检查：如果没有分类选择，不发起请求
  if (!searchForm.collectionName) {
    console.log('🚫 REQUEST BLOCKED - No collection selected')
    loading.value = false
    return
  }
  
  isRequestInProgress.value = true
  loading.value = true
  try {
    const params: any = {
      collectionName: searchForm.collectionName,
      page: currentPage.value,
      per_page: pageSize.value,
      sort_by: searchForm.sortBy,
      sort_order: searchForm.sortOrder,
      search_query: searchForm.searchQuery,
      card_id: searchForm.cardId
    }
    
    // 添加稀有度筛选参数
    if (searchForm.rarity_min !== undefined) {
      params.rarity_min = searchForm.rarity_min
    }
    if (searchForm.rarity_max !== undefined) {
      params.rarity_max = searchForm.rarity_max
    }
    
    // 添加积分筛选参数
    if (searchForm.point_worth_min !== undefined) {
      params.point_worth_min = searchForm.point_worth_min
    }
    if (searchForm.point_worth_max !== undefined) {
      params.point_worth_max = searchForm.point_worth_max
    }
    
    const response = await getCardList(params)
    tableData.value = response.cards
    total.value = response.pagination.total_items
  } catch (error) {
    console.error('获取卡片列表失败：', error)
    ElMessage.error('获取卡片列表失败')
  } finally {
    loading.value = false
    isRequestInProgress.value = false
  }
}

// 创建防抖函数 - 增加防抖时间以减少请求频率
const debouncedFetchCardList = debounce(() => {
  fetchCardList()
}, 2000) // 增加到2秒防抖

// 卡片分类变更
const handleCollectionChange = () => {
  currentPage.value = 1
  debouncedFetchCardList()
}

// 重置方法
const handleReset = () => {
  searchForm.collectionName = ''
  searchForm.sortBy = 'point_worth'
  searchForm.sortOrder = 'desc'
  searchForm.searchQuery = ''
  searchForm.cardId = ''
  searchForm.rarity_min = undefined
  searchForm.rarity_max = undefined
  searchForm.point_worth_min = undefined
  searchForm.point_worth_max = undefined
  currentPage.value = 1
  debouncedFetchCardList()
}

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  debouncedFetchCardList()
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  debouncedFetchCardList()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  debouncedFetchCardList()
}

// 查看详情 - 打开抽屉
const handleViewDetail = async (row: Card) => {
  if (!row.id || !searchForm.collectionName) {
    ElMessage.error('参数错误')
    return
  }
  
  detailLoading.value = true
  try {
    const response = await getCardDetail(row.id, searchForm.collectionName)
    cardDetail.value = response
    detailDrawerVisible.value = true
  } catch (error) {
    console.error('获取卡片详情失败：', error)
    ElMessage.error('获取卡片详情失败')
  } finally {
    detailLoading.value = false
  }
}

// 创建卡片 - 打开抽屉
const handleCreate = () => {
  createDrawerVisible.value = true
}

// 处理图片上传
const handleImageChange = (file: any) => {
  const isImage = file.raw.type === 'image/jpeg' || file.raw.type === 'image/png'
  const isLt2_5M = file.raw.size / 1024 / 1024 < 2.5
  
  if (!isImage) {
    ElMessage.error('上传图片只能是 JPG 或 PNG 格式!')
    return
  }
  if (!isLt2_5M) {
    ElMessage.error('上传图片大小不能超过 2.5MB!')
    return
  }
  
  // 读取图片为 base64
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    imageUrl.value = reader.result as string
    createFormData.image_base64 = reader.result as string
  }
}

// 处理编辑图片上传
const handleEditImageChange = (file: any) => {
  const isImage = file.raw.type === 'image/jpeg' || file.raw.type === 'image/png' || file.raw.type === 'image/gif'
  const isLt2_5M = file.raw.size / 1024 / 1024 < 2.5
  
  if (!isImage) {
    ElMessage.error('上传图片只能是 JPG、PNG 或 GIF 格式!')
    return
  }
  if (!isLt2_5M) {
    ElMessage.error('上传图片大小不能超过 2.5MB!')
    return
  }
  
  // 读取图片为 base64
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    editImageUrl.value = reader.result as string
    editFormData.image_base64 = reader.result as string
  }
}

// 提交创建表单
const submitCreateForm = async () => {
  if (!createFormRef.value) return
  
  await createFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      createLoading.value = true
      try {
        await createCard(createFormData)
        ElMessage.success('创建卡片成功')
        createDrawerVisible.value = false
        resetCreateForm()
        debouncedFetchCardList() // 刷新列表
      } catch (error) {
        console.error('创建卡片失败：', error)
        ElMessage.error('创建卡片失败')
      } finally {
        createLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 重置创建表单
const resetCreateForm = () => {
  if (!createFormRef.value) return
  createFormRef.value.resetFields()
  imageUrl.value = ''
}

// 编辑卡片
const handleEdit = (row: Card) => {
  if (!row.id || !searchForm.collectionName) {
    ElMessage.error('参数错误')
    return
  }

  currentEditCard.value = row
  editFormData.collection_metadata_id = searchForm.collectionName
  editFormData.card_name = row.card_name
  editFormData.rarity = row.rarity
  editFormData.point_worth = row.point_worth
  editFormData.quantity = row.quantity
  editFormData.condition = row.condition
  editFormData.image_base64 = ''
  
  // 设置当前图片URL用于预览
  editImageUrl.value = row.image_url || ''
  
  editDrawerVisible.value = true
}

// 提交编辑表单
const submitEditForm = async () => {
  if (!editFormRef.value || !currentEditCard.value) return
  
  await editFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      editLoading.value = true
      try {
        await updateCard(currentEditCard.value.id, editFormData)
        ElMessage.success('更新卡片成功')
        editDrawerVisible.value = false
        debouncedFetchCardList() // 刷新列表
      } catch (error) {
        console.error('更新卡片失败：', error)
        ElMessage.error('更新卡片失败')
      } finally {
        editLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 修改卡片数量
const handleUpdateQuantity = (row: Card) => {
  if (!row.id || !searchForm.collectionName) {
    ElMessage.error('参数错误')
    return
  }

  currentQuantityCard.value = row
  quantityChange.value = 0
  quantityDialogVisible.value = true
}

// 提交数量变更
const submitQuantityChange = async () => {
  if (!currentQuantityCard.value || !searchForm.collectionName) {
    ElMessage.error('参数错误')
    return
  }

  try {
    await updateCardQuantity(
      currentQuantityCard.value.id,
      searchForm.collectionName,
      quantityChange.value
    )
    ElMessage.success('更新数量成功')
    quantityDialogVisible.value = false
    debouncedFetchCardList() // 刷新列表
  } catch (error) {
    console.error('更新数量失败：', error)
    ElMessage.error('更新数量失败')
  }
}

// 删除卡片
const handleDelete = (row: Card) => {
  if (!row.id || !searchForm.collectionName) {
    ElMessage.error('参数错误')
    return
  }

  ElMessageBox.confirm(
    '确定要删除该卡片吗？删除后无法恢复。',
    '警告',
    {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    }
  ).then(async () => {
    try {
      await deleteCard(row.id, searchForm.collectionName)
      ElMessage.success('删除卡片成功')
      debouncedFetchCardList() // 刷新列表
    } catch (error) {
      console.error('删除卡片失败：', error)
      ElMessage.error('删除卡片失败')
    }
  }).catch(() => {
    // 用户取消删除操作
  })
}

// 查看合成
const handleViewFusions = async (row: Card) => {
  if (!row.id || !searchForm.collectionName) {
    ElMessage.error('参数错误')
    return
  }

  fusionsLoading.value = true
  fusionsDialogVisible.value = true

  try {
    const response = await getCardFusions(searchForm.collectionName, row.id)
    fusionsData.value = response
  } catch (error) {
    console.error('获取合成列表失败：', error)
    ElMessage.error('获取合成列表失败')
  } finally {
    fusionsLoading.value = false
  }
}

// 初始化
onMounted(() => {
  fetchCollections()
  isMounted.value = true
})

// 保存状态到localStorage
onDeactivated(() => {
  localStorage.setItem('storageCards_state', JSON.stringify({
    searchForm: {
      collectionName: searchForm.collectionName,
      sortBy: searchForm.sortBy,
      sortOrder: searchForm.sortOrder,
      searchQuery: searchForm.searchQuery
    },
    pagination: {
      currentPage: currentPage.value,
      pageSize: pageSize.value
    }
  }))
})

// 从localStorage恢复状态
// 添加防抖变量防止过度触发
let lastActivatedTime = 0
const ACTIVATION_DEBOUNCE_MS = 5000 // 5秒内只允许一次激活调用

onActivated(() => {
  const now = Date.now()
  
  // 🔥 DEBUG LOGGING - 追踪onActivated触发
  console.log('🔄 ON_ACTIVATED TRIGGERED:', {
    timestamp: new Date().toISOString(),
    location: window.location.href,
    timeSinceLastActivation: now - lastActivatedTime,
    willExecute: (now - lastActivatedTime) > ACTIVATION_DEBOUNCE_MS,
    documentVisibility: document.visibilityState,
    hasFocus: document.hasFocus()
  })
  
  // 防止过度触发 - 5秒内只允许一次
  if (now - lastActivatedTime < ACTIVATION_DEBOUNCE_MS) {
    console.log('🚫 ON_ACTIVATED DEBOUNCED - Too soon since last activation')
    return
  }
  
  lastActivatedTime = now
  
  const savedState = localStorage.getItem('storageCards_state')
  
  if (savedState) {
    const parsed = JSON.parse(savedState)
    
    // 恢复搜索表单
    if (parsed.searchForm) {
      searchForm.collectionName = parsed.searchForm.collectionName
      searchForm.sortBy = parsed.searchForm.sortBy
      searchForm.sortOrder = parsed.searchForm.sortOrder
      searchForm.searchQuery = parsed.searchForm.searchQuery
    }
    
    // 恢复分页
    if (parsed.pagination) {
      currentPage.value = parsed.pagination.currentPage
      pageSize.value = parsed.pagination.pageSize
    }
  }
  
  // 只有在有意义的状态变化时才重新加载
  if (searchForm.collectionName && !loading.value) {
    console.log('🚀 ON_ACTIVATED triggering debouncedFetchCardList() after debounce check')
    debouncedFetchCardList()
  }
})
</script>

<style scoped lang="scss">
.storage-container {
  .search-card {
    margin-bottom: 16px;
  }

  .table-card {
    .header-actions {
      margin-bottom: 16px;
    }

    .pagination-container {
      margin-top: 16px;
      display: flex;
      justify-content: flex-end;
    }
  }
}

// 添加上传组件样式
.avatar-uploader {
  width: 178px;
  height: 178px;
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  transition: border-color 0.3s;
}

.avatar-uploader:hover {
  border-color: #409EFF;
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 178px;
  height: 178px;
  line-height: 178px;
  text-align: center;
}

.avatar {
  width: 178px;
  height: 178px;
  display: block;
}

.upload-tip, .quantity-tip {
  font-size: 12px;
  color: #606266;
  margin-top: 8px;
}
</style>