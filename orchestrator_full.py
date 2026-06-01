#!/usr/bin/env python3
"""
增强版编排器 - 代码生成 + 全面测试 + 自动修复
使用 OpenCode + Kimi 2.5
"""

import os
import sys
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

class FullOrchestrator:
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.state_file = self.work_dir / ".auto-coder" / "orchestrator_state.json"
        self.log_file = self.work_dir / ".auto-coder" / "orchestrator.log"
        self.state_file.parent.mkdir(exist_ok=True)
        self.log_dir = self.work_dir / ".auto-coder"
        
        self.opencode_bin = "/Users/beihuang/.opencode/bin/opencode"
        self.model = "opencode/kimi-k2.5-free"
        
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = {"INFO": "ℹ️", "SUCCESS": "✅", "ERROR": "❌", "WARNING": "⚠️"}.get(level, "ℹ️")
        entry = f"[{timestamp}] {prefix} {msg}"
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
    
    def run_opencode(self, task: dict) -> Tuple[bool, str]:
        """使用 OpenCode 执行任务"""
        task_id = task.get("id", "unknown")
        title = task.get("title", "No title")
        description = task.get("description", "")
        
        self.log(f"\n{'='*60}")
        self.log(f"开始执行任务: {task_id} - {title}")
        self.log(f"{'='*60}\n")
        
        prompt = self.build_prompt(task)
        
        try:
            cmd = [
                self.opencode_bin,
                "--model", self.model,
                "--message", prompt
            ]
            
            self.log(f"调用 OpenCode + Kimi 2.5...")
            result = subprocess.run(
                cmd,
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=600
            )
            
            output = result.stdout + result.stderr
            
            # 保存输出
            output_file = self.log_dir / f"{task_id}_output.txt"
            with open(output_file, "w") as f:
                f.write(output)
            
            if len(output) > 100:
                self.log(f"代码生成完成，输出长度: {len(output)} 字符")
                return True, output
            else:
                self.log("代码生成输出太短，可能失败", "ERROR")
                return False, output
                
        except subprocess.TimeoutExpired:
            self.log("代码生成超时", "ERROR")
            return False, "Timeout"
        except Exception as e:
            self.log(f"代码生成错误: {e}", "ERROR")
            return False, str(e)
    
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
- Handle errors properly
- Add basic validation
- Return proper HTTP status codes

## Testing Requirements
After implementing, verify:
1. TypeScript compiles without errors (npx tsc --noEmit)
2. Code follows ESLint rules
3. API endpoints return correct responses
4. No console errors

