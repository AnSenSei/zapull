<template>
  <div class="packs-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>卡包管理</span>
          <el-button type="primary" @click="goToCreate">创建卡包</el-button>
        </div>
      </template>
      <div class="search-bar">
        <el-form :inline="true" :model="searchForm" class="demo-form-inline">
          <el-form-item label="卡包分类" required>
            <el-select 
              v-model="selectedCollectionId" 
              placeholder="请选择卡包分类"
              @change="handleCollectionChange"
              style="width: 180px"
            >
              <el-option 
                v-for="item in collections" 
                :key="item.name" 
                :label="item.name" 
                :value="item.name" 
              />
            </el-select>
          </el-form-item>
          <el-form-item label="卡片状态">
            <el-select 
              v-model="activeStatus" 
              placeholder="请选择卡片状态"
              @change="handleActiveStatusChange"
              style="width: 120px"
            >
              <el-option label="激活" value="active" />
              <el-option label="未激活" value="inactive" />
            </el-select>
          </el-form-item>
          <el-form-item label="卡包名称">
            <el-input v-model="searchForm.search_query" placeholder="请输入卡包名称" clearable />
          </el-form-item>
          <el-form-item label="排序">
            <el-select 
              v-model="searchForm.sort_by" 
              placeholder="请选择排序"
              @change="handleSortChange"
              style="width: 120px"
            >
              <el-option label="热度" value="popularity" />
              <el-option label="名称" value="name" />
              <el-option label="中奖率" value="win_rate" />
              <el-option label="最大中奖" value="max_win" />
              <el-option label="最小中奖" value="min_win" />
            </el-select>
          </el-form-item>
          <el-form-item label="排序方向">
            <el-select 
              v-model="searchForm.sort_order" 
              @change="handleSortChange"
              style="width: 100px"
            >
              <el-option label="降序" value="desc" />
              <el-option label="升序" value="asc" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSearch" :disabled="!selectedCollectionId">搜索</el-button>
            <el-button @click="resetSearch">重置</el-button>
          </el-form-item>
        </el-form>
      </div>
      <el-table :data="packList" style="width: 100%" v-loading="loading">
        <el-table-column label="图片" width="100">
          <template #default="scope">
            <el-image
              v-if="scope.row.image_url"
              :src="scope.row.image_url"
              :preview-src-list="[scope.row.image_url]"
              fit="cover"
              style="width: 60px; height: 60px; border-radius: 4px;"
              :z-index="9999"
              :preview-teleported="true"
            />
            <div v-else style="width: 60px; height: 60px; background: #f5f7fa; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #909399; font-size: 12px;">
              无图片
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="name" label="卡包名称" />
        <el-table-column prop="price" label="价格" />
        <el-table-column prop="max_win" label="最大中奖金额" />
        <el-table-column prop="min_win" label="最小中奖金额" />
        <el-table-column prop="win_rate" label="中奖率" />
        <el-table-column prop="popularity" label="热度" />
        <el-table-column prop="created_at" label="创建时间" />
        <el-table-column prop="is_active" label="状态">
          <template #default="scope">
            <el-tag :type="scope.row.is_active ? 'success' : 'danger'">
              {{ scope.row.is_active ? '激活' : '未激活' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="250">
          <template #default="scope">
            <div class="operation-buttons">
              <el-button size="small" @click="viewDetail(scope.row)">查看</el-button>
              <el-button 
                size="small" 
                :type="scope.row.is_active ? 'danger' : 'success'"
                @click="toggleActiveStatus(scope.row)"
              >
                {{ scope.row.is_active ? '停用' : '激活' }}
              </el-button>
              <el-dropdown @command="(command: string) => handleCommand(command, scope.row)">
                <el-button size="small" type="primary">
                  更多<el-icon class="el-icon--right"><arrow-down /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="name">修改名称</el-dropdown-item>
                    <el-dropdown-item command="image">修改图片</el-dropdown-item>
                    <el-dropdown-item command="price">修改价格</el-dropdown-item>
                    <el-dropdown-item command="maxWin">修改最大中奖</el-dropdown-item>
                    <el-dropdown-item command="minWin">修改最小中奖</el-dropdown-item>
                    <el-dropdown-item command="winRate">修改胜率</el-dropdown-item>
                    <el-dropdown-item command="separation">修改分类</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>
      <div class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 30, 50]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
          @size-change="handleSizeChange"
          @current-change="handleCurrentChange"
        />
      </div>
    </el-card>
  </div>

  <!-- 修改价格对话框 -->
  <el-dialog v-model="priceDialogVisible" title="修改卡包价格" width="30%">
    <el-form :model="priceForm" label-width="100px">
      <el-form-item label="卡包名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="当前价格">
        <span>{{ currentPack?.price }}</span>
      </el-form-item>
      <el-form-item label="新价格" required>
        <el-input-number v-model="priceForm.price" :min="0" :precision="2" :step="0.1" />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="priceDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdatePrice" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 修改最大中奖金额对话框 -->
  <el-dialog v-model="maxWinDialogVisible" title="修改最大中奖金额" width="30%">
    <el-form :model="maxWinForm" label-width="120px">
      <el-form-item label="卡包名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="当前最大中奖">
        <span>{{ currentPack?.max_win }}</span>
      </el-form-item>
      <el-form-item label="新最大中奖金额" required>
        <el-input-number v-model="maxWinForm.maxWin" :min="0" :precision="2" :step="0.1" />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="maxWinDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdateMaxWin" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 修改最小中奖金额对话框 -->
  <el-dialog v-model="minWinDialogVisible" title="修改最小中奖金额" width="30%">
    <el-form :model="minWinForm" label-width="120px">
      <el-form-item label="卡包名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="当前最小中奖">
        <span>{{ currentPack?.min_win }}</span>
      </el-form-item>
      <el-form-item label="新最小中奖金额" required>
        <el-input-number v-model="minWinForm.minWin" :min="0" :precision="2" :step="0.1" />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="minWinDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdateMinWin" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 修改胜率对话框 -->
  <el-dialog v-model="winRateDialogVisible" title="修改卡包胜率" width="30%">
    <el-form :model="winRateForm" label-width="100px">
      <el-form-item label="卡包名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="当前胜率">
        <span>{{ currentPack?.win_rate }}%</span>
      </el-form-item>
      <el-form-item label="新胜率" required>
        <el-input-number v-model="winRateForm.winRate" :min="0" :max="100" :precision="0" :step="1" />
        <div style="font-size: 12px; color: #909399; margin-top: 4px;">请输入0-100之间的整数</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="winRateDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdateWinRate" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 修改名称对话框 -->
  <el-dialog v-model="nameDialogVisible" title="修改卡包名称" width="30%">
    <el-form :model="nameForm" label-width="100px">
      <el-form-item label="当前名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="新名称" required>
        <el-input v-model="nameForm.name" placeholder="请输入新的卡包名称" />
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="nameDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdateName" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>

  <!-- 修改图片对话框 -->
  <el-dialog v-model="imageDialogVisible" title="修改卡包图片" width="30%">
    <el-form :model="imageForm" label-width="100px">
      <el-form-item label="卡包名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="当前图片">
        <el-image
          v-if="currentPack?.image_url"
          :src="currentPack.image_url"
          :preview-src-list="[currentPack.image_url]"
          fit="cover"
          style="width: 100px; height: 100px; border-radius: 4px;"
        />
        <div v-else style="width: 100px; height: 100px; background: #f5f7fa; border-radius: 4px; display: flex; align-items: center; justify-content: center; color: #909399;">
          无图片
        </div>
      </el-form-item>
      <el-form-item label="新图片" required>
        <el-upload
          class="image-uploader"
          :auto-upload="false"
          :on-change="handleImageChange"
          :show-file-list="false"
          accept="image/*"
          drag
        >
          <div v-if="!imagePreview" class="upload-placeholder">
            <el-icon class="el-icon--upload"><upload-filled /></el-icon>
            <div class="el-upload__text">
              将图片拖到此处，或<em>点击上传</em>
            </div>
            <div class="el-upload__tip">
              支持 jpg/png 格式，文件大小不超过 5MB
            </div>
          </div>
          <div v-else class="image-preview">
            <img :src="imagePreview" style="width: 150px; height: 150px; object-fit: cover; border-radius: 4px;" />
            <div class="preview-actions">
              <el-button size="small" @click.stop="clearImage">重新选择</el-button>
            </div>
          </div>
        </el-upload>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="imageDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdateImage" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>
  
  <!-- 修改分类对话框 -->
  <el-dialog v-model="separationDialogVisible" title="修改分类" width="30%">
    <el-form :model="separationForm" label-width="100px">
      <el-form-item label="卡包名称">
        <span>{{ currentPack?.name }}</span>
      </el-form-item>
      <el-form-item label="当前分类">
        <el-tag :type="getSeparationTagType(currentPack?.separation)">
          {{ getSeparationLabel(currentPack?.separation) }}
        </el-tag>
      </el-form-item>
      <el-form-item label="新分类" required>
        <el-select v-model="separationForm.separation" placeholder="请选择分类" style="width: 100%">
          <el-option label="Feature Packs" value="feature" />
          <el-option label="Hunt Packs" value="hunt" />
          <el-option label="Special Packs" value="special" />
          <el-option label="Other Packs" value="other" />
        </el-select>
        <div style="font-size: 12px; color: #909399; margin-top: 4px;">选择卡包的分类类型</div>
      </el-form-item>
    </el-form>
    <template #footer>
      <span class="dialog-footer">
        <el-button @click="separationDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitUpdateSeparation" :loading="submitLoading">确认</el-button>
      </span>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { 
  getPackList, 
  getInactivePackList, 
  updatePackActiveStatus,
  updatePackMaxWin,
  updatePackMinWin,
  updatePackPrice,
  updatePackWinRate,
  updatePackName,
  updatePackImage,
  updatePackSeparation
} from '@/api/packs'
import { getCardCollections } from '@/api/storage'
import type { PackCollection, PackListResponse } from '@/api/packs'
import type { CardCollection } from '@/api/storage'
import { ElMessage } from 'element-plus'
import { ArrowDown, UploadFilled } from '@element-plus/icons-vue'

const router = useRouter()
const route = useRoute()
const loading = ref(false)
const submitLoading = ref(false)
const packList = ref<PackCollection[]>([])
const collections = ref<CardCollection[]>([])
const selectedCollectionId = ref('')
const activeStatus = ref('active') // 新增：卡片激活状态筛选，默认已激活
const isMounted = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)
const searchForm = ref({
  search_query: '',
  sort_by: 'popularity',
  sort_order: 'desc' as 'asc' | 'desc'
})

