#!/usr/bin/env python3
"""
GitHub Integrated Auto Coder
自动创建 GitHub Issues 作为任务队列
"""

import os
import sys
import json
import requests
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

class GitHubCoder:
    def __init__(self):
        # Read from environment
        self.token = os.environ.get("GITHUB_TOKEN", os.getenv("GITHUB_TOKEN", ""))
        self.repo = os.environ.get("GITHUB_REPO", os.getenv("GITHUB_REPO", ""))
        
        if not self.token or not self.repo:
            print("❌ Missing GITHUB_TOKEN or GITHUB_REPO")
            sys.exit(1)
        
        self.api_base = "https://api.github.com"
        
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        }
        
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
    
    def create_issue(self, title: str, body: str, labels: List[str] = None) -> Optional[Dict]:
        """创建 GitHub Issue"""
        url = f"{self.api_base}/repos/{self.repo}/issues"
        data = {
            "title": title,
            "body": body,
            "labels": labels or ["auto-code"]
        }
        
        try:
            resp = requests.post(url, headers=self.headers, json=data)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            print(f"❌ Failed to create issue: {e}")
            return None
    
    def get_issues(self, state: str = "open", labels: str = None) -> List[Dict]:
        """获取 Issues"""
        url = f"{self.api_base}/repos/{self.repo}/issues"
        params = {"state": state, "per_page": 50}
        if labels:
            params["labels"] = labels
        
        try:
            resp = requests.get(url, headers=self.headers, params=params)
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            print(f"❌ Failed to get issues: {e}")
            return []
    
    def close_issue(self, issue_number: int) -> bool:
        """关闭 Issue"""
        url = f"{self.api_base}/repos/{self.repo}/issues/{issue_number}"
        try:
            resp = requests.patch(url, headers=self.headers, json={"state": "closed"})
            resp.raise_for_status()
            return True
        except Exception as e:
            print(f"❌ Failed to close issue: {e}")
            return False
    
    def add_comment(self, issue_number: int, body: str) -> bool:
        """添加评论"""
        url = f"{self.api_base}/repos/{self.repo}/issues/{issue_number}/comments"
        try:
            resp = requests.post(url, headers=self.headers, json={"body": body})
            resp.raise_for_status()
            return True
        except Exception as e:
            print(f"❌ Failed to add comment: {e}")
            return False
    
    def sync_tasks_from_prd(self):
        """从 prd.json 同步任务到 GitHub Issues"""
        prd_file = self.work_dir / "prd.json"
        
        if not prd_file.exists():
            print("❌ prd.json not found")
            return
        
        with open(prd_file) as f:
            data = json.load(f)
        
        # 获取现有 auto-code issues
        existing = self.get_issues(labels="auto-code")
        existing_titles = set()
        for i in existing:
            # Issues API returns both issues and PRs, filter by checking for 'pull_request' key
            if "pull_request" not in i:
                title = i.get("title", "")
                existing_titles.add(title)
        
        created = 0
        for story in data.get("userStories", []):
            task_id = story.get("id", "")
            title = story.get("title", "")
            desc = story.get("description", "")
            full_title = f"{task_id}: {title}"
            
            if full_title in existing_titles:
                print(f"⏭️  Skipped (exists): {full_title}")
                continue
            
            # 跳过已完成的
            if story.get("passes", False):
                print(f"⏭️  Skipped (completed): {full_title}")
                continue
            
            body = f"""
## Task: {title}

**ID:** {task_id}

**Description:**
{desc}

## Acceptance Criteria
"""
            for ac in story.get("acceptanceCriteria", []):
                body += f"- [ ] {ac}\n"
            
            result = self.create_issue(full_title, body, labels=["auto-code"])
            if result:
                print(f"✅ Created: {full_title}")
                created += 1
        
        print(f"\n📊 Created {created} new issues")
    
    def list_tasks(self):
        """列出所有任务 Issues"""
        issues = self.get_issues(labels="auto-code")
        
        # Filter out pull requests
        issues = [i for i in issues if "pull_request" not in i]
        
        print("\n📋 GitHub Issues Tasks")
        print("=" * 60)
        
        for issue in issues:
            title = issue["title"]
            num = issue["number"]
            state = "✅" if issue["state"] == "closed" else "⏳"
            print(f"{state} #{num}: {title}")
        
        print("-" * 60)
        open_count = sum(1 for i in issues if i["state"] == "open")
        print(f"Open: {open_count}, Closed: {len(issues) - open_count}")

def main():
    coder = GitHubCoder()
    
    if len(sys.argv) < 2:
        coder.list_tasks()
        return
    
    cmd = sys.argv[1]
    
    if cmd == "sync":
        print("🔄 Syncing tasks from prd.json to GitHub Issues...")
        coder.sync_tasks_from_prd()
    
    elif cmd == "list":
        coder.list_tasks()
    
    elif cmd == "create":
        if len(sys.argv) < 4:
            print("Usage: python github_coder.py create <title> <body>")
            sys.exit(1)
        title = sys.argv[2]
        body = sys.argv[3]
        coder.create_issue(title, body)
    
    elif cmd == "close":
        if len(sys.argv) < 3:
            print("Usage: python github_coder.py close <issue_number>")
            sys.exit(1)
        coder.close_issue(int(sys.argv[2]))
    
    else:
        print("Commands:")
        print("  sync    - Sync tasks from prd.json to GitHub Issues")
        print("  list    - List all task issues")
        print("  create  - Create a new issue")
        print("  close   - Close an issue")

if __name__ == "__main__":
    main()
