from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from playwright.sync_api import Page, sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
LOGIN_EMAIL = os.environ.get("VISUAL_REGRESSION_EMAIL", "demo@example.com")
LOGIN_PASSWORD = os.environ.get("VISUAL_REGRESSION_PASSWORD", "demo123456")
ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_ROOT = ROOT / "artifacts" / "visual-regression"
RUN_DIR = ARTIFACT_ROOT / datetime.now().strftime("%Y%m%d-%H%M%S")
TIMEOUT_MS = 90000


def ensure_run_dir() -> None:
    RUN_DIR.mkdir(parents=True, exist_ok=True)


def attach_loggers(page: Page, store: dict[str, list[str]]) -> None:
    page.on("console", lambda msg: store["console"].append(f"{msg.type}: {msg.text}"))
    page.on("pageerror", lambda err: store["pageerror"].append(str(err)))
    page.on(
        "requestfailed",
        lambda req: (
            None
            if ("_rsc=" in req.url and "ERR_ABORTED" in str(req.failure or ""))
            else store["requestfailed"].append(f"{req.method} {req.url} -> {req.failure or 'unknown'}")
        ),
    )


def login(page: Page) -> None:
    page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded", timeout=TIMEOUT_MS)
    response = page.evaluate(
        """
        async ({ baseUrl, email, password }) => {
          const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          let data = null;
          try {
            data = await loginRes.json();
          } catch (error) {
            data = { parseError: String(error) };
          }
          if (loginRes.ok) {
            return { ok: true, status: loginRes.status, data, mode: "password" };
          }

          const demoRes = await fetch(`${baseUrl}/api/auth/demo`, {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
          });
          let demoData = null;
          try {
            demoData = await demoRes.json();
          } catch (error) {
            demoData = { parseError: String(error) };
          }
          return { ok: demoRes.ok, status: demoRes.status, data: demoData, mode: "demo", login: data };
        }
        """,
        {"baseUrl": BASE_URL, "email": LOGIN_EMAIL, "password": LOGIN_PASSWORD},
    )
    if not response["ok"]:
        raise RuntimeError(f"demo login failed: {response}")
    page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle", timeout=TIMEOUT_MS)
    if "/login" in page.url:
        raise RuntimeError("login session was not accepted by the dashboard route")
    page.wait_for_timeout(1200)


def capture_route(
    page: Page,
    name: str,
    path: str,
    *,
    wait_selector: str | None = None,
    full_page: bool = True,
) -> dict[str, Any]:
    result: dict[str, Any] = {"name": name, "path": path, "status": "ok", "screenshot": None, "finalUrl": None}
    try:
        page.goto(f"{BASE_URL}{path}", wait_until="domcontentloaded", timeout=TIMEOUT_MS)
        page.wait_for_load_state("networkidle", timeout=TIMEOUT_MS)
        result["finalUrl"] = page.url
        expected_url = f"{BASE_URL}{path}"
        if not page.url.startswith(expected_url):
            result["status"] = "skipped"
            result["reason"] = f"redirected to {page.url}"
            return result
        if wait_selector:
            page.wait_for_selector(wait_selector, state="visible", timeout=TIMEOUT_MS)
        page.wait_for_timeout(1200)
        screenshot_path = RUN_DIR / f"{name}.png"
        page.screenshot(path=str(screenshot_path), full_page=full_page)
        result["screenshot"] = str(screenshot_path)
    except Exception as error:
        result["status"] = "failed"
        result["error"] = str(error)
    return result


