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
    page.wait_for_selector("select:visible", state="attached", timeout=timeout_ms)
    page.wait_for_selector("textarea", state="visible", timeout=timeout_ms)
    page.wait_for_selector("[data-testid='writer-send-button']", state="visible", timeout=timeout_ms)


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


def set_writer_language(page, language: str):
    selects = page.locator("select:visible")
    expect(selects.count() >= 1, "writer page should render the language select")
    selects.first.select_option(language)
    page.wait_for_timeout(200)


def get_displayed_source_count(used: bool, count: int) -> int:
    return count if used and count > 0 else 0


def assert_grounding_summary_visible(page, diagnostics: dict):
    try:
        wait_for_any_text(page, GROUNDING_SUMMARY_LABELS, timeout_ms=5000)
        strategy = diagnostics.get("retrievalStrategy")
        expect(strategy in VALID_RETRIEVAL_STRATEGIES, f"unexpected retrieval strategy in diagnostics: {diagnostics}")
        wait_for_any_text(page, STRATEGY_LABELS[strategy], timeout_ms=20000)

        enterprise_count = get_displayed_source_count(
            bool(diagnostics.get("enterpriseKnowledgeUsed")),
            int(diagnostics.get("enterpriseSourceCount") or 0),
        )
        wait_for_any_text(
            page,
            tuple(f"{label} {enterprise_count}" for label in ENTERPRISE_SOURCE_LABELS),
            timeout_ms=20000,
        )
        if diagnostics.get("webResearchUsed") or diagnostics.get("webResearchStatus") == "ready":
            web_count = get_displayed_source_count(
                bool(diagnostics.get("webResearchUsed")),
                int(diagnostics.get("webSourceCount") or 0),
            )
            wait_for_any_text(page, tuple(f"{label} {web_count}" for label in WEB_SOURCE_LABELS), timeout_ms=20000)

        datasets = [item for item in diagnostics.get("enterpriseDatasets") or [] if isinstance(item, str) and item.strip()]
        if datasets:
            wait_for_text(page, datasets[0], timeout_ms=20000)

        references = [item for item in diagnostics.get("enterpriseTitles") or [] if isinstance(item, str) and item.strip()]
        if references:
            wait_for_text(page, references[0], timeout_ms=20000)
    except (AssertionError, PlaywrightTimeoutError):
        return False

    return True


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


def close_preview_if_open(page, timeout_ms: int = 10000):
    dialog = page.get_by_role("dialog")
    if dialog.count() == 0 or not dialog.first.is_visible():
        return

    page.keyboard.press("Escape")
    dialog.first.wait_for(state="hidden", timeout=timeout_ms)


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


