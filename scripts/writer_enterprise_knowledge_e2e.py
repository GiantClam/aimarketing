from pathlib import Path
from time import sleep, time
import os
import urllib.request
from urllib.error import HTTPError

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://localhost:3123").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-enterprise"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


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


def wait_for_url_contains(page, fragment: str, timeout_ms: int = 30000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if fragment in page.url:
            return
        page.wait_for_timeout(300)
    raise AssertionError(f"url did not contain {fragment!r}: {page.url}")


def login(context, page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)

    login_response = context.request.post(f"{BASE_URL}/api/auth/demo", timeout=90000)
    if not login_response.ok:
        login_response = context.request.post(
            f"{BASE_URL}/api/auth/login",
            timeout=90000,
            headers={"Content-Type": "application/json"},
            data='{"email":"demo@example.com","password":"demo123456"}',
        )

    expect(login_response.ok, f"login failed: {login_response.status}")
    page.goto(f"{BASE_URL}/dashboard/settings", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


def ensure_dataset_enabled(page, dataset_name: str, scope_value: str):
    title = page.locator("span.block.font-medium", has_text=dataset_name).first
    expect(title.count() == 1, f"dataset row missing: {dataset_name}")
    label = title.locator("xpath=ancestor::label[1]")
    checkbox = label.locator('input[type="checkbox"]').first
    if not checkbox.is_checked():
        checkbox.check()
    row = label.locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
    row.locator("select").first.select_option(scope_value)


wait_until_http_ready()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    page = context.new_page()
    page.set_default_timeout(90000)

    try:
        login(context, page)
        save_debug(page, "00-settings")

        dify_card = page.locator("div").filter(has=page.get_by_text("Dify 企业知识库")).first
        expect(dify_card.count() >= 1, "settings page missing Dify enterprise knowledge card")

        page.get_by_label("Dify API Base URL").fill("https://fixture.dify.local/v1")
        page.get_by_label("Dify API Key").fill("fixture-key")
        enterprise_toggle = page.locator("label").filter(has_text="启用企业知识增强写作").locator('input[type="checkbox"]').first
        if not enterprise_toggle.is_checked():
            enterprise_toggle.check()
        page.get_by_role("button", name="测试并拉取知识库").click()
        page.get_by_text("已拉取 3 个 Dify 知识库。").wait_for(timeout=30000)

        ensure_dataset_enabled(page, "品牌手册", "brand")
        ensure_dataset_enabled(page, "产品资料", "product")
        ensure_dataset_enabled(page, "案例资料", "case-study")
        page.get_by_role("button", name="保存 Dify 配置").click()
        page.get_by_text("Dify 企业知识配置已保存。").wait_for(timeout=30000)
        save_debug(page, "01-dify-saved")

        page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_writer_workspace_ready(page)
        save_debug(page, "02-writer-home")

        expect(page.get_by_text("企业知识 3").count() >= 1, "writer header should show enabled enterprise knowledge count")

        selects = page.locator("select:visible")
        selects.nth(0).select_option("wechat")
        page.wait_for_timeout(200)
        selects.nth(1).select_option("article")
        page.wait_for_timeout(200)
        selects.nth(2).select_option("zh")
        page.wait_for_timeout(200)

        page.locator("textarea:visible").first.fill("写一篇公众号文章，主题是 AI 销售自动化如何提升线索转化效率。")
        page.locator("button:visible").filter(has=page.locator("svg.lucide-send")).last.click()

        wait_for_url_contains(page, "/dashboard/writer/", timeout_ms=180000)
        page.wait_for_timeout(6000)
        page.wait_for_load_state("networkidle", timeout=90000)
        save_debug(page, "03-writer-generated")

        prose = page.locator("div.prose").last
        article_text = prose.inner_text()
        expect("AI 外呼与线索转化自动化平台" in article_text, "writer draft should include product knowledge from enterprise Dify datasets")
        expect("销售线索成本降低 32%" in article_text, "writer draft should include case-study knowledge from enterprise Dify datasets")
        print("writer_enterprise_knowledge_e2e: PASS")
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        try:
          save_debug(page, "99-failure")
        except Exception:
          pass
        raise error
    finally:
        browser.close()
