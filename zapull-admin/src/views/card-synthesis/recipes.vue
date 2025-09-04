<template>
  <div class="recipes-container">
    <el-card class="search-card">
      <div class="header-actions">
        <el-button type="primary" @click="handleAdd">新增配方</el-button>
      </div>
      <el-form :model="searchForm" inline class="mt-4">
        <el-form-item label="分类">
          <el-select v-model="searchForm.collectionId" style="width:150px" placeholder="请选择分类" clearable @change="handleCollectionChange">
            <el-option 
              v-for="collection in collections" 
              :key="collection.storagePrefix" 
              :label="collection.name" 
              :value="collection.storagePrefix" 
            
            />
          </el-select>
        </el-form-item>
        <el-form-item label="卡牌名称">
          <el-input v-model="searchForm.cardNameSearch" placeholder="请输入卡牌名称" clearable />
        </el-form-item>
        <el-form-item label="卡包名称">
          <el-input v-model="searchForm.packNameSearch" placeholder="请输入卡包名称" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 卡包和配方列表 -->
    <el-card class="pack-recipe-list-card">
      <el-table 
        :data="packList" 
        border 
        stripe
        :expand-row-keys="expandedPackIds"
        row-key="pack_id"
        @expand-change="handleRowExpand"
        v-loading="loading"
      >
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expanded-recipes">
              <h4>{{ row.pack_id }} - 配方列表</h4>
              <div v-if="loadingPacks.has(row.pack_id)" style="text-align: center; padding: 20px;">
                <el-icon class="is-loading"><Loading /></el-icon>
                <p>加载配方中...</p>
              </div>
              <el-table v-else-if="packRecipesMap.has(row.pack_id)" :data="packRecipesMap.get(row.pack_id)" border style="width: 100%">
                <el-table-column label="卡牌名称" min-width="180">
                  <template #default="{ row: cardRow }">
                    <el-popover
                      placement="top"
                      :width="200"
                      trigger="click"
                    >
                      <template #reference>
                        <el-link type="primary" class="clickable-card-name">
                          {{ cardRow.result_card_name || cardRow.result_card_id }}
                        </el-link>
                      </template>
                      <div class="card-preview">
                        <el-image 
                          v-if="cardRow.result_card_image_url" 
                          :src="cardRow.result_card_image_url" 
                          style="width: 100%; max-height: 200px;"
                          fit="contain"
                        />
                        <div v-else class="no-image">无图片</div>
                        <div class="card-preview-info">
                          <p><strong>{{ cardRow.result_card_name || cardRow.result_card_id }}</strong></p>
                          <p>积分价值: {{ cardRow.result_card_point_worth ?? 0 }}</p>
                        </div>
                      </div>
                    </el-popover>
                  </template>
                </el-table-column>
                <el-table-column label="所需材料" min-width="400">
                  <template #default="{ row: cardRow }">
                    <div class="ingredients-list">
                      <div 
                        v-for="ingredient in cardRow.ingredients" 
                        :key="ingredient.card_id" 
                        class="ingredient-info"
                      >
                        <el-popover
                          placement="top"
                          :width="200"
                          trigger="click"
                        >
                          <template #reference>
                            <el-tag type="success" size="small" class="clickable-tag">
                              {{ ingredient.card_name || ingredient.card_id }}
                            </el-tag>
                          </template>
                          <div class="ingredient-preview">
                            <el-image 
                              v-if="ingredient.image_url" 
                              :src="ingredient.image_url" 
                              style="width: 100%; max-height: 200px;"
                              fit="contain"
                            />
                            <div v-else class="no-image">无图片</div>
                            <div class="ingredient-preview-info">
                              <p><strong>{{ ingredient.card_name || ingredient.card_id }}</strong></p>
                              <p>概率: {{ (ingredient.probability ?? 0) * 100 }}%</p>
                              <p>积分价值: {{ ingredient.point_worth ?? 0 }}</p>
                            </div>
                          </div>
                        </el-popover>
                        <span class="ingredient-details">
                          <span class="detail-item">概率: {{ (ingredient.probability ?? 0) * 100 }}%</span>
                          <span class="detail-item">积分: {{ ingredient.point_worth ?? 0 }}</span>
                          <span class="detail-item">数量: {{ ingredient.quantity }}</span>
                        </span>
                      </div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="180" fixed="right">
                  <template #default="{ row: cardRow }">
                    <el-button link type="primary" @click="handleRowClick(cardRow, row)">查看详情</el-button>
                    <el-button link type="primary" @click="handleEdit(cardRow, row)">编辑</el-button>
                    <el-button link type="danger" @click="handleDelete(cardRow, row)">
                      <el-icon><Delete /></el-icon>
                      删除
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              <div v-else style="text-align: center; padding: 20px; color: #909399;">
                <p>点击展开加载配方数据</p>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="pack_id" label="卡包ID" min-width="150" />
        <el-table-column prop="pack_name" label="卡包名称" min-width="150" />
        <el-table-column prop="collection_id" label="分类" min-width="120" />
        <el-table-column prop="cards_count" label="配方数量" width="100" />
      </el-table>
    </el-card>

    <!-- 展开行详情 -->
    <el-drawer
      v-model="drawerVisible"
      title="卡片详情"
      size="50%"
      :destroy-on-close="true"
      direction="rtl"
    >
      <div v-if="selectedCard" class="card-detail-content">
        <el-descriptions title="基本信息" :column="2" border>
          <el-descriptions-item label="卡牌名称">{{ selectedCard.result_card_name || selectedCard.card_reference }}</el-descriptions-item>
          <el-descriptions-item label="卡牌ID">{{ selectedCard.result_card_id }}</el-descriptions-item>
          <el-descriptions-item label="所属卡包">{{ selectedCard.pack_id }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ selectedCard.collection_id }}</el-descriptions-item>
        </el-descriptions>
        
        <div class="result-card-preview" v-if="selectedCard.result_card_image_url">
          <el-divider content-position="left">结果卡牌</el-divider>
          <el-image 
            :src="selectedCard.result_card_image_url" 
            style="max-width: 200px; max-height: 200px;"
            fit="contain"
          />
        </div>
        
        <el-divider content-position="left">所需材料</el-divider>
        <el-table :data="selectedCard.ingredients" border style="width: 100%">
          <el-table-column label="图片" width="100">
            <template #default="{ row }">
              <el-image 
                v-if="row.image_url" 
                :src="row.image_url" 
                style="width: 60px; height: 60px;"
                fit="contain"
                :preview-src-list="[row.image_url]"
              />
              <span v-else>无图片</span>
            </template>
          </el-table-column>
          <el-table-column label="材料名称" min-width="150">
            <template #default="{ row }">
              {{ row.card_name || row.card_id }}
            </template>
          </el-table-column>
          <el-table-column label="概率(%)" width="100" align="center">
            <template #default="{ row }">
              {{ ((row.probability ?? 0) * 100).toFixed(2) }}%
            </template>
          </el-table-column>
          <el-table-column label="积分价值" width="90" align="center">
            <template #default="{ row }">
              {{ row.point_worth ?? 0 }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" width="80" align="center" />
        </el-table>
      </div>
    </el-drawer>

    <div class="pagination-container">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :total="fusionPacksData.pagination?.total_items || 0"
        layout="total, sizes, prev, pager, next, jumper"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>

    <!-- 新增配方对话框 -->
    <el-dialog v-model="addDialogVisible" title="新增配方" width="600px">
      <el-form :model="recipeForm" :rules="recipeRules" ref="recipeFormRef" label-width="100px">
        <el-form-item label="分类" prop="card_collection_id">
          <el-select v-model="recipeForm.card_collection_id" placeholder="请选择分类" clearable>
            <el-option 
              v-for="collection in collections" 
              :key="collection.collection_id" 
              :label="collection.name" 
              :value="collection.storagePrefix" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="卡包分类" prop="pack_collection_id">
          <el-select v-model="recipeForm.pack_collection_id" placeholder="请选择卡包分类" clearable @change="handlePackCollectionChange">
            <el-option 
              v-for="collection in collections" 
              :key="collection.storagePrefix" 
              :label="collection.name" 
              :value="collection.storagePrefix" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="卡包ID" prop="pack_id">
          <div class="pack-select-container">
            <el-input v-model="recipeForm.pack_id" placeholder="请输入卡包ID" class="pack-id-input" />
            <el-button type="primary" @click="handleOpenPackSelection">选择卡包</el-button>
          </div>

        </el-form-item>
        <el-form-item label="目标卡牌" prop="result_card_id">
          <div class="card-select-container">
            <el-input v-model="recipeForm.result_card_id" placeholder="请输入目标卡牌ID" class="card-id-input" />
            <el-button type="primary" @click="handleSelectTargetCard" :disabled="!recipeForm.pack_id">选择卡牌</el-button>
          </div>
          <div class="form-tip" v-if="!recipeForm.pack_id">
            <el-text type="warning" size="small">请先选择卡包，然后从卡包中选择目标卡牌</el-text>
          </div>
          <div v-if="selectedTargetCard" class="selected-card-preview">
            <img 
              v-if="selectedTargetCard.image_url" 
              :src="selectedTargetCard.image_url" 
              class="selected-card-image"
            />
            <div v-else class="selected-card-image-placeholder">无图片</div>
            <div class="selected-card-info">
              <h4>{{ selectedTargetCard.card_name }}</h4>
              <p>ID: {{ selectedTargetCard.id }}</p>
              <p>稀有度: {{ selectedTargetCard.rarity }}</p>
            </div>
          </div>
        </el-form-item>
        <el-form-item label="材料">
          <div v-if="!recipeForm.pack_id" class="form-tip">
            <el-text type="warning" size="small">请先选择卡包，材料卡牌将从选择的卡包中挑选</el-text>
          </div>
          <div v-for="(ingredient, index) in recipeForm.ingredients" :key="index" class="ingredient-item">
            <div class="ingredient-card-container">
              <el-input v-model="ingredient.card_id" placeholder="卡牌ID" class="ingredient-input" />
              <el-button type="primary" @click="handleSelectIngredientCard(index)" :disabled="!recipeForm.pack_id">选择</el-button>
            </div>
            <el-input-number v-model="ingredient.quantity" :min="1" placeholder="数量" class="ingredient-input" />
            <el-button type="danger" circle @click="removeIngredient(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button type="primary" icon="Plus" @click="addIngredient">添加材料</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="addDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitRecipeForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>

    <!-- 编辑配方对话框 -->
    <el-dialog v-model="editDialogVisible" title="编辑配方" width="600px">
      <el-form :model="editForm" :rules="recipeRules" ref="editFormRef" label-width="100px">
        <el-form-item label="分类" prop="card_collection_id">
          <el-input v-model="editForm.card_collection_id" placeholder="请输入分类" disabled />
        </el-form-item>
        <el-form-item label="卡包分类" prop="pack_collection_id">
          <el-input v-model="editForm.pack_collection_id" placeholder="请输入卡包分类" disabled />
        </el-form-item>
        <el-form-item label="卡包ID" prop="pack_id">
          <div class="pack-select-container">
            <el-input v-model="editForm.pack_id" placeholder="请输入卡包ID" disabled class="pack-id-input" />
          </div>
        </el-form-item>
        <el-form-item label="目标卡牌" prop="result_card_id">
          <div class="card-select-container">
            <el-input v-model="editForm.result_card_id" placeholder="请输入目标卡牌ID" disabled class="card-id-input" />
          </div>
        </el-form-item>
        <el-form-item label="材料">
          <div v-for="(ingredient, index) in editForm.ingredients" :key="index" class="ingredient-item">
            <div class="ingredient-card-container">
              <el-input v-model="ingredient.card_id" placeholder="卡牌ID" class="ingredient-input" />
              <el-button type="primary" @click="handleSelectEditIngredientCard(index)">选择</el-button>
            </div>
            <el-input-number v-model="ingredient.quantity" :min="1" placeholder="数量" class="ingredient-input" />
            <el-button type="danger" circle @click="removeEditIngredient(index)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          <el-button type="primary" icon="Plus" @click="addEditIngredient">添加材料</el-button>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitEditForm" :loading="submitting">确定</el-button>
      </template>
    </el-dialog>
    
    <!-- 卡包选择对话框 -->
    <el-dialog
      v-model="packSelectionDialogVisible"
      title="选择卡包"
      width="80%"
      :destroy-on-close="false"
    >
      <div v-loading="packSelectionLoading">
        <div class="pack-selection-header">
          <el-form :model="packSearchForm" inline>
            <el-form-item label="搜索">
              <el-input v-model="packSearchForm.searchQuery" placeholder="请输入卡包名称" clearable @keyup.enter="handlePackSearch" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="handlePackSearch">查询</el-button>
              <el-button @click="resetPackSearch">重置</el-button>
            </el-form-item>
          </el-form>
        </div>
        
        <el-table :data="packSelectionData.packs" border stripe v-if="packSelectionData.packs && packSelectionData.packs.length > 0">
          <el-table-column prop="id" label="ID" width="150" />
          <el-table-column prop="name" label="名称" min-width="120" />
          <el-table-column prop="price" label="价格" width="80" align="center" />
          <el-table-column prop="win_rate" label="胜率(%)" width="80" align="center" />
          <el-table-column prop="popularity" label="热度" width="80" align="center" />
          <el-table-column prop="min_win" label="最小奖励" width="90" align="center" />
          <el-table-column prop="max_win" label="最大奖励" width="90" align="center" />
          <el-table-column prop="is_active" label="状态" width="80" align="center">
            <template #default="{ row }">
              <el-tag :type="row.is_active ? 'success' : 'danger'">
                {{ row.is_active ? '激活' : '未激活' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="图片" width="120">
            <template #default="{ row }">
              <el-image 
                v-if="row.image_url" 
                :src="row.image_url" 
                style="width: 50px; height: 50px;"
                fit="contain"
              />
              <span v-else>无图片</span>
            </template>
          </el-table-column>
          <el-table-column prop="created_at" label="创建时间" width="160">
            <template #default="{ row }">
              {{ new Date(row.created_at).toLocaleString() }}
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="handleSelectPack(row)">选择</el-button>
            </template>
          </el-table-column>
        </el-table>
        
        <div v-else class="no-packs">
          <el-empty description="暂无卡包数据" />
        </div>
        
        <div class="pack-pagination" v-if="packSelectionData.pagination">
          <el-pagination
            v-model:current-page="packCurrentPage"
            v-model:page-size="packPageSize"
            :page-sizes="[10, 20, 50, 100]"
            :total="packSelectionData.pagination?.total_items || 0"
            layout="total, sizes, prev, pager, next, jumper"
            @size-change="handlePackSizeChange"
            @current-change="handlePackCurrentChange"
          />
        </div>
      </div>
    </el-dialog>
    
    <!-- 卡片选择对话框 -->
    <el-dialog
      v-model="cardSelectionDialogVisible"
      :title="cardSelectionTitle"
      width="70%"
      :destroy-on-close="false"
    >
      <div class="card-select-container">
        <!-- 简化的搜索区域 - 只保留名称筛选 -->
        <el-form inline class="card-search-form" style="margin-bottom: 20px;">
          <el-form-item label="卡牌名称">
            <el-input
              v-model="cardNameFilter"
              placeholder="请输入卡牌名称进行筛选"
              clearable
              @input="handleCardNameFilter"
              style="width: 300px;"
            />
          </el-form-item>
          <el-form-item>
            <el-button @click="resetCardNameFilter">重置</el-button>
          </el-form-item>
        </el-form>

        <!-- 卡牌列表 -->
        <el-table
          :data="filteredCardSelectionData"
          border
          stripe
          v-loading="cardSelectionLoading"
          @row-click="handleSelectCard"
          style="cursor: pointer; width: 100%;"
          max-height="400px"
        >
          <el-table-column prop="card_name" label="卡牌名称" min-width="180" />
          <el-table-column prop="rarity" label="稀有度" min-width="120">
            <template #default="{ row }">
              <span>{{ getRarityLabel(row.rarity) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="point_worth" label="积分价值" min-width="100" />
          <el-table-column label="图片" min-width="100">
            <template #default="{ row }">
              <el-image
                v-if="row.image_url"
                :src="row.image_url"
                style="width: 60px; height: 60px"
                :preview-src-list="[row.image_url]"
              />
              <span v-else>-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" size="small" @click.stop="handleSelectCard(row)">选择</el-button>
            </template>
          </el-table-column>
        </el-table>

        <!-- 显示筛选结果统计 -->
        <div class="card-filter-info" style="margin-top: 10px; color: #666; font-size: 14px;">
          <span>共找到 {{ filteredCardSelectionData.length }} 张卡牌</span>
          <span v-if="cardNameFilter" style="margin-left: 20px;">筛选条件：{{ cardNameFilter }}</span>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Delete, Loading } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  getFusionRecipes, 
  createFusionRecipe, 
  updateFusionRecipe, 
  deleteFusionRecipe, 
  getFusionPacksInCollection,
  getFusionRecipesByPack,
  RecipeListResponse, 
  RecipeCard,
  RecipeIngredient,
  IngredientDetail,
  FusionPack,
  FusionPacksResponse
} from '../../api/fusion'
import { getCardCollections, getCardCollectionsWithPokemen, getCardList, Card } from '../../api/storage'
import { getPackList, getInactivePackList, PackCollection, PackListResponse, getPackCollections as getPackCollectionsList, getPackCards } from '../../api/packs'

// 搜索表单数据
const searchForm = reactive({
  collectionId: '',
  searchQuery: '',
  userId: '',
  cardNameSearch: '',
  packNameSearch: ''
})

// 分页数据
const currentPage = ref(1)
const pageSize = ref(10)

// 表格数据 - 改为存储fusion packs
const fusionPacksData = ref<FusionPacksResponse>({
  collection_id: '',
  packs: [],
  pagination: {
    total_items: 0,
    total_pages: 0,
    current_page: 1,
    per_page: 10
  }
})

// 存储每个pack的recipes (key是pack_id)
const packRecipesMap = ref<Map<string, RecipeCard[]>>(new Map())

// 当前展开的pack
const expandedPackIds = ref<string[]>([])

// 卡包列表数据
const packList = computed(() => {
  return fusionPacksData.value.packs.map(pack => ({
    pack_id: pack.pack_id,
    pack_name: pack.pack_name,
    collection_id: fusionPacksData.value.collection_id,
    cards_count: pack.fusion_count,
    cards: packRecipesMap.value.get(pack.pack_id) || []
  }))
})



// 抽屉相关
const drawerVisible = ref(false)
const selectedCard = ref<(RecipeCard & { collection_id: string, pack_id: string }) | null>(null)

const loading = ref(false)
const loadingPacks = ref(new Set<string>()) // Track loading state for individual packs
const collections = ref<any[]>([])
const isMounted = ref(false)

// 新增配方表单
const addDialogVisible = ref(false)
const recipeFormRef = ref()
const recipeForm = reactive({
  result_card_id: '',
  card_collection_id: '',
  pack_id: '',
  pack_collection_id: '',
  collection_metadata_id: '', // 添加collection_metadata_id字段，用于存储卡包的分类ID
  ingredients: [{ card_id: '', quantity: 1 }]
})

// 编辑配方表单
const editDialogVisible = ref(false)
const editFormRef = ref()
const currentRecipe = ref<RecipeCard | null>(null)
const editForm = reactive({
  result_card_id: '',
  card_collection_id: '',
  pack_id: '',
  pack_collection_id: '',
  ingredients: [] as IngredientDetail[],
  originalIngredients: [] as IngredientDetail[]
})

// 表单验证规则
const recipeRules = {
  result_card_id: [{ required: true, message: '请输入目标卡牌ID', trigger: 'blur' }],
  card_collection_id: [{ required: true, message: '请选择分类', trigger: 'change' }],
  pack_id: [{ required: true, message: '请输入卡包ID', trigger: 'blur' }],
  pack_collection_id: [{ required: true, message: '请输入卡包分类', trigger: 'blur' }]
}

const submitting = ref(false)

// 获取分类列表
const fetchCollections = async () => {
  try {
    const { collections: collectionsList, pokemenCollection } = await getCardCollectionsWithPokemen()
    collections.value = collectionsList
    // 自动选择pokemen相关的分类
    if (pokemenCollection) {
      // 将name转换为对应的id
      const pokemenCollectionObj = collectionsList.find((c: any) => c.name === pokemenCollection)
      if (pokemenCollectionObj) {
        searchForm.collectionId = pokemenCollectionObj.storagePrefix
        // 如果已经挂载，则自动获取融合卡包列表
        if (isMounted.value) {
          fetchFusionPacks()
        }
      }
    }
  } catch (error) {
    console.error('获取分类列表失败:', error)
    ElMessage.error('获取分类列表失败')
  }
}

// 获取有融合配方的卡包列表
const fetchFusionPacks = async () => {
  if (!searchForm.collectionId) {
    fusionPacksData.value = {
      collection_id: '',
      packs: [],
      pagination: {
        total_items: 0,
        total_pages: 0,
        current_page: 1,
        per_page: 10
      }
    }
    return
  }

  loading.value = true
  try {
    fusionPacksData.value = await getFusionPacksInCollection(searchForm.collectionId, {
      page: currentPage.value,
      per_page: pageSize.value,
      search_query: searchForm.packNameSearch || undefined,
      sort_by: 'pack_name',
      sort_order: 'asc'
    })
    
    // 清空之前的recipes
    packRecipesMap.value.clear()
    expandedPackIds.value = []
  } catch (error) {
    console.error('获取融合卡包列表失败:', error)
    ElMessage.error('获取融合卡包列表失败')
  } finally {
    loading.value = false
  }
}

// 获取特定卡包的配方列表
const fetchPackRecipes = async (packId: string) => {
  if (!searchForm.collectionId) return
  
  // Add pack to loading state
  loadingPacks.value.add(packId)
  
  try {
    const response = await getFusionRecipesByPack(searchForm.collectionId, packId, {
      user_id: searchForm.userId,
      page: 1,
      per_page: 1000, // 获取所有配方
      card_name_search: searchForm.cardNameSearch || undefined
    })
    
    // 从response中提取该pack的recipes
    if (response.collections && response.collections.length > 0) {
      const collection = response.collections[0]
      if (collection.packs && collection.packs.length > 0) {
        const pack = collection.packs.find((p: any) => p.pack_id === packId)
        if (pack && pack.cards) {
          packRecipesMap.value.set(packId, pack.cards)
        } else {
          // Set empty array if no cards found
          packRecipesMap.value.set(packId, [])
        }
      } else {
        // Set empty array if no packs found
        packRecipesMap.value.set(packId, [])
      }
    } else {
      // Set empty array if no collections found
      packRecipesMap.value.set(packId, [])
    }
  } catch (error) {
    console.error(`获取卡包 ${packId} 的配方失败:`, error)
    ElMessage.error(`获取卡包配方失败`)
    // Set empty array on error
    packRecipesMap.value.set(packId, [])
  } finally {
    // Remove pack from loading state
    loadingPacks.value.delete(packId)
  }
}

// 处理行展开
const handleRowExpand = async (row: any, expandedRows: any[]) => {
  const isExpanding = expandedRows.some(r => r.pack_id === row.pack_id)
  
  if (isExpanding) {
    // 展开时先添加到展开列表
    if (!expandedPackIds.value.includes(row.pack_id)) {
      expandedPackIds.value = [...expandedPackIds.value, row.pack_id]
    }
    
    // 然后加载配方（如果还没加载）
    if (!packRecipesMap.value.has(row.pack_id)) {
      await fetchPackRecipes(row.pack_id)
    }
  } else {
    // 收起时移除
    expandedPackIds.value = expandedPackIds.value.filter(id => id !== row.pack_id)
  }
}

// 分类变更
const handleCollectionChange = () => {
  currentPage.value = 1
  expandedPackIds.value = [] // Clear expanded state
  packRecipesMap.value.clear() // Clear cached recipes
  fetchFusionPacks()
}

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  expandedPackIds.value = [] // Clear expanded state
  packRecipesMap.value.clear() // Clear cached recipes
  fetchFusionPacks()
}

// 重置方法
const handleReset = () => {
  searchForm.collectionId = ''
  searchForm.searchQuery = ''
  searchForm.userId = ''
  searchForm.cardNameSearch = ''
  searchForm.packNameSearch = ''
  currentPage.value = 1
  expandedPackIds.value = [] // Clear expanded state
  packRecipesMap.value.clear() // Clear cached recipes
  fetchFusionPacks()
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  fetchFusionPacks()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  fetchFusionPacks()
}

// 卡包选择相关数据
const packSelectionDialogVisible = ref(false)
const packSelectionLoading = ref(false)
const packSelectionData = ref<PackListResponse>({
  packs: [],
  pagination: {
    total_items: 0,
    total_pages: 0,
    current_page: 1,
    per_page: 10
  },
  filters: {
    sort_by: 'popularity',
    sort_order: 'desc',
    search_query: ''
  },
  next_cursor: null
})
const packSearchForm = reactive({
  searchQuery: ''
})
const packCurrentPage = ref(1)
const packPageSize = ref(10)

// 卡片选择相关数据
const cardSelectionDialogVisible = ref(false)
const cardSelectionLoading = ref(false)
const cardSelectionData = ref<Card[]>([])
const cardSelectionTitle = ref('选择卡片')
const selectedTargetCard = ref<Card | null>(null)
const currentEditIngredientIndex = ref(-1)
const isSelectingTargetCard = ref(false)
const isSelectingIngredient = ref(false)
const isSelectingEditIngredient = ref(false)

// 卡片选择相关数据 - 简化版本
const cardNameFilter = ref('')
const allCardSelectionData = ref<Card[]>([]) // 存储所有卡牌数据

// 计算属性：根据名称筛选卡牌
const filteredCardSelectionData = computed(() => {
  if (!cardNameFilter.value || !cardNameFilter.value.trim()) {
    return allCardSelectionData.value
  }
  
  const searchTerm = cardNameFilter.value.trim().toLowerCase()
  return allCardSelectionData.value.filter(card => 
    card.card_name && card.card_name.toLowerCase().includes(searchTerm)
  )
})

// 稀有度映射表
const rarityMap = {
  1: 'Common(普通)',
  2: 'Uncommon(非凡)',
  3: 'Rare(稀有)',
  4: 'Epic(史诗)',
  5: 'Legendary(传说)',
  6: 'Mythic(神话)',
  7: 'Unique(唯一)'
}

// 新增配方
const handleAdd = () => {
  recipeForm.result_card_id = ''
  recipeForm.card_collection_id = ''
  recipeForm.pack_id = ''
  recipeForm.pack_collection_id = ''
  recipeForm.collection_metadata_id = '' // 重置collection_metadata_id字段
  recipeForm.ingredients = [{ card_id: '', quantity: 1 }]
  selectedTargetCard.value = null
  addDialogVisible.value = true
}

// 添加材料
const addIngredient = () => {
  recipeForm.ingredients.push({ card_id: '', quantity: 1 })
}

// 移除材料
const removeIngredient = (index: number) => {
  recipeForm.ingredients.splice(index, 1)
  if (recipeForm.ingredients.length === 0) {
    addIngredient()
  }
}

// 提交新增配方表单
const submitRecipeForm = async () => {
  if (!recipeFormRef.value) return
  
  await recipeFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      submitting.value = true
      try {
        // 过滤掉空的材料
        const validIngredients = recipeForm.ingredients.filter(item => item.card_id && item.quantity > 0)
        if (validIngredients.length === 0) {
          ElMessage.warning('请至少添加一种材料')
          return
        }
        
        await createFusionRecipe({
          result_card_id: recipeForm.result_card_id,
          card_collection_id: recipeForm.card_collection_id,
          pack_id: recipeForm.pack_id,
          pack_collection_id: recipeForm.pack_collection_id,
          collection_metadata_id: recipeForm.collection_metadata_id, // 添加collection_metadata_id字段
          ingredients: validIngredients
        })
        
        ElMessage.success('创建配方成功')
        addDialogVisible.value = false
        fetchFusionPacks()
      } catch (error) {
        console.error('创建配方失败:', error)
        ElMessage.error('创建配方失败')
      } finally {
        submitting.value = false
      }
    }
  })
}

