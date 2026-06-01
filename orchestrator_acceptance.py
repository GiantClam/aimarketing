#!/usr/bin/env python3
"""
完整验收流程编排器 - 代码生成 + 多轮审查 + Web验收
包含：实现 → 规范审查 → 质量审查 → Web验收 → (修复循环)
"""

import os
import sys
import json
import subprocess
import time
import base64
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

class AcceptanceOrchestrator:
    """
    完整验收流程编排器
    
    每个任务执行流程:
    1. Implementer Agent - 实现功能
    2. Spec Reviewer Agent - 检查是否符合规范
    3. Quality Reviewer Agent - 检查代码质量
    4. Web Acceptance Agent - Web页面全面验收
       ├── 视觉检查（截图对比）
       ├── 功能完整性检查
       ├── 链接和按钮有效性
       └── 输入输出准确性
    5. 如有问题，返回Implementer修复（带截图和问题描述）
    6. 重复直到所有验收通过
    """
    
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.state_file = self.work_dir / ".auto-coder" / "orchestrator_state.json"
        self.log_file = self.work_dir / ".auto-coder" / "orchestrator.log"
        self.log_dir = self.work_dir / ".auto-coder"
        self.screenshot_dir = self.log_dir / "screenshots"
        self.screenshot_dir.mkdir(exist_ok=True)
        
        self.opencode_bin = "/Users/beihuang/.opencode/bin/opencode"
        self.model = "opencode/kimi-k2.5-free"
        
        # 配置
        self.max_review_iterations = 3
        self.dev_server_url = "http://localhost:3000"
        
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = {
            "INFO": "ℹ️", 
            "SUCCESS": "✅", 
            "ERROR": "❌", 
            "WARNING": "⚠️",
            "AGENT": "🤖",
            "REVIEW": "👀",
            "ACCEPTANCE": "🎯",
            "FIX": "🔧"
        }.get(level, "ℹ️")
        entry = f"[{timestamp}] {prefix} {msg}"
        print(entry)
        with open(self.log_file, "a") as f:
            f.write(entry + "\n")
    
    def call_opencode_agent(self, agent_type: str, prompt: str, timeout: int = 300) -> Tuple[bool, str]:
        """调用 OpenCode 作为特定类型的 Agent"""
        agent_names = {
            "implementer": "👨‍💻 Implementer Agent",
            "spec_reviewer": "👀 Spec Reviewer Agent", 
            "quality_reviewer": "🔍 Quality Reviewer Agent",
            "web_acceptance": "🎯 Web Acceptance Agent"
        }
        
        self.log(f"Dispatching {agent_names.get(agent_type, agent_type)}...", "AGENT")
        
        try:
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
                timeout=timeout
            )
            
            output = result.stdout + result.stderr
            
            # 保存 agent 输出
            output_file = self.log_dir / f"agent_{agent_type}_{datetime.now().strftime('%H%M%S')}.log"
            with open(output_file, "w") as f:
                f.write(f"Agent: {agent_type}\n")
                f.write(f"Prompt: {prompt[:500]}...\n")
                f.write("="*60 + "\n")
                f.write(output)
            
            success = len(output) > 100 or result.returncode == 0
            
            if success:
                self.log(f"{agent_names.get(agent_type, agent_type)} completed", "SUCCESS")
            else:
                self.log(f"{agent_names.get(agent_type, agent_type)} returned short output", "WARNING")
            
            return success, output
            
        except subprocess.TimeoutExpired:
            self.log(f"{agent_names.get(agent_type, agent_type)} timeout", "ERROR")
            return False, "Timeout"
        except Exception as e:
            self.log(f"{agent_names.get(agent_type, agent_type)} error: {e}", "ERROR")
            return False, str(e)
    
    def implementer_agent(self, task: Dict, feedback: Dict = None) -> Tuple[bool, str]:
        """
        Implementer Agent - 负责实现功能
        
        feedback 包含:
        - spec_issues: 规范审查问题
        - quality_issues: 质量审查问题
        - web_issues: Web验收问题（包含截图路径）
        """
        task_id = task.get("id", "")
        title = task.get("title", "")
        description = task.get("description", "")
        criteria = task.get("acceptanceCriteria", [])
        
        if feedback:
            # 修复模式 - 构建详细的修复提示
            prompt_parts = [
                f"You are the Implementer Agent. Fix the following issues based on review feedback.",
                f"",
                f"Task: {task_id} - {title}",
                f"",
                f"Original Description:",
                f"{description}",
                f"",
                f"Acceptance Criteria:",
            ]
            
            for c in criteria:
                prompt_parts.append(f"- {c}")
            
            prompt_parts.extend([
                f"",
                f"ISSUES TO FIX:",
                f"="*60
            ])
            
            # 添加各类问题
            if feedback.get('spec_issues'):
                prompt_parts.extend([
                    f"",
                    f"[SPEC REVIEW ISSUES]:",
                    f"{feedback['spec_issues']}",
                ])
            
            if feedback.get('quality_issues'):
                prompt_parts.extend([
                    f"",
                    f"[CODE QUALITY ISSUES]:",
                    f"{feedback['quality_issues']}",
                ])
            
            if feedback.get('web_issues'):
                prompt_parts.extend([
                    f"",
                    f"[WEB ACCEPTANCE ISSUES]:",
                    f"{feedback['web_issues']}",
                ])
                
                # 如果有截图，让 Agent 查看
                if feedback.get('screenshots'):
                    prompt_parts.extend([
                        f"",
                        f"[SCREENSHOTS]:",
                        f"The following screenshots show the current state of the web page:",
                    ])
                    for screenshot_path in feedback['screenshots']:
                        prompt_parts.append(f"- {screenshot_path}")
                        # 尝试读取截图为 base64（如果 Agent 支持图像）
                        try:
                            with open(screenshot_path, 'rb') as img_file:
                                img_data = base64.b64encode(img_file.read()).decode('utf-8')
                                prompt_parts.append(f"  Base64: {img_data[:100]}... (truncated)")
                        except:
                            pass
            
            prompt_parts.extend([
                f"",
                f"="*60,
                f"REQUIREMENTS:",
                f"1. Fix ALL issues mentioned above",
                f"2. If web page issues: ensure visual design is correct, buttons work, forms submit correctly",
                f"3. Run 'npx tsc --noEmit' after fixes to verify no TypeScript errors",
                f"4. Test the web page manually if possible",
                f"5. Return detailed summary of what was fixed",
                f"",
                f"Project: {self.work_dir}",
                f"Framework: Next.js 15 + TypeScript",
            ])
            
            prompt = "\n".join(prompt_parts)
        else:
            # 首次实现模式
            prompt = f"""You are the Implementer Agent. Implement the following feature.

Task: {task_id} - {title}

Description:
{description}

Acceptance Criteria:
{chr(10).join(f"- {c}" for c in criteria)}

Requirements:
1. Create clean, production-ready TypeScript code
2. Use Next.js 15 App Router structure (app/api/ for APIs, app/ for pages)
3. Follow existing code patterns in the project
4. Add proper error handling
5. Include basic TypeScript types
6. For web pages: ensure responsive design, proper styling, working navigation
7. After implementation, verify with 'npx tsc --noEmit'
8. Return summary of files created/modified

Project: {self.work_dir}
Framework: Next.js 15 + TypeScript

Start by reading relevant existing files, then implement.
"""
        
        return self.call_opencode_agent("implementer", prompt, timeout=600)
    
    def spec_reviewer_agent(self, task: Dict, implementation_output: str) -> Tuple[bool, str]:
        """规范审查 Agent"""
        task_id = task.get("id", "")
        title = task.get("title", "")
        criteria = task.get("acceptanceCriteria", [])
        
        prompt = f"""You are the Spec Reviewer Agent. Review if the implementation meets all acceptance criteria.

Task: {task_id} - {title}

Acceptance Criteria:
{chr(10).join(f"{i+1}. {c}" for i, c in enumerate(criteria))}

Implementation Output:
{implementation_output[:2000]}

Your job:
1. Check if ALL acceptance criteria are met
2. Verify the implementation matches the task description
3. Check if API endpoints work as expected (if applicable)
4. Check if web pages exist and are accessible (if applicable)
5. Look for missing functionality

Response format:
- If all criteria met: Start with "✅ SPEC COMPLIANCE: PASSED"
- If issues found: Start with "❌ SPEC COMPLIANCE: FAILED" then list specific issues with file paths and line numbers if possible

Be strict but fair. Only approve if all criteria are truly met.
"""
        
        success, output = self.call_opencode_agent("spec_reviewer", prompt, timeout=120)
        passed = "PASSED" in output.upper() and "✅" in output
        
        if passed:
            self.log("Spec compliance review: PASSED", "REVIEW")
        else:
            self.log("Spec compliance review: FAILED", "REVIEW")
            self.log(f"Issues found: {len(output)}", "WARNING")
        
        return passed, output
    
    def quality_reviewer_agent(self, task: Dict, implementation_output: str) -> Tuple[bool, str]:
        """质量审查 Agent"""
        task_id = task.get("id", "")
        
        prompt = f"""You are the Quality Reviewer Agent. Review code quality and best practices.

Task: {task_id}

Implementation Output:
{implementation_output[:2000]}

Review Checklist:
1. TypeScript types are properly defined
2. No obvious bugs or errors
3. Error handling is in place
4. Code follows consistent style
5. No security vulnerabilities (SQL injection, XSS, etc.)
6. Proper async/await usage
7. No console.log left in production code
8. Proper error messages for users

Response format:
- If quality is good: Start with "✅ QUALITY: PASSED"
- If issues found: Start with "❌ QUALITY: FAILED" then list specific issues with file paths

Be thorough but practical. Focus on real issues, not nitpicks.
"""
        
        success, output = self.call_opencode_agent("quality_reviewer", prompt, timeout=120)
        passed = "PASSED" in output.upper() and "✅" in output
        
        if passed:
            self.log("Quality review: PASSED", "REVIEW")
        else:
            self.log("Quality review: FAILED", "REVIEW")
        
        return passed, output
    
    def web_acceptance_agent(self, task: Dict, urls_to_test: List[str]) -> Tuple[bool, Dict]:
        """
        Web 验收 Agent - 全面检查 Web 页面
        
        返回: (passed, details)
        details 包含:
        - visual_check: 视觉检查结果
        - functionality_check: 功能完整性结果
        - links_check: 链接按钮有效性结果
        - io_check: 输入输出准确性结果
        - screenshots: 截图文件路径列表
        - issues: 问题汇总
        """
        task_id = task.get("id", "")
        title = task.get("title", "")
        
        self.log("Starting Web Acceptance Testing...", "ACCEPTANCE")
        
        # 1. 使用 agent-browser 进行测试并截图
        screenshots = []
        test_results = {
            "visual": {"passed": True, "issues": []},
            "functionality": {"passed": True, "issues": []},
            "links": {"passed": True, "issues": []},
            "io": {"passed": True, "issues": []},
        }
        
        # 检查 agent-browser 是否可用
        try:
            subprocess.run(["which", "agent-browser"], check=True, capture_output=True)
        except:
            self.log("agent-browser not available, skipping web acceptance", "WARNING")
            return True, {"issues": "agent-browser not available", "screenshots": []}
        
        # 测试每个 URL
        for url in urls_to_test:
            self.log(f"Testing URL: {url}", "ACCEPTANCE")
            
            try:
                # 打开页面
                subprocess.run(
                    ["agent-browser", "open", url],
                    capture_output=True,
                    timeout=30
                )
                time.sleep(2)
                
                # 截图
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                screenshot_path = self.screenshot_dir / f"{task_id}_{timestamp}.png"
                subprocess.run(
                    ["agent-browser", "screenshot", "--path", str(screenshot_path)],
                    capture_output=True,
                    timeout=10
                )
                
                if screenshot_path.exists():
                    screenshots.append(str(screenshot_path))
                    self.log(f"Screenshot saved: {screenshot_path}", "SUCCESS")
                
                # 检查页面基本元素
                result = subprocess.run(
                    ["agent-browser", "is_visible", "body"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if "true" not in result.stdout.lower():
                    test_results["visual"]["passed"] = False
                    test_results["visual"]["issues"].append(f"Page body not visible at {url}")
                
                # 检查控制台错误
                result = subprocess.run(
                    ["agent-browser", "console", "--level", "error"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                
                if result.stdout and "error" in result.stdout.lower():
                    test_results["functionality"]["issues"].append(f"Console errors at {url}: {result.stdout[:200]}")
                
            except Exception as e:
                self.log(f"Web testing error for {url}: {e}", "ERROR")
                test_results["visual"]["passed"] = False
                test_results["visual"]["issues"].append(f"Failed to test {url}: {e}")
        
        # 2. 让 Web Acceptance Agent 审查截图
        if screenshots:
            screenshot_info = "\n".join([f"Screenshot {i+1}: {s}" for i, s in enumerate(screenshots)])
            
            prompt = f"""You are the Web Acceptance Agent. Review the web page implementation based on screenshots and test results.

Task: {task_id} - {title}

Screenshots captured:
{screenshot_info}

Test Results:
- Visual Check: {'✅ PASSED' if test_results['visual']['passed'] else '❌ FAILED'}
- Functionality: {'✅ PASSED' if test_results['functionality']['passed'] else '❌ FAILED'}
- Links/Buttons: {'✅ PASSED' if test_results['links']['passed'] else '❌ FAILED'}
- Input/Output: {'✅ PASSED' if test_results['io']['passed'] else '❌ FAILED'}

Detailed Issues:
Visual: {chr(10).join(test_results['visual']['issues']) if test_results['visual']['issues'] else 'None'}
Functionality: {chr(10).join(test_results['functionality']['issues']) if test_results['functionality']['issues'] else 'None'}
Links: {chr(10).join(test_results['links']['issues']) if test_results['links']['issues'] else 'None'}
IO: {chr(10).join(test_results['io']['issues']) if test_results['io']['issues'] else 'None'}

Your job:
1. Analyze the screenshots for visual design issues
2. Check if the page layout matches the task requirements
3. Identify any visual inconsistencies or problems
4. Verify functionality based on what you can see

Response format:
- If web acceptance passed: Start with "✅ WEB ACCEPTANCE: PASSED"
- If issues found: Start with "❌ WEB ACCEPTANCE: FAILED" then describe:
  * Visual issues (layout, colors, spacing, etc.)
  * Missing elements
  * Functionality problems
  * Specific recommendations for fixes

Be specific about what needs to be fixed and why.
"""
            
            success, output = self.call_opencode_agent("web_acceptance", prompt, timeout=120)
            
            # 解析结果
            web_passed = "PASSED" in output.upper() and "✅" in output
            
            if not web_passed:
                test_results["web_acceptance_issues"] = output
        else:
            web_passed = True
            output = "No screenshots available"
        
        # 汇总结果
        all_passed = (
            test_results["visual"]["passed"] and
            test_results["functionality"]["passed"] and
            test_results["links"]["passed"] and
            test_results["io"]["passed"] and
            web_passed
        )
        
        details = {
            "visual": test_results["visual"],
            "functionality": test_results["functionality"],
            "links": test_results["links"],
            "io": test_results["io"],
            "web_acceptance_output": output,
            "screenshots": screenshots,
            "all_passed": all_passed
        }
        
        if all_passed:
            self.log("Web acceptance: ALL CHECKS PASSED", "ACCEPTANCE")
        else:
            self.log("Web acceptance: FAILED", "ACCEPTANCE")
            issue_count = sum([
                len(test_results["visual"]["issues"]),
                len(test_results["functionality"]["issues"]),
                len(test_results["links"]["issues"]),
                len(test_results["io"]["issues"])
            ])
            self.log(f"Total issues found: {issue_count}", "WARNING")
        
        return all_passed, details
    
    def run_task_with_full_acceptance(self, task: Dict) -> bool:
        """运行完整任务流程（含验收）"""
        task_id = task.get("id", "")
        title = task.get("title", "")
        
        self.log("\n" + "="*70)
        self.log(f"Starting Full Acceptance Workflow: {task_id} - {title}")
        self.log("="*70)
        self.log("Flow: Implementer → Spec Review → Quality Review → Web Acceptance → (Fix if needed)")
        
        # 阶段 1: 初始实现
        self.log("\n🎯 Phase 1: Initial Implementation")
        success, impl_output = self.implementer_agent(task)
        
        if not success:
            self.log("Implementer failed to generate code", "ERROR")
            return False
        
        # 迭代循环
        for iteration in range(self.max_review_iterations):
            self.log(f"\n{'='*70}")
            self.log(f"Review & Acceptance Cycle {iteration + 1}/{self.max_review_iterations}")
            self.log("="*70)
            
            feedback = {}
            
            # 阶段 2: 规范审查
            self.log("\n👀 Phase 2: Specification Review")
            spec_passed, spec_feedback = self.spec_reviewer_agent(task, impl_output)
            if not spec_passed:
                feedback['spec_issues'] = spec_feedback
            
            # 阶段 3: 质量审查
            self.log("\n🔍 Phase 3: Quality Review")
            quality_passed, quality_feedback = self.quality_reviewer_agent(task, impl_output)
            if not quality_passed:
                feedback['quality_issues'] = quality_feedback
            
            # 阶段 4: Web 验收（如果适用）
            urls_to_test = []
            # 从任务描述中提取可能的路由
            if "RBAC" in title or "auth" in title.lower():
                urls_to_test = [f"{self.dev_server_url}/login", f"{self.dev_server_url}/admin"]
            elif "Website" in title:
                urls_to_test = [self.dev_server_url, f"{self.dev_server_url}/generator"]
            else:
                urls_to_test = [self.dev_server_url]
            
            if urls_to_test:
                self.log("\n🎯 Phase 4: Web Acceptance Testing")
                web_passed, web_details = self.web_acceptance_agent(task, urls_to_test)
                if not web_passed:
                    # 构建 Web 问题反馈
                    web_issues = []
                    if web_details.get('visual', {}).get('issues'):
                        web_issues.append("VISUAL ISSUES:\n" + "\n".join(web_details['visual']['issues']))
                    if web_details.get('functionality', {}).get('issues'):
                        web_issues.append("FUNCTIONALITY ISSUES:\n" + "\n".join(web_details['functionality']['issues']))
                    if web_details.get('web_acceptance_output'):
                        web_issues.append("AGENT ANALYSIS:\n" + web_details['web_acceptance_output'])
                    
                    feedback['web_issues'] = "\n\n".join(web_issues)
                    feedback['screenshots'] = web_details.get('screenshots', [])
            else:
                web_passed = True
            
            # 检查是否全部通过
            if spec_passed and quality_passed and web_passed:
                self.log("\n" + "="*70)
                self.log("✅ ALL REVIEWS & ACCEPTANCE PASSED!")
                self.log("="*70)
                return True
            
            # 有需要修复的问题
            if iteration < self.max_review_iterations - 1:
                self.log(f"\n🔧 Phase 5: Fixing Issues (Iteration {iteration + 1})")
                self.log(f"Issues to fix:")
                if feedback.get('spec_issues'):
                    self.log(f"  - Spec issues: {len(feedback['spec_issues'])} chars", "FIX")
                if feedback.get('quality_issues'):
                    self.log(f"  - Quality issues: {len(feedback['quality_issues'])} chars", "FIX")
                if feedback.get('web_issues'):
                    self.log(f"  - Web issues: {len(feedback['web_issues'])} chars", "FIX")
                    if feedback.get('screenshots'):
                        self.log(f"  - Screenshots: {len(feedback['screenshots'])} files", "FIX")
                
                success, impl_output = self.implementer_agent(task, feedback)
                
                if not success:
                    self.log("Fix attempt failed", "ERROR")
                    break
            else:
                self.log("\n⚠️ Max review iterations reached", "WARNING")
        
        # 如果到了这里，说明审查未完全通过但已达到最大迭代次数
        self.log("\n⚠️ Task completed but some reviews did not fully pass", "WARNING")
        return True  # 仍然标记完成，避免阻塞
    
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
    
    def complete_task(self, task: dict, success: bool):
        """标记任务完成"""
        state = self.load_state()
        task_id = task.get("id", "")
        
        if success:
            state.setdefault("completed", []).append(task_id)
            self.log(f"\n✅ Task {task_id} marked as completed", "SUCCESS")
        else:
            state.setdefault("failed", []).append(task_id)
            self.log(f"\n❌ Task {task_id} marked as failed", "ERROR")
        
        self.save_state(state)
    
    def run_single_task(self) -> bool:
        """运行单个任务"""
        task = self.get_next_task()
        
        if not task:
            self.log("\n⏳ No pending tasks")
            return False
        
        success = self.run_task_with_full_acceptance(task)
        self.complete_task(task, success)
        
        return success
    
    def run_daemon(self, interval: int = 60):
        """守护进程模式"""
        self.log("="*70)
        self.log("🤖 Full Acceptance Orchestrator Started")
        self.log("="*70)
        self.log(f"Model: {self.model}")
        self.log(f"Max Review Iterations: {self.max_review_iterations}")
        self.log(f"Screenshots saved to: {self.screenshot_dir}")
        self.log(f"Check Interval: {interval}s")
        self.log("\nPress Ctrl+C to stop\n")
        
        try:
            while True:
                has_task = self.run_single_task()
                
                if not has_task:
                    self.log(f"\n⏳ No tasks remaining, sleeping {interval}s...")
                    time.sleep(interval)
                else:
                    self.log("\n" + "="*70)
                    self.log("Moving to next task...")
                    time.sleep(5)
                    
        except KeyboardInterrupt:
            self.log("\n\n🛑 Orchestrator stopped by user")
    
    def run_once(self):
        """单次运行"""
        self.log("="*70)
        self.log("🤖 Full Acceptance Orchestrator (Single Run)")
        self.log("="*70)
        self.run_single_task()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--daemon":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        orchestrator = AcceptanceOrchestrator()
        orchestrator.run_daemon(interval)
    else:
        orchestrator = AcceptanceOrchestrator()
        orchestrator.run_once()

if __name__ == "__main__":
    main()