// 对话框状态
const priceDialogVisible = ref(false)
const maxWinDialogVisible = ref(false)
const minWinDialogVisible = ref(false)
const winRateDialogVisible = ref(false)
const nameDialogVisible = ref(false)
const imageDialogVisible = ref(false)
const separationDialogVisible = ref(false)

// 当前操作的卡包
const currentPack = ref<PackCollection | null>(null)

// 表单数据
const priceForm = ref({
  price: 0
})

const maxWinForm = ref({
  maxWin: 0
})

const minWinForm = ref({
  minWin: 0
})

const winRateForm = ref({
  winRate: 0
})

const nameForm = ref({
  name: ''
})

const imageForm = ref({
  imageFile: ''
})

const separationForm = ref({
  separation: 'other'
})

// 图片预览
const imagePreview = ref('')

// 获取卡包集合
const fetchCollections = async () => {
  try {
    const collectionsList = await getCardCollections()
    collections.value = collectionsList
    
    // 如果有分类，自动选择第一个
    if (collectionsList.length > 0) {
      selectedCollectionId.value = collectionsList[0].name
      // 如果组件已挂载，则自动获取卡包列表
      if (isMounted.value) {
        fetchPackList()
      }
    }
  } catch (error) {
    console.error('获取卡包集合失败:', error)
    ElMessage.error('获取卡包集合失败')
  }
}

