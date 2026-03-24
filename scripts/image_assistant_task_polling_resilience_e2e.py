from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from time import perf_counter, sleep, time

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3223").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "task-polling-resilience").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / SCENARIO
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

POLL_INTERVAL_MS = 450
POLL_FAILURE_THRESHOLD = 8
FIRST_TASK_ID = "990001"
SECOND_TASK_ID = "990002"
TASK_STATUS_UNAVAILABLE_MESSAGE = "Task status is temporarily unavailable. Please refresh and try again."


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


def create_image_session(page, title: str):
    payload = page.evaluate(
        """async ({ baseUrl, title }) => {
            const response = await fetch(`${baseUrl}/api/image-assistant/sessions`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title }),
            })
            const data = await response.json().catch(() => ({}))
            return { ok: response.ok, status: response.status, data }
        }""",
        {"baseUrl": BASE_URL, "title": title},
    )
    expect(payload["ok"], f"session create failed: {payload}")
    data = (payload.get("data") or {}).get("data") or {}
    session_id = str(data.get("id") or "").strip()
    expect(bool(session_id), f"session id missing: {payload}")
    return session_id


def upsert_pending_task(page, task_id: str, session_id: str, prompt: str):
    page.evaluate(
        """({ taskId, sessionId, prompt }) => {
            const storageKey = "assistant-async-task-store-v2"
            let store = {}
            try {
              store = JSON.parse(sessionStorage.getItem(storageKey) || "{}")
            } catch {
              store = {}
            }
            store[String(taskId)] = {
              taskId: String(taskId),
              scope: "image",
              sessionId: String(sessionId),
              prompt,
              taskType: "generate",
              createdAt: Date.now(),
            }
            sessionStorage.setItem(storageKey, JSON.stringify(store))
        }""",
        {"taskId": task_id, "sessionId": session_id, "prompt": prompt},
    )


def pending_task_exists(page, task_id: str):
    return bool(
        page.evaluate(
            """(taskId) => {
                const storageKey = "assistant-async-task-store-v2"
                let store = {}
                try {
                  store = JSON.parse(sessionStorage.getItem(storageKey) || "{}")
                } catch {
                  store = {}
                }
                return Boolean(store[String(taskId)])
            }""",
            task_id,
        )
    )


def wait_for_status_unavailable_error(page, timeout_ms: int = 30000):
    page.get_by_text(TASK_STATUS_UNAVAILABLE_MESSAGE).first.wait_for(
        state="visible", timeout=timeout_ms
    )


def assert_polling_stopped(page, poll_counts: dict[str, int], task_id: str):
    count_after_error = poll_counts.get(task_id, 0)
    expect(
        count_after_error >= POLL_FAILURE_THRESHOLD,
        f"poll count below threshold for task {task_id}: {count_after_error}",
    )

    sleep((POLL_INTERVAL_MS * 5) / 1000)
    count_after_wait = poll_counts.get(task_id, 0)
    expect(
        count_after_wait <= count_after_error + 1,
        f"polling did not stop for task {task_id}: {count_after_error} -> {count_after_wait}",
    )

    prompt_input = page.get_by_test_id("image-prompt-input")
    expect(prompt_input.is_enabled(), "prompt should be interactive after poll cutoff")
    expect(
        not pending_task_exists(page, task_id),
        f"pending task should be removed after poll cutoff: {task_id}",
    )

    return {"count_after_error": count_after_error, "count_after_wait": count_after_wait}


def run():
    wait_until_http_ready()
    result: dict[str, object] = {
        "scenario": SCENARIO,
        "base_url": BASE_URL,
        "metrics": {},
        "assertions": {},
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 960})
        page.set_default_timeout(90000)
        poll_counts: dict[str, int] = {}
        tracked_task_ids = {FIRST_TASK_ID, SECOND_TASK_ID}

        def intercept_task_status(route):
            url = route.request.url
            task_id = None
            for candidate in tracked_task_ids:
                if url.endswith(f"/api/tasks/{candidate}"):
                    task_id = candidate
                    break

            if not task_id:
                route.continue_()
                return

            poll_counts[task_id] = poll_counts.get(task_id, 0) + 1
            route.fulfill(
                status=500,
                content_type="application/json",
                body=json.dumps(
                    {
                        "error": 'Failed query: select * from "AI_MARKETING_tasks" where "id" = $1',
                        "cause": "timeout exceeded when trying to connect",
                    }
                ),
            )

        page.route("**/api/tasks/*", intercept_task_status)

        try:
            login_started = perf_counter()
            login_demo(page)
            result["metrics"]["login_ms"] = round((perf_counter() - login_started) * 1000, 2)

            session_id = create_image_session(page, f"[e2e] task polling resilience {int(time())}")
            result["session_id"] = session_id

            upsert_pending_task(page, FIRST_TASK_ID, session_id, "simulate stale polling task after restart")
            page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
            page.get_by_test_id("image-prompt-input").wait_for(state="visible", timeout=90000)
            save_debug(page, "01-first-run-before-cutoff")

            wait_for_status_unavailable_error(page)
            first_assert = assert_polling_stopped(page, poll_counts, FIRST_TASK_ID)
            result["assertions"]["first_run"] = first_assert
            save_debug(page, "02-first-run-cutoff")

            upsert_pending_task(page, SECOND_TASK_ID, session_id, "simulate restart with unresolved polling task")
            page.reload(wait_until="domcontentloaded", timeout=90000)
            page.get_by_test_id("image-prompt-input").wait_for(state="visible", timeout=90000)
            save_debug(page, "03-second-run-before-cutoff")

            wait_for_status_unavailable_error(page)
            second_assert = assert_polling_stopped(page, poll_counts, SECOND_TASK_ID)
            result["assertions"]["second_run"] = second_assert
            save_debug(page, "04-second-run-cutoff")

            result["poll_counts"] = poll_counts
            result["ok"] = True
        finally:
            browser.close()

    (ARTIFACT_DIR / "result.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    run()
