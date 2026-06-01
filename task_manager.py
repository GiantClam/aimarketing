#!/usr/bin/env python3
"""
任务管理器 - 管理 prd.json 中的任务
"""

import json
import sys
from pathlib import Path
from datetime import datetime

TASKS_FILE = Path(__file__).parent / "prd.json"
COMPLETED_FILE = Path(__file__).parent / ".auto-coder" / "completed.txt"

def load_tasks():
    """加载所有任务"""
    if not TASKS_FILE.exists():
        print("❌ prd.json not found")
        return []
    
    with open(TASKS_FILE) as f:
        data = json.load(f)
        return data.get("userStories", [])

def load_completed():
    """加载已完成任务"""
    if COMPLETED_FILE.exists():
        with open(COMPLETED_FILE) as f:
            return set(line.strip() for line in f if line.strip())
    return set()

def save_completed(completed):
    """保存已完成任务"""
    COMPLETED_FILE.parent.mkdir(exist_ok=True)
    with open(COMPLETED_FILE, "w") as f:
        for task_id in sorted(completed):
            f.write(f"{task_id}\n")

def list_tasks():
    """列出所有任务"""
    tasks = load_tasks()
    completed = load_completed()
    
    print("\n📋 AI Marketing Platform Tasks")
    print("=" * 60)
    
    for i, task in enumerate(tasks, 1):
        task_id = task.get("id", f"TASK-{i}")
        title = task.get("title", "No title")
        priority = task.get("priority", i)
        status = "✅" if task_id in completed else "⏳"
        
        print(f"{status} [{priority}] {task_id}: {title}")
    
    print("-" * 60)
    completed_count = len(completed)
    total_count = len(tasks)
    print(f"Progress: {completed_count}/{total_count} completed")
    print()

def next_task():
    """获取下一个待办任务"""
    tasks = load_tasks()
    completed = load_completed()
    
    for task in sorted(tasks, key=lambda x: x.get("priority", 99)):
        if task.get("id") not in completed:
            return task
    
    return None

def run_task(task_id):
    """运行特定任务"""
    tasks = load_tasks()
    completed = load_completed()
    
    for task in tasks:
        if task.get("id") == task_id:
            if task_id in completed:
                print(f"⚠️ Task {task_id} already completed")
                return
            
            # 构建提示词
            prompt = f"""
Implement the following feature for AI Marketing Platform:

Task: {task.get('id')} - {task.get('title')}

Description: {task.get('description', '')}

Acceptance Criteria:
{chr(10).join(f'- {c}' for c in task.get('acceptanceCriteria', []))}

Requirements:
- Use Next.js 15 + TypeScript
- Create API routes in app/api/
- Follow existing code patterns
- Return summary of files created

Start by reading existing files, then implement.
"""
            print(f"\n🚀 Running task: {task_id}")
            print("-" * 40)
            print(prompt)
            print("-" * 40)
            
            # 标记为完成（实际应运行后标记）
            completed.add(task_id)
            save_completed(completed)
            
            return
    
    print(f"❌ Task {task_id} not found")

def reset_completed():
    """重置完成状态"""
    completed = load_completed()
    print(f"🗑️  Clearing {len(completed)} completed tasks...")
    save_completed(set())
    print("✅ Reset complete")

def main():
    if len(sys.argv) < 2:
        list_tasks()
        return
    
    cmd = sys.argv[1]
    
    if cmd == "list" or cmd == "ls":
        list_tasks()
    
    elif cmd == "next" or cmd == "n":
        task = next_task()
        if task:
            print(f"\n📌 Next task: {task.get('id')} - {task.get('title')}")
        else:
            print("\n✅ All tasks completed!")
    
    elif cmd == "run":
        if len(sys.argv) < 3:
            print("Usage: python task_manager.py run <task_id>")
            sys.exit(1)
        run_task(sys.argv[2])
    
    elif cmd == "run-next":
        task = next_task()
        if task:
            run_task(task.get("id"))
        else:
            print("No pending tasks")
    
    elif cmd == "reset":
        reset_completed()
    
    elif cmd == "progress":
        tasks = load_tasks()
        completed = load_completed()
        total = len(tasks)
        done = len(completed)
        pct = (done / total * 100) if total > 0 else 0
        
        print(f"\n📊 Progress: {done}/{total} ({pct:.1f}%)")
        
        # 进度条
        bar_len = 30
        filled = int(bar_len * done / total) if total > 0 else 0
        bar = "█" * filled + "░" * (bar_len - filled)
        print(f"Progress: |{bar}|")
    
    else:
        print("Commands:")
        print("  list, ls     - List all tasks")
        print("  next, n      - Show next task")
        print("  run <id>     - Run specific task")
        print("  run-next     - Run next pending task")
        print("  reset        - Reset completed tasks")
        print("  progress     - Show progress")

if __name__ == "__main__":
    main()
