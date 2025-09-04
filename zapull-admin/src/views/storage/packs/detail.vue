<template>
  <div class="pack-detail-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>卡包详情</span>
          <el-button @click="goBack">返回</el-button>
        </div>
      </template>
      <div v-loading="loading">
        <div class="pack-info" v-if="packDetail">
          <div class="pack-image">
            <el-image 
              :src="packDetail.image_url" 
              alt="卡包图片"
              :preview-src-list="[packDetail.image_url]"
              :z-index="9999"
              :preview-teleported="true"
              fit="cover"
              style="width: 200px; height: 200px;"
            />
            <el-button 
              size="small" 
              type="primary" 
              style="margin-top: 10px; width: 100%"
              @click="openUpdateImageDialog"
            >
              修改图片
            </el-button>
          </div>
          <div class="pack-details">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <h2>{{ packDetail.name }}</h2>
              <el-button 
                size="small" 
                type="primary" 
                @click="openUpdateNameDialog"
              >
                修改名称
              </el-button>
            </div>
            <el-descriptions :column="2" border>
              <el-descriptions-item label="ID">{{ packDetail.id }}</el-descriptions-item>
              <el-descriptions-item label="价格">
                {{ packDetail.price }}
                <el-button 
                  size="small" 
                  type="primary" 
                  style="margin-left: 10px"
                  @click="openUpdatePriceDialog"
                >
                  修改价格
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item label="中奖率">
                {{ packDetail.win_rate }}%
                <el-button 
                  size="small" 
                  type="primary" 
                  style="margin-left: 10px"
                  @click="openUpdateWinRateDialog"
                >
                  修改胜率
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item label="最大中奖金额">
                {{ packDetail.max_win }}
                <el-button 
                  size="small" 
                  type="primary" 
                  style="margin-left: 10px"
                  @click="openUpdateMaxWinDialog"
                >
                  修改最大中奖金额
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item label="最小中奖金额">
                {{ packDetail.min_win }}
                <el-button 
                  size="small" 
                  type="primary" 
                  style="margin-left: 10px"
                  @click="openUpdateMinWinDialog"
                >
                  修改最小中奖金额
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item label="热度">
                {{ packDetail.popularity }}
                <el-button 
                  size="small" 
                  type="primary" 
                  style="margin-left: 10px"
                  @click="openUpdatePopularityDialog"
                >
                  修改热度
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item label="分类">
                <el-tag :type="getSeparationTagType(packDetail.separation)">
                  {{ getSeparationLabel(packDetail.separation) }}
                </el-tag>
                <el-button 
                  size="small" 
                  type="primary" 
                  style="margin-left: 10px"
                  @click="openUpdateSeparationDialog"
                >
                  修改分类
                </el-button>
              </el-descriptions-item>
              <el-descriptions-item label="创建时间">{{ packDetail.created_at }}</el-descriptions-item>
              <el-descriptions-item label="状态">
                <el-tag :type="packDetail.is_active ? 'success' : 'danger'">
                  {{ packDetail.is_active ? '激活' : '未激活' }}
                </el-tag>
                <el-button 
                  size="small" 
                  :type="packDetail.is_active ? 'danger' : 'success'" 
                  style="margin-left: 10px"
                  @click="toggleActiveStatus"
                >
                  {{ packDetail.is_active ? '设为未激活' : '设为激活' }}
                </el-button>
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </div>

        <div class="divider">
          <el-divider content-position="center">卡片列表</el-divider>
        </div>

        <div class="card-actions">
          <el-button type="primary" @click="openSelectCardDialog">添加卡片</el-button>
        </div>

        <el-table :data="cardList" style="width: 100%" v-loading="cardsLoading">
          <el-table-column prop="id" label="ID" width="80" />
          <el-table-column prop="card_name" label="卡片名称" />
          <el-table-column prop="rarity" label="稀有度" />
          <el-table-column prop="point_worth" label="积分价值" />
          <el-table-column prop="color" label="颜色" />
          <el-table-column label="图片" width="100">
            <template #default="scope">
              <el-image 
                v-if="scope.row.image_url"
                style="width: 50px; height: 50px; cursor: pointer;" 
                :src="scope.row.image_url" 
                :preview-src-list="[scope.row.image_url]"
                :preview-teleported="true"
                :z-index="2000"
                fit="contain"
                @click.stop
              />
            </template>
          </el-table-column>
          <el-table-column prop="probability" label="概率" />
          <el-table-column label="操作" width="180" fixed="right">
            <template #default="{ row }">
              <el-button 
                v-if="packDetail && !packDetail.is_active" 
                type="primary" 
                size="small" 
                @click="openEditCardDialog(row)"
              >
                编辑
              </el-button>
              <el-button type="danger" size="small" @click="confirmDeleteCard(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </el-card>

    <!-- 选择卡片对话框 -->
    <el-dialog v-model="selectCardDialogVisible" title="选择卡片" width="80%">
      <div class="card-select-container">
        <!-- 搜索区域 -->
        <el-form inline class="card-search-form">
          <!-- 卡片分类选择框已隐藏，默认使用当前卡包的分类ID -->
          <el-form-item label="稀有度范围">
            <div style="display: flex; gap: 10px; align-items: center;">
              <el-select v-model="cardRarityMin" placeholder="最低稀有度" clearable style="width: 120px;" @change="fetchAvailableCards">
                <el-option label="不限" :value="undefined" />
                <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
              </el-select>
              <span>至</span>
              <el-select v-model="cardRarityMax" placeholder="最高稀有度" clearable style="width: 120px;" @change="fetchAvailableCards">
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
                @change="fetchAvailableCards"
              />
              <span>至</span>
              <el-input-number
                v-model="cardPointWorthMax"
                placeholder="最高积分"
                :min="0"
                :precision="0"
                style="width: 120px;"
                @change="fetchAvailableCards"
              />
            </div>
          </el-form-item>
          <el-form-item label="排序字段">
             <el-select v-model="cardSortBy" placeholder="请选择排序字段" style="width: 150px;" clearable @change="fetchAvailableCards">
               <el-option label="点数" value="point_worth" />
               <el-option label="卡片名称" value="card_name" />
               <el-option label="入库时间" value="date_got_in_stock" />
               <el-option label="数量" value="quantity" />
               <el-option label="稀有度" value="rarity" />
             </el-select>
           </el-form-item>
           <el-form-item label="排序方式">
             <el-select v-model="cardSortOrder" placeholder="请选择排序方式" style="width: 150px;" clearable @change="fetchAvailableCards">
               <el-option label="升序" value="asc" />
               <el-option label="降序" value="desc" />
             </el-select>
           </el-form-item>
          <el-form-item label="卡牌名称">
            <el-input
              v-model="cardSearchQuery"
              placeholder="请输入卡牌名称"
              clearable
              @keyup.enter="handleCardSearch"
              style="width: 200px;"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleCardSearch">搜索</el-button>
            <el-button @click="resetCardSearch">重置</el-button>
          </el-form-item>
        </el-form>

        <!-- 卡牌列表 -->
        <el-table
          :data="availableCards"
          border
          stripe
          v-loading="cardsSearchLoading"
          @row-click="handleSelectCard"
          style="cursor: pointer;"
        >
          <el-table-column prop="card_name" label="卡牌名称" />
          <el-table-column prop="rarity" label="稀有度">
            <template #default="{ row }">
              <span>{{ getRarityLabel(row.rarity) }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="point_worth" label="积分价值" />
          <el-table-column prop="quantity" label="库存" />
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
          <el-table-column label="操作" width="100">
            <template #default="{ row }">
              <el-button type="primary" size="small" @click.stop="handleSelectCard(row)">选择</el-button>
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
    
    <!-- 添加卡片对话框 -->
    <el-dialog v-model="addCardDialogVisible" title="添加卡片" width="50%" @close="handleAddCardDialogClose">
      <div v-if="selectedCard" class="selected-card-info">
        <h3>已选择卡片</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ selectedCard.id }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ selectedCard.card_name }}</el-descriptions-item>
          <el-descriptions-item label="稀有度">{{ selectedCard.rarity }}</el-descriptions-item>
          <el-descriptions-item label="积分价值">{{ selectedCard.point_worth }}</el-descriptions-item>
        </el-descriptions>
        <div class="selected-card-image">
          <el-image 
            style="width: 100px; height: 100px" 
            :src="selectedCard.image_url" 
            :preview-src-list="[selectedCard.image_url]"
            fit="contain"
          />
        </div>
      </div>
      <el-form :model="cardForm" :rules="cardRules" ref="cardFormRef" label-width="120px">
        <el-form-item label="概率" prop="probability">
          <el-input-number v-model="cardForm.probability" :min="0" :max="100" :precision="2" :step="0.1" />
        </el-form-item>
        <el-form-item label="颜色" prop="color">
              <el-select v-model="cardForm.color" placeholder="请选择颜色">
                <el-option label="红色" value="red" />
                <el-option label="橙色" value="orange" />
                <el-option label="紫色" value="purple" />
                <el-option label="蓝色" value="blue" />
                <el-option label="绿色" value="green" />
              </el-select>
            </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="addCardDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitAddCard" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>
    
    <!-- 编辑卡片对话框 -->
    <el-dialog v-model="editCardDialogVisible" title="编辑卡片" width="50%">
      <div v-if="editingCard" class="selected-card-info">
        <h3>编辑卡片</h3>
        <el-descriptions :column="2" border>
          <el-descriptions-item label="ID">{{ editingCard.id }}</el-descriptions-item>
          <el-descriptions-item label="名称">{{ editingCard.card_name }}</el-descriptions-item>
          <el-descriptions-item label="稀有度">{{ editingCard.rarity }}</el-descriptions-item>
          <el-descriptions-item label="积分价值">{{ editingCard.point_worth }}</el-descriptions-item>
        </el-descriptions>
        <div class="selected-card-image">
          <el-image 
            style="width: 100px; height: 100px" 
            :src="editingCard.image_url" 
            :preview-src-list="[editingCard.image_url]"
            fit="contain"
          />
        </div>
      </div>
      <el-form :model="editCardForm" :rules="editCardRules" ref="editCardFormRef" label-width="120px">
        <el-form-item label="概率" prop="probability">
          <el-input-number v-model="editCardForm.probability" :min="0" :max="100" :precision="2" :step="0.1" />
        </el-form-item>
        <el-form-item label="颜色" prop="color">
          <el-select v-model="editCardForm.color" placeholder="请选择颜色">
            <el-option label="红色" value="red" />
            <el-option label="橙色" value="orange" />
            <el-option label="紫色" value="purple" />
            <el-option label="蓝色" value="blue" />
            <el-option label="绿色" value="green" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editCardDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitEditCard" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改最大中奖金额对话框 -->
    <el-dialog v-model="updateMaxWinDialogVisible" title="修改最大中奖金额" width="30%">
      <el-form :model="updateMaxWinForm" label-width="120px">
        <el-form-item label="最大中奖金额" required>
          <el-input-number v-model="updateMaxWinForm.maxWin" :min="0" :precision="0" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="updateMaxWinDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUpdateMaxWin" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改最小中奖金额对话框 -->
    <el-dialog v-model="updateMinWinDialogVisible" title="修改最小中奖金额" width="30%">
      <el-form :model="updateMinWinForm" label-width="120px">
        <el-form-item label="最小中奖金额" required>
          <el-input-number v-model="updateMinWinForm.minWin" :min="0" :precision="0" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="updateMinWinDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUpdateMinWin" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改价格对话框 -->
    <el-dialog v-model="updatePriceDialogVisible" title="修改价格" width="30%">
      <el-form :model="updatePriceForm" label-width="120px">
        <el-form-item label="价格" required>
          <el-input-number v-model="updatePriceForm.price" :min="0" :precision="0" :step="100" style="width: 100%" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="updatePriceDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUpdatePrice" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改胜率对话框 -->
    <el-dialog v-model="updateWinRateDialogVisible" title="修改胜率" width="30%">
      <el-form :model="updateWinRateForm" label-width="120px">
        <el-form-item label="胜率" required>
          <el-input-number v-model="updateWinRateForm.winRate" :min="0" :max="100" :precision="0" :step="1" style="width: 100%" />
          <div style="font-size: 12px; color: #909399; margin-top: 4px;">请输入0-100之间的整数</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="updateWinRateDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUpdateWinRate" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改热度对话框 -->
    <el-dialog v-model="updatePopularityDialogVisible" title="修改热度" width="30%">
      <el-form :model="updatePopularityForm" label-width="120px">
        <el-form-item label="热度" required>
          <el-input-number v-model="updatePopularityForm.popularity" :min="0" :precision="0" :step="1" style="width: 100%" />
          <div style="font-size: 12px; color: #909399; margin-top: 4px;">请输入大于等于0的整数</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="updatePopularityDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUpdatePopularity" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改分类对话框 -->
    <el-dialog v-model="updateSeparationDialogVisible" title="修改分类" width="30%">
      <el-form :model="updateSeparationForm" label-width="120px">
        <el-form-item label="分类" required>
          <el-select v-model="updateSeparationForm.separation" placeholder="请选择分类" style="width: 100%">
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
          <el-button @click="updateSeparationDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitUpdateSeparation" :loading="submitLoading">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 修改名称对话框 -->
    <el-dialog v-model="nameDialogVisible" title="修改卡包名称" width="30%">
      <el-form :model="nameForm" label-width="120px">
        <el-form-item label="卡包名称" required>
          <el-input v-model="nameForm.name" placeholder="请输入卡包名称" />
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
      <el-form :model="imageForm" label-width="120px">
        <el-form-item label="卡包图片" required>
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
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox, FormInstance, FormRules } from 'element-plus'
import { UploadFilled } from '@element-plus/icons-vue'
import { 
  getPackDetail, 
  getPackCards, 
  createCard, 
  deleteCards,
  deleteCard,
  updateCard,
  updatePackActiveStatus,
  updatePackMaxWin,
  updatePackMinWin,
  updatePackPrice,
  updatePackWinRate,
  updatePackPopularity,
  updatePackSeparation,
  updatePackName,
  updatePackImage,
  PackDetail, 
  Card, 
  CreateCardParams,
  UpdateCardParams 
} from '@/api/packs'
import { 
  getCardList, 
  getCardCollections, 
  CardCollection, 
  Card as StorageCard 
} from '@/api/storage'