// 编辑配方
const handleEdit = (cardRow: RecipeCard, packRow: { pack_id: string, collection_id: string, cards_count: number, cards: RecipeCard[] }) => {
  currentRecipe.value = cardRow
  editForm.result_card_id = cardRow.result_card_id
  editForm.card_collection_id = cardRow.card_collection_id
  editForm.pack_id = cardRow.pack_id
  editForm.pack_collection_id = cardRow.pack_collection_id
  editForm.ingredients = JSON.parse(JSON.stringify(cardRow.ingredients))
  editForm.originalIngredients = JSON.parse(JSON.stringify(cardRow.ingredients))
  editDialogVisible.value = true
}

// 添加编辑材料
const addEditIngredient = () => {
  editForm.ingredients.push({
    card_collection_id: '',
    card_id: '',
    card_reference: '',
    quantity: 1
  })
}

// 移除编辑材料
const removeEditIngredient = (index: number) => {
  editForm.ingredients.splice(index, 1)
  if (editForm.ingredients.length === 0) {
    addEditIngredient()
  }
}

// 提交编辑配方表单
const submitEditForm = async () => {
  if (!editFormRef.value || !currentRecipe.value) return
  
  await editFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      submitting.value = true
      try {
        // 计算添加和删除的材料
        const addedIngredients: RecipeIngredient[] = []
        const deletedIngredients: RecipeIngredient[] = []
        
        // 找出新增的材料
        editForm.ingredients.forEach(ingredient => {
          const original = editForm.originalIngredients.find(i => i.card_id === ingredient.card_id)
          if (!original) {
            addedIngredients.push({
              card_id: ingredient.card_id,
              quantity: ingredient.quantity
            })
          } else if (original.quantity !== ingredient.quantity) {
            // 数量变更，先删除再添加
            deletedIngredients.push({
              card_id: original.card_id,
              quantity: original.quantity
            })
            addedIngredients.push({
              card_id: ingredient.card_id,
              quantity: ingredient.quantity
            })
          }
        })
        
        // 找出删除的材料
        editForm.originalIngredients.forEach(original => {
          const exists = editForm.ingredients.some(i => i.card_id === original.card_id)
          if (!exists) {
            deletedIngredients.push({
              card_id: original.card_id,
              quantity: original.quantity
            })
          }
        })
        
        // 如果没有变更，直接返回
        if (addedIngredients.length === 0 && deletedIngredients.length === 0) {
          ElMessage.info('配方未发生变更')
          editDialogVisible.value = false
          return
        }
        
        await updateFusionRecipe(
          currentRecipe.value.pack_collection_id,
          currentRecipe.value.pack_id,
          currentRecipe.value.result_card_id,
          {
            card_collection_id: editForm.card_collection_id,
            pack_id: editForm.pack_id,
            pack_collection_id: editForm.pack_collection_id,
            added_ingredients: addedIngredients.length > 0 ? addedIngredients : undefined,
            deleted_ingredients: deletedIngredients.length > 0 ? deletedIngredients : undefined
          }
        )
        
        ElMessage.success('更新配方成功')
        editDialogVisible.value = false
        // 重新加载该pack的recipes
        packRecipesMap.value.delete(editForm.pack_id)
        await fetchPackRecipes(editForm.pack_id)
      } catch (error) {
        console.error('更新配方失败:', error)
        ElMessage.error('更新配方失败')
      } finally {
        submitting.value = false
      }
    }
  })
}

