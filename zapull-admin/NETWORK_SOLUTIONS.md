# Docker 网络问题解决方案

## 🚨 问题描述

当遇到以下错误时：
```
failed to fetch oauth token: Post "https://auth.docker.io/token": dial tcp 157.240.17.41:443: connectex
```

这表示无法连接到 Docker Hub，通常是网络连接问题。

## 🔧 解决方案

### 方案一：配置 Docker 镜像加速器（推荐）

#### 1. 阿里云镜像加速器
```json
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://hub-mirror.c.163.com",
    "https://mirror.baidubce.com"
  ]
}
```

#### 2. 配置步骤
**Windows Docker Desktop:**
1. 打开 Docker Desktop
2. 进入 Settings → Docker Engine
3. 添加上述配置到 JSON 中
4. 点击 "Apply & Restart"

**Linux:**
```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://hub-mirror.c.163.com"
  ]
}
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

### 方案二：使用国内镜像源

修改 Dockerfile，使用国内镜像：
```dockerfile
# 替换原有的 FROM nginx:alpine
FROM registry.cn-hangzhou.aliyuncs.com/library/nginx:alpine
# 或者
FROM hub.c.163.com/library/nginx:alpine
```

### 方案三：本地 HTTP 服务器部署（最简单）

**无需 Docker，直接使用构建产物：**

#### Node.js 方式
```bash
# 进入项目目录
cd boxed-admin-image

# 使用 http-server
npx http-server dist -p 8080 -c-1 --cors

# 或使用 serve
npx serve dist -p 8080
```

#### Python 方式
```bash
# Python 3
python -m http.server 8080 --directory dist

# Python 2
cd dist && python -m SimpleHTTPServer 8080
```

#### PHP 方式
```bash
cd dist
php -S localhost:8080
```

### 方案四：离线镜像导入

如果有其他可以联网的机器：

```bash
# 在联网机器上
docker pull nginx:alpine
docker save nginx:alpine > nginx-alpine.tar

# 传输到目标机器后
docker load < nginx-alpine.tar
```

### 方案五：使用代理

#### Docker 代理配置
```bash
# 设置 Docker 代理
sudo mkdir -p /etc/systemd/system/docker.service.d
sudo tee /etc/systemd/system/docker.service.d/proxy.conf <<-'EOF'
[Service]
Environment="HTTP_PROXY=http://proxy.example.com:8080"
Environment="HTTPS_PROXY=http://proxy.example.com:8080"
Environment="NO_PROXY=localhost,127.0.0.1"
EOF
sudo systemctl daemon-reload
sudo systemctl restart docker
```

## 🎯 推荐部署流程

### 快速部署（推荐）
1. 解压 `boxed-admin-image-fixed.zip`
2. 进入目录：`cd boxed-admin-image`
3. 启动服务：`npx http-server dist -p 8080 -c-1 --cors`
4. 访问：http://localhost:8080

### Docker 部署
1. 配置镜像加速器（见方案一）
2. 解压并进入目录
3. 运行：`docker-compose up -d`

## 📝 环境变量配置

无论使用哪种部署方式，都可以通过修改 `.env` 文件配置：

```env
# API 服务地址
VITE_API_URL=https://your-api-server.com

# 应用标题
VITE_APP_TITLE=Your App Name

# 基础路径
VITE_BASE_URL=/

# 主机端口
HOST_PORT=8080
```

## 🔍 故障排查

### 检查网络连接
```bash
# 测试 Docker Hub 连接
curl -I https://registry-1.docker.io/

# 测试镜像加速器
curl -I https://registry.cn-hangzhou.aliyuncs.com/
```

### 查看 Docker 配置
```bash
# 查看镜像加速器配置
docker info | grep -A 10 "Registry Mirrors"

# 查看 Docker 版本
docker version
```

### 清理 Docker 缓存
```bash
# 清理构建缓存
docker builder prune -a

# 清理所有未使用的资源
docker system prune -a
```