const route = useRoute()
const router = useRouter()
const loading = ref(false)
const cardsLoading = ref(false)
const cardsSearchLoading = ref(false)
const submitLoading = ref(false)
const packDetail = ref<PackDetail | null>(null)
const cardList = ref<Card[]>([])
const addCardDialogVisible = ref(false)
const selectCardDialogVisible = ref(false)
const updateMaxWinDialogVisible = ref(false)
const updateMinWinDialogVisible = ref(false)
const updatePriceDialogVisible = ref(false)
const updateWinRateDialogVisible = ref(false)
const updatePopularityDialogVisible = ref(false)
const updateSeparationDialogVisible = ref(false)
const nameDialogVisible = ref(false)
const imageDialogVisible = ref(false)
const cardFormRef = ref<FormInstance>()
const editCardFormRef = ref<FormInstance>()
const editCardDialogVisible = ref(false)
const editingCard = ref<Card | null>(null)

// 编辑卡片表单
const editCardForm = ref({
  probability: 0,
  color: ''
})

// 编辑卡片表单验证规则
const editCardRules = ref<FormRules>({
  probability: [
    { required: true, message: '请输入概率', trigger: 'blur' },
    { type: 'number', min: 0, max: 100, message: '概率必须在0-100之间', trigger: 'blur' }
  ],
  color: [
    { required: true, message: '请选择颜色', trigger: 'change' }
  ]
})

