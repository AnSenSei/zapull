<template>
  <div class="create-pack-container">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>创建卡包</span>
          <el-button @click="goBack">返回</el-button>
        </div>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
        class="create-form"
      >
        <el-form-item label="卡包名称" prop="pack_name">
          <el-input v-model="form.pack_name" placeholder="请输入卡包名称" />
        </el-form-item>
        
        <el-form-item label="卡包集合" prop="collection_id">
          <el-select v-model="form.collection_id" placeholder="请选择卡包集合">
            <el-option
              v-for="item in collections"
              :key="item.id"
              :label="item.name"
              :value="item.id.toString()"
            />
          </el-select>
        </el-form-item>
        
        <el-form-item label="价格" prop="price">
          <el-input-number v-model="form.price" :min="0" :precision="2" :step="0.1" />
        </el-form-item>
        
        <el-form-item label="中奖率" prop="win_rate">
          <el-input-number v-model="form.win_rate" :min="0" :max="100" :precision="2" :step="0.1" />
        </el-form-item>
        
        <el-form-item label="最大中奖金额" prop="max_win">
          <el-input-number v-model="form.max_win" :min="0" :precision="2" :step="0.1" />
        </el-form-item>
        
        <el-form-item label="最小中奖金额" prop="min_win">
          <el-input-number v-model="form.min_win" :min="0" :precision="2" :step="0.1" />
        </el-form-item>
        
        <el-form-item label="热度" prop="popularity">
          <el-input v-model="form.popularity" placeholder="请输入热度" />
        </el-form-item>
        
        <el-form-item label="分类" prop="separation">
          <el-select v-model="form.separation" placeholder="请选择分类">
            <el-option label="Feature Packs" value="feature" />
            <el-option label="Hunt Packs" value="hunt" />
            <el-option label="Special Packs" value="special" />
            <el-option label="Other Packs" value="other" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="类型" prop="type">
          <el-select v-model="form.type" placeholder="请选择类型">
            <el-option label="CN" value="CN" />
            <el-option label="JP" value="JP" />
            <el-option label="US" value="US" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="卡包图片" prop="image_file">
          <el-upload
            class="avatar-uploader"
            action=""
            :show-file-list="false"
            :auto-upload="false"
            :on-change="handleImageChange"
          >
            <img v-if="imageUrl" :src="imageUrl" class="avatar" />
            <el-icon v-else class="avatar-uploader-icon"><Plus /></el-icon>
          </el-upload>
        </el-form-item>
        
        <el-form-item>
          <el-button type="primary" @click="submitForm" :loading="loading">创建</el-button>
          <el-button @click="resetForm">重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, FormInstance, FormRules } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { getPackCollections, createPack, PackCollection, CreatePackParams } from '@/api/packs'

const router = useRouter()
const route = useRoute()
const formRef = ref<FormInstance>()
const loading = ref(false)
const collections = ref<PackCollection[]>([])
const imageUrl = ref('')
const imageFile = ref<File | null>(null)

const form = ref<CreatePackParams>({
  pack_name: '',
  collection_id: '',
  price: 0,
  win_rate: 0,
  max_win: 0,
  min_win: 0,
  popularity: '',
  separation: 'other',
  type: 'US',  // Default to US
  image_file: ''
})

const rules = ref<FormRules>({
  pack_name: [
    { required: true, message: '请输入卡包名称', trigger: 'blur' },
    { min: 2, max: 50, message: '长度在 2 到 50 个字符', trigger: 'blur' }
  ],
  collection_id: [
    { required: true, message: '请选择卡包集合', trigger: 'change' }
  ],
  price: [
    { required: true, message: '请输入价格', trigger: 'blur' }
  ]
})

// 获取卡包集合
const fetchCollections = async () => {
  try {
    collections.value = await getPackCollections()
    
    // 检查URL中是否有传递的分类ID
    const collectionId = route.query.collectionId as string
    if (collectionId) {
      form.value.collection_id = collectionId
    } else if (collections.value.length > 0) {
      form.value.collection_id = collections.value[0].id.toString()
    }
  } catch (error) {
    console.error('获取卡包集合失败:', error)
    ElMessage.error('获取卡包集合失败')
  }
}

// 处理图片变化
const handleImageChange = (file: any) => {
  imageFile.value = file.raw
  if (imageFile.value) {
    const reader = new FileReader()
    reader.onload = (e) => {
      imageUrl.value = e.target?.result as string
      // 将图片转为base64格式
      const base64 = imageUrl.value
      form.value.image_file = base64
    }
    reader.readAsDataURL(imageFile.value)
  }
}

// 提交表单
const submitForm = async () => {
  if (!formRef.value) return
  
  await formRef.value.validate(async (valid) => {
    if (valid) {
      loading.value = true
      try {
        await createPack(form.value)
        ElMessage.success('创建卡包成功')
        
        // 返回时保留分类ID
        const collectionId = route.query.collectionId
        if (collectionId) {
          router.push(`/storage/packs?collectionId=${collectionId}`)
        } else {
          router.push('/storage/packs')
        }
      } catch (error) {
        console.error('创建卡包失败:', error)
        ElMessage.error('创建卡包失败')
      } finally {
        loading.value = false
      }
    }
  })
}

// 重置表单
const resetForm = () => {
  if (!formRef.value) return
  formRef.value.resetFields()
  imageUrl.value = ''
  imageFile.value = null
}

// 返回列表页
const goBack = () => {
  // 返回时保留分类ID
  const collectionId = route.query.collectionId
  if (collectionId) {
    router.push(`/storage/packs?collectionId=${collectionId}`)
  } else {
    router.push('/storage/packs')
  }
}

onMounted(() => {
  fetchCollections()
})
</script>

<style scoped>
.create-pack-container {
  padding: 20px;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.create-form {
  max-width: 600px;
  margin: 0 auto;
}

.avatar-uploader {
  border: 1px dashed #d9d9d9;
  border-radius: 6px;
  cursor: pointer;
  position: relative;
  overflow: hidden;
  width: 178px;
  height: 178px;
  display: flex;
  justify-content: center;
  align-items: center;
}

.avatar-uploader:hover {
  border-color: #409eff;
}

.avatar-uploader-icon {
  font-size: 28px;
  color: #8c939d;
  width: 178px;
  height: 178px;
  text-align: center;
  display: flex;
  justify-content: center;
  align-items: center;
}

.avatar {
  width: 178px;
  height: 178px;
  display: block;
}
</style>