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

GROUNDING_SUMMARY_LABELS = ("Grounding", "本次依据")
ENTERPRISE_SOURCE_LABELS = ("Enterprise sources", "企业来源")
WEB_SOURCE_LABELS = ("Web sources", "外部来源")
DATASET_LABELS = ("Datasets", "知识库")
REFERENCE_LABELS = ("Matched docs", "命中文档")
STRATEGY_LABELS = {
    "rewrite_only": ("Rewrite only", "仅改写"),
    "enterprise_grounded": ("Enterprise-first", "企业知识优先"),
    "fresh_external": ("Web research first", "外部研究优先"),
    "hybrid_grounded": ("Enterprise + web research", "企业知识 + 外部研究"),
}
VALID_RETRIEVAL_STRATEGIES = set(STRATEGY_LABELS)
VALID_WEB_RESEARCH_STATUSES = {"ready", "disabled", "timed_out", "unavailable", "skipped"}


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


def wait_for_any_text(page, texts: tuple[str, ...] | list[str], timeout_ms: int = 30000) -> str:
    last_error: Exception | None = None
    for text in texts:
        try:
            wait_for_text(page, text, timeout_ms=timeout_ms)
            return text
        except PlaywrightTimeoutError as error:
            last_error = error

    raise AssertionError(f"none of the expected texts were visible: {texts}") from last_error


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


def get_conversation_id_from_url(page) -> str:
    match = re.search(r"/dashboard/writer/(\d+)", page.url)
    expect(bool(match), f"missing writer conversation id in url: {page.url}")
    return match.group(1)


def clear_writer_session_store(page):
    page.evaluate(
        """() => {
            window.localStorage.removeItem("writer-session-store-v1")
        }"""
    )


def get_displayed_source_count(used: bool, count: int) -> int:
    return count if used and count > 0 else 0


def assert_grounding_summary_visible(page, diagnostics: dict):
    wait_for_any_text(page, GROUNDING_SUMMARY_LABELS, timeout_ms=20000)

    strategy = diagnostics.get("retrievalStrategy")
    expect(strategy in VALID_RETRIEVAL_STRATEGIES, f"unexpected retrieval strategy in diagnostics: {diagnostics}")
    wait_for_any_text(page, STRATEGY_LABELS[strategy], timeout_ms=20000)

    enterprise_count = get_displayed_source_count(
        bool(diagnostics.get("enterpriseKnowledgeUsed")),
        int(diagnostics.get("enterpriseSourceCount") or 0),
    )
    web_count = get_displayed_source_count(
        bool(diagnostics.get("webResearchUsed")),
        int(diagnostics.get("webSourceCount") or 0),
    )
    wait_for_any_text(
        page,
        tuple(f"{label} {enterprise_count}" for label in ENTERPRISE_SOURCE_LABELS),
        timeout_ms=20000,
    )
    wait_for_any_text(page, tuple(f"{label} {web_count}" for label in WEB_SOURCE_LABELS), timeout_ms=20000)

    datasets = [item for item in diagnostics.get("enterpriseDatasets") or [] if isinstance(item, str) and item.strip()]
    if datasets:
        wait_for_any_text(page, DATASET_LABELS, timeout_ms=20000)
        wait_for_text(page, datasets[0], timeout_ms=20000)

    references = [item for item in diagnostics.get("enterpriseTitles") or [] if isinstance(item, str) and item.strip()]
    if references:
        wait_for_any_text(page, REFERENCE_LABELS, timeout_ms=20000)
        wait_for_text(page, references[0], timeout_ms=20000)


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

    renamed_title = f"Renamed Seed {seed['conversationId']}"
    seeded_conversation.hover()
    page.get_by_test_id(f"writer-rename-{seed['conversationId']}").click()
    rename_input = page.locator("input:visible").first
    rename_input.fill(renamed_title)
    page.get_by_test_id(f"writer-save-rename-{seed['conversationId']}").click()
    wait_for_text(page, renamed_title, timeout_ms=10000)
    expect(page.locator("input:visible").count() == 0, "rename success should leave edit mode")

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
    input_box.fill("Write a WeChat article about AI workflow systems.")
    send_button = page.get_by_test_id("writer-send-button")
    expect(send_button.is_enabled(), "writer send button should be enabled")

    start = perf_counter()
    send_button.click()
    page.wait_for_url(re.compile(r".*/dashboard/writer/\d+(?:\\?.*)?$"), timeout=90000)
    clarification_text = wait_for_non_empty_last_assistant(page, timeout_ms=60000)
    expect(
        "Audience:" in clarification_text or "主要是写给谁看的" in clarification_text,
        "writer should ask for missing brief details before drafting",
    )

    input_box = page.locator("textarea:visible").first
    input_box.fill("The audience is B2B SaaS founders, the goal is to drive demo requests, and the tone should be professional and restrained.")
    send_button = page.get_by_test_id("writer-send-button")
    send_button.click()
    wait_for_text(page, "Writer Fixture Draft", timeout_ms=60000)
    conversation_id = get_conversation_id_from_url(page)
    messages_payload = fetch_json(page, f"/api/writer/messages?conversation_id={conversation_id}&limit=20")
    expect(messages_payload["ok"], f"writer messages request failed: {messages_payload['status']}")
    history = messages_payload["data"].get("data") or []
    assistant_with_diagnostics = next(
        (item for item in reversed(history) if isinstance(item.get("diagnostics"), dict)),
        None,
    )
    expect(assistant_with_diagnostics is not None, f"expected assistant diagnostics in writer history: {history}")
    diagnostics = assistant_with_diagnostics.get("diagnostics") or {}
    expect(diagnostics.get("retrievalStrategy") in VALID_RETRIEVAL_STRATEGIES, f"unexpected retrieval strategy: {diagnostics}")
    expect(diagnostics.get("retrievalStrategy") != "rewrite_only", f"draft generation should not use rewrite-only strategy: {diagnostics}")
    expect(diagnostics.get("webResearchStatus") in VALID_WEB_RESEARCH_STATUSES, f"unexpected web research status: {diagnostics}")
    assert_grounding_summary_visible(page, diagnostics)
    result["diagnostics"] = diagnostics

    clear_writer_session_store(page)
    page.reload(wait_until="domcontentloaded", timeout=90000)
    page.wait_for_load_state("networkidle", timeout=90000)
    wait_for_writer_workspace_ready(page)
    wait_for_text(page, "Writer Fixture Draft", timeout_ms=30000)
    assert_grounding_summary_visible(page, diagnostics)
    result["metrics"]["fixture_generation_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "04-fixture-generation")
    save_debug(page, "05-fixture-generation-restored")

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
