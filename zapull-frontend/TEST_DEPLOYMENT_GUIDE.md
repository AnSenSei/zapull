# Test Environment Deployment Guide

## 概述
本指南说明如何将项目部署到test环境的服务器上。

## 生成的文件
- `test-deployment.zip` - 包含所有必要文件的部署包
- `.env.test` - test环境配置文件
- `deploy-test.js` - 部署脚本

## 快速部署命令
```bash
# 构建并打包test环境
npm run deploy:test

# 仅打包（如果已经构建过）
npm run package:test
```

## 服务器要求
- **Node.js**: 18.0.0 或更高版本
- **内存**: 至少 1GB RAM
- **存储**: 至少 500MB 可用空间
- **网络**: 能够访问外部API端点

## 部署步骤

### 1. 上传部署包
```bash
# 使用scp上传到服务器
scp test-deployment.zip user@server:/path/to/deployment/

# 或使用其他文件传输工具
```

### 2. 服务器端操作
```bash
# 解压部署包
unzip test-deployment.zip

# 进入项目目录
cd /path/to/deployment/

# 安装生产依赖
npm install --production

# 复制环境配置
cp .env.test .env.local
```

### 3. 启动应用
```bash
# 直接启动
npm run start:test

# 或使用PM2进程管理器（推荐）
npm install -g pm2
pm2 start npm --name "boxed-test" -- run start:test
pm2 save
pm2 startup
```

## 环境配置说明

### API端点
- **用户API**: `https://user-backend-351785787544.us-central1.run.app/users/api/v1`
- **Gacha API**: `https://backend-769075815684.us-central1.run.app/gacha/api/v1`

### Firebase配置
- 使用测试环境的Firebase项目
- 项目ID: `seventh-program-433718-h8`

### Stripe配置
- 使用测试密钥
- 支持测试支付流程

## 验证部署

### 健康检查
```bash
# 检查应用是否正常运行
curl http://localhost:3000

# 检查API连接
curl http://localhost:3000/api/health
```

### 日志监控
```bash
# 查看应用日志
pm2 logs boxed-test

# 或直接查看Node.js日志
tail -f /path/to/logs/app.log
```

## 常见问题排除

### 端口冲突
```bash
# 检查端口占用
netstat -tulpn | grep :3000

# 修改端口（如需要）
export PORT=3001
npm run start:test
```

### 权限问题
```bash
# 确保文件权限正确
chmod -R 755 /path/to/deployment/
chown -R www-data:www-data /path/to/deployment/
```

### 内存不足
```bash
# 增加Node.js内存限制
export NODE_OPTIONS="--max-old-space-size=2048"
npm run start:test
```

## 反向代理配置（Nginx示例）

```nginx
server {
    listen 80;
    server_name your-test-domain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

## 更新部署

```bash
# 停止当前应用
pm2 stop boxed-test

# 备份当前版本
cp -r /path/to/deployment /path/to/backup/$(date +%Y%m%d_%H%M%S)

# 上传新的部署包并重复部署步骤
# ...

# 重启应用
pm2 restart boxed-test
```

## 监控和维护

### 性能监控
- 使用PM2监控面板: `pm2 monit`
- 设置日志轮转: `pm2 install pm2-logrotate`

### 自动重启
```bash
# 设置内存限制自动重启
pm2 start npm --name "boxed-test" --max-memory-restart 1G -- run start:test
```

### 备份策略
- 定期备份应用文件
- 备份环境配置
- 监控磁盘空间使用

## 支持联系
如遇到部署问题，请联系开发团队并提供：
- 服务器系统信息
- 错误日志
- 部署步骤记录