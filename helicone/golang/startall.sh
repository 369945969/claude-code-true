#!/bin/bash

# Helicone Go 版本启动脚本
# 启动三个模块：Web UI (3000), Jawn API (8585), Worker (8787)

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GOLANG_DIR="$SCRIPT_DIR/golang"

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  Helicone Go 版本启动脚本${NC}"
echo -e "${BLUE}========================================${NC}"

# 检查 Go 是否安装
if ! command -v go &> /dev/null; then
    echo -e "${RED}错误：Go 未安装，请先安装 Go 1.21 或更高版本${NC}"
    exit 1
fi

echo -e "${GREEN}✓ Go 已安装：$(go version)${NC}"

# 创建 .env 文件（如果不存在）
ENV_FILE="$GOLANG_DIR/.env"
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${YELLOW}创建 .env 文件...${NC}"
    cat > "$ENV_FILE" << 'EOF'
# Helicone Go 版本环境变量配置

# ==================== 通用配置 ====================
PORT=8585
ENVIRONMENT=development

# ==================== 数据库配置 ====================
DATABASE_URL=postgresql://postgres:testpassword@localhost:54388/helicone_test
CLICKHOUSE_HOST=http://localhost:18123
CLICKHOUSE_USER=default
CLICKHOUSE_PASSWORD=

# ==================== MinIO 配置 ====================
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=request-response-storage
S3_PROMPT_BUCKET_NAME=prompt-body-storage

# ==================== Redis 配置 ====================
REDIS_URL=redis://localhost:6379

# ==================== LLM 提供商配置 ====================
OPENAI_URL=https://api.openai.com
ANTHROPIC_URL=https://api.anthropic.com
GATEWAY_TARGET=https://openrouter.ai

# ==================== API 密钥 ====================
BETTER_AUTH_SECRET=your-secret-key-change-in-production
EOF
    echo -e "${GREEN}✓ .env 文件已创建${NC}"
fi

# 安装依赖
echo -e "${YELLOW}安装 Go 依赖...${NC}"
cd "$GOLANG_DIR"
go mod tidy

# 构建所有模块
echo -e "${YELLOW}构建 Go 模块...${NC}"

# 创建 bin 目录
mkdir -p "$GOLANG_DIR/bin"

# 构建 API 模块
echo -e "${BLUE}  构建 Jawn API...${NC}"
cd "$GOLANG_DIR/api"
go build -o ../bin/api main.go || {
    echo -e "${YELLOW}  注意：API 模块构建有警告，继续...${NC}"
}

# 构建 Worker 模块
echo -e "${BLUE}  构建 Worker...${NC}"
cd "$GOLANG_DIR/worker"
go build -o ../bin/worker main.go || {
    echo -e "${YELLOW}  注意：Worker 模块构建有警告，继续...${NC}"
}

# 构建 Web 模块
echo -e "${BLUE}  构建 Web UI...${NC}"
cd "$GOLANG_DIR/web"
go build -o ../bin/web main.go || {
    echo -e "${YELLOW}  注意：Web 模块构建有警告，继续...${NC}"
}

echo -e "${GREEN}✓ 构建完成${NC}"

# 启动基础设施服务（使用 Docker）
echo -e "${YELLOW}检查基础设施服务...${NC}"
cd "$SCRIPT_DIR"

# 检查 Docker 是否运行
if command -v docker &> /dev/null; then
    if docker ps &> /dev/null; then
        echo -e "${GREEN}✓ Docker 正在运行${NC}"
        
        # 检查是否已经运行了容器
        if ! docker ps | grep -q "helicone-postgres"; then
            echo -e "${YELLOW}启动基础设施容器（PostgreSQL, ClickHouse, MinIO, Redis）...${NC}"
            docker-compose -f docker/docker-compose.yml up -d db clickhouse minio redis
            echo -e "${GREEN}✓ 基础设施容器已启动${NC}"
            echo -e "${YELLOW}等待服务就绪...${NC}"
            sleep 10
        else
            echo -e "${GREEN}✓ 基础设施容器已在运行${NC}"
        fi
    else
        echo -e "${RED}错误：Docker 守护进程未运行${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ Docker 未安装，请确保基础设施服务已手动启动${NC}"
fi

# 启动三个模块
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}启动 Helicone 服务...${NC}"
echo -e "${GREEN}========================================${NC}"

# 设置工作目录
cd "$GOLANG_DIR"

# 启动 Web UI (端口 3000)
echo -e "${BLUE}启动 Web UI (端口 3000)...${NC}"
cd "$GOLANG_DIR/web"
PORT=3000 ./../bin/web &
WEB_PID=$!
echo -e "${GREEN}✓ Web UI 已启动 (PID: $WEB_PID)${NC}"

# 启动 Jawn API (端口 8585)
echo -e "${BLUE}启动 Jawn API (端口 8585)...${NC}"
cd "$GOLANG_DIR/api"
PORT=8585 ./../bin/api &
API_PID=$!
echo -e "${GREEN}✓ Jawn API 已启动 (PID: $API_PID)${NC}"

# 启动 Worker (端口 8787)
echo -e "${BLUE}启动 Worker (端口 8787)...${NC}"
cd "$GOLANG_DIR/worker"
PORT=8787 WORKER_TYPE=OPENAI_PROXY ./../bin/worker &
WORKER_PID=$!
echo -e "${GREEN}✓ Worker 已启动 (PID: $WORKER_PID)${NC}"

# 保存 PID 文件
echo "$WEB_PID" > "$GOLANG_DIR/bin/web.pid"
echo "$API_PID" > "$GOLANG_DIR/bin/api.pid"
echo "$WORKER_PID" > "$GOLANG_DIR/bin/worker.pid"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Helicone 服务已启动！${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "${BLUE}访问地址:${NC}"
echo -e "  Web UI:      ${GREEN}http://localhost:3000${NC}"
echo -e "  Jawn API:    ${GREEN}http://localhost:8585${NC}"
echo -e "  Worker:      ${GREEN}http://localhost:8787${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "${YELLOW}提示：按 Ctrl+C 停止所有服务${NC}"

# 等待用户中断
trap "kill $WEB_PID $API_PID $WORKER_PID 2>/dev/null; echo -e '${GREEN}服务已停止${NC}'; exit" INT TERM EXIT

wait
