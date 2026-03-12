# Video Agent Integration

本仓库已经取消 `submodules/saleagent` 的内置方式。

当前集成模式是：

- `aimarketing` 负责前端页面、鉴权、代理路由
- video agent 服务独立部署和运行
- 本仓库通过 `AGENT_URL` / `NEXT_PUBLIC_AGENT_URL` 调用外部服务

## 集成边界

本仓库内保留的部分：

- [app/api/crewai](/d:/github/aimarketing/app/api/crewai)
- [components/video-chat.tsx](/d:/github/aimarketing/components/video-chat.tsx)
- [lib/saleagent-client.ts](/d:/github/aimarketing/lib/saleagent-client.ts)

外部服务负责的部分：

- `/crewai-agent`
- `/crewai-chat`
- `/workflow/*`
- 视频任务编排
- Sora2 / RunningHub / Supabase 等 provider 集成

## 环境变量

前端 / Node 代理：

```bash
AGENT_URL=http://localhost:8000
NEXT_PUBLIC_AGENT_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

外部 video agent 服务：

- `PROVIDER_VIDEO`
- `RUNNINGHUB_SORA2_WORKFLOW_ID`
- `RUNNINGHUB_API_KEY`
- `OPENROUTER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

这些变量应该配置在外部 video agent 服务自己的 `.env` 中，不再放在本仓库的 `submodules/saleagent/...` 路径下。

## 本地联调

1. 单独启动 video agent 服务
2. 确认它监听在例如 `http://localhost:8000`
3. 在本仓库配置：

```bash
AGENT_URL=http://localhost:8000
NEXT_PUBLIC_AGENT_URL=http://localhost:8000
```

4. 启动本仓库前端：

```bash
pnpm dev
```

## 部署

生产环境中：

- `aimarketing` 部署在 Vercel
- video agent 部署在独立服务平台
- Vercel 通过 `AGENT_URL` 访问外部 agent

## 不再支持的旧方式

以下旧流程已废弃：

- 在本仓库中执行 `git submodule update --init --recursive`
- 从 `submodules/saleagent/apps/agent` 目录启动后端
- 依赖本仓库携带 `saleagent` 代码进行视频能力开发
