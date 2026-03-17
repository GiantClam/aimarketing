from __future__ import annotations

import base64
import json
import os
import re
import urllib.request
from pathlib import Path
from time import perf_counter, sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3223").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "fixture_enabled").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / SCENARIO
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXQAAAAASUVORK5CYII="
)


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
            const data = await response.json()
            return { ok: response.ok, status: response.status, data }
        }""",
        {"baseUrl": BASE_URL, "path": path},
    )


def image_signature(page, src: str):
    return page.evaluate(
        """async (src) => {
            if (!src) return null
            const img = await new Promise((resolve, reject) => {
              const node = new Image()
              node.crossOrigin = "anonymous"
              node.onload = () => resolve(node)
              node.onerror = () => reject(new Error("image_load_failed"))
              node.src = src
            })
            const width = Math.min(img.naturalWidth || img.width || 1, 256)
            const height = Math.min(img.naturalHeight || img.height || 1, 256)
            const canvas = document.createElement("canvas")
            canvas.width = width
            canvas.height = height
            const ctx = canvas.getContext("2d")
            if (!ctx) return null
            ctx.drawImage(img, 0, 0, width, height)
            const { data } = ctx.getImageData(0, 0, width, height)
            let hash = 2166136261
            for (let index = 0; index < data.length; index += 4) {
              hash ^= data[index]
              hash = Math.imul(hash, 16777619)
              hash ^= data[index + 1]
              hash = Math.imul(hash, 16777619)
              hash ^= data[index + 2]
              hash = Math.imul(hash, 16777619)
              hash ^= data[index + 3]
              hash = Math.imul(hash, 16777619)
            }
            return {
              width,
              height,
              hash: (hash >>> 0).toString(16),
            }
        }""",
        src,
    )


def visible_test_id(page, test_id: str):
    return page.locator(f'[data-testid="{test_id}"]:visible').first


def wait_for_versions(page, session_id: str, timeout_seconds: int = 90):
    deadline = time() + timeout_seconds
    last_payload = None
    while time() < deadline:
        payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}")
        last_payload = payload
        if payload["ok"] and (payload["data"].get("data") or {}).get("versions"):
            return payload["data"]["data"]
        sleep(1)
    raise AssertionError(f"versions not ready for session {session_id}: {last_payload}")


def wait_for_session_detail(page, session_id: str, predicate, description: str, timeout_seconds: int = 90):
    deadline = time() + timeout_seconds
    last_payload = None
    while time() < deadline:
        payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}")
        last_payload = payload
        data = (payload.get("data") or {}).get("data") if payload.get("ok") else None
        if data and predicate(data):
            return data
        sleep(1)
    raise AssertionError(f"{description} not ready for session {session_id}: {last_payload}")


def latest_message(messages, *, role: str, message_type: str | None = None):
    filtered = [
        message
        for message in messages
        if message.get("role") == role and (message_type is None or message.get("message_type") == message_type)
    ]
    expect(bool(filtered), f"missing message for role={role} type={message_type}")
    return filtered[-1]


def login(page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("domcontentloaded", timeout=90000)
    response = None
    for _ in range(5):
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
        if response["ok"]:
            break
        sleep(2)
    expect(response is not None, "demo login did not run")
    expect(response["ok"], f"demo login failed: {response['status']} {response['data']}")
    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")


def assert_availability(page, *, enabled: bool, provider: str, reason):
    payload = fetch_json(page, "/api/image-assistant/availability")
    expect(payload["ok"], f"image assistant availability request failed: {payload['status']}")
    data = payload["data"].get("data") or {}
    expect(data.get("enabled") is enabled, f"image assistant enabled mismatch: {data}")
    expect(data.get("provider") == provider, f"image assistant provider mismatch: {data}")
    expect(data.get("reason") == reason, f"image assistant reason mismatch: {data}")
    return data


def run_fixture_enabled(page):
    result = {"scenario": SCENARIO, "metrics": {}}
    availability = assert_availability(page, enabled=True, provider="fixture", reason=None)
    result["availability"] = availability

    start = perf_counter()
    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
    visible_test_id(page, "image-prompt-input").wait_for(state="visible", timeout=90000)
    result["metrics"]["workspace_ready_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "01-home")

    page.get_by_test_id("image-reference-file-input").set_input_files(
        [
            {"name": "sample-a.png", "mimeType": "image/png", "buffer": PNG_BYTES},
            {"name": "sample-b.png", "mimeType": "image/png", "buffer": PNG_BYTES},
        ]
    )
    page.wait_for_function(
        """() => document.querySelectorAll('[data-testid^="image-pending-attachment-"]').length >= 2""",
        timeout=90000,
    )
    page.wait_for_timeout(500)
    result["initial_reference_count"] = page.locator("[data-testid^='image-pending-attachment-']").count()

    brief_token = f"brief-token-{int(time())}"
    prompt_text = f"Use these two references to make a launch visual for a skincare campaign {brief_token}."
    prompt_input = visible_test_id(page, "image-prompt-input")
    prompt_input.fill(prompt_text)
    page.wait_for_function(
        """() => {
            const textarea = Array.from(document.querySelectorAll('[data-testid="image-prompt-input"]')).find((node) => node instanceof HTMLTextAreaElement && node.offsetParent !== null)
            const button = Array.from(document.querySelectorAll('[data-testid="image-generate-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(textarea instanceof HTMLTextAreaElement && textarea.value.trim()) && Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    start = perf_counter()
    with page.expect_response(lambda response: response.url.endswith("/api/image-assistant/sessions") and response.request.method == "POST" and response.status == 200, timeout=90000) as session_response_info:
        visible_test_id(page, "image-generate-button").click()
    session_response = session_response_info.value
    session_payload = session_response.json()
    session_id = str((session_payload.get("data") or {}).get("id"))
    expect(bool(session_id), f"session creation response did not include id: {session_payload}")

    clarification_detail = wait_for_session_detail(
        page,
        session_id,
        lambda data: len(data.get("messages") or []) >= 2 and not (data.get("versions") or []),
        "clarification turn",
    )
    clarification_messages = clarification_detail.get("messages") or []
    first_user_message = latest_message(clarification_messages, role="user", message_type="prompt")
    first_assistant_message = latest_message(clarification_messages, role="assistant", message_type="note")
    first_request_payload = first_user_message.get("request_payload") or {}
    first_orchestration = first_request_payload.get("orchestration") or {}
    expect(len(first_request_payload.get("referenceAssetIds") or []) == 2, f"expected 2 reference asset ids: {first_request_payload}")
    expect(first_orchestration.get("reference_count") == 2, f"expected reference_count=2: {first_orchestration}")
    expect(first_orchestration.get("ready_for_generation") is False, f"first turn should require clarification: {first_orchestration}")
    expect(bool(first_orchestration.get("missing_fields")), f"first turn should list missing fields: {first_orchestration}")
    expect("launch visual" in str((first_orchestration.get("brief") or {}).get("goal") or "").lower(), f"goal not preserved: {first_orchestration}")
    expect(first_assistant_message.get("message_type") == "note", f"assistant should ask a follow-up question: {first_assistant_message}")
    expect(
        page.locator("[data-testid^='image-pending-attachment-']").count() >= 2,
        "reference attachments should remain after clarification",
    )
    result["clarification_missing_fields"] = first_orchestration.get("missing_fields") or []
    result["metrics"]["clarification_ms"] = round((perf_counter() - start) * 1000, 2)

    follow_up_prompt = "\n".join(
        [
            "Subject: Keep both skincare bottles from the uploaded references as the main subject.",
            "Style: Premium summer editorial photography with polished ecommerce lighting.",
            "Composition: Vertical 4:5 hero poster with a top title safe area, open space on the right, and a strong focal hierarchy.",
            "Constraints: Preserve the teal packaging, water splash cues, and readable product labels.",
        ]
    )
    prompt_input.fill(follow_up_prompt)
    page.wait_for_function(
        """() => {
            const textarea = Array.from(document.querySelectorAll('[data-testid="image-prompt-input"]')).find((node) => node instanceof HTMLTextAreaElement && node.offsetParent !== null)
            const button = Array.from(document.querySelectorAll('[data-testid="image-generate-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(textarea instanceof HTMLTextAreaElement && textarea.value.trim()) && Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )

    start = perf_counter()
    visible_test_id(page, "image-generate-button").click()
    generated_detail = wait_for_versions(page, session_id)
    page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
    page.locator("[data-testid^='image-open-canvas-']").first.wait_for(state="visible", timeout=90000)
    result["metrics"]["generate_ms"] = round((perf_counter() - start) * 1000, 2)
    generated_messages = generated_detail.get("messages") or []
    final_user_message = latest_message(generated_messages, role="user", message_type="prompt")
    final_request_payload = final_user_message.get("request_payload") or {}
    final_orchestration = final_request_payload.get("orchestration") or {}
    final_brief = final_orchestration.get("brief") or {}
    latest_version = (generated_detail.get("versions") or [])[0] or {}
    latest_prompt_text = latest_version.get("prompt_text") or ""
    expect(len(final_request_payload.get("referenceAssetIds") or []) == 2, f"expected 2 reference asset ids on final generate: {final_request_payload}")
    expect(final_orchestration.get("reference_count") == 2, f"expected final reference_count=2: {final_orchestration}")
    expect(final_orchestration.get("ready_for_generation") is True, f"final turn should be ready: {final_orchestration}")
    expect(brief_token in str(final_brief.get("goal") or ""), f"goal from the first turn was not merged forward: {final_brief}")
    expect("skincare bottles" in str(final_brief.get("subject") or "").lower(), f"subject from follow-up was not captured: {final_brief}")
    expect("premium summer editorial" in latest_prompt_text.lower(), f"style was not injected into final prompt: {latest_prompt_text}")
    expect("reference handling:" in latest_prompt_text.lower(), f"reference handling instructions missing: {latest_prompt_text}")
    expect("uploaded images as guidance" in latest_prompt_text.lower(), f"generate prompt did not include reference guidance: {latest_prompt_text}")
    expect(brief_token in latest_prompt_text, f"final prompt did not preserve the first-turn goal token: {latest_prompt_text}")
    result["multi_reference_generate_verified"] = True
    save_debug(page, "02-generated")

    first_candidate = page.locator("[data-testid^='image-open-canvas-']").first
    expect(first_candidate.count() == 1, "expected at least one image candidate")
    original_candidate_src = first_candidate.locator("img").get_attribute("src") or ""
    result["original_candidate_src"] = original_candidate_src
    result["original_candidate_signature"] = image_signature(page, original_candidate_src)
    first_candidate.click()
    visible_test_id(page, "image-canvas-stage").wait_for(state="visible", timeout=90000)
    visible_test_id(page, "image-canvas-close-button").wait_for(state="visible", timeout=90000)
    save_debug(page, "03-canvas")

    visible_test_id(page, "image-brush-tool").click()
    paint_overlay = visible_test_id(page, "image-paint-overlay")
    paint_overlay.wait_for(state="visible", timeout=90000)
    paint_box = paint_overlay.bounding_box()
    expect(paint_box is not None, "paint overlay should expose a bounding box")
    page.mouse.move(paint_box["x"] + paint_box["width"] * 0.22, paint_box["y"] + paint_box["height"] * 0.24)
    page.mouse.down()
    page.mouse.move(paint_box["x"] + paint_box["width"] * 0.42, paint_box["y"] + paint_box["height"] * 0.32, steps=8)
    page.mouse.move(paint_box["x"] + paint_box["width"] * 0.56, paint_box["y"] + paint_box["height"] * 0.4, steps=8)
    page.mouse.up()
    undo_button = visible_test_id(page, "image-canvas-undo-button")
    redo_button = visible_test_id(page, "image-canvas-redo-button")
    undo_button.wait_for(state="visible", timeout=90000)
    page.wait_for_function(
        """() => {
            const button = Array.from(document.querySelectorAll('[data-testid="image-canvas-undo-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    expect(undo_button.is_enabled(), "undo button should become enabled after drawing")
    undo_button.click()
    page.wait_for_timeout(250)
    page.wait_for_function(
        """() => {
            const button = Array.from(document.querySelectorAll('[data-testid="image-canvas-redo-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    visible_test_id(page, "image-canvas-redo-button").click()
    page.wait_for_timeout(400)
    visible_test_id(page, "image-canvas-close-button").click()
    pending_attachment = page.locator("[data-testid^='image-pending-attachment-']").first
    pending_attachment.wait_for(state="visible", timeout=90000)
    pending_attachment_img = pending_attachment.locator("img")
    edited_attachment_src = pending_attachment_img.get_attribute("src") or ""
    result["edited_attachment_src"] = edited_attachment_src
    result["edited_attachment_signature"] = image_signature(page, edited_attachment_src)
    expect(bool(edited_attachment_src), "edited attachment preview src should be present")
    expect(
        edited_attachment_src != original_candidate_src,
        f"edited attachment still points at original image: {edited_attachment_src}",
    )
    expect(
        result["edited_attachment_signature"] != result["original_candidate_signature"],
        f"edited attachment pixels still match original image: {result['edited_attachment_signature']}",
    )
    save_debug(page, "04-canvas-closed")

    roundtrip_prompt = f"Use the edited image as the base and create a refined launch poster variation. {int(time())}"
    prompt_input = visible_test_id(page, "image-prompt-input")
    prompt_input.fill(roundtrip_prompt)
    page.wait_for_function(
        """() => {
            const textarea = Array.from(document.querySelectorAll('[data-testid="image-prompt-input"]')).find((node) => node instanceof HTMLTextAreaElement && node.offsetParent !== null)
            const button = Array.from(document.querySelectorAll('[data-testid="image-generate-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(textarea instanceof HTMLTextAreaElement && textarea.value.trim()) && Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    start = perf_counter()
    with page.expect_response(lambda response: response.url.endswith("/api/image-assistant/canvas-snapshot-edit") and response.request.method == "POST" and response.status == 200, timeout=90000) as canvas_edit_response_info:
        visible_test_id(page, "image-generate-button").click()
    canvas_edit_response = canvas_edit_response_info.value
    canvas_edit_payload = canvas_edit_response.json()
    expect(bool((canvas_edit_payload.get("data") or {}).get("message_id")), f"canvas snapshot edit response missing message: {canvas_edit_payload}")
    roundtrip_detail = wait_for_versions(page, session_id)
    page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
    page.locator("[data-testid^='image-open-canvas-']").first.wait_for(state="visible", timeout=90000)
    result["metrics"]["roundtrip_edit_ms"] = round((perf_counter() - start) * 1000, 2)
    roundtrip_messages = roundtrip_detail.get("messages") or []
    roundtrip_user_message = latest_message(roundtrip_messages, role="user", message_type="prompt")
    roundtrip_request_payload = roundtrip_user_message.get("request_payload") or {}
    roundtrip_orchestration = roundtrip_request_payload.get("orchestration") or {}
    roundtrip_version = (roundtrip_detail.get("versions") or [])[0] or {}
    roundtrip_prompt_text = roundtrip_version.get("prompt_text") or ""
    roundtrip_assets = roundtrip_detail.get("assets") or []
    expect(roundtrip_user_message.get("task_type") == "mask_edit", f"canvas roundtrip should use mask_edit: {roundtrip_user_message}")
    expect("Apply the edit primarily inside the selected rectangular region only." in roundtrip_prompt_text, f"mask edit prompt should include selected region instructions: {roundtrip_prompt_text}")
    expect("Canvas annotation notes:" in roundtrip_prompt_text, f"mask edit prompt should include canvas annotation notes: {roundtrip_prompt_text}")
    expect("binary mask reference is attached" in roundtrip_prompt_text.lower(), f"mask edit prompt should mention mask reference: {roundtrip_prompt_text}")
    expect(roundtrip_orchestration.get("reference_count") == 2, f"mask edit should include snapshot and mask references: {roundtrip_orchestration}")
    expect(any(asset.get("asset_type") == "canvas_snapshot" for asset in roundtrip_assets), f"roundtrip should persist canvas snapshot asset: {roundtrip_assets}")
    expect(any(asset.get("asset_type") == "mask" for asset in roundtrip_assets), f"roundtrip should persist mask asset: {roundtrip_assets}")
    save_debug(page, "05-roundtrip")

    with page.expect_download(timeout=60000):
        page.locator("[data-testid^='image-open-canvas-']").first.click()
        visible_test_id(page, "image-canvas-stage").wait_for(state="visible", timeout=90000)
        visible_test_id(page, "image-canvas-export-button").click()

    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
    visible_test_id(page, "image-prompt-input").wait_for(state="visible", timeout=90000)
    page.get_by_test_id("image-reference-file-input").set_input_files(
        [{"name": "portrait-edit.png", "mimeType": "image/png", "buffer": PNG_BYTES}]
    )
    page.wait_for_function(
        """() => document.querySelectorAll('[data-testid^="image-pending-attachment-"]').length >= 1""",
        timeout=90000,
    )
    direct_edit_prompt = f"删除框中的眼镜，保持人物神态自然和原图质感。{int(time())}"
    prompt_input = visible_test_id(page, "image-prompt-input")
    prompt_input.fill(direct_edit_prompt)
    page.wait_for_function(
        """() => {
            const textarea = Array.from(document.querySelectorAll('[data-testid="image-prompt-input"]')).find((node) => node instanceof HTMLTextAreaElement && node.offsetParent !== null)
            const button = Array.from(document.querySelectorAll('[data-testid="image-edit-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(textarea instanceof HTMLTextAreaElement && textarea.value.trim()) && Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    start = perf_counter()
    with page.expect_response(lambda response: response.url.endswith("/api/image-assistant/sessions") and response.request.method == "POST" and response.status == 200, timeout=90000) as direct_edit_response_info:
        visible_test_id(page, "image-edit-button").click()
    direct_edit_response = direct_edit_response_info.value
    direct_edit_payload = direct_edit_response.json()
    direct_edit_session_id = str((direct_edit_payload.get("data") or {}).get("id"))
    expect(bool(direct_edit_session_id), f"direct edit session creation response did not include id: {direct_edit_payload}")
    direct_edit_detail = wait_for_versions(page, direct_edit_session_id)
    direct_edit_messages = direct_edit_detail.get("messages") or []
    direct_edit_user_message = latest_message(direct_edit_messages, role="user", message_type="prompt")
    direct_edit_assistant_message = latest_message(direct_edit_messages, role="assistant")
    direct_edit_request_payload = direct_edit_user_message.get("request_payload") or {}
    direct_edit_orchestration = direct_edit_request_payload.get("orchestration") or {}
    direct_edit_version = (direct_edit_detail.get("versions") or [])[0] or {}
    direct_edit_prompt_text = direct_edit_version.get("prompt_text") or ""
    expect(direct_edit_user_message.get("task_type") == "edit", f"direct edit should use edit mode: {direct_edit_user_message}")
    expect(len(direct_edit_request_payload.get("referenceAssetIds") or []) == 1, f"direct edit should keep 1 reference: {direct_edit_request_payload}")
    expect(direct_edit_orchestration.get("reference_count") == 1, f"direct edit should report reference_count=1: {direct_edit_orchestration}")
    expect(direct_edit_orchestration.get("ready_for_generation") is True, f"direct edit should skip clarification: {direct_edit_orchestration}")
    expect(not (direct_edit_orchestration.get("missing_fields") or []), f"direct edit should not leave missing fields: {direct_edit_orchestration}")
    expect(direct_edit_assistant_message.get("message_type") == "result_summary", f"direct edit should not return a clarification note: {direct_edit_assistant_message}")
    expect(
        "原有的真实质感" in direct_edit_prompt_text or "original reference image's visual style" in direct_edit_prompt_text.lower(),
        f"direct edit prompt should preserve source style automatically: {direct_edit_prompt_text}",
    )
    expect(
        "composition and layout:" in direct_edit_prompt_text.lower() and "4:5 composition with a clear focal hierarchy" not in direct_edit_prompt_text.lower(),
        f"direct edit prompt should avoid the generic generate composition fallback: {direct_edit_prompt_text}",
    )
    result["metrics"]["direct_reference_edit_ms"] = round((perf_counter() - start) * 1000, 2)
    result["direct_reference_edit_verified"] = True
    save_debug(page, "06-direct-edit")

    result["export_verified"] = True
    return result


def run_provider_missing(page):
    result = {"scenario": SCENARIO}
    availability = assert_availability(page, enabled=False, provider="aiberm", reason="aiberm_api_key_missing")
    result["availability"] = availability

    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
    page.get_by_text("图片设计助手暂不可用", exact=False).wait_for(state="visible", timeout=30000)
    save_debug(page, "01-provider-missing")
    return result


def main():
    wait_until_http_ready()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1480, "height": 1100}, accept_downloads=True)
        page.set_default_timeout(90000)
        network_logs: list[dict[str, object]] = []
        console_logs: list[dict[str, object]] = []

        def handle_response(response):
            if "/api/auth/demo" not in response.url and "/api/image-assistant/" not in response.url:
                return
            try:
                body = response.text()
            except Exception as error:  # noqa: BLE001
                body = f"<unavailable:{error}>"
            network_logs.append(
                {
                    "status": response.status,
                    "url": response.url,
                    "body": body[:2000],
                }
            )

        def handle_console(message):
            console_logs.append(
                {
                    "type": message.type,
                    "text": message.text,
                }
            )

        page.on("response", handle_response)
        page.on("console", handle_console)

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
            (ARTIFACT_DIR / "network-log.json").write_text(
                json.dumps(network_logs, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            (ARTIFACT_DIR / "console-log.json").write_text(
                json.dumps(console_logs, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            print(json.dumps(report, ensure_ascii=False))
        except (AssertionError, PlaywrightTimeoutError, Exception):
            try:
                save_debug(page, "99-failure")
            except Exception:
                pass
            (ARTIFACT_DIR / "network-log.json").write_text(
                json.dumps(network_logs, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            (ARTIFACT_DIR / "console-log.json").write_text(
                json.dumps(console_logs, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            raise
        finally:
            browser.close()


if __name__ == "__main__":
    main()
