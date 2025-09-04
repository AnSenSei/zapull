# Firestore 数据库设置指南

本文档将指导您如何设置 Firebase Firestore 数据库，并将其与首页的 Winner 数据展示功能对接。数据将从 `top_hits` 集合中获取。

## 1. 创建 Firebase 项目

1. 访问 [Firebase 控制台](https://console.firebase.google.com/)
2. 点击「添加项目」
3. 输入项目名称，例如 `boxed-user`
4. 按照向导完成项目创建

## 2. 设置 Firestore 数据库

1. 在 Firebase 控制台中，选择您刚创建的项目
2. 在左侧导航栏中，点击「构建」下的「Firestore Database」
3. 点击「创建数据库」
4. 选择安全规则的起始模式（建议开发阶段选择「测试模式」）
5. 选择数据库位置（建议选择离您用户最近的位置）

## 3. 配置环境变量

1. 在 Firebase 控制台中，点击项目设置（齿轮图标）
2. 在「常规」标签页下，找到「您的应用」部分
3. 点击 Web 应用图标（`</>`）添加 Web 应用
4. 注册应用（输入应用昵称，例如 `boxed-user-web`）
5. 复制显示的 Firebase 配置对象
6. 在项目根目录创建或编辑 `.env.local` 文件，添加以下环境变量：

```
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_auth_domain
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_storage_bucket
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_messaging_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your_measurement_id
```

## 4. 添加测试数据

### 方法一：使用提供的种子脚本

1. 在 Firebase 控制台中，点击项目设置 > 服务账号
2. 点击「生成新的私钥」按钮，下载 JSON 文件
3. 将下载的 JSON 文件重命名为 `serviceAccountKey.json` 并放在项目根目录
4. 安装 firebase-admin：
   ```bash
   npm install firebase-admin --save-dev
   ```
5. 运行种子脚本：
   ```bash
   node scripts/seedWinners.js
   ```

### 方法二：手动添加数据

1. 在 Firebase 控制台中，进入 Firestore Database
2. 创建一个名为 `top_hits` 的集合
3. 添加文档，每个文档包含以下字段：
   - `user_name`：字符串，获奖者用户名
   - `price`：数字，获奖金额
   - `image_url`：字符串，图片URL
   - `created_at`：时间戳，获奖时间
   - `item_name`：字符串，获奖物品名称

## 5. 安全规则设置

在生产环境中，您应该设置适当的安全规则。以下是一个基本的示例：

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 允许读取top_hits集合
    match /top_hits/{document=**} {
      allow read: if true;
      allow write: if false; // 只允许通过后端或管理员添加获奖记录
    }
    
    // 其他集合的规则
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 6. 图片存储

如果您需要上传获奖物品的图片，可以使用 Firebase Storage：

1. 在 Firebase 控制台中，点击「Storage」
2. 点击「开始使用」，按照向导设置
3. 上传图片后，获取图片的下载 URL 并存储在 Firestore 文档的 `imageUrl` 字段中

## 7. 验证集成

1. 启动开发服务器：
   ```bash
   npm run dev
   ```
2. 访问首页，查看 Winners 部分是否正确显示从 Firestore 获取的数据

## 常见问题

### 数据不显示

- 检查环境变量是否正确设置
- 检查 Firestore 集合名称是否为 `top_hits`
- 检查控制台是否有错误信息
- 确认 Firestore 安全规则允许读取操作

### 图片不显示

- 确保 `imageUrl` 是有效的公开可访问的 URL
- 如果使用 Firebase Storage，确保存储规则允许读取
- 检查 Next.js 图片配置是否正确（已在代码中配置）

### 性能优化

- 考虑为频繁查询的字段添加索引
- 使用 `limit()` 限制获取的数据量
- 实现数据缓存策略，减少 Firestore 读取次数