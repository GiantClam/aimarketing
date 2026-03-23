from __future__ import annotations

import json
import os
import urllib.request
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3000").strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "export-download-regression").strip()
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


def find_remote_candidate(page):
    sessions_payload = fetch_json(page, "/api/image-assistant/sessions?limit=30")
    expect(sessions_payload["ok"], f"sessions request failed: {sessions_payload}")
    sessions = (sessions_payload["data"] or {}).get("data") or []

    for session in sessions:
        session_id = str((session or {}).get("id") or "").strip()
        if not session_id:
            continue
        detail_payload = fetch_json(
            page,
            f"/api/image-assistant/sessions/{session_id}?mode=content&messageLimit=50&versionLimit=20",
        )
        if not detail_payload["ok"]:
            continue
        detail = (detail_payload["data"] or {}).get("data") or {}
        versions = detail.get("versions") or []
        for version in versions:
            candidates = version.get("candidates") or []
            for candidate in candidates:
                candidate_id = str((candidate or {}).get("id") or "").strip()
                candidate_url = str((candidate or {}).get("url") or "").strip()
                if candidate_id and candidate_url.startswith("http"):
                    return {
                        "session_id": session_id,
                        "candidate_id": candidate_id,
                        "candidate_url": candidate_url,
                    }
    return None


def run():
    wait_until_http_ready()
    result: dict[str, object] = {"scenario": SCENARIO, "base_url": BASE_URL}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(accept_downloads=True, viewport={"width": 1480, "height": 1080})
        page = context.new_page()
        page.set_default_timeout(90000)

        try:
            login_demo(page)
            page.goto(f"{BASE_URL}/dashboard/image-assistant", timeout=90000, wait_until="domcontentloaded")

            candidate = find_remote_candidate(page)
            expect(candidate is not None, "no remote-url candidate found for export test")

            session_id = str(candidate["session_id"])
            candidate_id = str(candidate["candidate_id"])
            result["session_id"] = session_id
            result["candidate_id"] = candidate_id
            result["candidate_url"] = str(candidate["candidate_url"])

            page.goto(f"{BASE_URL}/dashboard/image-assistant/{session_id}", timeout=90000, wait_until="domcontentloaded")
            export_button = page.get_by_test_id(f"image-export-candidate-{candidate_id}")
            export_button.wait_for(state="visible", timeout=90000)
            export_button.scroll_into_view_if_needed()
            save_debug(page, "01-before-export")

            with page.expect_response(
                lambda response: "/api/image-assistant/assets/proxy?url=" in response.url
                and response.request.method == "GET",
                timeout=90000,
            ) as proxy_response_info:
                with page.expect_download(timeout=90000):
                    export_button.click()

            proxy_response = proxy_response_info.value
            expect(proxy_response.status == 200, f"proxy response status != 200: {proxy_response.status}")
            result["proxy_status"] = proxy_response.status
            result["proxy_url"] = proxy_response.url

            save_debug(page, "02-after-export")
            (ARTIFACT_DIR / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except PlaywrightTimeoutError as error:
            save_debug(page, "failed-timeout")
            raise AssertionError(f"playwright timeout: {error}") from error
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    run()

