#!/usr/bin/env python3
"""Black-box acceptance test for the M3 workflow canvas vertical slice.

The test deliberately refuses to manufacture a passing result.  It requires a
production Next build, a reachable PostgreSQL database, the M3 feature flags,
and a configured OpenAI-compatible image provider.  A missing prerequisite is
reported as a blocker and exits non-zero.

The server is started by this script unless ``--base-url`` is supplied.  The
browser session is kept across an optional server restart so the recovery path
uses the same authenticated client as a real user.
"""

from __future__ import annotations

import argparse
import json
import os
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "workflow-canvas-m3"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


class Blocker(RuntimeError):
    """An unavailable prerequisite or an unproven acceptance assertion."""


def expect(condition: bool, message: str) -> None:
    if not condition:
        raise Blocker(message)


def database_configured() -> bool:
    names = (
        "AI_MARKETING_DB_POSTGRES_URL",
        "DATABASE_URL",
        "POSTGRES_URL",
        "POSTGRES_PRISMA_URL",
        "AI_MARKETING_DB_POSTGRES_URL_NON_POOLING",
        "DATABASE_URL_UNPOOLED",
        "POSTGRES_URL_NON_POOLING",
    )
    return any(os.environ.get(name, "").strip() for name in names)


def require_m3_environment() -> None:
    if not database_configured():
        raise Blocker(
            "database_not_configured: set DATABASE_URL (or an equivalent "
            "AI_MARKETING_DB_POSTGRES_URL/POSTGRES_URL variable) before running M3 E2E"
        )

    expected_flags = {
        "WORKFLOW_NODE_REGISTRY_V2": "1",
        "WORKFLOW_DEFINITION_V2_WRITE": "1",
        "WORKFLOW_ITERATIONS_V1": "1",
        "WORKFLOW_OPENAI_IMAGE_ADAPTER_V1": "1",
    }
    missing = [name for name, value in expected_flags.items() if os.environ.get(name) != value]
    if missing:
        raise Blocker(
            "m3_feature_flags_disabled: set "
            + ", ".join(f"{name}=1" for name in missing)
        )

    secret = os.environ.get("WORKFLOW_CONFIRMATION_SECRET", "").encode("utf-8")
    if len(secret) < 32:
        raise Blocker(
            "workflow_confirmation_secret_invalid: WORKFLOW_CONFIRMATION_SECRET must be at least 32 bytes"
        )

    provider = os.environ.get("WORKFLOW_E2E_IMAGE_PROVIDER", "pptoken").strip().lower()
    key_names = {
        "pptoken": ("IMAGE_ASSISTANT_PPTOKEN_API_KEY",),
        "aiberm": ("IMAGE_ASSISTANT_AIBERM_API_KEY", "AIBERM_API_KEY", "WRITER_AIBERM_API_KEY"),
        "crazyroute": (
            "IMAGE_ASSISTANT_CRAZYROUTE_API_KEY",
            "CRAZYROUTE_API_KEY",
            "CRAZYROUTER_API_KEY",
        ),
    }
    if provider not in key_names:
        raise Blocker(f"workflow_e2e_provider_invalid: unsupported provider {provider!r}")
    if not any(os.environ.get(name, "").strip() for name in key_names[provider]):
        raise Blocker(
            f"workflow_e2e_provider_not_configured: configure an API key for {provider!r}"
        )


def next_cli() -> Path:
    candidate = ROOT / "node_modules" / ".bin" / ("next.CMD" if os.name == "nt" else "next")
    if candidate.exists():
        return candidate
    raise Blocker("production_server_cli_missing: node_modules/.bin/next was not found")


def production_build_exists() -> None:
    # Match next.config.mjs: local production builds use .next-build unless
    # NEXT_DIST_DIR/VERCEL explicitly selects another output directory.
    configured = os.environ.get("NEXT_DIST_DIR", "").strip()
    if configured:
        dist_dir = configured
    elif os.environ.get("VERCEL", "").lower() in {"1", "true"}:
        dist_dir = ".next"
    else:
        dist_dir = ".next-build"
    build_root = ROOT / dist_dir
    if not ((build_root / "BUILD_ID").exists() or (build_root / "server" / "app-paths-manifest.json").exists()):
        raise Blocker(f"production_build_missing: run the production build before M3 E2E ({dist_dir})")


