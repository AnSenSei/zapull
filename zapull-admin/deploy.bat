@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

REM Boxed Admin Docker 部署脚本 (Windows版本)

set "RED=[91m"
set "GREEN=[92m"
set "YELLOW=[93m"
set "BLUE=[94m"
set "NC=[0m"

REM 打印带颜色的消息
:print_message
echo %~2%~1%NC%
goto :eof

REM 检查Docker是否安装
:check_docker
docker --version >nul 2>&1
if errorlevel 1 (
    call :print_message "Docker 未安装，请先安装 Docker Desktop" "%RED%"
    pause
    exit /b 1
)

docker-compose --version >nul 2>&1
if errorlevel 1 (
    call :print_message "Docker Compose 未安装，请先安装 Docker Compose" "%RED%"
    pause
    exit /b 1
)
goto :eof

REM 构建镜像
:build_image
call :print_message "开始构建 Docker 镜像..." "%BLUE%"
docker-compose build
if errorlevel 1 (
    call :print_message "镜像构建失败" "%RED%"
    pause
    exit /b 1
)
call :print_message "镜像构建完成" "%GREEN%"
goto :eof

REM 启动服务
:start_service
call :print_message "启动服务..." "%BLUE%"
docker-compose up -d
if errorlevel 1 (
    call :print_message "服务启动失败" "%RED%"
    pause
    exit /b 1
)
call :print_message "服务启动完成" "%GREEN%"
call :print_message "应用访问地址: http://localhost:8080" "%YELLOW%"
goto :eof

REM 停止服务
:stop_service
call :print_message "停止服务..." "%BLUE%"
docker-compose down
call :print_message "服务已停止" "%GREEN%"
goto :eof

REM 查看日志
:view_logs
call :print_message "查看服务日志..." "%BLUE%"
docker-compose logs -f boxed-admin
goto :eof

REM 重启服务
:restart_service
call :print_message "重启服务..." "%BLUE%"
docker-compose down
docker-compose up -d
call :print_message "服务重启完成" "%GREEN%"
goto :eof

REM 更新部署
:update_deploy
call :print_message "更新部署..." "%BLUE%"
docker-compose down
docker-compose build
if errorlevel 1 (
    call :print_message "构建失败" "%RED%"
    pause
    exit /b 1
)
docker-compose up -d
call :print_message "更新部署完成" "%GREEN%"
goto :eof

REM 清理资源
:clean_up
call :print_message "清理 Docker 资源..." "%BLUE%"
docker-compose down
docker system prune -f
call :print_message "清理完成" "%GREEN%"
goto :eof

REM 显示帮助信息
:show_help
echo Boxed Admin Docker 部署脚本 (Windows版本)
echo.
echo 用法: %~nx0 [选项]
echo.
echo 选项:
echo   build     构建 Docker 镜像
echo   start     启动服务
echo   stop      停止服务
echo   restart   重启服务
echo   logs      查看日志
echo   update    更新部署（重新构建并启动）
echo   clean     清理 Docker 资源
echo   help      显示帮助信息
echo.
echo 示例:
echo   %~nx0 build     # 构建镜像
echo   %~nx0 start     # 启动服务
echo   %~nx0 update    # 更新部署
echo.
pause
goto :eof

REM 主函数
call :check_docker

if "%~1"=="build" (
    call :build_image
) else if "%~1"=="start" (
    call :start_service
) else if "%~1"=="stop" (
    call :stop_service
) else if "%~1"=="restart" (
    call :restart_service
) else if "%~1"=="logs" (
    call :view_logs
) else if "%~1"=="update" (
    call :update_deploy
) else if "%~1"=="clean" (
    call :clean_up
) else if "%~1"=="help" (
    call :show_help
) else if "%~1"=="--help" (
    call :show_help
) else if "%~1"=="-h" (
    call :show_help
) else if "%~1"=="" (
    call :print_message "请指定操作，使用 '%~nx0 help' 查看帮助" "%YELLOW%"
    pause
) else (
    call :print_message "未知选项: %~1" "%RED%"
    call :print_message "使用 '%~nx0 help' 查看帮助" "%YELLOW%"
    pause
    exit /b 1
)

if not "%~1"=="logs" (
    pause
)