// 行点击事件
const handleRowClick = (cardRow: RecipeCard, packRow: { pack_id: string, collection_id: string, cards_count: number, cards: RecipeCard[] }) => {
  selectedCard.value = {
    ...cardRow,
    collection_id: packRow?.collection_id || '',
    pack_id: packRow?.pack_id || ''
  }
  drawerVisible.value = true
}

// 删除配方
const handleDelete = (cardRow: RecipeCard, packRow: { pack_id: string, collection_id: string, cards_count: number, cards: RecipeCard[] }) => {
  ElMessageBox.confirm('确定要删除该配方吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteFusionRecipe(
        cardRow.pack_collection_id,
        cardRow.pack_id,
        cardRow.result_card_id
      )
      ElMessage.success('删除配方成功')
      // 重新加载该pack的recipes
      packRecipesMap.value.delete(cardRow.pack_id)
      await fetchPackRecipes(cardRow.pack_id)
    } catch (error) {
      console.error('删除配方失败:', error)
      ElMessage.error('删除配方失败')
    }
  }).catch(() => {})
}

// 选择目标卡牌
const handleSelectTargetCard = async () => {
  if (!recipeForm.card_collection_id) {
    ElMessage.warning('请先选择分类')
    return
  }
  
  if (!recipeForm.pack_id || !recipeForm.pack_collection_id) {
    ElMessage.warning('请先选择卡包')
    return
  }

  isSelectingTargetCard.value = true
  isSelectingIngredient.value = false
  isSelectingEditIngredient.value = false
  cardSelectionTitle.value = '选择目标卡牌（从选择的卡包中）'
  await openCardSelection(recipeForm.card_collection_id)
}

