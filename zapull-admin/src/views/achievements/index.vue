<template>
  <div class="achievements-container">
    <el-card class="search-card">
      <el-form ref="searchFormRef" inline>
        <el-form-item label="条件类型" prop="conditionType">
          <el-select 
            v-model="searchForm.conditionType" 
            placeholder="请选择条件类型" 
            clearable 
            style="width: 150px;"
          >
            <el-option label="等级达成" value="level_reached" />
            <el-option label="融合达成" value="fusion_reached" />
            <el-option label="点数值抽取" value="draw_by_rarity" />
            <el-option label="完成交易" value="buy_deal_reached" />
            <el-option label="完成销售" value="sell_deal_reached" />
            <el-option label="完成取卡" value="withdraw_reached" />
            <el-option label="特殊成就" value="special" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序字段" prop="sortBy">
          <el-select v-model="searchForm.sortBy" placeholder="请选择排序字段" style="width: 150px;" clearable>
            <el-option label="等级" value="rank" />
            <el-option label="稀有度" value="rarity" />
            <el-option label="创建时间" value="created_at" />
          </el-select>
        </el-form-item>
        <el-form-item label="排序方式" prop="sortDirection">
          <el-select v-model="searchForm.sortDirection" placeholder="请选择排序方式" style="width: 150px;" clearable>
            <el-option label="升序" value="asc" />
            <el-option label="降序" value="desc" />
          </el-select>
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="handleSearch">查询</el-button>
          <el-button @click="handleReset">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card class="table-card">
      <div class="header-actions">
        <el-button type="primary" @click="handleAdd">添加成就</el-button>
      </div>
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column prop="name" label="成就名称" />
        <el-table-column prop="description" label="描述" />
        <el-table-column label="条件" width="180">
          <template #default="{ row }">
            <div>类型: 
              <span v-if="row.condition.type === 'level_reached'">等级达成</span>
              <span v-else-if="row.condition.type === 'fusion_reached'">融合达成</span>
              <span v-else-if="row.condition.type === 'draw_by_rarity'">点数值抽取</span>
              <span v-else-if="row.condition.type === 'buy_deal_reached'">完成交易</span>
              <span v-else-if="row.condition.type === 'sell_deal_reached'">完成销售</span>
              <span v-else-if="row.condition.type === 'withdraw_reached'">完成取卡</span>
              <span v-else-if="row.condition.type === 'special'">特殊成就</span>
              <span v-else>{{ row.condition.type }}</span>
            </div>
            <div v-if="row.condition.type !== 'special' && row.condition.target !== undefined">目标值: {{ row.condition.target }}</div>
            <div v-if="row.condition.type === 'draw_by_rarity' && row.condition.point_worth">
              点数值门槛: ≥ {{ row.condition.point_worth }}
            </div>
          </template>
        </el-table-column>
        <el-table-column label="奖励" width="180">
          <template #default="{ row }">
            <div v-for="(reward, index) in row.reward" :key="index">
              <div v-if="reward.type === 'point'">
                积分: {{ reward.amount }}
              </div>
              <div v-else-if="reward.type === 'emblem'">
                徽章: 
                <el-image 
                  v-if="reward.image" 
                  :src="reward.image" 
                  style="width: 30px; height: 30px"
                  :preview-src-list="[reward.image]"
                />
                <el-image 
                  v-else-if="reward.url" 
                  :src="reward.url" 
                  style="width: 30px; height: 30px"
                  :preview-src-list="[reward.url]"
                />
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="稀有度">
          <template #default="{ row }">
            <span>{{ rarityMap[row.rarity] || row.rarity }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="rank" label="等级" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleEdit(row)">编辑</el-button>
            <el-button link type="danger" @click="handleDelete(row)">
              <el-icon><Delete /></el-icon>
              删除
            </el-button>
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
    
    <!-- 添加成就抽屉 -->
    <el-drawer
      v-model="addDrawerVisible"
      title="添加成就"
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
        <el-form-item label="成就名称" prop="name">
          <el-input v-model="addFormData.name" placeholder="请输入成就名称" />
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input v-model="addFormData.description" placeholder="请输入成就描述" type="textarea" :rows="3" />
        </el-form-item>
        
        <el-form-item label="条件类型" prop="condition.type">
          <el-select v-model="addFormData.condition.type" placeholder="请选择条件类型">
            <el-option label="等级达成" value="level_reached" />
            <el-option label="融合达成" value="fusion_reached" />
            <el-option label="点数值抽取" value="draw_by_rarity" />
            <el-option label="完成交易" value="buy_deal_reached" />
            <el-option label="完成销售" value="sell_deal_reached" />
            <el-option label="完成取卡" value="withdraw_reached" />
            <el-option label="特殊成就" value="special" />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="addFormData.condition.type !== 'special'" label="目标值" prop="condition.target">
          <el-input-number v-model="addFormData.condition.target" :min="1" :precision="0" />
          <span v-if="addFormData.condition.type === 'draw_by_rarity'" style="margin-left: 10px; color: #606266; font-size: 12px;">抽到指定数量的卡牌</span>
        </el-form-item>
        
        <el-form-item v-if="addFormData.condition.type === 'draw_by_rarity'" label="点数值门槛" prop="condition.point_worth">
          <el-select v-model="addFormData.condition.point_worth" placeholder="请选择点数值门槛">
            <el-option label="2000点" :value="2000" />
            <el-option label="5000点" :value="5000" />
            <el-option label="10000点" :value="10000" />
            <el-option label="30000点" :value="30000" />
          </el-select>
          <span style="margin-left: 10px; color: #606266; font-size: 12px;">卡牌点数值必须大于或等于此门槛</span>
        </el-form-item>
        
        <el-form-item label="奖励">
          <div v-for="(reward, index) in addFormData.reward" :key="index" class="reward-item">
            <el-select v-model="reward.type" placeholder="奖励类型" style="width: 120px;" @change="(val) => handleRewardTypeChange(val, index)">
              <el-option label="积分" value="point" />
              <el-option label="徽章" value="emblem" />
            </el-select>
            
            <template v-if="reward.type === 'point'">
              <el-input-number 
                v-model="reward.amount" 
                :min="1" 
                :precision="0" 
                placeholder="积分数量"
                style="margin-left: 10px;"
              />
            </template>
            
            <template v-else-if="reward.type === 'emblem'">
              <el-upload
                class="avatar-uploader"
                action=""
                :auto-upload="false"
                :show-file-list="false"
                :on-change="(file) => handleEmblemUpload(file, index)"
                style="margin-left: 10px;"
              >
                <img v-if="reward.image" :src="reward.image" class="avatar" />
                <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
                <div class="el-upload__text">点击上传徽章图片</div>
              </el-upload>
            </template>
            
            <el-button 
              type="danger" 
              circle 
              @click="removeReward(index)"
              style="margin-left: 10px;"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          
          <el-button type="primary" @click="addReward">添加奖励</el-button>
        </el-form-item>
        
        <el-form-item label="稀有度" prop="rarity">
          <el-select v-model="addFormData.rarity" placeholder="请选择稀有度">
            <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="等级" prop="rank">
          <el-input-number v-model="addFormData.rank" :min="1" :precision="0" />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitAddForm">添加</el-button>
          <el-button @click="resetAddForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 编辑成就抽屉 -->
    <el-drawer
      v-model="editDrawerVisible"
      title="编辑成就"
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
        <el-form-item label="成就名称" prop="name">
          <el-input v-model="editFormData.name" placeholder="请输入成就名称" />
        </el-form-item>
        
        <el-form-item label="描述" prop="description">
          <el-input v-model="editFormData.description" placeholder="请输入成就描述" type="textarea" :rows="3" />
        </el-form-item>
        
        <el-form-item label="条件类型" prop="condition.type">
          <el-select v-model="editFormData.condition.type" placeholder="请选择条件类型">
            <el-option label="等级达成" value="level_reached" />
            <el-option label="融合达成" value="fusion_reached" />
            <el-option label="点数值抽取" value="draw_by_rarity" />
            <el-option label="完成交易" value="buy_deal_reached" />
            <el-option label="完成销售" value="sell_deal_reached" />
            <el-option label="完成取卡" value="withdraw_reached" />
            <el-option label="特殊成就" value="special" />
          </el-select>
        </el-form-item>
        
        <el-form-item v-if="editFormData.condition.type !== 'special'" label="目标值" prop="condition.target">
          <el-input-number v-model="editFormData.condition.target" :min="1" :precision="0" />
          <span v-if="editFormData.condition.type === 'draw_by_rarity'" style="margin-left: 10px; color: #606266; font-size: 12px;">抽到指定数量的卡牌</span>
        </el-form-item>
        
        <el-form-item v-if="editFormData.condition.type === 'draw_by_rarity'" label="点数值门槛" prop="condition.point_worth">
          <el-select v-model="editFormData.condition.point_worth" placeholder="请选择点数值门槛">
            <el-option label="2000点" :value="2000" />
            <el-option label="5000点" :value="5000" />
            <el-option label="10000点" :value="10000" />
            <el-option label="30000点" :value="30000" />
          </el-select>
          <span style="margin-left: 10px; color: #606266; font-size: 12px;">卡牌点数值必须大于或等于此门槛</span>
        </el-form-item>
        
        <el-form-item label="奖励">
          <div v-for="(reward, index) in editFormData.reward" :key="index" class="reward-item">
            <el-select v-model="reward.type" placeholder="奖励类型" style="width: 120px;" @change="(val) => handleEditRewardTypeChange(val, index)">
              <el-option label="积分" value="point" />
              <el-option label="徽章" value="emblem" />
            </el-select>
            
            <template v-if="reward.type === 'point'">
              <el-input-number 
                v-model="reward.amount" 
                :min="1" 
                :precision="0" 
                placeholder="积分数量"
                style="margin-left: 10px;"
              />
            </template>
            
            <template v-else-if="reward.type === 'emblem'">
              <el-upload
                class="avatar-uploader"
                action=""
                :auto-upload="false"
                :show-file-list="false"
                :on-change="(file) => handleEditEmblemUpload(file, index)"
                style="margin-left: 10px;"
              >
                <img v-if="reward.image" :src="reward.image" class="avatar" />
                <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
                <div class="el-upload__text">点击上传徽章图片</div>
              </el-upload>
            </template>
            
            <el-button 
              type="danger" 
              circle 
              @click="removeEditReward(index)"
              style="margin-left: 10px;"
            >
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
          
          <el-button type="primary" @click="addEditReward">添加奖励</el-button>
        </el-form-item>
        
        <el-form-item label="稀有度" prop="rarity">
          <el-select v-model="editFormData.rarity" placeholder="请选择稀有度">
            <el-option v-for="(label, value) in rarityMap" :key="value" :label="label" :value="Number(value)" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="等级" prop="rank">
          <el-input-number v-model="editFormData.rank" :min="1" :precision="0" />
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitEditForm">保存</el-button>
          <el-button @click="editDrawerVisible = false">取消</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>

    <!-- 删除确认对话框 -->
    <el-dialog
      v-model="deleteDialogVisible"
      title="删除确认"
      width="400px"
    >
      <p>确定要删除成就 "{{ currentDeleteAchievement?.name }}" 吗？</p>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="deleteDialogVisible = false">取消</el-button>
          <el-button type="danger" @click="confirmDelete">
            <el-icon><Delete /></el-icon>
            确认删除
          </el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onDeactivated, onActivated, watch } from 'vue'