// 修改表单数据
const updateMaxWinForm = ref({
  maxWin: 0
})

const updateMinWinForm = ref({
  minWin: 0
})

const updatePriceForm = ref({
  price: 0
})

const updateWinRateForm = ref({
  winRate: 0
})

const updatePopularityForm = ref({
  popularity: 0
})

const updateSeparationForm = ref({
  separation: 'other'
})

const nameForm = ref({
  name: ''
})

const imageForm = ref<{
  image_file: string;
  rawFile?: File;
}>({
  image_file: ''
})

const imagePreview = ref('')

// 卡片选择相关
const cardCollections = ref<CardCollection[]>([])
const selectedCardCollection = ref('')
const cardSearchQuery = ref('')
const cardSortBy = ref('')
const cardSortOrder = ref('')
const cardRarityMin = ref<number | undefined>(undefined)
const cardRarityMax = ref<number | undefined>(undefined)
const cardPointWorthMin = ref<number | undefined>(undefined)
const cardPointWorthMax = ref<number | undefined>(undefined)
const availableCards = ref<StorageCard[]>([])
const cardCurrentPage = ref(1)
const cardPageSize = ref(10)
const cardTotal = ref(0)
const selectedCard = ref<StorageCard | null>(null)

// 稀有度映射表
const rarityMap = {
  1: '普通',
  2: '稀有',
  3: '史诗',
  4: '传说',
  5: '神话'
}

