from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3223").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / "brief-generate-flow"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def wait_until_http_ready(timeout_seconds: int = 180):
  deadline = time() + timeout_seconds
  while time() < deadline:
    try:
      with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=10) as response:
        body = response.read().decode("utf-8", errors="ignore")
        if response.status == 200 and '"ok":true' in body:
          return
    except Exception:
      pass
    sleep(1)
  raise RuntimeError("application did not become ready")


def fetch_json(page, path: str):
  return page.evaluate(
    """async ({ baseUrl, path }) => {
      const response = await fetch(`${baseUrl}${path}`, { credentials: "include", cache: "no-store" })
      const data = await response.json().catch(() => ({}))
      return { ok: response.ok, status: response.status, data }
    }""",
    {"baseUrl": BASE_URL, "path": path},
  )


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


def run():
  wait_until_http_ready()
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1480, "height": 1100})
    page.set_default_timeout(90000)
    browser_logs: list[dict[str, str]] = []
    page.on(
      "console",
      lambda message: browser_logs.append({"type": message.type, "text": message.text}),
    )
    page.on(
      "pageerror",
      lambda error: browser_logs.append({"type": "pageerror", "text": str(error)}),
    )

    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    login_result = page.evaluate(
      """async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/auth/demo`, { method: "POST", credentials: "include" })
        return { ok: response.ok, status: response.status, data: await response.json().catch(() => ({})) }
      }""",
      BASE_URL,
    )
    print("login", login_result)

    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
    page.get_by_test_id("image-prompt-input").wait_for(state="visible", timeout=90000)
    page.get_by_test_id("image-prompt-input").fill(
      "制作一个红黑色多机头的机床，背景是在特斯拉风格工厂，一个白人帅工人在操作。"
    )
    with page.expect_response(
      lambda response: response.url.endswith("/api/image-assistant/generate")
      and response.request.method == "POST"
      and response.status == 200,
      timeout=90000,
    ) as response_info:
      page.get_by_test_id("image-generate-button").click()
    payload = response_info.value.json()
    data = payload.get("data") or {}
    task_id = str(data.get("task_id") or "")
    session_id = str(data.get("session_id") or "")
    print("task", task_id, "session", session_id)
    wait_for_task_success(page, task_id)

    try:
      page.wait_for_url(f"**/dashboard/image-assistant/{session_id}", timeout=5000)
    except Exception:
      pass
    page.wait_for_load_state("networkidle")

    def extract_latest_question_id(detail: object):
      if not isinstance(detail, dict):
        return None
      messages = detail.get("messages") or []
      for message in reversed(messages):
        if not isinstance(message, dict):
          continue
        for key in ("response_payload", "request_payload"):
          payload_obj = message.get(key)
          orchestration = payload_obj.get("orchestration") if isinstance(payload_obj, dict) else None
          if not isinstance(orchestration, dict):
            continue
          prompt_questions = orchestration.get("prompt_questions") or []
          if prompt_questions and isinstance(prompt_questions[0], dict):
            return prompt_questions[0].get("id")
      return None

    content_payload = fetch_json(
      page,
      f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=50&versionLimit=20",
    )
    content_detail = (content_payload.get("data") or {}).get("data") if content_payload.get("ok") else None
    summary_payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}?mode=summary&messageLimit=12")
    summary_detail = (summary_payload.get("data") or {}).get("data") if summary_payload.get("ok") else None
    latest_question_id = extract_latest_question_id(content_detail)
    latest_question_id_summary = extract_latest_question_id(summary_detail)

    usage_locator = page.get_by_test_id("image-prompt-question-usage")
    usage_count = usage_locator.count()
    usage_visible = usage_locator.is_visible() if usage_count > 0 else False
    post_reload_usage_count = None
    post_reload_usage_visible = None
    if usage_count == 0:
      page.reload(wait_until="domcontentloaded")
      page.wait_for_load_state("networkidle")
      reloaded_locator = page.get_by_test_id("image-prompt-question-usage")
      post_reload_usage_count = reloaded_locator.count()
      post_reload_usage_visible = reloaded_locator.is_visible() if post_reload_usage_count > 0 else False
    print(
      json.dumps(
        {
          "current_url": page.url,
          "session_id": session_id,
          "latest_question_id_from_content_api": latest_question_id,
          "latest_question_id_from_summary_api": latest_question_id_summary,
          "usage_locator_count": usage_count,
          "usage_locator_visible": usage_visible,
          "post_reload_usage_count": post_reload_usage_count,
          "post_reload_usage_visible": post_reload_usage_visible,
          "browser_logs": browser_logs[-30:],
        },
        ensure_ascii=False,
      )
    )

    page.screenshot(path=str(ARTIFACT_DIR / "debug-after-initial.png"), full_page=True)
    (ARTIFACT_DIR / "debug-after-initial.html").write_text(page.content(), encoding="utf-8")
    browser.close()


if __name__ == "__main__":
  run()
