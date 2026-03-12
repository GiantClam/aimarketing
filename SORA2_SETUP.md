# Sora2 Setup

Sora2 配置现在应放在外部 video agent 服务中，而不是本仓库。

## 外部服务所需变量

```bash
PROVIDER_VIDEO=sora2
RUNNINGHUB_SORA2_WORKFLOW_ID=your_workflow_id
RUNNINGHUB_API_KEY=your_api_key
```

## 本仓库所需变量

```bash
AGENT_URL=http://localhost:8000
NEXT_PUBLIC_AGENT_URL=http://localhost:8000
```

## 说明

本仓库只负责把请求转发给外部 video agent。

旧路径：

- `submodules/saleagent/apps/agent/.env`

已经不再适用，因为 `saleagent` 子模块已移除。
