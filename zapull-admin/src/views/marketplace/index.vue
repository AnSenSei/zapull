<template>
  <div class="marketplace-container">
    <el-card class="search-card">
      <el-form ref="searchFormRef" inline>
        <el-form-item label="卡片分类" prop="collectionId">
          <el-select 
            v-model="searchForm.collectionId" 
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
            <el-option label="积分价格" value="pricePoints" />
            <el-option label="现金价格" value="priceCash" />
            <el-option label="卡片名称" value="card_name" />
            <el-option label="稀有度" value="rarity" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序方式" prop="sortOrder">
          <el-select v-model="searchForm.sortOrder" placeholder="请选择排序方式" style="width: 150px;" clearable>
            <el-option label="升序" value="asc" />
            <el-option label="降序" value="desc" />
          </el-select>
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
        <el-button type="primary" @click="handleAdd">添加商品</el-button>
      </div>
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column prop="card_name" label="卡片名称" />
        <el-table-column prop="rarity" label="稀有度" />
        <el-table-column prop="pricePoints" label="积分价格" />
        <el-table-column prop="priceCash" label="现金价格" />
        <el-table-column prop="quantity" label="数量" />
        <el-table-column prop="condition" label="状态" />
        <el-table-column label="图片" width="120">
          <template #default="{ row }">
            <el-image 
              v-if="row.image_url" 
              :src="row.image_url" 
              style="width: 80px; height: 80px"
              :preview-src-list="[row.image_url]"
            />
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleWithdraw(row)">撤下商品</el-button>
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
    
    <!-- 添加商品抽屉 -->
    <el-drawer
      v-model="addDrawerVisible"
      title="添加商品"
      size="50%"
      :destroy-on-close="false"
    >
      <el-form 
        ref="addFormRef" 
        :model="addFormData" 
        :rules="addRules" 
        label-width="120px"
        v-loading="addLoading"
      >
        <el-form-item label="卡片分类" prop="collection_id">
          <el-select v-model="addFormData.collection_id" placeholder="请选择卡片分类">
            <el-option 
              v-for="item in collections" 
              :key="item.name" 
              :label="item.name" 
              :value="item.name" 
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="卡片ID" prop="card_id">
          <div style="display: flex; gap: 8px;">
            <el-input v-model="addFormData.card_id" placeholder="请选择卡片" readonly />
            <el-button type="primary" @click="handleSelectCard">选择卡片</el-button>
          </div>
        </el-form-item>
        
        <el-form-item label="数量" prop="quantity">
          <el-input-number v-model="addFormData.quantity" :min="1" :precision="0" />
        </el-form-item>
        
        <el-form-item label="现金价格 (USD)" prop="priceCash">
          <el-input-number v-model="addFormData.priceCash" :min="0" :precision="2" />
        </el-form-item>
        
        <el-form-item label="类型" prop="type">
          <el-select v-model="addFormData.type" placeholder="请选择类型">
            <el-option label="卡片 (Card)" value="card" />
            <el-option label="卡包 (Pack)" value="pack" />
            <el-option label="礼盒 (Box)" value="box" />
          </el-select>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitAddForm">添加</el-button>
          <el-button @click="resetAddForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 编辑商品抽屉 -->
    <el-drawer
      v-model="editDrawerVisible"
      title="编辑商品"
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
        <el-form-item label="数量" prop="quantity">
          <el-input-number v-model="editFormData.quantity" :min="1" :precision="0" />
        </el-form-item>
        
        <el-form-item label="现金价格 (USD)" prop="priceCash">
          <el-input-number v-model="editFormData.priceCash" :min="0" :precision="2" />
        </el-form-item>
        
        <el-form-item label="类型" prop="type">
          <el-select v-model="editFormData.type" placeholder="请选择类型">
            <el-option label="卡片 (Card)" value="card" />
            <el-option label="卡包 (Pack)" value="pack" />
            <el-option label="礼盒 (Box)" value="box" />
          </el-select>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitEditForm">保存</el-button>
          <el-button @click="editDrawerVisible = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>


    <!-- 用户购买对话框 -->
    <el-dialog
      v-model="buyoutDialogVisible"
      title="用户购买"
      width="400px"
    >
      <el-form label-width="100px">
        <el-form-item label="用户ID" prop="userId">
          <el-input v-model="buyoutForm.userId" placeholder="请输入用户ID" />
        </el-form-item>
        <el-form-item label="购买数量">
          <el-input-number v-model="buyoutForm.quantity" :min="1" :precision="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="buyoutDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitBuyout">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 卡牌选择弹窗 -->
    <el-dialog
      v-model="cardSelectDialogVisible"
      title="选择卡牌"
      width="80%"
      :destroy-on-close="false"
    >
      <div class="card-select-container">
        <!-- 搜索区域 -->
        <el-form inline class="card-search-form">
          <el-form-item label="稀有度范围">
            <div style="display: flex; gap: 10px; align-items: center;">
              <el-select v-model="cardRarityMin" placeholder="最低稀有度" clearable style="width: 120px;" @change="searchCards">
                <el-option label="不限" :value="undefined" />
                <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
              </el-select>
              <span>至</span>
              <el-select v-model="cardRarityMax" placeholder="最高稀有度" clearable style="width: 120px;" @change="searchCards">
                <el-option label="不限" :value="undefined" />
                <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
              </el-select>
            </div>
          </el-form-item>
          <el-form-item label="积分范围">
            <div style="display: flex; gap: 10px; align-items: center;">
              <el-input-number
                v-model="cardPointWorthMin"
                placeholder="最低积分"
                :min="0"
                :precision="0"
                style="width: 120px;"
                @change="searchCards"
              />
              <span>至</span>
              <el-input-number
                v-model="cardPointWorthMax"
                placeholder="最高积分"
                :min="0"
                :precision="0"
                style="width: 120px;"
                @change="searchCards"
              />
            </div>
          </el-form-item>
          <el-form-item label="排序字段">
             <el-select v-model="cardSortBy" placeholder="请选择排序字段" style="width: 150px;" clearable @change="handleCardSortChange">
               <el-option label="点数" value="point_worth" />
               <el-option label="卡片名称" value="card_name" />
               <el-option label="入库时间" value="date_got_in_stock" />
               <el-option label="数量" value="quantity" />
               <el-option label="稀有度" value="rarity" />
             </el-select>
           </el-form-item>
           <el-form-item label="排序方式">
             <el-select v-model="cardSortOrder" placeholder="请选择排序方式" style="width: 150px;" clearable @change="handleCardSortChange">
               <el-option label="升序" value="asc" />
               <el-option label="降序" value="desc" />
             </el-select>
           </el-form-item>
          <el-form-item label="卡牌名称">
            <el-input
              v-model="cardSearchQuery"
              placeholder="请输入卡牌名称"
              clearable
              @keyup.enter="searchCards"
              style="width: 200px;"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="searchCards">搜索</el-button>
            <el-button @click="resetCardSearch">重置</el-button>
          </el-form-item>
        </el-form>

        <!-- 卡牌列表 -->
        <el-table
          :data="cardList"
          border
          stripe
          v-loading="cardLoading"
          @row-click="handleCardRowClick"
          style="cursor: pointer;"
        >
          <el-table-column prop="card_name" label="卡牌名称" />
          <el-table-column prop="rarity" label="稀有度">
            <template #default="{ row }">
              <span>{{ getRarityLabel(row.rarity) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="point_worth" label="积分价值" />
          <el-table-column label="图片" width="120">
            <template #default="{ row }">
              <el-image
                v-if="row.image_url"
                :src="row.image_url"
                style="width: 80px; height: 80px"
                :preview-src-list="[row.image_url]"
              />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" size="small" @click.stop="selectCard(row)">选择</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 分页 -->
        <div class="card-pagination">
          <el-pagination
            v-model:current-page="cardCurrentPage"
            v-model:page-size="cardPageSize"
            :page-sizes="[10, 20, 50]"
            :total="cardTotal"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handleCardSizeChange"
            @current-change="handleCardCurrentChange"
          />
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onActivated, onDeactivated } from 'vue'
import { 
  getMarketplaceList,
  updateMarketplaceItem,
  addMarketplaceItem,
  updateMarketplaceQuantity,
  updateUserBuyout,
  withdrawMarketplaceItem,
  type MarketplaceCard,
  type AddMarketplaceItemParams,
  type UpdateMarketplaceItemParams,
  type UpdateMarketplaceQuantityParams,
  type WithdrawMarketplaceItemParams
} from '../../api/marketplace'
import { 
  getCardCollections, 
  getCardCollectionsWithPokemen, 
  getCardList,
  type CardCollection,
  type Card 
} from '../../api/storage'
import { ElMessage, ElMessageBox } from 'element-plus'

defineOptions({
  name: 'MarketplaceIndex'
})

// 搜索表单数据
const searchForm = reactive({
  collectionId: '',
  sortBy: 'pricePoints',
  sortOrder: 'asc' as 'asc' | 'desc',
  searchQuery: ''
})

// 表格数据
const tableData = ref<MarketplaceCard[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const collections = ref<CardCollection[]>([])
const isMounted = ref(false)

// 添加抽屉相关
const addDrawerVisible = ref(false)
const addLoading = ref(false)
const addFormRef = ref()

// 添加表单数据
const addFormData = reactive<AddMarketplaceItemParams>({
  collection_id: '',
  card_id: '',
  quantity: 1,
  priceCash: 0,
  type: 'card'
})

// 添加表单验证规则
const addRules = {
  collection_id: [
    { required: true, message: '请选择卡片分类', trigger: 'change' }
  ],
  card_id: [
    { required: true, message: '请输入卡片ID', trigger: 'blur' }
  ],
  priceCash: [
    { required: true, message: '请输入现金价格', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择类型', trigger: 'change' }
  ]
}

// 编辑抽屉相关
const editDrawerVisible = ref(false)
const editLoading = ref(false)
const editFormRef = ref()
const currentEditCard = ref<MarketplaceCard | null>(null)

// 编辑表单数据
const editFormData = reactive<UpdateMarketplaceItemParams & { quantity?: number }>({
  collection_id: '',
  card_id: '',
  quantity: 1,
  priceCash: 0,
  type: 'card'
})

// 编辑表单验证规则
const editRules = {
  quantity: [
    { required: true, message: '请输入数量', trigger: 'blur' }
  ],
  priceCash: [
    { required: true, message: '请输入现金价格', trigger: 'blur' }
  ],
  type: [
    { required: true, message: '请选择类型', trigger: 'change' }
  ]
}


// 用户购买相关
const buyoutDialogVisible = ref(false)
const currentBuyoutCard = ref<MarketplaceCard | null>(null)
const buyoutForm = reactive({
  userId: '',
  quantity: 1
})

// 卡牌选择相关
const cardSelectDialogVisible = ref(false)
const cardList = ref<Card[]>([])
const cardLoading = ref(false)
const cardCurrentPage = ref(1)
const cardPageSize = ref(10)
const cardTotal = ref(0)
const cardSearchQuery = ref('')
const cardSortBy = ref('point_worth')
const cardSortOrder = ref('asc')
const cardRarityMin = ref<number | undefined>(undefined)
const cardRarityMax = ref<number | undefined>(undefined)
const cardPointWorthMin = ref<number | undefined>(undefined)
const cardPointWorthMax = ref<number | undefined>(undefined)

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

// 获取卡片分类列表
const fetchCollections = async () => {
  try {
    const { collections: collectionsList, pokemenCollection } = await getCardCollectionsWithPokemen()
    collections.value = collectionsList
    // 自动选择pokemen相关的分类
    if (pokemenCollection) {
      // 将name转换为对应的id
      const pokemenCollectionObj = collectionsList.find(c => c.name === pokemenCollection)
      if (pokemenCollectionObj) {
        searchForm.collectionId = pokemenCollectionObj.storagePrefix
        // 如果已经挂载，则自动获取市场列表
        if (isMounted.value) {
          fetchMarketplaceList()
        }
      }
    }
  } catch (error) {
    ElMessage.error('获取卡片分类失败')
  }
}

// 获取市场列表
const fetchMarketplaceList = async () => {
  if (!searchForm.collectionId) {
    ElMessage.warning('请先选择卡片分类')
    return
  }

  loading.value = true
  try {
    const response = await getMarketplaceList({
      collection_id: searchForm.collectionId,
      page: currentPage.value,
      per_page: pageSize.value,
      sort_by: searchForm.sortBy,
      sort_order: searchForm.sortOrder,
      search_query: searchForm.searchQuery
    })
    tableData.value = response.data.cards
    total.value = response.data.pagination.total_items
  } catch (error) {
    console.error('获取市场列表失败：', error)
    ElMessage.error('获取市场列表失败')
  } finally {
    loading.value = false
  }
}

// 卡片分类变更
const handleCollectionChange = () => {
  currentPage.value = 1
  fetchMarketplaceList()
}

// 重置方法
const handleReset = () => {
  searchForm.collectionId = ''
  searchForm.sortBy = 'pricePoints'
  searchForm.sortOrder = 'asc'
  searchForm.searchQuery = ''
  currentPage.value = 1
  tableData.value = []
  total.value = 0
}

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  fetchMarketplaceList()
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  fetchMarketplaceList()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  fetchMarketplaceList()
}

// 添加商品 - 打开抽屉
const handleAdd = () => {
  addFormData.collection_id = searchForm.collectionId
  addDrawerVisible.value = true
}

// 提交添加表单
const submitAddForm = async () => {
  if (!addFormRef.value) return
  
  await addFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      addLoading.value = true
      try {
        await addMarketplaceItem(addFormData)
        ElMessage.success('添加商品成功')
        addDrawerVisible.value = false
        resetAddForm()
        fetchMarketplaceList() // 刷新列表
      } catch (error) {
        console.error('添加商品失败：', error)
        ElMessage.error('添加商品失败')
      } finally {
        addLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 重置添加表单
const resetAddForm = () => {
  if (!addFormRef.value) return
  addFormRef.value.resetFields()
  addFormData.collection_id = searchForm.collectionId
  addFormData.card_id = ''
  addFormData.quantity = 1
  addFormData.priceCash = 0
  addFormData.type = 'card'
}

// 编辑商品
const handleEdit = (row: MarketplaceCard) => {
  currentEditCard.value = row
  editFormData.collection_id = searchForm.collectionId
  editFormData.card_id = row.id
  editFormData.quantity = row.quantity
  editFormData.priceCash = row.priceCash || 0
  editFormData.type = row.type || 'card'
  
  editDrawerVisible.value = true
}

// 提交编辑表单
const submitEditForm = async () => {
  if (!editFormRef.value || !currentEditCard.value) return
  
  await editFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      editLoading.value = true
      try {
        // 先更新数量
        if (editFormData.quantity !== currentEditCard.value.quantity) {
          await updateMarketplaceQuantity({
            collection_id: editFormData.collection_id,
            card_id: editFormData.card_id,
            quantity: editFormData.quantity || 1
          })
        }
        
        // 再更新价格和类型
        await updateMarketplaceItem({
          collection_id: editFormData.collection_id,
          card_id: editFormData.card_id,
          priceCash: editFormData.priceCash,
          type: editFormData.type
        })
        
        ElMessage.success('更新商品成功')
        editDrawerVisible.value = false
        fetchMarketplaceList() // 刷新列表
      } catch (error) {
        console.error('更新商品失败：', error)
        ElMessage.error('更新商品失败')
      } finally {
        editLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 撤下商品
const handleWithdraw = async (row: MarketplaceCard) => {
  try {
    await ElMessageBox.confirm(
      `确定要撤下商品“${row.card_name}”吗？撤下后该商品将从官方市场移除。`,
      '确认撤下',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const withdrawParams: WithdrawMarketplaceItemParams = {
      collection_id: searchForm.collectionId,
      card_id: row.id
    }
    
    await withdrawMarketplaceItem(withdrawParams)
    ElMessage.success('商品已成功撤下')
    fetchMarketplaceList() // 刷新列表
  } catch (error) {
    if (error !== 'cancel') {
      console.error('撤下商品失败：', error)
      ElMessage.error('撤下商品失败')
    }
  }
}

// 用户购买
const handleUserBuyout = (row: MarketplaceCard) => {
  currentBuyoutCard.value = row
  buyoutForm.userId = ''
  buyoutForm.quantity = 1
  buyoutDialogVisible.value = true
}

// 提交用户购买
const submitBuyout = async () => {
  if (!currentBuyoutCard.value || !buyoutForm.userId) {
    ElMessage.warning('请输入用户ID')
    return
  }

  try {
    await updateUserBuyout(buyoutForm.userId, {
      collection_id: searchForm.collectionId,
      card_id: currentBuyoutCard.value.id,
      quantity: buyoutForm.quantity
    })
    ElMessage.success('用户购买处理成功')
    buyoutDialogVisible.value = false
    fetchMarketplaceList() // 刷新列表
  } catch (error) {
    console.error('用户购买处理失败：', error)
    ElMessage.error('用户购买处理失败')
  }
}

// 卡牌选择相关函数
// 打开卡牌选择弹窗
const handleSelectCard = () => {
  if (!addFormData.collection_id) {
    ElMessage.warning('请先选择卡片分类')
    return
  }
  cardSelectDialogVisible.value = true
  cardCurrentPage.value = 1
  cardSearchQuery.value = ''
  cardSortBy.value = 'point_worth'
  cardSortOrder.value = 'asc'
  cardRarityMin.value = undefined
  cardRarityMax.value = undefined
  cardPointWorthMin.value = undefined
  cardPointWorthMax.value = undefined
  fetchCardList()
}

// 获取卡牌列表
const fetchCardList = async () => {
  if (!addFormData.collection_id) return
  
  cardLoading.value = true
  try {
    const params: any = {
      collectionName: addFormData.collection_id,
      page: cardCurrentPage.value,
      per_page: cardPageSize.value,
      search_query: cardSearchQuery.value,
      sort_by: cardSortBy.value,
      sort_order: cardSortOrder.value
    }
    
    // 添加稀有度筛选参数
    if (cardRarityMin.value !== undefined) {
      params.rarity_min = cardRarityMin.value
    }
    if (cardRarityMax.value !== undefined) {
      params.rarity_max = cardRarityMax.value
    }
    
    // 添加积分筛选参数
    if (cardPointWorthMin.value !== undefined) {
      params.point_worth_min = cardPointWorthMin.value
    }
    if (cardPointWorthMax.value !== undefined) {
      params.point_worth_max = cardPointWorthMax.value
    }
    
    const response = await getCardList(params)
    
    // 适配API响应结构
    cardList.value = response.cards || []
    cardTotal.value = response.pagination?.total_items || 0
  } catch (error) {
    console.error('获取卡牌列表失败：', error)
    ElMessage.error('获取卡牌列表失败')
    cardList.value = []
    cardTotal.value = 0
  } finally {
    cardLoading.value = false
  }
}

// 搜索卡牌
const searchCards = () => {
  cardCurrentPage.value = 1
  fetchCardList()
}

// 重置搜索
const resetCardSearch = () => {
  cardSearchQuery.value = ''
  cardSortBy.value = 'point_worth'
  cardSortOrder.value = 'asc'
  cardRarityMin.value = undefined
  cardRarityMax.value = undefined
  cardPointWorthMin.value = undefined
  cardPointWorthMax.value = undefined
  cardCurrentPage.value = 1
  fetchCardList()
}

// 选择卡牌
const selectCard = (card: Card) => {
  addFormData.card_id = card.id
  cardSelectDialogVisible.value = false
  ElMessage.success(`已选择卡牌：${card.card_name}`)
}

// 处理卡牌行点击
const handleCardRowClick = (row: Card) => {
  selectCard(row)
}

// 获取稀有度标签
const getRarityLabel = (rarity: number | string) => {
  return rarityMap[rarity] || rarity
}

// 卡牌分页处理
const handleCardSizeChange = (val: number) => {
  cardPageSize.value = val
  fetchCardList()
}

const handleCardCurrentChange = (val: number) => {
  cardCurrentPage.value = val
  fetchCardList()
}

// 排序条件变化处理
const handleCardSortChange = () => {
  cardCurrentPage.value = 1
  fetchCardList()
}

// 初始化
onMounted(() => {
  fetchCollections()
  isMounted.value = true
})

// 保存状态到localStorage
onDeactivated(() => {
  localStorage.setItem('marketplace_state', JSON.stringify({
    searchForm: {
      collectionId: searchForm.collectionId,
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
onActivated(() => {
  const savedState = localStorage.getItem('marketplace_state')
  
  if (savedState) {
    const parsed = JSON.parse(savedState)
    
    // 恢复搜索表单
    if (parsed.searchForm) {
      searchForm.collectionId = parsed.searchForm.collectionId
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
  
  // 如果有选择的卡片分类，则重新加载卡片列表
  if (searchForm.collectionId) {
    fetchMarketplaceList()
  }
})
</script>

<style scoped lang="scss">
.marketplace-container {
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

.card-select-container {
  .card-search-form {
    margin-bottom: 16px;
    padding: 16px;
    background-color: #f5f7fa;
    border-radius: 4px;
  }

  .card-pagination {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>