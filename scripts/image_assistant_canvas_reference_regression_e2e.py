from __future__ import annotations

import base64
import hashlib
import json
import os
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3000").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "canvas-reference-regression").strip()
TARGET_SESSION_ID = os.environ.get("IMAGE_ASSISTANT_TEST_SESSION_ID", "").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / SCENARIO
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
PNG_BYTES = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9s3FoXQAAAAASUVORK5CYII="
)


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def wait_until_http_ready(timeout_seconds: int = 120):
    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health", timeout=5) as response:
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
    payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=80&versionLimit=20")
    detail = (payload.get("data") or {}).get("data") if payload.get("ok") else None
    return payload, detail


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


def find_recent_session_ids(page, limit: int = 40):
    payload = fetch_json(page, f"/api/image-assistant/sessions?limit={limit}")
    expect(payload["ok"], f"sessions api failed: {payload}")
    rows = (payload["data"] or {}).get("data") or []
    result: list[str] = []
    for row in rows:
        session_id = str((row or {}).get("id") or "").strip()
        if session_id:
            result.append(session_id)
    return result


def extract_latest_prompt_reference_asset_ids(detail: dict) -> list[str]:
    messages = detail.get("messages") or []
    for message in reversed(messages):
        if message.get("role") != "user" or message.get("message_type") != "prompt":
            continue
        request_payload = message.get("request_payload")
        if not isinstance(request_payload, dict):
            continue
        reference_asset_ids = request_payload.get("referenceAssetIds")
        if not isinstance(reference_asset_ids, list):
            continue
        normalized = [str(item).strip() for item in reference_asset_ids if str(item).strip()]
        if normalized:
            return normalized
    return []


def find_session_with_reference_and_candidate(page, session_ids: list[str]):
    for session_id in session_ids:
        payload = fetch_json(
            page,
            f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=80&versionLimit=20",
        )
        if not payload["ok"]:
            continue
        detail = (payload["data"] or {}).get("data")
        if not isinstance(detail, dict):
            continue
        reference_asset_ids = extract_latest_prompt_reference_asset_ids(detail)
        versions = detail.get("versions") or []
        has_candidate = any(isinstance(version, dict) and (version.get("candidates") or []) for version in versions)
        if reference_asset_ids and has_candidate:
            return session_id, reference_asset_ids
    raise AssertionError("no recent session has both historical reference assets and candidates")


def validate_target_session(page, session_id: str):
    payload, detail = fetch_session_detail(page, session_id)
    expect(payload["ok"], f"target session detail failed: {payload}")
    expect(isinstance(detail, dict), f"target session detail missing data: {payload}")
    reference_asset_ids = extract_latest_prompt_reference_asset_ids(detail)
    versions = detail.get("versions") or []
    has_candidate = any(isinstance(version, dict) and (version.get("candidates") or []) for version in versions)
    expect(reference_asset_ids, f"target session has no historical reference asset ids: {session_id}")
    expect(has_candidate, f"target session has no candidates: {session_id}")
    return reference_asset_ids


def create_session_with_reference_and_candidate(page):
    prompt_input = page.get_by_test_id("image-prompt-input")
    prompt_input.wait_for(state="visible", timeout=90000)

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

    seed_prompt = (
        "Create a product campaign visual. "
        "Usage: website hero. Orientation: landscape. Resolution: 1K. Ratio: 16:9. "
        "Goal: launch conversion. Subject: keep uploaded product references. "
        "Style: premium commercial photography. Composition: centered product with right-side safe area."
    )
    prompt_input.fill(seed_prompt)
    page.wait_for_function(
        """() => {
            const prompt = document.querySelector('[data-testid="image-prompt-input"]')
            const submit = document.querySelector('[data-testid="image-generate-button"]')
            if (!prompt || !submit) return false
            return prompt.value.trim().length > 0 && !prompt.disabled && !submit.disabled
        }""",
        timeout=90000,
    )

    with page.expect_response(
        lambda response: response.url.endswith("/api/image-assistant/sessions")
        and response.request.method == "POST"
        and response.status == 200,
        timeout=120000,
    ) as response_info:
        page.get_by_test_id("image-generate-button").click()
    session_payload = response_info.value.json()
    session_data = session_payload.get("data") or {}
    session_id = str(session_data.get("id") or "").strip()
    expect(bool(session_id), f"session creation response did not include id: {session_payload}")

    page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
    for attempt in range(10):
        try:
            page.locator("[data-testid^='image-open-canvas-']").first.wait_for(state="visible", timeout=18000)
            break
        except PlaywrightTimeoutError:
            if attempt == 9:
                raise
            page.reload(wait_until="domcontentloaded", timeout=90000)

    detail_payload, detail = fetch_session_detail(page, session_id)
    expect(detail_payload["ok"] and isinstance(detail, dict), f"session detail unavailable for {session_id}: {detail_payload}")
    reference_asset_ids = extract_latest_prompt_reference_asset_ids(detail)
    expect(reference_asset_ids, f"new session did not persist reference asset ids: {detail}")
    return session_id, reference_asset_ids


def sha256_hex(data: bytes):
    return hashlib.sha256(data).hexdigest()


