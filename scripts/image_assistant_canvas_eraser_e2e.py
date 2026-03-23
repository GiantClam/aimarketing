from __future__ import annotations

import hashlib
import json
import os
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3000").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "canvas-eraser-regression").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / SCENARIO
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


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


def find_recent_session_ids(page, limit: int = 30):
    payload = fetch_json(page, f"/api/image-assistant/sessions?limit={limit}")
    expect(payload["ok"], f"sessions api failed: {payload}")
    rows = (payload["data"] or {}).get("data") or []
    result: list[str] = []
    for row in rows:
        session_id = str((row or {}).get("id") or "").strip()
        if session_id:
            result.append(session_id)
    return result


def open_session_with_candidate(page, session_ids: list[str]):
    for session_id in session_ids:
        page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
        try:
            page.locator("[data-testid^='image-open-canvas-']").first.wait_for(state="visible", timeout=12000)
            return session_id
        except PlaywrightTimeoutError:
            continue
    raise AssertionError("no recent session contains image candidate cards")


def visible_test_id(page, test_id: str):
    return page.locator(f'[data-testid="{test_id}"]:visible').first


def draw_stroke(page, overlay, *, start_ratio: tuple[float, float], end_ratio: tuple[float, float], steps: int = 12):
    box = overlay.bounding_box()
    expect(box is not None, "paint overlay should expose a bounding box")
    sx = box["x"] + box["width"] * start_ratio[0]
    sy = box["y"] + box["height"] * start_ratio[1]
    ex = box["x"] + box["width"] * end_ratio[0]
    ey = box["y"] + box["height"] * end_ratio[1]
    page.mouse.move(sx, sy)
    page.mouse.down()
    page.mouse.move(ex, ey, steps=steps)
    page.mouse.up()


def sha256_hex(data: bytes):
    return hashlib.sha256(data).hexdigest()


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

            session_ids = find_recent_session_ids(page)
            expect(bool(session_ids), "no sessions available for this user")
            target_session = open_session_with_candidate(page, session_ids)
            result["session_id"] = target_session
            save_debug(page, "02-session")

            first_candidate = page.locator("[data-testid^='image-open-canvas-']").first
            first_candidate.wait_for(state="visible", timeout=90000)
            first_candidate.click()

            stage = visible_test_id(page, "image-canvas-stage")
            stage.wait_for(state="visible", timeout=90000)
            overlay = visible_test_id(page, "image-paint-overlay")

            visible_test_id(page, "image-brush-tool").click()
            overlay.wait_for(state="visible", timeout=90000)
            draw_stroke(page, overlay, start_ratio=(0.72, 0.34), end_ratio=(0.93, 0.52))
            page.wait_for_timeout(400)
            brush_bytes = stage.screenshot(path=str(ARTIFACT_DIR / "03-after-brush-stage.png"))
            brush_hash = sha256_hex(brush_bytes)

            visible_test_id(page, "image-eraser-tool").click()
            overlay.wait_for(state="visible", timeout=90000)
            draw_stroke(page, overlay, start_ratio=(0.80, 0.42), end_ratio=(0.92, 0.49))
            page.wait_for_timeout(450)
            eraser_bytes = stage.screenshot(path=str(ARTIFACT_DIR / "04-after-eraser-stage.png"))
            eraser_hash = sha256_hex(eraser_bytes)

            expect(
                brush_hash != eraser_hash,
                "canvas stage did not change after eraser stroke; eraser likely had no effect",
            )

            undo_button = visible_test_id(page, "image-canvas-undo-button")
            undo_button.wait_for(state="visible", timeout=90000)
            expect(undo_button.is_enabled(), "undo should be enabled after brush + eraser strokes")
            undo_button.click()
            page.wait_for_timeout(450)
            undo_bytes = stage.screenshot(path=str(ARTIFACT_DIR / "05-after-undo-stage.png"))
            undo_hash = sha256_hex(undo_bytes)

            expect(
                undo_hash != eraser_hash,
                "undo after eraser did not change canvas state",
            )

            result["hashes"] = {
                "after_brush": brush_hash,
                "after_eraser": eraser_hash,
                "after_undo": undo_hash,
            }

            save_debug(page, "06-finished")
            (ARTIFACT_DIR / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        finally:
            browser.close()


if __name__ == "__main__":
    run()