// 选择材料卡牌
const handleSelectIngredientCard = async (index: number) => {
  if (!recipeForm.card_collection_id) {
    ElMessage.warning('请先选择分类')
    return
  }
  
  if (!recipeForm.pack_id || !recipeForm.pack_collection_id) {
    ElMessage.warning('请先选择卡包')
    return
  }

  isSelectingTargetCard.value = false
  isSelectingIngredient.value = true
  isSelectingEditIngredient.value = false
  currentEditIngredientIndex.value = index
  cardSelectionTitle.value = '选择材料卡牌（从选择的卡包中）'
  await openCardSelection(recipeForm.card_collection_id)
}

// 选择编辑材料卡牌
const handleSelectEditIngredientCard = async (index: number) => {
  isSelectingTargetCard.value = false
  isSelectingIngredient.value = false
  isSelectingEditIngredient.value = true
  currentEditIngredientIndex.value = index
  cardSelectionTitle.value = '选择材料卡牌（从选择的卡包中）'
  await openCardSelection(editForm.card_collection_id)
}

// 打开卡片选择对话框
const openCardSelection = async (collectionId: string) => {
  cardSelectionData.value = []
  cardSelectionDialogVisible.value = true
  // 重置搜索条件
  resetCardSelection()
  // 加载卡片列表
  await fetchCardSelectionData()
}