import { Delete, Plus } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { 
  getAchievementList,
  getAchievement,
  updateAchievement,
  addAchievement,
  deleteAchievement,
  type Achievement,
  type AddAchievementParams,
  type UpdateAchievementParams
} from '../../api/achievements'

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

defineOptions({
  name: 'AchievementsIndex'
})

// 搜索表单数据
const searchForm = reactive({
  conditionType: '',
  sortBy: '',
  sortDirection: 'desc'
})

// 表格数据
const tableData = ref<Achievement[]>([])
const loading = ref(false)
const currentPage = ref(1)
const pageSize = ref(10)
const total = ref(0)

// 添加抽屉相关
const addDrawerVisible = ref(false)
const addLoading = ref(false)
const addFormRef = ref()

// 添加表单数据
const addFormData = reactive<AddAchievementParams>({
  name: '',
  description: '',
  condition: {
    type: 'level_reached',
    target: 1,
    point_worth: undefined, // Point worth threshold for draw_by_rarity achievements
    rarity: undefined // rarity field is no longer used for draw_by_rarity
  },
  reward: [
    {
      type: 'point',
      amount: 100
    }
  ],
  rarity: 1, // 默认为1(Common)
  rank: 1
})

// 添加表单验证规则
const addRules = {
  name: [
    { required: true, message: '请输入成就名称', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入成就描述', trigger: 'blur' }
  ],
  'condition.type': [
    { required: true, message: '请选择条件类型', trigger: 'change' }
  ],
  'condition.target': [
    { 
      required: false, // Will be validated by custom validator
      message: '请输入目标值', 
      trigger: 'blur',
      validator: (rule, value, callback) => {
        if (addFormData.condition.type === 'special') {
          callback() // Special achievements don't need target
        } else if (!value || value < 1) {
          callback(new Error('请输入目标值'))
        } else {
          callback()
        }
      }
    }
  ],
  'condition.point_worth': [
    { 
      required: true, 
      message: '请选择点数值门槛', 
      trigger: 'change',
      validator: (rule, value, callback) => {
        if (addFormData.condition.type === 'draw_by_rarity' && !value) {
          callback(new Error('请选择点数值门槛'))
        } else {
          callback()
        }
      }
    }
  ]
}

// 编辑抽屉相关
const editDrawerVisible = ref(false)
const editLoading = ref(false)
const editFormRef = ref()
const currentEditAchievement = ref<Achievement | null>(null)

// 编辑表单数据
const editFormData = reactive<UpdateAchievementParams>({
  id: '',
  name: '',
  description: '',
  condition: {
    type: '',
    target: 1,
    point_worth: undefined, // Point worth threshold for draw_by_rarity achievements
    rarity: undefined // rarity field is no longer used for draw_by_rarity
  },
  reward: [],
  rarity: 1, // 默认为1(Common)
  rank: 1
})

// 编辑表单验证规则
const editRules = {
  name: [
    { required: true, message: '请输入成就名称', trigger: 'blur' }
  ],
  description: [
    { required: true, message: '请输入成就描述', trigger: 'blur' }
  ],
  'condition.type': [
    { required: true, message: '请选择条件类型', trigger: 'change' }
  ],
  'condition.target': [
    { 
      required: false, // Will be validated by custom validator
      message: '请输入目标值', 
      trigger: 'blur',
      validator: (rule, value, callback) => {
        if (editFormData.condition.type === 'special') {
          callback() // Special achievements don't need target
        } else if (!value || value < 1) {
          callback(new Error('请输入目标值'))
        } else {
          callback()
        }
      }
    }
  ],
  'condition.point_worth': [
    { 
      required: true, 
      message: '请选择点数值门槛', 
      trigger: 'change',
      validator: (rule, value, callback) => {
        if (editFormData.condition.type === 'draw_by_rarity' && !value) {
          callback(new Error('请选择点数值门槛'))
        } else {
          callback()
        }
      }
    }
  ]
}

// 删除相关
const deleteDialogVisible = ref(false)
const currentDeleteAchievement = ref<Achievement | null>(null)

// 获取成就列表
const fetchAchievementList = async () => {
  loading.value = true
  try {
    // 构建请求参数，只有当排序字段有值时才传递
    const params: any = {
      page: currentPage.value,
      size: pageSize.value,
    }
    
    // 只有当条件类型有值时才添加到请求参数
    if (searchForm.conditionType) {
      params.condition_type = searchForm.conditionType
    }
    
    // 只有当排序字段有值时才添加到请求参数
    if (searchForm.sortBy) {
      params.sort_by = searchForm.sortBy as 'rank' | 'rarity' | 'created_at'
      params.sort_direction = searchForm.sortDirection as 'asc' | 'desc'
    }
    
    const response = await getAchievementList(params)
    tableData.value = response.items
    total.value = response.total
  } catch (error) {
    console.error('获取成就列表失败：', error)
    ElMessage.error('获取成就列表失败')
  } finally {
    loading.value = false
  }
}

// 重置方法
const handleReset = () => {
  searchForm.conditionType = ''
  searchForm.sortBy = ''
  searchForm.sortDirection = 'desc'
  currentPage.value = 1
  fetchAchievementList()
}

// 搜索方法
const handleSearch = () => {
  currentPage.value = 1
  fetchAchievementList()
}

// 分页方法
const handleSizeChange = (val: number) => {
  pageSize.value = val
  fetchAchievementList()
}

const handleCurrentChange = (val: number) => {
  currentPage.value = val
  fetchAchievementList()
}

// 添加成就 - 打开抽屉
const handleAdd = () => {
  resetAddForm()
  addDrawerVisible.value = true
}

// 添加奖励
const addReward = () => {
  // 根据类型添加不同的奖励结构
  const type = 'point'
  const reward = {
    type,
    emblemId: undefined,
    url: undefined,
    image: undefined
  }
  
  // 根据类型设置字段
  if (type === 'point') {
    reward.amount = 100
  }
  
  addFormData.reward.push(reward)
}

// 处理奖励类型变化
const handleRewardTypeChange = (type, index) => {
  if (type === 'point') {
    addFormData.reward[index].amount = 100
    addFormData.reward[index].emblemId = undefined
    addFormData.reward[index].url = undefined
    addFormData.reward[index].image = undefined
  } else if (type === 'emblem') {
    addFormData.reward[index].amount = undefined
    addFormData.reward[index].emblemId = undefined
    addFormData.reward[index].url = undefined
    addFormData.reward[index].image = undefined
  }
}

// 移除奖励
const removeReward = (index: number) => {
  addFormData.reward.splice(index, 1)
}

// 提交添加表单
const submitAddForm = async () => {
  if (!addFormRef.value) return
  
  await addFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      addLoading.value = true
      try {
        await addAchievement(addFormData)
        ElMessage.success('添加成就成功')
        addDrawerVisible.value = false
        resetAddForm()
        fetchAchievementList() // 刷新列表
      } catch (error) {
        console.error('添加成就失败：', error)
        ElMessage.error('添加成就失败')
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
  addFormData.name = ''
  addFormData.description = ''
  addFormData.condition = {
    type: 'level_reached',
    target: 1,
    point_worth: undefined, // Point worth threshold for draw_by_rarity achievements
    rarity: undefined // rarity field is no longer used for draw_by_rarity
  }
  addFormData.reward = [
    {
      type: 'point',
      amount: 100,
      emblemId: undefined,
      url: undefined,
      image: undefined
    }
  ]
  addFormData.rarity = ''
  addFormData.rank = 1
}

// 编辑成就
const handleEdit = async (row: Achievement) => {
  currentEditAchievement.value = row
  editFormData.id = row.id
  editFormData.name = row.name
  editFormData.description = row.description
  editFormData.condition = { ...row.condition }
  editFormData.reward = JSON.parse(JSON.stringify(row.reward))
  editFormData.rarity = row.rarity || ''
  editFormData.rank = row.rank || 1
  
  editDrawerVisible.value = true
}

// 添加编辑奖励
const addEditReward = () => {
  // 根据类型添加不同的奖励结构
  const type = 'point'
  const reward = {
    type,
    emblemId: undefined,
    url: undefined,
    image: undefined
  }
  
  // 根据类型设置字段
  if (type === 'point') {
    reward.amount = 100
  }
  
  editFormData.reward?.push(reward)
}

// 处理编辑表单奖励类型变化
const handleEditRewardTypeChange = (type, index) => {
  if (type === 'point') {
    editFormData.reward[index].amount = 100
    editFormData.reward[index].emblemId = undefined
    editFormData.reward[index].url = undefined
    editFormData.reward[index].image = undefined
  } else if (type === 'emblem') {
    editFormData.reward[index].amount = undefined
    editFormData.reward[index].emblemId = undefined
    editFormData.reward[index].url = undefined
    editFormData.reward[index].image = undefined
  }
}

// 移除编辑奖励
const removeEditReward = (index: number) => {
  editFormData.reward?.splice(index, 1)
}

// 提交编辑表单
const submitEditForm = async () => {
  if (!editFormRef.value || !currentEditAchievement.value) return
  
  await editFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      editLoading.value = true
      try {
        const { id, ...params } = editFormData
        await updateAchievement(id, params)
        ElMessage.success('更新成就成功')
        editDrawerVisible.value = false
        fetchAchievementList() // 刷新列表
      } catch (error) {
        console.error('更新成就失败：', error)
        ElMessage.error('更新成就失败')
      } finally {
        editLoading.value = false
      }
    } else {
      return false
    }
  })
}

