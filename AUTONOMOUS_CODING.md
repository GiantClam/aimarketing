# 🤖 AI Marketing Platform - Autonomous Coding System

## ✅ 配置完成

| 配置项 | 状态 | 值 |
|--------|------|-----|
| **Kimi 2.5 Free** | ✅ 主模型 | `opencode/kimi-k2.5-free` |
| NVIDIA_API_KEY | ✅ 备用 | MiniMax M2.1 |
| GITHUB_TOKEN | ✅ 已配置 | Issues 集成 |
| GITHUB_REPO | ✅ 已配置 | GiantClam/aimarketing |

## 🧠 模型选择策略

### Kimi 2.5 Free (推荐 - 主模型)
```
使用场景：
├── Web 页面开发
├── agent-browser 测试
├── 识图验证 UI
├── 复杂任务规划
└── 需要工具调用的任务

优势：
✅ 免费使用
✅ 工具调用能力 (agent-browser)
✅ Vision/识图能力
✅ 复杂推理
✅ 可直接生成代码
```

### MiniMax M2.1 (辅助 - 代码生成)
```
使用场景：
├── 特定代码片段生成
├── 简单 API 实现
└── 代码优化/重构

优势：
✅ 编程能力强 (74% SWE-bench)
✅ 速度快
✅ 稳定
```

## 📊 当前进度

| 指标 | 数值 |
|------|------|
| 总任务 | 9 个 |
| 已完成 | 2 个 |
| GitHub Issues | 7 个待完成 |

## 🔗 GitHub Issues

查看任务: https://github.com/GiantClam/aimarketing/issues?q=label:auto-code

## 🚀 快速开始

```bash
cd /Users/beihuang/Documents/github/aimarketing

# 方式 1: 使用 Kimi 2.5 Free (推荐)
echo '{"prompt": "Create RBAC system with 6 roles..."}' | \
  /Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free

# 方式 2: 使用 MiniMax M2.1 (辅助)
export NVIDIA_API_KEY="nvapi-xxx"
python3 minimax_coder.py --task "xxx" "xxx" "xxx"

# 方式 3: GitHub Issues 管理
python3 github_coder.py list
python3 github_coder.py sync

# 方式 4: 本地任务管理
python3 task_manager.py list
python3 task_manager.py run-next
```

## 🧪 Web 测试流程 (Kimi 2.5)

```bash
# 1. Kimi 2.5 生成代码
echo '{"prompt": "Create login page UI..."}' | \
  opencode --model opencode/kimi-k2.5-free

# 2. 启动开发服务器
npm run dev

# 3. Kimi 2.5 调用 agent-browser 测试
# (Kimi 可直接使用 agent-browser 工具)
```

## 📁 核心文件

| 文件 | 说明 |
|------|------|
| `prd.json` | 任务定义 |
| `task_manager.py` | 本地任务管理 |
| `github_coder.py` | GitHub Issues 集成 |
| `minimax_coder.py` | MiniMax M2.1 API |
| `AUTONOMOUS_CODING.md` | 完整文档 |
| `.env.local` | 环境配置 |

## 🔧 环境变量

```bash
export NVIDIA_API_KEY="nvapi-xxx"      # MiniMax (备用)
export GITHUB_TOKEN="ghp_xxx"         # GitHub (可选)
export GITHUB_REPO="user/repo"         # GitHub (可选)
```

## 📋 任务状态

| ID | 任务 | 类型 | 状态 |
|----|------|------|------|
| STORY-001 | System Infrastructure Setup | 核心 | ✅ |
| STORY-002 | Content Generation Module | 核心 | ✅ |
| STORY-003 | Enterprise RBAC System | 核心 | ⏳ |
| STORY-004 | Lead Management Integration | Mock | ⏳ |
| STORY-005 | Website Generator Integration | Mock | ⏳ |
| STORY-006 | Enterprise Strategy Consultant | Mock | ⏳ |
| STORY-007 | Training Materials Integration | Mock | ⏳ |
| STORY-008 | Integration and Testing | 测试 | ⏳ |
| STORY-009 | Deployment and Launch | 部署 | ⏳ |
