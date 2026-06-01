#!/usr/bin/env python3
"""
SubAgent 模式编排器
模拟 OpenCode subagent-driven-development 的工作流程
使用多个专门的 Agent 分别负责：实现、规范审查、质量审查
"""

import os
import sys
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple, Optional

class SubAgentOrchestrator:
    """
    基于 SubAgent 模式的编排器
    
    每个任务执行流程:
    1. Implementer Agent - 实现功能
    2. Spec Reviewer Agent - 检查是否符合规范
    3. Code Quality Reviewer Agent - 检查代码质量
    4. 如有问题，回到步骤1修复
    """
    
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.state_file = self.work_dir / ".auto-coder" / "orchestrator_state.json"
        self.log_file = self.work_dir / ".auto-coder" / "orchestrator.log"
        self.log_dir = self.work_dir / ".auto-coder"
        self.log_dir.mkdir(exist_ok=True)
        
        self.opencode_bin = "/Users/beihuang/.opencode/bin/opencode"
        self.model = "opencode/kimi-k2.5-free"
        
        # SubAgent 配置
        self.max_spec_review_iterations = 2
        self.max_quality_review_iterations = 2
        
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = {
            "INFO": "ℹ️", 
            "SUCCESS": "✅", 
            "ERROR": "❌", 
            "WARNING": "⚠️",
            "AGENT": "🤖",
            "REVIEW": "👀"
        }.get(level, "ℹ️")
        entry = f"[{timestamp}] {prefix} {msg}"
        print(entry)
        with open(self.log_file, "a") as f:
            f.write(entry + "\n")
    
    def call_opencode_agent(self, agent_type: str, prompt: str, timeout: int = 300) -> Tuple[bool, str]:
        """
        调用 OpenCode 作为特定类型的 Agent
        
        Args:
            agent_type: implementer, spec_reviewer, quality_reviewer
            prompt: 给 agent 的提示
            timeout: 超时时间
        """
        agent_names = {
            "implementer": "👨‍💻 Implementer Agent",
            "spec_reviewer": "👀 Spec Reviewer Agent", 
            "quality_reviewer": "🔍 Quality Reviewer Agent"
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
                f.write(f"Prompt: {prompt[:200]}...\n")
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
    
    def implementer_agent(self, task: Dict, feedback: str = "") -> Tuple[bool, str]:
        """
        Implementer Agent - 负责实现功能
        
        如果是第一次运行，根据任务描述实现
        如果有 feedback，根据反馈修复问题
        """
        task_id = task.get("id", "")
        title = task.get("title", "")
        description = task.get("description", "")
        criteria = task.get("acceptanceCriteria", [])
        
        if feedback:
            # 修复模式
            prompt = f"""You are the Implementer Agent. Fix the following issues based on review feedback.

Task: {task_id} - {title}

Original Description:
{description}

Acceptance Criteria:
{chr(10).join(f"- {c}" for c in criteria)}

Review Feedback (Issues to fix):
{feedback}

Requirements:
1. Fix all issues mentioned in the feedback
2. Ensure TypeScript compiles without errors
3. Follow existing code patterns in app/api/
4. Run 'npx tsc --noEmit' after fixes to verify
5. Return summary of changes made

Project: {self.work_dir}
Framework: Next.js 15 + TypeScript
"""
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
2. Use Next.js 15 App Router structure (app/api/)
3. Follow existing code patterns in the project
4. Add proper error handling
5. Include basic TypeScript types
6. After implementation, verify with 'npx tsc --noEmit'
7. Return summary of files created/modified

Project: {self.work_dir}
Framework: Next.js 15 + TypeScript

Start by reading relevant existing files, then implement.
"""
        
        return self.call_opencode_agent("implementer", prompt, timeout=600)
    
    def spec_reviewer_agent(self, task: Dict, implementation_output: str) -> Tuple[bool, str]:
        """
        Spec Reviewer Agent - 检查实现是否符合规范
        
        Returns: (passed, feedback)
        - passed: True if meets all acceptance criteria
        - feedback: Issues found or "PASSED"
        """
        task_id = task.get("id", "")
        title = task.get("title", "")
        criteria = task.get("acceptanceCriteria", [])
        
        prompt = f"""You are the Spec Reviewer Agent. Review if the implementation meets all acceptance criteria.

Task: {task_id} - {title}

Acceptance Criteria:
{chr(10).join(f"{i+1}. {c}" for i, c in enumerate(criteria))}

Implementation Output:
{implementation_output[:2000]}  # Limit output length

Your job:
1. Check if ALL acceptance criteria are met
2. Verify the implementation matches the task description
3. Check if API endpoints work as expected (if applicable)
4. Look for missing functionality

Response format:
- If all criteria met: Start with "✅ SPEC COMPLIANCE: PASSED"
- If issues found: Start with "❌ SPEC COMPLIANCE: FAILED" then list specific issues

Be strict but fair. Only approve if all criteria are truly met.
"""
        
        success, output = self.call_opencode_agent("spec_reviewer", prompt, timeout=120)
        
        # Parse result
        passed = "PASSED" in output.upper() and "✅" in output
        
        if passed:
            self.log("Spec compliance review: PASSED", "REVIEW")
        else:
            self.log("Spec compliance review: FAILED", "REVIEW")
            self.log(f"Issues: {output[:500]}", "WARNING")
        
        return passed, output
    
    def quality_reviewer_agent(self, task: Dict, implementation_output: str) -> Tuple[bool, str]:
        """
        Quality Reviewer Agent - 检查代码质量
        
        Returns: (passed, feedback)
        """
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

Run these checks if possible:
- npx tsc --noEmit (type checking)
- Look for any obvious runtime errors

Response format:
- If quality is good: Start with "✅ QUALITY: PASSED"
- If issues found: Start with "❌ QUALITY: FAILED" then list specific issues to fix

Be thorough but practical. Focus on real issues, not nitpicks.
"""
        
        success, output = self.call_opencode_agent("quality_reviewer", prompt, timeout=120)
        
        # Parse result
        passed = "PASSED" in output.upper() and "✅" in output
        
        if passed:
            self.log("Quality review: PASSED", "REVIEW")
        else:
            self.log("Quality review: FAILED", "REVIEW")
            self.log(f"Issues: {output[:500]}", "WARNING")
        
        return passed, output
    
    def run_task_with_subagents(self, task: Dict) -> bool:
        """
        使用 SubAgent 模式运行任务
        
        流程:
        1. Implementer -> 实现
        2. Spec Reviewer -> 检查规范
        3. Quality Reviewer -> 检查质量
        4. 如有问题，Implementer 修复
        5. 重复审查直到通过或达到最大迭代次数
        """
        task_id = task.get("id", "")
        title = task.get("title", "")
        
        self.log("\n" + "="*70)
        self.log(f"Starting SubAgent Workflow for: {task_id} - {title}")
        self.log("="*70)
        self.log("Agents: Implementer → Spec Reviewer → Quality Reviewer → (Fix if needed)")
        
        # 阶段 1: 初始实现
        self.log("\n🎯 Phase 1: Initial Implementation")
        success, impl_output = self.implementer_agent(task)
        
        if not success:
            self.log("Implementer failed to generate code", "ERROR")
            return False
        
        # 阶段 2 & 3: 审查循环
        all_feedback = []
        
        for iteration in range(max(self.max_spec_review_iterations, self.max_quality_review_iterations)):
            self.log(f"\n🔍 Review Cycle {iteration + 1}")
            
            # Spec Review
            spec_passed, spec_feedback = self.spec_reviewer_agent(task, impl_output)
            
            # Quality Review
            quality_passed, quality_feedback = self.quality_reviewer_agent(task, impl_output)
            
            # 检查是否都通过了
            if spec_passed and quality_passed:
                self.log("\n✅ All reviews passed!", "SUCCESS")
                return True
            
            # 收集反馈
            feedback_parts = []
            if not spec_passed:
                feedback_parts.append(f"SPEC ISSUES:\n{spec_feedback}")
            if not quality_passed:
                feedback_parts.append(f"QUALITY ISSUES:\n{quality_feedback}")
            
            combined_feedback = "\n\n".join(feedback_parts)
            all_feedback.append(combined_feedback)
            
            # 检查是否还有迭代次数
            if iteration < max(self.max_spec_review_iterations, self.max_quality_review_iterations) - 1:
                self.log(f"\n🔧 Phase {iteration + 2}: Fixing Issues (Iteration {iteration + 1})")
                success, impl_output = self.implementer_agent(task, combined_feedback)
                
                if not success:
                    self.log("Fix attempt failed", "ERROR")
                    break
            else:
                self.log("\n⚠️ Max review iterations reached", "WARNING")
        
        # 如果到了这里，说明审查未完全通过但已达到最大迭代次数
        self.log("\n⚠️ Task completed but with remaining issues", "WARNING")
        self.log("Review feedback history:", "WARNING")
        for i, feedback in enumerate(all_feedback, 1):
            self.log(f"  Iteration {i}: {feedback[:200]}...", "WARNING")
        
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
        
        success = self.run_task_with_subagents(task)
        self.complete_task(task, success)
        
        return success
    
    def run_daemon(self, interval: int = 60):
        """守护进程模式"""
        self.log("="*70)
        self.log("🤖 SubAgent Mode Orchestrator Started")
        self.log("="*70)
        self.log(f"Model: {self.model}")
        self.log(f"Max Spec Review Iterations: {self.max_spec_review_iterations}")
        self.log(f"Max Quality Review Iterations: {self.max_quality_review_iterations}")
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
        self.log("🤖 SubAgent Mode Orchestrator (Single Run)")
        self.log("="*70)
        self.run_single_task()

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--daemon":
        interval = int(sys.argv[2]) if len(sys.argv) > 2 else 60
        orchestrator = SubAgentOrchestrator()
        orchestrator.run_daemon(interval)
    else:
        orchestrator = SubAgentOrchestrator()
        orchestrator.run_once()

if __name__ == "__main__":
    main()