const cardForm = ref({
  collection_metadata_id: '',
  document_id: '',
  probability: 0,
  color: 'red'
})

// 重置卡片表单
const resetCardForm = () => {
  cardForm.value = {
    collection_metadata_id: collectionId.value || '',
    document_id: selectedCard.value ? selectedCard.value.id : '',
    probability: 0,
    color: 'red'
  }
}

// 处理添加卡片对话框关闭
const handleAddCardDialogClose = () => {
  // 清除选中的卡片
  selectedCard.value = null
  // 重置表单
  resetCardForm()
}

const cardRules = ref<FormRules>({
  collection_metadata_id: [
    { required: true, message: '请输入卡片元数据ID', trigger: 'blur' }
  ],
  document_id: [
    { required: true, message: '请输入文档ID', trigger: 'blur' }
  ],
  color: [
    { required: true, message: '请选择颜色', trigger: 'change' }
  ]
})

// 获取卡包ID和集合ID
const packId = route.params.id as string
const collectionId = ref('')

// 获取卡包详情
const fetchPackDetail = async () => {
  loading.value = true
  try {
    // 从URL查询参数中获取分类ID
    const queryCollectionId = route.query.collectionId as string
    if (queryCollectionId) {
      collectionId.value = queryCollectionId
    } else {
      // 如果URL中没有分类ID，则获取所有分类并使用第一个
      const collections = await import('@/api/packs').then(module => module.getPackCollections())
      if (collections && collections.length > 0) {
        collectionId.value = collections[0].id.toString()
      } else {
        ElMessage.error('获取卡包集合失败')
        return
      }
    }
    
    packDetail.value = await getPackDetail(packId, collectionId.value)
    fetchCardList()
  } catch (error) {
    console.error('获取卡包详情失败:', error)
    ElMessage.error('获取卡包详情失败')
  } finally {
    loading.value = false
  }
}

