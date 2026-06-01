# 📖 全自动编码系统 - 完整使用指南

## 🎯 系统特点

✅ **代码生成** - OpenCode + Kimi 2.5 自动生成代码  
✅ **全面测试** - TypeScript + ESLint + API + 页面 + 性能  
✅ **自动修复** - 发现问题后自动尝试修复  
✅ **持续监控** - 7x24 自动运行，无需人工值守  

---

## 🚀 快速开始

### 准备工作（1分钟）

```bash
cd /Users/beihuang/Documents/github/aimarketing

# 1. 确认配置
cat .env.local

# 2. 加载环境变量
export $(cat .env.local | xargs)

# 3. 检查状态
python3 monitor.py
```

### 启动系统（3个终端）

**终端 1️⃣ - 开发服务器:**
```bash
npm run dev
# 等待: "ready started server on 0.0.0.0:3000"
```

**终端 2️⃣ - 增强版编排器（推荐）:**
```bash
python3 orchestrator_full.py --daemon 60
```
这个版本包含：代码生成 + 全面测试 + 自动修复

**终端 3️⃣ - 实时监控:**
```bash
python3 monitor.py --watch 5
```

---

## 📋 工作流程详解

### 阶段 1: 代码生成
```
Orchestrator 读取 prd.json
    ↓
获取下一个任务 (STORY-003)
    ↓
调用 OpenCode + Kimi 2.5
    ↓
生成代码文件
```

### 阶段 2: 全面测试（6项检查）
```
✅ 1. TypeScript 编译检查
   npx tsc --noEmit
   
✅ 2. ESLint 代码规范
   npx eslint . --ext .ts,.tsx
   
✅ 3. API 端点测试
   curl http://localhost:3000/api/xxx
   
✅ 4. Web 页面测试
   agent-browser 截图验证
   
✅ 5. 交互功能测试
   表单输入、按钮点击
   
✅ 6. 性能指标
   页面加载时间 < 3s
```

### 阶段 3: 自动修复
```
如果测试失败:
    ↓
分析问题类型 (TypeScript/ESLint/API)
    ↓
调用 OpenCode 修复
    ↓
重新运行测试
    ↓
验证修复结果
```

### 阶段 4: 完成
```
所有测试通过
    ↓
标记任务完成
    ↓
Git 提交
    ↓
进入下一个任务
```

---

## 🛠️ 可用脚本

| 脚本 | 功能 | 使用场景 |
|------|------|----------|
| `orchestrator_full.py` | **增强版** - 代码生成+测试+修复 | ⭐ 推荐使用 |
| `orchestrator_opencode.py` | 基础版 - 仅代码生成 | 快速测试 |
| `test_runner.py` | 独立测试套件 | 手动验证 |
| `auto_fix.py` | 自动修复工具 | 问题修复 |
| `monitor.py` | 监控面板 | 状态查看 |
| `quality_check.sh` | 质量检查 | 手动检查 |

---

## 📊 测试内容详解

### 1. TypeScript 编译检查
**目的**: 确保代码类型正确，无编译错误
```bash
npx tsc --noEmit
```
**通过标准**: 0 个错误

### 2. ESLint 代码规范
**目的**: 确保代码风格统一，无语法问题
```bash
npx eslint . --ext .ts,.tsx --max-warnings=10
```
**通过标准**: < 10 个警告，0 个错误

### 3. API 端点测试
**目的**: 验证 API 是否正常工作
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test","password":"demo123"}'
```
**通过标准**: HTTP 200/201/401

### 4. Web 页面测试
**目的**: 验证页面可访问，无白屏
```bash
agent-browser open http://localhost:3000
agent-browser screenshot
```
**通过标准**: HTTP 200，元素可见

### 5. 交互功能测试
**目的**: 验证表单、按钮等交互正常
```bash
agent-browser type input[name='email'] 'test@example.com'
agent-browser click button[type='submit']
```
**通过标准**: 可以输入和点击

### 6. 性能测试
**目的**: 确保页面加载速度可接受
```bash
curl -w "%{time_total}" http://localhost:3000
```
**通过标准**: < 3s（优秀），< 5s（可接受）

---

## 🔧 故障处理

### 场景 1: 测试一直失败

```bash
# 1. 查看具体错误
python3 test_runner.py

