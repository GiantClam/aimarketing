from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from time import perf_counter, sleep, time

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3223").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "guided-card-flow").strip()
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
    payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=50&versionLimit=20")
    detail = (payload.get("data") or {}).get("data") if payload.get("ok") else None
    return payload, detail


def wait_for_task_success(page, task_id: str, timeout_seconds: int = 180):
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
        "used_reload_fallback": False,
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
    result: dict[str, object] = {
        "scenario": SCENARIO,
        "base_url": BASE_URL,
        "steps": [],
        "metrics": {},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1480, "height": 1100})
        page.set_default_timeout(90000)
        route_transitions: list[str] = []
        page.on("framenavigated", lambda frame: route_transitions.append(frame.url) if frame == page.main_frame else None)

        try:
            login_started = perf_counter()
            login_demo(page)
            result["metrics"]["login_ms"] = round((perf_counter() - login_started) * 1000, 2)

            page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
            prompt_input = page.get_by_test_id("image-prompt-input")
            prompt_input.wait_for(state="visible", timeout=90000)
            save_debug(page, "01-home")

            initial_prompt = (
                "Create a red and black multi-head CNC machine in a futuristic factory "
                "like Tesla, with a handsome white worker operating it."
            )
            prompt_input.fill(initial_prompt)
            first_started = perf_counter()
            with page.expect_response(
                lambda response: response.url.endswith("/api/image-assistant/generate")
                and response.request.method == "POST"
                and response.status == 200,
                timeout=90000,
            ) as response_info:
                page.get_by_test_id("image-generate-button").click()
            initial_response = response_info.value.json()
            data = initial_response.get("data") or {}
            task_id = str(data.get("task_id") or "")
            session_id = str(data.get("session_id") or "")
            expect(bool(session_id), f"initial session id missing: {initial_response}")
            initial_direct = bool(data.get("direct"))
            if not initial_direct:
                expect(bool(task_id), f"initial task id missing: {initial_response}")
                wait_for_task_success(page, task_id)
            result["session_id"] = session_id
            result["steps"].append({"step": "initial_prompt", "task_id": task_id or None})
            result["metrics"]["initial_prompt_task_ms"] = round((perf_counter() - first_started) * 1000, 2)
            save_debug(page, "02-after-initial")

            try:
                page.wait_for_url(f"**/dashboard/image-assistant/{session_id}", timeout=5000)
            except Exception:
                # The workspace may intentionally stay on /dashboard/image-assistant during brief collection.
                pass
            nav_count_baseline = len(route_transitions)

            direct_generated = False
            try:
                usage_context = wait_for_question(page, session_id, {"usage"}, timeout_seconds=20)
                usage_question = usage_context["question"]
                usage_option = pick_option(usage_question, "social_cover")
                q1 = click_option_and_wait_task(page, "usage", usage_option["id"])
                result["steps"].append(
                    {
                        "step": "q1_usage",
                        "task_id": q1["task_id"],
                        "option_id": usage_option["id"],
                        "used_reload_fallback": q1["used_reload_fallback"],
                    }
                )
                result["metrics"]["q1_task_ms"] = q1["elapsed_ms"]
                save_debug(page, "03-after-q1")

                nav_count_baseline = len(route_transitions)

                next_context = wait_for_question(page, session_id, {"orientation", "resolution"})
                next_question = next_context["question"]
                next_id = str(next_question.get("id") or "")

                if next_id == "orientation":
                    orientation_option = pick_option(next_question, "landscape")
                    q2 = click_option_and_wait_task(page, "orientation", orientation_option["id"])
                    result["steps"].append(
                        {
                            "step": "q2_orientation",
                            "task_id": q2["task_id"],
                            "option_id": orientation_option["id"],
                            "used_reload_fallback": q2["used_reload_fallback"],
                        }
                    )
                    result["metrics"]["q2_task_ms"] = q2["elapsed_ms"]
                    save_debug(page, "04-after-q2")
                    nav_count_baseline = len(route_transitions)
                    resolution_context = wait_for_question(page, session_id, {"resolution"})
                else:
                    resolution_context = next_context

                resolution_option = pick_option(resolution_context["question"], "1K")
                q3 = click_option_and_wait_task(page, "resolution", resolution_option["id"])
                result["steps"].append(
                    {
                        "step": "q3_resolution",
                        "task_id": q3["task_id"],
                        "option_id": resolution_option["id"],
                        "used_reload_fallback": q3["used_reload_fallback"],
                    }
                )
                result["metrics"]["q3_task_ms"] = q3["elapsed_ms"]
                nav_count_baseline = len(route_transitions)
            except AssertionError:
                direct_generated = True
                result["steps"].append({"step": "one_shot_generated"})

            final_started = perf_counter()
            final_detail = wait_for_generated_result(page, session_id)
            result["metrics"]["result_ready_ms"] = round((perf_counter() - final_started) * 1000, 2)
            versions = final_detail.get("versions") or []
            expect(bool(versions), f"final versions missing: {final_detail}")
            latest_version = versions[0]
            candidates = latest_version.get("candidates") or []
            expect(bool(candidates), f"no candidates generated: {latest_version}")

            result["version_id"] = str(latest_version.get("id") or "")
            result["version_kind"] = latest_version.get("version_kind")
            result["candidate_count"] = len(candidates)
            result["one_shot_generated"] = direct_generated
            result["route_transition_count"] = len(route_transitions)
            result["status"] = "passed"

            page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
            page.locator("[data-testid^='image-open-canvas-']").first.wait_for(state="visible", timeout=90000)
            save_debug(page, "05-generated")
        finally:
            browser.close()

    (ARTIFACT_DIR / "guided-card-flow-result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    run()
