from pathlib import Path
from time import sleep, time
import os
import urllib.request
from urllib.error import HTTPError

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "https://www.aimarketingsite.com").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-visual"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def collect(condition: bool, message: str, issues: list[str]):
    if not condition:
        issues.append(message)


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
        except Exception as error:  # noqa: BLE001
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
    page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


def style_metrics(locator):
    return locator.evaluate(
        """(element) => {
          const style = window.getComputedStyle(element)
          return {
            fontSize: parseFloat(style.fontSize),
            lineHeight: parseFloat(style.lineHeight),
            fontWeight: style.fontWeight,
            textAlign: style.textAlign,
            borderWidth: parseFloat(style.borderLeftWidth || style.borderWidth || "0"),
          }
        }"""
    )


def assert_classes(locator, expected_tokens: list[str], label: str):
    class_name = locator.get_attribute("class") or ""
    for token in expected_tokens:
        expect(token in class_name, f"{label} missing class token: {token}")


def assert_preview_visual_quality(preview_dialog):
    issues: list[str] = []

    primary_button = preview_dialog.get_by_role("button", name="重新生成配图")
    copy_rich_button = preview_dialog.get_by_role("button", name="复制富文本")
    copy_md_button = preview_dialog.get_by_role("button", name="复制 Markdown")
    collapse_button = preview_dialog.get_by_role("button", name="收起")

    for locator, tokens, label in [
        (primary_button, ["border-slate-500", "bg-white", "text-slate-950"], "preview primary action"),
        (copy_rich_button, ["bg-slate-950", "text-white"], "preview rich copy button"),
        (copy_md_button, ["border-slate-400", "bg-white", "text-slate-950"], "preview markdown copy button"),
        (collapse_button, ["bg-slate-950", "text-white"], "preview collapse button"),
    ]:
        collect(locator.is_visible(), f"{label} should be visible", issues)
        try:
            assert_classes(locator, tokens, label)
        except AssertionError as error:
            issues.append(str(error))

    header_badges = preview_dialog.locator('[data-slot="badge"]:visible')
    collect(header_badges.count() >= 3, "preview should show clear status badges", issues)
    badge_classes = [header_badges.nth(index).get_attribute("class") or "" for index in range(min(header_badges.count(), 4))]
    collect(
        any("bg-slate-950" in class_name and "text-white" in class_name for class_name in badge_classes),
        "preview should include at least one dark high-contrast badge",
        issues,
    )
    collect(
        any("bg-white" in class_name and "text-slate-900" in class_name for class_name in badge_classes),
        "preview should include at least one light high-contrast badge",
        issues,
    )

    helper_text = preview_dialog.locator("p").filter(has_text="当前先预览并确认文本").or_(
        preview_dialog.locator("p").filter(has_text="图文已合并到同一条文章流")
    ).first
    collect(helper_text.is_visible(), "preview helper text should be visible", issues)
    try:
        assert_classes(helper_text, ["text-slate-700"], "preview helper text")
    except AssertionError as error:
        issues.append(str(error))

    article_root = preview_dialog.locator("div.prose").first
    title = article_root.locator("h1").first
    first_paragraph = article_root.locator("p").first
    blockquote = article_root.locator("blockquote").first
    article_image = article_root.locator('img[src^="http"], img[src^="https"]').first
    article_root_classes = article_root.get_attribute("class") or ""

    collect(title.is_visible(), "article title should be visible", issues)
    collect(first_paragraph.is_visible(), "article first paragraph should be visible", issues)
    collect(blockquote.is_visible(), "article quote should be visible", issues)
    collect(article_image.is_visible(), "article image should be visible inline", issues)

    for token in [
        "prose-h1:text-center",
        "prose-p:text-[17px]",
        "prose-p:leading-[2]",
        "prose-p:text-slate-900",
        "prose-blockquote:border-l-4",
        "prose-blockquote:text-slate-700",
        "prose-img:rounded-[28px]",
    ]:
        collect(token in article_root_classes, f"article preview missing readability token: {token}", issues)

    title_metrics = style_metrics(title)
    collect(title_metrics["textAlign"] == "center", "article title should be center aligned", issues)
    collect(title_metrics["fontSize"] >= 36, f"title size too small: {title_metrics['fontSize']}", issues)

    paragraph_metrics = style_metrics(first_paragraph)
    collect(paragraph_metrics["fontSize"] >= 16, f"paragraph size too small: {paragraph_metrics['fontSize']}", issues)
    collect(paragraph_metrics["lineHeight"] >= 28, f"paragraph line-height too small: {paragraph_metrics['lineHeight']}", issues)

    quote_metrics = style_metrics(blockquote)
    collect(quote_metrics["borderWidth"] >= 3, f"blockquote border too weak: {quote_metrics['borderWidth']}", issues)

    image_box = article_image.bounding_box()
    collect(image_box is not None and image_box["height"] >= 120, "inline image should have meaningful size", issues)

    preview_text = preview_dialog.inner_text()
    banned_tokens = ["data:image", "base64,", "writer-asset://"]
    for token in banned_tokens:
        collect(token not in preview_text, f"preview should not expose raw asset token: {token}", issues)

    page_text = preview_dialog.page.inner_text("body")
    collect("浼" not in page_text and "鍐" not in page_text and "鐢" not in page_text, "page still contains visible garbled Chinese text", issues)

    if issues:
        raise AssertionError(" | ".join(issues))


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
        wait_for_writer_workspace_ready(page)
        save_debug(page, "01-writer-home")

        selects = page.locator("select:visible")
        selects.nth(0).select_option("wechat")
        page.wait_for_timeout(400)
        selects.nth(1).select_option("article")
        page.wait_for_timeout(400)
        selects.nth(2).select_option("zh")
        page.wait_for_timeout(400)

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
        save_debug(page, "02-after-send")

        preview_dialog = ensure_preview_dialog(page)

        preview_dialog.get_by_role("button", name="确认文案并生成配图").click()
        wait_for_generated_writer_assets(page)
        page.wait_for_timeout(1500)
        save_debug(page, "03-preview-ready")

        assert_preview_visual_quality(preview_dialog)

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

        print("writer_visual_readability_e2e: PASS")
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        try:
            save_debug(page, "99-failure")
        except Exception:
            pass
        raise error
    finally:
        browser.close()
