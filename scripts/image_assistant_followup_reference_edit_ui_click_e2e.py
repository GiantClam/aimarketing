from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from time import perf_counter, sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3223").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "followup-reference-edit-ui-click").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / SCENARIO
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


def fetch_json(page, path: str):
    return page.evaluate(
        """async ({ baseUrl, path }) => {
            const response = await fetch(`${baseUrl}${path}`, {
              credentials: "include",
              cache: "no-store",
            })
            const data = await response.json().catch(() => ({}))
            return { ok: response.ok, status: response.status, data }
        }""",
        {"baseUrl": BASE_URL, "path": path},
    )


def fetch_session_detail(page, session_id: str):
    payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=80&versionLimit=30")
    detail = (payload.get("data") or {}).get("data") if payload.get("ok") else None
    return payload, detail


def wait_for_task_success(page, task_id: str, timeout_seconds: int = 240):
    deadline = time() + timeout_seconds
    last_payload = None
    while time() < deadline:
        payload = fetch_json(page, f"/api/tasks/{task_id}")
        last_payload = payload
        data = (payload.get("data") or {}).get("data") if payload.get("ok") else None
        status = data.get("status") if isinstance(data, dict) else None
        if status == "success":
            return data
        if status == "failed":
            raise AssertionError(f"task failed: {payload}")
        sleep(1)
    raise AssertionError(f"task timeout {task_id}: {last_payload}")


def find_latest_prompt_question(detail: dict):
    messages = detail.get("messages") or []
    for message in reversed(messages):
        if message.get("role") != "assistant":
            continue
        for payload in [message.get("response_payload"), message.get("request_payload")]:
            orchestration = payload.get("orchestration") if isinstance(payload, dict) else None
            if not isinstance(orchestration, dict):
                continue
            prompt_questions = orchestration.get("prompt_questions") or []
            if prompt_questions and isinstance(prompt_questions[0], dict):
                return {
                    "message_id": str(message.get("id") or ""),
                    "orchestration": orchestration,
                    "question": prompt_questions[0],
                }
    return None


def wait_for_question(page, session_id: str, question_ids: set[str], timeout_seconds: int = 180):
    deadline = time() + timeout_seconds
    last_detail = None
    while time() < deadline:
        _, detail = fetch_session_detail(page, session_id)
        last_detail = detail
        if not isinstance(detail, dict):
            sleep(1)
            continue
        latest_prompt = find_latest_prompt_question(detail)
        if not latest_prompt:
            sleep(1)
            continue
        question = latest_prompt["question"]
        question_id = str(question.get("id") or "")
        if question_id in question_ids:
            return latest_prompt
        sleep(1)
    raise AssertionError(f"question {sorted(question_ids)} not reached: {last_detail}")


def pick_option(question: dict, preferred_option_id: str | None = None):
    options = question.get("options") if isinstance(question, dict) else None
    expect(isinstance(options, list) and len(options) > 0, f"question has no options: {question}")
    selected = None
    if preferred_option_id:
        for option in options:
            if isinstance(option, dict) and option.get("id") == preferred_option_id:
                selected = option
                break
    if selected is None:
        selected = options[0]
    expect(isinstance(selected, dict), f"invalid option: {selected}")
    option_id = str(selected.get("id") or "").strip()
    label = str(selected.get("label") or "").strip()
    expect(bool(option_id), f"option id missing: {selected}")
    return {"id": option_id, "label": label}


