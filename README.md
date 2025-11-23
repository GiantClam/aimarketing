# AI Marketing Platform

AI 驱动的营销内容生成平台，支持图文和视频生成，集成多智能体协作。

## 功能特性

### 📝 图文生成
- AI 驱动的营销文案生成
- 支持多平台内容（小红书、知乎、微信公众号等）
- 基于知识库的个性化内容
- 模板管理和历史记录

### 🎬 视频生成（多智能体协作）
- **CrewAI 多智能体系统**：6 个专业智能体协作
  - 创意策划：优化提示词和策略
  - 导演：规划分镜脚本
  - 审核：审核分镜质量
  - 视觉设计：生成关键帧
  - 制片：提交视频生成任务
  - 剪辑：拼接最终视频
- **实时进度展示**：SSE 流式通信，实时查看智能体工作过程
- **人机协同交互**：在生成过程中提供反馈和调整
- **Sora2 视频生成**：集成 Sora2 等视频生成服务

### 🤖 多智能体可视化
- 实时展示每个智能体的工作状态
- 智能体对话流展示
- 工作流进度追踪

## 技术栈

- **前端**：Next.js 15, React 19, TypeScript, Tailwind CSS, shadcn/ui
- **后端**：FastAPI, CrewAI, Python
- **数据库**：Supabase (PostgreSQL)
- **存储**：Cloudflare R2
- **视频生成**：Sora2, RunningHub 等
- **AI 模型**：OpenRouter (统一管理)

## 快速开始

### 前置要求

- Node.js 18+
- Python 3.10+
- pnpm (推荐) 或 npm

### 安装步骤

1. **克隆仓库并初始化子模块**

```bash
git clone <repository-url>
cd aimarketing
git submodule update --init --recursive
```

2. **安装前端依赖**

```bash
pnpm install
```

3. **配置环境变量**

复制 `.env.example` 为 `.env.local`：

```bash
cp .env.example .env.local
```

编辑 `.env.local`，设置：
- `NEXT_PUBLIC_AGENT_URL` - CrewAI 后端地址
- `NEXT_PUBLIC_SITE_URL` - 前端地址
- Supabase 配置（可选）

4. **启动 CrewAI 后端**

```bash
cd submodules/saleagent/apps/agent
pip install -r requirements.txt
# 配置 .env 文件（参考 submodules/saleagent/README.md）
uvicorn main:app --reload --port 8000
```

5. **启动前端**

```bash
# 在项目根目录
pnpm dev
```

访问 http://localhost:3000

## 项目结构

```
aimarketing/
├── app/
│   ├── api/
│   │   └── crewai/         # CrewAI API 代理
│   ├── dashboard/
│   │   └── generate/       # 统一生成页面
│   └── ...
├── components/
│   ├── content-generator.tsx  # 图文生成
│   └── video-generator.tsx    # 视频生成（多智能体）
├── submodules/
│   └── saleagent/          # SaleAgent 子模块
│       └── apps/
│           └── agent/       # CrewAI 后端
└── ...
```

## 使用指南

### 图文生成

1. 进入「内容生成」页面
2. 选择「图文生成」标签
3. 输入需求描述
4. 点击「生成内容」

### 视频生成

1. 进入「内容生成」页面
2. 选择「视频生成」标签
3. 输入营销视频需求
4. 点击「开始生成」
5. 实时查看多智能体协作过程
6. 可在智能体工作时提供反馈（人机协同）

### 查看智能体工作流

1. 在视频生成页面，切换到「智能体协作」标签
2. 查看每个智能体的详细状态和工作内容

## 部署

### 前端部署（Vercel）

1. 连接 GitHub 仓库到 Vercel
2. 设置环境变量
3. 部署

### 后端部署（Railway）

参考 `submodules/saleagent/DEPLOYMENT.md`

## 文档

- [整合文档](./INTEGRATION.md) - SaleAgent 整合说明
- [SaleAgent README](./submodules/saleagent/README.md) - SaleAgent 详细文档
- [本地开发](./submodules/saleagent/LOCAL_DEVELOPMENT.md) - 本地开发指南
- [部署指南](./submodules/saleagent/DEPLOYMENT.md) - 部署说明

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT