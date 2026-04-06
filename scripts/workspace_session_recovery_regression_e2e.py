from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("WORKSPACE_RECOVERY_TEST_BASE_URL", "http://127.0.0.1:3123").strip()
SCENARIO = os.environ.get("WORKSPACE_RECOVERY_E2E_SCENARIO", "session-recovery-regression").strip()
ARTIFACT_DIR = Path("artifacts") / "workspace-session-recovery" / SCENARIO
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


def api_fetch(page, path: str, method: str = "GET", body=None):
    return page.evaluate(
        """async ({ baseUrl, path, method, body }) => {
            const response = await fetch(`${baseUrl}${path}`, {
              method,
              credentials: "include",
              cache: "no-store",
              headers: body ? { "Content-Type": "application/json" } : undefined,
              body: body ? JSON.stringify(body) : undefined,
            })
            const text = await response.text()
            let data = null
            try {
              data = text ? JSON.parse(text) : null
            } catch {
              data = null
            }
            return { ok: response.ok, status: response.status, text, data }
        }""",
        {"baseUrl": BASE_URL, "path": path, "method": method, "body": body},
    )


def wait_for_text(page, text: str, timeout_ms: int = 30_000):
    page.get_by_text(text, exact=False).first.wait_for(state="visible", timeout=timeout_ms)


def switch_workspace_session(page, href: str, *, timeout_ms: int = 30_000):
    link = page.locator(f"a[href='{href}']").first
    try:
        link.wait_for(state="visible", timeout=timeout_ms)
        link.click()
        page.wait_for_url(re.compile(re.escape(f"{BASE_URL}{href}") + r"(?:\\?.*)?$"), timeout=timeout_ms)
    except PlaywrightTimeoutError:
        page.goto(f"{BASE_URL}{href}", timeout=90_000, wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle", timeout=90_000)


def login(page):
    page.goto(f"{BASE_URL}/login", timeout=90_000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90_000)
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


def create_writer_conversation_with_seed(page, *, title: str, prompt: str) -> str:
    created = api_fetch(
        page,
        "/api/writer/conversations",
        method="POST",
        body={"title": title, "platform": "wechat", "mode": "article", "language": "zh"},
    )
    expect(created["ok"], f"writer conversation create failed: {created['status']} {created['text']}")
    conversation_id = ((created.get("data") or {}).get("data") or {}).get("id")
    expect(isinstance(conversation_id, str) and conversation_id, f"writer conversation id missing: {created}")

    seeded = api_fetch(
        page,
        "/api/writer/chat/stream",
        method="POST",
        body={
            "query": prompt,
            "inputs": {"contents": prompt},
            "conversation_id": conversation_id,
            "platform": "wechat",
            "mode": "article",
            "language": "zh",
        },
    )
    expect(seeded["ok"], f"writer seed stream failed: {seeded['status']} {seeded['text']}")
    return conversation_id


def run_writer_recovery_regression(page, run_id: str):
    writer_prompt_a = f"Writer recovery seed A {run_id}"
    writer_prompt_b = f"Writer recovery seed B {run_id}"
    writer_backend_update = f"Writer backend reconcile sentinel {run_id}"

    conversation_a = create_writer_conversation_with_seed(
        page,
        title=f"Writer Session A {run_id}",
        prompt=writer_prompt_a,
    )
    conversation_b = create_writer_conversation_with_seed(
        page,
        title=f"Writer Session B {run_id}",
        prompt=writer_prompt_b,
    )

    page.goto(f"{BASE_URL}/dashboard/writer/{conversation_a}", timeout=90_000, wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid='writer-send-button']", state="visible", timeout=90_000)
    wait_for_text(page, writer_prompt_a, timeout_ms=30_000)
    save_debug(page, "writer-session-a-before-switch")

    switch_workspace_session(page, f"/dashboard/writer/{conversation_b}")
    wait_for_text(page, writer_prompt_b, timeout_ms=30_000)
    save_debug(page, "writer-session-b")

    patched = api_fetch(
        page,
        "/api/writer/messages",
        method="PATCH",
        body={
            "conversation_id": conversation_a,
            "content": writer_backend_update,
            "status": "text_ready",
        },
    )
    expect(patched["ok"], f"writer backend patch failed: {patched['status']} {patched['text']}")

    switch_workspace_session(page, f"/dashboard/writer/{conversation_a}")
    wait_for_text(page, writer_prompt_a, timeout_ms=15_000)
    wait_for_text(page, writer_backend_update, timeout_ms=45_000)
    save_debug(page, "writer-session-a-reconciled")


def create_image_assistant_session(page, *, title: str) -> str:
    created = api_fetch(
        page,
        "/api/image-assistant/sessions",
        method="POST",
        body={"title": title},
    )
    expect(created["ok"], f"image session create failed: {created['status']} {created['text']}")
    session_id = ((created.get("data") or {}).get("data") or {}).get("id")
    expect(isinstance(session_id, str) and session_id, f"image session id missing: {created}")
    return session_id


def run_image_turn(page, *, session_id: str, prompt: str):
    generated = api_fetch(
        page,
        "/api/image-assistant/generate",
        method="POST",
        body={
            "sessionId": session_id,
            "prompt": prompt,
            "preferAsync": False,
        },
    )
    expect(generated["ok"], f"image turn failed: {generated['status']} {generated['text']}")
    payload = (generated.get("data") or {}).get("data") or {}
    expect(payload.get("accepted") is True, f"image turn not accepted: {generated}")


def run_image_recovery_regression(page, run_id: str):
    image_prompt_a = f"Image recovery seed A {run_id}"
    image_prompt_b = f"Image recovery seed B {run_id}"

    session_a = create_image_assistant_session(page, title=f"Image Session A {run_id}")
    session_b = create_image_assistant_session(page, title=f"Image Session B {run_id}")

    run_image_turn(page, session_id=session_a, prompt=image_prompt_a)

    page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_a}", timeout=90_000, wait_until="domcontentloaded")
    page.wait_for_selector("[data-testid='image-prompt-input']", state="visible", timeout=90_000)
    wait_for_text(page, image_prompt_a, timeout_ms=30_000)
    save_debug(page, "image-session-a-before-switch")

    switch_workspace_session(page, f"/dashboard/image-assistant/{session_b}")
    page.wait_for_selector("[data-testid='image-prompt-input']", state="visible", timeout=90_000)
    save_debug(page, "image-session-b")

    run_image_turn(page, session_id=session_a, prompt=image_prompt_b)

    switch_workspace_session(page, f"/dashboard/image-assistant/{session_a}")
    wait_for_text(page, image_prompt_a, timeout_ms=15_000)
    wait_for_text(page, image_prompt_b, timeout_ms=45_000)
    save_debug(page, "image-session-a-reconciled")


def main():
    wait_until_http_ready()
    run_id = str(int(time()))

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 1000})
        page = context.new_page()
        page.set_default_timeout(45_000)

        try:
            login(page)
            run_writer_recovery_regression(page, run_id)
            run_image_recovery_regression(page, run_id)
            print("workspace_session_recovery_regression_e2e: PASS")
        except (AssertionError, PlaywrightTimeoutError, Exception) as error:  # noqa: BLE001
            save_debug(page, "failure")
            (ARTIFACT_DIR / "error.json").write_text(
                json.dumps({"error": str(error)}, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            print(f"workspace_session_recovery_regression_e2e: FAIL: {error}")
            raise SystemExit(1) from error
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
