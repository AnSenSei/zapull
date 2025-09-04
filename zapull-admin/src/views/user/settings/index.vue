<template>
  <div class="settings-container">
    <el-tabs v-model="activeTab">
      <el-tab-pane label="基本设置" name="basic">
        <el-form
          ref="formRef"
          :model="formData"
          :rules="rules"
          label-width="100px"
        >
          <el-form-item label="邮箱" prop="email">
            <el-input v-model="formData.email" />
          </el-form-item>
          <el-form-item label="手机号码" prop="phone">
            <el-input v-model="formData.phone" />
          </el-form-item>
          <el-form-item label="个性签名" prop="bio">
            <el-input
              v-model="formData.bio"
              type="textarea"
              :rows="4"
              placeholder="请输入个性签名"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="handleSubmit">保存更改</el-button>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="安全设置" name="security">
        <el-form label-width="100px">
          <el-form-item label="账户密码">
            <el-button @click="handleChangePassword">修改密码</el-button>
          </el-form-item>
          <el-form-item label="登录验证">
            <el-switch v-model="securitySettings.twoFactor" />
            <div class="setting-desc">开启后，登录时需要进行双重验证</div>
          </el-form-item>
        </el-form>
      </el-tab-pane>

      <el-tab-pane label="通知设置" name="notification">
        <el-form label-width="100px">
          <el-form-item label="系统消息">
            <el-switch v-model="notificationSettings.system" />
          </el-form-item>
          <el-form-item label="邮件通知">
            <el-switch v-model="notificationSettings.email" />
          </el-form-item>
        </el-form>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { FormInstance, FormRules } from 'element-plus'

const activeTab = ref('basic')

const formData = ref({
  email: '',
  phone: '',
  bio: ''
})

const rules = ref<FormRules>({
  email: [
    { required: true, message: '请输入邮箱地址', trigger: 'blur' },
    { type: 'email', message: '请输入正确的邮箱地址', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入手机号码', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码', trigger: 'blur' }
  ]
})

const securitySettings = ref({
  twoFactor: false
})

const notificationSettings = ref({
  system: true,
  email: false
})

const formRef = ref<FormInstance>()

const handleSubmit = async () => {
  if (!formRef.value) return
  await formRef.value.validate((valid) => {
    if (valid) {
      // 提交表单
    }
  })
}

const handleChangePassword = () => {
  // 实现修改密码功能
}
</script>

<style scoped lang="scss">
.settings-container {
  background-color: #fff;
  padding: 20px;
  border-radius: 4px;

  .setting-desc {
    color: #909399;
    font-size: 12px;
    margin-top: 4px;
  }
}
</style>