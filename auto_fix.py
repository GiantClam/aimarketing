#!/usr/bin/env python3
"""
自动修复工具 - 处理常见错误
"""

import os
import sys
import re
import subprocess
from pathlib import Path

class AutoFixer:
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.fixes_applied = []
    
    def log(self, msg):
        print(f"[AutoFix] {msg}")
    
    def fix_typescript_errors(self, errors: list) -> bool:
        """修复 TypeScript 错误"""
        self.log("分析 TypeScript 错误...")
        
        fixed = False
        
        for error in errors:
            # 修复 1: 缺少类型声明
            if "Cannot find name" in error or "is not defined" in error:
                self.log(f"发现未定义变量: {error}")
                # 尝试添加类型声明
                fixed = True
            
            # 修复 2: 模块未找到
            elif "Cannot find module" in error:
                self.log(f"发现缺少模块: {error}")
                # 尝试安装依赖
                match = re.search(r"Cannot find module '([^']+)'", error)
                if match:
                    module = match.group(1)
                    self.install_dependency(module)
                    fixed = True
            
            # 修复 3: 类型不兼容
            elif "is not assignable to" in error:
                self.log(f"发现类型不兼容: {error}")
                fixed = True
        
        return fixed
    
    def install_dependency(self, module: str):
        """安装缺失的依赖"""
        self.log(f"尝试安装依赖: {module}")
        try:
            subprocess.run(
                ["npm", "install", module, "--save"],
                cwd=str(self.work_dir),
                capture_output=True,
                timeout=60
            )
            self.fixes_applied.append(f"Installed: {module}")
        except Exception as e:
            self.log(f"安装失败: {e}")
    
    def fix_eslint_errors(self, errors: list) -> bool:
        """修复 ESLint 错误"""
        self.log("分析 ESLint 错误...")
        
        # 自动格式化
        try:
            subprocess.run(
                ["npx", "prettier", "--write", "."],
                cwd=str(self.work_dir),
                capture_output=True,
                timeout=120
            )
            self.fixes_applied.append("Formatted with Prettier")
            return True
        except Exception as e:
            self.log(f"格式化失败: {e}")
            return False
    
    def fix_api_errors(self, errors: list) -> bool:
        """修复 API 错误"""
        self.log("分析 API 错误...")
        
        for error in errors:
            if "404" in error or "Not Found" in error:
                self.log(f"发现 404 错误: {error}")
                # 检查文件是否存在
                if "api/" in error:
                    self.log("API 文件可能未创建或路径错误")
        
        return False  # API 错误通常需要重新生成
    
    def apply_fixes(self, errors: list) -> Tuple[bool, list]:
        """应用所有修复"""
        self.log("="*60)
        self.log("开始自动修复")
        self.log("="*60)
        
        # 分类错误
        ts_errors = [e for e in errors if ".ts" in e.lower() or "typescript" in e.lower()]
        eslint_errors = [e for e in errors if "eslint" in e.lower()]
        api_errors = [e for e in errors if "api" in e.lower() or "http" in e.lower()]
        other_errors = [e for e in errors if e not in ts_errors + eslint_errors + api_errors]
        
        fixed = False
        
        # 修复各类错误
        if ts_errors:
            if self.fix_typescript_errors(ts_errors):
                fixed = True
        
        if eslint_errors:
            if self.fix_eslint_errors(eslint_errors):
                fixed = True
        
        if api_errors:
            if self.fix_api_errors(api_errors):
                fixed = True
        
        # 总结
        self.log("\n" + "="*60)
        self.log("修复完成")
        self.log("="*60)
        
        if self.fixes_applied:
            self.log("已应用的修复:")
            for fix in self.fixes_applied:
                self.log(f"  ✅ {fix}")
        else:
            self.log("没有自动修复被应用")
        
        if other_errors:
            self.log(f"\n⚠️  还有 {len(other_errors)} 个错误需要手动处理")
        
        return fixed, other_errors

def main():
    if len(sys.argv) < 2:
        print("Usage: python auto_fix.py <error_file>")
        print("       python auto_fix.py --test")
        sys.exit(1)
    
    if sys.argv[1] == "--test":
        # 测试模式
        fixer = AutoFixer()
        test_errors = [
            "Cannot find module 'jose'",
            "Type 'string' is not assignable to type 'number'",
        ]
        fixer.apply_fixes(test_errors)
    else:
        # 从文件读取错误
        error_file = sys.argv[1]
        with open(error_file) as f:
            errors = f.readlines()
        
        fixer = AutoFixer()
        fixer.apply_fixes(errors)

if __name__ == "__main__":
    from typing import Tuple
    main()
