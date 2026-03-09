from pathlib import Path
from time import sleep, time
import os
import sys
import urllib.request

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3100")
SCREENSHOT_DIR = Path("tests/screenshots")
SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)


def assert_text(page, text: str, timeout_ms: int = 30000):
    page.locator(f"text={text}").first.wait_for(timeout=timeout_ms)


def wait_until_http_ready(timeout_seconds: int = 90):
    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/login", timeout=10) as response:
                html = response.read().decode("utf-8", errors="ignore")
                if response.status == 200 and "欢迎回来" in html:
                    return
        except Exception as error:
            last_error = error
        sleep(1)

    raise RuntimeError(f"application did not become ready: {last_error}")


def fill_register_form(page):
    suffix = str(int(time()))
    company_name = f"自动化测试企业{suffix}"
    email = f"autotest_{suffix}@example.com"
    password = "Passw0rd!234"

    page.goto(f"{BASE_URL}/register", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")

    page.locator("#name").fill("自动化测试用户")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    page.locator("#confirmPassword").fill(password)
    page.locator("#enterpriseName").fill(company_name)

    with page.expect_response("**/api/auth/register", timeout=90000) as register_response:
        page.get_by_role("button", name="创建账号并创建企业").click()

    response = register_response.value
    if not response.ok:
        raise AssertionError(f"注册接口失败: {response.status} {response.text()}")

    page.wait_for_function(
        "() => window.location.pathname === '/dashboard' || window.location.pathname === '/dashboard/settings'",
        timeout=90000,
    )
    page.wait_for_load_state("networkidle")

    return {
        "company_name": company_name,
        "email": email,
        "password": password,
    }


def main():
    wait_until_http_ready()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(45000)

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        try:
            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            assert_text(page, "欢迎回来")
            assert_text(page, "返回首页")
            assert page.get_by_role("button", name="一键体验登录").count() == 0, "生产回归默认不应展示 demo 登录"

            account = fill_register_form(page)

            assert_text(page, "企业级营销工作台")
            assert_text(page, "用户设置")
            assert_text(page, "视频生成 Agent")
            assert_text(page, "网站生成 Agent")

            page.goto(f"{BASE_URL}/dashboard/settings", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            assert_text(page, "用户设置")
            settings_html = page.content()
            assert account["company_name"] in settings_html, "设置页未展示企业名称"
            assert account["email"] in settings_html, "设置页未展示邮箱"

            page.goto(f"{BASE_URL}/dashboard/video", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            assert_text(page, "视频生成 Agent")
            page.get_by_placeholder("输入您的回答或选择上面的选项...").wait_for(timeout=30000)

            page.goto(f"{BASE_URL}/dashboard/website-generator", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            assert_text(page, "网站生成 Agent")
            page.get_by_placeholder("描述你想要的网站需求...").wait_for(timeout=30000)

            for removed_path in ["/dashboard/templates", "/dashboard/n8n/connections", "/dashboard/tasks", "/dashboard/generate", "/dashboard/knowledge-base"]:
                page.goto(f"{BASE_URL}{removed_path}", wait_until="domcontentloaded")
                page.wait_for_load_state("networkidle")
                current_url = page.url.rstrip("/")
                if current_url != f"{BASE_URL}/dashboard":
                    raise AssertionError(f"{removed_path} 未正确跳转，当前地址: {current_url}")

            page.goto(f"{BASE_URL}/dashboard/settings", wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle")
            page.get_by_role("button", name="退出登录").click()
            page.wait_for_function("() => window.location.pathname === '/login'", timeout=30000)
            assert_text(page, "欢迎回来")

            non_ignorable = [
                error
                for error in console_errors
                if "Failed to load resource" not in error and "404" not in error and "favicon" not in error
            ]

            print("COMMERCIAL_SMOKE_OK")
            print("created_account:", account["email"])
            print("console_error_count:", len(non_ignorable))
            if non_ignorable:
                print("console_error_samples:", non_ignorable[:5])
                raise AssertionError("浏览器控制台存在未忽略错误")
        except (AssertionError, PlaywrightTimeoutError, Exception) as error:
            screenshot_path = SCREENSHOT_DIR / "commercial-smoke-failure.png"
            try:
                page.screenshot(path=str(screenshot_path), full_page=True)
            except Exception:
                pass
            print("COMMERCIAL_SMOKE_FAILED:", error)
            print("failure_screenshot:", screenshot_path)
            browser.close()
            sys.exit(1)

        browser.close()


if __name__ == "__main__":
    main()