// 处理分类变更
const handleCollectionChange = () => {
  currentPage.value = 1
  fetchPackList()
}

// 处理激活状态变更
const handleActiveStatusChange = () => {
  currentPage.value = 1
  fetchPackList()
}

// 处理排序变更
const handleSortChange = () => {
  currentPage.value = 1
  fetchPackList()
}

// 获取卡包列表
const fetchPackList = async () => {
  if (!selectedCollectionId.value) {
    packList.value = []
    total.value = 0
    return
  }
  
  loading.value = true
  try {
    // 根据激活状态选择不同的API
    if (activeStatus.value === 'inactive') {
      // 获取未激活卡包列表
      const params = {
        page: currentPage.value,
        per_page: pageSize.value,
        search_query: searchForm.value.search_query || undefined,
        sort_by: searchForm.value.sort_by,
        sort_order: searchForm.value.sort_order
      }
      
      const inactivePacksData = await getInactivePackList(selectedCollectionId.value, params)
      packList.value = inactivePacksData.packs
      total.value = inactivePacksData.pagination.total_items
    } else {
      // 获取激活卡包列表
      const params = {
        page: currentPage.value,
        per_page: pageSize.value,
        search_query: searchForm.value.search_query || undefined,
        sort_by: searchForm.value.sort_by,
        sort_order: searchForm.value.sort_order
      }
      
      const response: PackListResponse = await getPackList(selectedCollectionId.value, params)
      
      // The backend already returns only active packs, so no need to filter
      packList.value = response.packs
      total.value = response.pagination.total_items
    }
  } catch (error) {
    console.error('获取卡包列表失败:', error)
    ElMessage.error('获取卡包列表失败')
  } finally {
    loading.value = false
  }
}

