# Video Generation Workflow

视频生成功能采用外部 agent 服务模式。

## 工作流

1. 用户在前端提交视频需求
2. 本仓库通过 [app/api/crewai](/d:/github/aimarketing/app/api/crewai) 代理请求
3. 外部 video agent 服务执行多智能体工作流
4. 结果通过 SSE 和轮询回传到前端

## 主要角色

- Creative Agent: 需求分析与创意策略
- Director Agent: 分镜规划
- Reviewer / Producer: 审核与任务提交
- Visual Agent: 可选关键帧
- Editor Agent: 最终拼接

## 依赖的外部能力

- Sora2 / RunningHub 等视频 provider
- Supabase
- OpenRouter

这些能力都应配置在外部 video agent 服务，而不是当前仓库中。

## 当前仓库中的相关入口

- [components/video-chat.tsx](/d:/github/aimarketing/components/video-chat.tsx)
- [app/api/crewai/chat/route.ts](/d:/github/aimarketing/app/api/crewai/chat/route.ts)
- [lib/saleagent-client.ts](/d:/github/aimarketing/lib/saleagent-client.ts)

## 配置

本仓库只需要：

```bash
AGENT_URL=http://localhost:8000
NEXT_PUBLIC_AGENT_URL=http://localhost:8000
```

## 说明

旧文档中提到的 `submodules/saleagent/apps/agent/.env` 路径已经失效，因为 `saleagent` 子模块已从本仓库移除。