// 删除成就
const handleDelete = (row: Achievement) => {
  currentDeleteAchievement.value = row
  deleteDialogVisible.value = true
}

// 确认删除
const confirmDelete = async () => {
  if (!currentDeleteAchievement.value) return
  
  try {
    await deleteAchievement(currentDeleteAchievement.value.id)
    ElMessage.success('删除成就成功')
    deleteDialogVisible.value = false
    fetchAchievementList() // 刷新列表
  } catch (error) {
    console.error('删除成就失败：', error)
    ElMessage.error('删除成就失败')
  }
}

// 处理徽章图片上传 - 添加表单
const handleEmblemUpload = (file: any, index: number) => {
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    addFormData.reward[index].image = reader.result as string
    // 当使用图片上传时，不需要传入徽章ID、url和amount
    addFormData.reward[index].emblemId = undefined
    addFormData.reward[index].url = undefined
    addFormData.reward[index].amount = undefined
  }
}

// 处理徽章图片上传 - 编辑表单
const handleEditEmblemUpload = (file: any, index: number) => {
  const reader = new FileReader()
  reader.readAsDataURL(file.raw)
  reader.onload = () => {
    if (editFormData.reward) {
      editFormData.reward[index].image = reader.result as string
      // 当使用图片上传时，不需要传入徽章ID、url和amount
      editFormData.reward[index].emblemId = undefined
      editFormData.reward[index].url = undefined
      editFormData.reward[index].amount = undefined
    }
  }
}