// 搜索
const handleSearch = () => {
  currentPage.value = 1
  fetchPackList()
}

// 重置搜索
const resetSearch = () => {
  searchForm.value.search_query = ''
  activeStatus.value = 'active' // 重置激活状态筛选为默认的激活状态
  currentPage.value = 1
  // 保留当前选择的分类
  fetchPackList()
}

// 页码变化
const handleCurrentChange = (val: number) => {
  currentPage.value = val
  fetchPackList()
}

// 每页条数变化
const handleSizeChange = (val: number) => {
  pageSize.value = val
  currentPage.value = 1
  fetchPackList()
}

// 查看详情
const viewDetail = (row: PackCollection) => {
  // 将分类ID作为查询参数传递给详情页，并传递edit标志表示可以编辑
  router.push({
    path: `/storage/packs/${row.id}`,
    query: { 
      collectionId: selectedCollectionId.value,
      editMode: 'true'  // 标识从列表页进入，允许编辑
    }
  })
}

// 创建卡包
const goToCreate = () => {
  // 将当前选择的分类ID作为查询参数传递给创建页面
  router.push({
    path: '/storage/packs/create',
    query: { collectionId: selectedCollectionId.value }
  })
}

// 打开修改价格对话框
const openUpdatePriceDialog = (pack: PackCollection) => {
  currentPack.value = pack
  priceForm.value.price = pack.price || 0
  priceDialogVisible.value = true
}

