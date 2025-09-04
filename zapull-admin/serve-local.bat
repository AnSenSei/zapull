@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo 启动本地Web服务器...
echo.

REM 检查dist目录是否存在
if not exist "dist" (
    echo 错误: dist 目录不存在，请先运行构建命令
    echo 运行: npm run build
    pause
    exit /b 1
)

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo 错误: Node.js 未安装，请先安装 Node.js
    pause
    exit /b 1
)

REM 检查是否安装了http-server
npx http-server --version >nul 2>&1
if errorlevel 1 (
    echo 安装 http-server...
    npm install -g http-server
    if errorlevel 1 (
        echo 错误: http-server 安装失败
        pause
        exit /b 1
    )
)

echo 服务器配置:
echo - 端口: 8080
echo - 目录: dist
echo - 访问地址: http://localhost:8080
echo.
echo 按 Ctrl+C 停止服务器
echo.

REM 启动http-server
cd dist
npx http-server -p 8080 -c-1 --cors

pause