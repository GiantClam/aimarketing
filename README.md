# AI Marketing Platform

AI Marketing 是一个以 Next.js 为核心的企业级 AI 营销工作台，当前主能力包括：

- 多平台图文写作
- 专家顾问对话
- 视频生成前端工作台

## 技术栈

- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
- Backend in this repo: Next.js Route Handlers / Node.js
- Database: PostgreSQL / Neon
- Writer models: OpenRouter + Gemini image generation
- Video agent: external service via `AGENT_URL`

## 当前架构

本仓库不再内置 `saleagent` Git submodule。

视频生成能力仍然保留，但采用外部服务模式：

- 前端和代理接口在本仓库中
- 真正的视频 agent 服务单独部署
- 本仓库通过 `AGENT_URL` 或 `NEXT_PUBLIC_AGENT_URL` 访问该服务

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 配置环境变量

在项目根目录配置 `.env` 或 `.env.local`。

关键变量：

```bash
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# 外部视频 agent 服务
AGENT_URL=http://localhost:8000
NEXT_PUBLIC_AGENT_URL=http://localhost:8000

# writer
OPENROUTER_API_KEY=...
JINA_API_KEY=...
GOOGLE_SEARCH_API_KEY=...
GOOGLE_SEARCH_ENGINE_ID=...
GOOGLE_AI_API_KEY=...
```

### 3. 启动前端

```bash
pnpm dev
```

访问 `http://localhost:3000`。

## 本地视频开发

如果你需要本地调试视频生成功能，请单独准备 video agent 服务，而不是依赖本仓库子模块。

推荐方式：

1. 单独克隆并运行 `saleagent` 仓库
2. 在本仓库中把 `AGENT_URL` / `NEXT_PUBLIC_AGENT_URL` 指向那个服务

## 项目结构

```text
aimarketing/
├─ app/
│  ├─ api/
│  │  ├─ crewai/         # 视频 agent 代理接口
│  │  └─ writer/         # 写作工作台后端
│  └─ dashboard/
├─ components/
├─ lib/
│  ├─ saleagent-client.ts
│  └─ writer/
├─ scripts/
└─ submodules/
   └─ webgenagent/
```

## 文档

- [INTEGRATION.md](/d:/github/aimarketing/INTEGRATION.md)
- [VIDEO_GENERATION_WORKFLOW.md](/d:/github/aimarketing/VIDEO_GENERATION_WORKFLOW.md)
- [SORA2_SETUP.md](/d:/github/aimarketing/SORA2_SETUP.md)
- [SUPABASE_RLS_FIX.md](/d:/github/aimarketing/SUPABASE_RLS_FIX.md)
