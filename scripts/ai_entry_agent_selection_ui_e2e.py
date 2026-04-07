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
SCENARIO = os.environ.get("AI_ENTRY_E2E_SCENARIO", "agent-selection-ui").strip()
EXPECTED_AGENT_ID = os.environ.get("AI_ENTRY_E2E_AGENT_ID", "executive-diagnostic").strip()
REAL_MODE = os.environ.get("AI_ENTRY_E2E_REAL_MODE", "false").strip().lower() in {"1", "true", "yes"}
ALLOW_MOCK_FALLBACK = os.environ.get("AI_ENTRY_E2E_ALLOW_MOCK_FALLBACK", "true").strip().lower() in {
    "1",
    "true",
    "yes",
}

ARTIFACT_DIR = Path("artifacts") / "ai-entry" / SCENARIO
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
        except Exception as error:  # noqa: BLE001
            last_error = error
        sleep(1)
    raise RuntimeError(f"application did not become ready: {last_error}")


def request_json(request_context, method: str, pathname: str, payload: dict | None = None):
    url = f"{BASE_URL}{pathname}"
    if method.upper() == "GET":
        response = request_context.get(url, timeout=90000)
    else:
        response = request_context.post(
            url,
            timeout=90000,
            headers={"Content-Type": "application/json"},
            data=json.dumps(payload or {}),
        )

    body = {}
    try:
        body = response.json()
    except Exception:  # noqa: BLE001
        body = {}

    return response.ok, response.status, body


def resolve_working_model(request_context):
    ok, status, models_payload = request_json(request_context, "GET", "/api/ai/models")
    expect(ok, f"models api failed while resolving working model: {status}")

    provider_id = str(models_payload.get("providerId") or "").strip()
    models = models_payload.get("models") or []
    selected_model_id = str(models_payload.get("selectedModelId") or "").strip()

    expect(provider_id, "providerId missing from /api/ai/models")
    expect(isinstance(models, list) and len(models) > 0, "models list empty in /api/ai/models")

    candidates: list[str] = []
    seen = set()

    def push_model(model_id: str):
        normalized = model_id.strip()
        if not normalized or normalized in seen:
            return
        seen.add(normalized)
        candidates.append(normalized)

    if selected_model_id:
        push_model(selected_model_id)

    for item in models:
        if len(candidates) >= 12:
            break
        push_model(str((item or {}).get("id") or ""))

    expect(candidates, "no model candidates available for probing")

    attempts = []
    for model_id in candidates:
        ok, probe_status, probe_payload = request_json(
            request_context,
            "POST",
            "/api/ai/chat",
            {
                "stream": False,
                "messages": [{"role": "user", "content": "Reply with exactly: smoke test passed."}],
                "modelConfig": {"providerId": provider_id, "modelId": model_id},
            },
        )
        if ok and isinstance(probe_payload, dict) and str(probe_payload.get("message") or "").strip():
            return provider_id, model_id

        error_text = str(probe_payload.get("error") or "")
        attempts.append({"modelId": model_id, "status": probe_status, "error": error_text[:180]})
        normalized = error_text.lower()
        if not (
            "not implemented" in normalized
            or "temporarily unavailable" in normalized
            or "connect timeout" in normalized
            or "unsupported model" in normalized
            or "model not found" in normalized
            or "terms of service" in normalized
        ):
            break

    raise AssertionError(f"unable to resolve working model: {attempts[:5]}")


def create_ai_entry_conversation(request_context):
    ok, status, payload = request_json(
        request_context,
        "POST",
        "/api/ai/conversations",
        {"title": "[e2e] agent selection ui"},
    )
    expect(ok, f"failed to create ai conversation for mock mode: {status}")
    data = payload.get("data") if isinstance(payload, dict) else {}
    conversation_id = str((data or {}).get("id") or "").strip()
    expect(conversation_id, f"conversation id missing in response: {payload}")
    return conversation_id


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
        page.wait_for_timeout(300)
    raise AssertionError("ai chat textarea did not become interactive")


