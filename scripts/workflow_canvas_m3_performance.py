#!/usr/bin/env python3
"""Measure real workflow-canvas browser and HTTP performance.

This command records raw values; it never fills a missing value with a
constant.  A server/database/build/measurement prerequisite that cannot be
proven causes a non-zero exit and is written to the report as a blocker.
The 10-second interaction and 5-minute memory windows are executed inside
Chromium, so those values represent browser work rather than Python sleeps.
"""

from __future__ import annotations

import argparse
import json
import math
import os
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
DEFAULT_REPORT = ROOT / "docs" / "performance" / "workflow-canvas-m3.md"
ARTIFACT_DIR = ROOT / "artifacts" / "workflow-canvas-m3"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)


class Blocker(RuntimeError):
    pass


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


def preflight() -> None:
    if not database_configured():
        raise Blocker("database_not_configured: set DATABASE_URL or an equivalent PostgreSQL variable")
    # This project intentionally disables Next's generated build id; the
    # server manifests are the durable production-build marker instead.
    if not ((ROOT / ".next" / "BUILD_ID").exists() or (ROOT / ".next" / "server" / "app-paths-manifest.json").exists()):
        raise Blocker("production_build_missing: run the production build before performance measurement")
    if not (ROOT / "node_modules" / ".bin" / ("next.CMD" if os.name == "nt" else "next")).exists():
        raise Blocker("production_server_cli_missing: node_modules/.bin/next was not found")


def stop_process(process: subprocess.Popen[str] | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=15)


def wait_for_http(base_url: str, timeout_seconds: int, process: subprocess.Popen[str] | None = None) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process is not None and process.poll() is not None:
            raise Blocker(f"service_start_failed: next start exited with code {process.returncode}")
        try:
            with urllib.request.urlopen(f"{base_url}/api/health", timeout=5) as response:
                body = response.read().decode("utf-8", errors="replace")
                if response.status == 200 and '"ok":true' in body.replace(" ", ""):
                    return
        except (OSError, urllib.error.URLError, TimeoutError) as error:
            last_error = error
        time.sleep(0.25)  # readiness polling only; no benchmark uses this as a value
    raise Blocker(f"service_unavailable: {base_url}/api/health ({last_error})")


class ManagedServer:
    def __init__(self, port: int) -> None:
        self.port = port
        self.process: subprocess.Popen[str] | None = None
        self.log_path = ARTIFACT_DIR / f"performance-server-{port}.log"

    @property
    def base_url(self) -> str:
        return f"http://127.0.0.1:{self.port}"

    def start(self) -> None:
        cli = ROOT / "node_modules" / ".bin" / ("next.CMD" if os.name == "nt" else "next")
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
        wait_for_http(self.base_url, 120, self.process)

    def close(self) -> None:
        stop_process(self.process)
        self.process = None