// Watch for condition type changes to clear point_worth when not draw_by_rarity and target when special
watch(() => addFormData.condition.type, (newType) => {
  if (newType !== 'draw_by_rarity') {
    addFormData.condition.point_worth = undefined
  }
  if (newType === 'special') {
    addFormData.condition.target = undefined
  } else if (newType !== 'special' && !addFormData.condition.target) {
    addFormData.condition.target = 1 // Set default target for non-special types
  }
})

watch(() => editFormData.condition.type, (newType) => {
  if (newType !== 'draw_by_rarity') {
    editFormData.condition.point_worth = undefined
  }
  if (newType === 'special') {
    editFormData.condition.target = undefined
  } else if (newType !== 'special' && !editFormData.condition.target) {
    editFormData.condition.target = 1 // Set default target for non-special types
  }
})

// 初始化
onMounted(() => {
  fetchAchievementList()
})

// 保存状态到localStorage
onDeactivated(() => {
  localStorage.setItem('achievements_state', JSON.stringify({
    searchForm: {
      conditionType: searchForm.conditionType,
      sortBy: searchForm.sortBy,
      sortDirection: searchForm.sortDirection
    },
    pagination: {
      currentPage: currentPage.value,
      pageSize: pageSize.value
    }
  }))
})

// 从localStorage恢复状态
onActivated(() => {
  const savedState = localStorage.getItem('achievements_state')
  
  if (savedState) {
    const parsed = JSON.parse(savedState)
    
    // 恢复搜索表单
    if (parsed.searchForm) {
      searchForm.conditionType = parsed.searchForm.conditionType
      searchForm.sortBy = parsed.searchForm.sortBy
      searchForm.sortDirection = parsed.searchForm.sortDirection
    }
    
    // 恢复分页
    if (parsed.pagination) {
      currentPage.value = parsed.pagination.currentPage
      pageSize.value = parsed.pagination.pageSize
    }
  }
  
  fetchAchievementList()
})
</script>

<style scoped lang="scss">
.achievements-container {
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
  
  .reward-item {
    display: flex;
    align-items: center;
    margin-bottom: 10px;
  }
  
  .avatar-uploader {
    width: 178px;
    height: 178px;
    border: 1px dashed #d9d9d9;
    border-radius: 6px;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    transition: border-color 0.3s;
    
    &:hover {
      border-color: #409EFF;
    }
    
    .avatar {
      width: 178px;
      height: 178px;
      display: block;
    }
    
    .avatar-uploader-icon {
      font-size: 28px;
      color: #8c939d;
      width: 178px;
      height: 178px;
      line-height: 178px;
      text-align: center;
    }
    
    .el-upload__text {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: rgba(0, 0, 0, 0.5);
      color: #fff;
      text-align: center;
      padding: 5px 0;
    }
  }
}
</style>