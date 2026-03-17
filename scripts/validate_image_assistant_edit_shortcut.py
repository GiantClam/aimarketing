from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
import struct
from time import sleep, time
from urllib.parse import urlparse
import urllib.request
import zlib

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3000").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / "edit-shortcut-validation"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
SAMPLE_IMAGE_PATH = Path("public") / "placeholder.jpg"
SAMPLE_IMAGE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_IMAGE_URL", "").strip()

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXQAAAAASUVORK5CYII="
)
EDIT_PROMPT = "\u5c06\u6587\u80f8\u6539\u4e3a\u7ea2\u8272"


def generate_test_png(width: int = 512, height: int = 640):
    rows = []
    for y in range(height):
        shade = int(48 + (160 * y) / max(height - 1, 1))
        row = bytearray([0])
        for _ in range(width):
            row.extend((shade, min(shade + 24, 255), min(shade + 48, 255)))
        rows.append(bytes(row))
    raw = b"".join(rows)
    compressed = zlib.compress(raw, level=9)

    def png_chunk(chunk_type: bytes, data: bytes):
        return (
            struct.pack(">I", len(data))
            + chunk_type
            + data
            + struct.pack(">I", binascii.crc32(chunk_type + data) & 0xFFFFFFFF)
        )

    header = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return header + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", compressed) + png_chunk(b"IEND", b"")


SAMPLE_IMAGE_BYTES = generate_test_png()

if SAMPLE_IMAGE_URL:
    with urllib.request.urlopen(SAMPLE_IMAGE_URL, timeout=30) as response:
        SAMPLE_IMAGE_BYTES = response.read()
    sample_image_name = Path(urlparse(SAMPLE_IMAGE_URL).path).name or "edit-reference.png"
elif SAMPLE_IMAGE_PATH.exists() and SAMPLE_IMAGE_PATH.stat().st_size > 4096:
    SAMPLE_IMAGE_BYTES = SAMPLE_IMAGE_PATH.read_bytes()
    sample_image_name = SAMPLE_IMAGE_PATH.name
else:
    sample_image_name = "edit-reference.png"

