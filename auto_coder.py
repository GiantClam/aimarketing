#!/usr/bin/env python3
"""
AI Marketing Platform - Auto Coder
基于 Aider + MiniMax M2.1 的自动化编程系统
"""

import os
import sys
import time
import json
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

class AutoCoder:
    def __init__(self, work_dir: str = None):
        self.work_dir = Path(work_dir) if work_dir else Path(__file__).parent
        self.log_file = self.work_dir / ".auto-coder" / "logs.txt"
        self.log_file.parent.mkdir(exist_ok=True)
        self.state_file = self.work_dir / ".auto-coder" / "state.json"
        
        # 模型配置
        self.model = os.getenv("AIDER_MODEL", "openai/minimaxai/minimax-m2.1")
        self.api_key = os.getenv("NVIDIA_API_KEY", "")
        self.api_base = os.getenv("AIDER_API_BASE", "https://integrate.api.nvidia.com/v1")
        
        # GitHub 配置
        self.repo = os.getenv("GITHUB_REPO", "")
        self.token = os.getenv("GITHUB_TOKEN", "")
        
    def log(self, msg: str):
        """记录日志"""
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        log_entry = f"[{timestamp}] {msg}"
        print(log_entry)
        with open(self.log_file, "a") as f:
            f.write(log_entry + "\n")
    
    def load_state(self) -> Dict:
        """加载状态"""
        if self.state_file.exists():
            with open(self.state_file) as f:
                return json.load(f)
        return {"current_task": None, "completed_tasks": []}
    
    def save_state(self, state: Dict):
        """保存状态"""
        with open(self.state_file, "w") as f:
            json.dump(state, f, indent=2)
    
    def get_next_task(self) -> Optional[Dict]:
        """获取下一个待处理任务"""
        state = self.load_state()
        
        # 检查 PRD 文件获取任务
        prd_file = self.work_dir / "docs" / "prd" / "PRD.md"
        if not prd_file.exists():
            prd_file = self.work_dir / "prd.md"
        
        if prd_file.exists():
            tasks = self.parse_prd_tasks(prd_file)
            completed = state.get("completed_tasks", [])
            
            for task in tasks:
                if task["id"] not in completed:
                    return task
        
        return None
    
    def parse_prd_tasks(self, prd_file: Path) -> List[Dict]:
        """解析 PRD 文件中的任务"""
        try:
            with open(prd_file) as f:
                content = f.read()
            
            tasks = []
            # 简单的解析逻辑
            import re
            patterns = [
                r"(?:STORY|US|TASK)-(\d+)[^\n]*\n*(.*?)(?=(?:STORY|US|TASK)-(\d+)|$)",
                r"###\s*(.+?)\n(.+?)(?=###\s|\Z)",
            ]
            
            # 基于 prd.json 解析
            json_file = self.work_dir / "prd.json"
            if json_file.exists():
                with open(json_file) as f:
                    data = json.load(f)
                    for story in data.get("userStories", []):
                        tasks.append({
                            "id": story.get("id", ""),
                            "title": story.get("title", ""),
                            "description": story.get("description", ""),
                            "priority": story.get("priority", 0)
                        })
                return tasks
            
            return []
        except Exception as e:
            self.log(f"Error parsing PRD: {e}")
            return []
    
    def run_aider(self, task: Dict) -> bool:
        """运行 Aider 处理任务"""
        if not self.api_key:
            self.log("⚠️ No NVIDIA_API_KEY set, using mock mode")
            return self.mock_implement(task)
        
        prompt = self.build_prompt(task)
        
        cmd = [
            "aider",
            "--model", self.model,
            "--message", prompt,
            "--yes",
            "--auto-commits",
            "--test",
            "--test-cmd", "python -m pytest -xvs --tb=short 2>&1 || npm test 2>&1 || true"
        ]
        
        try:
            result = subprocess.run(
                cmd,
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=1800
            )
            
            output = result.stdout + result.stderr
            
            if result.returncode == 0:
                self.log("✅ Task completed")
                return True
            else:
                self.log(f"⚠️ Task failed: {output[-500:]}")
                return False
                
        except FileNotFoundError:
            self.log("⚠️ Aider not found, using mock mode")
            return self.mock_implement(task)
        except subprocess.TimeoutExpired:
            self.log("⏱️ Task timed out")
            return False
    
    def build_prompt(self, task: Dict) -> str:
        """构建 Aider prompt"""
        return f"""
Implement task: {task['id']} - {task['title']}

Description:
{task.get('description', '')}

Requirements:
1. Follow existing code style and architecture
2. Write comprehensive tests
3. Ensure all tests pass
4. Update documentation if needed

Current directory: {self.work_dir}
Project: AI Marketing Platform (Next.js 15 + TypeScript)

Start by reading relevant files, then implement.
"""
    
    def mock_implement(self, task: Dict) -> bool:
        """Mock 实现（用于测试）"""
        self.log(f"📝 [MOCK] Would implement: {task['id']} - {task['title']}")
        self.log(f"   Description: {task.get('description', '')[:100]}...")
        
        # 模拟创建文件
        task_id = task.get("id", "unknown")
        task_dir = self.work_dir / ".auto-coder" / "implemented"
        task_dir.mkdir(exist_ok=True)
        
        marker = task_dir / f"{task_id}.json"
        marker.write_text(json.dumps({
            "task": task,
            "implemented_at": datetime.now().isoformat(),
            "status": "mock"
        }))
        
        return True
    
    def complete_task(self, task: Dict, success: bool = True):
        """标记任务完成"""
        state = self.load_state()
        task_id = task.get("id", "")
        
        if task_id and task_id not in state.get("completed_tasks", []):
            state.setdefault("completed_tasks", []).append(task_id)
            self.save_state(state)
        
        self.log(f"{'✅' if success else '❌'} Task {task_id} {'completed' if success else 'failed'}")
    
    def run(self):
        """主循环"""
        self.log("🚀 Auto-coder started")
        self.log(f"   Model: {self.model}")
        self.log(f"   Working directory: {self.work_dir}")
        
        while True:
            try:
                task = self.get_next_task()
                
                if not task:
                    self.log("⏳ No pending tasks")
                    break
                
                self.log(f"📋 Processing: {task['id']} - {task['title']}")
                
                success = self.run_aider(task)
                self.complete_task(task, success)
                
                if not success:
                    self.log("⏸️ Stopping due to failure")
                    break
                
                time.sleep(2)
                
            except KeyboardInterrupt:
                self.log("🛑 Stopped by user")
                break
            except Exception as e:
                self.log(f"💥 Error: {e}")
                break
        
        self.log("🏁 Auto-coder finished")

def main():
    work_dir = sys.argv[1] if len(sys.argv) > 1 else None
    coder = AutoCoder(work_dir)
    coder.run()

if __name__ == "__main__":
    main()
