@echo off
chcp 65001 >nul
echo ========================================
echo   Boxed Admin 快速部署工具
echo ========================================
echo.
echo 请选择部署方式：
echo.
echo [1] 本地 HTTP 服务器 (推荐，无需 Docker)
echo [2] Docker 部署 (标准版)
echo [3] Docker 部署 (中国网络优化版)
echo [4] 检查网络连接
echo [5] 配置 Docker 镜像加速器
echo [0] 退出
echo.
set /p choice=请输入选项 (0-5): 

if "%choice%"=="1" goto local_server
if "%choice%"=="2" goto docker_standard
if "%choice%"=="3" goto docker_china
if "%choice%"=="4" goto check_network
if "%choice%"=="5" goto config_mirror
if "%choice%"=="0" goto end
goto invalid

:local_server
echo.
echo ========================================
echo   启动本地 HTTP 服务器
echo ========================================
echo.
echo 检查 dist 目录...
if not exist "dist" (
    echo 错误：dist 目录不存在，正在构建项目...
    call npm run build:skip:prod
    if errorlevel 1 (
        echo 构建失败，请检查错误信息
        pause
        goto end
    )
)

echo 启动服务器...
echo 访问地址：http://localhost:8080
echo 按 Ctrl+C 停止服务
echo.
npx http-server dist -p 8080 -c-1 --cors
goto end

:docker_standard
echo.
echo ========================================
echo   Docker 标准部署
echo ========================================
echo.
echo 检查 dist 目录...
if not exist "dist" (
    echo 错误：dist 目录不存在，正在构建项目...
    call npm run build:skip:prod
    if errorlevel 1 (
        echo 构建失败，请检查错误信息
        pause
        goto end
    )
)

echo 启动 Docker 服务...
docker-compose up -d
if errorlevel 1 (
    echo.
    echo Docker 部署失败！可能的原因：
    echo 1. 网络连接问题 - 尝试选项 [3] 中国网络优化版
    echo 2. Docker 未启动 - 请启动 Docker Desktop
    echo 3. 端口被占用 - 请检查 8080 端口
    echo.
    pause
    goto menu
) else (
    echo.
    echo 部署成功！
    echo 访问地址：http://localhost:8080
    echo 停止服务：docker-compose down
)
goto end

:docker_china
echo.
echo ========================================
echo   Docker 中国网络优化部署
echo ========================================
echo.
echo 检查 dist 目录...
if not exist "dist" (
    echo 错误：dist 目录不存在，正在构建项目...
    call npm run build:skip:prod
    if errorlevel 1 (
        echo 构建失败，请检查错误信息
        pause
        goto end
    )
)

echo 使用国内镜像源启动 Docker 服务...
docker-compose -f docker-compose.china.yml up -d
if errorlevel 1 (
    echo.
    echo Docker 部署失败！请尝试：
    echo 1. 选项 [1] 本地 HTTP 服务器部署
    echo 2. 选项 [5] 配置 Docker 镜像加速器
    echo 3. 检查 Docker 是否正常运行
    echo.
    pause
    goto menu
) else (
    echo.
    echo 部署成功！
    echo 访问地址：http://localhost:8080
    echo 停止服务：docker-compose -f docker-compose.china.yml down
)
goto end

:check_network
echo.
echo ========================================
echo   网络连接检查
echo ========================================
echo.
echo 检查 Docker Hub 连接...
curl -I https://registry-1.docker.io/ --connect-timeout 10
if errorlevel 1 (
    echo ❌ Docker Hub 连接失败
) else (
    echo ✅ Docker Hub 连接正常
)

echo.
echo 检查阿里云镜像源连接...
curl -I https://registry.cn-hangzhou.aliyuncs.com/ --connect-timeout 10
if errorlevel 1 (
    echo ❌ 阿里云镜像源连接失败
) else (
    echo ✅ 阿里云镜像源连接正常
)

echo.
echo 检查网易镜像源连接...
curl -I https://hub.c.163.com/ --connect-timeout 10
if errorlevel 1 (
    echo ❌ 网易镜像源连接失败
) else (
    echo ✅ 网易镜像源连接正常
)

echo.
echo 建议：
echo - 如果所有连接都失败，建议使用选项 [1] 本地服务器
echo - 如果只有 Docker Hub 失败，可以使用选项 [3] 中国优化版
echo.
pause
goto menu

:config_mirror
echo.
echo ========================================
echo   配置 Docker 镜像加速器
echo ========================================
echo.
echo 请手动配置 Docker 镜像加速器：
echo.
echo 1. 打开 Docker Desktop
echo 2. 进入 Settings ^> Docker Engine
echo 3. 在 JSON 配置中添加：
echo.
echo {
echo   "registry-mirrors": [
echo     "https://registry.cn-hangzhou.aliyuncs.com",
echo     "https://hub-mirror.c.163.com",
echo     "https://mirror.baidubce.com"
echo   ]
echo }
echo.
echo 4. 点击 "Apply ^& Restart"
echo 5. 等待 Docker 重启完成
echo.
echo 配置完成后，可以尝试选项 [2] 标准 Docker 部署
echo.
pause
goto menu

:invalid
echo 无效选项，请重新选择
pause

:menu
echo.
goto start

:end
echo.
echo 感谢使用 Boxed Admin 部署工具！
pause