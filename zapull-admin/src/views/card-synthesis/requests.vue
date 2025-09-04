<template>
  <div class="requests-container">
    <el-card class="search-card">
      <el-form :model="searchForm" inline>
        <el-form-item label="分类">
          <el-select style="width:150px" v-model="searchForm.collectionId" placeholder="请选择分类" clearable @change="handleCollectionChange">
            <el-option 
              v-for="collection in collections" 
              :key="collection.collection_id" 
              :label="collection.name" 
              :value="collection.storagePrefix" 
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用户ID">
          <el-input v-model="searchForm.userId" placeholder="请输入用户ID" clearable />
        </el-form-item>
        <el-form-item label="目标卡牌">
          <el-input v-model="searchForm.searchQuery" placeholder="请输入目标卡牌" clearable />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 卡包和配方列表 -->
    <el-card class="pack-recipe-list-card">
      <el-table :data="packList" border stripe>
        <el-table-column type="expand">
          <template #default="{ row }">
            <div class="expanded-recipes">
              <h4>{{ row.pack_id }} - 配方列表</h4>
              <el-table :data="row.cards" border style="width: 100%">
                <el-table-column label="卡牌名称" min-width="150">
                  <template #default="{ row }">
                    {{ row.result_card_name || row.result_card_id }}
                  </template>
                </el-table-column>
                <el-table-column label="所需材料" min-width="300">
                  <template #default="{ row: cardRow }">
                    <div class="ingredients-container">
                      <div v-for="ingredient in cardRow.ingredients" :key="ingredient.card_id" class="ingredient-item">
                        <el-tag type="success" size="small">
                          {{ ingredient.card_name || ingredient.card_id }}
                        </el-tag>
                        <span class="ingredient-details">
                          <span>x{{ ingredient.quantity }}</span>
                          <span>({{ ((ingredient.probability || 0) * 100).toFixed(2) }}%)</span>
                        </span>
                      </div>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column label="合成进度" min-width="120">
                  <template #default="{ row: cardRow }">
                    <el-progress 
                      :percentage="cardRow.cards_needed > 0 ? (cardRow.cards_needed / cardRow.total_cards_needed) * 100 : 0"
                      :format="() => `${cardRow.cards_needed}/${cardRow.total_cards_needed}`"
                      :stroke-width="8"
                    />
                  </template>
                </el-table-column>
                <el-table-column label="操作" width="100" fixed="right">
                  <template #default="{ row: cardRow }">
                    <el-button link type="primary" @click="handleRowClick(cardRow, row)">查看详情</el-button>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="pack_id" label="卡包ID" min-width="150" />
        <el-table-column prop="collection_id" label="分类" min-width="120" />
        <el-table-column prop="cards_count" label="配方数量" width="100" />
      </el-table>
    </el-card>

    <!-- 卡片详情抽屉 -->
    <el-drawer
      v-model="drawerVisible"
      title="卡片详情"
      direction="rtl"
      size="50%"
    >
      <div v-if="selectedCard" class="card-detail-content">
        <el-descriptions title="基本信息" :column="2" border>
          <el-descriptions-item label="卡牌名称">{{ selectedCard.result_card_name || selectedCard.result_card_id }}</el-descriptions-item>
          <el-descriptions-item label="卡牌ID">{{ selectedCard.result_card_id }}</el-descriptions-item>
          <el-descriptions-item label="卡包">{{ selectedCard.pack_id }}</el-descriptions-item>
          <el-descriptions-item label="分类">{{ selectedCard.collection_id }}</el-descriptions-item>
          <el-descriptions-item label="合成进度" :span="2">
            <el-progress 
              :percentage="selectedCard.cards_needed > 0 ? (selectedCard.cards_needed / selectedCard.total_cards_needed) * 100 : 0"
              :format="() => `${selectedCard.cards_needed}/${selectedCard.total_cards_needed}`"
              :stroke-width="12"
            />
          </el-descriptions-item>
        </el-descriptions>
        
        <el-divider>所需材料</el-divider>
        <el-table :data="selectedCard.ingredients" border style="width: 100%">
          <el-table-column label="材料名称" min-width="120">
            <template #default="{ row }">
              {{ row.card_name || row.card_id }}
            </template>
          </el-table-column>
          <el-table-column prop="quantity" label="数量" width="80" />
        </el-table>
      </div>
    </el-drawer>

    <div class="pagination-container">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50, 100]"
        :small="false"
        :disabled="false"
        :background="true"
        layout="total, sizes, prev, pager, next, jumper"
        :total="totalItems"
        @size-change="handleSizeChange"
        @current-change="handleCurrentChange"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { ElMessage, ElDivider } from 'element-plus'
