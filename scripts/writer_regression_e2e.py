from pathlib import Path
from time import sleep, time
import os
import urllib.request
from urllib.error import HTTPError

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://localhost:3123").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-regression"
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


def wait_for_generated_writer_assets(page, timeout_ms: int = 180000):
    deadline = time() + (timeout_ms / 1000)
    preview = page.locator('[role="dialog"]').first

    while time() < deadline:
        image_count = preview.locator('img[src^="http"], img[src^="https"]').count()
        ready_downloads = preview.locator("button:not([disabled])").filter(
            has=preview.locator("svg.lucide-download")
        ).count()
        if image_count >= 1 or ready_downloads >= 1:
            return
        page.wait_for_timeout(1500)

    raise AssertionError("preview drawer missing generated image assets after waiting")


def ensure_preview_dialog(page, timeout_ms: int = 120000):
    preview_dialog = page.locator('[role="dialog"]').first
    preview_button = page.get_by_role("button", name="预览")
    deadline = time() + timeout_ms / 1000

    while time() < deadline:
        if preview_dialog.is_visible():
            return preview_dialog
        if preview_button.is_enabled():
            preview_button.click()
            preview_dialog.wait_for(state="visible", timeout=timeout_ms)
            return preview_dialog
        page.wait_for_timeout(300)

    if preview_dialog.is_visible():
        return preview_dialog
    raise AssertionError("preview dialog did not become visible in time")


def wait_for_url_contains(page, fragment: str, timeout_ms: int = 30000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if fragment in page.url:
            return
        page.wait_for_timeout(300)
    raise AssertionError(f"url did not contain {fragment!r}: {page.url}")


def wait_for_writer_history(page, timeout_ms: int = 45000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if page.locator('aside a[href*="/dashboard/writer/"]').count() >= 1:
            return
        page.wait_for_timeout(500)
    raise AssertionError("writer history did not render in time")


def login(context, page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    save_debug(page, "00-login")

    login_response = context.request.post(f"{BASE_URL}/api/auth/demo", timeout=90000)
    if not login_response.ok:
        login_response = context.request.post(
            f"{BASE_URL}/api/auth/login",
            timeout=90000,
            headers={"Content-Type": "application/json"},
            data='{"email":"demo@example.com","password":"demo123456"}',
        )

    expect(login_response.ok, f"login failed: {login_response.status}")
    page.goto(f"{BASE_URL}/dashboard", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


def assert_wechat_article_structure(preview_dialog):
    article_root = preview_dialog.locator("div.prose").first
    article_text = article_root.inner_text()

    expect(preview_dialog.locator("h1").count() == 1, "wechat preview should contain exactly one H1 title")

    banned_markers = [
        "标题备选",
        "备选标题",
        "Title options",
        "Publishing notes",
        "Image notes",
        "发布说明",
        "发布建议",
        "配图说明",
    ]
    for marker in banned_markers:
        expect(marker not in article_text, f"wechat preview should not contain meta section: {marker}")

    expect(preview_dialog.locator("strong").count() >= 1, "wechat preview should preserve bold markdown")
    expect(preview_dialog.locator("blockquote").count() >= 1, "wechat preview should preserve quote markdown")
    expect(preview_dialog.locator("ul, ol").count() >= 1, "wechat preview should preserve list markdown")


def assert_no_critical_console_errors(console_errors):
    critical_errors = [
        error
        for error in console_errors
        if "Failed to load resource" not in error
        and "404" not in error
        and "favicon" not in error
        and "AbortError" not in error
        and 'An empty string ("") was passed to the src attribute' not in error
    ]
    expect(not critical_errors, f"critical console errors found: {critical_errors[:5]}")


wait_until_http_ready()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    page = context.new_page()
    page.set_default_timeout(90000)
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    try:
        login(context, page)

        page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_writer_workspace_ready(page)
        save_debug(page, "01-writer-home")

        selects = page.locator("select:visible")
        expect(selects.count() >= 3, "writer page should render platform, mode, and language selects")
        selects.nth(0).select_option("wechat")
        page.wait_for_timeout(400)
        selects.nth(1).select_option("article")
        page.wait_for_timeout(400)
        selects.nth(2).select_option("zh")
        page.wait_for_timeout(400)
        save_debug(page, "02-wechat-article-mode")

        input_box = page.locator("textarea:visible").first
        input_box.fill(
            "写一篇公众号文章，主题是 AI 创业团队如何避免内容空转。请使用 Markdown 输出，包含一个主标题、至少两个二级标题、一个引用块、一个加粗重点和一个项目符号列表，语言专业，给出实际建议。"
        )

        send_button = page.locator("button:visible").filter(has=page.locator("svg.lucide-send")).last
        expect(send_button.is_enabled(), "writer send button should be enabled after input")
        send_button.click()

        wait_for_url_contains(page, "/dashboard/writer/", timeout_ms=180000)
        page.wait_for_timeout(8000)
        page.wait_for_load_state("networkidle", timeout=90000)
        save_debug(page, "03-after-send")

        preview_dialog = ensure_preview_dialog(page)
        preview_dialog.get_by_role("button", name="确认文案并生成配图").click()
        wait_for_generated_writer_assets(page)
        expect(
            preview_dialog.locator('img[src^="http"], img[src^="https"]').count() >= 1,
            "wechat preview should show generated images",
        )
        assert_wechat_article_structure(preview_dialog)
        save_debug(page, "04-wechat-preview")

        expect(page.locator("div.prose").count() >= 1, "writer page should render markdown message bubbles")
        expect(page.locator('aside a[href*="/dashboard/writer/"]').count() >= 1, "writer history should render at least one conversation link")

        session_url = page.url
        page.goto(session_url, timeout=90000, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        wait_for_writer_workspace_ready(page)
        wait_for_writer_history(page)
        save_debug(page, "05-session-reload")

        page.goto(f"{BASE_URL}/dashboard/copywriting", timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_url_contains(page, "/dashboard/writer", timeout_ms=15000)
        save_debug(page, "06-copywriting-redirect")

        page.goto(f"{BASE_URL}/dashboard/advisor/copywriting/new", timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_url_contains(page, "/dashboard/writer", timeout_ms=15000)
        save_debug(page, "07-advisor-copywriting-redirect")

        assert_no_critical_console_errors(console_errors)
        print("writer_regression_e2e: PASS")
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        try:
            save_debug(page, "99-failure")
        except Exception:
            pass
        raise error
    finally:
        browser.close()