// 获取卡片选择数据 - 简化版本
const fetchCardSelectionData = async () => {
  cardSelectionLoading.value = true
  try {
    // 判断是否在编辑模式下
    const isEditMode = isSelectingEditIngredient.value
    const packId = isEditMode ? editForm.pack_id : recipeForm.pack_id
    const packCollectionId = isEditMode ? editForm.pack_collection_id : recipeForm.pack_collection_id
    const collectionId = isEditMode ? editForm.card_collection_id : recipeForm.card_collection_id
    
    // 如果已选择卡包，则从卡包中获取卡牌列表
    if (packId && packCollectionId) {
      const cards = await getPackCards(
        packCollectionId,
        packId,
        { sort_by: 'card_name' } // 默认按卡牌名称排序
      )
      
      // 存储所有卡牌数据，筛选由计算属性处理
      allCardSelectionData.value = cards
    } else {
      // 否则从整个分类中获取卡牌列表
      const params: any = {
        collectionName: collectionId,
        page: 1,
        per_page: 1000, // 获取更多数据以便前端筛选
        sort_by: 'card_name',
        sort_order: 'asc'
      }
      
      const response = await getCardList(params)
      allCardSelectionData.value = response.cards
    }
  } catch (error) {
    console.error('获取卡片列表失败：', error)
    ElMessage.error('获取卡片列表失败')
    allCardSelectionData.value = []
  } finally {
    cardSelectionLoading.value = false
  }
}

