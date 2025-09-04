import axios from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig, AxiosResponse } from 'axios'

const baseURL = import.meta.env.VITE_API_URL

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 移除时间戳参数以减少服务器负载
    // const timestamp = new Date().getTime()
    // if (config.method?.toLowerCase() === 'get') {
    //   config.params = { ...config.params, _t: timestamp }
    // }

    // 添加 token
    const token = localStorage.getItem('token')
    if (token) {
      config.headers = config.headers || {}
      config.headers['Authorization'] = `Bearer ${token}`
    }
    
    // If sending FormData, let the browser set the Content-Type with boundary
    if (config.data instanceof FormData) {
      delete config.headers['Content-Type']
    }
    
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse) => {
    return response.data
  },
  (error) => {
    return Promise.reject(error)
  }
)

export default request