// 提交修改价格
const submitUpdatePrice = async () => {
  if (!currentPack.value || !selectedCollectionId.value) return
  
  submitLoading.value = true
  try {
    await updatePackPrice(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      priceForm.value.price
    )
    ElMessage.success('价格修改成功')
    priceDialogVisible.value = false
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改价格失败:', error)
    ElMessage.error('修改价格失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改最大中奖金额对话框
const openUpdateMaxWinDialog = (pack: PackCollection) => {
  currentPack.value = pack
  maxWinForm.value.maxWin = pack.max_win || 0
  maxWinDialogVisible.value = true
}

// 提交修改最大中奖金额
const submitUpdateMaxWin = async () => {
  if (!currentPack.value || !selectedCollectionId.value) return
  
  submitLoading.value = true
  try {
    await updatePackMaxWin(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      maxWinForm.value.maxWin
    )
    ElMessage.success('最大中奖金额修改成功')
    maxWinDialogVisible.value = false
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改最大中奖金额失败:', error)
    ElMessage.error('修改最大中奖金额失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改最小中奖金额对话框
const openUpdateMinWinDialog = (pack: PackCollection) => {
  currentPack.value = pack
  minWinForm.value.minWin = pack.min_win || 0
  minWinDialogVisible.value = true
}

// 提交修改最小中奖金额
const submitUpdateMinWin = async () => {
  if (!currentPack.value || !selectedCollectionId.value) return
  
  submitLoading.value = true
  try {
    await updatePackMinWin(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      minWinForm.value.minWin
    )
    ElMessage.success('最小中奖金额修改成功')
    minWinDialogVisible.value = false
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改最小中奖金额失败:', error)
    ElMessage.error('修改最小中奖金额失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改胜率对话框
const openUpdateWinRateDialog = (pack: PackCollection) => {
  currentPack.value = pack
  winRateForm.value.winRate = pack.win_rate || 0
  winRateDialogVisible.value = true
}

// 提交修改胜率
const submitUpdateWinRate = async () => {
  if (!currentPack.value || !selectedCollectionId.value) return
  
  submitLoading.value = true
  try {
    await updatePackWinRate(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      winRateForm.value.winRate
    )
    ElMessage.success('胜率修改成功')
    winRateDialogVisible.value = false
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改胜率失败:', error)
    ElMessage.error('修改胜率失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改名称对话框
const openUpdateNameDialog = (pack: PackCollection) => {
  currentPack.value = pack
  nameForm.value.name = pack.name || ''
  nameDialogVisible.value = true
}

// 提交修改名称
const submitUpdateName = async () => {
  if (!currentPack.value || !selectedCollectionId.value || !nameForm.value.name.trim()) {
    ElMessage.warning('请输入卡包名称')
    return
  }
  
  submitLoading.value = true
  try {
    await updatePackName(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      nameForm.value.name.trim()
    )
    ElMessage.success('名称修改成功')
    nameDialogVisible.value = false
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改名称失败:', error)
    ElMessage.error('修改名称失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改图片对话框
const openUpdateImageDialog = (pack: PackCollection) => {
  currentPack.value = pack
  imageForm.value.imageFile = ''
  imagePreview.value = ''
  imageDialogVisible.value = true
}

// 处理图片变更
const handleImageChange = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string
    imageForm.value.imageFile = e.target?.result as string
  }
  reader.readAsDataURL(file.raw)
}

// 清除图片预览
const clearImage = () => {
  imagePreview.value = ''
  imageForm.value.imageFile = ''
}

// 提交修改图片
const submitUpdateImage = async () => {
  if (!currentPack.value || !selectedCollectionId.value || !imageForm.value.imageFile) {
    ElMessage.warning('请选择图片')
    return
  }
  
  submitLoading.value = true
  try {
    await updatePackImage(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      imageForm.value.imageFile
    )
    ElMessage.success('图片修改成功')
    imageDialogVisible.value = false
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改图片失败:', error)
    ElMessage.error('修改图片失败')
  } finally {
    submitLoading.value = false
  }
}

// 切换激活状态
const toggleActiveStatus = async (pack: PackCollection) => {
  if (!selectedCollectionId.value) return
  
  try {
    await updatePackActiveStatus(
      selectedCollectionId.value,
      pack.id.toString(),
      !pack.is_active
    )
    ElMessage.success(`卡包已${!pack.is_active ? '激活' : '停用'}`)
    fetchPackList() // 刷新列表
  } catch (error) {
    console.error('修改激活状态失败:', error)
    ElMessage.error('修改激活状态失败')
  }
}

// 打开修改分类对话框
const openUpdateSeparationDialog = (pack: PackCollection) => {
  currentPack.value = pack
  separationForm.value.separation = pack.separation || 'other'
  separationDialogVisible.value = true
}

// 提交修改分类
const submitUpdateSeparation = async () => {
  if (!currentPack.value || !selectedCollectionId.value) return
  
  submitLoading.value = true
  try {
    await updatePackSeparation(
      selectedCollectionId.value,
      currentPack.value.id.toString(),
      separationForm.value.separation
    )
    ElMessage.success('分类修改成功')
    // 更新本地状态
    currentPack.value.separation = separationForm.value.separation
    // 更新列表中的数据
    const index = packList.value.findIndex(p => p.id === currentPack.value?.id)
    if (index !== -1) {
      packList.value[index].separation = separationForm.value.separation
    }
    separationDialogVisible.value = false
  } catch (error) {
    console.error('修改分类失败:', error)
    ElMessage.error('修改分类失败')
  } finally {
    submitLoading.value = false
  }
}

// 获取分类标签类型
const getSeparationTagType = (separation?: string) => {
  switch (separation) {
    case 'feature':
      return 'warning'
    case 'hunt':
      return 'success'
    case 'special':
      return 'danger'
    case 'other':
    default:
      return ''
  }
}

// 获取分类标签文字
const getSeparationLabel = (separation?: string) => {
  switch (separation) {
    case 'feature':
      return 'Feature'
    case 'hunt':
      return 'Hunt'
    case 'special':
      return 'Special'
    case 'other':
    default:
      return 'Other'
  }
}

// 处理下拉菜单命令
const handleCommand = (command: string, pack: PackCollection) => {
  switch (command) {
    case 'name':
      openUpdateNameDialog(pack)
      break
    case 'image':
      openUpdateImageDialog(pack)
      break
    case 'price':
      openUpdatePriceDialog(pack)
      break
    case 'maxWin':
      openUpdateMaxWinDialog(pack)
      break
    case 'minWin':
      openUpdateMinWinDialog(pack)
      break
    case 'winRate':
      openUpdateWinRateDialog(pack)
      break
    case 'separation':
      openUpdateSeparationDialog(pack)
      break
    default:
      break
  }
}

onMounted(() => {
  // 检查URL中是否有传递的分类ID
  const collectionId = route.query.collectionId as string
  
  fetchCollections().then(() => {
    // 如果URL中有分类ID，则使用它
    if (collectionId && collections.value.some(c => c.id.toString() === collectionId)) {
      selectedCollectionId.value = collectionId
    }
    fetchPackList()
    isMounted.value = true
  })
})
</script>

<style scoped>
.packs-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.search-bar {
  margin-bottom: 20px;
}

.pagination {
  margin-top: 20px;
  text-align: right;
}

.operation-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.image-uploader {
  width: 100%;
}

.upload-placeholder {
  text-align: center;
  padding: 40px 0;
}

.upload-placeholder .el-icon--upload {
  font-size: 67px;
  color: #c0c4cc;
  margin-bottom: 16px;
}

.upload-placeholder .el-upload__text {
  color: #606266;
  font-size: 14px;
  margin-bottom: 8px;
}

.upload-placeholder .el-upload__text em {
  color: #409eff;
  font-style: normal;
}

.upload-placeholder .el-upload__tip {
  color: #909399;
  font-size: 12px;
}

.image-preview {
  text-align: center;
  padding: 20px;
}

.preview-actions {
  margin-top: 10px;
}
</style>