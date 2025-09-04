<template>
  <div class="collections-container">
    <el-card class="table-card">
      <div class="header-actions">
        <el-button type="primary" @click="handleCreate">创建分类</el-button>
      </div>
      <el-table :data="tableData" border stripe v-loading="loading">
        <el-table-column prop="name" label="分类名称" />
        <el-table-column prop="firestoreCollection" label="Firestore集合" />
        <el-table-column prop="storagePrefix" label="存储前缀" />
        <el-table-column label="操作" width="200" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="handleViewDetail(row)">查看详情</el-button>
            <el-button link type="danger" @click="handleDelete(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
    
    <!-- 创建分类对话框 -->
    <el-dialog
      v-model="createDialogVisible"
      title="创建分类"
      width="500px"
    >
      <el-form 
        ref="createFormRef" 
        :model="createFormData" 
        :rules="createRules" 
        label-width="120px"
        v-loading="createLoading"
      >
        <el-form-item label="分类名称" prop="name">
          <el-input v-model="createFormData.name" placeholder="请输入分类名称" />
        </el-form-item>
        
        <el-form-item label="Firestore集合" prop="firestoreCollection">
          <el-input v-model="createFormData.firestoreCollection" placeholder="请输入Firestore集合名称" />
        </el-form-item>
        
        <el-form-item label="存储前缀" prop="storagePrefix">
          <el-input v-model="createFormData.storagePrefix" placeholder="请输入存储前缀" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="createDialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitCreateForm">确认</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 分类详情对话框 -->
    <el-dialog
      v-model="detailDialogVisible"
      title="分类详情"
      width="600px"
    >
      <div v-loading="detailLoading">
        <el-descriptions :column="1" border>
          <el-descriptions-item label="分类名称">{{ currentDetail.name }}</el-descriptions-item>
          <el-descriptions-item label="Firestore集合">{{ currentDetail.firestoreCollection }}</el-descriptions-item>
          <el-descriptions-item label="存储前缀">{{ currentDetail.storagePrefix }}</el-descriptions-item>
        </el-descriptions>

        <div v-if="detailData.detail" class="detail-section">
          <h3>详细信息</h3>
          <el-table :data="detailData.detail" border stripe>
            <el-table-column prop="loc" label="位置" />
            <el-table-column prop="msg" label="消息" />
            <el-table-column prop="type" label="类型" />
          </el-table>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { 
  getCardCollections,
  createCardCollection,
  getCardCollectionDetail,
  deleteCardCollection,
  type CardCollection
} from '../../api/storage'
import { ElMessage, ElMessageBox } from 'element-plus'

defineOptions({
  name: 'StorageCollections'
})

// 表格数据
const tableData = ref<CardCollection[]>([])
const loading = ref(false)

// 创建对话框相关
const createDialogVisible = ref(false)
const createLoading = ref(false)
const createFormRef = ref()

// 创建表单数据
const createFormData = reactive<CardCollection>({
  name: '',
  firestoreCollection: '',
  storagePrefix: ''
})

// 创建表单验证规则
const createRules = {
  name: [
    { required: true, message: '请输入分类名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  firestoreCollection: [
    { required: true, message: '请输入Firestore集合名称', trigger: 'blur' }
  ],
  storagePrefix: [
    { required: true, message: '请输入存储前缀', trigger: 'blur' }
  ]
}

// 详情对话框相关
const detailDialogVisible = ref(false)
const detailLoading = ref(false)
const currentDetail = ref<CardCollection>({
  name: '',
  firestoreCollection: '',
  storagePrefix: ''
})
const detailData = ref<any>({
  detail: []
})

// 获取分类列表
const fetchCollections = async () => {
  loading.value = true
  try {
    const response = await getCardCollections()
    tableData.value = response
  } catch (error) {
    console.error('获取分类列表失败：', error)
    ElMessage.error('获取分类列表失败')
  } finally {
    loading.value = false
  }
}

// 创建分类
const handleCreate = () => {
  createDialogVisible.value = true
}

// 提交创建表单
const submitCreateForm = async () => {
  if (!createFormRef.value) return
  
  await createFormRef.value.validate(async (valid: boolean) => {
    if (valid) {
      createLoading.value = true
      try {
        await createCardCollection(createFormData)
        ElMessage.success('创建分类成功')
        createDialogVisible.value = false
        resetCreateForm()
        fetchCollections() // 刷新列表
      } catch (error) {
        console.error('创建分类失败：', error)
        ElMessage.error('创建分类失败')
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
}

// 查看详情
const handleViewDetail = async (row: CardCollection) => {
  currentDetail.value = row
  detailDialogVisible.value = true
  detailLoading.value = true
  
  try {
    const response = await getCardCollectionDetail(row.name)
    detailData.value = response
  } catch (error) {
    console.error('获取分类详情失败：', error)
    ElMessage.error('获取分类详情失败')
  } finally {
    detailLoading.value = false
  }
}

// 删除分类
const handleDelete = async (row: CardCollection) => {
  try {
    await ElMessageBox.confirm(
      `确定要删除分类 "${row.name}" 吗？删除后无法恢复，且可能影响相关卡片数据。`,
      '警告',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
    )
    
    loading.value = true
    await deleteCardCollection(row.name)
    ElMessage.success('删除分类成功')
    fetchCollections() // 刷新列表
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('删除分类失败：', error)
      ElMessage.error('删除分类失败')
    }
  } finally {
    loading.value = false
  }
}

// 初始化
onMounted(() => {
  fetchCollections()
})
</script>

<style scoped lang="scss">
.collections-container {
  .table-card {
    .header-actions {
      margin-bottom: 16px;
    }
  }
}

.detail-section {
  margin-top: 20px;
  
  h3 {
    margin-bottom: 16px;
  }
}
</style>