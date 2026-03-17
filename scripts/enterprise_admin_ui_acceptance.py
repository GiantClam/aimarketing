from pathlib import Path
from time import sleep, time
import os
import urllib.request
from urllib.error import HTTPError

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://localhost:3123").strip()
ARTIFACT_DIR = Path("artifacts") / "enterprise-admin-ui"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

ACCOUNTS = [
    {
        "key": "vbuy",
        "email": os.environ.get("VBUY_ADMIN_EMAIL", "vbuy.admin@example.com"),
        "password": os.environ.get("VBUY_ADMIN_PASSWORD", "aimarketing0317"),
        "enterprise_name": "VBUY",
        "dataset_id": "bc9f5ddd-1774-49e9-ba91-41af4673c253",
    },
    {
        "key": "lingchuang",
        "email": os.environ.get("LINGCHUANG_ADMIN_EMAIL", "lingchuang.admin@example.com"),
        "password": os.environ.get("LINGCHUANG_ADMIN_PASSWORD", "aimarketing0317"),
        "enterprise_name": "灵创智能",
        "dataset_id": "302cf95a-2473-4d57-be04-401d5cfda3d6",
    },
]


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def save_debug(page, name: str):
    page.screenshot(path=str(ARTIFACT_DIR / f"{name}.png"), full_page=True)
    (ARTIFACT_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")


def wait_until_http_ready(timeout_seconds: int = 180):
    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=10) as response:
                body = response.read().decode("utf-8", errors="ignore")
                if response.status == 200 and '"ok":true' in body:
                    return
        except Exception as error:
            if isinstance(error, HTTPError) and error.code in (401, 403):
                return
            last_error = error
        sleep(1)

    raise RuntimeError(f"application did not become ready: {last_error}")


def wait_for_writer_workspace_ready(page, timeout_ms: int = 45000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        selects = page.locator("select:visible")
        textarea = page.locator("textarea:visible")
        if selects.count() >= 3 and textarea.count() >= 1:
            if (
                not selects.nth(0).is_disabled()
                and not selects.nth(1).is_disabled()
                and not selects.nth(2).is_disabled()
                and not textarea.first.is_disabled()
            ):
                return
        page.wait_for_timeout(500)
    raise AssertionError("writer workspace did not become interactive in time")


def login_via_ui(page, email: str, password: str):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    page.get_by_label("邮箱地址").fill(email)
    page.get_by_label("密码").fill(password)
    page.get_by_role("button", name="登录").click()
    page.wait_for_url(f"{BASE_URL}/dashboard", timeout=90000)
    page.wait_for_load_state("networkidle", timeout=90000)


def verify_settings(page, account: dict):
    page.goto(f"{BASE_URL}/dashboard/settings", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    enterprise_name_input = page.locator("label", has_text="企业名称").locator("xpath=following::input[1]").first
    expect(
        enterprise_name_input.input_value() == account["enterprise_name"],
        f"{account['key']}: enterprise name mismatch on settings page",
    )
    expect(page.get_by_label("Dify API Base URL").input_value() == "https://dify-api.o3-tools.com/v1", f"{account['key']}: Dify base URL mismatch")
    expect(page.get_by_text(account["dataset_id"]).count() >= 1, f"{account['key']}: dataset id not visible in settings")
    expect(page.get_by_text("已启用 1 个").count() >= 1, f"{account['key']}: enabled dataset count mismatch")
    expect(page.get_by_text("专家顾问 Dify 配置").count() >= 1, f"{account['key']}: advisor config card missing")
    expect(page.get_by_text("当前：系统默认").count() >= 2, f"{account['key']}: advisor cards should default to system config")
    expect(page.get_by_text("系统默认 Key：已配置").count() >= 2, f"{account['key']}: advisor default keys should be configured")


def verify_writer(page, account: dict):
    page.goto(f"{BASE_URL}/dashboard", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    expect(page.get_by_text("品牌战略顾问").count() >= 1, f"{account['key']}: brand advisor entry missing from dashboard")
    expect(page.get_by_text("增长顾问").count() >= 1, f"{account['key']}: growth advisor entry missing from dashboard")

    page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    wait_for_writer_workspace_ready(page)
    expect(page.get_by_text("企业知识 1").count() >= 1, f"{account['key']}: writer should show one enterprise knowledge dataset")
    expect(page.locator("textarea:visible").count() >= 1, f"{account['key']}: writer composer missing")


wait_until_http_ready()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for account in ACCOUNTS:
            context = browser.new_context(viewport={"width": 1440, "height": 1100})
            page = context.new_page()
            page.set_default_timeout(90000)
            try:
                login_via_ui(page, account["email"], account["password"])
                save_debug(page, f"{account['key']}-00-dashboard")
                verify_settings(page, account)
                save_debug(page, f"{account['key']}-01-settings")
                verify_writer(page, account)
                save_debug(page, f"{account['key']}-02-writer")
            except (AssertionError, PlaywrightTimeoutError, Exception) as error:
                try:
                    save_debug(page, f"{account['key']}-99-failure")
                except Exception:
                    pass
                raise error
            finally:
                context.close()

        print("enterprise_admin_ui_acceptance: PASS")
    finally:
        browser.close()