import { 
  getFusionRecipes, 
  RecipeListResponse, 
  RecipeCard 
} from '../../api/fusion'
import { getCardCollectionsWithPokemen } from '../../api/storage'

// 搜索表单数据
const searchForm = reactive({
  collectionId: '',
  userId: '',
  searchQuery: ''
})

// 是否已挂载
const isMounted = ref(false)

// 分页数据
const currentPage = ref(1)
const pageSize = ref(10)

// 表格数据
const recipeData = ref<RecipeListResponse>({
  collections: [],
  pagination: {
    total_items: 0,
    total_pages: 0,
    current_page: 1,
    per_page: 10
  },
  filters: {
    sort_by: 'result_card_id',
    sort_order: 'desc',
    search_query: ''
  }
})

const loading = ref(false)
const collections = ref<any[]>([])

// 获取分类列表
const fetchCollections = async () => {
  try {
    const { collections: collectionsList, pokemenCollection } = await getCardCollectionsWithPokemen()
    collections.value = collectionsList
    
    // 如果有pokemen相关的分类，自动选择
    if (pokemenCollection) {
      searchForm.collectionId = pokemenCollection
      // 如果组件已挂载，则自动获取配方列表
      if (isMounted.value) {
        fetchRecipes()
      }
    }
  } catch (error) {
    console.error('获取分类列表失败:', error)
    ElMessage.error('获取分类列表失败')
  }
}

// 获取配方列表
const fetchRecipes = async () => {
  loading.value = true
  try {
    recipeData.value = await getFusionRecipes({
      collection_id: searchForm.collectionId,
      user_id: searchForm.userId,
      page: currentPage.value,
      per_page: pageSize.value,
      search_query: searchForm.searchQuery
    })
  } catch (error) {
    console.error('获取配方列表失败:', error)
    ElMessage.error('获取配方列表失败')
  } finally {
    loading.value = false
  }
}

// 分类变更
const handleCollectionChange = () => {
  currentPage.value = 1
  fetchRecipes()
}

// 抽屉相关变量
const drawerVisible = ref(false)
const selectedCard = ref<RecipeCard | null>(null)

// 计算总条目数
const totalItems = computed(() => recipeData.value.pagination?.total_items || 0)

// 卡包列表数据
  const packList = computed(() => {
    const packs: Array<{ pack_id: string, collection_id: string, cards_count: number, cards: RecipeCard[] }> = []
    recipeData.value.collections?.forEach(collection => {
      collection.packs?.forEach(pack => {
        packs.push({
          pack_id: pack.pack_id,
          collection_id: collection.collection_id,
          cards_count: pack.cards_count || pack.cards.length,
          cards: pack.cards
        })
      })
    })
    return packs
  })

 // 行点击处理
 const handleRowClick = (cardRow: RecipeCard, packRow: { pack_id: string, collection_id: string, cards_count: number, cards: RecipeCard[] }) => {
   selectedCard.value = {
     ...cardRow,
     pack_id: packRow?.pack_id || '',
     collection_id: packRow?.collection_id || ''
   }
   drawerVisible.value = true
 }

// 查看详情
const handleDetail = (row: RecipeCard) => {
  selectedCard.value = row
  drawerVisible.value = true
}

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  fetchRecipes()
}

// 重置方法
const handleReset = () => {
  searchForm.collectionId = ''
  searchForm.userId = ''
  searchForm.searchQuery = ''
  currentPage.value = 1
  fetchRecipes()
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  fetchRecipes()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  fetchRecipes()
}

// 初始化
onMounted(() => {
  fetchCollections()
  isMounted.value = true
})
</script>

<style scoped lang="scss">
.requests-container {
  .search-card {
    margin-bottom: 12px;
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

  .pagination-container {
    margin-top: 12px;
    display: flex;
    justify-content: flex-end;
  }

  .mr-2 {
    margin-right: 8px;
  }
  
  .card-detail-content {
    padding: 12px;
    
    .el-descriptions {
      margin-bottom: 12px;
    }
    
    .el-divider {
      margin: 12px 0;
    }
    
    .el-table {
      margin-top: 8px;
    }
  }
}
</style>