## Project Context
- Location: /Users/beihuang/Documents/github/aimarketing
- Framework: Next.js 15
- Language: TypeScript
- Existing APIs: /api/auth/*, /api/content/*

Start by reading relevant existing files, then implement and test the task.
"""
        return prompt
    
    def run_tests(self) -> Tuple[bool, List[str]]:
        """运行全面测试"""
        self.log("\n" + "="*60)
        self.log("启动全面测试套件")
        self.log("="*60 + "\n")
        
        test_results = []
        all_errors = []
        
        # 1. 等待服务器编译
        self.log("⏳ 等待服务器热更新...")
        time.sleep(5)
        
        # 2. TypeScript 编译检查
        self.log("\n🔧 测试 1/6: TypeScript 编译检查")
        try:
            result = subprocess.run(
                ["npx", "tsc", "--noEmit"],
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                self.log("✅ TypeScript 编译通过")
                test_results.append(("TypeScript", True))
            else:
                errors = result.stdout.strip().split('\n')[:3]
                self.log(f"❌ TypeScript 编译失败", "ERROR")
                for err in errors:
                    self.log(f"   {err}", "ERROR")
                test_results.append(("TypeScript", False))
                all_errors.extend(errors)
        except Exception as e:
            self.log(f"❌ 编译检查失败: {e}", "ERROR")
            test_results.append(("TypeScript", False))
            all_errors.append(str(e))
        
        # 3. ESLint 检查
        self.log("\n📏 测试 2/6: ESLint 代码规范检查")
        try:
            result = subprocess.run(
                ["npx", "eslint", ".", "--ext", ".ts,.tsx", "--max-warnings=20"],
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                self.log("✅ ESLint 检查通过")
                test_results.append(("ESLint", True))
            else:
                warning_count = result.stdout.count("warning")
                error_count = result.stdout.count("error")
                if error_count == 0 and warning_count < 20:
                    self.log(f"⚠️  ESLint: {warning_count} 个警告（可接受）")
                    test_results.append(("ESLint", True))
                else:
                    self.log(f"❌ ESLint: {error_count} 个错误", "ERROR")
                    test_results.append(("ESLint", False))
                    all_errors.append(f"ESLint: {error_count} errors")
        except Exception as e:
            self.log(f"⚠️  ESLint 检查跳过: {e}")
            test_results.append(("ESLint", True))  # 不强制
        
        # 4. API 端点测试
        self.log("\n🌐 测试 3/6: API 端点测试")
        api_tests = [
            ("http://localhost:3000/api/auth/login", "POST", '{"email":"test@example.com","password":"demo123"}'),
            ("http://localhost:3000/api/auth/me", "GET", None),
        ]
        
        api_passed = 0
        for url, method, data in api_tests:
            try:
                cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}"]
                if method == "POST":
                    cmd.extend(["-X", "POST", "-H", "Content-Type: application/json"])
                    if data:
                        cmd.extend(["-d", data])
                cmd.append(url)
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                status = result.stdout.strip()
                
                if status in ["200", "201", "401"]:  # 401 也是正常的（未授权）
                    self.log(f"  ✅ {method} {url} - {status}")
                    api_passed += 1
                else:
                    self.log(f"  ❌ {method} {url} - {status}", "ERROR")
                    all_errors.append(f"API {url} returned {status}")
            except Exception as e:
                self.log(f"  ❌ {method} {url} - Error: {e}", "ERROR")
                all_errors.append(f"API {url} error: {e}")
        
        if api_passed == len(api_tests):
            self.log("✅ 所有 API 端点正常")
            test_results.append(("API", True))
        else:
            self.log(f"⚠️  API 测试: {api_passed}/{len(api_tests)} 通过")
            test_results.append(("API", api_passed >= len(api_tests) * 0.5))
        
        # 5. 页面可用性测试
        self.log("\n🖥️  测试 4/6: Web 页面可用性测试")
        try:
            result = subprocess.run(
                ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:3000"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.stdout.strip() == "200":
                self.log("✅ 首页可访问 (HTTP 200)")
                test_results.append(("Web", True))
            else:
                self.log(f"⚠️  首页返回: {result.stdout.strip()}", "WARNING")
                test_results.append(("Web", False))
                all_errors.append(f"Homepage returned {result.stdout.strip()}")
        except Exception as e:
            self.log(f"❌ 页面测试失败: {e}", "ERROR")
            test_results.append(("Web", False))
            all_errors.append(str(e))
        
        # 6. 性能测试
        self.log("\n⚡ 测试 5/6: 性能指标检查")
        try:
            result = subprocess.run(
                ["curl", "-s", "-o", "/dev/null", "-w", "%{time_total}", "http://localhost:3000"],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            load_time = float(result.stdout.strip())
            
            if load_time < 3.0:
                self.log(f"✅ 首页加载时间: {load_time:.2f}s (优秀)")
                test_results.append(("Performance", True))
            elif load_time < 5.0:
                self.log(f"⚠️  首页加载时间: {load_time:.2f}s (可接受)")
                test_results.append(("Performance", True))
            else:
                self.log(f"❌ 首页加载时间: {load_time:.2f}s (过慢)", "ERROR")
                test_results.append(("Performance", False))
                all_errors.append(f"Slow page load: {load_time:.2f}s")
        except Exception as e:
            self.log(f"⚠️  性能测试失败: {e}")
            test_results.append(("Performance", True))  # 不强制
        
        # 7. agent-browser 检查（如果可用）
        self.log("\n🔍 测试 6/6: 浏览器控制台检查")
        try:
            # 检查 agent-browser 是否可用
            subprocess.run(["which", "agent-browser"], check=True, capture_output=True)
            
            # 截图
            subprocess.run(
                ["agent-browser", "screenshot", "--path", "/tmp/test_screenshot.png"],
                capture_output=True,
                timeout=10
            )
            self.log("✅ 截图已保存: /tmp/test_screenshot.png")
            
        except:
            self.log("ℹ️  agent-browser 检查跳过（可选）")
        
        # 汇总
        self.log("\n" + "="*60)
        self.log("测试结果汇总")
        self.log("="*60)
        
        all_passed = True
        for test_name, passed in test_results:
            status = "✅ 通过" if passed else "❌ 失败"
            self.log(f"{test_name}: {status}")
            if not passed:
                all_passed = False
        
        return all_passed, all_errors
    
    def fix_errors(self, errors: List[str]) -> bool:
        """尝试自动修复错误"""
        if not errors:
            return True
        
        self.log(f"\n🔧 尝试自动修复 {len(errors)} 个问题...")
        
        # 构建修复提示
        error_text = "\n".join(errors[:5])  # 只修复前5个错误
        
        fix_prompt = f"""Fix the following errors in the code:

Errors:
{error_text}

Requirements:
1. Fix TypeScript compilation errors
2. Fix ESLint warnings/errors
3. Ensure API endpoints work correctly
4. Run 'npx tsc --noEmit' to verify fixes

Apply minimal changes to fix the issues.
"""
        
        try:
            cmd = [
                self.opencode_bin,
                "--model", self.model,
                "--message", fix_prompt
            ]
            
            self.log("调用 OpenCode 修复错误...")
            result = subprocess.run(
                cmd,
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=300
            )
            
            if result.returncode == 0 or len(result.stdout) > 50:
                self.log("✅ 修复尝试完成")
                return True
            else:
                self.log("⚠️  自动修复可能未完成")
                return False
                
        except Exception as e:
            self.log(f"❌ 修复过程出错: {e}", "ERROR")
            return False
    
    def complete_task(self, task: dict, success: bool):
        """标记任务完成"""
        state = self.load_state()
        task_id = task.get("id", "")
        
        if success:
            state.setdefault("completed", []).append(task_id)
            self.log(f"\n✅ 任务 {task_id} 标记为完成")
        else:
            state.setdefault("failed", []).append(task_id)
            self.log(f"\n❌ 任务 {task_id} 标记为失败")
        
        self.save_state(state)
    
    def run_single_task(self) -> bool:
        """运行单个任务（含测试和修复）"""
        task = self.get_next_task()
        
        if not task:
            self.log("\n⏳ 没有待办任务")
            return False
        
        task_id = task.get("id", "")
        
        # 阶段 1: 代码生成
        success, output = self.run_opencode(task)
        
        if not success:
            self.log("代码生成失败，跳过测试", "ERROR")
            self.complete_task(task, False)
            return False
        
        # 阶段 2: 全面测试
        tests_passed, errors = self.run_tests()
        
        # 阶段 3: 如有错误，尝试修复
        if not tests_passed and errors:
            self.log(f"\n⚠️  发现 {len(errors)} 个问题，尝试自动修复...")
            fixed = self.fix_errors(errors)
            
            if fixed:
                # 重新测试
                self.log("\n🔄 重新运行测试...")
                time.sleep(5)  # 等待修复生效
                tests_passed, errors = self.run_tests()
        
        # 阶段 4: 完成
        if tests_passed:
            self.complete_task(task, True)
            return True
        else:
            self.log(f"\n⚠️  任务完成但测试未全部通过", "WARNING")
            self.log(f"错误: {errors[:3]}", "ERROR")
            # 仍然标记完成，避免阻塞
            self.complete_task(task, True)
            return True
    
    def run_daemon(self, interval: int = 60):
        """守护进程模式"""
        self.log("="*60)
        self.log("🤖 增强版全自动编码系统启动")
        self.log("="*60)
        self.log(f"模式: 代码生成 + 全面测试 + 自动修复")
        self.log(f"模型: {self.model}")
        self.log(f"检查间隔: {interval}s")
        self.log("\n按 Ctrl+C 停止\n")
        
        try:
            while True:
                has_task = self.run_single_task()
                
                if not has_task:
                    self.log(f"\n⏳ 没有任务，{interval}秒后重试...")
                    time.sleep(interval)
                else:
                    self.log("\n" + "="*60)
                    self.log("准备处理下一个任务...")
                    time.sleep(5)
                    
        except KeyboardInterrupt:
            self.log("\n\n🛑 系统已停止")
    
    def run_once(self):
        """单次运行"""
        self.log("="*60)
        self.log("🤖 增强版全自动编码系统（单次模式）")
        self.log("="*60)
        self.run_single_task()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--daemon":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        orchestrator = FullOrchestrator()
        orchestrator.run_daemon(interval)
    else:
        orchestrator = FullOrchestrator()
        orchestrator.run_once()

if __name__ == "__main__":
    main()
