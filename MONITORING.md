# 📊 全自动编码系统 - 监控指南

## 🎯 监控方式总览

| 方式 | 命令 | 用途 |
|------|------|------|
| **监控面板** | `python3 monitor.py` | 一键查看整体状态 |
| **实时监控** | `python3 monitor.py --watch` | 持续刷新监控 |
| **日志查看** | `tail -f .auto-coder/orchestrator.log` | 查看详细日志 |
| **进程检查** | `pgrep -f orchestrator.py` | 检查是否运行 |
| **任务管理** | `python3 task_manager.py list` | 查看任务清单 |

---

## 📈 核心监控指标

### 1. 系统运行状态

```bash
# 检查 Orchestrator 是否在运行
pgrep -f orchestrator.py
# 输出 PID 表示运行中，无输出表示已停止

# 检查开发服务器
curl -s http://localhost:3000 > /dev/null && echo "✅ 运行中" || echo "❌ 已停止"

# 查看所有相关进程
ps aux | grep -E "(orchestrator|npm|node)" | grep -v grep
```

### 2. 任务进度监控

```bash
# 方式 1: 监控面板
python3 monitor.py

# 方式 2: 任务管理器
python3 task_manager.py progress

# 方式 3: 直接查看状态文件
cat .auto-coder/orchestrator_state.json
```

### 3. 日志监控

```bash
# 实时查看 Orchestrator 日志
tail -f .auto-coder/orchestrator.log

# 查看最近 100 行
 tail -n 100 .auto-coder/orchestrator.log

# 搜索错误
grep -i "error\|failed\|❌" .auto-coder/orchestrator.log

# 查看特定任务日志
grep "STORY-003" .auto-coder/orchestrator.log
```

---

## 🚨 故障诊断

### 场景 1: Orchestrator 停止运行

```bash
# 1. 检查是否意外停止
pgrep -f orchestrator.py || echo "已停止"

# 2. 查看最后日志
tail -n 50 .auto-coder/orchestrator.log

# 3. 检查错误
python3 monitor.py | grep -A 5 "错误"

# 4. 重新启动
python3 orchestrator.py --daemon 60
```

### 场景 2: 任务执行失败

```bash
# 1. 查看失败任务
cat .auto-coder/orchestrator_state.json | grep failed

# 2. 查看具体错误
grep -B 5 -A 10 "failed\|❌" .auto-coder/orchestrator.log | tail -30

# 3. 手动重试（清除失败状态后重新运行）
# 编辑 .auto-coder/orchestrator_state.json，从 failed 数组中移除任务ID
python3 orchestrator.py
```

### 场景 3: 开发服务器无响应

```bash
# 1. 检查端口占用
lsof -i :3000

# 2. 重启开发服务器
pkill -f "next dev"
npm run dev

# 3. 检查是否有编译错误
cd /Users/beihuang/Documents/github/aimarketing
npm run build 2>&1 | head -50
```

### 场景 4: Aider 执行失败

```bash
# 1. 检查 Aider 是否安装
which aider || echo "❌ Aider 未安装"

# 2. 检查 API Key
export NVIDIA_API_KEY="nvapi-xxx"
echo $NVIDIA_API_KEY

# 3. 测试 Aider
aider --model openai/minimaxai/minimax-m2.1 --message "test"

# 4. 检查 Aider 配置
cat ~/.aider.conf.yml
```

---

## 📊 性能监控

### CPU 和内存使用

```bash
# 监控 Orchestrator 资源使用
ps aux | grep orchestrator.py | awk '{print $3, $4}'  # CPU%, MEM%

# 监控开发服务器
ps aux | grep "next dev" | awk '{print $3, $4}'

# 系统整体资源
top -p $(pgrep -d',' -f orchestrator.py)
```

### 任务执行时间

```bash
# 查看任务执行时长
grep -E "Starting|completed" .auto-coder/orchestrator.log

# 统计平均执行时间
awk '/Starting/ {start=$1" "$2} /completed/ {print $1" "$2" - "start}' .auto-coder/orchestrator.log
```

---

## 🔔 报警设置

