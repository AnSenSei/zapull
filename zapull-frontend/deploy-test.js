const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// 创建部署包的脚本
function createDeploymentPackage() {
  const output = fs.createWriteStream('test-deployment.zip');
  const archive = archiver('zip', {
    zlib: { level: 9 } // 最高压缩级别
  });

  output.on('close', function() {
    console.log('部署包已创建: test-deployment.zip');
    console.log('总大小: ' + archive.pointer() + ' bytes');
    console.log('\n部署说明:');
    console.log('1. 将 test-deployment.zip 上传到服务器');
    console.log('2. 解压文件到网站根目录');
    console.log('3. 确保服务器支持 Node.js 环境');
    console.log('4. 运行: npm install --production');
    console.log('5. 启动: npm run start:test');
  });

  archive.on('error', function(err) {
    throw err;
  });

  archive.pipe(output);

  // 添加必要的文件到部署包
  archive.file('package.json', { name: 'package.json' });
  archive.file('package-lock.json', { name: 'package-lock.json' });
  archive.file('next.config.ts', { name: 'next.config.ts' });
  archive.file('.env.test', { name: '.env.test' });
  
  // 添加构建输出
  archive.directory('.next/', '.next/');
  archive.directory('public/', 'public/');
  
  // 添加部署说明文件
  const deploymentInstructions = `# Test Environment Deployment Instructions

## 服务器要求
- Node.js 18+ 
- npm 或 yarn
- 至少 1GB 内存

## 部署步骤
1. 解压 test-deployment.zip 到服务器目录
2. 运行: npm install --production
3. 设置环境变量: cp .env.test .env.local
4. 启动应用: npm run start:test
5. 应用将在端口 3000 启动

## 环境配置
- NODE_ENV=test
- 使用测试环境API端点
- 图片优化已禁用以支持静态部署

## 监控和日志
- 检查应用日志: pm2 logs (如果使用PM2)
- 健康检查: curl http://localhost:3000/api/health

## 故障排除
- 确保所有环境变量正确设置
- 检查防火墙设置允许端口3000
- 验证Node.js版本兼容性
`;
  
  archive.append(deploymentInstructions, { name: 'DEPLOYMENT.md' });
  
  archive.finalize();
}

// 检查是否存在构建文件
if (!fs.existsSync('.next')) {
  console.error('错误: 未找到构建文件。请先运行 npm run build:test');
  process.exit(1);
}

createDeploymentPackage();