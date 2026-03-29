from pathlib import Path
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "artifacts" / "lead-hunter-workflows-e2e-start.log"
NEXT_CLI = ROOT / "node_modules" / ".bin" / "next.CMD"
VALIDATION_DIST_DIR = ".next-lead-hunter-workflows-e2e"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_ready(base_url: str, timeout_seconds: int = 180):
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


def main():
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    shared_env = {
        **os.environ,
        "HOME": str(ROOT),
        "USERPROFILE": str(ROOT),
        "APPDATA": str(ROOT),
        "NEXT_DIST_DIR": VALIDATION_DIST_DIR,
    }

    subprocess.run([str(NEXT_CLI), "build"], cwd=str(ROOT), check=True, env=shared_env)

    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    email = os.environ.get("LEAD_HUNTER_E2E_EMAIL") or os.environ.get("VBUY_ADMIN_EMAIL", "")
    password = os.environ.get("LEAD_HUNTER_E2E_PASSWORD") or os.environ.get("VBUY_ADMIN_PASSWORD", "")
    session_cookie = os.environ.get("LEAD_HUNTER_E2E_SESSION_COOKIE", "")

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

            cmd = [
                sys.executable,
                "scripts/lead_hunter_workflows_e2e.py",
                "--base-url",
                base_url,
            ]
            if session_cookie:
                cmd.extend(["--session-cookie", session_cookie])
            else:
                if not email or not password:
                    raise RuntimeError(
                        "Set LEAD_HUNTER_E2E_SESSION_COOKIE or both LEAD_HUNTER_E2E_EMAIL and LEAD_HUNTER_E2E_PASSWORD.",
                    )
                cmd.extend(["--email", email, "--password", password])

            validation = subprocess.run(cmd, cwd=str(ROOT), check=False, env=shared_env)
            raise SystemExit(validation.returncode)
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
