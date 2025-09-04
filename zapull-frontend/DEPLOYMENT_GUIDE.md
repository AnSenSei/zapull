# Boxed User 项目部署指南

## 部署包信息
- 文件名：`boxed-user-deployment.zip`
- 大小：约 194MB
- 创建时间：2025/7/28

## 部署包内容
- `.next/` - Next.js 构建产物
- `package.json` - 项目依赖配置
- `package-lock.json` - 依赖锁定文件
- `.env.local` - 环境变量配置
- `next.config.ts` - Next.js 配置
- `public/` - 静态资源文件

## 服务器部署步骤

### 1. 环境要求
- Node.js 18+ 
- npm 或 yarn
- 支持 Next.js 的服务器环境

### 2. 部署流程

#### 步骤 1：上传并解压
```bash
# 上传 boxed-user-deployment.zip 到服务器
# 解压文件
unzip boxed-user-deployment.zip
cd boxed-user
```

#### 步骤 2：安装依赖
```bash
npm install --production
```

#### 步骤 3：启动应用
```bash
# 生产环境启动
npm start

# 或使用 PM2 进行进程管理
pm2 start npm --name "boxed-user" -- start
```

### 3. 环境变量配置

项目已包含 `.env.local` 文件，包含以下配置：

- **API 配置**
  - `NEXT_PUBLIC_API_BASE_URL`: 用户后端 API 地址
  - `NEXT_PUBLIC_GACHA_API_BASE_URL`: 抽卡后端 API 地址

- **Firebase 配置**
  - 完整的 Firebase 项目配置

- **Stripe 支付配置**
  - 测试环境的 Stripe 密钥

### 4. 端口配置

默认端口：3000

如需修改端口，可以通过以下方式：
```bash
# 方式 1：环境变量
PORT=8080 npm start

# 方式 2：修改 package.json 中的 start 脚本
"start": "next start -p 8080"
```

### 5. 反向代理配置（Nginx 示例）

```nginx
server {
    listen 80;
    server_name your-domain.com;

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

### 6. 健康检查

部署完成后，访问以下地址验证：
- 主页：`http://your-domain.com/`
- 健康检查：`http://your-domain.com/api/health`（如果有的话）

### 7. 日志监控

```bash
# 查看应用日志
pm2 logs boxed-user

# 或直接运行时的日志
npm start 2>&1 | tee app.log
```

## 注意事项

1. **安全性**：确保 `.env.local` 文件权限设置正确，避免敏感信息泄露
2. **性能**：建议使用 PM2 或类似工具进行进程管理
3. **更新**：如需更新，重新构建并替换 `.next` 目录即可
4. **备份**：定期备份配置文件和用户数据

## 故障排除

### 常见问题

1. **端口被占用**
   ```bash
   # 查看端口占用
   netstat -tulpn | grep :3000
   # 杀死占用进程
   kill -9 <PID>
   ```

2. **依赖安装失败**
   ```bash
   # 清理缓存重新安装
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **环境变量未生效**
   - 检查 `.env.local` 文件是否存在
   - 确认环境变量名称正确（必须以 `NEXT_PUBLIC_` 开头的才能在客户端使用）

## 联系支持

如遇到部署问题，请检查：
1. Node.js 版本是否符合要求
2. 网络连接是否正常
3. API 服务是否可访问
4. 防火墙设置是否正确