/**
 * Firestore top_hits数据种子脚本
 * 使用方法：
 * 1. 确保已安装firebase-admin: npm install firebase-admin
 * 2. 创建服务账号密钥文件并下载为serviceAccountKey.json
 * 3. 运行脚本: node scripts/seedWinners.js
 */

const admin = require('firebase-admin');
const serviceAccount = require('../serviceAccountKey.json');

// 初始化Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// 模拟获奖者数据
const mockWinners = [
  {
    user_name: '玩家小明',
    price: 459.99,
    image_url: 'https://picsum.photos/id/237/300/300', // 使用随机图片服务
    created_at: admin.firestore.Timestamp.fromDate(new Date()),
    item_name: 'Mox Sapphira'
  },
  {
    user_name: '游戏达人',
    price: 299.50,
    image_url: 'https://picsum.photos/id/238/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60)), // 1小时前
    item_name: '稀有装备'
  },
  {
    user_name: '幸运星',
    price: 1299.99,
    image_url: 'https://picsum.photos/id/239/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60 * 2)), // 2小时前
    item_name: '传说武器'
  },
  {
    user_name: '快乐玩家',
    price: 599.00,
    image_url: 'https://picsum.photos/id/240/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60 * 3)), // 3小时前
    item_name: '神秘宝箱'
  },
  {
    user_name: '收藏家',
    price: 899.75,
    image_url: 'https://picsum.photos/id/241/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60 * 4)), // 4小时前
    item_name: '限定皮肤'
  },
  {
    user_name: '冒险者',
    price: 199.99,
    image_url: 'https://picsum.photos/id/242/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60 * 5)), // 5小时前
    item_name: '精灵宠物'
  },
  {
    user_name: '战神',
    price: 2499.00,
    image_url: 'https://picsum.photos/id/243/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60 * 6)), // 6小时前
    item_name: '神器'
  },
  {
    user_name: '魔法师',
    price: 359.50,
    image_url: 'https://picsum.photos/id/244/300/300',
    created_at: admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000 * 60 * 60 * 7)), // 7小时前
    item_name: '魔法卷轴'
  }
];

// 添加数据到Firestore
async function seedWinners() {
  try {
    const batch = db.batch();
    const topHitsCollection = db.collection('top_hits');
    
    // 先清空现有数据
    const existingDocs = await topHitsCollection.get();
    existingDocs.forEach(doc => {
      batch.delete(doc.ref);
    });
    
    // 添加新数据
    mockWinners.forEach(winner => {
      const docRef = topHitsCollection.doc(); // 自动生成ID
      batch.set(docRef, winner);
    });
    
    await batch.commit();
    console.log(`成功添加 ${mockWinners.length} 条top_hits数据`);
  } catch (error) {
    console.error('添加数据失败:', error);
  } finally {
    process.exit(0);
  }
}

seedWinners();