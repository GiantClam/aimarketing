from pathlib import Path
from time import sleep, time
import os
import re
import urllib.request
from urllib.error import HTTPError

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://localhost:3123").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-enterprise"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

EXPECTED_ARTICLE_MARKERS = (
    "AI 外呼与线索转化自动化平台",
    "销售线索成本降低 32%",
)


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
            with urllib.request.urlopen(
                f"{BASE_URL}/api/health", timeout=10
            ) as response:
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


def wait_for_writer_draft_ready(
    page, expected_markers: tuple[str, ...], timeout_ms: int = 180000
):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        prose = page.locator("div.prose").last
        if prose.count() >= 1:
            article_text = prose.inner_text().strip()
            if article_text and any(
                marker in article_text for marker in expected_markers
            ):
                return article_text

        page.wait_for_timeout(1000)

    raise AssertionError("writer draft did not finish rendering in time")


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
    page.goto(
        f"{BASE_URL}/dashboard/settings", timeout=90000, wait_until="domcontentloaded"
    )
    page.wait_for_load_state("networkidle", timeout=90000)


def ensure_dataset_enabled(page, dataset_name: str, scope_value: str):
    row = page.locator("div.rounded-lg.border").filter(has_text=dataset_name).first
    expect(row.count() >= 1, f"dataset row missing: {dataset_name}")
    checkbox = row.locator('input[type="checkbox"]').first
    if not checkbox.is_checked():
        checkbox.check()
    row.locator("select").first.select_option(scope_value)


def click_writer_send(page):
    send_button = page.get_by_test_id("writer-send-button")
    if send_button.count() >= 1:
        expect(send_button.first.is_enabled(), "writer send button should be enabled")
        send_button.first.click()
        return

    page.locator("button:visible").filter(
        has=page.locator("svg.lucide-send")
    ).last.click()


wait_until_http_ready()


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(viewport={"width": 1440, "height": 1100})
    page = context.new_page()
    page.set_default_timeout(90000)

    try:
        login(context, page)
        save_debug(page, "00-settings")

        dify_card = (
            page.locator("div")
            .filter(has=page.get_by_text(re.compile(r"Dify .*知识库")))
            .first
        )
        expect(
            dify_card.count() >= 1,
            "settings page missing Dify enterprise knowledge card",
        )

        page.get_by_label("Dify API Base URL").fill("https://fixture.dify.local/v1")
        page.get_by_label("Dify API Key").fill("fixture-key")
        enterprise_toggle = (
            page.locator("label")
            .filter(has_text=re.compile(r"启用企业(?:统一知识检索|知识增强写作)"))
            .locator('input[type="checkbox"]')
            .first
        )
        if not enterprise_toggle.is_checked():
            enterprise_toggle.check()

        page.get_by_role("button", name="测试并拉取知识库").click()
        page.get_by_text(re.compile(r"已拉取\s*3\s*个\s*Dify\s*知识库")).wait_for(
            timeout=30000
        )

        ensure_dataset_enabled(page, "品牌手册", "brand")
        ensure_dataset_enabled(page, "产品资料", "product")
        ensure_dataset_enabled(page, "案例资料", "case-study")
        with page.expect_response(
            lambda response: response.url.endswith("/api/enterprise/dify")
            and response.request.method == "PUT"
            and response.status == 200,
            timeout=30000,
        ):
            page.get_by_role("button", name="保存 Dify 配置").click()
        save_debug(page, "01-dify-saved")

        page.goto(
            f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded"
        )
        page.wait_for_load_state("networkidle", timeout=90000)
        wait_for_writer_workspace_ready(page)
        save_debug(page, "02-writer-home")

        expect(
            page.get_by_text(re.compile(r"企业知识\s*3")).count() >= 1,
            "writer header should show enabled enterprise knowledge count",
        )

        selects = page.locator("select:visible")
        selects.nth(0).select_option("wechat")
        page.wait_for_timeout(200)
        selects.nth(1).select_option("article")
        page.wait_for_timeout(200)
        selects.nth(2).select_option("zh")
        page.wait_for_timeout(200)

        page.locator("textarea:visible").first.fill(
            "写一篇公众号文章，主题是 AI 销售自动化如何提升线索转化效率。"
        )
        click_writer_send(page)

        wait_for_url_contains(page, "/dashboard/writer/", timeout_ms=180000)
        article_text = wait_for_writer_draft_ready(
            page, EXPECTED_ARTICLE_MARKERS, timeout_ms=180000
        )
        page.wait_for_load_state("networkidle", timeout=90000)
        save_debug(page, "03-writer-generated")

        expect(
            "AI 外呼与线索转化自动化平台" in article_text,
            "writer draft should include product knowledge from enterprise Dify datasets",
        )
        expect(
            "销售线索成本降低 32%" in article_text,
            "writer draft should include case-study knowledge from enterprise Dify datasets",
        )
        print("writer_enterprise_knowledge_e2e: PASS")
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        try:
            save_debug(page, "99-failure")
        except Exception:
            pass
        raise error
    finally:
        browser.close()