def try_capture_image_editor(page: Page) -> dict[str, Any]:
    result: dict[str, Any] = {
        "name": "image-assistant-canvas-editor",
        "path": page.url,
        "status": "skipped",
        "screenshot": None,
        "finalUrl": None,
    }
    try:
        page.goto(f"{BASE_URL}/dashboard/image-assistant", wait_until="domcontentloaded", timeout=TIMEOUT_MS)
        page.wait_for_load_state("networkidle", timeout=TIMEOUT_MS)
        result["finalUrl"] = page.url
        page.wait_for_timeout(1200)

        open_buttons = page.locator('[data-testid^="image-open-canvas-"]:visible')
        if open_buttons.count() == 0:
            session_links = page.locator('a[href^="/dashboard/image-assistant/"]:visible')
            if session_links.count() > 0:
                session_links.first.click()
                page.wait_for_load_state("networkidle", timeout=TIMEOUT_MS)
                result["finalUrl"] = page.url
                page.wait_for_timeout(1500)
                open_buttons = page.locator('[data-testid^="image-open-canvas-"]:visible')

        if open_buttons.count() == 0:
            result["reason"] = "no visible canvas trigger in current demo data"
            return result

        open_buttons.first.click()
        page.wait_for_selector('[data-testid="image-canvas-stage"]', state="visible", timeout=TIMEOUT_MS)
        page.wait_for_timeout(1200)
        screenshot_path = RUN_DIR / "image-assistant-canvas-editor.png"
        page.screenshot(path=str(screenshot_path), full_page=True)
        result["status"] = "ok"
        result["path"] = page.url
        result["screenshot"] = str(screenshot_path)
        return result
    except Exception as error:
        result["status"] = "failed"
        result["error"] = str(error)
        return result


def run_suite(label: str, viewport: dict[str, int], is_mobile: bool = False) -> dict[str, Any]:
    logs: dict[str, list[str]] = {"console": [], "pageerror": [], "requestfailed": []}
    captures: list[dict[str, Any]] = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport=viewport,
            is_mobile=is_mobile,
            device_scale_factor=1 if not is_mobile else 2,
        )
        page = context.new_page()
        attach_loggers(page, logs)
        login(page)

        route_specs = [
            ("dashboard-home", "/dashboard", "text=Workspace", True),
            ("advisor-brand", "/dashboard/advisor/brand-strategy", None, True),
            ("writer-home", "/dashboard/writer", '[data-testid="writer-send-button"]', True),
            ("image-assistant-home", "/dashboard/image-assistant", '[data-testid="image-prompt-input"]', True),
            ("website-generator", "/dashboard/website-generator", None, True),
            ("video", "/dashboard/video", None, True),
            ("settings", "/dashboard/settings", None, True),
        ]

        if is_mobile:
            route_specs = [
                ("dashboard-home-mobile", "/dashboard", None, True),
                ("image-assistant-mobile", "/dashboard/image-assistant", '[data-testid="image-prompt-input"]', True),
                ("settings-mobile", "/dashboard/settings", None, True),
            ]

        for name, path, wait_selector, full_page in route_specs:
            captures.append(capture_route(page, name, path, wait_selector=wait_selector, full_page=full_page))

        if not is_mobile:
            captures.append(try_capture_image_editor(page))

        browser.close()

    return {"label": label, "viewport": viewport, "captures": captures, "logs": logs}


def summarize(run_data: dict[str, Any]) -> dict[str, Any]:
    captures = run_data["captures"]
    return {
        "label": run_data["label"],
        "viewport": run_data["viewport"],
        "ok": [item["name"] for item in captures if item["status"] == "ok"],
        "failed": [item for item in captures if item["status"] == "failed"],
        "skipped": [item for item in captures if item["status"] == "skipped"],
        "console_count": len(run_data["logs"]["console"]),
        "pageerror_count": len(run_data["logs"]["pageerror"]),
        "requestfailed_count": len(run_data["logs"]["requestfailed"]),
    }


def main() -> int:
    ensure_run_dir()

    desktop = run_suite("desktop", {"width": 1600, "height": 1200})
    mobile = run_suite("mobile", {"width": 430, "height": 932}, is_mobile=True)

    report = {
        "baseUrl": BASE_URL,
        "runDir": str(RUN_DIR),
        "runs": [desktop, mobile],
        "summary": [summarize(desktop), summarize(mobile)],
    }

    report_path = RUN_DIR / "report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))
    print(f"report={report_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