sample_image_mime_type = "image/png" if sample_image_name.lower().endswith(".png") else "image/jpeg"


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def save_debug(page, name: str):
    page.screenshot(path=str(ARTIFACT_DIR / f"{name}.png"), full_page=True)
    (ARTIFACT_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")


def wait_for_workspace_ready(page, timeout_ms: int = 90000):
    page.wait_for_load_state("domcontentloaded", timeout=timeout_ms)
    try:
        page.wait_for_load_state("networkidle", timeout=10000)
    except PlaywrightTimeoutError:
        pass

    page.wait_for_function(
        """() => {
            const loadingText = document.body?.textContent || ""
            const prompt = document.querySelector('[data-testid="image-prompt-input"]')
            const upload = document.querySelector('[data-testid="image-reference-file-input"]')
            return Boolean(prompt && upload) && !loadingText.includes("正在加载图片设计助手")
        }""",
        timeout=timeout_ms,
    )


def fetch_json(page, path: str):
    return page.evaluate(
        """async ({ baseUrl, path }) => {
            const response = await fetch(`${baseUrl}${path}`, {
              credentials: "include",
              cache: "no-store",
            })
            const data = await response.json().catch(() => null)
            return { ok: response.ok, status: response.status, data }
        }""",
        {"baseUrl": BASE_URL, "path": path},
    )


def latest_message(messages, *, role: str):
    filtered = [message for message in messages if message.get("role") == role]
    expect(bool(filtered), f"missing {role} messages")
    return filtered[-1]


def wait_for_session_result(page, session_id: str, task_id: str, timeout_seconds: int = 150):
    deadline = time() + timeout_seconds
    last_detail_payload = None
    last_task_payload = None
    while time() < deadline:
        detail_payload = fetch_json(
            page,
            f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=12&versionLimit=6",
        )
        task_payload = fetch_json(page, f"/api/tasks/{task_id}")
        last_detail_payload = detail_payload
        last_task_payload = task_payload
        detail = (detail_payload.get("data") or {}).get("data") if detail_payload.get("ok") else None
        task = (task_payload.get("data") or {}).get("data") if task_payload.get("ok") else None
        if detail:
            messages = detail.get("messages") or []
            versions = detail.get("versions") or []
            has_assistant = any(message.get("role") == "assistant" for message in messages)
            if versions and has_assistant:
                return detail
            if messages and has_assistant:
                assistant = latest_message(messages, role="assistant")
                if assistant.get("message_type") in {"note", "result_summary", "error"}:
                    if assistant.get("message_type") == "result_summary":
                        return detail
                    if assistant.get("message_type") in {"note", "error"} and task and task.get("status") in {"failed", "success"}:
                        return detail
            if task and task.get("status") == "success" and versions and not has_assistant:
                sleep(1)
                continue
        if task and task.get("status") == "failed":
            raise AssertionError(f"task failed before assistant result: {task}")
        sleep(1)
    raise AssertionError(
        f"session result not ready; last task payload={last_task_payload}, last detail payload={last_detail_payload}"
    )


def main():
    result: dict[str, object] = {"base_url": BASE_URL}

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1100})

        try:
            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=90000)
            login_response = page.evaluate(
                """async (baseUrl) => {
                    const response = await fetch(`${baseUrl}/api/auth/demo`, {
                      method: "POST",
                      credentials: "include",
                    })
                    const data = await response.json().catch(() => null)
                    return { ok: response.ok, status: response.status, data }
                }""",
                BASE_URL,
            )
            expect(login_response["ok"], f"demo login failed: {login_response}")

            page.goto(f"{BASE_URL}/dashboard/image-assistant", wait_until="domcontentloaded", timeout=90000)
            wait_for_workspace_ready(page)

            page.get_by_test_id("image-reference-file-input").set_input_files(
                [{"name": sample_image_name, "mimeType": sample_image_mime_type, "buffer": SAMPLE_IMAGE_BYTES}]
            )
            page.wait_for_function(
                """() => document.querySelectorAll('[data-testid^="image-pending-attachment-"]').length >= 1""",
                timeout=90000,
            )

            prompt_input = page.get_by_test_id("image-prompt-input")
            prompt_input.fill(EDIT_PROMPT)
            page.wait_for_function(
                """() => {
                    const button = Array.from(document.querySelectorAll('[data-testid="image-edit-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
                    return Boolean(button) && !button.hasAttribute("disabled")
                }""",
                timeout=90000,
            )

            save_debug(page, "01-before-submit")

            with page.expect_response(
                lambda response: response.url.endswith("/api/image-assistant/edit")
                and response.request.method == "POST"
                and response.status == 200,
                timeout=90000,
            ) as edit_response_info:
                page.get_by_test_id("image-edit-button").click()

            edit_response = edit_response_info.value
            edit_payload = edit_response.json()
            task_data = edit_payload.get("data") or {}
            task_id = str(task_data.get("task_id") or "")
            session_id = str(task_data.get("session_id") or "")
            expect(task_id, f"missing task_id in edit response: {edit_payload}")
            expect(session_id, f"missing session_id in edit response: {edit_payload}")
            result["edit_response"] = task_data

            detail = wait_for_session_result(page, session_id, task_id)
            messages = detail.get("messages") or []
            versions = detail.get("versions") or []
            latest_user = latest_message(messages, role="user")
            latest_assistant = latest_message(messages, role="assistant")

            result["session_id"] = session_id
            result["latest_user"] = {
                "task_type": latest_user.get("task_type"),
                "content": latest_user.get("content"),
                "request_payload": latest_user.get("request_payload"),
            }
            result["latest_assistant"] = {
                "message_type": latest_assistant.get("message_type"),
                "content": latest_assistant.get("content"),
            }
            result["version_count"] = len(versions)

            expect(latest_user.get("task_type") == "edit", f"user turn should be edit: {latest_user}")
            request_payload = latest_user.get("request_payload") or {}
            orchestration = request_payload.get("orchestration") or {}
            result["orchestration"] = orchestration
            expect(orchestration.get("recommended_mode") == "edit", f"expected recommended_mode=edit: {orchestration}")
            expect(orchestration.get("ready_for_generation") is True, f"expected ready_for_generation=true: {orchestration}")
            expect(latest_assistant.get("message_type") == "result_summary", f"unexpected assistant outcome: {latest_assistant}")
            expect("clarify" not in str(latest_assistant.get("content") or "").lower(), f"unexpected clarification reply: {latest_assistant}")
            expect(len(versions) >= 1, f"expected generated version: {detail}")

            page.wait_for_timeout(1500)
            save_debug(page, "02-after-result")
            (ARTIFACT_DIR / "report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
        except (AssertionError, PlaywrightTimeoutError, Exception) as error:  # noqa: BLE001
            result["url"] = page.url
            result["body_preview"] = (page.text_content("body") or "")[:1200]
            save_debug(page, "99-failure")
            result["error"] = str(error)
            (ARTIFACT_DIR / "report.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
