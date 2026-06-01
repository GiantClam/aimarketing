#!/usr/bin/env python3
"""
OpenCode Orchestrator - 使用 OpenCode + Kimi 2.5 替代 Aider
"""

import os
import sys
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path

class OpenCodeOrchestrator:
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.state_file = self.work_dir / ".auto-coder" / "orchestrator_state.json"
        self.log_file = self.work_dir / ".auto-coder" / "orchestrator.log"
        self.state_file.parent.mkdir(exist_ok=True)
        
        self.opencode_bin = "/Users/beihuang/.opencode/bin/opencode"
        self.model = "opencode/kimi-k2.5-free"
        
    def log(self, msg: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{timestamp}] {msg}"
        print(entry)
        with open(self.log_file, "a") as f:
            f.write(entry + "\n")
    
    def load_state(self) -> dict:
        if self.state_file.exists():
            with open(self.state_file) as f:
                return json.load(f)
        return {"completed": [], "failed": [], "current": None}
    
    def save_state(self, state: dict):
        with open(self.state_file, "w") as f:
            json.dump(state, f, indent=2)
    
    def get_next_task(self):
        """从 prd.json 获取下一个任务"""
        prd_file = self.work_dir / "prd.json"
        if not prd_file.exists():
            return None
        
        with open(prd_file) as f:
            data = json.load(f)
        
        state = self.load_state()
        completed = set(state.get("completed", []))
        
        for story in sorted(data.get("userStories", []), 
                           key=lambda x: x.get("priority", 99)):
            task_id = story.get("id", "")
            if task_id not in completed and not story.get("passes", False):
                return story
        
        return None
    
    def run_opencode(self, task: dict, max_retries: int = 3) -> bool:
        """使用 OpenCode 执行任务"""
        task_id = task.get("id", "unknown")
        title = task.get("title", "No title")
        description = task.get("description", "")
        
        self.log(f"🚀 Starting OpenCode for task: {task_id} - {title}")
        
        prompt = self.build_prompt(task)
        
        for attempt in range(1, max_retries + 1):
            self.log(f"  Attempt {attempt}/{max_retries}")
            
            try:
                # 使用 OpenCode + Kimi 2.5
                cmd = [
                    self.opencode_bin,
                    "--model", self.model,
                    "--message", prompt
                ]
                
                result = subprocess.run(
                    cmd,
                    cwd=str(self.work_dir),
                    capture_output=True,
                    text=True,
                    timeout=600  # 10分钟超时
                )
                
                # 检查是否成功（只要有输出就算成功）
                if result.returncode == 0 or len(result.stdout) > 100:
                    self.log(f"✅ Task {task_id} completed")
                    return True
                else:
                    self.log(f"⚠️  OpenCode exit code: {result.returncode}")
                    if attempt < max_retries:
                        time.sleep(5)
                    
            except subprocess.TimeoutExpired:
                self.log(f"⏱️  Task timed out (attempt {attempt})")
            except Exception as e:
                self.log(f"💥 Error: {e}")
        
        self.log(f"❌ Task {task_id} failed after {max_retries} attempts")
        return False
    
    def build_prompt(self, task: dict) -> str:
        """构建 OpenCode prompt"""
        task_id = task.get("id", "")
        title = task.get("title", "")
        description = task.get("description", "")
        criteria = task.get("acceptanceCriteria", [])
        
        prompt = f"""# Task: {task_id} - {title}

## Description
{description}

## Acceptance Criteria
"""
        for i, ac in enumerate(criteria, 1):
            prompt += f"{i}. {ac}\n"
        
        prompt += """
## Requirements
- Use Next.js 15 + TypeScript
- Create API routes in app/api/ directory
- Follow existing code patterns
- Write clean, production-ready code
- Return summary of files created

## Project Context
- Location: /Users/beihuang/Documents/github/aimarketing
- Framework: Next.js 15
- Language: TypeScript

Start by reading relevant existing files, then implement the task.
"""
        return prompt
    
    def complete_task(self, task: dict, success: bool):
        """标记任务完成"""
        state = self.load_state()
        task_id = task.get("id", "")
        
        if success:
            state.setdefault("completed", []).append(task_id)
            self.log(f"✅ Marked {task_id} as completed")
        else:
            state.setdefault("failed", []).append(task_id)
            self.log(f"❌ Marked {task_id} as failed")
        
        self.save_state(state)
    
    def run_single_task(self) -> bool:
        """运行单个任务"""
        task = self.get_next_task()
        
        if not task:
            self.log("⏳ No pending tasks")
            return False
        
        task_id = task.get("id", "")
        self.log(f"\n{'='*60}")
        self.log(f"Task: {task_id} - {task.get('title', '')}")
        self.log(f"{'='*60}\n")
        
        success = self.run_opencode(task)
        self.complete_task(task, success)
        
        return success
    
    def run_daemon(self, interval: int = 60):
        """守护进程模式"""
        self.log("🤖 Starting OpenCode Orchestrator (Daemon Mode)")
        self.log(f"   Model: {self.model}")
        self.log(f"   Check interval: {interval}s")
        self.log("\nPress Ctrl+C to stop\n")
        
        try:
            while True:
                success = self.run_single_task()
                
                if not success:
                    self.log(f"⏳ Sleeping {interval}s...")
                    time.sleep(interval)
                else:
                    time.sleep(5)
                    
        except KeyboardInterrupt:
            self.log("\n🛑 Stopped by user")
    
    def run_once(self):
        """单次运行模式"""
        self.log("🤖 OpenCode Orchestrator (Single Run Mode)")
        self.run_single_task()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--daemon":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        orchestrator = OpenCodeOrchestrator()
        orchestrator.run_daemon(interval)
    else:
        orchestrator = OpenCodeOrchestrator()
        orchestrator.run_once()

if __name__ == "__main__":
    main()
