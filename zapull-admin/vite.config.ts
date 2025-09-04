import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import viteCompression from 'vite-plugin-compression'
import { visualizer } from 'rollup-plugin-visualizer'
import { fileURLToPath } from 'url'

// 获取当前文件的目录路径
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // 根据当前工作目录中的 `mode` 加载 .env 文件
  // 设置第三个参数为 '' 来加载所有环境变量，而不管是否有 `VITE_` 前缀。
  const env = loadEnv(mode, process.cwd(), '')
  
  const isProduction = mode === 'production'
  const isAnalyze = mode === 'analyze'
  
  return {
    base: env.VITE_BASE_URL || '/',
    plugins: [
      vue(),
      // gzip压缩
      isProduction && viteCompression({
        verbose: true,
        disable: false,
        threshold: 10240,
        algorithm: 'gzip',
        ext: '.gz',
      }),
      // 打包分析
      isAnalyze && visualizer({
        open: true,
        filename: 'dist/stats.html',
        gzipSize: true,
        brotliSize: true,
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    // 开发服务器配置
    server: {
      host: '0.0.0.0',
      port: 5174,
      open: true,
      cors: true,
      // 代理配置
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:3000',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, '')
        }
      }
    },
    // 构建配置
    build: {
      // 输出目录
      outDir: 'dist',
      // 静态资源目录
      assetsDir: 'assets',
      // 小于此阈值的导入或引用资源将内联为 base64 编码
      assetsInlineLimit: 4096,
      // 启用/禁用 CSS 代码拆分
      cssCodeSplit: true,
      // 构建后是否生成 source map 文件
      sourcemap: false,
      // 自定义底层的 Rollup 打包配置
      rollupOptions: {
        output: {
          // 静态资源分类打包
          chunkFileNames: 'assets/js/[name]-[hash].js',
          entryFileNames: 'assets/js/[name]-[hash].js',
          assetFileNames: 'assets/[ext]/[name]-[hash].[ext]',
          // 拆分打包
          manualChunks: {
            vue: ['vue', 'vue-router', 'pinia'],
            elementPlus: ['element-plus', '@element-plus/icons-vue'],
            echarts: ['echarts']
          }
        }
      },
      // 启用/禁用 gzip 压缩大小报告
      reportCompressedSize: false,
      // 设置触发警告的 chunk 大小阈值
      chunkSizeWarningLimit: 2000,
      // 压缩配置
      minify: 'terser',
      terserOptions: {
        compress: {
          // 生产环境去除 console 和 debugger
          drop_console: true,
          drop_debugger: true
        }
      }
    },
    // 全局 CSS 预处理器配置
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: '@import "@/assets/styles/variables.scss";'
        }
      }
    }
  }
})
