@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo 开始本地构建项目...

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: Node.js 未安装，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查npm是否可用
npm --version >nul 2>&1
if errorlevel 1 (
    echo 错误: npm 不可用
    pause
    exit /b 1
)

echo 安装项目依赖...
npm install
if errorlevel 1 (
    echo 错误: 依赖安装失败
    pause
    exit /b 1
)

echo 构建生产版本...
npm run build:prod
if errorlevel 1 (
    echo 错误: 项目构建失败
    pause
    exit /b 1
)

echo 项目构建完成！
echo 构建产物位于: dist 目录
echo.
echo 现在可以使用以下命令创建Docker镜像:
echo docker build -f Dockerfile.simple -t boxed-admin:latest .
echo.
pause