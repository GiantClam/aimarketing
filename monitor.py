#!/usr/bin/env python3
"""
全自动编码系统 - 监控面板
实时监控运行状态、进度、日志
"""

import os
import sys
import json
import time
import subprocess
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

class SystemMonitor:
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.log_dir = self.work_dir / ".auto-coder"
        self.state_file = self.log_dir / "orchestrator_state.json"
        
    def get_system_status(self) -> Dict:
        """获取系统状态"""
        status = {
            "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "orchestrator_running": False,
            "dev_server_running": False,
            "current_task": None,
            "progress": {"completed": 0, "failed": 0, "total": 9, "percentage": 0},
            "recent_logs": [],
            "errors": []
        }
        
        # 检查 orchestrator 是否在运行
        try:
            result = subprocess.run(
                ["pgrep", "-f", "orchestrator.py"],
                capture_output=True,
                text=True
            )
            status["orchestrator_running"] = result.returncode == 0
            if status["orchestrator_running"]:
                status["orchestrator_pid"] = result.stdout.strip().split('\n')[0]
        except:
            pass
        
        # 检查开发服务器
        try:
            result = subprocess.run(
                ["curl", "-s", "http://localhost:3000"],
                capture_output=True,
                timeout=2
            )
            status["dev_server_running"] = result.returncode == 0
        except:
            pass
        
        # 读取状态文件
        if self.state_file.exists():
            try:
                with open(self.state_file) as f:
                    state = json.load(f)
                    status["current_task"] = state.get("current")
                    completed = len(state.get("completed", []))
                    failed = len(state.get("failed", []))
                    
                    # 读取 PRD 获取总数
                    prd_file = self.work_dir / "prd.json"
                    if prd_file.exists():
                        with open(prd_file) as p:
                            data = json.load(p)
                            total = len(data.get("userStories", []))
                            status["progress"] = {
                                "completed": completed,
                                "failed": failed,
                                "total": total,
                                "percentage": round((completed / total * 100), 1) if total > 0 else 0
                            }
            except Exception as e:
                status["errors"].append(f"State file error: {e}")
        
        # 读取最近日志
        log_file = self.log_dir / "orchestrator.log"
        if log_file.exists():
            try:
                with open(log_file) as f:
                    lines = f.readlines()
                    status["recent_logs"] = lines[-20:]  # 最后20行
            except:
                pass
        
        # 检查错误日志
        error_log = self.log_dir / "errors.log"
        if error_log.exists():
            try:
                with open(error_log) as f:
                    status["errors"].extend(f.readlines()[-5:])
            except:
                pass
        
        return status
    
    def display_status(self):
        """显示状态"""
        status = self.get_system_status()
        
        print("\n" + "=" * 80)
        print("🤖 全自动编码系统 - 状态监控".center(80))
        print("=" * 80)
        print()
        
        # 系统状态
        print("📊 系统状态")
        print("-" * 80)
        print(f"  时间: {status['timestamp']}")
        
        orch_icon = "🟢" if status["orchestrator_running"] else "🔴"
        server_icon = "🟢" if status["dev_server_running"] else "🔴"
        
        print(f"  {orch_icon} Orchestrator: {'运行中' if status['orchestrator_running'] else '已停止'}")
        if status.get("orchestrator_pid"):
            print(f"     PID: {status['orchestrator_pid']}")
        print(f"  {server_icon} 开发服务器: {'运行中' if status['dev_server_running'] else '已停止'} (http://localhost:3000)")
        print()
        
        # 进度
        print("📈 任务进度")
        print("-" * 80)
        
        progress = status["progress"]
        bar_length = 50
        filled = int(bar_length * progress["percentage"] / 100)
        bar = "█" * filled + "░" * (bar_length - filled)
        
        print(f"  完成: {progress['completed']}/{progress['total']} ({progress['percentage']}%)")
        print(f"  |{bar}|")
        print(f"  ✅ 成功: {progress['completed']}  ❌ 失败: {progress['failed']}")
        print()
        
        # 当前任务
        print("📝 当前任务")
        print("-" * 80)
        if status["current_task"]:
            print(f"  正在执行: {status['current_task']}")
        else:
            print("  无正在执行的任务")
        print()
        
        # 最近日志
        print("📋 最近日志 (最后 10 行)")
        print("-" * 80)
        logs = status["recent_logs"][-10:] if status["recent_logs"] else []
        if logs:
            for log in logs:
                line = log.rstrip()
                if len(line) > 75:
                    line = line[:72] + "..."
                print(f"  {line}")
        else:
            print("  暂无日志")
        print()
        
        # 错误
        if status["errors"]:
            print("❌ 错误")
            print("-" * 80)
            for error in status["errors"][-3:]:
                line = error.rstrip()
                if len(line) > 75:
                    line = line[:72] + "..."
                print(f"  {line}")
            print()
        
        # 快速命令
        print("💡 快速命令")
        print("-" * 80)
        print("  启动系统:     python3 orchestrator.py --daemon 60")
        print("  开发服务器:   npm run dev")
        print("  查看日志:     tail -f .auto-coder/orchestrator.log")
        print("  质量检查:     ./quality_check.sh")
        print("  停止系统:     pkill -f orchestrator.py")
        print()
        print("=" * 80)

def main():
    monitor = SystemMonitor()
    
    if len(sys.argv) > 1 and sys.argv[1] == "--watch":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 5
        print(f"\n启动监控模式 (每 {interval} 秒刷新)...")
        print("按 Ctrl+C 停止\n")
        try:
            while True:
                monitor.display_status()
                time.sleep(interval)
        except KeyboardInterrupt:
            print("\n\n监控已停止")
    else:
        monitor.display_status()

if __name__ == "__main__":
    main()
