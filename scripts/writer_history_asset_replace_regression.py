from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://127.0.0.1:3123").strip()
ARTIFACT_DIR = Path("artifacts") / "writer-history-asset-replace"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

EMPTY_SLOT_BLOCK_RE = re.compile(
    r"<!--\s*writer-asset-slot:start:cover\s*-->\s*\n\s*<!--\s*writer-asset-slot:end:cover\s*-->",
    re.IGNORECASE,
)

HISTORY_SENTINEL = "History Asset Regression Sentinel"


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


def _parse_response_json_safe(response):
    try:
        return response.json()
    except Exception:  # noqa: BLE001
        return {"_raw": response.text()}


def api_request_json(context, method: str, path: str, payload: dict | None = None):
    kwargs = {"timeout": 120000}
    if payload is not None:
        kwargs["headers"] = {"Content-Type": "application/json"}
        kwargs["data"] = json.dumps(payload, ensure_ascii=False)

    response = context.request.fetch(
        f"{BASE_URL}{path}",
        method=method.upper(),
        **kwargs,
    )
    data = _parse_response_json_safe(response)
    return response, data


def api_get_json(context, path: str):
    return api_request_json(context, "GET", path)


def poll_task(context, task_id: str, timeout_seconds: int = 240):
    deadline = time() + timeout_seconds
    last_payload = None
    while time() < deadline:
        response, payload = api_get_json(context, f"/api/tasks/{task_id}")
        expect(response.ok, f"task status request failed: {response.status} {payload}")
        last_payload = payload
        status = (payload.get("data") or {}).get("status")
        if status in ("success", "failed"):
            return status, payload
        sleep(1.2)

    raise AssertionError(f"task timeout: {last_payload}")


def fetch_messages(context, conversation_id: str, limit: int = 50):
    response, payload = api_get_json(context, f"/api/writer/messages?conversation_id={conversation_id}&limit={limit}")
    expect(response.ok, f"messages fetch failed: {response.status} {payload}")
    return payload.get("data") or []


def build_forced_history_markdown():
    return (
        f"# {HISTORY_SENTINEL}\n\n"
        "This is a regression baseline message to verify historical bubble replacement.\n"
        "It is intentionally long enough to trigger full preview controls and image-generation actions.\n"
        "The empty managed slot block below must be replaced after image generation.\n\n"
        "<!-- writer-asset-slot:start:cover -->\n"
        "<!-- writer-asset-slot:end:cover -->\n\n"
        "## Expected behavior\n\n"
        "- Show placeholder while image generation is running.\n"
        "- Persist generated image markdown back to this historical assistant message.\n"
        "- Replace the empty slot block with a managed block that includes a real image URL.\n"
    )


def wait_until_historical_message_replaced(context, conversation_id: str, assistant_id: str, timeout_seconds: int = 180):
    deadline = time() + timeout_seconds
    last_content = ""
    while time() < deadline:
        entries = fetch_messages(context, conversation_id, limit=60)
        target = next((entry for entry in entries if str(entry.get("id")) == str(assistant_id)), None)
        expect(target is not None, f"assistant message not found during polling: {assistant_id}")
        content = str(target.get("answer") or "")
        last_content = content

        has_cover_image_markdown = "![Cover](" in content and "http" in content
        still_empty = bool(EMPTY_SLOT_BLOCK_RE.search(content))
        if has_cover_image_markdown and not still_empty:
            return content

        sleep(1.5)

    raise AssertionError(f"historical message did not get replaced in time: {last_content[:500]}")


def wait_for_network_event(
    events: list[dict],
    predicate,
    timeout_seconds: int,
    error_message: str,
    page=None,
):
    deadline = time() + timeout_seconds
    while time() < deadline:
        for event in events:
            if predicate(event):
                return event
        if page is not None:
            page.wait_for_timeout(200)
        else:
            sleep(0.2)

    snapshot = events[-8:] if events else []
    raise AssertionError(f"{error_message}; recent_events={snapshot}")


