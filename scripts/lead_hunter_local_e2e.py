import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright


def login_and_get_session_cookie(base_url: str, email: str, password: str):
    deadline = time.time() + 60
    last_error = None
    while time.time() < deadline:
        request = urllib.request.Request(
            f"{base_url}/api/auth/login",
            data=json.dumps({"email": email, "password": password}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                cookies = response.headers.get_all("Set-Cookie") or []
        except urllib.error.HTTPError as error:
            last_error = error
            if error.code == 404:
                time.sleep(2)
                continue
            raise
        except Exception as error:
            last_error = error
            time.sleep(2)
            continue

        for cookie in cookies:
            if cookie.startswith("aimarketing_session="):
                return cookie.split(";", 1)[0].split("=", 1)[1]

        time.sleep(2)

    raise RuntimeError(f"login did not return aimarketing_session cookie: {last_error}")


def poll_task(base_url: str, task_id: str, session_cookie: str, timeout_seconds: int):
    deadline = time.time() + timeout_seconds
    last_payload = None
    while time.time() < deadline:
        request = urllib.request.Request(
            f"{base_url}/api/tasks/{task_id}",
            headers={"Cookie": f"aimarketing_session={session_cookie}"},
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code == 404:
                time.sleep(2)
                continue
            raise
        last_payload = payload
        status = payload.get("data", {}).get("status")
        if status == "success":
            return payload
        if status == "failed":
            raise RuntimeError(json.dumps(payload, ensure_ascii=False))
        time.sleep(1.5)

    raise TimeoutError(json.dumps(last_payload, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--session-cookie")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--query", default="Find overseas buyers for AI marketing workflow software in Europe.")
    parser.add_argument("--out-dir", default="artifacts/lead-hunter-e2e")
    parser.add_argument("--timeout-seconds", type=int, default=120)
    args = parser.parse_args()

    session_cookie = args.session_cookie
    if not session_cookie:
        if not args.email or not args.password:
            raise RuntimeError("provide --session-cookie or both --email and --password")
        session_cookie = login_and_get_session_cookie(args.base_url, args.email, args.password)

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    parsed_base = urlparse(args.base_url)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context()
        context.add_cookies(
            [
                {
                    "name": "aimarketing_session",
                    "value": session_cookie,
                    "domain": parsed_base.hostname or "127.0.0.1",
                    "path": "/",
                    "httpOnly": True,
                    "sameSite": "Lax",
                }
            ]
        )

        page = context.new_page()
        page.goto(f"{args.base_url}/dashboard", wait_until="networkidle")
        page.screenshot(path=str(out_dir / "dashboard.png"), full_page=True)

        if "/login" in page.url:
            raise RuntimeError("session cookie was not accepted; redirected to login")

        lead_hunter_link = page.locator("a[href='/dashboard/advisor/company-search/new']").first
        lead_hunter_link.wait_for(timeout=20000)
        lead_hunter_link.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_url(re.compile(r".*/dashboard/advisor/company-search/(new|[A-Za-z0-9_-]+)$"), timeout=20000)
        page.screenshot(path=str(out_dir / "lead-hunter-entry.png"), full_page=True)

        chat_input = page.locator("input").last
        chat_input.wait_for(timeout=20000)

        with page.expect_response(
            lambda response: response.url.endswith("/api/dify/chat-messages")
            and response.request.method == "POST"
            and response.status == 200,
            timeout=20000,
        ) as chat_response_info:
            chat_input.fill(args.query)
            chat_input.press("Enter")

        chat_payload = chat_response_info.value.json()
        task_id = str(chat_payload.get("task_id") or "")
        if not task_id:
            raise RuntimeError(f"missing task_id: {chat_payload}")

        conversation_id = str(chat_payload.get("conversation_id") or "")
        if not conversation_id:
            raise RuntimeError(f"missing conversation_id: {chat_payload}")

        poll_task(args.base_url, task_id, session_cookie, args.timeout_seconds)

        page.wait_for_url(re.compile(r".*/dashboard/advisor/company-search/[A-Za-z0-9_-]+$"), timeout=20000)
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(5000)
        bubbles = page.locator("div.break-words")
        bubbles.nth(1).wait_for(timeout=120000)
        message_texts = bubbles.all_inner_texts()
        message_texts = [item.strip() for item in message_texts if item and item.strip()]

        if len(message_texts) < 2:
            raise RuntimeError(f"expected at least 2 message bubbles, got: {message_texts}")

        assistant_text = message_texts[-1]
        page.screenshot(path=str(out_dir / "lead-hunter-result.png"), full_page=True)
        browser.close()

    print(
        json.dumps(
            {
                "ok": True,
                "conversation_id": conversation_id,
                "task_id": task_id,
                "assistant_preview": assistant_text[:400],
                "artifacts": {
                    "dashboard": str(out_dir / "dashboard.png"),
                    "entry": str(out_dir / "lead-hunter-entry.png"),
                    "result": str(out_dir / "lead-hunter-result.png"),
                },
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(1)
