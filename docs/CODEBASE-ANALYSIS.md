# Claude Code Best (CCB) 代码库分析报告

> 分析日期：2026-04-08
> 版本：1.1.0 (v5)
> 分析范围：完整源码库

---

## 1. 项目概述

### 1.1 项目定位

**Claude Code Best (CCB)** 是 Anthropic 官方 [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI 工具的**反编译/逆向还原项目**。目标是复现 Claude Code 的核心功能和工程化能力。

### 1.2 核心特性

- **运行时**: Bun (>= 1.3.11)
- **开发语言**: TypeScript + React (Ink 终端 UI)
- **架构风格**: 模块化单体 (Modular Monolith)
- **主要功能**:
  - 交互式终端 AI 编程助手
  - 61+ 工具系统 (Bash, FileEdit, LSP, MCP 等)
  - 多模型支持 (Anthropic, OpenAI, Gemini, AWS Bedrock, Google Vertex, Azure)
  - Computer Use (计算机使用)
  - Voice Mode (语音输入)
  - Bridge Mode (远程控制)
  - Auto Mode (自动模式)
  - Buddy (协作模式)

### 1.3 版本状态

| 版本 | 状态 | 说明 |
|------|------|------|
| V4 | ✅ 完成 | 测试补全、Buddy、Auto Mode、环境变量 Feature 开关 |
| V5 | ✅ 完成 | Sentry/GrowthBook 监控、自定义 Login、OpenAI 兼容、Web Search、Computer Use、Voice Mode、Bridge Mode |
| V6 | 🔮 计划 | 大规模重构，全面模块分包（全新分支，main 封存为历史版本） |

---

## 2. 技术栈

### 2.1 核心依赖

```json
{
  "runtime": "Bun >= 1.3.11",
  "language": "TypeScript 6.0.2",
  "ui": "React 19.2.4 + Ink (内部 fork)",
  "build": "Bun.build (原生打包)",
  "lint": "Biome 2.4.10",
  "test": "bun:test",
  "schema": "Zod 4.3.6"
}
```

### 2.2 关键第三方库

| 类别 | 库 | 用途 |
|------|-----|------|
| API SDK | `@anthropic-ai/sdk` | Anthropic API 客户端 |
| API SDK | `@anthropic-ai/bedrock-sdk` | AWS Bedrock |
| API SDK | `@anthropic-ai/vertex-sdk` | Google Vertex |
| MCP | `@modelcontextprotocol/sdk` | Model Context Protocol |
| 状态管理 | Zustand 模式 (自研) | `src/state/store.ts` |
| 日志 | `@opentelemetry/*` | OpenTelemetry 监控 |
| 错误上报 | `@sentry/node` | 错误追踪 |
| 实验平台 | `@growthbook/growthbook` | A/B 测试 |
| 包管理 | `bun` | 包管理器 + 运行时 |

### 2.3 Native 模块

项目包含多个 NAPI 原生模块（`packages/@ant/`）：

- `audio-capture-napi` - 音频录制 (Voice Mode)
- `image-processor-napi` - 图像处理
- `color-diff-napi` - 颜色差异计算
- `url-handler-napi` - URL 处理
- `modifiers-napi` - 键盘修饰符模拟

---

## 3. 目录结构

```
claude-code-true/
├── src/                          # 核心源码 (42 个子目录)
│   ├── entrypoints/              # 入口点
│   │   ├── cli.tsx               # 主入口 (快速路径)
│   │   ├── init.ts               # 初始化入口
│   │   └── agentSdkTypes.ts      # Agent SDK 类型
│   ├── main.tsx                  # 主 CLI (~23500 行)
│   ├── query.ts                  # 核心查询循环 (~69400 行)
│   ├── QueryEngine.ts            # 查询引擎
│   ├── Tool.ts                   # Tool 接口定义
│   ├── tools.ts                  # Tool 注册表
│   ├── tools/                    # 61+ Tool 实现
│   │   ├── AgentTool/
│   │   ├── BashTool/
│   │   ├── FileEditTool/
│   │   ├── FileReadTool/
│   │   ├── GrepTool/
│   │   ├── LSPTool/
│   │   ├── MCPTool/
│   │   └── ...
│   ├── components/               # 170+ React 组件
│   │   ├── App.tsx               # Root 组件
│   │   ├── Messages.tsx          # 消息渲染
│   │   ├── design-system/        # UI 组件库
│   │   └── permissions/          # 权限弹窗
│   ├── state/                    # 状态管理
│   │   ├── AppState.tsx          # AppState Provider
│   │   ├── AppStateStore.ts      # Zustand Store
│   │   ├── store.ts              # Store 工厂
│   │   └── selectors.ts          # 状态选择器
│   ├── services/                 # 服务层
│   │   ├── api/                  # API 层
│   │   │   ├── claude.ts         # Anthropic API 客户端
│   │   │   └── openai/           # OpenAI 兼容层
│   │   ├── mcp/                  # MCP 服务
│   │   └── ...
│   ├── utils/                    # 工具函数 (347 个目录)
│   ├── hooks/                    # React Hooks (88 个)
│   ├── context/                  # 上下文构建
│   ├── types/                    # 类型定义
│   ├── screens/                  # 终端屏幕
│   ├── bridge/                   # Bridge 模式 (~35 文件)
│   ├── daemon/                   # Daemon 模式
│   ├── voice/                    # Voice Mode
│   └── ...
├── packages/                     # 工作空间包
│   ├── @ant/                     # 内部包
│   │   ├── computer-use-mcp/     # Computer Use MCP
│   │   ├── computer-use-input/   # 键鼠模拟
│   │   ├── computer-use-swift/   # 截图 + 应用管理
│   │   └── claude-for-chrome-mcp/# Chrome 控制
│   └── @anthropic/ink/           # Ink 框架 fork
├── docs/                         # 文档
│   ├── features/                 # 功能文档 (33 个)
│   ├── test-plans/               # 测试计划 (25 个)
│   ├── context/                  # 上下文工程
│   └── ...
├── scripts/                      # 构建脚本
│   ├── build.ts                  # 构建配置
│   ├── dev.ts                    # 开发模式
│   └── defines.ts                # MACRO 定义
├── tests/                        # 测试
│   └── integration/              # 集成测试
├── vendor/                       # 第三方资源
│   └── audio-capture/            # 音频原生模块
├── build.ts                      # 构建脚本
├── package.json                  # 项目配置
├── tsconfig.json                 # TypeScript 配置
├── biome.json                    # Biome 配置
├── CLAUDE.md                     # 项目说明
└── README.md                     # 项目介绍
```

---

## 4. 核心架构

### 4.1 启动流程

```
┌─────────────────────────────────────────────────────────┐
│  1. cli.tsx (快速路径)                                  │
│     - --version / -v (零模块加载)                       │
│     - --dump-system-prompt                              │
│     - --claude-in-chrome-mcp                            │
│     - remote-control / bridge / daemon                  │
│     - ps / logs / attach / kill / --bg                  │
│     - --tmux + --worktree                               │
└─────────────────────┬───────────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────────┐
│  2. init.ts (初始化)                                    │
│     - Telemetry 配置                                     │
│     - 用户配置加载                                       │
│     - Trust dialog                                       │
└─────────────────────┬───────────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────────┐
│  3. main.tsx (主 CLI ~23500 行)                           │
│     - Commander.js CLI 定义                             │
│     - 注册子命令 (mcp, server, ssh, open, auth...)      │
│     - 主 .action() 处理器                               │
│       - 权限检查                                         │
│       - MCP 连接                                         │
│       - 会话恢复                                         │
│       - REPL/Headless 模式分发                          │
└─────────────────────┬───────────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────────┐
│  4. QueryEngine.ts / query.ts                           │
│     - 核心对话循环                                       │
│     - API 调用 + 流式响应                                │
│     - Tool 调用处理                                      │
│     - 上下文管理                                         │
└─────────────────────┬───────────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────────┐
│  5. REPL.tsx (React Ink 终端 UI)                         │
│     - 用户输入                                           │
│     - 消息渲染                                           │
│     - Tool 权限确认                                      │
│     - 键盘快捷键                                         │
└─────────────────────────────────────────────────────────┘
```

### 4.2 核心循环 (Query Loop)

```typescript
// 简化版流程
async function queryLoop() {
  while (sessionActive) {
    // 1. 构建请求
    const messages = buildMessages(conversationHistory)
    const tools = getAvailableTools()
    const systemPrompt = buildSystemPrompt()

    // 2. 调用 API
    const stream = await apiClient.messages.stream({
      model,
      messages,
      tools,
      system: systemPrompt,
    })

    // 3. 处理流式响应
    for await (const event of stream) {
      if (event.type === 'content_block_start') {
        // 显示思考过程
      } else if (event.type === 'content_block_delta') {
        // 流式输出文本
      } else if (event.type === 'content_block_stop') {
        // 完成一个内容块
      }
    }

    // 4. 检查 Tool 调用
    if (assistantMessage.toolUses) {
      for (const toolUse of assistantMessage.toolUses) {
        const result = await executeTool(toolUse)
        await sendMessageToAPI({
          role: 'user',
          content: [{ type: 'tool_result', ...result }],
        })
      }
    }

    // 5. 继续下一轮对话
  }
}
```

### 4.3 Tool 系统

#### 4.3.1 Tool 接口定义

```typescript
// src/Tool.ts
export type Tool = {
  name: string
  description: string
  inputSchema: ToolInputJSONSchema
  call: (
    args: ToolCallArgs,
    context: ToolCallContext,
  ) => Promise<ToolResult>
  // 可选的 React 渲染组件
  jsx?: React.ReactNode
}
```

#### 4.3.2 Tool 分类

| 类别 | Tool | 说明 |
|------|------|------|
| **代码执行** | BashTool, PowerShellTool | 命令行执行 |
| **文件操作** | FileReadTool, FileWriteTool, FileEditTool | 文件读写编辑 |
| **代码搜索** | GrepTool, GlobTool, LSPTool | 代码搜索 |
| **AI 协作** | AgentTool, AskUserQuestionTool | 多 Agent 协作 |
| **MCP** | MCPTool, ListMcpResourcesTool, ReadMcpResourceTool | Model Context Protocol |
| **规划** | EnterPlanModeTool, ExitPlanModeTool | 规划模式 |
| **工作区** | EnterWorktreeTool, ExitWorktreeTool | Git worktree |
| **Web** | WebFetchTool, WebSearchTool | 网页获取/搜索 |
| **计算机使用** | ComputerUseTool | 屏幕操控 (CHICAGO_MCP) |

#### 4.3.3 Tool 权限系统

```typescript
// 权限模式
type PermissionMode =
  | 'default'      // 默认模式
  | 'auto'         // 自动模式 (自动允许)
  | 'bypass'       // 绕过模式 (完全权限)
  | 'ask'          // 询问模式 (全部确认)

// 权限规则
type PermissionRules = {
  alwaysAllow: string[]  // 总是允许
  alwaysDeny: string[]   // 总是拒绝
  alwaysAsk: string[]    // 总是询问
}
```

### 4.4 API 层

#### 4.4.1 多 Provider 支持

```typescript
// src/utils/model/providers.ts
type APIProvider =
  | 'anthropic'      // Anthropic 官方
  | 'openai'         // OpenAI 兼容层 (最高优先级)
  | 'bedrock'        // AWS Bedrock
  | 'vertex'         // Google Vertex
  | 'azure'          // Azure
  | 'gemini'         // Google Gemini

function getAPIProvider(): APIProvider {
  if (process.env.CLAUDE_CODE_USE_OPENAI) return 'openai'
  if (process.env.CLAUDE_CODE_USE_GEMINI) return 'gemini'
  if (process.env.ANTHROPIC_BEDROCK_ACCESS_KEY) return 'bedrock'
  // ...
}
```

#### 4.4.2 OpenAI 兼容层

```typescript
// src/services/api/openai/
// 流适配器模式：将 Anthropic 格式请求转为 OpenAI 格式，
// 再将 SSE 流转换回 BetaRawMessageStreamEvent，下游代码完全不改

// 关键环境变量:
// - CLAUDE_CODE_USE_OPENAI=1
// - OPENAI_API_KEY
// - OPENAI_BASE_URL
// - OPENAI_MODEL
// - OPENAI_DEFAULT_OPUS_MODEL
// - OPENAI_DEFAULT_SONNET_MODEL
// - OPENAI_DEFAULT_HAIKU_MODEL
```

### 4.5 状态管理

#### 4.5.1 自研 Zustand 模式 Store

```typescript
// src/state/store.ts
export function createStore<T>(initialState: T): Store<T> {
  let state = initialState
  const subscribers = new Set<() => void>()

  return {
    getState: () => state,
    setState: (updater: (prev: T) => T) => {
      state = updater(state)
      subscribers.forEach(fn => fn())
    },
    subscribe: (fn: () => void) => {
      subscribers.add(fn)
      return () => subscribers.delete(fn)
    },
  }
}

// 使用示例
const count = useAppState(state => state.count)
```

#### 4.5.2 AppState

```typescript
// src/state/AppStateStore.ts
type AppState = {
  messages: Message[]
  tools: Tool[]
  permissions: PermissionResult[]
  mcpConnections: MCPServerConnection[]
  tokenCounts: TokenCounts
  modelOverrides: ModelOverrides
  // ...
}
```

### 4.6 上下文工程

```typescript
// src/context.ts
// 构建系统/用户上下文 (API 调用前)

async function buildContext() {
  return {
    // Git 状态
    gitStatus: await getGitStatus(),

    // 日期时间
    currentDate: getLocalISODate(),

    // CLAUDE.md 文件内容
    claudeMdContents: await getClaudeMds(),

    // 记忆文件
    memoryFiles: await getMemoryFiles(),

    // 用户自定义上下文
    userContext: await getUserContext(),
  }
}
```

---

## 5. 功能特性

### 5.1 Feature Flag 系统

项目使用统一的 Feature Flag 机制控制功能开关：

```typescript
// 导入
import { feature } from 'bun:bundle'

// 使用
if (feature('VOICE_MODE')) {
  // Voice Mode 代码
}
```

#### 启用方式

- **环境变量**: `FEATURE_<FLAG_NAME>=1`
- **Dev 默认**: `BUDDY`, `TRANSCRIPT_CLASSIFIER`, `BRIDGE_MODE`, `AGENT_TRIGGERS_REMOTE`, `CHICAGO_MCP`, `VOICE_MODE`
- **Build 默认**: `AGENT_TRIGGERS_REMOTE`, `CHICAGO_MCP`, `VOICE_MODE`

#### 常见 Flag

| Flag | 说明 |
|------|------|
| `BUDDY` | 协作模式 |
| `DAEMON` | Daemon 模式 (长驻 supervisor) |
| `BRIDGE_MODE` | 远程控制 / Bridge 模式 |
| `BG_SESSIONS` | 后台会话管理 |
| `PROACTIVE` | 主动提示 |
| `KAIROS` | KAIROS 功能 |
| `VOICE_MODE` | 语音输入 |
| `FORK_SUBAGENT` | Fork 子 Agent |
| `CHICAGO_MCP` | Computer Use MCP |
| `AGENT_TRIGGERS` | Agent 触发器 |
| `ULTRATHINK` | 深度思考模式 |
| `TOKEN_BUDGET` | Token 预算 |

### 5.2 Computer Use (计算机使用)

**Feature Flag**: `CHICAGO_MCP`

实现跨平台屏幕操控（macOS + Windows 可用，Linux 待完成）：

```
packages/@ant/
├── computer-use-mcp/       # MCP server，注册截图/键鼠/剪贴板/应用管理工具
├── computer-use-input/     # 键鼠模拟，dispatcher + per-platform backend
│   ├── backends/darwin.ts
│   ├── backends/win32.ts
│   └── backends/linux.ts
└── computer-use-swift/     # 截图 + 应用管理
```

### 5.3 Voice Mode (语音模式)

**Feature Flag**: `VOICE_MODE`

Push-to-Talk 语音输入，音频通过 WebSocket 流式传输到 Anthropic STT (Nova 3)。需要 Anthropic OAuth (非 API key)。

```
src/
├── voice/
│   ├── voiceModeEnabled.ts  # 三层门控 (feature flag + GrowthBook + OAuth)
│   └── ...
└── hooks/useVoice.ts        # React hook 管理录音状态和 WebSocket 连接
```

### 5.4 Bridge Mode (远程控制)

**Feature Flag**: `BRIDGE_MODE`

远程控制 / Bridge 模式，包含：

- Bridge API
- 会话管理
- JWT 认证
- 消息传输
- 权限回调

Entry: `src/bridge/bridgeMain.ts`

### 5.5 Auto Mode (自动模式)

自动执行任务，无需用户确认每个步骤。

### 5.6 Buddy (协作模式)

**Feature Flag**: `BUDDY`

协作模式，支持多用户协作。

---

## 6. 测试体系

### 6.1 测试规范

详见 `docs/testing-spec.md`

| 指标 | 数值 |
|------|------|
| 总测试数 | 1623 |
| 测试文件数 | 84 |
| 失败数 | 0 |
| 断言数 | 2516 |
| 运行耗时 | ~851ms |

### 6.2 测试等级分布

| 等级 | 文件数 | 占比 |
|------|--------|------|
| **GOOD** | 46 | 55% |
| **ACCEPTABLE** | 32 | 38% |
| **WEAK** | 6 | 7% |

### 6.3 测试命令

```bash
bun test                              # 运行所有测试
bun test src/utils/__tests__/hash.test.ts   # 运行单文件
bun test --coverage                   # 覆盖率报告
```

---

## 7. 构建系统

### 7.1 构建流程

```typescript
// build.ts
const result = await Bun.build({
  entrypoints: ['src/entrypoints/cli.tsx'],
  outdir: 'dist',
  target: 'bun',
  splitting: true,              // 代码分割
  define: getMacroDefines(),    // MACRO 定义
  features: DEFAULT_BUILD_FEATURES,
})
```

### 7.2 产物结构

```
dist/
├── cli.js                      # 入口文件
├── chunk-*.js                  # ~450 个 chunk 文件
└── vendor/
    └── audio-capture/          # 原生模块资源
```

### 7.3 Node.js 兼容性

构建后自动替换 `import.meta.require` 为 Node.js 兼容版本：

```typescript
// 替换前
var __require = import.meta.require;

// 替换后
var __require = typeof import.meta.require === "function"
  ? import.meta.require
  : (await import("module")).createRequire(import.meta.url);
```

### 7.4 构建命令

```bash
bun run build           # 构建
bun run dev             # 开发模式
bun run dev:inspect     # 开发模式 + 调试器
```

---

## 8. 关键文件详解

### 8.1 入口文件

| 文件 | 行数 | 说明 |
|------|------|------|
| `src/entrypoints/cli.tsx` | ~200 | 快速路径入口 (零模块加载) |
| `src/main.tsx` | ~23500 | 主 CLI 定义 |
| `src/query.ts` | ~69400 | 核心查询循环 |

### 8.2 核心模块

| 文件 | 说明 |
|------|------|
| `src/Tool.ts` | Tool 接口定义 |
| `src/tools.ts` | Tool 注册表 |
| `src/QueryEngine.ts` | 查询引擎 |
| `src/context.ts` | 上下文构建 |
| `src/state/AppState.tsx` | AppState Provider |
| `src/services/api/claude.ts` | Anthropic API 客户端 |

### 8.3 工具目录

| 目录 | 说明 |
|------|------|
| `src/tools/BashTool/` | Bash 命令执行 |
| `src/tools/FileEditTool/` | 文件编辑 |
| `src/tools/LSPTool/` | LSP 语言服务器协议 |
| `src/tools/MCPTool/` | MCP 协议 |
| `src/tools/AgentTool/` | Agent 协作 |

---

## 9. 代码质量评估

### 9.1 优势

1. **工程化完善**:
   - 完整的测试体系 (1623 tests)
   - CI/CD 集成 (GitHub Actions)
   - 代码格式化 (Biome)
   - TypeScript 类型系统

2. **架构清晰**:
   - 模块化设计
   - 职责分离明确
   - 依赖注入模式

3. **功能丰富**:
   - 61+ 工具系统
   - 多 Provider 支持
   - Feature Flag 机制
   - 跨平台支持

4. **性能优化**:
   - Bun 运行时
   - 代码分割
   - 流式处理
   - 缓存策略

### 9.2 挑战

1. **代码规模**:
   - `main.tsx` ~23500 行
   - `query.ts` ~69400 行
   - 单体文件过大

2. **TypeScript 错误**:
   - ~1341 tsc 错误 (反编译遗留)
   - 主要是 `unknown`/`never`/`{}` 类型
   - 不影响 Bun 运行时

3. **反编译代码**:
   - React Compiler 输出需要手动维护
   - 部分模块是 stub 实现

4. **测试覆盖**:
   - 整体覆盖率 ~33% (Bun 限制)
   - 核心模块难以测试

### 9.3 技术债务

1. **V6 重构**: 计划大规模重构，全面模块分包
2. **UI 组件测试**: 需 Ink 渲染测试环境
3. **集成测试**: 部分集成测试空白
4. **Mock 可靠性**: 部分测试依赖 mock 模式

---

## 10. 开发指南

### 10.1 环境设置

```bash
# 安装 Bun
curl -fsSL https://bun.sh/install | bash

# 克隆仓库
git clone https://github.com/claude-code-best/claude-code.git
cd claude-code

# 安装依赖
bun install

# 运行开发模式
bun run dev
```

### 10.2 开发流程

```bash
# 开发模式 (热重载)
bun run dev

# 调试模式
bun run dev:inspect

# 运行测试
bun test

# 代码格式化
bun run format

# 代码检查
bun run lint

# 构建
bun run build
```

### 10.3 Feature Flag 使用

```typescript
// 启用新功能
import { feature } from 'bun:bundle'

function myNewFeature() {
  if (feature('MY_NEW_FEATURE')) {
    // 新功能代码
  }
}
```

运行时启用：
```bash
FEATURE_MY_NEW_FEATURE=1 bun run dev
```

### 10.4 添加 Tool

1. 创建目录 `src/tools/MyTool/`
2. 实现 Tool 接口
3. 注册到 `src/tools.ts`
4. 编写单元测试

---

## 11. 部署与发布

### 11.1 构建发布

```bash
# 构建
bun run build

# 本地测试
node dist/cli.js

# 发布到 NPM
npm publish
```

### 11.2 安装使用

```bash
# 全局安装
bun install -g claude-code-best

# 信任包
bun pm trust claude-code-best

# 运行
ccb
```

---

## 12. 文档资源

### 12.1 核心文档

- `CLAUDE.md` - 项目概述和架构
- `README.md` - 快速开始
- `docs/testing-spec.md` - 测试规范
- `docs/features/` - 功能特性文档 (33 个)

### 12.2 功能文档

| 文档 | 说明 |
|------|------|
| `docs/features/computer-use.md` | Computer Use 架构 |
| `docs/features/voice-mode.md` | Voice Mode |
| `docs/features/bridge-mode.md` | Bridge Mode |
| `docs/features/auto-dream.md` | Auto Dream |
| `docs/plans/openai-compatibility.md` | OpenAI 兼容层 |

### 12.3 测试计划

| 文档 | 说明 |
|------|------|
| `docs/test-plans/01-tool-system.md` | Tool 系统测试 |
| `docs/test-plans/02-utils-pure-functions.md` | 纯函数测试 |
| `docs/test-plans/03-context-building.md` | 上下文构建测试 |

---

## 13. 总结

### 13.1 项目亮点

1. **反编译还原**: 成功还原 Anthropic 官方 Claude Code 源码
2. **功能完整**: 复现核心功能，包括 Computer Use、Voice Mode 等
3. **多 Provider**: 支持 Anthropic、OpenAI、Gemini、AWS Bedrock 等
4. **工程化完善**: 测试、CI/CD、类型检查齐全
5. **社区活跃**: 大量贡献者，持续维护

### 13.2 适用场景

- 学习 Claude Code 架构
- 定制化工具开发
- 多模型支持需求
- 终端 AI 编程助手
- 研究反编译技术

### 13.3 未来展望

- V6 大规模重构
- 模块分包优化
- 测试覆盖率提升
- 更多平台支持
- 性能进一步优化

---

## 附录

### A. 常用命令速查

```bash
# 开发
bun run dev                    # 开发模式
bun run dev:inspect            # 调试模式
bun run build                  # 构建

# 测试
bun test                       # 运行所有测试
bun test --coverage            # 覆盖率报告

# 代码质量
bun run lint                   # 代码检查
bun run lint:fix               # 自动修复
bun run format                 # 格式化

# 其他
bun run health                 # 健康检查
bun run check:unused           # 检查未使用代码
bun run docs:dev               # 文档开发服务器
```

### B. 环境变量速查

```bash
# Feature Flags
FEATURE_BUDDY=1
FEATURE_VOICE_MODE=1
FEATURE_BRIDGE_MODE=1

# API Provider
CLAUDE_CODE_USE_OPENAI=1
CLAUDE_CODE_USE_GEMINI=1

# 模型配置
OPENAI_API_KEY=sk-xxx
OPENAI_BASE_URL=https://api.example.com/v1
OPENAI_MODEL=claude-sonnet-4-6

# 调试
DEBUG=1
```

### C. 文件统计

| 指标 | 数值 |
|------|------|
| 源码目录 | 42 |
| Tool 目录 | 61+ |
| React 组件 | 170+ |
| Hooks | 88 |
| 测试文件 | 84 |
| 测试用例 | 1623 |
| 文档文件 | 100+ |

---

**分析完成** - 这份文档涵盖了代码库的主要方面，包括架构、功能、测试、构建和开发指南。
