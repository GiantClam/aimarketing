import argparse
import json
import statistics
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path


def login_and_get_session_cookie(base_url: str, email: str, password: str):
    request = urllib.request.Request(
        f"{base_url}/api/auth/login",
        data=json.dumps({"email": email, "password": password}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        cookies = response.headers.get_all("Set-Cookie") or []

    for cookie in cookies:
        if cookie.startswith("aimarketing_session="):
            return cookie.split(";", 1)[0].split("=", 1)[1]

    raise RuntimeError("login did not return aimarketing_session cookie")


def percentiles(values):
    if not values:
        return {"p50": None, "p95": None, "avg": None, "min": None, "max": None}

    ordered = sorted(values)

    def pick(ratio):
        index = max(0, min(len(ordered) - 1, int(round((len(ordered) - 1) * ratio))))
        return ordered[index]

    return {
        "p50": pick(0.50),
        "p95": pick(0.95),
        "avg": round(statistics.mean(ordered), 2),
        "min": ordered[0],
        "max": ordered[-1],
    }


def parse_stage(raw: str):
    cleaned = raw.strip().lower()
    if "x" not in cleaned:
        raise ValueError(f"invalid stage format: {raw}")
    concurrency_raw, requests_raw = cleaned.split("x", 1)
    concurrency = int(concurrency_raw)
    total_requests = int(requests_raw)
    if concurrency <= 0 or total_requests <= 0:
        raise ValueError(f"stage values must be positive: {raw}")
    return {"label": raw, "concurrency": concurrency, "total_requests": total_requests}


def post_json(url: str, payload: dict, session_cookie: str, timeout_seconds: int):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Cookie": f"aimarketing_session={session_cookie}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        body = error.read().decode("utf-8")
        raise RuntimeError(f"http_{error.code}:{body}") from error


def get_json(url: str, session_cookie: str, timeout_seconds: int):
    request = urllib.request.Request(
        url,
        headers={"Cookie": f"aimarketing_session={session_cookie}"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
        return response.status, json.loads(response.read().decode("utf-8"))


def run_single_request(
    base_url: str,
    session_cookie: str,
    advisor_type: str,
    request_id: str,
    query: str,
    submit_timeout: int,
    task_timeout: int,
):
    started_at = time.time()
    submit_started = time.time()
    submit_status, submit_payload = post_json(
        f"{base_url}/api/dify/chat-messages",
        {
            "advisorType": advisor_type,
            "response_mode": "async",
            "query": query,
        },
        session_cookie,
        submit_timeout,
    )
    submit_latency_ms = round((time.time() - submit_started) * 1000, 2)

    task_id = str(submit_payload.get("task_id") or "")
    conversation_id = str(submit_payload.get("conversation_id") or "")
    if submit_status != 200 or not task_id:
        raise RuntimeError(f"submit_failed:{submit_status}:{submit_payload}")

    deadline = time.time() + task_timeout
    polls = 0
    last_payload = None
    while time.time() < deadline:
        polls += 1
        _, task_payload = get_json(f"{base_url}/api/tasks/{task_id}", session_cookie, 30)
        last_payload = task_payload
        data = task_payload.get("data") or {}
        status = data.get("status")
        if status == "success":
            total_latency_ms = round((time.time() - started_at) * 1000, 2)
            return {
                "ok": True,
                "request_id": request_id,
                "task_id": task_id,
                "conversation_id": conversation_id,
                "submit_latency_ms": submit_latency_ms,
                "total_latency_ms": total_latency_ms,
                "polls": polls,
                "result": data.get("result") or {},
            }
        if status == "failed":
            raise RuntimeError(f"task_failed:{json.dumps(task_payload, ensure_ascii=False)}")
        time.sleep(1.2)

    raise TimeoutError(f"task_timeout:{request_id}:{json.dumps(last_payload, ensure_ascii=False)}")


def run_stage(
    base_url: str,
    session_cookie: str,
    advisor_type: str,
    stage: dict,
    submit_timeout: int,
    task_timeout: int,
    artifact_dir: Path,
):
    results = []
    started_at = time.time()
    lock = threading.Lock()
    counter = {"value": 0}

    def next_case():
        with lock:
            current = counter["value"]
            counter["value"] += 1
            return current

    def worker():
        case_index = next_case()
        request_id = f"{stage['label']}-{case_index + 1}"
        query = (
            "Find overseas buyers for AI marketing workflow software. "
            f"Return a concise answer. load_test_case={request_id}"
        )
        try:
            return run_single_request(base_url, session_cookie, advisor_type, request_id, query, submit_timeout, task_timeout)
        except Exception as error:
            return {
                "ok": False,
                "request_id": request_id,
                "error": str(error),
            }

    with ThreadPoolExecutor(max_workers=stage["concurrency"]) as executor:
        futures = [executor.submit(worker) for _ in range(stage["total_requests"])]
        for future in as_completed(futures):
            results.append(future.result())

    finished_at = time.time()
    ok_results = [item for item in results if item.get("ok")]
    failed_results = [item for item in results if not item.get("ok")]
    summary = {
        "stage": stage,
        "duration_seconds": round(finished_at - started_at, 2),
        "requests": len(results),
        "successes": len(ok_results),
        "failures": len(failed_results),
        "success_rate": round((len(ok_results) / len(results)) * 100, 2) if results else 0,
        "submit_latency_ms": percentiles([item["submit_latency_ms"] for item in ok_results]),
        "total_latency_ms": percentiles([item["total_latency_ms"] for item in ok_results]),
        "sample_failures": failed_results[:5],
    }

    artifact_dir.mkdir(parents=True, exist_ok=True)
    output_path = artifact_dir / f"lead-hunter-load-{stage['label'].replace('x', '_')}.json"
    output_path.write_text(
        json.dumps(
            {
                "summary": summary,
                "results": results,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    summary["artifact"] = str(output_path)
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--advisor-type", default="lead-hunter")
    parser.add_argument("--session-cookie")
    parser.add_argument("--email")
    parser.add_argument("--password")
    parser.add_argument("--stage", action="append", default=[])
    parser.add_argument("--submit-timeout", type=int, default=30)
    parser.add_argument("--task-timeout", type=int, default=180)
    parser.add_argument("--artifact-dir", default="artifacts/load-tests")
    args = parser.parse_args()

    session_cookie = args.session_cookie
    if not session_cookie:
        if not args.email or not args.password:
            raise RuntimeError("provide --session-cookie or both --email and --password")
        session_cookie = login_and_get_session_cookie(args.base_url, args.email, args.password)

    raw_stages = args.stage or ["1x3", "3x6", "5x10"]
    stages = [parse_stage(item) for item in raw_stages]

    summaries = []
    artifact_dir = Path(args.artifact_dir)
    for stage in stages:
        summaries.append(
            run_stage(
                args.base_url.rstrip("/"),
                session_cookie,
                args.advisor_type,
                stage,
                args.submit_timeout,
                args.task_timeout,
                artifact_dir,
            )
        )

    print(json.dumps({"ok": True, "stages": summaries}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, ensure_ascii=False))
        sys.exit(1)
