from __future__ import annotations

import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "image-assistant" / "export-download-regression"


def get_next_cli() -> Path:
    next_bin_dir = ROOT / "node_modules" / ".bin"
    candidate = next_bin_dir / ("next.CMD" if os.name == "nt" else "next")
    if candidate.exists():
        return candidate

    fallback = next_bin_dir / "next"
    if fallback.exists():
        return fallback

    raise FileNotFoundError("next CLI was not found in node_modules/.bin")


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


def stop_process_tree(proc: subprocess.Popen[str]):
    if proc.poll() is not None:
        return

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
        return

    proc.send_signal(signal.SIGTERM)
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=10)


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    next_cli = get_next_cli()
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    log_path = ARTIFACT_DIR / "server.log"

    base_env = {
        **os.environ,
        "ALLOW_DEMO_LOGIN": "true",
        "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
        "NEXT_PUBLIC_ENABLE_IMAGE_DESIGN_GENERATION": "true",
    }

    with log_path.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [str(next_cli), "dev", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={**base_env, "PORT": str(port)},
        )
        try:
            wait_for_ready(base_url, timeout_seconds=240)
            result = subprocess.run(
                [sys.executable, "scripts/image_assistant_export_download_e2e.py"],
                cwd=str(ROOT),
                check=False,
                env={
                    **base_env,
                    "IMAGE_ASSISTANT_TEST_BASE_URL": base_url,
                },
            )
            raise SystemExit(result.returncode)
        finally:
            stop_process_tree(proc)


if __name__ == "__main__":
    main()

