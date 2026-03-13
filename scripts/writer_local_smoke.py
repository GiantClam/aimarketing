from pathlib import Path
import os
import re
from time import sleep, time
from urllib.error import HTTPError
import urllib.request

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://localhost:3123").strip()
VERCEL_BYPASS_TOKEN = os.environ.get("WRITER_TEST_BYPASS_TOKEN", "").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-smoke"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def save_debug(page, name: str):
    page.screenshot(path=str(ARTIFACT_DIR / f"{name}.png"), full_page=True)
    (ARTIFACT_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")


def with_bypass_url(url: str) -> str:
    if not VERCEL_BYPASS_TOKEN:
        return url
    separator = "&" if "?" in url else "?"
    return (
        f"{url}{separator}"
        f"x-vercel-set-bypass-cookie=true&x-vercel-protection-bypass={VERCEL_BYPASS_TOKEN}"
    )


def request_headers(content_type: str | None = None):
    headers = {}
    if VERCEL_BYPASS_TOKEN:
        headers["x-vercel-protection-bypass"] = VERCEL_BYPASS_TOKEN
    if content_type:
        headers["Content-Type"] = content_type
    return headers


def wait_until_http_ready(timeout_seconds: int = 180):
    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            request = urllib.request.Request(f"{BASE_URL}/api/health")
            if VERCEL_BYPASS_TOKEN:
                request.add_header("x-vercel-protection-bypass", VERCEL_BYPASS_TOKEN)
            with urllib.request.urlopen(request, timeout=10) as response:
                html = response.read().decode("utf-8", errors="ignore")
                if response.status == 200 and '"ok":true' in html:
                    return
        except Exception as error:
            if isinstance(error, HTTPError) and error.code in (401, 403):
                return
            last_error = error
        sleep(1)

    raise RuntimeError(f"application did not become ready: {last_error}")


def wait_for_url_contains(page, fragment: str, timeout_ms: int = 30000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if fragment in page.url:
            return
        page.wait_for_timeout(300)
    raise AssertionError(f"url did not contain {fragment!r}: {page.url}")


def wait_for_visible_input(page, timeout_ms: int = 30000):
    deadline = time() + (timeout_ms / 1000)
    last_count = 0

    while time() < deadline:
        last_count = page.locator("input:visible, textarea:visible").count()
        if last_count >= 1:
            return
        page.wait_for_timeout(500)

    raise AssertionError(f"visible chat input missing after wait: visible_inputs={last_count}")


def wait_for_writer_workspace_ready(page, timeout_ms: int = 45000):
    deadline = time() + (timeout_ms / 1000)

    while time() < deadline:
        selects = page.locator("select:visible")
        textarea = page.locator("textarea:visible")
        if selects.count() >= 2 and textarea.count() >= 1:
            if not selects.nth(0).is_disabled() and not selects.nth(1).is_disabled() and not textarea.first.is_disabled():
                return
        page.wait_for_timeout(500)

    raise AssertionError("writer workspace did not become interactive in time")


def wait_for_writer_history(page, timeout_ms: int = 45000):
    deadline = time() + (timeout_ms / 1000)

    while time() < deadline:
        if page.locator('aside a[href*="/dashboard/writer/"]').count() >= 1:
            return
        page.wait_for_timeout(500)

    raise AssertionError("writer history did not render in time")


def has_writer_sidebar_entry(page) -> bool:
    selectors = [
        'a[href="/dashboard/writer"]',
        'button:has-text("多平台图文写作")',
        'a:has-text("多平台图文写作")',
        'h3:has-text("文章写作")',
    ]
    return any(page.locator(selector).count() > 0 for selector in selectors)


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


def login(context, page):
    page.goto(with_bypass_url(f"{BASE_URL}/login"), timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    save_debug(page, "00-login")

    login_response = context.request.post(
        f"{BASE_URL}/api/auth/demo",
        timeout=90000,
        headers=request_headers(),
    )
    if not login_response.ok:
        login_response = context.request.post(
            f"{BASE_URL}/api/auth/login",
            timeout=90000,
            headers=request_headers("application/json"),
            data='{"email":"demo@example.com","password":"demo123456"}',
        )

    if not login_response.ok:
        test_id = str(int(time()))
        register_payload = (
            "{"
            f"\"name\":\"Writer Preview QA {test_id}\","
            f"\"email\":\"writer-preview-{test_id}@example.com\","
            "\"password\":\"demo123456\","
            "\"enterpriseAction\":\"create\","
            f"\"enterpriseName\":\"Writer Preview QA {test_id}\""
            "}"
        )
        login_response = context.request.post(
            f"{BASE_URL}/api/auth/register",
            timeout=90000,
            headers=request_headers("application/json"),
            data=register_payload,
        )

    expect(login_response.ok, f"login failed: {login_response.status}")
    page.goto(with_bypass_url(f"{BASE_URL}/dashboard"), timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


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


if os.environ.get("WRITER_SKIP_READY") != "1":
    wait_until_http_ready()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    extra_http_headers = request_headers() if VERCEL_BYPASS_TOKEN else None
    context = browser.new_context(
        viewport={"width": 1440, "height": 1100},
        extra_http_headers=extra_http_headers,
    )
    page = context.new_page()
    page.set_default_timeout(90000)

    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

    try:
        login(context, page)

        page.goto(with_bypass_url(f"{BASE_URL}/dashboard"), timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        save_debug(page, "01-dashboard")

        page.goto(with_bypass_url(f"{BASE_URL}/dashboard/writer"), timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_writer_workspace_ready(page, timeout_ms=45000)
        save_debug(page, "02-writer-home")

        selects = page.locator("select:visible")
        expect(selects.count() >= 3, "writer page should render platform, mode, and language selects")
        expect(page.locator("textarea:visible").count() >= 1, "writer page missing visible input")

        platform_select = selects.nth(0)
        mode_select = selects.nth(1)
        platform_select.select_option("x")
        page.wait_for_timeout(500)
        mode_select.select_option("thread")
        page.wait_for_timeout(500)
        save_debug(page, "03-x-thread-mode")

        input_box = page.locator("textarea:visible").first
        input_box.fill(
            "Write an X thread in Chinese about AI startup lessons, with a strong hook, 6 short segments, clear markdown structure, and a closing CTA."
        )

        send_button = page.locator("button:visible").filter(has=page.locator("svg.lucide-send")).last
        expect(send_button.is_enabled(), "writer send button should be enabled after input")
        send_button.click()

        wait_for_url_contains(page, "/dashboard/writer/", timeout_ms=180000)
        page.wait_for_timeout(8000)
        page.wait_for_load_state("networkidle", timeout=90000)
        save_debug(page, "04-after-send")

        current_url = page.url
        expect("/dashboard/writer/" in current_url, "writer send flow should create a session route")

        message_bubbles = page.locator("div.prose").filter(has=page.locator("img, h1, h2, h3, p"))
        expect(message_bubbles.count() >= 1, "writer send flow produced no rendered markdown output")

        preview_dialog = page.locator('[role="dialog"]').first
        if not preview_dialog.is_visible():
            preview_trigger = page.get_by_role("button", name="预览")
            preview_trigger.click()
            preview_dialog.wait_for(state="visible", timeout=120000)

        image_button = preview_dialog.get_by_role("button", name=re.compile("确认文案并生成配图|重新生成配图|生成配图中"))
        expect(image_button.count() >= 1, "preview drawer missing image generation button")
        image_button.first.click()
        wait_for_generated_writer_assets(page, timeout_ms=180000)
        expect(
            preview_dialog.locator('img[src^="http"], img[src^="https"]').count() >= 1,
            "preview drawer missing generated image assets",
        )

        history_links = page.locator('aside a[href*="/dashboard/writer/"]')
        expect(history_links.count() >= 1, "writer history should render at least one conversation link")

        session_url = current_url
        page.goto(with_bypass_url(session_url), timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_writer_workspace_ready(page, timeout_ms=45000)
        wait_for_writer_history(page, timeout_ms=45000)
        save_debug(page, "05-session-reload")
        expect(page.locator("textarea:visible").count() >= 1, "writer session reload should keep composer visible")
        expect(
            page.locator('aside a[href*="/dashboard/writer/"]').count() >= 1,
            "reloaded session should keep writer history visible",
        )

        page.goto(with_bypass_url(f"{BASE_URL}/dashboard/copywriting"), timeout=90000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_url_contains(page, "/dashboard/writer", timeout_ms=15000)
        save_debug(page, "06-copywriting-redirect")

        page.goto(
            with_bypass_url(f"{BASE_URL}/dashboard/advisor/copywriting/new"),
            timeout=90000,
            wait_until="domcontentloaded",
        )
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_url_contains(page, "/dashboard/writer", timeout_ms=15000)
        save_debug(page, "07-advisor-copywriting-redirect")

        page.goto(
            with_bypass_url(f"{BASE_URL}/dashboard/advisor/growth/new"),
            timeout=90000,
            wait_until="domcontentloaded",
        )
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_visible_input(page, timeout_ms=45000)
        save_debug(page, "08-growth-regression")
        expect(
            page.locator("input:visible, textarea:visible").count() >= 1,
            "growth advisor regression: visible chat input missing",
        )

        assert_no_critical_console_errors(console_errors)
        print("writer_local_smoke: PASS")
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        try:
            save_debug(page, "99-failure")
        except Exception:
            pass
        raise error
    finally:
        browser.close()
