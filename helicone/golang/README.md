# Helicone Go 版本

这是 Helicone 项目的 Go 语言重写版本，包含三个核心模块：

## 📁 目录结构

```
golang/
├── api/              # Jawn API (端口 8585)
│   ├── main.go       # API 入口
│   ├── handlers/     # 请求处理器
│   └── middleware/   # 中间件
├── worker/           # Worker LLM 代理 (端口 8787)
│   ├── main.go       # Worker 入口
│   └── proxy/        # 反向代理
├── web/              # Web UI (端口 3000)
│   ├── main.go       # Web 入口
│   ├── templates/    # HTML 模板
│   └── static/       # 静态文件
├── startall.sh       # 一键启动脚本
├── go.mod            # Go 模块定义
└── .env              # 环境变量配置
```

## 🚀 快速启动

### 1. 前置要求

- Go 1.21+
- Docker (用于运行基础设施服务)
- Docker Compose

### 2. 启动服务

```bash
# 一键启动所有服务
./golang/startall.sh
```

### 3. 访问地址

- **Web UI**: http://localhost:3000
- **Jawn API**: http://localhost:8585
- **Worker**: http://localhost:8787

## 📊 模块说明

### Web UI (端口 3000)

中文界面的 LLM 观测平台前端，包含：
- 仪表板：显示请求统计、Token 使用、成本分析
- 请求记录：查看所有 LLM API 请求详情
- 设置：API 密钥管理、数据存储配置

### Jawn API (端口 8585)

核心后端 API，提供：
- 聊天完成接口 (`/v1/chat/completions`)
- 模型列表 (`/v1/models`)
- Helicone 特定接口 (`/helicone/*`)
- API 密钥管理
- 请求记录和统计

### Worker (端口 8787)

LLM 代理层，支持：
- OpenAI 代理 (`OPENAI_PROXY`)
- Anthropic 代理 (`ANTHROPIC_PROXY`)
- 网关代理 (`GATEWAY_API`)
- 请求日志记录
- 多模型支持

## 🔧 配置

### 环境变量 (.env)

```bash
# 数据库
DATABASE_URL=postgresql://postgres:testpassword@localhost:54388/helicone_test
CLICKHOUSE_HOST=http://localhost:18123

# MinIO (对象存储)
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

# LLM 提供商
OPENAI_URL=https://api.openai.com
ANTHROPIC_URL=https://api.anthropic.com
```

## 🛠️ 开发

### 单独启动模块

```bash
# Web UI
cd golang/web && go run main.go

# Jawn API
cd golang/api && PORT=8585 go run main.go

# Worker
cd golang/worker && PORT=8787 WORKER_TYPE=OPENAI_PROXY go run main.go
```

### 构建

```bash
cd golang/api && go build -o ../bin/api main.go
cd golang/worker && go build -o ../bin/worker main.go
cd golang/web && go build -o ../bin/web main.go
```

## 📝 功能特性

- ✅ 中文界面
- ✅ 请求追踪和日志
- ✅ Token 使用统计
- ✅ 成本分析
- ✅ API 密钥管理
- ✅ 多 LLM 提供商支持
- ✅ 反向代理
- ✅ 数据持久化 (PostgreSQL + ClickHouse + MinIO)

## 🔄 与原版对比

| 功能 | 原版 (TypeScript) | Go 版本 |
|------|------------------|--------|
| Web UI | Next.js | Go + HTML 模板 |
| API 服务 | Node.js/Express | Go/Gin |
| Worker | Cloudflare Workers | Go 反向代理 |
| 语言 | TypeScript | Go |
| 界面语言 | 英文 | **中文** |

## 📄 许可证

MIT License