// 处理名称筛选
const handleCardNameFilter = () => {
  // 筛选逻辑由计算属性自动处理，这里不需要额外操作
}

// 重置名称筛选
const resetCardNameFilter = () => {
  cardNameFilter.value = ''
}

// 重置卡片选择 - 简化版本
const resetCardSelection = () => {
  cardNameFilter.value = ''
  allCardSelectionData.value = []
}

// 获取稀有度标签
const getRarityLabel = (rarity: number | string): string => {
  return rarityMap[Number(rarity)] || `稀有度${rarity}`
}

// 选择卡片
const handleSelectCard = (card: Card) => {
  if (isSelectingTargetCard.value) {
    // 选择目标卡牌
    recipeForm.result_card_id = card.id
    selectedTargetCard.value = card
  } else if (isSelectingIngredient.value) {
    // 选择新增配方的材料卡牌
    if (currentEditIngredientIndex.value >= 0 && currentEditIngredientIndex.value < recipeForm.ingredients.length) {
      recipeForm.ingredients[currentEditIngredientIndex.value].card_id = card.id
    }
  } else if (isSelectingEditIngredient.value) {
    // 选择编辑配方的材料卡牌
    if (currentEditIngredientIndex.value >= 0 && currentEditIngredientIndex.value < editForm.ingredients.length) {
      editForm.ingredients[currentEditIngredientIndex.value].card_id = card.id
    }
  }
  
  cardSelectionDialogVisible.value = false
}