def stop_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(
            ["taskkill", "/PID", str(process.pid), "/T", "/F"],
            check=False,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
    else:
        process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=15)


class ManagedServer:
    def __init__(self, port: int) -> None:
        self.port = port
        self.process: subprocess.Popen[str] | None = None
        self.log_path = ARTIFACT_DIR / f"server-{port}.log"

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        production_build_exists()
        cli = next_cli()
        self.log_path.parent.mkdir(parents=True, exist_ok=True)
        log = self.log_path.open("a", encoding="utf-8")
        try:
            self.process = subprocess.Popen(
                [str(cli), "start", "--hostname", "127.0.0.1", "--port", str(self.port)],
                cwd=str(ROOT),
                env={**os.environ, "PORT": str(self.port)},
                stdout=log,
                stderr=subprocess.STDOUT,
                text=True,
            )
        finally:
            log.close()
        wait_for_http(self.base_url, 120, process=self.process)

    def restart(self) -> None:
        stop_process(self.process)
        self.process = None
        self.start()

    def close(self) -> None:
        stop_process(self.process)
        self.process = None


def wait_for_http(base_url: str, timeout_seconds: int, process: subprocess.Popen[str] | None = None) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise Blocker(
                f"service_start_failed: next start exited with code {process.returncode}; "
                "see artifacts/workflow-canvas-m3/server-*.log"
            )
        try:
            with urllib.request.urlopen(f"{base_url}/api/health", timeout=5) as response:
                body = response.read().decode("utf-8", errors="replace")
                if response.status == 200 and '"ok":true' in body.replace(" ", ""):
                    return
        except (OSError, urllib.error.URLError, TimeoutError) as error:
            last_error = error
        time.sleep(0.25)  # readiness polling, never used as a measurement
    raise Blocker(f"service_unavailable: {base_url}/api/health did not become ready ({last_error})")


