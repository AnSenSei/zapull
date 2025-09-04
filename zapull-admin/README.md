# Boxed Admin - Vue 3 管理后台

基于 Vue 3 + TypeScript + Vite 构建的现代化管理后台系统。

## 🚀 快速开始

### 开发环境
```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 生产构建
```bash
# 构建生产版本
npm run build:prod

# 预览构建结果
npm run preview
```

## 🐳 Docker 部署

### 常规 Docker 构建
```bash
# 构建镜像
docker buildx build -t boxed-admin-image1:latest .

# 运行容器
docker run -d -p 8080:80 boxed-admin-image1:latest
```

### ⚠️ Docker 网络问题解决方案

如果遇到以下错误：
```
ERROR: failed to fetch oauth token: Post "https://auth.docker.io/token"
```

**推荐解决方案：**

1. **自动配置工具（最简单）**
   ```bash
   # 运行自动配置脚本
   setup-docker-mirror.bat
   ```

2. **手动配置 Docker 镜像加速器**
   - 打开 Docker Desktop 设置
   - 选择 "Docker Engine"
   - 添加镜像加速器配置
   - 详细步骤请查看：[DOCKER_MIRROR_SETUP.md](./DOCKER_MIRROR_SETUP.md)

3. **使用本地 HTTP 服务器（无需 Docker）**
   ```bash
   # 构建项目
   npm run build:prod
   
   # 启动本地服务器
   npx http-server dist -p 8080 -c-1 --cors
   ```
   访问：http://localhost:8080

4. **使用备用镜像源**
   - 编辑 `Dockerfile`
   - 取消注释备用镜像源行
   - 重新构建

## 📁 项目结构

```
src/
├── api/          # API 接口
├── components/   # 公共组件
├── layouts/      # 布局组件
├── router/       # 路由配置
├── views/        # 页面组件
├── utils/        # 工具函数
└── assets/       # 静态资源
```

## 🛠️ 技术栈

- **框架**: Vue 3
- **语言**: TypeScript
- **构建工具**: Vite
- **路由**: Vue Router
- **UI组件**: Element Plus
- **HTTP客户端**: Axios
- **容器化**: Docker

## 📋 可用脚本

- `npm run dev` - 启动开发服务器
- `npm run build` - 构建生产版本
- `npm run build:prod` - 构建生产版本（带环境变量）
- `npm run preview` - 预览构建结果
- `npm run lint` - 代码检查

## 🔧 环境变量

项目支持多环境配置：

- `.env` - 默认环境变量
- `.env.development` - 开发环境
- `.env.production` - 生产环境
- `.env.docker` - Docker 环境

主要环境变量：
- `VITE_APP_TITLE` - 应用标题
- `VITE_API_URL` - API 基础地址
- `VITE_BASE_URL` - 应用基础路径

## 📚 相关文档

- [Docker 镜像加速器配置指南](./DOCKER_MIRROR_SETUP.md)
- [Vue 3 官方文档](https://vuejs.org/)
- [Vite 官方文档](https://vitejs.dev/)
- [TypeScript 官方文档](https://www.typescriptlang.org/)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
