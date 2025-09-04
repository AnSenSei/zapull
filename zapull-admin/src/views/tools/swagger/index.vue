<template>
  <div class="swagger-container">
    <el-card>
      <template #header>
        <div class="card-header">
          <span>API文档</span>
          <el-select v-model="selectedVersion" placeholder="选择版本">
            <el-option
              v-for="item in versions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            />
          </el-select>
        </div>
      </template>
      <iframe
        v-if="swaggerUrl"
        :src="swaggerUrl"
        frameborder="0"
        width="100%"
        height="800"
      ></iframe>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const selectedVersion = ref('v1')
const versions = ref([
  { label: 'V1版本', value: 'v1' },
  { label: 'V2版本', value: 'v2' }
])

const swaggerUrl = computed(() => {
  return `/swagger-ui/${selectedVersion.value}/index.html`
})
</script>

<style scoped lang="scss">
.swagger-container {
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
}
</style>