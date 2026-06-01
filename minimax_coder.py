#!/usr/bin/env python3
"""
MiniMax M2.1 Direct Coder
直接调用 MiniMax API 实现自动化编程
"""

import os
import sys
import json
import subprocess
import requests
from datetime import datetime
from pathlib import Path

class MiniMaxCoder:
    def __init__(self):
        self.api_key = os.getenv("NVIDIA_API_KEY", "")
        self.api_base = "https://integrate.api.nvidia.com/v1"
        self.model = "minimaxai/minimax-m2.1"
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.log_file = self.work_dir / ".auto-coder" / "minimax_logs.txt"
        self.log_file.parent.mkdir(exist_ok=True)
        
    def log(self, msg):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        entry = f"[{timestamp}] {msg}"
        print(entry)
        with open(self.log_file, "a") as f:
            f.write(entry + "\n")
    
    def chat(self, prompt: str, max_tokens: int = 2048) -> str:
        """调用 MiniMax API"""
        if not self.api_key:
            return self.mock_response(prompt)
        
        url = f"{self.api_base}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        data = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": "You are an expert AI programmer. Write clean, production-ready code."},
                {"role": "user", "content": prompt}
            ],
            "max_tokens": max_tokens,
            "temperature": 0.1
        }
        
        try:
            resp = requests.post(url, headers=headers, json=data, timeout=120)
            resp.raise_for_status()
            result = resp.json()
            content = result["choices"][0]["message"]["content"]
            self.log(f"API response received: {len(content)} chars")
            return content
        except Exception as e:
            self.log(f"API error: {e}")
            return self.mock_response(prompt)
    
    def mock_response(self, prompt: str) -> str:
        """Mock 响应"""
        self.log(f"[MOCK] Would implement: {prompt[:100]}...")
        return f"# Mock implementation for: {prompt[:50]}..."
    
    def extract_code(self, response: str) -> str:
        """从响应中提取代码"""
        # 简单的提取逻辑
        lines = response.split("\n")
        code_lines = []
        in_code = False
        
        for line in lines:
            if "```" in line:
                in_code = not in_code
                continue
            if in_code:
                code_lines.append(line)
        
        return "\n".join(code_lines) if code_lines else response
    
    def implement(self, task_description: str, output_file: str = None) -> bool:
        """实现功能"""
        self.log(f"🚀 Implementing: {task_description}")
        
        prompt = f"""
Write a Next.js API route or TypeScript code for the following task:

Task: {task_description}

Requirements:
- Use Next.js 15 + TypeScript
- Follow REST API best practices
- Return JSON responses
- Handle errors properly

Project location: {self.work_dir}

Start by reading existing files if needed, then write the implementation.
"""
        
        response = self.chat(prompt)
        
        # 保存响应
        response_file = self.work_dir / ".auto-coder" / f"response_{datetime.now().strftime('%Y%m%d_%H%M%S')}.txt"
        with open(response_file, "w") as f:
            f.write(response)
        self.log(f"Response saved to: {response_file}")
        
        return True
    
    def run_task(self, task_id: str, task_title: str, task_desc: str) -> bool:
        """运行任务"""
        self.log(f"📋 Running task: {task_id} - {task_title}")
        
        prompt = f"""
Implement the following feature for AI Marketing Platform:

Task ID: {task_id}
Title: {task_title}
Description: {task_desc}

Requirements:
1. Use Next.js 15 + TypeScript
2. Create API routes in app/api/ directory
3. Follow existing code patterns
4. Return proper error handling
5. Write clean, production-ready code

Current project: {self.work_dir}

Start by reading relevant files, then implement the changes.
"""
        
        response = self.chat(prompt, max_tokens=4096)
        
        # 保存实现结果
        impl_file = self.work_dir / ".auto-coder" / f"impl_{task_id}.txt"
        with open(impl_file, "w") as f:
            f.write(response)
        
        self.log(f"✅ Task {task_id} completed. Response: {impl_file}")
        return True

def main():
    if len(sys.argv) < 2:
        print("Usage: python minimax_coder.py <task_description>")
        print("       python minimax_coder.py --task <id> <title> <description>")
        sys.exit(1)
    
    coder = MiniMaxCoder()
    
    if sys.argv[1] == "--task" and len(sys.argv) >= 5:
        task_id = sys.argv[2]
        title = sys.argv[3]
        desc = sys.argv[4]
        coder.run_task(task_id, title, desc)
    else:
        task = " ".join(sys.argv[1:])
        coder.implement(task)

if __name__ == "__main__":
    main()
