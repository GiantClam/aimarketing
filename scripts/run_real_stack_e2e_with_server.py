from __future__ import annotations

from pathlib import Path
import json
import os
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "real-stack-e2e"
RESULT_PATH = ARTIFACT_DIR / "results.json"


def run_case(
    name: str,
    command: list[str],
    env: dict[str, str],
    max_attempts: int,
    retry_delay_seconds: int,
) -> dict[str, object]:
    print(f"[real-stack] start: {name}")
    attempts: list[dict[str, object]] = []
    return_code = 1
    status = "failed"
    for attempt_index in range(max_attempts):
        attempt_no = attempt_index + 1
        started_at = time.time()
        print(f"[real-stack] attempt {attempt_no}/{max_attempts}: {name}")
        result = subprocess.run(command, cwd=str(ROOT), check=False, env=env)
        duration_ms = round((time.time() - started_at) * 1000, 2)
        return_code = result.returncode
        attempt_status = "passed" if result.returncode == 0 else "failed"
        attempts.append(
            {
                "attempt": attempt_no,
                "status": attempt_status,
                "returnCode": result.returncode,
                "durationMs": duration_ms,
            }
        )
        if result.returncode == 0:
            status = "passed"
            break
        if attempt_no < max_attempts:
            print(f"[real-stack] retry after {retry_delay_seconds}s: {name}")
            time.sleep(retry_delay_seconds)

    return {
        "name": name,
        "status": status,
        "returnCode": return_code,
        "durationMs": round(sum(float(item["durationMs"]) for item in attempts), 2),
        "attempts": attempts,
    }


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    env = {
        **os.environ,
        "HOME": str(ROOT),
        "USERPROFILE": str(ROOT),
        "APPDATA": str(ROOT),
    }
    max_attempts = max(1, int(env.get("REAL_STACK_E2E_RETRY_COUNT", "2")))
    retry_delay_seconds = max(1, int(env.get("REAL_STACK_E2E_RETRY_DELAY_SECONDS", "8")))
    inter_case_delay_seconds = max(0, int(env.get("REAL_STACK_E2E_INTER_CASE_DELAY_SECONDS", "6")))

    has_lead_hunter_cookie = bool(env.get("LEAD_HUNTER_E2E_SESSION_COOKIE", "").strip())
    has_lead_hunter_creds = bool(env.get("LEAD_HUNTER_E2E_EMAIL", "").strip()) and bool(
        env.get("LEAD_HUNTER_E2E_PASSWORD", "").strip(),
    )
    if not has_lead_hunter_cookie and not has_lead_hunter_creds:
        env["LEAD_HUNTER_E2E_EMAIL"] = "demo@example.com"
        env["LEAD_HUNTER_E2E_PASSWORD"] = "demo123456"

    cases = [
        (
            "writer_real_validation_with_server",
            [sys.executable, "scripts/run_writer_real_validation_with_server.py"],
        ),
        (
            "lead_hunter_workflows_with_server",
            [sys.executable, "scripts/run_lead_hunter_workflows_e2e_with_server.py"],
        ),
        (
            "ai_entry_model_selection_with_server",
            [sys.executable, "scripts/run_ai_entry_model_selection_smoke_with_server.py"],
        ),
    ]

    started_at_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    summary: list[dict[str, object]] = []
    for index, (name, command) in enumerate(cases):
        summary.append(
            run_case(
                name=name,
                command=command,
                env=env,
                max_attempts=max_attempts,
                retry_delay_seconds=retry_delay_seconds,
            )
        )
        if index < len(cases) - 1 and inter_case_delay_seconds > 0:
            print(f"[real-stack] cool down {inter_case_delay_seconds}s before next case")
            time.sleep(inter_case_delay_seconds)

    passed_count = sum(1 for item in summary if item["status"] == "passed")
    failed_count = len(summary) - passed_count
    report = {
        "startedAt": started_at_iso,
        "suite": "real-stack-e2e-with-server",
        "total": len(summary),
        "passed": passed_count,
        "failed": failed_count,
        "results": summary,
    }

    RESULT_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print("REAL_STACK_E2E_RESULTS_START")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    print("REAL_STACK_E2E_RESULTS_END")

    raise SystemExit(1 if failed_count > 0 else 0)


if __name__ == "__main__":
    main()