def login_demo(context, page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    login_response = context.request.post(f"{BASE_URL}/api/auth/demo", timeout=90000)
    expect(login_response.ok, f"demo login failed: {login_response.status} {login_response.text()}")


def wait_for_writer_workspace_ready(page, timeout_ms: int = 90000):
    page.wait_for_selector("textarea:visible", state="visible", timeout=timeout_ms)
    page.wait_for_selector("[data-testid='writer-send-button']", state="attached", timeout=timeout_ms)


def main():
    wait_until_http_ready()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1460, "height": 1120})
        page = context.new_page()
        page.set_default_timeout(90000)
        assets_requests: list[dict] = []
        assets_responses: list[dict] = []
        patch_requests: list[dict] = []
        patch_responses: list[dict] = []
        assets_failures: list[dict] = []

        def on_request(request):
            if "/api/writer/assets" in request.url and request.method.upper() == "POST":
                assets_requests.append(
                    {
                        "url": request.url,
                        "method": request.method.upper(),
                        "body": request.post_data or "",
                    }
                )
            if "/api/writer/messages" in request.url and request.method.upper() == "PATCH":
                patch_requests.append(
                    {
                        "url": request.url,
                        "method": request.method.upper(),
                        "body": request.post_data or "",
                    }
                )

        def on_response(response):
            request = response.request
            if "/api/writer/assets" in response.url and request.method.upper() == "POST":
                assets_responses.append(
                    {
                        "url": response.url,
                        "status": response.status,
                        "body": request.post_data or "",
                    }
                )
            if "/api/writer/messages" in response.url and request.method.upper() == "PATCH":
                patch_responses.append(
                    {
                        "url": response.url,
                        "status": response.status,
                        "body": request.post_data or "",
                    }
                )

        def on_request_failed(request):
            if "/api/writer/assets" in request.url and request.method.upper() == "POST":
                failure = request.failure or {}
                assets_failures.append(
                    {
                        "url": request.url,
                        "method": request.method.upper(),
                        "body": request.post_data or "",
                        "failure": failure,
                    }
                )

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)

        try:
            login_demo(context, page)
            page.goto(f"{BASE_URL}/dashboard/writer", timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            wait_for_writer_workspace_ready(page)
            save_debug(page, "01-writer-home")

            first_query = (
                "Write a Chinese long-form WeChat article about practical AI workflow implementation in SMB teams. "
                "Directly write it, no follow-up questions."
            )
            response_1, payload_1 = api_request_json(
                context,
                "POST",
                "/api/writer/chat",
                {
                    "query": first_query,
                    "inputs": {"contents": first_query},
                    "conversation_id": None,
                    "platform": "wechat",
                    "mode": "article",
                    "language": "auto",
                },
            )
            expect(response_1.ok, f"first chat request failed: {response_1.status} {payload_1}")
            conversation_id = str(payload_1.get("conversation_id") or "")
            task_id_1 = str(payload_1.get("task_id") or "")
            expect(conversation_id and task_id_1, f"first chat payload invalid: {payload_1}")
            status_1, task_payload_1 = poll_task(context, task_id_1)
            expect(status_1 == "success", f"first task failed: {task_payload_1}")

            entries_after_first = fetch_messages(context, conversation_id)
            expect(len(entries_after_first) >= 1, "first conversation has no assistant entries")
            first_assistant_id = str(entries_after_first[0].get("id"))
            expect(first_assistant_id, "missing first assistant message id")

            forced_markdown = build_forced_history_markdown()
            patch_response, patch_payload = api_request_json(
                context,
                "PATCH",
                "/api/writer/messages",
                {
                    "conversation_id": conversation_id,
                    "message_id": first_assistant_id,
                    "content": forced_markdown,
                },
            )
            expect(patch_response.ok, f"failed to patch first assistant: {patch_response.status} {patch_payload}")

            second_query = (
                "Rewrite the above into a short thread style summary in Chinese with 5 sections, still no follow-up questions."
            )
            response_2, payload_2 = api_request_json(
                context,
                "POST",
                "/api/writer/chat",
                {
                    "query": second_query,
                    "inputs": {"contents": second_query},
                    "conversation_id": conversation_id,
                    "platform": "wechat",
                    "mode": "article",
                    "language": "auto",
                },
            )
            expect(response_2.ok, f"second chat request failed: {response_2.status} {payload_2}")
            task_id_2 = str(payload_2.get("task_id") or "")
            expect(task_id_2, f"missing second task id: {payload_2}")
            status_2, task_payload_2 = poll_task(context, task_id_2)
            expect(status_2 == "success", f"second task failed: {task_payload_2}")

            entries_before_generate = fetch_messages(context, conversation_id, limit=60)
            history_entry = next((entry for entry in entries_before_generate if str(entry.get("id")) == first_assistant_id), None)
            expect(history_entry is not None, "patched historical entry missing before generation")
            history_content_before = str(history_entry.get("answer") or "")
            expect(HISTORY_SENTINEL in history_content_before, "historical entry does not contain sentinel title")
            expect(
                bool(EMPTY_SLOT_BLOCK_RE.search(history_content_before)),
                "historical entry is not in the expected empty-slot baseline state",
            )

            page.goto(f"{BASE_URL}/dashboard/writer/{conversation_id}", timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            wait_for_writer_workspace_ready(page)
            page.get_by_text(HISTORY_SENTINEL, exact=False).first.wait_for(state="visible", timeout=60000)
            save_debug(page, "02-session-loaded")

            assets_requests.clear()
            assets_responses.clear()
            patch_requests.clear()
            patch_responses.clear()
            assets_failures.clear()

            historical_button = page.locator(f"[data-testid='writer-generate-images-assistant_{first_assistant_id}']").first
            historical_button.wait_for(state="visible", timeout=60000)
            with page.expect_response(
                lambda response: "/api/writer/assets" in response.url and response.request.method.upper() == "POST",
                timeout=300000,
            ) as assets_response_info:
                historical_button.click()
            assets_response = assets_response_info.value

            wait_for_network_event(
                assets_requests,
                lambda event: "/api/writer/assets" in event.get("url", ""),
                timeout_seconds=30,
                error_message="historical generate click did not trigger /api/writer/assets request",
            )
            expect(
                assets_response.status == 200,
                f"writer assets request returned non-200: status={assets_response.status}",
            )
            wait_for_network_event(
                patch_responses,
                lambda event: event.get("status") == 200 and f"\"message_id\":\"{first_assistant_id}\"" in event.get("body", ""),
                timeout_seconds=300,
                error_message="historical /api/writer/messages PATCH did not return 200",
                page=page,
            )

            replaced_content = wait_until_historical_message_replaced(context, conversation_id, first_assistant_id)
            expect("![Cover](" in replaced_content, "historical content missing generated cover markdown")
            expect(not EMPTY_SLOT_BLOCK_RE.search(replaced_content), "historical content still contains empty slot block")

            sentinel_frame = page.locator("div").filter(has_text=HISTORY_SENTINEL).first
            sentinel_frame.wait_for(state="visible", timeout=60000)
            sentinel_frame.locator("img").first.wait_for(state="visible", timeout=120000)
            save_debug(page, "03-history-image-replaced")

            report = {
                "baseUrl": BASE_URL,
                "conversationId": conversation_id,
                "historicalAssistantId": first_assistant_id,
                "status": "pass",
            }
            (ARTIFACT_DIR / "result.json").write_text(
                json.dumps(report, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(json.dumps(report, ensure_ascii=False))
        except (AssertionError, PlaywrightTimeoutError, Exception):
            try:
                save_debug(page, "99-failure")
            except Exception:
                pass
            failure_report = {
                "assets_requests": assets_requests,
                "assets_responses": assets_responses,
                "assets_failures": assets_failures,
                "patch_requests": patch_requests,
                "patch_responses": patch_responses,
            }
            try:
                (ARTIFACT_DIR / "failure-network.json").write_text(
                    json.dumps(failure_report, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
            except Exception:
                pass
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