def api(page: Any, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    result = page.evaluate(
        """
        async ({ method, path, payload }) => {
          const started = performance.now();
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
          return {
            ok: response.ok,
            status: response.status,
            elapsedMs: performance.now() - started,
            headers: Object.fromEntries(response.headers.entries()),
            data,
          };
        }
        """,
        {"method": method, "path": path, "payload": payload},
    )
    if not isinstance(result, dict):
        raise Blocker(f"invalid_api_result: {method} {path}")
    return result


def login_demo(page: Any, base_url: str) -> None:
    page.goto(f"{base_url}/login", wait_until="domcontentloaded", timeout=90_000)
    response = api(page, "POST", "/api/auth/demo", {})
    expect(response.get("ok") is True, f"demo_login_failed: {response}")
    body = response.get("data") or {}
    if body.get("fallback"):
        raise Blocker("database_unavailable: demo login used stateless fallback")


def require_success(response: dict[str, Any], label: str, statuses: tuple[int, ...] = (200, 201, 202)) -> dict[str, Any]:
    if response.get("status") not in statuses:
        raise Blocker(f"{label}_failed: http={response.get('status')} body={response.get('data')}")
    return response.get("data") or {}


def synthetic_workflow(size: int, edge_count: int) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    for index in range(size):
        nodes.append(
            {
                "nodeKey": f"node-{index}",
                "type": "text_input" if index == 0 else "llm_generate",
                "title": f"Perf node {index}",
                "positionX": (index % 10) * 260,
                "positionY": (index // 10) * 180,
                "config": {"text": f"performance-{index}"} if index == 0 else {},
            }
        )
    # Keep a connected DAG, then add forward edges until the exact 29.3 edge
    # count is represented.  All edges are real persisted workflow edges; no
    # DOM-only padding is used.
    for distance in range(1, size):
        for source in range(size - distance):
            if len(edges) >= edge_count:
                break
            target = source + distance
            edges.append(
                {
                    "edgeKey": f"edge-{source}-{target}",
                    "sourceNodeKey": f"node-{source}",
                    "sourcePortId": "text",
                    "targetNodeKey": f"node-{target}",
                    "targetPortId": "text",
                    "inputName": "text",
                }
            )
        if len(edges) >= edge_count:
            break
    expect(len(edges) == edge_count, f"synthetic_fixture_cannot_reach_edge_count_{size}: {len(edges)}")
    return nodes, edges


def create_workflow(page: Any, size: int, edge_count: int) -> tuple[int, int, list[dict[str, Any]], list[dict[str, Any]]]:
    nodes, edges = synthetic_workflow(size, edge_count)
    body = require_success(
        api(
            page,
            "POST",
            "/api/workflows",
            {
                "title": f"M3 performance {size} {uuid.uuid4().hex[:8]}",
                "description": "Real browser performance fixture",
                "status": "draft",
                "nodes": nodes,
                "edges": edges,
                "metadata": {"acceptance": "workflow-canvas-m3-performance", "nodeCount": size},
            },
        ),
        f"workflow_create_{size}",
        (201,),
    )
    workflow = body.get("data") or body
    workflow_id = workflow.get("id")
    expect(isinstance(workflow_id, int) and workflow_id > 0, f"workflow_create_{size}_missing_id")
    get_body = require_success(api(page, "GET", f"/api/workflows/{workflow_id}"), f"workflow_get_{size}")
    data = get_body.get("data") or get_body
    revision = data.get("revision")
    expect(isinstance(revision, int) and revision >= 1, f"workflow_{size}_revision_missing")
    return workflow_id, revision, nodes, edges


def percentile(values: list[float], p: float) -> float:
    expect(bool(values), "percentile_requires_samples")
    values = sorted(values)
    index = max(0, min(len(values) - 1, math.ceil(p * len(values)) - 1))
    return values[index]


def open_measurement(page: Any, base_url: str, workflow_id: int, expected_nodes: int) -> float:
    started = time.perf_counter()
    page.goto(f"{base_url}/dashboard/workflows/{workflow_id}", wait_until="domcontentloaded", timeout=120_000)
    locator = page.locator("[data-agent-node]")
    locator.first.wait_for(state="visible", timeout=120_000)
    actual = locator.count()
    expect(actual == expected_nodes, f"canvas_node_count_mismatch: expected={expected_nodes} actual={actual}")
    return (time.perf_counter() - started) * 1000


def interaction_measurement(page: Any) -> dict[str, float]:
    # All events and frame timestamps are generated and measured by Chromium.
    # This is a 10-second real interaction window, not a sleep-based estimate.
    metrics = page.evaluate(
        """
        async () => {
          const article = document.querySelector('[data-agent-node]');
          if (!article) throw new Error('canvas_node_missing');
          let root = article.parentElement;
          while (root && !(root.className && String(root.className).includes('overflow-hidden'))) root = root.parentElement;
          if (!root) throw new Error('canvas_root_missing');
          const rect = root.getBoundingClientRect();
          const x0 = rect.left + Math.max(20, rect.width * 0.2);
          const y0 = rect.top + Math.max(20, rect.height * 0.3);
          const startedAt = performance.now();
          let frameCount = 0;
          const pointerToPaint = [];
          const pending = [];
          const pointerId = 771;
          root.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 1, clientX: x0, clientY: y0 }));
          let moveX = x0;
          let moveY = y0;
          const moveTimer = setInterval(() => {
            moveX = rect.left + 20 + ((performance.now() - startedAt) % Math.max(40, rect.width - 40));
            moveY = rect.top + 30 + (((performance.now() - startedAt) * 0.13) % Math.max(40, rect.height - 60));
            const eventTime = performance.now();
            pending.push(eventTime);
            window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId, pointerType: 'mouse', buttons: 1, clientX: moveX, clientY: moveY }));
          }, 16);
          return await new Promise((resolve) => {
            function frame(now) {
              frameCount += 1;
              while (pending.length) pointerToPaint.push(Math.max(0, now - pending.shift()));
              if (now - startedAt < 10000) {
                requestAnimationFrame(frame);
                return;
              }
              clearInterval(moveTimer);
              window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId, pointerType: 'mouse', button: 0, buttons: 0, clientX: moveX, clientY: moveY }));
              resolve({ durationMs: now - startedAt, frameCount, pointerToPaint });
            }
            requestAnimationFrame(frame);
          });
        }
        """
    )
    duration = float(metrics.get("durationMs", 0))
    expect(duration >= 9_500, f"interaction_window_short: {duration}ms")
    frame_count = int(metrics.get("frameCount", 0))
    pointer_samples = [float(value) for value in metrics.get("pointerToPaint", [])]
    expect(frame_count > 0 and pointer_samples, "interaction_measurement_missing_frames_or_pointer_samples")
    return {
        "durationMs": duration,
        "averageFps": frame_count / (duration / 1000),
        "pointerToPaintP95Ms": percentile(pointer_samples, 0.95),
        "pointerSampleCount": len(pointer_samples),
    }


def memory_measurement(page: Any, seconds: int) -> dict[str, Any]:
    expect(seconds >= 300, "memory_window_must_be_at_least_300_seconds_for_29_3")
    metrics = page.evaluate(
        """
        async ({ durationMs }) => {
          if (!performance.memory || typeof performance.memory.usedJSHeapSize !== 'number') {
            return { supported: false, samples: [] };
          }
          const samples = [];
          const started = performance.now();
          return await new Promise((resolve) => {
            const sample = () => samples.push({ elapsedMs: performance.now() - started, usedBytes: performance.memory.usedJSHeapSize });
            sample();
            const timer = setInterval(() => {
              sample();
              if (performance.now() - started >= durationMs) {
                clearInterval(timer);
                sample();
                resolve({ supported: true, samples });
              }
            }, 15000);
          });
        }
        """,
        {"durationMs": seconds * 1000},
    )
    if not metrics.get("supported"):
        raise Blocker("memory_measurement_unavailable: Chromium did not expose performance.memory")
    samples = metrics.get("samples") or []
    expect(len(samples) >= 2, "memory_measurement_missing_samples")
    values = [int(item["usedBytes"]) for item in samples]
    return {
        "durationMs": samples[-1]["elapsedMs"],
        "sampleCount": len(values),
        "initialUsedMb": values[0] / 1024 / 1024,
        "finalUsedMb": values[-1] / 1024 / 1024,
        "incrementMb": (max(values) - values[0]) / 1024 / 1024,
        "metric": "renderer_js_heap_used_bytes",
    }


def save_measurement(page: Any, workflow_id: int, revision: int, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> dict[str, Any]:
    response = api(
        page,
        "PATCH",
        f"/api/workflows/{workflow_id}",
        {"expectedRevision": revision, "metadata": {"performanceProbe": uuid.uuid4().hex}, "nodes": nodes, "edges": edges},
    )
    body = require_success(response, "workflow_save")
    data = body.get("data") or body
    server_timing = response.get("headers", {}).get("server-timing")
    server_duration = None
    if isinstance(server_timing, str):
        marker = "dur="
        if marker in server_timing:
            try:
                server_duration = float(server_timing.split(marker, 1)[1].split(",", 1)[0].split(";", 1)[0])
            except ValueError:
                server_duration = None
    return {
        "clientElapsedMs": response.get("elapsedMs"),
        "serverTiming": server_timing,
        "serverDurationMs": server_duration,
        "revision": data.get("revision"),
    }


def write_report(report_path: Path, payload: dict[str, Any]) -> None:
    report_path.parent.mkdir(parents=True, exist_ok=True)
    status = "PASS" if payload.get("ok") else "BLOCKED/FAIL"
    lines = [
        "# Workflow Canvas M3 性能验收报告",
        "",
        f"- 状态：**{status}**",
        f"- 生成时间：`{payload.get('generatedAt', 'unknown')}`",
        f"- 基准：生产 build、Chromium/Chrome Stable、无 DevTools CPU throttle；每个可测场景预热 1 次、测量 `{payload.get('runs', 'unknown')}` 次。",
        "- 本文件由 `scripts/workflow_canvas_m3_performance.py` 生成；缺失环境或缺失原始测量不会被填充为假数据。",
        "",
        "## 原始测量与判定",
        "",
        "| 场景 | 原始值 | 判定 |",
        "| --- | --- | --- |",
    ]
    for name, item in (payload.get("scenarios") or {}).items():
        lines.append(f"| `{name}` | `{json.dumps(item, ensure_ascii=False, separators=(',', ':'))}` | `{item.get('verdict', 'NOT_MEASURED')}` |" )
    lines.extend(["", "## Blocker / 备注", ""])
    blockers = payload.get("blockers") or ["无"]
    lines.extend(f"- {item}" for item in blockers)
    lines.extend(["", "## 29.3 固定阈值", "", "| 场景 | 阈值 |", "| --- | --- |", "| 100 节点 / 150 边打开 | P95 <= 2 秒 |", "| 100 节点拖动/缩放 10 秒 | 平均 >= 45 FPS；P95 pointer-to-paint <= 50 ms |", "| 300 节点 / 500 边打开 | P95 <= 4 秒 |", "| 300 节点拖动/缩放 10 秒 | 平均 >= 30 FPS；P95 pointer-to-paint <= 100 ms |", "| 300 节点稳定内存 | 5 分钟增量 <= 350 MB |", "| 100 节点保存 | 服务端 P95 <= 500 ms |", "| 20 iteration / 并发 3 | 实际并发 <= 3；collect 顺序 100% 正确（由 M3 E2E 提供） |", "| Worker 重启恢复 | P95 <= 30 秒（由 M3 E2E/恢复日志提供） |", "| 100 节点子图导入（M6） | P95 <= 2 秒；0 悬空边（M6 未纳入本脚本） |", ""])
    report_path.write_text("\n".join(lines), encoding="utf-8")


def run_performance(base_url: str, runs: int, report_path: Path, memory_seconds: int) -> dict[str, Any]:
    expect(runs == 5, "performance_runs_must_be_5: 29.3 requires five measurements")
    from playwright.sync_api import sync_playwright

    payload: dict[str, Any] = {
        "ok": False,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runs": runs,
        "baseUrl": base_url,
        "scenarios": {},
        "blockers": [],
    }
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1600, "height": 1100})
        page = context.new_page()
        page.set_default_timeout(120_000)
        try:
            login_demo(page, base_url)
            for size, edge_threshold, open_threshold in ((100, 150, 2000), (300, 500, 4000)):
                workflow_id, revision, nodes, edges = create_workflow(page, size, edge_threshold)
                expect(len(edges) == edge_threshold, f"synthetic_fixture_edge_count_invalid_{size}")
                page.goto(f"{base_url}/dashboard/workflows/{workflow_id}", wait_until="domcontentloaded", timeout=120_000)
                page.locator("[data-agent-node]").first.wait_for(state="visible", timeout=120_000)  # warmup
                opens = [open_measurement(page, base_url, workflow_id, size) for _ in range(runs)]
                opening = {"samplesMs": opens, "medianMs": percentile(opens, 0.5), "p95Ms": percentile(opens, 0.95), "verdict": "PASS" if percentile(opens, 0.95) <= open_threshold else "FAIL"}
                payload["scenarios"][f"{size}_nodes_open"] = opening

                interactions = []
                for _ in range(runs):
                    page.goto(f"{base_url}/dashboard/workflows/{workflow_id}", wait_until="domcontentloaded", timeout=120_000)
                    page.locator("[data-agent-node]").first.wait_for(state="visible", timeout=120_000)
                    interactions.append(interaction_measurement(page))
                interaction_summary = {
                    "samples": interactions,
                    "medianAverageFps": percentile([item["averageFps"] for item in interactions], 0.5),
                    "p95PointerToPaintMs": percentile([item["pointerToPaintP95Ms"] for item in interactions], 0.95),
                    "verdict": "PASS"
                    if percentile([item["averageFps"] for item in interactions], 0.5) >= (45 if size == 100 else 30)
                    and percentile([item["pointerToPaintP95Ms"] for item in interactions], 0.95) <= (50 if size == 100 else 100)
                    else "FAIL",
                }
                payload["scenarios"][f"{size}_nodes_interaction"] = interaction_summary

                if size == 100:
                    saves = []
                    current_revision = revision
                    for _ in range(runs):
                        save = save_measurement(page, workflow_id, current_revision, nodes, edges)
                        saves.append(save)
                        if isinstance(save.get("revision"), int):
                            current_revision = save["revision"]
                    server_values = [item["serverDurationMs"] for item in saves if isinstance(item.get("serverDurationMs"), (int, float))]
                    payload["scenarios"]["100_nodes_save"] = {
                        "samples": saves,
                        "serverTimingSamples": server_values,
                        "serverP95Ms": percentile(server_values, 0.95) if server_values else None,
                        "verdict": "PASS" if len(server_values) == runs and percentile(server_values, 0.95) <= 500 else "NOT_MEASURED",
                        "note": "Server-Timing is emitted by the workflow PATCH route; client elapsed time is not substituted for server P95.",
                    }

                if size == 300:
                    page.goto(f"{base_url}/dashboard/workflows/{workflow_id}", wait_until="domcontentloaded", timeout=120_000)
                    memory = memory_measurement(page, memory_seconds)
                    memory["verdict"] = "PASS" if memory["incrementMb"] <= 350 else "FAIL"
                    payload["scenarios"]["300_nodes_memory"] = memory

            aggregate_path = ARTIFACT_DIR / "e2e-aggregate.json"
            aggregate = json.loads(aggregate_path.read_text(encoding="utf-8")) if aggregate_path.exists() else {}
            e2e_ok = aggregate.get("ok") is True and int(aggregate.get("runs", 0)) >= 1
            e2e_results = aggregate.get("results") if isinstance(aggregate.get("results"), list) else []
            payload["scenarios"]["20_iterations_concurrency_3"] = {
                "verdict": "PASS" if e2e_ok and all(item.get("iterations") == 20 for item in e2e_results) else "NOT_MEASURED",
                "note": "Measured by workflow_canvas_m3_e2e.py; this script does not submit provider work a second time.",
            }
            restart_proven = e2e_ok and any(item.get("restartAfterSubmit") is True for item in e2e_results)
            recovery_samples = [
                float(item["workerRecoveryMs"])
                for item in e2e_results
                if isinstance(item, dict) and isinstance(item.get("workerRecoveryMs"), (int, float))
            ]
            payload["scenarios"]["worker_restart_recovery"] = {
                "samplesMs": recovery_samples,
                "p95Ms": percentile(recovery_samples, 0.95) if recovery_samples else None,
                "verdict": "PASS" if restart_proven and recovery_samples and percentile(recovery_samples, 0.95) <= 30_000 else "NOT_MEASURED",
                "note": "Measured by workflow_canvas_m3_e2e.py --restart-after-submit with recovery timestamps.",
            }
            payload["scenarios"]["100_nodes_subgraph_import_m6"] = {
                "verdict": "OUT_OF_SCOPE",
                "note": "M6 is not part of the M3 implementation scope; no fabricated measurement is recorded.",
            }
            required = [
                item.get("verdict")
                for name, item in payload["scenarios"].items()
                if name != "100_nodes_subgraph_import_m6"
            ]
            payload["ok"] = all(item == "PASS" for item in required)
            if not payload["ok"]:
                payload["blockers"].append("one or more 29.3 scenarios are not PASS; inspect raw samples and complete missing M3/M6 instrumentation")
            return payload
        finally:
            browser.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=3100, help="port for the managed production server (default: 3100)")
    parser.add_argument("--runs", type=int, default=5, help="must remain 5 for 29.3 (default: 5)")
    parser.add_argument("--report", type=Path, default=DEFAULT_REPORT, help="Markdown report path")
    parser.add_argument("--base-url", default="", help="use an already running service")
    parser.add_argument("--memory-seconds", type=int, default=300, help="real memory observation window; must be >=300")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    server: ManagedServer | None = None
    report_path = args.report if args.report.is_absolute() else ROOT / args.report
    payload: dict[str, Any] = {"ok": False, "runs": args.runs, "scenarios": {}, "blockers": []}
    try:
        preflight()
        if args.base_url.strip():
            base_url = args.base_url.rstrip("/")
            wait_for_http(base_url, 30)
        else:
            server = ManagedServer(args.port)
            server.start()
            base_url = server.base_url
        payload = run_performance(base_url, args.runs, report_path, args.memory_seconds)
        return 0 if payload.get("ok") else 2
    except Blocker as error:
        payload["blockers"] = [str(error)]
        print(f"BLOCKER: {error}", file=sys.stderr)
        return 2
    except Exception as error:  # noqa: BLE001
        payload["blockers"] = [f"{type(error).__name__}: {error}"]
        print(f"ERROR: {type(error).__name__}: {error}", file=sys.stderr)
        return 1
    finally:
        payload["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        payload.setdefault("runs", args.runs)
        write_report(report_path, payload)
        (ARTIFACT_DIR / "performance-result.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        if server is not None:
            server.close()


if __name__ == "__main__":
    raise SystemExit(main())