// 获取卡片列表
const fetchCardList = async () => {
  if (!collectionId.value) return
  
  cardsLoading.value = true
  try {
    cardList.value = await getPackCards(collectionId.value, packId, { sort_by: 'point_worth' })
  } catch (error) {
    console.error('获取卡片列表失败:', error)
    ElMessage.error('获取卡片列表失败')
  } finally {
    cardsLoading.value = false
  }
}

// 打开选择卡片对话框
const openSelectCardDialog = () => {
  selectCardDialogVisible.value = true
  // 重置选择状态
  selectedCard.value = null
  // 重置搜索条件
  cardSearchQuery.value = ''
  cardSortBy.value = ''
  cardSortOrder.value = ''
  cardRarityMin.value = undefined
  cardRarityMax.value = undefined
  cardPointWorthMin.value = undefined
  cardPointWorthMax.value = undefined
  cardCurrentPage.value = 1
  // 直接使用当前卡包的分类ID，不再需要设置selectedCardCollection
  // 获取可选卡片列表
  fetchAvailableCards()
}

// 获取卡片分类列表函数已移除，因为分类选择框已隐藏，直接使用当前卡包的分类

// 获取可选卡片列表
const fetchAvailableCards = async () => {
  cardsSearchLoading.value = true
  try {
    const params: any = {
      page: cardCurrentPage.value,
      per_page: cardPageSize.value,
      collectionName: collectionId.value || undefined,
      search_query: cardSearchQuery.value || undefined
    }
    
    // 添加稀有度筛选
    if (cardRarityMin.value !== undefined) {
      params.rarity_min = cardRarityMin.value
    }
    if (cardRarityMax.value !== undefined) {
      params.rarity_max = cardRarityMax.value
    }
    
    // 添加积分筛选
    if (cardPointWorthMin.value !== undefined) {
      params.point_worth_min = cardPointWorthMin.value
    }
    if (cardPointWorthMax.value !== undefined) {
      params.point_worth_max = cardPointWorthMax.value
    }
    
    // 添加排序
    if (cardSortBy.value) {
      params.sort_by = cardSortBy.value
    }
    if (cardSortOrder.value) {
      params.sort_order = cardSortOrder.value
    }
    
    const data = await getCardList(params)
    availableCards.value = data.cards
    cardTotal.value = data.pagination.total_items
  } catch (error) {
    console.error('获取可选卡片列表失败', error)
    ElMessage.error('获取可选卡片列表失败')
  } finally {
    cardsSearchLoading.value = false
  }
}