// 卡包分类变更
const handlePackCollectionChange = () => {
  // 清空卡包ID
  recipeForm.pack_id = ''
  // 清空已选择的目标卡牌和材料
  recipeForm.result_card_id = ''
  selectedTargetCard.value = null
  // 清空所有材料卡牌ID
  recipeForm.ingredients.forEach(ingredient => {
    ingredient.card_id = ''
  })
}

// 打开卡包选择对话框
const handleOpenPackSelection = () => {
  if (!recipeForm.pack_collection_id) {
    ElMessage.warning('请先选择卡包分类')
    return
  }
  
  packSelectionDialogVisible.value = true
  fetchPackList()
}

// 获取卡包列表
const fetchPackList = async () => {
  if (!recipeForm.pack_collection_id) {
    ElMessage.warning('请先选择卡包分类')
    return
  }
  
  packSelectionLoading.value = true
  try {
    console.log('Fetching inactive packs for collection:', recipeForm.pack_collection_id)
    console.log('Request params:', {
      page: packCurrentPage.value,
      per_page: packPageSize.value,
      search_query: packSearchForm.searchQuery || undefined,
      sort_by: 'popularity',
      sort_order: 'desc'
    })
    
    // 获取未激活的卡包列表，用于配方管理
    packSelectionData.value = await getInactivePackList(
      recipeForm.pack_collection_id,
      {
        page: packCurrentPage.value,
        per_page: packPageSize.value,
        search_query: packSearchForm.searchQuery || undefined,
        sort_by: 'popularity',
        sort_order: 'desc'
      }
    )
    
    console.log('Fetched packs successfully:', packSelectionData.value)
  } catch (error) {
    console.error('获取卡包列表失败 - Full error:', error)
    ElMessage.error('获取卡包列表失败')
  } finally {
    packSelectionLoading.value = false
  }
}

// 卡包搜索
const handlePackSearch = () => {
  packCurrentPage.value = 1
  fetchPackList()
}

// 重置卡包搜索
const resetPackSearch = () => {
  packSearchForm.searchQuery = ''
  packCurrentPage.value = 1
  fetchPackList()
}

// 卡包分页方法
const handlePackSizeChange = (val: number) => {
  packPageSize.value = val
  fetchPackList()
}

const handlePackCurrentChange = (val: number) => {
  packCurrentPage.value = val
  fetchPackList()
}

