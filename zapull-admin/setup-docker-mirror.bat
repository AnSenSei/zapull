@echo off
chcp 65001 >nul
echo ====================================
echo Docker 镜像加速器配置工具
echo ====================================
echo.

echo 正在检查 Docker 状态...
docker version >nul 2>&1
if %errorlevel% neq 0 (
    echo [错误] Docker 未运行或未安装
    echo 请确保 Docker Desktop 已启动
    pause
    exit /b 1
)

echo [成功] Docker 运行正常
echo.

echo 选择配置方案：
echo 1. 自动配置 Docker 镜像加速器（推荐）
echo 2. 测试网络连接
echo 3. 使用本地 HTTP 服务器部署
echo 4. 查看详细配置指南
echo 5. 退出
echo.
set /p choice=请选择 (1-5): 

if "%choice%"=="1" goto configure_mirror
if "%choice%"=="2" goto test_network
if "%choice%"=="3" goto local_server
if "%choice%"=="4" goto show_guide
if "%choice%"=="5" goto end

echo 无效选择，请重新运行脚本
pause
exit /b 1

:configure_mirror
echo.
echo 正在配置 Docker 镜像加速器...
echo.
echo 请手动完成以下步骤：
echo 1. 打开 Docker Desktop
echo 2. 点击右上角设置图标（齿轮）
echo 3. 选择 "Docker Engine"
echo 4. 在配置文件中添加以下内容：
echo.
echo {
echo   "registry-mirrors": [
echo     "https://docker.mirrors.ustc.edu.cn",
echo     "https://hub-mirror.c.163.com",
echo     "https://registry.docker-cn.com"
echo   ]
echo }
echo.
echo 5. 点击 "Apply ^& Restart"
echo 6. 等待 Docker 重启完成
echo.
echo 配置完成后，按任意键测试镜像拉取...
pause >nul

echo 测试拉取 nginx:alpine 镜像...
docker pull nginx:alpine
if %errorlevel% equ 0 (
    echo [成功] 镜像加速器配置成功！
    echo 现在可以运行: docker buildx build -t boxed-admin-image1:latest .
) else (
    echo [失败] 镜像拉取失败，请尝试其他方案
)
goto end

:test_network
echo.
echo 正在测试网络连接...
echo.
echo 测试 Docker Hub 连接:
ping -n 4 registry-1.docker.io
echo.
echo 测试中科大镜像源:
ping -n 4 docker.mirrors.ustc.edu.cn
echo.
echo 如果上述连接都失败，建议使用本地 HTTP 服务器部署
goto end

:local_server
echo.
echo 启动本地 HTTP 服务器部署...
echo.
echo 检查 dist 目录是否存在...
if not exist "dist" (
    echo dist 目录不存在，正在构建项目...
    npm run build:prod
    if %errorlevel% neq 0 (
        echo [错误] 项目构建失败
        pause
        exit /b 1
    )
)

echo 启动 HTTP 服务器在端口 8080...
echo 访问地址: http://localhost:8080
echo 按 Ctrl+C 停止服务器
npx http-server dist -p 8080 -c-1 --cors
goto end

:show_guide
echo.
echo 正在打开详细配置指南...
start DOCKER_MIRROR_SETUP.md
goto end

:end
echo.
echo 脚本执行完成
pause