// 选择卡片
const handleSelectCard = (card: StorageCard) => {
  selectedCard.value = card
  // 关闭选择卡片对话框
  selectCardDialogVisible.value = false
  // 打开添加卡片对话框
  addCardDialogVisible.value = true
  // 重置表单
  resetCardForm()
}

// 卡片分类变更函数已移除，因为分类选择框已隐藏

// 卡片搜索
const handleCardSearch = () => {
  cardCurrentPage.value = 1
  fetchAvailableCards()
}

// 重置卡片搜索
const resetCardSearch = () => {
  cardSearchQuery.value = ''
  cardSortBy.value = ''
  cardSortOrder.value = ''
  cardRarityMin.value = undefined
  cardRarityMax.value = undefined
  cardPointWorthMin.value = undefined
  cardPointWorthMax.value = undefined
  cardCurrentPage.value = 1
  fetchAvailableCards()
}

// 卡片分页变更
const handleCardCurrentChange = (page: number) => {
  cardCurrentPage.value = page
  fetchAvailableCards()
}

// 卡片每页数量变更
const handleCardSizeChange = (size: number) => {
  cardPageSize.value = size
  cardCurrentPage.value = 1
  fetchAvailableCards()
}

// 获取稀有度标签
const getRarityLabel = (rarity: number | string): string => {
  const rarityNum = typeof rarity === 'string' ? parseInt(rarity) : rarity
  return rarityMap[rarityNum as keyof typeof rarityMap] || `稀有度${rarity}`
}

// 提交添加卡片
const submitAddCard = async () => {
  if (!cardFormRef.value) return
  
  await cardFormRef.value.validate(async (valid) => {
    if (valid) {
      submitLoading.value = true
      try {
        await createCard(collectionId.value, packId, cardForm.value)
        ElMessage.success('添加卡片成功')
        addCardDialogVisible.value = false
        fetchCardList()
        // 重置表单
        cardForm.value = {
          collection_metadata_id: '',
          document_id: '',
          probability: 0,
          color: 'red'
        }
      } catch (error) {
        console.error('添加卡片失败:', error)
        ElMessage.error('添加卡片失败')
      } finally {
        submitLoading.value = false
      }
    }
  })
}

// 打开编辑卡片对话框
const openEditCardDialog = (card: Card) => {
  editingCard.value = card
  editCardForm.value = {
    probability: card.probability || 0,
    color: card.color || 'red'
  }
  editCardDialogVisible.value = true
}

// 提交编辑卡片
const submitEditCard = async () => {
  if (!editCardFormRef.value || !editingCard.value) return
  
  await editCardFormRef.value.validate(async (valid) => {
    if (valid) {
      submitLoading.value = true
      try {
        // Only send probability and color, not document_id
        const updateParams = {
          probability: editCardForm.value.probability,
          color: editCardForm.value.color
        }
        
        await updateCard(collectionId.value, packId, editingCard.value.id, updateParams)
        ElMessage.success('卡片编辑成功')
        editCardDialogVisible.value = false
        fetchCardList()
      } catch (error) {
        console.error('编辑卡片失败:', error)
        ElMessage.error('编辑卡片失败')
      } finally {
        submitLoading.value = false
      }
    }
  })
}

// 确认删除卡片
const confirmDeleteCard = async (card: Card) => {
  ElMessageBox.confirm(`确定要删除卡片 "${card.card_name}" 吗？此操作不可逆`, '警告', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      await deleteCard(collectionId.value, packId, card.id)
      ElMessage.success('删除卡片成功')
      fetchCardList()
    } catch (error) {
      console.error('删除卡片失败:', error)
      ElMessage.error('删除卡片失败')
    }
  }).catch(() => {
    // 取消删除
  })
}