def click_option_and_wait_task(page, question_id: str, option_id: str):
    question_test_id = f"image-prompt-question-{question_id}"
    option_test_id = f"image-prompt-option-{question_id}-{option_id}"
    question_locator = page.get_by_test_id(question_test_id)
    question_locator.wait_for(state="visible", timeout=90000)

    option_button = page.get_by_test_id(option_test_id)
    option_button.wait_for(state="visible", timeout=90000)
    option_button.scroll_into_view_if_needed()

    started = perf_counter()
    with page.expect_response(
        lambda response: response.url.endswith("/api/image-assistant/generate")
        and response.request.method == "POST"
        and response.status == 200,
        timeout=90000,
    ) as response_info:
        option_button.click()
    payload = response_info.value.json()
    data = payload.get("data") or {}
    task_id = str(data.get("task_id") or "")
    session_id = str(data.get("session_id") or "")
    expect(bool(session_id), f"missing session id for {question_id}:{option_id}: {payload}")
    is_direct = bool(data.get("direct"))
    if not is_direct:
        expect(bool(task_id), f"missing task id for {question_id}:{option_id}: {payload}")
        wait_for_task_success(page, task_id)
    return {
        "task_id": task_id or None,
        "session_id": session_id,
        "elapsed_ms": round((perf_counter() - started) * 1000, 2),
        "direct": is_direct,
    }


def wait_for_generated_result(page, session_id: str, timeout_seconds: int = 240):
    deadline = time() + timeout_seconds
    last_detail = None
    while time() < deadline:
        _, detail = fetch_session_detail(page, session_id)
        last_detail = detail
        if not isinstance(detail, dict):
            sleep(1)
            continue
        versions = detail.get("versions") or []
        messages = detail.get("messages") or []
        has_result_summary = any(
            message.get("role") == "assistant" and message.get("message_type") == "result_summary"
            for message in messages
        )
        if versions and has_result_summary:
            return detail
        sleep(1)
    raise AssertionError(f"generated result not ready: {last_detail}")


def wait_for_followup_edit_result(page, session_id: str, prompt_token: str, initial_version_id: str, timeout_seconds: int = 240):
    deadline = time() + timeout_seconds
    last_detail = None
    while time() < deadline:
        _, detail = fetch_session_detail(page, session_id)
        last_detail = detail
        if not isinstance(detail, dict):
            sleep(1)
            continue

        messages = detail.get("messages") or []
        versions = detail.get("versions") or []
        user_index = -1
        user_message = None
        for idx in range(len(messages) - 1, -1, -1):
            message = messages[idx]
            if message.get("role") == "user" and message.get("message_type") == "prompt" and prompt_token in str(
                message.get("content") or ""
            ):
                user_index = idx
                user_message = message
                break
        if user_index < 0 or not isinstance(user_message, dict):
            sleep(1)
            continue

        assistant_after = [
            message
            for idx, message in enumerate(messages)
            if idx > user_index and message.get("role") == "assistant" and message.get("created_version_id")
        ]
        if not assistant_after:
            sleep(1)
            continue

        assistant_message = assistant_after[-1]
        version_id = str(assistant_message.get("created_version_id") or "")
        if not version_id or version_id == initial_version_id:
            sleep(1)
            continue

        version = next((item for item in versions if str(item.get("id") or "") == version_id), None)
        if not version:
            sleep(1)
            continue

        return {
            "detail": detail,
            "user_message": user_message,
            "assistant_message": assistant_message,
            "version": version,
        }
    raise AssertionError(f"follow-up edit result not ready: {last_detail}")


def wait_for_composer_ready(page, timeout_ms: int = 120000, retries: int = 3):
    for attempt in range(retries):
        try:
            page.wait_for_function(
                """() => {
                    const prompt = document.querySelector('[data-testid="image-prompt-input"]')
                    if (!prompt) return false
                    return !prompt.disabled
                }""",
                timeout=timeout_ms,
            )
            return
        except PlaywrightTimeoutError:
            if attempt == retries - 1:
                raise
            page.evaluate(
                """() => {
                    try {
                      sessionStorage.removeItem("assistant-async-task-store-v2")
                      sessionStorage.removeItem("assistant-async-task-store-v1")
                    } catch (error) {
                      // ignore
                    }
                }"""
            )
            page.reload(wait_until="domcontentloaded", timeout=90000)
            page.wait_for_timeout(1000)


