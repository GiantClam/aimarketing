# 🤖 AI Marketing Platform - Autonomous Coding System

全自动编码系统，基于 **Aider CLI + Orchestrator + MiniMax M2.1**

## 🏗️ 架构

```
Orchestrator (Python)     Aider CLI (Node.js)       MiniMax M2.1
     │                           │                        │
     ├── 任务调度 ──────────────→│                        │
     │                           ├── 代码生成 ───────────→│
     │                           │                        │
     │                           ←── 返回代码 ────────────┤
     │←── 完成 ──────────────────┤                        │
     │                           │                        │
     ├── 质量检查 ─────────────────────────────────────────┤
```

**分层职责：**
- **Orchestrator**: 任务调度、错误恢复、质量检查
- **Aider**: 代码生成、编辑、测试、Git 提交
- **MiniMax M2.1**: AI 模型（编程能力 74% SWE-bench）

## 📋 快速开始

### 1. 安装依赖

```bash
# 安装 Aider
pip3 install aider-chat

# 验证安装
aider --version
```

### 2. 配置环境

```bash
# 编辑 .env.local
cat > .env.local << 'ENV'
NVIDIA_API_KEY=nvapi-xxx
ENV

# 加载配置
export $(cat .env.local | xargs)
```

### 3. 运行系统

#### 方式 A: Orchestrator 自动化（推荐）
```bash
# 单次运行
python3 orchestrator.py

# 守护进程（7x24 自动运行）
python3 orchestrator.py --daemon 60
```

#### 方式 B: 直接使用 Aider
```bash
# 手动触发单个任务
aider --model openai/minimaxai/minimax-m2.1 \
      --message "Create RBAC system with 6 roles"
```

## 📊 当前状态

| 指标 | 数值 |
|------|------|
| 总任务 | 9 个 |
| 已完成 | 2 个 (22%) |
| 进行中 | 7 个 |

**已完成功能：**
- ✅ STORY-001: 认证系统 (JWT)
- ✅ STORY-002: 内容生成

**待完成任务：**
- ⏳ STORY-003: RBAC 权限系统
- ⏳ STORY-004: 线索管理
- ⏳ STORY-005: 网站生成器
- ⏳ STORY-006: 战略顾问
- ⏳ STORY-007: 培训材料
- ⏳ STORY-008: 集成测试
- ⏳ STORY-009: 部署上线

## 📁 核心文件

| 文件 | 说明 | 用途 |
|------|------|------|
| `orchestrator.py` | 自动化编排器 | 任务调度、错误恢复 |
| `quality_check.sh` | 质量检查 | typecheck + lint + test |
| `prd.json` | 任务清单 | 9 个用户故事 |
| `ARCHITECTURE.md` | 架构文档 | 系统设计说明 |

## 🔄 工作流程

```
1. Orchestrator 读取 prd.json
2. 获取下一个待办任务
3. 构建 Aider prompt
4. 调用 Aider CLI 执行
5. Aider 生成/编辑代码
6. 运行质量检查
7. 标记任务完成
8. 循环到下一个任务
```

## 🛠️ 命令参考

### Orchestrator
```bash
# 单次运行
python3 orchestrator.py

# 守护进程（每60秒检查一次）
python3 orchestrator.py --daemon 60

# 查看日志
tail -f .auto-coder/orchestrator.log
```

### Aider
```bash
# 基本使用
aider --model openai/minimaxai/minimax-m2.1 --message "Task"

# 带测试
aider --model <model> --message "Task" --test

# 自动提交
aider --model <model> --message "Task" --auto-commits
```

### 质量检查
```bash
# 手动运行
./quality_check.sh

# 自动修复格式
npx prettier --write .
```

## 🔧 配置

### Aider 配置 (~/.aider.conf.yml)
```yaml
model: openai/minimaxai/minimax-m2.1
openai_api_key: ${NVIDIA_API_KEY}
edit_format: diff
auto_commits: true
auto_test: true
```

### 环境变量 (.env.local)
```bash
NVIDIA_API_KEY=nvapi-xxx
GITHUB_TOKEN=ghp-xxx      # 可选
GITHUB_REPO=user/repo     # 可选
```

## 📝 下一步

运行自动化系统开始开发：

```bash
cd /Users/beihuang/Documents/github/aimarketing

# 启动开发服务器（终端1）
npm run dev

# 启动自动化编排器（终端2）
python3 orchestrator.py --daemon 60

# 查看进度（终端3）
tail -f .auto-coder/orchestrator.log
```

---

**文档:**
- `ARCHITECTURE.md` - 系统架构说明
- `web_test_flow.md` - Web 测试流程
- `AUTONOMOUS_CODING.md` - 完整使用指南
