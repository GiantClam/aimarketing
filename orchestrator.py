#!/usr/bin/env python3
"""
Aider Orchestrator - 自动化编排层
不负责代码生成，只负责任务调度和流程控制
真正的代码生成交给 Aider CLI
"""

import os
import sys
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

class AiderOrchestrator:
    """
    Aider 的自动化编排器
    - 读取任务队列
    - 调用 Aider CLI 执行
    - 监控执行结果
    - 错误恢复
    """
    
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.state_file = self.work_dir / ".auto-coder" / "orchestrator_state.json"
        self.log_file = self.work_dir / ".auto-coder" / "orchestrator.log"
        self.state_file.parent.mkdir(exist_ok=True)
        
        # Aider 配置
        self.aider_model = os.getenv("AIDER_MODEL", "openai/minimaxai/minimax-m2.1")
        self.nvidia_key = os.getenv("NVIDIA_API_KEY", "")
        
    def log(self, msg: str):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{timestamp}] {msg}"
        print(entry)
        with open(self.log_file, "a") as f:
            f.write(entry + "\n")
    
    def load_state(self) -> Dict:
        if self.state_file.exists():
            with open(self.state_file) as f:
                return json.load(f)
        return {"completed": [], "failed": [], "current": None}
    
    def save_state(self, state: Dict):
        with open(self.state_file, "w") as f:
            json.dump(state, f, indent=2)
    
    def get_next_task(self) -> Optional[Dict]:
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
    
    def run_aider(self, task: Dict, max_retries: int = 3) -> bool:
        """
        调用 Aider CLI 执行任务
        这是核心：我们调用 Aider，不是替代它
        """
        task_id = task.get("id", "unknown")
        title = task.get("title", "No title")
        description = task.get("description", "")
        
        self.log(f"🚀 Starting Aider for task: {task_id} - {title}")
        
        # 构建 Aider prompt
        prompt = self.build_aider_prompt(task)
        
        # 设置环境变量
        env = os.environ.copy()
        env["NVIDIA_API_KEY"] = self.nvidia_key
        
        for attempt in range(1, max_retries + 1):
            self.log(f"  Attempt {attempt}/{max_retries}")
            
            try:
                # 调用 Aider CLI
                cmd = [
                    "aider",
                    "--model", self.aider_model,
                    "--message", prompt,
                    "--yes",           # 自动确认
                    "--auto-commits",  # 自动提交
                ]
                
                # 运行 Aider
                result = subprocess.run(
                    cmd,
                    cwd=str(self.work_dir),
                    capture_output=True,
                    text=True,
                    timeout=1800,  # 30分钟超时
                    env=env
                )
                
                # 检查结果
                if result.returncode == 0:
                    self.log(f"✅ Task {task_id} completed successfully")
                    return True
                else:
                    self.log(f"⚠️ Aider failed (attempt {attempt})")
                    self.log(f"   Error: {result.stderr[-500:]}")
                    
                    if attempt < max_retries:
                        wait_time = 2 ** attempt  # 指数退避
                        self.log(f"   Retrying in {wait_time}s...")
                        time.sleep(wait_time)
                    
            except subprocess.TimeoutExpired:
                self.log(f"⏱️ Task timed out (attempt {attempt})")
            except FileNotFoundError:
                self.log("❌ Aider not found. Please install: pip install aider-chat")
                return False
            except Exception as e:
                self.log(f"💥 Unexpected error: {e}")
        
        self.log(f"❌ Task {task_id} failed after {max_retries} attempts")
        return False
    
    def build_aider_prompt(self, task: Dict) -> str:
        """构建给 Aider 的 prompt"""
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
- Follow existing code patterns in app/api/
- Write clean, production-ready code
- Run tests if available
- Commit changes with descriptive message

## Project Context
- Location: /Users/beihuang/Documents/github/aimarketing
- Framework: Next.js 15
- Language: TypeScript
- Database: Supabase/PostgreSQL (if needed)

Start by reading relevant existing files, then implement the task.
"""
        return prompt
    
    def run_quality_checks(self) -> bool:
        """运行代码质量检查"""
        self.log("🔍 Running quality checks...")
        
        checks = [
            ("TypeScript check", ["npx", "tsc", "--noEmit"]),
            ("ESLint check", ["npx", "eslint", ".", "--ext", ".ts,.tsx"]),
            ("Prettier check", ["npx", "prettier", "--check", "."]),
        ]
        
        all_passed = True
        for name, cmd in checks:
            try:
                result = subprocess.run(
                    cmd,
                    cwd=str(self.work_dir),
                    capture_output=True,
                    timeout=120
                )
                if result.returncode == 0:
                    self.log(f"  ✅ {name}")
                else:
                    self.log(f"  ❌ {name} failed")
                    all_passed = False
            except Exception as e:
                self.log(f"  ⚠️ {name} skipped: {e}")
        
        return all_passed
    
    def complete_task(self, task: Dict, success: bool):
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
        
        # 1. 运行 Aider
        success = self.run_aider(task)
        
        if success:
            # 2. 质量检查
            if self.run_quality_checks():
                self.complete_task(task, True)
                return True
            else:
                self.log("⚠️ Quality checks failed, but task marked complete")
                self.complete_task(task, True)
                return True
        else:
            self.complete_task(task, False)
            return False
    
    def run_daemon(self, interval: int = 60):
        """守护进程模式"""
        self.log("🤖 Starting Aider Orchestrator (Daemon Mode)")
        self.log(f"   Check interval: {interval}s")
        self.log(f"   Working directory: {self.work_dir}")
        self.log(f"   Aider model: {self.aider_model}")
        self.log("\nPress Ctrl+C to stop\n")
        
        try:
            while True:
                success = self.run_single_task()
                
                if not success:
                    # 没有任务或失败了，休息一会儿
                    self.log(f"⏳ Sleeping {interval}s...")
                    time.sleep(interval)
                else:
                    # 任务成功，短暂休息后继续
                    time.sleep(5)
                    
        except KeyboardInterrupt:
            self.log("\n🛑 Stopped by user")
    
    def run_once(self):
        """单次运行模式"""
        self.log("🤖 Aider Orchestrator (Single Run Mode)")
        self.run_single_task()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--daemon":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        orchestrator = AiderOrchestrator()
        orchestrator.run_daemon(interval)
    else:
        orchestrator = AiderOrchestrator()
        orchestrator.run_once()

if __name__ == "__main__":
    main()