def api(page: Any, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    result = page.evaluate(
        """
        async ({ method, path, payload }) => {
          const response = await fetch(path, {
            method,
            credentials: "include",
            cache: "no-store",
            headers: payload === null ? {} : { "content-type": "application/json" },
            body: payload === null ? undefined : JSON.stringify(payload),
          });
          const text = await response.text();
          let data = {};
          try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
          return { ok: response.ok, status: response.status, headers: Object.fromEntries(response.headers.entries()), data };
        }
        """,
        {"method": method, "path": path, "payload": payload},
    )
    if not isinstance(result, dict):
        raise Blocker(f"invalid_api_result: {method} {path}")
    return result


def login_demo(page: Any, base_url: str) -> dict[str, Any]:
    page.goto(f"{base_url}/login", wait_until="domcontentloaded", timeout=90_000)
    result = api(page, "POST", "/api/auth/demo", {})
    expect(result["ok"], f"demo_login_failed: {result}")
    data = result.get("data") or {}
    if data.get("fallback"):
        raise Blocker(
            "database_unavailable: demo login used stateless fallback; a real database is required"
        )
    expect(isinstance(data.get("user"), dict), f"demo_login_missing_user: {result}")
    return data["user"]


def image_asset(index: int) -> dict[str, Any]:
    # Inline data images exercise the OpenAI-compatible adapter's reference
    # conversion. The fifth item is intentionally an unresolved URL so the
    # retry path cannot pass accidentally. Use a loopback port that refuses
    # connections so the negative fixture fails promptly instead of waiting
    # on DNS resolution for a reserved invalid domain.
    url = (
        f"http://127.0.0.1:1/workflow-m3-failure-{index}.png"
        if index == 4
        else "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    return {
        "fileName": f"workflow-m3-{index}.png",
        "mimeType": "image/png",
        "storageKey": f"workflow-e2e/m3-{index}.png",
        "url": url,
    }


def build_vertical_slice() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    provider = os.environ.get("WORKFLOW_E2E_IMAGE_PROVIDER", "pptoken").strip().lower()
    model = os.environ.get("WORKFLOW_E2E_IMAGE_MODEL", "gpt-image-2").strip() or "gpt-image-2"
    nodes = [
        {
            "nodeKey": "assets",
            "type": "upload",
            "title": "M3 asset image set",
            "positionX": 80,
            "positionY": 160,
            "config": {"uploadedFiles": [image_asset(index) for index in range(20)], "referencedArtifactIds": []},
        },
        {
            "nodeKey": "foreach",
            "type": "foreach",
            "title": "M3 foreach",
            "positionX": 420,
            "positionY": 160,
            "config": {
                "inputPortId": "image.reference",
                "failurePolicy": "continue",
                "concurrency": 3,
                "maxIterations": 20,
                "collectNodeKey": "collect",
            },
        },
        {
            "nodeKey": "image-generate",
            "type": "image_generate",
            "title": "M3 OpenAI compatible image",
            "positionX": 780,
            "positionY": 160,
            "config": {
                "prompt": "Create a polished product hero image for this reference asset.",
                "selectedProviderId": provider,
                "selectedModelId": model,
                "estimatedCredits": 1,
            },
        },
        {
            "nodeKey": "collect",
            "type": "collect",
            "title": "M3 collect",
            "positionX": 1140,
            "positionY": 160,
            "config": {"order": "input", "includeFailures": True},
        },
        {
            "nodeKey": "output",
            "type": "output",
            "title": "M3 output",
            "positionX": 1500,
            "positionY": 160,
            "config": {"allowEmpty": False, "requireAllSucceeded": False},
        },
        {
            "nodeKey": "product-store",
            "type": "product_store",
            "title": "M3 product store",
            "positionX": 1860,
            "positionY": 160,
            "config": {"title": "Workflow M3 E2E result"},
        },
    ]
    edges = [
        {"edgeKey": "assets-to-foreach", "sourceNodeKey": "assets", "sourcePortId": "asset", "targetNodeKey": "foreach", "targetPortId": "items.image", "inputName": "images"},
        {"edgeKey": "foreach-to-image", "sourceNodeKey": "foreach", "sourcePortId": "item.image", "targetNodeKey": "image-generate", "targetPortId": "images", "inputName": "images"},
        {"edgeKey": "image-to-collect", "sourceNodeKey": "image-generate", "sourcePortId": "image", "targetNodeKey": "collect", "targetPortId": "items.image", "inputName": "images"},
        {"edgeKey": "collect-to-output", "sourceNodeKey": "collect", "sourcePortId": "images", "targetNodeKey": "output", "targetPortId": "images", "inputName": "images"},
        {"edgeKey": "output-to-store", "sourceNodeKey": "output", "sourcePortId": "images", "targetNodeKey": "product-store", "targetPortId": "images", "inputName": "images"},
    ]
    return nodes, edges


def require_success(result: dict[str, Any], label: str, statuses: tuple[int, ...] = (200, 201, 202)) -> dict[str, Any]:
    if result.get("status") not in statuses:
        data = result.get("data") or {}
        error = data.get("error") if isinstance(data, dict) else None
        raise Blocker(f"{label}_failed: http={result.get('status')} error={error or data}")
    return result.get("data") or {}


def submit_workflow_with_confirmation(page: Any, workflow_id: int, payload: dict[str, Any], label: str) -> dict[str, Any]:
    """Exercise the real budget-confirmation handshake, then reuse its token for idempotent retries."""
    response = api(page, "POST", f"/api/workflows/{workflow_id}/run", payload)
    if response.get("status") == 409:
        body = response.get("data") or {}
        if body.get("error") != "workflow_budget_confirmation_required":
            raise Blocker(f"{label}_failed: http=409 body={body}")
        details = body.get("details") or {}
        token = details.get("confirmationToken")
        expires_at = details.get("expiresAt")
        if not isinstance(token, str) or not isinstance(expires_at, int):
            raise Blocker(f"{label}_confirmation_payload_invalid: {body}")
        confirmed = {**payload, "confirmationToken": token, "confirmationExpiresAt": expires_at}
        return require_success(api(page, "POST", f"/api/workflows/{workflow_id}/run", confirmed), label)
    return require_success(response, label)


def run_e2e(base_url: str, iterations: int, restart_after_submit: bool, server: ManagedServer | None) -> dict[str, Any]:
    expect(iterations == 20, "m3_e2e_iterations_must_be_20: the acceptance workflow is fixed at 20 inputs")
    from playwright.sync_api import sync_playwright

    result: dict[str, Any] = {"baseUrl": base_url, "iterations": iterations, "restartAfterSubmit": restart_after_submit}
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 1100})
        page = context.new_page()
        page.set_default_timeout(90_000)
        try:
            user = login_demo(page, base_url)
            result["enterpriseId"] = user.get("enterpriseId")
            nodes, edges = build_vertical_slice()
            created = require_success(
                api(
                    page,
                    "POST",
                    "/api/workflows",
                    {
                        "title": f"M3 E2E {uuid.uuid4().hex[:10]}",
                        "description": "M3 acceptance workflow; created by workflow_canvas_m3_e2e.py",
                        "status": "draft",
                        "nodes": nodes,
                        "edges": edges,
                        "metadata": {"acceptance": "workflow-canvas-m3", "inputCount": iterations},
                    },
                ),
                "workflow_create",
                (201,),
            )
            workflow = created.get("data") or created
            workflow_id = workflow.get("id")
            expect(isinstance(workflow_id, int) and workflow_id > 0, f"workflow_create_missing_id: {created}")
            result["workflowId"] = workflow_id

            detail = require_success(api(page, "GET", f"/api/workflows/{workflow_id}"), "workflow_get")
            current = detail.get("data") or detail
            revision = current.get("revision")
            expect(isinstance(revision, int) and revision >= 1, "workflow_revision_missing: M2 revision contract is unavailable")
            registry = detail.get("nodeRegistry")
            expect(isinstance(registry, dict) and registry.get("version") == 2, "node_registry_v2_missing")

            # Save and reopen through the real route.  The compare-and-set
            # request proves this is not only a create/read smoke test.
            saved = require_success(
                api(
                    page,
                    "PATCH",
                    f"/api/workflows/{workflow_id}",
                    {"expectedRevision": revision, "title": f"M3 E2E saved {workflow_id}"},
                ),
                "workflow_save",
            )
            saved_data = saved.get("data") or saved
            expect(isinstance(saved_data.get("revision"), int) and saved_data["revision"] >= revision, f"workflow_save_revision_missing: {saved}")
            page.goto(f"{base_url}/dashboard/workflows/{workflow_id}", wait_until="domcontentloaded", timeout=90_000)
            expect(page.locator("[data-agent-node]").count() == len(nodes), "workflow_reopen_node_count_mismatch")

            revision = int(saved_data.get("revision", revision))
            request_id = str(uuid.uuid4())
            submit_payload = {
                "requestId": request_id,
                "revision": revision,
                "taskCount": iterations,
                "maxCredits": 0,
                "prompt": "M3 acceptance run",
            }
            submitted = submit_workflow_with_confirmation(page, workflow_id, submit_payload, "workflow_submit")
            submit_data = submitted.get("data") or submitted
            run = submit_data.get("run") or {}
            run_id = run.get("id") or submit_data.get("runId")
            expect(isinstance(run_id, int) and run_id > 0, f"workflow_submit_missing_run_id: {submitted}")
            result["runId"] = run_id

            duplicate = submit_workflow_with_confirmation(
                page,
                workflow_id,
                {**submit_payload},
                "workflow_submit_idempotency",
            )
            duplicate_data = duplicate.get("data") or duplicate
            duplicate_run = duplicate_data.get("run") or {}
            expect((duplicate_run.get("id") or duplicate_data.get("runId")) == run_id, "duplicate_request_created_second_run")

            if restart_after_submit:
                expect(server is not None, "restart_requested_without_managed_server")
                restart_started = time.monotonic()
                server.restart()
                wait_for_http(base_url, 30)
                result["restartReadyMs"] = (time.monotonic() - restart_started) * 1000

            detail_payload = poll_run(page, run_id, base_url)
            if restart_after_submit:
                # restartReadyMs is measured immediately after the managed
                # server is healthy. Do not include the remaining 20-item
                # workflow execution time in the restart recovery metric.
                expect(
                    float(result.get("restartReadyMs", 0)) <= 30_000,
                    f"worker_restart_recovery_exceeded_30s: {result.get('restartReadyMs')!r}ms",
                )
            result["terminalStatus"] = detail_payload.get("status")
            result["detail"] = detail_payload
            assert_iteration_contract(detail_payload, iterations)

            failed = find_failed_iteration(detail_payload)
            expect(failed is not None, "expected_iteration_5_failure_not_observed")
            retry = require_success(
                api(
                    page,
                    "POST",
                    f"/api/workflows/runs/{run_id}/retry",
                    {
                        "mode": "iteration",
                        "iterationOnly": True,
                        "nodeKey": "foreach",
                        "iterationKey": failed["iterationKey"],
                    },
                ),
                "iteration_retry",
                (200, 202),
            )
            result["retry"] = {"iterationKey": failed["iterationKey"], "response": retry}
            retry_detail = poll_run(page, run_id, base_url, timeout_seconds=600)
            expect(
                retry_detail.get("status") in {"succeeded", "failed"},
                f"iteration_retry_never_reached_terminal_state: {retry_detail.get('status')}",
            )
            result["retry"]["terminalStatus"] = retry_detail.get("status")
            result["retry"]["detail"] = retry_detail

            cancel_request_id = str(uuid.uuid4())
            second_submit = submit_workflow_with_confirmation(
                page,
                workflow_id,
                {"requestId": cancel_request_id, "revision": revision, "taskCount": iterations, "maxCredits": 0},
                "workflow_submit_for_cancel",
            )
            second_data = second_submit.get("data") or second_submit
            second_run = second_data.get("run") or {}
            second_run_id = second_run.get("id") or second_data.get("runId")
            expect(isinstance(second_run_id, int), "cancel_run_missing_id")
            cancelled = require_success(
                api(page, "POST", f"/api/workflows/runs/{second_run_id}/cancel", {}),
                "workflow_cancel",
                (200, 202),
            )
            result["cancel"] = cancelled
            cancelled_detail = poll_run(page, second_run_id, base_url, timeout_seconds=90)
            expect(cancelled_detail.get("status") in {"cancelled", "failed", "succeeded"}, "cancel_run_never_reached_terminal_state")

            persisted = require_success(api(page, "GET", f"/api/workflows/runs/{run_id}"), "workflow_run_detail_after_retry")
            if isinstance(persisted.get("data"), dict) and "run" not in persisted:
                persisted = persisted["data"]
            assert_iteration_contract(persisted, iterations)
            expect(has_persisted_result(persisted), "workflow_result_not_persisted: product_store/artifact output missing")
            result["finalDetail"] = persisted
            (ARTIFACT_DIR / "e2e-result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            return result
        finally:
            browser.close()


def poll_run(page: Any, run_id: int, base_url: str, timeout_seconds: int = 600) -> dict[str, Any]:
    deadline = time.monotonic() + timeout_seconds
    last: dict[str, Any] = {}
    while time.monotonic() < deadline:
        payload = api(page, "GET", f"/api/workflows/runs/{run_id}")
        if payload.get("status") == 404:
            raise Blocker(f"workflow_run_disappeared_after_restart: run_id={run_id}")
        if not payload.get("ok"):
            raise Blocker(f"workflow_run_poll_failed: {payload}")
        data = payload.get("data") or {}
        data = data.get("data") if isinstance(data.get("data"), dict) else data
        run = data.get("run") or {}
        last = {**data, "status": run.get("status")}
        if run.get("status") in {"succeeded", "failed", "cancelled"}:
            # The run row can become terminal before the snapshot/iteration
            # detail query observes the transaction that created its child
            # records. Keep polling the detail endpoint briefly instead of
            # treating that normal read-after-write window as a product
            # failure.
            if isinstance(data.get("iterations"), list) and isinstance(data.get("attempts"), list):
                return last
        time.sleep(0.75)  # poll interval, not a success signal or measurement
    raise Blocker(f"workflow_run_timeout: run_id={run_id} last={last}")


def assert_iteration_contract(detail: dict[str, Any], expected_count: int) -> None:
    if isinstance(detail.get("data"), dict) and "iterations" not in detail:
        detail = detail["data"]
    iterations = detail.get("iterations")
    attempts = detail.get("attempts")
    expect(isinstance(iterations, list), f"workflow_run_detail_missing_iterations: keys={sorted(detail.keys())}")
    expect(len(iterations) == expected_count, f"workflow_iteration_count_mismatch: expected={expected_count} actual={len(iterations)}")
    indexes = [item.get("iterationIndex") for item in iterations if isinstance(item, dict)]
    expect(indexes == list(range(expected_count)), f"workflow_iteration_order_invalid: {indexes}")
    expect(isinstance(attempts, list), f"workflow_run_detail_missing_attempts: keys={sorted(detail.keys())}")


def find_failed_iteration(detail: dict[str, Any]) -> dict[str, Any] | None:
    iterations = detail.get("iterations")
    if not isinstance(iterations, list):
        return None
    for item in iterations:
        if isinstance(item, dict) and item.get("status") == "failed":
            return item
    return None


def has_persisted_result(detail: dict[str, Any]) -> bool:
    run = detail.get("run") or {}
    if isinstance(run, dict) and run.get("artifacts"):
        return True
    executions = detail.get("nodeExecutions")
    if isinstance(executions, list):
        for item in executions:
            if isinstance(item, dict) and item.get("nodeKey") in {"product-store", "output"} and item.get("outputPayload"):
                return True
    return False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3100, help="port for the managed production server (default: 3100)")
    parser.add_argument("--iterations", type=int, default=20, help="must remain 20 for the M3 acceptance workflow")
    parser.add_argument("--runs", type=int, default=10, help="independent acceptance runs; default 10")
    parser.add_argument("--restart-after-submit", action="store_true", help="restart the managed server after the first idempotent submit")
    parser.add_argument("--base-url", default="", help="use an already running service instead of starting next start")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    server: ManagedServer | None = None
    try:
        require_m3_environment()
        if args.base_url.strip():
            base_url = args.base_url.rstrip("/")
            wait_for_http(base_url, 30)
        else:
            server = ManagedServer(args.port)
            server.start()
            base_url = server.base_url
        if args.runs < 1 or args.runs > 10:
            raise Blocker("m3_e2e_runs_must_be_between_1_and_10")
        run_results = []
        for run_index in range(args.runs):
            run_results.append(run_e2e(base_url, args.iterations, args.restart_after_submit, server))
        aggregate = {
            "ok": True,
            "runs": len(run_results),
            "runIds": [item.get("runId") for item in run_results],
            "artifact": str(ARTIFACT_DIR / "e2e-result.json"),
        }
        (ARTIFACT_DIR / "e2e-aggregate.json").write_text(json.dumps({**aggregate, "results": run_results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(json.dumps(aggregate, ensure_ascii=False))
        return 0
    except Blocker as error:
        failure = {"ok": False, "blocker": str(error), "baseUrl": getattr(server, "base_url", None)}
        (ARTIFACT_DIR / "e2e-blocker.json").write_text(json.dumps(failure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"BLOCKER: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # noqa: BLE001
        failure = {"ok": False, "error": f"{type(error).__name__}: {error}"}
        (ARTIFACT_DIR / "e2e-error.json").write_text(json.dumps(failure, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"ERROR: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        if server is not None:
            server.close()


if __name__ == "__main__":
    raise SystemExit(main())
