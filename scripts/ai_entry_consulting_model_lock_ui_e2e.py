from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("AI_ENTRY_E2E_BASE_URL", "http://127.0.0.1:3000").strip().rstrip("/")
SCENARIO = os.environ.get("AI_ENTRY_E2E_SCENARIO", "consulting-model-lock-ui").strip()
ARTIFACT_DIR = Path("artifacts") / "ai-entry" / SCENARIO
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

LOCKED_MODEL_ID = "claude-sonnet-4-6"
SWITCHABLE_MODEL_ID = "openai/gpt-5-4"
DEFAULT_NORMAL_MODEL_ID = "openai/gpt-5-3"


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

    page.goto(f"{BASE_URL}/dashboard", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


def wait_for_chat_interactive(page, timeout_ms: int = 60000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        textarea = page.locator("textarea:visible").first
        if textarea.count() > 0 and not textarea.is_disabled():
            return textarea
        page.wait_for_timeout(250)
    raise AssertionError("ai chat textarea did not become interactive")


def wait_for_chat_request_count(requests: list[dict], expected_count: int, timeout_seconds: int = 30):
    deadline = time() + timeout_seconds
    while time() < deadline:
        if len(requests) >= expected_count:
            return
        sleep(0.2)
    raise AssertionError(f"chat request count not reached: expected={expected_count}, actual={len(requests)}")


def run():
    wait_until_http_ready()

    result: dict[str, object] = {
        "scenario": SCENARIO,
        "base_url": BASE_URL,
        "locked_model_id": LOCKED_MODEL_ID,
        "switchable_model_id": SWITCHABLE_MODEL_ID,
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1460, "height": 1020})
        page = context.new_page()
        page.set_default_timeout(90000)

        chat_requests: list[dict] = []
        model_requests: list[str] = []
        console_errors: list[str] = []

        def on_console(msg):
            if msg.type == "error":
                console_errors.append(msg.text)

        def route_models(route):
            model_requests.append(route.request.url)
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "providerId": "aiberm",
                        "selectedModelId": DEFAULT_NORMAL_MODEL_ID,
                        "modelGroups": [
                            {
                                "family": "anthropic",
                                "label": "Anthropic",
                                "models": [
                                    {"id": LOCKED_MODEL_ID, "name": "Claude Sonnet 4.6"},
                                ],
                            },
                            {
                                "family": "openai",
                                "label": "OpenAI",
                                "models": [
                                    {"id": DEFAULT_NORMAL_MODEL_ID, "name": "GPT 5.3"},
                                    {"id": SWITCHABLE_MODEL_ID, "name": "GPT 5.4"},
                                ],
                            },
                        ],
                    }
                ),
            )

        def route_agents(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps(
                    {
                        "defaultAgentId": "general",
                        "groups": [
                            {"id": "general", "label": {"zh": "通用", "en": "General"}},
                            {"id": "executive", "label": {"zh": "专家", "en": "Executive"}},
                        ],
                        "agents": [
                            {
                                "id": "general",
                                "category": "general",
                                "name": {"zh": "通用助手", "en": "General Assistant"},
                                "description": {"zh": "default", "en": "default"},
                            },
                            {
                                "id": "executive-diagnostic",
                                "category": "executive",
                                "name": {"zh": "经营诊断顾问", "en": "Executive Diagnostic Advisor"},
                                "description": {"zh": "consulting", "en": "consulting"},
                            },
                        ],
                    }
                ),
            )

        def route_chat(route):
            try:
                raw = route.request.post_data or "{}"
                body = json.loads(raw) if raw else {}
                if not isinstance(body, dict):
                    body = {}
                chat_requests.append(body)
                request_index = len(chat_requests)
                route.fulfill(
                    status=200,
                    content_type="application/json",
                    body=json.dumps(
                        {
                            "message": f"smoke test passed #{request_index}",
                            "conversationId": f"mock-conv-{request_index}",
                            "agentId": (
                                body.get("agentConfig", {}).get("agentId")
                                if isinstance(body.get("agentConfig"), dict)
                                else None
                            ),
                            "provider": "fixture",
                            "providerModel": (
                                body.get("modelConfig", {}).get("modelId")
                                if isinstance(body.get("modelConfig"), dict)
                                else None
                            ),
                        }
                    ),
                )
            except Exception:  # noqa: BLE001
                route.fulfill(
                    status=500,
                    content_type="application/json",
                    body=json.dumps({"error": "mock_route_chat_failed"}),
                )

        page.on("console", on_console)
        page.route("**/api/ai/models", route_models)
        page.route("**/api/ai/agents", route_agents)
        page.route("**/api/ai/chat", route_chat)

        try:
            login(context, page)

            # Scenario 1: consulting advisor entry should lock model to sonnet-4-6.
            page.goto(
                f"{BASE_URL}/dashboard/ai?agent=general&entry=consulting-advisor",
                timeout=90000,
                wait_until="domcontentloaded",
            )
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "01-consulting-entry")

            model_combobox_count = page.locator("button[role='combobox']").count()
            expect(
                model_combobox_count == 0,
                f"consulting entry should hide model selector combobox, got={model_combobox_count}",
            )

            locked_model_label = page.get_by_text(re.compile(r"sonnet\s*4\.?6", re.IGNORECASE))
            expect(
                locked_model_label.count() >= 1,
                "consulting entry should show locked sonnet-4.6 model label",
            )

            textarea = wait_for_chat_interactive(page)
            textarea.fill("consulting flow lock test")
            textarea.press("Enter")

            wait_for_chat_request_count(chat_requests, 1)
            save_debug(page, "02-consulting-after-send")

            first_request = chat_requests[0]
            first_agent_config = first_request.get("agentConfig", {})
            first_model_config = first_request.get("modelConfig", {})
            expect(isinstance(first_agent_config, dict), "first request missing agentConfig")
            expect(isinstance(first_model_config, dict), "first request missing modelConfig")
            expect(
                str(first_agent_config.get("agentId") or "").strip() == "general",
                f"consulting agent id mismatch: {first_agent_config}",
            )
            expect(
                str(first_agent_config.get("entryMode") or "").strip() == "consulting-advisor",
                f"consulting entryMode missing: {first_agent_config}",
            )
            expect(
                str(first_model_config.get("modelId") or "").strip() == LOCKED_MODEL_ID,
                f"consulting locked model mismatch: {first_model_config}",
            )

            # Scenario 2: normal AI page with same agent should allow model switching.
            page.goto(
                f"{BASE_URL}/dashboard/ai?agent=general",
                timeout=90000,
                wait_until="domcontentloaded",
            )
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "03-normal-entry")

            combobox = page.locator("button[role='combobox']").first
            expect(combobox.count() == 1, "normal ai page should show model selector combobox")
            combobox.click()
            page.get_by_role("option", name=re.compile(r"gpt\s*5\.4", re.IGNORECASE)).click()

            textarea = wait_for_chat_interactive(page)
            textarea.fill("normal flow switch model test")
            textarea.press("Enter")

            wait_for_chat_request_count(chat_requests, 2)
            save_debug(page, "04-normal-after-send")

            second_request = chat_requests[1]
            second_agent_config = second_request.get("agentConfig", {})
            second_model_config = second_request.get("modelConfig", {})
            expect(isinstance(second_agent_config, dict), "second request missing agentConfig")
            expect(isinstance(second_model_config, dict), "second request missing modelConfig")
            expect(
                str(second_agent_config.get("agentId") or "").strip() == "general",
                f"normal request agent id mismatch: {second_agent_config}",
            )
            expect(
                "entryMode" not in second_agent_config
                or not str(second_agent_config.get("entryMode") or "").strip(),
                f"normal request should not carry consulting entryMode: {second_agent_config}",
            )
            expect(
                str(second_model_config.get("modelId") or "").strip() == SWITCHABLE_MODEL_ID,
                f"normal request model switch not applied: {second_model_config}",
            )

            critical_console_errors = [
                item
                for item in console_errors
                if "favicon" not in item.lower() and "failed to load resource" not in item.lower()
            ]
            expect(
                not critical_console_errors,
                f"critical console errors found: {critical_console_errors[:5]}",
            )

            result["ok"] = True
            result["chat_request_count"] = len(chat_requests)
            result["model_request_count"] = len(model_requests)
            result["final_url"] = page.url
            result["first_request"] = {
                "agentConfig": first_agent_config,
                "modelConfig": first_model_config,
            }
            result["second_request"] = {
                "agentConfig": second_agent_config,
                "modelConfig": second_model_config,
            }
        finally:
            browser.close()

    (ARTIFACT_DIR / "result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("AI_ENTRY_CONSULTING_MODEL_LOCK_UI_E2E_SUMMARY_START")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("AI_ENTRY_CONSULTING_MODEL_LOCK_UI_E2E_SUMMARY_END")


if __name__ == "__main__":
    try:
        run()
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:  # noqa: BLE001
        print(f"ai_entry_consulting_model_lock_ui_e2e: FAIL: {error}")
        raise
