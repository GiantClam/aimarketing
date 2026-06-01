# 🏗️ 系统架构说明

## 澄清：Aider vs Orchestrator

### Aider CLI (核心代码生成工具)
```
角色: 代码生成和编辑的核心引擎
功能:
├── AI 代码生成 (MiniMax M2.1)
├── 代码编辑 (diff 模式)
├── 自动测试运行
├── Git 提交
└── 文件管理

使用方式:
  aider --model <model> --message "Create API..."

我们不替代 Aider，而是包装和编排它
```

### Orchestrator (自动化编排层)
```
角色: 任务调度和流程控制器
功能:
├── 读取任务队列 (prd.json)
├── 调用 Aider CLI 执行
├── 错误重试 (3次)
├── 质量检查触发
├── 状态管理
└── 日志记录

使用方式:
  python3 orchestrator.py           # 单次运行
  python3 orchestrator.py --daemon  # 守护进程

Orchestrator 调用 Aider，而不是替代它
```

---

## 🎯 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                      用户/定时器                             │
└──────────────────┬──────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                 Orchestrator (Python)                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. 读取 prd.json，获取下一个任务                       │  │
│  │ 2. 构建 Aider prompt                                  │  │
│  │ 3. 调用 Aider CLI                                     │  │
│  │ 4. 等待 Aider 完成                                    │  │
│  │ 5. 运行质量检查                                       │  │
│  │ 6. 更新任务状态                                       │  │
│  │ 7. 记录日志                                           │  │
│  └───────────────────────────────────────────────────────┘  │
└──────────────────┬──────────────────────────────────────────┘
                   │ 调用
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                    Aider CLI (Node.js)                      │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 1. 接收 prompt                                        │  │
│  │ 2. 调用 MiniMax M2.1 API                              │  │
│  │ 3. 生成/编辑代码                                      │  │
│  │ 4. 运行测试                                           │  │
│  │ 5. Git commit                                         │  │
│  │ 6. 返回结果                                           │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 文件职责

| 文件 | 角色 | 说明 |
|------|------|------|
| `aider` | 核心 CLI | 代码生成工具（需单独安装） |
| `orchestrator.py` | 编排器 | 任务调度、错误恢复、质量检查 |
| `quality_check.sh` | 质量脚本 | typecheck + lint + test |
| `prd.json` | 任务源 | 用户故事清单 |
| `task_manager.py` | 辅助工具 | 本地任务管理（可选） |
| `github_coder.py` | 辅助工具 | GitHub Issues 同步（可选） |

---

## 🚀 使用方式

### 方式 1: 直接使用 Aider（手动）
```bash
# 适合：单任务、调试、快速测试
aider --model openai/minimaxai/minimax-m2.1 \
      --message "Create login API"
```

### 方式 2: Orchestrator 自动化（推荐）
```bash
# 适合：批量任务、无人值守、完整流程
python3 orchestrator.py              # 单次运行
python3 orchestrator.py --daemon 60  # 守护进程，每60秒检查
```

### 方式 3: 混合使用
```bash
# 先用 orchestrator 自动化主要任务
python3 orchestrator.py --daemon

# 需要人工介入时，直接用 Aider 调试
aider --message "Fix the error..."
```

---

## 🔧 配置

### Aider 配置 (~/.aider.conf.yml)
```yaml
model: openai/minimaxai/minimax-m2.1
openai_api_key: ${NVIDIA_API_KEY}
edit_format: diff
auto_commits: true
```

### Orchestrator 环境变量
```bash
export NVIDIA_API_KEY="nvapi-xxx"
export GITHUB_TOKEN="ghp-xxx"      # 可选
export GITHUB_REPO="user/repo"      # 可选
```

---

## ✅ 优势

**使用 Aider + Orchestrator 组合的优势：**

1. **不重复造轮子**
   - Aider 已有成熟的代码生成能力
   - 我们只需添加自动化层

2. **可独立使用**
   - Aider 可单独使用（手动模式）
   - Orchestrator 只是可选的自动化包装

3. **易于调试**
   - 出错时可单独运行 Aider 排查
   - Orchestrator 只负责流程，不处理代码

4. **可扩展**
   - 可替换 Aider 为其他工具（Claude Code 等）
   - Orchestrator 保持不变
