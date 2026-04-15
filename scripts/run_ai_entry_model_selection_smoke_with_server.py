from pathlib import Path
import os
import signal
import socket
import subprocess
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "artifacts" / "ai-entry-model-selection-start.log"
NEXT_CLI = ROOT / "node_modules" / ".bin" / "next.CMD"
VALIDATION_DIST_DIR = ".next-ai-entry-model-selection-e2e"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_ready(base_url: str, timeout_seconds: int = 240):
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"{base_url}/api/health", timeout=5) as response:
                body = response.read().decode("utf-8", errors="ignore")
                if response.status == 200 and '"ok":true' in body:
                    return
        except Exception as error:  # noqa: BLE001
            last_error = error
        time.sleep(1)

    raise RuntimeError(f"server did not become ready: {last_error}")


def run_validation_with_retry(env: dict[str, str]) -> int:
    max_attempts = max(1, int(env.get("AI_ENTRY_SMOKE_RETRY_COUNT", "2")))
    retry_delay_seconds = max(1, int(env.get("AI_ENTRY_SMOKE_RETRY_DELAY_SECONDS", "5")))
    for attempt_index in range(max_attempts):
        attempt_no = attempt_index + 1
        print(f"[ai-entry] smoke attempt {attempt_no}/{max_attempts}")
        validation = subprocess.run(
            ["node", "scripts/ai_entry_model_selection_smoke_test.js"],
            cwd=str(ROOT),
            check=False,
            env=env,
        )
        if validation.returncode == 0:
            return 0
        if attempt_no < max_attempts:
            time.sleep(retry_delay_seconds)
    return 1


def main():
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    shared_env = {
        **os.environ,
        "HOME": str(ROOT),
        "USERPROFILE": str(ROOT),
        "APPDATA": str(ROOT),
        "NEXT_DIST_DIR": VALIDATION_DIST_DIR,
        "ALLOW_DEMO_LOGIN": "true",
        "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
        "AI_ENTRY_SMOKE_AUTH_TIMEOUT_MS": os.environ.get("AI_ENTRY_SMOKE_AUTH_TIMEOUT_MS", "45000"),
    }

    subprocess.run([str(NEXT_CLI), "build"], cwd=str(ROOT), check=True, env=shared_env)

    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"

    with LOG_PATH.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [str(NEXT_CLI), "start", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={**shared_env, "PORT": str(port)},
        )

        try:
            wait_for_ready(base_url)
            validation_env = {**shared_env, "BASE_URL": base_url}
            raise SystemExit(run_validation_with_retry(validation_env))
        finally:
            if proc.poll() is None:
                if os.name == "nt":
                    subprocess.run(
                        ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                        check=False,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=10)
                else:
                    proc.send_signal(signal.SIGTERM)
                    try:
                        proc.wait(timeout=10)
                    except subprocess.TimeoutExpired:
                        proc.kill()
                        proc.wait(timeout=10)


if __name__ == "__main__":
    main()
