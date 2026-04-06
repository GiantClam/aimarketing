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


WORKFLOWS = [
    {
        "advisor_type": "company-search",
        "entry_path": "/dashboard/advisor/company-search/new",
        "query": "Find US B2B SaaS companies with 50-500 employees in AI marketing automation.",
    },
    {
        "advisor_type": "contact-mining",
        "entry_path": "/dashboard/advisor/contact-mining/new",
        "query": "company_name: HubSpot; Find VP Marketing or Head of Growth contacts from US B2B SaaS companies in AI marketing automation.",
    },
]


def get_send_shortcut():
    return "Meta+Enter" if sys.platform == "darwin" else "Control+Enter"


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
        except Exception as error:  # noqa: BLE001
            last_error = error
            time.sleep(2)
            continue

        for cookie in cookies:
            if cookie.startswith("aimarketing_session="):
                return cookie.split(";", 1)[0].split("=", 1)[1]

        time.sleep(2)

    raise RuntimeError(f"login did not return aimarketing_session cookie: {last_error}")


def fetch_json(url: str, session_cookie: str):
    request = urllib.request.Request(
        url,
        headers={"Cookie": f"aimarketing_session={session_cookie}"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


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


def poll_assistant_reply(base_url: str, advisor_type: str, conversation_id: str, session_cookie: str, timeout_seconds: int):
    deadline = time.time() + timeout_seconds
    last_answers = []
    while time.time() < deadline:
        try:
            payload = fetch_json(
                f"{base_url}/api/dify/messages?advisorType={advisor_type}&conversation_id={conversation_id}&limit=20",
                session_cookie,
            )
        except urllib.error.HTTPError as error:
            if error.code == 404:
                time.sleep(1.5)
                continue
            raise

        items = payload.get("data") or []
        answers = [str(item.get("answer") or "").strip() for item in items if isinstance(item, dict)]
        for answer in reversed(answers):
            if answer and "request failed" not in answer.lower() and "unknown error" not in answer.lower():
                return answer, answers

        last_answers = answers
        time.sleep(1.5)

    raise RuntimeError(f"assistant reply not ready: {last_answers}")


def submit_async_chat(
    base_url: str,
    session_cookie: str,
    advisor_type: str,
    query: str,
    conversation_id: str | None = None,
):
    payload = {
        "advisorType": advisor_type,
        "query": query,
        "response_mode": "async",
        "inputs": {"contents": query},
    }
    if conversation_id:
        payload["conversation_id"] = conversation_id

    request = urllib.request.Request(
        f"{base_url}/api/dify/chat-messages",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Cookie": f"aimarketing_session={session_cookie}",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def run_workflow_case(page, base_url: str, workflow: dict, timeout_seconds: int, artifact_dir: Path, session_cookie: str):
    advisor_type = workflow["advisor_type"]
    entry_path = workflow["entry_path"]
    query = workflow["query"]

    page.goto(f"{base_url}{entry_path}", wait_until="networkidle")
    page.wait_for_url(re.compile(rf".*/dashboard/advisor/{re.escape(advisor_type)}/(new|[A-Za-z0-9_-]+)$"), timeout=30000)
    page.screenshot(path=str(artifact_dir / f"{advisor_type}-entry.png"), full_page=True)

    chat_input = page.locator("textarea:visible").first
    chat_input.wait_for(timeout=20000)

    with page.expect_response(
        lambda response: response.url.endswith("/api/dify/chat-messages")
        and response.request.method == "POST"
        and response.status == 200,
        timeout=30000,
    ) as chat_response_info:
        chat_input.fill(query)
        chat_input.press(get_send_shortcut())

    chat_response = chat_response_info.value
    content_type = (chat_response.headers.get("content-type") or "").lower()
    chat_payload = None
    task_id = ""
    conversation_id = str(chat_response.headers.get("x-conversation-id") or "")
    response_mode = "streaming" if "text/event-stream" in content_type else "json"

    try:
        chat_payload = chat_response.json()
    except Exception:
        chat_payload = None

    if isinstance(chat_payload, dict):
        task_id = str(chat_payload.get("task_id") or "")
        if not conversation_id:
            conversation_id = str(chat_payload.get("conversation_id") or "")
        if task_id:
            response_mode = "async"

    if not task_id:
        # Fallback to async API submission when UI request is streaming-only and no task id is exposed.
        async_payload = submit_async_chat(
            base_url=base_url,
            session_cookie=session_cookie,
            advisor_type=advisor_type,
            query=query,
            conversation_id=conversation_id or None,
        )
        task_id = str(async_payload.get("task_id") or "")
        if not conversation_id:
            conversation_id = str(async_payload.get("conversation_id") or "")
        response_mode = "async-fallback"

    task_payload = None
    if task_id:
        task_payload = poll_task(base_url, task_id, session_cookie, timeout_seconds)
        task_result = (task_payload.get("data") or {}).get("result") or {}
        if isinstance(task_result, dict):
            if not conversation_id:
                conversation_id = str(task_result.get("conversation_id") or "")
        page.wait_for_timeout(1500)

    page.wait_for_url(re.compile(rf".*/dashboard/advisor/{re.escape(advisor_type)}/[A-Za-z0-9_-]+$"), timeout=45000)
    if not conversation_id:
        match = re.search(rf"/dashboard/advisor/{re.escape(advisor_type)}/([A-Za-z0-9_-]+)", page.url)
        if match:
            conversation_id = match.group(1)
    page.wait_for_timeout(1500)

    if not conversation_id:
        raise RuntimeError(
            f"{advisor_type}: conversation id missing, mode={response_mode}, payload={chat_payload}, task_id={task_id}"
        )

    try:
        assistant_text, all_texts = poll_assistant_reply(
            base_url=base_url,
            advisor_type=advisor_type,
            conversation_id=conversation_id,
            session_cookie=session_cookie,
            timeout_seconds=timeout_seconds,
        )
    except RuntimeError:
        task_result = ((task_payload or {}).get("data") or {}).get("result") or {}
        fallback_answer = task_result.get("answer") if isinstance(task_result, dict) else None
        if isinstance(fallback_answer, str) and fallback_answer.strip():
            assistant_text, all_texts = fallback_answer.strip(), [fallback_answer.strip()]
        else:
            raise

    page.reload(wait_until="networkidle")
    page.wait_for_timeout(1500)
    page.screenshot(path=str(artifact_dir / f"{advisor_type}-result.png"), full_page=True)

    return {
        "advisor_type": advisor_type,
        "conversation_id": conversation_id,
        "task_id": task_id or None,
        "response_mode": response_mode,
        "assistant_preview": assistant_text[:400],
        "messages_count": len(all_texts),
        "artifacts": {
            "entry": str(artifact_dir / f"{advisor_type}-entry.png"),
            "result": str(artifact_dir / f"{advisor_type}-result.png"),
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--session-cookie")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--timeout-seconds", type=int, default=150)
    parser.add_argument("--out-dir", default="artifacts/lead-hunter-workflows-e2e")
    parser.add_argument("--skip-availability-check", action="store_true")
    args = parser.parse_args()

    session_cookie = args.session_cookie
    if not session_cookie:
        if not args.email or not args.password:
            raise RuntimeError("provide --session-cookie or both --email and --password")
        session_cookie = login_and_get_session_cookie(args.base_url, args.email, args.password)

    artifact_dir = Path(args.out_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    if not args.skip_availability_check:
        availability = fetch_json(f"{args.base_url}/api/dify/advisors/availability", session_cookie).get("data", {})
        if not availability.get("companySearch"):
            raise RuntimeError(f"company-search unavailable: {availability}")
        if not availability.get("contactMining"):
            raise RuntimeError(f"contact-mining unavailable: {availability}")

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
        page.screenshot(path=str(artifact_dir / "dashboard.png"), full_page=True)

        if "/login" in page.url:
            raise RuntimeError("session cookie was not accepted; redirected to login")

        # Page display checks.
        if page.locator("a[href='/dashboard/advisor/company-search/new']").count() < 1:
            raise RuntimeError("company-search entry is missing on dashboard")
        if page.locator("a[href='/dashboard/advisor/contact-mining/new']").count() < 1:
            raise RuntimeError("contact-mining entry is missing on dashboard")

        results = []
        for workflow in WORKFLOWS:
            results.append(
                run_workflow_case(
                    page=page,
                    base_url=args.base_url,
                    workflow=workflow,
                    timeout_seconds=args.timeout_seconds,
                    artifact_dir=artifact_dir,
                    session_cookie=session_cookie,
                )
            )

        browser.close()

    print(
        json.dumps(
            {
                "ok": True,
                "summary": {
                    "workflows_tested": [item["advisor_type"] for item in results],
                    "all_passed": True,
                },
                "results": results,
                "artifacts": {
                    "dashboard": str(artifact_dir / "dashboard.png"),
                },
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(1)