def wait_for_submit_enabled(page, timeout_ms: int = 120000):
    page.wait_for_function(
        """() => {
            const prompt = document.querySelector('[data-testid="image-prompt-input"]')
            const submit = document.querySelector('[data-testid="image-generate-button"]')
            if (!prompt || !submit) return false
            const value = prompt.value || ""
            return value.trim().length > 0 && !prompt.disabled && !submit.disabled
        }""",
        timeout=timeout_ms,
    )


def login_demo(page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    response = page.evaluate(
        """async (baseUrl) => {
            const result = await fetch(`${baseUrl}/api/auth/demo`, {
              method: "POST",
              credentials: "include",
            })
            const data = await result.json().catch(() => ({}))
            return { ok: result.ok, status: result.status, data }
        }""",
        BASE_URL,
    )
    expect(response["ok"], f"demo login failed: {response}")


def run():
    wait_until_http_ready()
    result: dict[str, object] = {"scenario": SCENARIO, "base_url": BASE_URL, "steps": [], "metrics": {}}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1480, "height": 1100})
        page.set_default_timeout(90000)

        try:
            login_started = perf_counter()
            login_demo(page)
            result["metrics"]["login_ms"] = round((perf_counter() - login_started) * 1000, 2)

            page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
            prompt_input = page.get_by_test_id("image-prompt-input")
            prompt_input.wait_for(state="visible", timeout=90000)
            save_debug(page, "01-home")

            initial_prompt = (
                "Create a website banner 16:9 in 1K. Goal: launch visual. "
                "Subject: a red and black multi-head CNC machine in a futuristic Tesla-like factory, "
                "with a handsome white worker operating it. "
                "Style: industrial cinematic, premium, realistic. "
                "Composition: 16:9 landscape with centered machine focus and text-safe whitespace."
            )
            prompt_input.fill(initial_prompt)
            first_started = perf_counter()
            with page.expect_response(
                lambda response: response.url.endswith("/api/image-assistant/generate")
                and response.request.method == "POST"
                and response.status == 200,
                timeout=180000,
            ) as response_info:
                page.get_by_test_id("image-generate-button").click()
            initial_response = response_info.value.json()
            initial_data = initial_response.get("data") or {}
            task_id = str(initial_data.get("task_id") or "")
            session_id = str(initial_data.get("session_id") or "")
            expect(bool(session_id), f"initial session id missing: {initial_response}")
            if not initial_data.get("direct"):
                expect(bool(task_id), f"initial task id missing: {initial_response}")
                wait_for_task_success(page, task_id)
            result["session_id"] = session_id
            result["steps"].append({"step": "initial_prompt", "task_id": task_id or None})
            result["metrics"]["initial_prompt_task_ms"] = round((perf_counter() - first_started) * 1000, 2)
            save_debug(page, "02-after-initial")

            first_result_started = perf_counter()
            first_detail = wait_for_generated_result(page, session_id)
            result["metrics"]["first_result_ready_ms"] = round((perf_counter() - first_result_started) * 1000, 2)
            first_versions = first_detail.get("versions") or []
            expect(bool(first_versions), f"initial versions missing: {first_detail}")
            initial_version = first_versions[0]
            initial_version_id = str(initial_version.get("id") or "")
            expect(bool(initial_version_id), f"initial version id missing: {initial_version}")
            result["initial_version_id"] = initial_version_id
            result["one_shot_generated"] = True
            save_debug(page, "05-first-generated")

            followup_token = f"followup-{int(time())}"
            followup_prompt = (
                f"\u5c06\u4e0a\u8ff0\u56fe\u7247\u4e2d\u7684\u4eba\u7269\uff0c\u6539\u4e3a\u4e2d\u56fd\u5de5\u4eba\u3002"
                f"token={followup_token}"
            )
            page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
            prompt_input = page.get_by_test_id("image-prompt-input")
            prompt_input.wait_for(state="visible", timeout=90000)
            wait_for_composer_ready(page)
            prompt_input.fill(followup_prompt)
            wait_for_submit_enabled(page)
            followup_started = perf_counter()
            with page.expect_response(
                lambda response: (
                    response.url.endswith("/api/image-assistant/edit")
                    or response.url.endswith("/api/image-assistant/generate")
                )
                and response.request.method == "POST"
                and response.status == 200,
                timeout=180000,
            ) as followup_response_info:
                page.get_by_test_id("image-generate-button").click()

            followup_response = followup_response_info.value
            followup_payload = followup_response.json()
            followup_outer_data = followup_payload.get("data") or {}
            followup_data = (
                followup_outer_data.get("data")
                if isinstance(followup_outer_data, dict) and isinstance(followup_outer_data.get("data"), dict)
                else followup_outer_data
            )
            followup_task_id = str(followup_data.get("task_id") or "")
            followup_session_id = str(followup_data.get("session_id") or session_id)
            result["steps"].append(
                {
                    "step": "followup_edit_prompt",
                    "request_url": followup_response.url,
                    "task_id": followup_task_id or None,
                    "direct": bool(followup_data.get("direct")),
                    "transport": "ui_click",
                }
            )
            expect(
                followup_response.url.endswith("/api/image-assistant/edit")
                or followup_response.url.endswith("/api/image-assistant/generate"),
                f"follow-up request route unexpected: {followup_response.url}",
            )
            if not followup_data.get("direct"):
                expect(bool(followup_task_id), f"follow-up task id missing: {followup_payload}")
                wait_for_task_success(page, followup_task_id)
            result["metrics"]["followup_submit_ms"] = round((perf_counter() - followup_started) * 1000, 2)

            followup_result_started = perf_counter()
            followup_state = wait_for_followup_edit_result(
                page,
                followup_session_id,
                prompt_token=followup_token,
                initial_version_id=initial_version_id,
            )
            result["metrics"]["followup_result_ready_ms"] = round((perf_counter() - followup_result_started) * 1000, 2)

            followup_user_message = followup_state["user_message"]
            request_payload = followup_user_message.get("request_payload") if isinstance(followup_user_message, dict) else {}
            reference_asset_ids = (
                request_payload.get("referenceAssetIds")
                if isinstance(request_payload, dict)
                else []
            )
            reference_asset_ids = reference_asset_ids if isinstance(reference_asset_ids, list) else []
            orchestration = request_payload.get("orchestration") if isinstance(request_payload, dict) else None
            reference_count = (
                orchestration.get("reference_count")
                if isinstance(orchestration, dict)
                else None
            )
            followup_version = followup_state["version"]
            followup_version_id = str(followup_version.get("id") or "")
            followup_version_kind = str(followup_version.get("version_kind") or "")

            expect(
                followup_user_message.get("task_type") == "edit",
                f"follow-up task_type expected edit, got: {followup_user_message}",
            )
            expect(
                len(reference_asset_ids) > 0,
                f"follow-up referenceAssetIds missing: {followup_user_message}",
            )
            expect(
                isinstance(reference_count, (int, float)) and reference_count > 0,
                f"follow-up orchestration reference_count missing: {followup_user_message}",
            )
            expect(
                followup_version_id and followup_version_id != initial_version_id,
                f"follow-up version id invalid: initial={initial_version_id}, followup={followup_version_id}",
            )
            expect(
                followup_version_kind == "ai_edit",
                f"follow-up version kind expected ai_edit, got {followup_version_kind}",
            )

            result["followup"] = {
                "session_id": followup_session_id,
                "request_url": followup_response.url,
                "request_route_mode": "edit" if followup_response.url.endswith("/api/image-assistant/edit") else "generate",
                "task_type": followup_user_message.get("task_type"),
                "reference_asset_count": len(reference_asset_ids),
                "orchestration_reference_count": reference_count,
                "version_id": followup_version_id,
                "version_kind": followup_version_kind,
            }
            result["status"] = "passed"
            save_debug(page, "06-followup-generated")
        finally:
            browser.close()

    (ARTIFACT_DIR / "followup-reference-edit-result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    run()
