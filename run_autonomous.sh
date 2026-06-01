#!/bin/bash
# AI Marketing Platform - Autonomous Coding Runner
# 使用 Kimi2.5 Free 模型（通过 OpenCode）实现自动化编程

set -e

WORK_DIR="/Users/beihuang/Documents/github/aimarketing"
LOG_FILE="$WORK_DIR/.auto-coder/logs.txt"
TASKS_FILE="$WORK_DIR/prd.json"

mkdir -p "$WORK_DIR/.auto-coder"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

get_next_task() {
    local completed=$(cat "$WORK_DIR/.auto-coder/completed.txt" 2>/dev/null || echo "")
    
    # 从 prd.json 获取未完成的任务
    if [ -f "$TASKS_FILE" ]; then
        python3 -c "
import json
with open('$TASKS_FILE') as f:
    data = json.load(f)
    completed = '''$completed'''.split()
    for story in data.get('userStories', []):
        if story.get('id') not in completed:
            print(json.dumps(story))
            exit(0)
print('null')
" 2>/dev/null
    fi
}

run_task() {
    local task_json="$1"
    local task_id=$(echo "$task_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id','unknown'))")
    local title=$(echo "$task_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('title','No title'))")
    local desc=$(echo "$task_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('description',''))")
    
    log "📋 Processing: $task_id - $title"
    
    # 构建提示词
    local prompt="Implement the following feature for AI Marketing Platform:

Task: $task_id - $title

Description: $desc

Requirements:
- Use Next.js 15 + TypeScript
- Create API routes in app/api/
- Follow existing code patterns
- Return summary of files created

Current directory: $WORK_DIR"

    # 运行 OpenCode + Kimi2.5
    cd "$WORK_DIR"
    echo "$prompt" | timeout 300 /Users/beihuang/.opencode/bin/opencode --model opencode/kimi-k2.5-free 2>&1 | tee -a "$LOG_FILE"
    
    # 标记完成
    echo "$task_id" >> "$WORK_DIR/.auto-coder/completed.txt"
    log "✅ Completed: $task_id"
}

main() {
    log "🚀 Autonomous coder started"
    
    while true; do
        # 获取下一个任务
        task=$(get_next_task)
        
        if [ "$task" = "null" ] || [ -z "$task" ]; then
            log "⏳ No pending tasks"
            break
        fi
        
        # 运行任务
        run_task "$task"
        
        # 短暂休息
        sleep 2
    done
    
    log "🏁 Finished all tasks"
}

main