// 选择卡包
const handleSelectPack = (pack: any) => {
  recipeForm.pack_id = pack.id
  // 设置collection_metadata_id为卡包的分类ID
  if (pack.id && recipeForm.pack_collection_id) {
    // 使用卡包分类ID作为collection_metadata_id
    recipeForm.collection_metadata_id = recipeForm.pack_collection_id
  }
  
  // 清空已选择的目标卡牌和材料，因为需要从新的卡包中重新选择
  recipeForm.result_card_id = ''
  selectedTargetCard.value = null
  // 清空所有材料卡牌ID
  recipeForm.ingredients.forEach(ingredient => {
    ingredient.card_id = ''
  })
  
  packSelectionDialogVisible.value = false
}

// 初始化
onMounted(() => {
  console.log('=== RECIPES.VUE VERSION: NEW VERSION WITH result_card_name ===')
  fetchCollections()
  isMounted.value = true
})
</script>

<style scoped lang="scss">
.recipes-container {
  .search-card {
    margin-bottom: 12px;
  }

  .header-actions {
    margin-bottom: 16px;
  }

  .pack-recipe-list-card {
    margin-bottom: 12px;
    
    :deep(.el-table) {
      width: 100% !important;
      table-layout: auto;
    }
    
    :deep(.el-table__row) {
      cursor: pointer;
      
      &:hover {
        background-color: #f5f7fa;
      }
    }
  }

  .expanded-recipes {
    padding: 12px;
    background-color: #f8f9fa;
    border-radius: 4px;
    
    h4 {
      margin: 0 0 10px 0;
      color: #409EFF;
      font-size: 16px;
    }
    
    :deep(.el-table) {
      width: 100% !important;
      table-layout: auto;
    }
    
    :deep(.el-table__row) {
      cursor: pointer;
      
      &:hover {
        background-color: #ffffff;
      }
    }
  }

  .card-detail-content {
    padding: 12px;
    
    .el-descriptions {
      margin-bottom: 12px;
    }
    
    .el-table {
      margin-top: 8px;
    }
  }

  .pagination-container {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
  }

  .mr-2 {
    margin-right: 8px;
  }

  .ingredients-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 4px 0;
  }

  .ingredient-info {
    display: flex;
    align-items: center;
    gap: 8px;
    
    .ingredient-details {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #606266;
      
      .detail-item {
        white-space: nowrap;
      }
    }
  }

  .result-card-preview {
    margin: 16px 0;
    text-align: center;
  }

  .clickable-tag {
    cursor: pointer;
    transition: all 0.3s;
    
    &:hover {
      transform: translateY(-2px);
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
  }

  .clickable-card-name {
    cursor: pointer;
    transition: all 0.3s;
    
    &:hover {
      text-decoration: underline;
    }
  }

  .card-preview {
    text-align: center;
    
    .no-image {
      width: 100%;
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f5f7fa;
      color: #909399;
      margin-bottom: 10px;
    }
    
    .card-preview-info {
      margin-top: 10px;
      
      p {
        margin: 5px 0;
      }
    }
  }

  .ingredient-preview {
    text-align: center;
    
    .no-image {
      width: 100%;
      height: 150px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f5f7fa;
      color: #909399;
      margin-bottom: 10px;
    }
    
    .ingredient-preview-info {
      margin-top: 10px;
      
      p {
        margin: 5px 0;
        font-size: 13px;
        color: #606266;
        
        strong {
          color: #303133;
          font-size: 14px;
        }
      }
    }
  }

  .ingredient-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    
    .ingredient-input {
      margin-right: 10px;
    }
  }
  
  .card-select-container {
    margin-bottom: 10px;
    
    .el-table {
      width: 100% !important;
    }
  }
  
  .pack-select-container {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
    
    .pack-id-input {
      margin-right: 10px;
      flex: 1;
    }
  }
  
  .ingredient-card-container {
    display: flex;
    align-items: center;
    flex: 1;
    
    .ingredient-input {
      margin-right: 10px;
    }
  }
  
  .selected-card-preview, .selected-pack-preview {
    display: flex;
    align-items: center;
    margin-top: 10px;
    margin-bottom: 15px;
    padding: 12px;
    border: 1px solid #ebeef5;
    border-radius: 4px;
    background-color: #f9f9f9;
    
    .selected-card-image {
      width: 60px;
      height: 60px;
      object-fit: cover;
      margin-right: 10px;
      border-radius: 4px;
    }
    
    .selected-card-image-placeholder {
      width: 60px;
      height: 60px;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #ebeef5;
      color: #909399;
      margin-right: 10px;
      border-radius: 4px;
      font-size: 12px;
    }
    
    .selected-card-info, .selected-pack-info {
      h4 {
        margin: 0 0 5px 0;
        font-size: 14px;
      }
      
      p {
        margin: 0 0 3px 0;
        font-size: 12px;
        color: #606266;
      }
    }
  }
  
  .card-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    margin-top: 16px;
    
    .card-item {
      cursor: pointer;
      transition: transform 0.2s;
      
      &:hover {
        transform: translateY(-5px);
      }
      
      .card-image {
        width: 100%;
        height: 180px;
        object-fit: cover;
      }
      
      .card-image-placeholder {
        width: 100%;
        height: 180px;
        display: flex;
        align-items: center;
        justify-content: center;
        background-color: #f5f7fa;
        color: #909399;
      }
      
      .card-info {
        padding: 10px;
        
        .card-name {
          font-weight: bold;
          margin-bottom: 5px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .card-rarity, .card-points {
          font-size: 12px;
          color: #606266;
        }
      }
    }
  }
  
  .no-cards, .no-packs {
    padding: 40px 0;
    text-align: center;
  }
  
  .form-tip {
    margin-top: 4px;
    padding: 4px 8px;
    background-color: #fdf6ec;
    border: 1px solid #faecd8;
    border-radius: 4px;
  }
  
  .pack-selection-header {
    margin-bottom: 16px;
  }
  
  .pack-pagination {
    margin-top: 16px;
    display: flex;
    justify-content: flex-end;
  }
}
</style>