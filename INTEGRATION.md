# SaleAgent 整合文档

本文档说明如何将 saleagent 整合到 aimarketing 项目中。

## 项目结构

```
aimarketing/
├── submodules/
│   └── saleagent/          # SaleAgent 子模块
│       ├── apps/
│       │   ├── agent/      # CrewAI 后端（FastAPI）
│       │   └── web/        # SaleAgent 前端（参考）
│       └── ...
├── app/
│   ├── api/
│   │   └── crewai/         # CrewAI API 代理路由
│   └── dashboard/
│       └── generate/       # 统一的生成页面
├── components/
│   ├── content-generator.tsx  # 图文生成组件
│   └── video-generator.tsx    # 视频生成组件（多智能体）
└── ...
```

## 功能整合

### 1. 图文生成
- 使用现有的 `ContentGenerator` 组件
- 支持基于知识库的内容生成

### 2. 视频生成（多智能体）
- 使用 `VideoGenerator` 组件
- 整合 CrewAI 多智能体协作
- 支持实时 SSE 流式通信
- 展示智能体工作过程
- 支持人机协同交互

### 3. API 路由
- `/api/crewai/agent` - 代理 CrewAI 智能体请求
- `/api/crewai/workflow` - 代理工作流操作
- `/api/crewai/jobs` - 代理任务管理

## 环境变量配置

### 前端环境变量（.env.local）

```bash
# CrewAI 后端地址
NEXT_PUBLIC_AGENT_URL=http://localhost:8000

# 站点 URL
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Supabase（可选）
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### 后端环境变量（submodules/saleagent/apps/agent/.env）

参考 `submodules/saleagent/README.md` 和 `submodules/saleagent/LOCAL_DEVELOPMENT.md`

主要配置项：
- `PROVIDER_IMAGE` - 图片生成提供商（qwen_runninghub | seedream | nanobanana）
- `PROVIDER_VIDEO` - 视频生成提供商（**sora2** | pixverse | runninghub | veo3.1 | hailuo）
  - **推荐使用 sora2**：`PROVIDER_VIDEO=sora2`
- `RUNNINGHUB_SORA2_WORKFLOW_ID` - Sora2 工作流 ID（使用 sora2 时必需）
- `RUNNINGHUB_API_KEY` - RunningHub API 密钥
- `OPENROUTER_API_KEY` - OpenRouter API 密钥（用于 LLM 调用）
- `SUPABASE_URL` - Supabase 地址
- `SUPABASE_SERVICE_ROLE_KEY` - **Supabase Service Role Key（必需，用于绕过 RLS 策略）**
  - ⚠️ **重要**：后端必须使用 `SUPABASE_SERVICE_ROLE_KEY`，不能使用 `SUPABASE_ANON_KEY`
  - `SUPABASE_ANON_KEY` 受 RLS 策略限制，会导致插入数据失败
- `R2_ACCOUNT_ID` - Cloudflare R2 配置
- 等等...

**重要**：要使用 Sora2 生成视频，必须设置：
```bash
PROVIDER_VIDEO=sora2
RUNNINGHUB_SORA2_WORKFLOW_ID=your_workflow_id
RUNNINGHUB_API_KEY=your_api_key
```

详细配置请参考 [SORA2_SETUP.md](./SORA2_SETUP.md)

## 启动步骤

### 1. 初始化子模块

```bash
git submodule update --init --recursive
```

### 2. 启动 CrewAI 后端

**方法一：使用启动脚本（推荐）**

Windows PowerShell:
```powershell
.\scripts\start-backend.ps1
```

Windows CMD:
```cmd
scripts\start-backend.bat
```

**方法二：手动启动**

```bash
# 切换到后端目录
cd submodules/saleagent/apps/agent

# 安装依赖（首次运行）
pip install -r requirements.txt

# 启动服务
python -m uvicorn main:app --reload --port 8000
```

**注意**：必须在 `submodules/saleagent/apps/agent` 目录下运行 uvicorn，否则会报 "Could not import module 'main'" 错误。

### 3. 启动前端

```bash
# 在项目根目录
pnpm install
pnpm dev
```

访问 http://localhost:3000/dashboard/generate

## 多智能体工作流

视频生成使用以下智能体协作：

1. **创意策划** - 优化提示词和策略
2. **导演** - 规划分镜脚本
3. **审核** - 审核分镜质量
4. **视觉设计** - 生成关键帧（可选）
5. **制片** - 提交视频生成任务
6. **剪辑** - 拼接最终视频

## 人机协同交互

在视频生成过程中，用户可以：
- 查看每个智能体的实时状态
- 在智能体工作时提供反馈
- 调整生成参数
- 干预工作流程

## 部署

### 前端部署（Vercel）

1. 设置环境变量
2. 确保 `AGENT_URL` 指向部署的后端地址

### 后端部署（Railway）

参考 `submodules/saleagent/DEPLOYMENT.md`

## 修改 SaleAgent 代码

由于 saleagent 是作为 submodule 导入的，可以直接修改其代码：

```bash
cd submodules/saleagent
# 进行修改
git add .
git commit -m "修改说明"
```

如果需要推送到原仓库，需要：
1. Fork saleagent 仓库
2. 修改 submodule 的 remote URL
3. 推送修改

## 注意事项

1. **API 代理**：前端通过 Next.js API 路由代理请求到 CrewAI 后端，避免 CORS 问题
2. **SSE 流式响应**：视频生成使用 Server-Sent Events 实时推送进度
3. **状态管理**：使用 React hooks 管理智能体状态和事件流
4. **UI 一致性**：视频生成组件使用与项目一致的 UI 组件库（shadcn/ui）

## 故障排查

### 后端连接失败
- 检查 `NEXT_PUBLIC_AGENT_URL` 是否正确
- 确认 CrewAI 后端已启动
- 查看浏览器控制台和网络请求

### SSE 流中断
- 检查网络连接
- 查看后端日志
- 确认后端支持 SSE

### 智能体状态不更新
- 检查事件解析逻辑
- 查看浏览器控制台错误
- 确认事件格式正确

