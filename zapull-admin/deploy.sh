#!/bin/bash

# Boxed Admin Docker 部署脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 打印带颜色的消息
print_message() {
    echo -e "${2}${1}${NC}"
}

# 检查Docker是否安装
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_message "Docker 未安装，请先安装 Docker" $RED
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_message "Docker Compose 未安装，请先安装 Docker Compose" $RED
        exit 1
    fi
}

# 构建镜像
build_image() {
    print_message "开始构建 Docker 镜像..." $BLUE
    docker-compose build
    print_message "镜像构建完成" $GREEN
}

# 启动服务
start_service() {
    print_message "启动服务..." $BLUE
    docker-compose up -d
    print_message "服务启动完成" $GREEN
    print_message "应用访问地址: http://localhost:8080" $YELLOW
}

# 停止服务
stop_service() {
    print_message "停止服务..." $BLUE
    docker-compose down
    print_message "服务已停止" $GREEN
}

# 查看日志
view_logs() {
    print_message "查看服务日志..." $BLUE
    docker-compose logs -f boxed-admin
}

# 重启服务
restart_service() {
    print_message "重启服务..." $BLUE
    docker-compose down
    docker-compose up -d
    print_message "服务重启完成" $GREEN
}

# 更新部署
update_deploy() {
    print_message "更新部署..." $BLUE
    docker-compose down
    docker-compose build
    docker-compose up -d
    print_message "更新部署完成" $GREEN
}

# 清理资源
clean_up() {
    print_message "清理 Docker 资源..." $BLUE
    docker-compose down
    docker system prune -f
    print_message "清理完成" $GREEN
}

# 显示帮助信息
show_help() {
    echo "Boxed Admin Docker 部署脚本"
    echo ""
    echo "用法: $0 [选项]"
    echo ""
    echo "选项:"
    echo "  build     构建 Docker 镜像"
    echo "  start     启动服务"
    echo "  stop      停止服务"
    echo "  restart   重启服务"
    echo "  logs      查看日志"
    echo "  update    更新部署（重新构建并启动）"
    echo "  clean     清理 Docker 资源"
    echo "  help      显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 build     # 构建镜像"
    echo "  $0 start     # 启动服务"
    echo "  $0 update    # 更新部署"
}

# 主函数
main() {
    check_docker
    
    case "$1" in
        build)
            build_image
            ;;
        start)
            start_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        logs)
            view_logs
            ;;
        update)
            update_deploy
            ;;
        clean)
            clean_up
            ;;
        help|--help|-h)
            show_help
            ;;
        "")
            print_message "请指定操作，使用 '$0 help' 查看帮助" $YELLOW
            ;;
        *)
            print_message "未知选项: $1" $RED
            print_message "使用 '$0 help' 查看帮助" $YELLOW
            exit 1
            ;;
    esac
}

# 执行主函数
main "$@"