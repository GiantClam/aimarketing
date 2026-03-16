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


def login(page):
    page.goto(f"{BASE_URL}/login", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
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
    page.goto(f"{BASE_URL}/dashboard", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)


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

    image_link = page.locator('a[href="/dashboard/image-assistant"]')
    expect(image_link.count() >= 1, "dashboard should show image assistant quick link")

    start = perf_counter()
    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
    page.get_by_test_id("image-prompt-input").wait_for(state="visible", timeout=90000)
    result["metrics"]["workspace_ready_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "01-home")

    page.get_by_test_id("image-reference-file-input").set_input_files(
        [{"name": "sample.png", "mimeType": "image/png", "buffer": PNG_BYTES}]
    )
    page.wait_for_timeout(1200)

    prompt_input = page.get_by_test_id("image-prompt-input")
    prompt_input.fill("Generate a premium summer campaign poster for a skincare product.")
    start = perf_counter()
    page.get_by_test_id("image-generate-button").click()
    page.get_by_test_id("image-candidate-grid").wait_for(state="visible", timeout=90000)
    result["metrics"]["generate_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "02-generated")

    first_candidate = page.locator("[data-testid^='image-open-canvas-']").first
    expect(first_candidate.count() == 1, "expected at least one image candidate")
    first_candidate.click()
    page.get_by_test_id("image-canvas-stage").wait_for(state="visible", timeout=90000)
    page.get_by_test_id("image-canvas-save-button").wait_for(state="visible", timeout=90000)
    save_debug(page, "03-canvas")

    page.get_by_test_id("image-brush-tool").click()
    paint_overlay = page.get_by_test_id("image-paint-overlay")
    paint_overlay.wait_for(state="visible", timeout=90000)
    paint_box = paint_overlay.bounding_box()
    expect(paint_box is not None, "paint overlay should expose a bounding box")
    page.mouse.move(paint_box["x"] + paint_box["width"] * 0.22, paint_box["y"] + paint_box["height"] * 0.24)
    page.mouse.down()
    page.mouse.move(paint_box["x"] + paint_box["width"] * 0.42, paint_box["y"] + paint_box["height"] * 0.32, steps=8)
    page.mouse.move(paint_box["x"] + paint_box["width"] * 0.56, paint_box["y"] + paint_box["height"] * 0.4, steps=8)
    page.mouse.up()
    undo_button = page.get_by_test_id("image-canvas-undo-button")
    redo_button = page.get_by_test_id("image-canvas-redo-button")
    undo_button.wait_for(state="visible", timeout=90000)
    page.wait_for_function(
        """() => {
            const button = document.querySelector('[data-testid="image-canvas-undo-button"]')
            return Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    expect(undo_button.is_enabled(), "undo button should become enabled after drawing")
    undo_button.click()
    page.wait_for_timeout(250)
    page.wait_for_function(
        """() => {
            const button = document.querySelector('[data-testid="image-canvas-redo-button"]')
            return Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    page.get_by_test_id("image-canvas-redo-button").click()
    page.wait_for_timeout(400)
    page.get_by_test_id("image-add-text-layer").wait_for(state="visible", timeout=90000)
    page.get_by_test_id("image-add-text-layer").click()
    page.get_by_test_id("image-mask-tool").click()
    overlay = page.get_by_test_id("image-mask-overlay")
    overlay.wait_for(state="visible", timeout=90000)
    box = overlay.bounding_box()
    expect(box is not None, "mask overlay should expose a bounding box")
    start_x = box["x"] + box["width"] * 0.18
    start_y = box["y"] + box["height"] * 0.16
    end_x = box["x"] + box["width"] * 0.58
    end_y = box["y"] + box["height"] * 0.46
    page.mouse.move(start_x, start_y)
    page.mouse.down()
    page.mouse.move(end_x, end_y, steps=8)
    page.mouse.up()
    page.get_by_test_id("image-mask-selection").wait_for(state="visible", timeout=90000)
    save_button = page.get_by_test_id("image-canvas-save-button")
    save_button.click()
    page.get_by_test_id("image-canvas-edit-prompt").wait_for(state="visible", timeout=90000)
    page.wait_for_timeout(1500)

    canvas_edit_prompt = page.get_by_test_id("image-canvas-edit-prompt")
    canvas_edit_prompt.fill("Turn the headline area into a neon-style title while preserving the composition.")
    page.wait_for_function(
        """() => {
            const textarea = document.querySelector('[data-testid="image-canvas-edit-prompt"]')
            const button = document.querySelector('[data-testid="image-canvas-ai-edit-button"]')
            return Boolean(textarea instanceof HTMLTextAreaElement && textarea.value.trim()) && Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=90000,
    )
    start = perf_counter()
    page.get_by_test_id("image-canvas-ai-edit-button").click()
    page.get_by_test_id("image-candidate-grid").wait_for(state="visible", timeout=90000)
    result["metrics"]["canvas_ai_edit_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "04-canvas-ai-edit")

    with page.expect_download(timeout=60000):
        page.locator("[data-testid^='image-open-canvas-']").first.click()
        page.get_by_test_id("image-canvas-stage").wait_for(state="visible", timeout=90000)
        page.get_by_test_id("image-canvas-export-button").click()

    result["export_verified"] = True
    return result


def run_provider_missing(page):
    result = {"scenario": SCENARIO}
    availability = assert_availability(page, enabled=False, provider="aiberm", reason="aiberm_api_key_missing")
    result["availability"] = availability

    page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=90000)
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
