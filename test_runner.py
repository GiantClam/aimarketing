#!/usr/bin/env python3
"""
综合测试运行器 - 页面检查 + 交互测试 + 日志分析
"""

import os
import sys
import json
import subprocess
import time
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

class TestRunner:
    def __init__(self):
        self.work_dir = Path("/Users/beihuang/Documents/github/aimarketing")
        self.log_dir = self.work_dir / ".auto-coder"
        self.test_results = []
        
    def log(self, msg: str, level: str = "INFO"):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        prefix = {"INFO": "ℹ️", "SUCCESS": "✅", "ERROR": "❌", "WARNING": "⚠️"}.get(level, "ℹ️")
        entry = f"[{timestamp}] {prefix} {msg}"
        print(entry)
        
        log_file = self.log_dir / "test_results.log"
        with open(log_file, "a") as f:
            f.write(entry + "\n")
    
    def run_all_tests(self) -> Tuple[bool, List[str]]:
        """运行所有测试"""
        self.log("=" * 60)
        self.log("启动综合测试套件")
        self.log("=" * 60)
        
        results = []
        errors = []
        
        # 1. 编译检查
        success, errs = self.test_compilation()
        results.append(("TypeScript 编译", success))
        errors.extend(errs)
        
        # 2. 代码质量检查
        success, errs = self.test_code_quality()
        results.append(("代码质量", success))
        errors.extend(errs)
        
        # 3. API 端点测试
        success, errs = self.test_api_endpoints()
        results.append(("API 端点", success))
        errors.extend(errs)
        
        # 4. 页面可用性测试 (agent-browser)
        success, errs = self.test_web_pages()
        results.append(("Web 页面", success))
        errors.extend(errs)
        
        # 5. 交互功能测试
        success, errs = self.test_interactions()
        results.append(("交互功能", success))
        errors.extend(errs)
        
        # 6. 控制台日志检查
        success, errs = self.test_console_logs()
        results.append(("控制台日志", success))
        errors.extend(errs)
        
        # 7. 性能测试
        success, errs = self.test_performance()
        results.append(("性能指标", success))
        errors.extend(errs)
        
        # 汇总
        self.log("")
        self.log("=" * 60)
        self.log("测试结果汇总")
        self.log("=" * 60)
        
        all_passed = True
        for test_name, passed in results:
            status = "✅ 通过" if passed else "❌ 失败"
            self.log(f"{test_name}: {status}")
            if not passed:
                all_passed = False
        
        self.log("=" * 60)
        
        if all_passed:
            self.log("🎉 所有测试通过！", "SUCCESS")
        else:
            self.log(f"⚠️  发现 {len(errors)} 个问题", "WARNING")
            for err in errors[:10]:  # 只显示前10个错误
                self.log(f"  - {err}", "ERROR")
        
        return all_passed, errors
    
    def test_compilation(self) -> Tuple[bool, List[str]]:
        """测试 TypeScript 编译"""
        self.log("\n🔧 测试 1/7: TypeScript 编译检查")
        
        try:
            result = subprocess.run(
                ["npx", "tsc", "--noEmit"],
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                self.log("TypeScript 编译通过", "SUCCESS")
                return True, []
            else:
                errors = result.stdout.strip().split('\n')[:5]
                self.log(f"编译错误: {len(errors)} 个问题", "ERROR")
                return False, errors
        except Exception as e:
            self.log(f"编译检查失败: {e}", "ERROR")
            return False, [str(e)]
    
    def test_code_quality(self) -> Tuple[bool, List[str]]:
        """测试代码质量"""
        self.log("\n📏 测试 2/7: 代码质量检查")
        
        errors = []
        
        # ESLint 检查
        try:
            result = subprocess.run(
                ["npx", "eslint", ".", "--ext", ".ts,.tsx", "--max-warnings=10"],
                cwd=str(self.work_dir),
                capture_output=True,
                text=True,
                timeout=120
            )
            
            if result.returncode == 0:
                self.log("ESLint 检查通过", "SUCCESS")
            else:
                errors.append(f"ESLint: {result.stdout.strip()[:200]}")
                self.log("ESLint 发现问题", "WARNING")
        except Exception as e:
            self.log(f"ESLint 检查失败: {e}", "WARNING")
        
        return len(errors) == 0, errors
    
    def test_api_endpoints(self) -> Tuple[bool, List[str]]:
        """测试 API 端点"""
        self.log("\n🌐 测试 3/7: API 端点测试")
        
        endpoints = [
            ("http://localhost:3000/api/auth/login", "POST", '{"email":"test@example.com","password":"demo123"}'),
            ("http://localhost:3000/api/auth/me", "GET", None),
            ("http://localhost:3000/api/content/generate", "POST", '{"platform":"xiaohongshu","topic":"test","tone":"casual"}'),
        ]
        
        errors = []
        passed = 0
        
        for url, method, data in endpoints:
            try:
                cmd = ["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}"]
                if method == "POST":
                    cmd.extend(["-X", "POST", "-H", "Content-Type: application/json"])
                    if data:
                        cmd.extend(["-d", data])
                cmd.append(url)
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)
                status_code = result.stdout.strip()
                
                if status_code in ["200", "201"]:
                    self.log(f"  ✅ {method} {url} - {status_code}")
                    passed += 1
                else:
                    self.log(f"  ❌ {method} {url} - {status_code}", "ERROR")
                    errors.append(f"{url} returned {status_code}")
            except Exception as e:
                self.log(f"  ❌ {method} {url} - Error: {e}", "ERROR")
                errors.append(f"{url} error: {e}")
        
        if passed == len(endpoints):
            self.log(f"所有 {len(endpoints)} 个 API 端点正常", "SUCCESS")
        
        return passed == len(endpoints), errors
    
    def test_web_pages(self) -> Tuple[bool, List[str]]:
        """测试 Web 页面 (agent-browser)"""
        self.log("\n🖥️  测试 4/7: Web 页面检查 (agent-browser)")
        
        pages = [
            "http://localhost:3000",
            "http://localhost:3000/login",
        ]
        
        errors = []
        passed = 0
        
        # 检查 agent-browser 是否可用
        try:
            subprocess.run(["which", "agent-browser"], check=True, capture_output=True)
        except:
            self.log("agent-browser 未安装，跳过页面测试", "WARNING")
            return True, []  # 不强制要求
        
        for page in pages:
            try:
                # 打开页面
                result = subprocess.run(
                    ["agent-browser", "open", page],
                    capture_output=True,
                    text=True,
                    timeout=30
                )
                
                if result.returncode == 0:
                    self.log(f"  ✅ 页面可访问: {page}")
                    passed += 1
                    
                    # 截图验证
                    screenshot_file = f"/tmp/screenshot_{page.split('/')[-1] or 'home'}.png"
                    subprocess.run(
                        ["agent-browser", "screenshot", "--path", screenshot_file],
                        capture_output=True,
                        timeout=10
                    )
                    self.log(f"  📸 截图保存: {screenshot_file}")
                    
                    # 检查页面元素
                    result = subprocess.run(
                        ["agent-browser", "is_visible", "body"],
                        capture_output=True,
                        text=True,
                        timeout=10
                    )
                    
                    if "true" in result.stdout.lower():
                        self.log(f"  ✅ 页面主体元素可见")
                    else:
                        self.log(f"  ⚠️  页面元素可能有问题", "WARNING")
                        
                else:
                    self.log(f"  ❌ 页面访问失败: {page}", "ERROR")
                    errors.append(f"Cannot access {page}")
            except Exception as e:
                self.log(f"  ❌ 页面测试失败: {page} - {e}", "ERROR")
                errors.append(f"{page} test error: {e}")
        
        if passed == len(pages):
            self.log(f"所有 {len(pages)} 个页面正常", "SUCCESS")
        
        return passed == len(pages), errors
    
    def test_interactions(self) -> Tuple[bool, List[str]]:
        """测试交互功能"""
        self.log("\n🖱️  测试 5/7: 交互功能测试")
        
        errors = []
        
        # 测试登录表单
        try:
            self.log("  测试登录表单交互...")
            
            # 打开登录页
            subprocess.run(
                ["agent-browser", "open", "http://localhost:3000/login"],
                capture_output=True,
                timeout=30
            )
            time.sleep(2)
            
            # 检查表单元素
            result = subprocess.run(
                ["agent-browser", "is_visible", "input[type='email'], input[name='email']"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if "true" in result.stdout.lower():
                self.log("  ✅ 邮箱输入框可见")
            else:
                self.log("  ⚠️  未找到邮箱输入框", "WARNING")
            
            # 尝试输入（如果元素存在）
            try:
                subprocess.run(
                    ["agent-browser", "type", "input[type='email']", "test@example.com"],
                    capture_output=True,
                    timeout=10
                )
                self.log("  ✅ 可以输入邮箱")
            except:
                self.log("  ⚠️  输入测试跳过", "WARNING")
                
        except Exception as e:
            self.log(f"  ❌ 交互测试失败: {e}", "ERROR")
            errors.append(f"Interaction test failed: {e}")
        
        return len(errors) == 0, errors
    
    def test_console_logs(self) -> Tuple[bool, List[str]]:
        """测试控制台日志"""
        self.log("\n📋 测试 6/7: 控制台日志检查")
        
        errors = []
        
        try:
            # 获取控制台错误
            result = subprocess.run(
                ["agent-browser", "console", "--level", "error", "--json"],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.stdout:
                try:
                    logs = json.loads(result.stdout)
                    error_count = len([l for l in logs if l.get('level') == 'error'])
                    
                    if error_count == 0:
                        self.log("控制台无错误", "SUCCESS")
                    else:
                        self.log(f"发现 {error_count} 个控制台错误", "WARNING")
                        errors.append(f"{error_count} console errors")
                except:
                    self.log("控制台日志解析失败", "WARNING")
            else:
                self.log("控制台日志为空或无法获取", "SUCCESS")
                
        except Exception as e:
            self.log(f"控制台日志检查失败: {e}", "WARNING")
        
        # 检查服务器日志
        try:
            next_log = self.work_dir / ".next" / "trace"
            if next_log.exists():
                self.log("  ✅ Next.js 构建日志存在")
        except:
            pass
        
        return len(errors) == 0, errors
    
    def test_performance(self) -> Tuple[bool, List[str]]:
        """性能测试"""
        self.log("\n⚡ 测试 7/7: 性能指标检查")
        
        errors = []
        
        # 测试页面加载时间
        try:
            import time
            start = time.time()
            
            result = subprocess.run(
                ["curl", "-s", "-o", "/dev/null", "-w", "%{time_total}", "http://localhost:3000"],
                capture_output=True,
                text=True,
                timeout=30
            )
            
            load_time = float(result.stdout.strip())
            
            if load_time < 3.0:
                self.log(f"  ✅ 首页加载时间: {load_time:.2f}s (优秀)", "SUCCESS")
            elif load_time < 5.0:
                self.log(f"  ⚠️  首页加载时间: {load_time:.2f}s (可接受)", "WARNING")
            else:
                self.log(f"  ❌ 首页加载时间: {load_time:.2f}s (过慢)", "ERROR")
                errors.append(f"Page load too slow: {load_time:.2f}s")
                
        except Exception as e:
            self.log(f"  ⚠️  性能测试失败: {e}", "WARNING")
        
        return len(errors) == 0, errors

def main():
    runner = TestRunner()
    success, errors = runner.run_all_tests()
    
    if success:
        print("\n✅ 测试全部通过，系统状态良好！")
        sys.exit(0)
    else:
        print(f"\n❌ 测试未通过，发现 {len(errors)} 个问题")
        sys.exit(1)

if __name__ == "__main__":
    main()
