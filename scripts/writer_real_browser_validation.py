from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from time import perf_counter, sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://127.0.0.1:3123").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-real-validation"
SEED_PATH = ARTIFACT_DIR / "seed.json"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


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
            last_error = error
        sleep(1)

    raise RuntimeError(f"application did not become ready: {last_error}")


def save_debug(page, name: str):
    page.screenshot(path=str(ARTIFACT_DIR / f"{name}.png"), full_page=True)
    (ARTIFACT_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")


def read_seed():
    expect(SEED_PATH.exists(), f"missing seed file: {SEED_PATH}")
    return json.loads(SEED_PATH.read_text(encoding="utf-8"))


def wait_for_writer_workspace_ready(page, timeout_ms: int = 90000):
    page.wait_for_selector("select", state="attached", timeout=timeout_ms)
    page.wait_for_selector("textarea", state="visible", timeout=timeout_ms)
    page.wait_for_selector("[data-testid='writer-send-button']", state="attached", timeout=timeout_ms)


def assert_writer_available(page):
    data = page.evaluate(
        """async (baseUrl) => {
            const response = await fetch(`${baseUrl}/api/writer/availability`, {
              credentials: "include",
              cache: "no-store",
            })
            return response.json()
        }""",
        BASE_URL,
    ).get("data") or {}
    expect(
        data.get("enabled"),
        f"writer is unavailable: reason={data.get('reason')}, provider={data.get('provider')}, "
        f"requiresWebResearch={data.get('requiresWebResearch')}, webResearchEnabled={data.get('webResearchEnabled')}",
    )


def wait_for_login(context, page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    login_response = None
    for _ in range(5):
        login_response = context.request.post(f"{BASE_URL}/api/auth/demo", timeout=90000)
        if login_response.ok:
            break
        sleep(1.5)
    expect(login_response is not None and login_response.ok, f"demo login failed: {login_response.status if login_response else 'unknown'}")
    page.goto(f"{BASE_URL}/dashboard", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


def wait_for_text(page, text: str, timeout_ms: int = 60000):
    locator = page.get_by_text(text, exact=False)
    locator.first.wait_for(state="visible", timeout=timeout_ms)


def wait_for_non_empty_last_assistant(page, timeout_ms: int = 180000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        assistant_bubbles = page.locator("div.rounded-bl-md")
        if assistant_bubbles.count() > 0:
            text = assistant_bubbles.last.inner_text().strip()
            if len(text) >= 20 and "正在生成图文草稿" not in text:
                return text
        page.wait_for_timeout(1500)
    raise AssertionError("writer assistant did not produce visible content in time")


def wait_for_delete_request_count(delete_requests: list[str], expected: int, timeout_ms: int = 10000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if len(delete_requests) >= expected:
            return
        sleep(0.2)

    raise AssertionError(f"writer delete request count did not reach {expected}")


def main():
    wait_until_http_ready()
    seed = read_seed()
    metrics = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1100})
        page = context.new_page()
        page.set_default_timeout(90000)
        console_errors = []
        delete_requests: list[str] = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on(
            "request",
            lambda request: delete_requests.append(request.url)
            if request.method == "DELETE"
            and request.url.endswith(f"/api/writer/conversations/{seed['conversationId']}")
            else None,
        )

        try:
            wait_for_login(context, page)
            assert_writer_available(page)
            save_debug(page, "00-after-login")

            start = perf_counter()
            page.get_by_test_id("writer-new-session-button").click()
            page.wait_for_url(re.compile(r".*/dashboard/writer(?:\\?.*)?$"), timeout=90000)
            wait_for_writer_workspace_ready(page)
            metrics["writer_workspace_ready_ms"] = round((perf_counter() - start) * 1000, 2)
            save_debug(page, "01-writer-home")

            seeded_conversation = page.get_by_test_id(f"writer-conversation-{seed['conversationId']}")
            expect(seeded_conversation.count() == 1, "seeded conversation link not found in sidebar")

            start = perf_counter()
            seeded_conversation.click()
            page.wait_for_url(re.compile(rf".*/dashboard/writer/{seed['conversationId']}(?:\\?.*)?$"), timeout=90000)
            wait_for_text(page, "Cursor seed turn 25", timeout_ms=20000)
            metrics["sidebar_session_switch_ms"] = round((perf_counter() - start) * 1000, 2)
            save_debug(page, "02-seeded-session")

            seeded_conversation.hover()
            page.route(
                f"**/api/writer/conversations/{seed['conversationId']}/name",
                lambda route: route.fulfill(status=500, content_type="application/json", body='{"error":"forced failure"}'),
            )
            page.get_by_test_id(f"writer-rename-{seed['conversationId']}").click()
            rename_input = page.locator("input:visible").first
            rename_input.fill("Rollback Name Check")
            page.get_by_test_id(f"writer-save-rename-{seed['conversationId']}").click()
            wait_for_text(page, seed["title"], timeout_ms=10000)
            page.unroute(f"**/api/writer/conversations/{seed['conversationId']}/name")

            start = perf_counter()
            page.get_by_test_id("writer-load-older-button").click()
            wait_for_text(page, "Cursor seed turn 01", timeout_ms=20000)
            metrics["cursor_pagination_load_ms"] = round((perf_counter() - start) * 1000, 2)
            save_debug(page, "03-pagination")

            start = perf_counter()
            page.get_by_test_id("writer-new-session-button").click()
            page.wait_for_url(re.compile(r".*/dashboard/writer(?:\\?.*)?$"), timeout=90000)
            wait_for_writer_workspace_ready(page)
            metrics["sidebar_new_session_ms"] = round((perf_counter() - start) * 1000, 2)
            save_debug(page, "04-new-session")

            seeded_conversation = page.get_by_test_id(f"writer-conversation-{seed['conversationId']}")
            seeded_conversation.hover()
            delete_request_count_before_cancel = len(delete_requests)
            page.get_by_test_id(f"writer-delete-{seed['conversationId']}").click()
            page.get_by_role("dialog").wait_for(state="visible", timeout=10000)
            page.get_by_test_id("writer-delete-cancel-button").click()
            page.get_by_role("dialog").wait_for(state="hidden", timeout=10000)
            expect(
                len(delete_requests) == delete_request_count_before_cancel,
                "canceling writer deletion should not send a delete request",
            )
            expect(
                page.get_by_test_id(f"writer-conversation-{seed['conversationId']}").count() == 1,
                "conversation should remain visible after canceling delete",
            )

            seeded_conversation = page.get_by_test_id(f"writer-conversation-{seed['conversationId']}")
            seeded_conversation.hover()
            delete_request_count_before_confirm = len(delete_requests)
            page.get_by_test_id(f"writer-delete-{seed['conversationId']}").click()
            page.get_by_role("dialog").wait_for(state="visible", timeout=10000)
            page.get_by_test_id("writer-delete-confirm-button").click()
            wait_for_delete_request_count(delete_requests, delete_request_count_before_confirm + 1, timeout_ms=10000)
            page.get_by_test_id(f"writer-conversation-{seed['conversationId']}").wait_for(state="detached", timeout=10000)
            save_debug(page, "04-delete-confirmation")

            input_box = page.locator("textarea:visible").first
            input_box.fill("Write a short three-paragraph WeChat article about how AI teams build content workflows. Use Markdown with one H2 heading and three bullet points.")
            send_button = page.get_by_test_id("writer-send-button")
            expect(send_button.is_enabled(), "writer send button should be enabled")

            start = perf_counter()
            send_button.click()
            page.wait_for_url("**/dashboard/writer/*", timeout=180000)
            assistant_text = wait_for_non_empty_last_assistant(page, timeout_ms=180000)
            metrics["real_generation_visible_ms"] = round((perf_counter() - start) * 1000, 2)
            expect(len(assistant_text) >= 20, "real generation content too short")
            save_debug(page, "05-real-generation")

            report = {
                "baseUrl": BASE_URL,
                "seedConversationId": seed["conversationId"],
                "metrics": metrics,
                "consoleErrors": console_errors,
            }
            (ARTIFACT_DIR / "performance.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(json.dumps(report, ensure_ascii=False))
        except (AssertionError, PlaywrightTimeoutError, Exception):
            try:
                save_debug(page, "99-failure")
            except Exception:
                pass
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