# 2. 手动运行修复
python3 auto_fix.py .auto-coder/test_errors.log

# 3. 或者直接用 OpenCode 修复
echo '{"prompt": "Fix these errors: ..."}' | \
  /Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free
```

### 场景 2: 某个任务卡住

```bash
# 1. 停止编排器
pkill -f orchestrator_full.py

# 2. 手动完成任务
# 编辑 .auto-coder/orchestrator_state.json
# 将任务 ID 从 failed 移到 completed

# 3. 重新启动
python3 orchestrator_full.py --daemon 60
```

### 场景 3: 代码生成但无法运行

```bash
# 1. 检查编译错误
npx tsc --noEmit 2>&1 | head -20

# 2. 检查具体文件
cat app/api/xxx/route.ts

# 3. 手动修复
aider --message "Fix compilation error in app/api/xxx/route.ts"
```

---

## 📈 预期输出

### 正常运行时:

```
[18:30:00] 🤖 增强版全自动编码系统启动
[18:30:00] 模式: 代码生成 + 全面测试 + 自动修复
[18:30:00] 模型: opencode/kimi-k2.5-free

============================================================
[18:30:05] 开始执行任务: STORY-003 - Enterprise RBAC System
============================================================

[18:30:06] 调用 OpenCode + Kimi 2.5...
[18:32:30] 代码生成完成，输出长度: 5234 字符

============================================================
[18:32:35] 启动全面测试套件
============================================================

[18:32:36] ⏳ 等待服务器热更新...

🔧 测试 1/6: TypeScript 编译检查
  ✅ TypeScript 编译通过

📏 测试 2/6: ESLint 代码规范检查
  ✅ ESLint 检查通过

🌐 测试 3/6: API 端点测试
  ✅ POST http://localhost:3000/api/auth/login - 200
  ✅ GET http://localhost:3000/api/auth/me - 200
  ✅ 所有 API 端点正常

🖥️  测试 4/6: Web 页面可用性测试
  ✅ 页面可访问: http://localhost:3000
  ✅ 页面主体元素可见
  📸 截图保存: /tmp/screenshot_home.png

🖱️  测试 5/6: 交互功能测试
  ✅ 邮箱输入框可见
  ✅ 可以输入邮箱

⚡ 测试 6/6: 性能指标检查
  ✅ 首页加载时间: 1.23s (优秀)

============================================================
测试结果汇总
============================================================
TypeScript: ✅ 通过
ESLint: ✅ 通过
API: ✅ 通过
Web: ✅ 通过
交互: ✅ 通过
性能: ✅ 通过
============================================================
🎉 所有测试通过，系统状态良好！

[18:33:15] ✅ 任务 STORY-003 标记为完成

============================================================
准备处理下一个任务...
```

---

## ⏱️ 时间预估

| 阶段 | 时间 | 说明 |
|------|------|------|
| 代码生成 | 2-5 分钟 | 取决于复杂度 |
| 等待编译 | 5 秒 | Next.js 热更新 |
| 全面测试 | 30-60 秒 | 6 项检查 |
| 自动修复 | 1-3 分钟 | 如需修复 |
| 重新测试 | 30-60 秒 | 修复后验证 |
| **总计** | **5-10 分钟/任务** | - |

**剩余 7 个任务预计**: 40-70 分钟

---

## 🎯 下一步行动

```bash
# 1. 打开 3 个终端

# 2. 终端 1: 启动开发服务器
cd /Users/beihuang/Documents/github/aimarketing
npm run dev

# 3. 终端 2: 启动增强版编排器
python3 orchestrator_full.py --daemon 60

# 4. 终端 3: 监控
python3 monitor.py --watch 5

# 5. 浏览器访问
open http://localhost:3000

# 6. 等待系统自动完成所有任务
```

---

## 📚 相关文档

- `README.md` - 系统概览
- `ARCHITECTURE.md` - 架构说明
- `MONITORING.md` - 监控指南
- `AUTONOMOUS_CODING.md` - 完整文档
