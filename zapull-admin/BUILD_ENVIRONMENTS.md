# 构建环境配置说明

本项目支持多种构建环境配置，可以根据不同需求使用不同的Firebase配置。

## 环境配置文件

### 开发环境
- **文件**: `.env`
- **Firebase项目**: `seventh-program-433718-h8`
- **用途**: 本地开发和测试

### 生产环境构建
- **文件**: `.env.production.build`
- **Firebase项目**: `zapull-production`
- **用途**: 生产环境部署

## 构建命令

### 开发环境
```bash
# 启动开发服务器（使用 .env 配置）
npm run dev

# 构建开发版本
npm run build:dev
npm run build:skip:dev
```

### 生产环境
```bash
# 构建生产版本（使用生产环境Firebase配置）
npm run build:skip

# 其他生产构建选项
npm run build:prod
npm run build:skip:prod
```

## Firebase配置对比

### 开发环境配置
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyBfbEQUIGs-0rGMMw2GLFkcq6EvlG4ID40",
  authDomain: "seventh-program-433718-h8.firebaseapp.com",
  projectId: "seventh-program-433718-h8",
  storageBucket: "seventh-program-433718-h8.firebasestorage.app",
  messagingSenderId: "351785787544",
  appId: "1:351785787544:web:eeb0ca41aa9ffa0354f0ed",
  measurementId: "G-X53524FJ7B"
};
```

### 生产环境配置
```javascript
const firebaseConfig = {
  apiKey: "AIzaSyD0lPBblDCNaRVIJzt0vr3589EbzEDlROQ",
  authDomain: "zapull-production.firebaseapp.com",
  projectId: "zapull-production",
  storageBucket: "zapull-production.firebasestorage.app",
  messagingSenderId: "769075815684",
  appId: "1:769075815684:web:94a8d97592c6f3fbf95c51",
  measurementId: "G-V5SJVMMW0F"
};
```

## 使用说明

1. **开发时**: 使用 `npm run dev` 启动开发服务器，会自动使用开发环境的Firebase配置
2. **生产构建**: 使用 `npm run build:skip` 进行生产构建，会自动使用生产环境的Firebase配置
3. **验证配置**: 构建完成后，可以在 `dist/assets/js/` 目录下的文件中搜索 `zapull-production` 来验证是否使用了正确的生产配置

## 注意事项

- 确保两个Firebase项目都已正确配置
- 生产环境部署前请验证Firebase配置是否正确
- 不要将敏感的Firebase配置信息提交到公共代码仓库