// 切换卡包激活状态
const toggleActiveStatus = async () => {
  if (!packDetail.value) return
  
  const newStatus = !packDetail.value.is_active
  const actionText = newStatus ? '激活' : '未激活'
  
  try {
    await updatePackActiveStatus(collectionId.value, packId, newStatus)
    ElMessage.success(`设置卡包为${actionText}状态成功`)
    // 更新本地状态
    if (packDetail.value) {
      packDetail.value.is_active = newStatus
    }
  } catch (error) {
    console.error(`设置卡包为${actionText}状态失败:`, error)
    ElMessage.error(`设置卡包为${actionText}状态失败`)
  }
}

// 打开修改最大中奖金额对话框
const openUpdateMaxWinDialog = () => {
  if (packDetail.value) {
    updateMaxWinForm.value.maxWin = packDetail.value.max_win
    updateMaxWinDialogVisible.value = true
  }
}

// 提交修改最大中奖金额
const submitUpdateMaxWin = async () => {
  if (!packDetail.value) return
  
  submitLoading.value = true
  try {
    await updatePackMaxWin(collectionId.value, packId, updateMaxWinForm.value.maxWin)
    ElMessage.success('最大中奖金额修改成功')
    // 更新本地状态
    packDetail.value.max_win = updateMaxWinForm.value.maxWin
    updateMaxWinDialogVisible.value = false
  } catch (error) {
    console.error('修改最大中奖金额失败:', error)
    ElMessage.error('修改最大中奖金额失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改最小中奖金额对话框
const openUpdateMinWinDialog = () => {
  if (packDetail.value) {
    updateMinWinForm.value.minWin = packDetail.value.min_win || 0
    updateMinWinDialogVisible.value = true
  }
}

// 提交修改最小中奖金额
const submitUpdateMinWin = async () => {
  if (!packDetail.value) return
  
  submitLoading.value = true
  try {
    await updatePackMinWin(collectionId.value, packId, updateMinWinForm.value.minWin)
    ElMessage.success('最小中奖金额修改成功')
    // 更新本地状态
    packDetail.value.min_win = updateMinWinForm.value.minWin
    updateMinWinDialogVisible.value = false
  } catch (error) {
    console.error('修改最小中奖金额失败:', error)
    ElMessage.error('修改最小中奖金额失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改价格对话框
const openUpdatePriceDialog = () => {
  if (packDetail.value) {
    updatePriceForm.value.price = packDetail.value.price
    updatePriceDialogVisible.value = true
  }
}

// 提交修改价格
const submitUpdatePrice = async () => {
  if (!packDetail.value) return
  
  submitLoading.value = true
  try {
    await updatePackPrice(collectionId.value, packId, updatePriceForm.value.price)
    ElMessage.success('价格修改成功')
    // 更新本地状态
    packDetail.value.price = updatePriceForm.value.price
    updatePriceDialogVisible.value = false
  } catch (error) {
    console.error('修改价格失败:', error)
    ElMessage.error('修改价格失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改胜率对话框
const openUpdateWinRateDialog = () => {
  if (packDetail.value) {
    updateWinRateForm.value.winRate = packDetail.value.win_rate || 0
    updateWinRateDialogVisible.value = true
  }
}

// 提交修改胜率
const submitUpdateWinRate = async () => {
  if (!packDetail.value) return
  
  submitLoading.value = true
  try {
    await updatePackWinRate(collectionId.value, packId, updateWinRateForm.value.winRate)
    ElMessage.success('胜率修改成功')
    // 更新本地状态
    packDetail.value.win_rate = updateWinRateForm.value.winRate
    updateWinRateDialogVisible.value = false
  } catch (error) {
    console.error('修改胜率失败:', error)
    ElMessage.error('修改胜率失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改热度对话框
const openUpdatePopularityDialog = () => {
  if (packDetail.value) {
    updatePopularityForm.value.popularity = packDetail.value.popularity || 0
    updatePopularityDialogVisible.value = true
  }
}

// 提交修改热度
const submitUpdatePopularity = async () => {
  if (!packDetail.value) return
  
  submitLoading.value = true
  try {
    await updatePackPopularity(collectionId.value, packId, updatePopularityForm.value.popularity)
    ElMessage.success('热度修改成功')
    // 更新本地状态
    packDetail.value.popularity = updatePopularityForm.value.popularity
    updatePopularityDialogVisible.value = false
  } catch (error) {
    console.error('修改热度失败:', error)
    ElMessage.error('修改热度失败')
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
      return 'info'
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

// 打开修改分类对话框
const openUpdateSeparationDialog = () => {
  if (packDetail.value) {
    updateSeparationForm.value.separation = packDetail.value.separation || 'other'
    updateSeparationDialogVisible.value = true
  }
}

// 提交修改分类
const submitUpdateSeparation = async () => {
  if (!packDetail.value) return
  
  submitLoading.value = true
  try {
    await updatePackSeparation(collectionId.value, packId, updateSeparationForm.value.separation)
    ElMessage.success('分类修改成功')
    // 更新本地状态
    packDetail.value.separation = updateSeparationForm.value.separation
    updateSeparationDialogVisible.value = false
  } catch (error) {
    console.error('修改分类失败:', error)
    ElMessage.error('修改分类失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改名称对话框
const openUpdateNameDialog = () => {
  if (packDetail.value) {
    nameForm.value.name = packDetail.value.name
    nameDialogVisible.value = true
  }
}

// 提交修改名称
const submitUpdateName = async () => {
  if (!packDetail.value || !nameForm.value.name.trim()) {
    ElMessage.error('请输入卡包名称')
    return
  }
  
  submitLoading.value = true
  try {
    await updatePackName(collectionId.value, packId, nameForm.value.name)
    ElMessage.success('卡包名称修改成功')
    // 更新本地状态
    packDetail.value.name = nameForm.value.name
    nameDialogVisible.value = false
  } catch (error) {
    console.error('修改卡包名称失败:', error)
    ElMessage.error('修改卡包名称失败')
  } finally {
    submitLoading.value = false
  }
}

// 打开修改图片对话框
const openUpdateImageDialog = () => {
  imageForm.value.image_file = ''
  imageForm.value.rawFile = undefined
  imagePreview.value = ''
  imageDialogVisible.value = true
}

// 处理图片变更
const handleImageChange = (file: any) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    imagePreview.value = e.target?.result as string
  }
  reader.readAsDataURL(file.raw)
  // Store the File object, not as a string
  imageForm.value.rawFile = file.raw
}

// 清除图片预览
const clearImage = () => {
  imagePreview.value = ''
  imageForm.value.image_file = ''
  imageForm.value.rawFile = undefined
}

// 提交修改图片
const submitUpdateImage = async () => {
  if (!packDetail.value) {
    ElMessage.error('卡包信息未加载')
    return
  }
  
  // Check if we have either a File object or a base64 string
  if (!imageForm.value.rawFile && !imageForm.value.image_file) {
    ElMessage.error('请选择图片')
    return
  }
  
  submitLoading.value = true
  try {
    // Pass the File object if available, otherwise pass the base64 string
    const imageData = imageForm.value.rawFile || imageForm.value.image_file
    await updatePackImage(collectionId.value, packId, imageData)
    ElMessage.success('卡包图片修改成功')
    // 重新获取卡包详情以更新图片
    await fetchPackDetail()
    imageDialogVisible.value = false
  } catch (error) {
    console.error('修改卡包图片失败:', error)
    ElMessage.error('修改卡包图片失败')
  } finally {
    submitLoading.value = false
  }
}

// 返回列表页
const goBack = () => {
  // 返回时保留分类ID
  if (collectionId.value) {
    router.push(`/storage/packs?collectionId=${collectionId.value}`)
  } else {
    router.push('/storage/packs')
  }
}

onMounted(() => {
  fetchPackDetail()
})
</script>

<style scoped>
.pack-detail-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.pack-info {
  display: flex;
  margin-bottom: 20px;
}

.pack-image {
  width: 200px;
  height: 200px;
  margin-right: 20px;
}

.pack-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
}

.pack-details {
  flex: 1;
}

.divider {
  margin: 20px 0;
}

.card-actions {
  margin-bottom: 20px;
  display: flex;
  gap: 10px;
}

.selected-card-info {
  margin-bottom: 20px;
}

.selected-card-image {
  margin-top: 10px;
}

.card-pagination {
  margin-top: 20px;
  display: flex;
  justify-content: flex-end;
}

.card-search-form {
  margin-bottom: 20px;
}

.card-select-container {
  padding: 20px;
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