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
SCENARIO = os.environ.get("WRITER_E2E_SCENARIO", "fixture_enabled").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-new-features" / SCENARIO
SEED_PATH = Path("artifacts") / "writer-real-validation" / "seed.json"
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


def wait_for_text(page, text: str, timeout_ms: int = 30000):
    page.get_by_text(text, exact=False).first.wait_for(state="visible", timeout=timeout_ms)


def fetch_json(page, path: str):
    return page.evaluate(
        """async ({ baseUrl, path }) => {
            const response = await fetch(`${baseUrl}${path}`, {
              credentials: "include",
              cache: "no-store",
            })
            const data = await response.json()
            return { ok: response.ok, status: response.status, data }
        }""",
        {"baseUrl": BASE_URL, "path": path},
    )


def login(page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    response = page.evaluate(
        """async (baseUrl) => {
            const result = await fetch(`${baseUrl}/api/auth/demo`, {
              method: "POST",
              credentials: "include",
            })
            let data = {}
            try {
              data = await result.json()
            } catch (error) {
              data = { error: String(error) }
            }
            return { ok: result.ok, status: result.status, data }
        }""",
        BASE_URL,
    )
    expect(response["ok"], f"demo login failed: {response['status']} {response['data']}")
    page.goto(f"{BASE_URL}/dashboard", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


def assert_availability(page, *, enabled: bool, provider: str, reason: str):
    payload = fetch_json(page, "/api/writer/availability")
    expect(payload["ok"], f"writer availability request failed: {payload['status']}")
    data = payload["data"].get("data") or {}
    expect(data.get("enabled") is enabled, f"writer enabled mismatch: {data}")
    expect(data.get("provider") == provider, f"writer provider mismatch: {data}")
    expect(data.get("reason") == reason, f"writer reason mismatch: {data}")
    return data


def set_sidebar_marker(page):
    attached = page.evaluate(
        """() => {
            const sidebar = document.querySelector("aside")
            if (!sidebar) return false
            sidebar.setAttribute("data-e2e-sidebar-marker", "persist")
            return true
        }""",
    )
    expect(attached, "writer sidebar was not found")


def assert_sidebar_marker(page):
    marker = page.evaluate("() => document.querySelector('aside')?.getAttribute('data-e2e-sidebar-marker') || ''")
    expect(marker == "persist", "writer sidebar remounted during route transition")


def assert_preview_not_forced_open(page):
    dialog = page.get_by_role("dialog")
    if dialog.count() == 0:
        return
    expect(not dialog.first.is_visible(), "restored writer session should not auto-open preview")


def wait_for_non_empty_last_assistant(page, timeout_ms: int = 60000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        assistant_bubbles = page.locator("div.rounded-bl-md")
        if assistant_bubbles.count() > 0:
            text = assistant_bubbles.last.inner_text().strip()
            if len(text) >= 20:
                return text
        page.wait_for_timeout(1000)

    raise AssertionError("writer assistant did not produce visible content in time")


def run_fixture_enabled(page):
    seed = read_seed()
    result = {
        "scenario": SCENARIO,
        "seedConversationId": seed["conversationId"],
        "metrics": {},
    }

    availability = assert_availability(page, enabled=True, provider="aiberm", reason="ok")
    result["availability"] = availability

    expect(page.locator('a[href="/dashboard/writer"]').count() >= 1, "dashboard should show writer quick link")
    save_debug(page, "00-dashboard")

    start = perf_counter()
    page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    wait_for_writer_workspace_ready(page)
    result["metrics"]["workspace_ready_ms"] = round((perf_counter() - start) * 1000, 2)
    set_sidebar_marker(page)
    save_debug(page, "01-writer-home")

    seeded_conversation = page.get_by_test_id(f"writer-conversation-{seed['conversationId']}")
    expect(seeded_conversation.count() == 1, "seeded conversation should appear in sidebar")

    start = perf_counter()
    seeded_conversation.click()
    page.wait_for_url(re.compile(rf".*/dashboard/writer/{seed['conversationId']}(?:\\?.*)?$"), timeout=90000)
    assert_sidebar_marker(page)
    assert_preview_not_forced_open(page)
    wait_for_text(page, "Cursor seed turn 25", timeout_ms=20000)
    result["metrics"]["switch_session_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "02-seeded-session")

    start = perf_counter()
    page.get_by_test_id("writer-load-older-button").click()
    wait_for_text(page, "Cursor seed turn 01", timeout_ms=20000)
    result["metrics"]["cursor_pagination_ms"] = round((perf_counter() - start) * 1000, 2)

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
    expect(page.locator("input:visible").count() == 0, "rename rollback should leave edit mode")
    page.unroute(f"**/api/writer/conversations/{seed['conversationId']}/name")

    start = perf_counter()
    page.get_by_test_id("writer-new-session-button").click()
    page.wait_for_url(re.compile(r".*/dashboard/writer(?:\\?.*)?$"), timeout=90000)
    wait_for_writer_workspace_ready(page)
    assert_sidebar_marker(page)
    result["metrics"]["new_session_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "03-new-session")

    seeded_conversation = page.get_by_test_id(f"writer-conversation-{seed['conversationId']}")
    seeded_conversation.hover()
    page.get_by_test_id(f"writer-delete-{seed['conversationId']}").click()
    page.get_by_role("dialog").wait_for(state="visible", timeout=10000)
    page.get_by_test_id("writer-delete-cancel-button").click()
    page.get_by_role("dialog").wait_for(state="hidden", timeout=10000)
    expect(
        page.get_by_test_id(f"writer-conversation-{seed['conversationId']}").count() == 1,
        "conversation should remain after canceling deletion",
    )

    seeded_conversation = page.get_by_test_id(f"writer-conversation-{seed['conversationId']}")
    seeded_conversation.hover()
    page.get_by_test_id(f"writer-delete-{seed['conversationId']}").click()
    page.get_by_role("dialog").wait_for(state="visible", timeout=10000)
    page.get_by_test_id("writer-delete-confirm-button").click()
    page.get_by_test_id(f"writer-conversation-{seed['conversationId']}").wait_for(state="detached", timeout=10000)

    selects = page.locator("select:visible")
    selects.nth(0).select_option("wechat")
    page.wait_for_timeout(200)
    selects.nth(1).select_option("article")
    page.wait_for_timeout(200)
    selects.nth(2).select_option("en")
    page.wait_for_timeout(200)

    input_box = page.locator("textarea:visible").first
    input_box.fill("Write a short three-paragraph WeChat article about AI workflow systems.")
    send_button = page.get_by_test_id("writer-send-button")
    expect(send_button.is_enabled(), "writer send button should be enabled")

    start = perf_counter()
    send_button.click()
    page.wait_for_url(re.compile(r".*/dashboard/writer/\d+(?:\\?.*)?$"), timeout=90000)
    assistant_text = wait_for_non_empty_last_assistant(page, timeout_ms=60000)
    result["metrics"]["fixture_generation_ms"] = round((perf_counter() - start) * 1000, 2)
    expect("Writer Fixture Draft" in assistant_text, "fixture generation should return the deterministic fixture draft")
    save_debug(page, "04-fixture-generation")

    return result


def run_provider_missing(page):
    result = {"scenario": SCENARIO}
    availability = assert_availability(page, enabled=False, provider="unavailable", reason="aiberm_api_key_missing")
    result["availability"] = availability

    expect(page.locator('a[href="/dashboard/writer"]').count() == 0, "dashboard should hide writer quick link")
    save_debug(page, "00-dashboard-provider-missing")
    return result


def main():
    wait_until_http_ready()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1100})
        page.set_default_timeout(90000)

        try:
            login(page)
            if SCENARIO == "fixture_enabled":
                report = run_fixture_enabled(page)
            elif SCENARIO == "provider_missing":
                report = run_provider_missing(page)
            else:
                raise AssertionError(f"unsupported scenario: {SCENARIO}")

            (ARTIFACT_DIR / "report.json").write_text(
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
