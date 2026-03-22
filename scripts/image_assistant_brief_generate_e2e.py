from __future__ import annotations

import json
import os
import re
import urllib.request
from pathlib import Path
from time import perf_counter, sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get(
    "IMAGE_ASSISTANT_TEST_BASE_URL", "http://127.0.0.1:3223"
).strip()
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "brief-generate-flow").strip()
E2E_EMAIL = os.environ.get("IMAGE_ASSISTANT_E2E_EMAIL", "image-e2e@example.com").strip()
E2E_PASSWORD = os.environ.get("IMAGE_ASSISTANT_E2E_PASSWORD", "ImageE2E123!").strip()
ARTIFACT_DIR = Path("artifacts") / "image-assistant" / "brief-generate-flow"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def wait_until_http_ready(timeout_seconds: int = 180):
    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            with urllib.request.urlopen(
                f"{BASE_URL}/api/health", timeout=10
            ) as response:
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


def fetch_session_detail(page, session_id: str):
    payload = fetch_json(page, f"/api/image-assistant/sessions/{session_id}")
    detail = (payload.get("data") or {}).get("data") if payload.get("ok") else None
    return payload, detail


def wait_for_session_detail(
    page, session_id: str, predicate, description: str, timeout_seconds: int = 90
):
    deadline = time() + timeout_seconds
    last_payload = None
    while time() < deadline:
        payload, data = fetch_session_detail(page, session_id)
        last_payload = payload
        if data and predicate(data):
            return data
        sleep(1)
    raise AssertionError(
        f"{description} not ready for session {session_id}: {last_payload}"
    )


def wait_for_versions(page, session_id: str, timeout_seconds: int = 90):
    return wait_for_session_detail(
        page,
        session_id,
        lambda data: bool(data.get("versions") or []),
        "versions",
        timeout_seconds=timeout_seconds,
    )


def wait_for_pending_attachment_count(
    page, expected_count: int, timeout_ms: int = 30000
):
    page.wait_for_function(
        """(expectedCount) =>
            document.querySelectorAll('[data-testid^="image-pending-attachment-"]').length === expectedCount""",
        arg=expected_count,
        timeout=timeout_ms,
    )


def visible_test_id(page, test_id: str):
    return page.locator(f'[data-testid="{test_id}"]:visible').first


def latest_message(messages, *, role: str, message_type: str | None = None):
    filtered = [
        message
        for message in messages
        if message.get("role") == role
        and (message_type is None or message.get("message_type") == message_type)
    ]
    expect(bool(filtered), f"missing message for role={role} type={message_type}")
    return filtered[-1]


def login(page):
    """Login with demo user using API."""
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
    expect(
        response["ok"], f"demo login failed: {response['status']} {response['data']}"
    )
    page.goto(
        f"{BASE_URL}/dashboard/image-assistant",
        timeout=90000,
        wait_until="domcontentloaded",
    )


def wait_for_prompt_ready(page, timeout_ms: int = 90000):
    """Wait for prompt input and generate button to be ready."""
    page.wait_for_function(
        """() => {
            const textarea = Array.from(document.querySelectorAll('[data-testid="image-prompt-input"]')).find((node) => node instanceof HTMLTextAreaElement && node.offsetParent !== null)
            const button = Array.from(document.querySelectorAll('[data-testid="image-generate-button"]')).find((node) => node instanceof HTMLElement && node.offsetParent !== null)
            return Boolean(textarea instanceof HTMLTextAreaElement && textarea.value.trim()) && Boolean(button) && !button.hasAttribute("disabled")
        }""",
        timeout=timeout_ms,
    )