def wait_for_composer_ready(page, timeout_ms: int = 120000):
    page.wait_for_function(
        """() => {
            const prompt = document.querySelector('[data-testid="image-prompt-input"]')
            if (!prompt) return false
            return !prompt.disabled
        }""",
        timeout=timeout_ms,
    )


def run():
    wait_until_http_ready()

    result: dict[str, object] = {
        "scenario": SCENARIO,
        "base_url": BASE_URL,
    }

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1480, "height": 1080})
        page.set_default_timeout(90000)

        try:
            login_demo(page)
            page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
            save_debug(page, "01-dashboard")

            if TARGET_SESSION_ID:
                session_id = TARGET_SESSION_ID
                expected_reference_asset_ids = validate_target_session(page, session_id)
            else:
                session_id, expected_reference_asset_ids = create_session_with_reference_and_candidate(page)
            result["session_id"] = session_id
            result["expected_reference_asset_ids"] = expected_reference_asset_ids

            page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
            wait_for_composer_ready(page)
            save_debug(page, "02-session")

            prompt_input = page.get_by_test_id("image-prompt-input")
            submit_button = page.get_by_test_id("image-generate-button")
            prompt_input.fill(f"重新生成回归验证 token={int(time())}")
            with page.expect_request(
                lambda request: request.method == "POST"
                and (
                    request.url.endswith("/api/image-assistant/generate")
                    or request.url.endswith("/api/image-assistant/edit")
                ),
                timeout=90000,
            ) as request_info:
                submit_button.click()
            submit_request = request_info.value
            submitted_payload = json.loads(submit_request.post_data or "{}")
            submitted_reference_asset_ids = submitted_payload.get("referenceAssetIds") or []
            expect(
                isinstance(submitted_reference_asset_ids, list) and len(submitted_reference_asset_ids) > 0,
                f"follow-up request should carry historical referenceAssetIds: {submitted_payload}",
            )
            expect(
                any(asset_id in submitted_reference_asset_ids for asset_id in expected_reference_asset_ids),
                f"follow-up referenceAssetIds should include historical ids: expected={expected_reference_asset_ids}, actual={submitted_reference_asset_ids}",
            )
            expect(
                all(isinstance(value, str) and not value.startswith("http") for value in submitted_reference_asset_ids),
                f"referenceAssetIds should be asset IDs (not image urls): {submitted_reference_asset_ids}",
            )
            result["followup_request_url"] = submit_request.url
            result["followup_reference_asset_ids"] = submitted_reference_asset_ids

            first_candidate = page.locator("[data-testid^='image-open-canvas-']").first
            first_candidate.wait_for(state="visible", timeout=90000)
            first_candidate.click()

            stage = page.get_by_test_id("image-canvas-stage")
            stage.wait_for(state="visible", timeout=90000)

            page.get_by_test_id("image-shape-tool").click()
            page.wait_for_timeout(200)

            resize_handle = page.locator("[data-testid^='image-layer-resize-']:visible").first
            resize_handle.wait_for(state="visible", timeout=90000)

            before_resize = stage.screenshot(path=str(ARTIFACT_DIR / "03-before-shape-resize.png"))
            before_resize_hash = sha256_hex(before_resize)

            handle_box = resize_handle.bounding_box()
            expect(handle_box is not None, "resize handle should expose a bounding box")
            page.mouse.move(handle_box["x"] + handle_box["width"] / 2, handle_box["y"] + handle_box["height"] / 2)
            page.mouse.down()
            page.mouse.move(handle_box["x"] + handle_box["width"] / 2 + 140, handle_box["y"] + handle_box["height"] / 2 + 90, steps=14)
            page.mouse.up()
            page.wait_for_timeout(300)

            after_resize = stage.screenshot(path=str(ARTIFACT_DIR / "04-after-shape-resize.png"))
            after_resize_hash = sha256_hex(after_resize)
            expect(before_resize_hash != after_resize_hash, "shape resize did not change canvas output")

            page.get_by_test_id("image-text-tool").click()
            text_layer = page.locator("[data-testid^='image-text-layer-']:visible").first
            text_layer.wait_for(state="visible", timeout=90000)

            page.wait_for_timeout(250)
            page.keyboard.type(" E2E")
            page.wait_for_timeout(150)
            text_value_once = (text_layer.text_content() or "").strip()
            expect("E2E" in text_value_once, f"text tool should edit directly on canvas: {text_value_once}")

            page.keyboard.press("Escape")
            page.wait_for_timeout(120)
            text_layer.click()
            page.wait_for_timeout(90)
            text_layer.click()
            page.wait_for_timeout(180)
            page.keyboard.type(" Again")
            page.wait_for_timeout(150)
            text_value_twice = (text_layer.text_content() or "").strip()
            expect("Again" in text_value_twice, f"text layer should support re-edit in canvas: {text_value_twice}")

            result["hashes"] = {
                "before_shape_resize": before_resize_hash,
                "after_shape_resize": after_resize_hash,
            }
            result["text_after_first_edit"] = text_value_once
            result["text_after_second_edit"] = text_value_twice

            save_debug(page, "05-finished")
            (ARTIFACT_DIR / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except PlaywrightTimeoutError as error:
            save_debug(page, "timeout")
            raise AssertionError(f"playwright timeout: {error}") from error
        finally:
            browser.close()


if __name__ == "__main__":
    run()