### 简单报警脚本

```bash
#!/bin/bash
# alert.sh - 系统异常时发送通知

# 检查 Orchestrator
if ! pgrep -f orchestrator.py > /dev/null; then
    echo "⚠️  Orchestrator 已停止"
    # 可添加: 发送邮件、Slack 通知等
fi

# 检查开发服务器
if ! curl -s http://localhost:3000 > /dev/null; then
    echo "⚠️  开发服务器无响应"
fi

# 检查错误
if grep -q "❌" .auto-coder/orchestrator.log | tail -5; then
    echo "⚠️  最近有任务失败"
fi
```

### 添加到 crontab（每5分钟检查）

```bash
*/5 * * * * /Users/beihuang/Documents/github/aimarketing/alert.sh >> /Users/beihuang/Documents/github/aimarketing/.auto-coder/alerts.log 2>&1
```

---

## 📝 监控清单

### 每日检查

- [ ] `python3 monitor.py` - 查看整体状态
- [ ] `tail -n 20 .auto-coder/orchestrator.log` - 查看最新日志
- [ ] 检查 http://localhost:3000 是否可访问
- [ ] 查看任务进度是否推进

### 每周检查

- [ ] 查看失败任务列表
- [ ] 检查日志文件大小（是否过大）
- [ ] 验证质量检查通过率
- [ ] 检查磁盘空间使用情况

### 故障排查

- [ ] 进程是否在运行？
- [ ] 日志是否有错误？
- [ ] API Key 是否有效？
- [ ] 网络连接是否正常？
- [ ] 磁盘空间是否充足？

---

## 🎨 监控面板截图示例

```
================================================================================
                                🤖 全自动编码系统 - 状态监控                                
================================================================================

📊 系统状态
--------------------------------------------------------------------------------
  时间: 2026-02-10 18:12:39
  🟢 Orchestrator: 运行中
     PID: 12345
  🟢 开发服务器: 运行中 (http://localhost:3000)

📈 任务进度
--------------------------------------------------------------------------------
  完成: 2/9 (22.2%)
  |██████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░|
  ✅ 成功: 2  ❌ 失败: 0

📝 当前任务
--------------------------------------------------------------------------------
  正在执行: STORY-003

📋 最近日志 (最后 10 行)
--------------------------------------------------------------------------------
  [18:10:23] Starting task: STORY-003
  [18:10:25] Aider executing...
  [18:11:30] Task completed successfully

💡 快速命令
--------------------------------------------------------------------------------
  启动系统:     python3 orchestrator.py --daemon 60
  开发服务器:   npm run dev
  查看日志:     tail -f .auto-coder/orchestrator.log
  质量检查:     ./quality_check.sh
  停止系统:     pkill -f orchestrator.py

================================================================================
```

---

## 🔧 高级监控

### 使用 htop 监控

```bash
# 安装 htop (如果未安装)
brew install htop

# 运行 htop 并过滤相关进程
htop -p $(pgrep -d',' -f "orchestrator|npm|node")
```

### 使用 glances 全面监控

```bash
# 安装 glances
pip3 install glances

# 运行
glances
```

### 日志分析

```bash
# 统计每天完成的任务数
grep "completed successfully" .auto-coder/orchestrator.log | awk '{print $1}' | sort | uniq -c

# 找出最慢的任务
grep -E "Starting|completed" .auto-coder/orchestrator.log | paste - - | awk '{print $1, $2}'

# 错误类型统计
grep "Error:" .auto-coder/orchestrator.log | awk -F":" '{print $2}' | sort | uniq -c | sort -rn
```

---

## 📱 远程监控

### 通过 SSH 监控

```bash
# 在其他终端 SSH 到服务器
ssh user@server

# 运行监控
cd /Users/beihuang/Documents/github/aimarketing
python3 monitor.py --watch 10
```

### Web 监控（可选）

```bash
# 安装并启动 simple-http-server
pip3 install simple-http-server
cd /Users/beihuang/Documents/github/aimarketing/.auto-coder
python3 -m http.server 8080

# 然后访问 http://localhost:8080 查看日志文件
```