def run_brief_generate_flow(page):
    """
    Run the Q1 -> Q2 -> Q3 -> generate flow.

    Flow:
    1. Q1: User sends initial request with goal
    2. Q2: Assistant returns clarification questions (missing fields)
    3. Q3: User answers with subject, style, composition details
    4. Q4: User confirms usage and ratio from options
    5. Generate: System generates image when brief is complete
    """
    result = {"scenario": SCENARIO, "metrics": {}}

    # Navigate to image assistant workspace
    start = perf_counter()
    page.goto(
        f"{BASE_URL}/dashboard/image-assistant",
        timeout=90000,
        wait_until="domcontentloaded",
    )
    visible_test_id(page, "image-prompt-input").wait_for(state="visible", timeout=90000)
    result["metrics"]["workspace_ready_ms"] = round((perf_counter() - start) * 1000, 2)
    save_debug(page, "01-workspace-ready")

    # Q1: Send initial request with just the goal
    q1_token = f"q1-token-{int(time())}"
    q1_prompt = (
        "Create a summer skincare campaign poster with a clean, bright visual mood. "
        f"token={q1_token}"
    )

    prompt_input = visible_test_id(page, "image-prompt-input")
    prompt_input.fill(q1_prompt)
    wait_for_prompt_ready(page)

    start = perf_counter()
    with page.expect_response(
        lambda response: response.url.endswith("/api/image-assistant/sessions")
        and response.request.method == "POST"
        and response.status == 200,
        timeout=90000,
    ) as session_response_info:
        visible_test_id(page, "image-generate-button").click()

    session_response = session_response_info.value
    session_payload = session_response.json()
    session_id = str((session_payload.get("data") or {}).get("id"))
    expect(
        bool(session_id),
        f"session creation response did not include id: {session_payload}",
    )
    wait_for_pending_attachment_count(page, 0)
    result["session_id"] = session_id
    result["metrics"]["q1_send_ms"] = round((perf_counter() - start) * 1000, 2)

    # Wait for Q1 response (should be clarification)
    initial_detail = wait_for_session_detail(
        page,
        session_id,
        lambda data: len(data.get("messages") or []) >= 2,
        "Q1 initial turn",
    )
    initial_messages = initial_detail.get("messages") or []
    first_user_message = latest_message(
        initial_messages, role="user", message_type="prompt"
    )
    first_assistant_message = latest_message(initial_messages, role="assistant")
    first_request_payload = first_user_message.get("request_payload") or {}
    first_orchestration = first_request_payload.get("orchestration") or {}

    result["q1_user_message_id"] = first_user_message.get("id")
    result["q1_assistant_message_id"] = first_assistant_message.get("id")
    result["q1_message_type"] = first_assistant_message.get("message_type")
    result["q1_orchestration"] = {
        "turn_count": first_orchestration.get("turn_count"),
        "ready_for_generation": first_orchestration.get("ready_for_generation"),
        "missing_fields": first_orchestration.get("missing_fields") or [],
        "reference_count": first_orchestration.get("reference_count"),
    }

    # Q1 should return clarification (note) with missing fields
    expect(
        first_assistant_message.get("message_type") == "note",
        f"Q1 should return clarification note, got: {first_assistant_message.get('message_type')}",
    )
    expect(
        first_orchestration.get("ready_for_generation") is False,
        f"Q1 should not be ready for generation: {first_orchestration}",
    )

    missing_fields_q1 = first_orchestration.get("missing_fields") or []
    expect(
        len(missing_fields_q1) > 0,
        f"Q1 should list missing fields: {first_orchestration}",
    )
    result["q1_missing_fields"] = missing_fields_q1
    result["q1_outcome"] = "clarification"

    # Check if there are prompt questions (Q2 options)
    prompt_questions_q1 = first_orchestration.get("prompt_questions") or []
    result["q1_prompt_questions_count"] = len(prompt_questions_q1)

    save_debug(page, "02-q1-clarification")

    # Q2: Answer the clarification with subject, style, composition
    q2_prompt = "\n".join(
        [
            "Subject: summer skincare bundle with sunscreen, hydrating mist, and cleanser.",
            "Style: fresh natural summer campaign, bright and premium.",
            "Composition: products centered near bottom, title-safe area on top, light blue gradient with water splash accents.",
            "Orientation: portrait.",
            "Resolution: 2K.",
            "Constraints: keep realistic product texture, do not auto-render text copy.",
        ]
    )

    prompt_input = visible_test_id(page, "image-prompt-input")
    prompt_input.fill(q2_prompt)
    wait_for_prompt_ready(page)

    start = perf_counter()
    visible_test_id(page, "image-generate-button").click()

    # Wait for Q2 response
    q2_detail = wait_for_session_detail(
        page,
        session_id,
        lambda data: len(data.get("messages") or []) >= 4,
        "Q2 response",
    )
    result["metrics"]["q2_send_ms"] = round((perf_counter() - start) * 1000, 2)

    q2_messages = q2_detail.get("messages") or []
    q2_user_message = latest_message(q2_messages, role="user", message_type="prompt")
    q2_assistant_message = latest_message(q2_messages, role="assistant")
    q2_request_payload = q2_user_message.get("request_payload") or {}
    q2_orchestration = q2_request_payload.get("orchestration") or {}

    result["q2_user_message_id"] = q2_user_message.get("id")
    result["q2_assistant_message_id"] = q2_assistant_message.get("id")
    result["q2_message_type"] = q2_assistant_message.get("message_type")
    result["q2_orchestration"] = {
        "turn_count": q2_orchestration.get("turn_count"),
        "ready_for_generation": q2_orchestration.get("ready_for_generation"),
        "missing_fields": q2_orchestration.get("missing_fields") or [],
        "reference_count": q2_orchestration.get("reference_count"),
    }

    missing_fields_q2 = q2_orchestration.get("missing_fields") or []
    result["q2_missing_fields"] = missing_fields_q2

    # Q2 should still need clarification for ratio
    expect(
        q2_assistant_message.get("message_type") == "note",
        f"Q2 should return clarification note, got: {q2_assistant_message.get('message_type')}",
    )
    expect(
        q2_orchestration.get("ready_for_generation") is False,
        f"Q2 should not be ready for generation yet: {q2_orchestration}",
    )
    expect(
        "ratio" in missing_fields_q2,
        f"Q2 should still need ratio confirmation: {missing_fields_q2}",
    )

    result["q2_outcome"] = "clarification"
    save_debug(page, "03-q2-clarification")

    # Q3: Confirm usage and ratio from the options
    # The system should have presented options for ratio confirmation
    prompt_questions_q2 = q2_orchestration.get("prompt_questions") or []
    expect(
        len(prompt_questions_q2) > 0,
        f"Q2 should present ratio options: {q2_orchestration}",
    )

    # Find the ratio question and select an option
    ratio_question = None
    for question in prompt_questions_q2:
        if question.get("id") == "ratio":
            ratio_question = question
            break

    expect(
        ratio_question is not None,
        f"Should have ratio question in prompt questions: {prompt_questions_q2}",
    )
    options = ratio_question.get("options") or []
    expect(len(options) > 0, f"Ratio question should have options: {ratio_question}")

    selected_option = options[0]
    for option in options:
        option_id = str(option.get("id") or "").strip()
        option_label = str(option.get("label") or "").strip()
        if option_id == "4:5" or "4:5" in option_label:
            selected_option = option
            break

    selected_option_id = str(selected_option.get("id") or "").strip()
    selected_option_label = str(selected_option.get("label") or "").strip()
    expect(bool(selected_option_id), f"selected option id missing: {selected_option}")
    result["q3_selected_ratio"] = {
        "id": selected_option_id,
        "label": selected_option_label,
    }
    q3_prompt = selected_option.get("prompt_value") or selected_option.get("label")

    prompt_input = visible_test_id(page, "image-prompt-input")
    prompt_input.fill(q3_prompt)
    wait_for_prompt_ready(page)

    start = perf_counter()
    visible_test_id(page, "image-generate-button").click()

    # Wait for versions (should generate image now)
    generated_detail = wait_for_versions(page, session_id, timeout_seconds=120)
    result["metrics"]["q3_generate_ms"] = round((perf_counter() - start) * 1000, 2)

    generated_messages = generated_detail.get("messages") or []
    final_user_message = latest_message(
        generated_messages, role="user", message_type="prompt"
    )
    final_assistant_message = latest_message(generated_messages, role="assistant")
    final_request_payload = final_user_message.get("request_payload") or {}
    final_orchestration = final_request_payload.get("orchestration") or {}
    final_brief = final_orchestration.get("brief") or {}

    result["q3_user_message_id"] = final_user_message.get("id")
    result["q3_assistant_message_id"] = final_assistant_message.get("id")
    result["q3_message_type"] = final_assistant_message.get("message_type")
    result["q3_orchestration"] = {
        "turn_count": final_orchestration.get("turn_count"),
        "ready_for_generation": final_orchestration.get("ready_for_generation"),
        "missing_fields": final_orchestration.get("missing_fields") or [],
        "reference_count": final_orchestration.get("reference_count"),
    }
    result["q3_brief"] = {
        "goal": final_brief.get("goal"),
        "subject": final_brief.get("subject"),
        "style": final_brief.get("style"),
        "composition": final_brief.get("composition"),
        "orientation": final_brief.get("orientation"),
        "resolution": final_brief.get("resolution"),
        "size_preset": final_brief.get("size_preset"),
    }

    # Q3 should trigger generation
    expect(
        final_orchestration.get("ready_for_generation") is True,
        f"Q3 should be ready for generation: {final_orchestration}",
    )
    expect(
        not (final_orchestration.get("missing_fields") or []),
        f"Q3 should not have missing fields: {final_orchestration}",
    )
    expect(
        final_assistant_message.get("message_type") == "result_summary",
        f"Q3 should return result_summary, got: {final_assistant_message.get('message_type')}",
    )
    # Verify brief was properly collected
    goal_text = str(final_brief.get("goal") or "").lower()
    expect(
        "skincare" in goal_text or "summer" in goal_text,
        f"Goal should contain skincare/summer reference: {final_brief}",
    )
    expect(
        final_brief.get("orientation") in {"portrait", "landscape", "square"},
        f"Orientation invalid: {final_brief}",
    )
    expect(
        final_brief.get("resolution") in {"1K", "2K", "4K"},
        f"Resolution invalid: {final_brief}",
    )
    expect(
        final_brief.get("size_preset") == selected_option_id,
        f"Size preset should match selected ratio {selected_option_id}: {final_brief}",
    )

    result["q3_outcome"] = "generated"
    save_debug(page, "04-q3-generated")

    # Verify versions were created
    versions = generated_detail.get("versions") or []
    expect(len(versions) > 0, "Should have at least one version after generation")

    latest_version = versions[0] or {}
    result["latest_version"] = {
        "id": latest_version.get("id"),
        "version_kind": latest_version.get("version_kind"),
        "status": latest_version.get("status"),
        "prompt_text_length": len(latest_version.get("prompt_text") or ""),
    }

    latest_prompt_text = latest_version.get("prompt_text") or ""
    expect(
        len(latest_prompt_text) > 50,
        f"Generated prompt should be substantial: {latest_prompt_text[:100]}",
    )

    # Verify candidates exist
    candidates = latest_version.get("candidates") or []
    expect(len(candidates) > 0, "Should have at least one candidate image")
    result["candidates_count"] = len(candidates)

    # Wait for and verify image candidates are visible in UI
    page.goto(
        f"{BASE_URL}/dashboard/image-assistant/{session_id}",
        timeout=90000,
        wait_until="domcontentloaded",
    )
    page.wait_for_timeout(3000)  # Wait for images to load

    # Look for candidate images
    candidate_elements = page.locator("[data-testid^='image-open-canvas-']")
    expect(candidate_elements.count() > 0, "Should have visible candidate images in UI")
    result["ui_candidates_visible"] = candidate_elements.count()

    save_debug(page, "05-candidates-visible")

    # Click on first candidate to open canvas
    candidate_elements.first.click()
    visible_test_id(page, "image-canvas-stage").wait_for(state="visible", timeout=90000)
    save_debug(page, "06-canvas-opened")

    # Close canvas
    visible_test_id(page, "image-canvas-close-button").click()
    page.wait_for_timeout(500)

    result["flow_completed"] = True
    result["flow_summary"] = {
        "q1_turn": "clarification_received",
        "q2_turn": "clarification_received",
        "q3_turn": "generation_completed",
        "session_id": session_id,
        "versions_created": len(versions),
        "candidates_created": len(candidates),
    }

    save_debug(page, "07-flow-complete")
    return result


def main():
    wait_until_http_ready()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(
            viewport={"width": 1480, "height": 1100}, accept_downloads=True
        )
        page.set_default_timeout(90000)
        network_logs: list[dict[str, object]] = []
        console_logs: list[dict[str, object]] = []

        def handle_response(response):
            if (
                "/api/auth/demo" not in response.url
                and "/api/image-assistant/" not in response.url
            ):
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
            report = run_brief_generate_flow(page)

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