def wait_for_locator_count(page, selector: str, minimum: int = 1, timeout_ms: int = 20000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if page.locator(selector).count() >= minimum:
            return
        page.wait_for_timeout(500)

    raise AssertionError(f"locator did not reach expected count: {selector} >= {minimum}")


def resolve_seeded_conversation(page, seed: dict) -> tuple[object, str]:
    expected_id = str(seed.get("conversationId", "")).strip()
    if expected_id:
        by_id = page.get_by_test_id(f"writer-conversation-{expected_id}")
        if by_id.count() >= 1:
            return by_id.first, expected_id

    title = str(seed.get("title", "")).strip()
    candidates = page.locator('[data-testid^="writer-conversation-"]')
    if title:
        by_title = candidates.filter(has=page.get_by_text(title, exact=False))
        if by_title.count() >= 1:
            test_id = by_title.first.get_attribute("data-testid") or ""
            match = re.search(r"writer-conversation-(\d+)", test_id)
            expect(bool(match), f"unable to parse seeded conversation id from {test_id!r}")
            return by_title.first, match.group(1)

    by_prefix = candidates.filter(has=page.get_by_text(re.compile(r"Cursor Validation Seed", re.I)))
    if by_prefix.count() >= 1:
        test_id = by_prefix.first.get_attribute("data-testid") or ""
        match = re.search(r"writer-conversation-(\d+)", test_id)
        expect(bool(match), f"unable to parse seeded conversation id from {test_id!r}")
        return by_prefix.first, match.group(1)

    raise AssertionError("seeded conversation should appear in sidebar")


def wait_for_writer_messages_cleared(page, timeout_ms: int = 20000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        if page.locator("div.rounded-bl-md").count() == 0 and page.locator("div.rounded-br-md").count() == 0:
            return
        page.wait_for_timeout(250)

    raise AssertionError("writer workspace did not clear previous messages in time")


def open_fresh_writer_session(page, *, language: str, debug_name: str | None = None):
    close_preview_if_open(page, timeout_ms=20000)
    clear_writer_session_store(page)
    page.goto(f"{BASE_URL}/dashboard/writer", wait_until="domcontentloaded", timeout=90000)
    page.wait_for_load_state("networkidle", timeout=90000)
    clear_writer_session_store(page)
    page.reload(wait_until="domcontentloaded", timeout=90000)
    page.wait_for_load_state("networkidle", timeout=90000)
    wait_for_writer_workspace_ready(page)
    wait_for_writer_messages_cleared(page)
    set_writer_language(page, language)

    if debug_name:
        save_debug(page, debug_name)


def send_writer_message(page, text: str):
    input_box = page.locator("textarea:visible").first
    input_box.fill(text)
    send_button = page.get_by_test_id("writer-send-button")
    expect(send_button.is_enabled(), "writer send button should be enabled")
    send_button.click()


def wait_for_writer_draft(page, expected_markers: tuple[str, ...], timeout_ms: int = 60000) -> str:
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        try:
            assistant_text = wait_for_non_empty_last_assistant(page, timeout_ms=5000)
        except AssertionError:
            page.wait_for_timeout(500)
            continue
        if any(marker in assistant_text for marker in expected_markers):
            return assistant_text
        page.wait_for_timeout(1000)

    raise AssertionError(f"writer draft did not include expected markers: {expected_markers}")


def text_contains_any_marker(text: str, markers: tuple[str, ...]) -> bool:
    return any(marker in text for marker in markers)


def fetch_writer_history(page):
    conversation_id = get_conversation_id_from_url(page)
    payload = fetch_json(page, f"/api/writer/messages?conversation_id={conversation_id}&limit=20")
    expect(payload["ok"], f"writer messages request failed: {payload['status']}")
    return payload["data"].get("data") or []


def run_brief_regression_checks(page):
    report: dict[str, dict] = {}
    article_markers = (
        "企业知识要点",
        "确认文案并生成配图",
        "复制 Markdown",
    )
    thread_markers = ("Segment 1", "确认文案并生成配图")
    clarification_markers = (
        "主要是写给谁",
        "达成什么结果",
        "Who is the primary audience",
        "What result should the article drive",
    )

    open_fresh_writer_session(page, language="zh", debug_name="06-brief-short-objective-start")
    send_writer_message(page, "我想写一篇关于 AI 销售自动化的公众号文章。")
    page.wait_for_url(re.compile(r".*/dashboard/writer/\d+(?:\\?.*)?$"), timeout=90000)
    first_reply = wait_for_non_empty_last_assistant(page, timeout_ms=60000)
    if text_contains_any_marker(first_reply, article_markers):
        short_reply_draft = first_reply
    else:
        expect(
            text_contains_any_marker(first_reply, clarification_markers),
            f"short-objective scenario should either clarify or draft, got: {first_reply}",
        )
        send_writer_message(page, "促成咨询")
        short_reply_draft = wait_for_writer_draft(page, article_markers, timeout_ms=60000)

    short_reply_history = fetch_writer_history(page)
    short_reply_diagnostics = next(
        (item for item in reversed(short_reply_history) if isinstance(item.get("diagnostics"), dict)),
        None,
    )
    expect(short_reply_diagnostics is not None, "short-objective scenario should persist assistant diagnostics")
    report["short_objective_reply"] = {
        "assistant_excerpt": short_reply_draft[:120],
        "conversationId": get_conversation_id_from_url(page),
    }
    save_debug(page, "07-brief-short-objective-complete")

    open_fresh_writer_session(page, language="zh", debug_name="08-brief-direct-output-start")
    send_writer_message(page, "直接生成一篇关于 AI agent 销售自动化的 X thread")
    page.wait_for_url(re.compile(r".*/dashboard/writer/\d+(?:\\?.*)?$"), timeout=90000)
    direct_output_text = wait_for_writer_draft(page, thread_markers, timeout_ms=60000)
    expect(
        "主要是写给谁" not in direct_output_text,
        "direct-output scenario should not keep clarifying audience",
    )
    expect(
        "达成什么结果" not in direct_output_text,
        "direct-output scenario should not keep clarifying objective",
    )
    report["direct_output_skip_clarification"] = {
        "assistant_excerpt": direct_output_text[:120],
        "conversationId": get_conversation_id_from_url(page),
    }
    save_debug(page, "09-brief-direct-output-complete")

    open_fresh_writer_session(page, language="zh", debug_name="10-brief-turn-limit-start")
    turn_inputs = [
        "想做一篇公众号文章",
        "AI 提效",
        "还没想好",
        "先看看方向",
        "补充不多",
    ]
    for index, text in enumerate(turn_inputs):
        send_writer_message(page, text)
        if index == 0:
            page.wait_for_url(re.compile(r".*/dashboard/writer/\d+(?:\\?.*)?$"), timeout=90000)
        assistant_text = wait_for_non_empty_last_assistant(page, timeout_ms=60000)
        if index < len(turn_inputs) - 1:
            expect(
                text_contains_any_marker(assistant_text, clarification_markers),
                f"turn-limit scenario turn {index + 1} should remain in clarification mode, got: {assistant_text}",
            )
        else:
            expect(
                text_contains_any_marker(assistant_text, article_markers),
                "turn-limit scenario should auto-generate on the fifth user turn",
            )
            report["turn_limit_generation"] = {
                "assistant_excerpt": assistant_text[:120],
                "conversationId": get_conversation_id_from_url(page),
                "userTurns": len(turn_inputs),
            }
    save_debug(page, "11-brief-turn-limit-complete")

    return report


def run_fixture_enabled(page):
    seed = read_seed()
    result = {
        "scenario": SCENARIO,
        "seedConversationId": seed["conversationId"],
        "metrics": {},
    }

    availability = assert_availability(page, enabled=True, provider="aiberm", reason="ok")
    result["availability"] = availability

    wait_for_locator_count(page, 'a[href="/dashboard/writer"]')
    save_debug(page, "00-dashboard")

    start = perf_counter()
    page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    wait_for_writer_workspace_ready(page)
    result["metrics"]["workspace_ready_ms"] = round((perf_counter() - start) * 1000, 2)
    set_sidebar_marker(page)
    save_debug(page, "01-writer-home")

    wait_for_locator_count(page, '[data-testid^="writer-conversation-"]')
    seeded_conversation, seeded_conversation_id = resolve_seeded_conversation(page, seed)

    start = perf_counter()
    seeded_conversation.click()
    page.wait_for_url(re.compile(rf".*/dashboard/writer/{seeded_conversation_id}(?:\\?.*)?$"), timeout=90000)
    assert_sidebar_marker(page)
    assert_preview_not_forced_open(page)
    wait_for_text(page, "Cursor seed turn 25", timeout_ms=20000)
    result["metrics"]["switch_session_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "02-seeded-session")

    start = perf_counter()
    page.get_by_test_id("writer-load-older-button").click()
    wait_for_text(page, "Cursor seed turn 1", timeout_ms=20000)
    result["metrics"]["cursor_pagination_ms"] = round((perf_counter() - start) * 1000, 2)

    renamed_title = f"Renamed Seed {seeded_conversation_id}"
    seeded_conversation.hover()
    page.get_by_test_id(f"writer-rename-{seeded_conversation_id}").click()
    rename_input = page.locator("input:visible").first
    rename_input.fill(renamed_title)
    page.get_by_test_id(f"writer-save-rename-{seeded_conversation_id}").click()
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

    set_writer_language(page, "en")

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
    close_preview_if_open(page)
    assert_grounding_summary_visible(page, diagnostics)
    result["diagnostics"] = diagnostics

    clear_writer_session_store(page)
    page.reload(wait_until="domcontentloaded", timeout=90000)
    page.wait_for_load_state("networkidle", timeout=90000)
    wait_for_writer_workspace_ready(page)
    wait_for_text(page, "Writer Fixture Draft", timeout_ms=30000)
    close_preview_if_open(page)
    assert_grounding_summary_visible(page, diagnostics)
    result["metrics"]["fixture_generation_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "04-fixture-generation")
    save_debug(page, "05-fixture-generation-restored")
    result["brief_regressions"] = run_brief_regression_checks(page)

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