def run():
    wait_until_http_ready()

    result: dict[str, object] = {
        "scenario": SCENARIO,
        "base_url": BASE_URL,
        "expected_agent_id": EXPECTED_AGENT_ID,
        "mode_requested": "real" if REAL_MODE else "mock",
    }

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1460, "height": 1020})
        page = context.new_page()
        page.set_default_timeout(90000)

        console_errors: list[str] = []
        chat_payloads: list[dict[str, object]] = []
        chat_request_count = 0
        outbound_agent_ids: list[str] = []
        outbound_model_ids: list[str] = []

        def on_console(msg):
            if msg.type == "error":
                console_errors.append(msg.text)

        def on_request(request):
            nonlocal chat_request_count
            if "/api/ai/chat" in request.url and request.method == "POST":
                chat_request_count += 1

        def on_response(response):
            if "/api/ai/chat" not in response.url:
                return
            if response.request.method != "POST":
                return
            try:
                raw = response.text()
                payload = json.loads(raw) if raw else {}
            except Exception:  # noqa: BLE001
                return
            if isinstance(payload, dict):
                chat_payloads.append(payload)

        page.on("console", on_console)
        page.on("request", on_request)
        page.on("response", on_response)

        try:
            login(context, page)

            use_real_mode = REAL_MODE
            provider_id = ""
            model_id = ""
            mock_fallback_reason = ""
            mock_conversation_id = ""

            if use_real_mode:
                try:
                    provider_id, model_id = resolve_working_model(context.request)
                except AssertionError as error:
                    if not ALLOW_MOCK_FALLBACK:
                        raise
                    use_real_mode = False
                    mock_fallback_reason = str(error)

            if use_real_mode:
                result["mode"] = "real"
                result["forced_model_provider"] = provider_id
                result["forced_model_id"] = model_id
            else:
                result["mode"] = "mock"
                if mock_fallback_reason:
                    result["mock_fallback_reason"] = mock_fallback_reason
                mock_conversation_id = create_ai_entry_conversation(context.request)
                result["mock_conversation_id"] = mock_conversation_id

            def on_route_chat(route):
                try:
                    request = route.request
                    raw_post_data = request.post_data or "{}"
                    body = json.loads(raw_post_data) if raw_post_data else {}
                    if not isinstance(body, dict):
                        body = {}

                    agent_config = body.get("agentConfig")
                    if isinstance(agent_config, dict):
                        outbound_agent_ids.append(str(agent_config.get("agentId") or ""))
                    else:
                        outbound_agent_ids.append("")

                    model_config = body.get("modelConfig")
                    if isinstance(model_config, dict):
                        outbound_model_ids.append(str(model_config.get("modelId") or ""))
                    else:
                        outbound_model_ids.append("")

                    if use_real_mode:
                        if not isinstance(model_config, dict):
                            model_config = {}
                        model_config["providerId"] = provider_id
                        model_config["modelId"] = model_id
                        body["modelConfig"] = model_config
                        route.continue_(post_data=json.dumps(body))
                        return

                    route.fulfill(
                        status=200,
                        content_type="application/json",
                        body=json.dumps(
                            {
                                "message": "smoke test passed.",
                                "conversationId": mock_conversation_id,
                                "agentId": EXPECTED_AGENT_ID,
                                "provider": "fixture",
                                "providerModel": "fixture/mock-model",
                            }
                        ),
                    )
                except Exception:  # noqa: BLE001
                    route.continue_()

            page.route("**/api/ai/chat", on_route_chat)

            target_url = f"{BASE_URL}/dashboard/ai?agent={EXPECTED_AGENT_ID}"
            page.goto(target_url, timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)

            expect(
                f"agent={EXPECTED_AGENT_ID}" in page.url,
                f"expected agent query in url before send: {page.url}",
            )
            save_debug(page, "01-ai-entry-landing")

            textarea = wait_for_chat_interactive(page)
            textarea.click()
            page.keyboard.type("Reply with exactly: smoke test passed.")
            page.keyboard.press("Enter")

            deadline = time() + 120
            while time() < deadline:
                if "/dashboard/ai/" in page.url and chat_payloads:
                    break
                if chat_request_count >= 1 and chat_payloads:
                    break
                page.wait_for_timeout(400)

            save_debug(page, "02-ai-entry-after-first-message")

            expect(chat_request_count >= 1, "expected at least one /api/ai/chat request")
            expect(chat_payloads, "missing /api/ai/chat response payload")

            last_payload = chat_payloads[-1]
            if "error" in last_payload:
                raise AssertionError(f"chat api returned error payload: {last_payload}")

            route_deadline = time() + 30
            while time() < route_deadline:
                if "/dashboard/ai/" in page.url:
                    break
                page.wait_for_timeout(300)

            expect(
                "/dashboard/ai/" in page.url,
                (
                    "conversation route missing after send: "
                    f"{page.url}; chat_payload={last_payload}; mode={result['mode']}"
                ),
            )
            expect(
                f"agent={EXPECTED_AGENT_ID}" in page.url,
                f"agent query should persist after first send: {page.url}",
            )
            expect(
                any(item.strip() == EXPECTED_AGENT_ID for item in outbound_agent_ids),
                f"agent id missing from outbound request payloads: {outbound_agent_ids}",
            )
            expect(
                any(item.strip() for item in outbound_model_ids),
                f"model id missing from outbound request payloads: {outbound_model_ids}",
            )

            returned_agent_id = str(last_payload.get("agentId") or "").strip()
            expect(returned_agent_id == EXPECTED_AGENT_ID, f"agent mismatch: {returned_agent_id}")

            assistant_text = page.get_by_text(re.compile(r"smoke test passed", re.IGNORECASE))
            expect(assistant_text.count() >= 1, "assistant response text not found after send")

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
            result["final_url"] = page.url
            result["returned_agent_id"] = returned_agent_id
            result["assistant_preview"] = str(last_payload.get("message") or "")[:120]
            result["conversation_id"] = str(last_payload.get("conversationId") or "")
            result["outbound_agent_ids"] = outbound_agent_ids
            result["outbound_model_ids"] = outbound_model_ids
        finally:
            browser.close()

    (ARTIFACT_DIR / "result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("AI_ENTRY_AGENT_UI_E2E_SUMMARY_START")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print("AI_ENTRY_AGENT_UI_E2E_SUMMARY_END")


if __name__ == "__main__":
    try:
        run()
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:  # noqa: BLE001
        print(f"ai_entry_agent_selection_ui_e2e: FAIL: {error}")
        raise
