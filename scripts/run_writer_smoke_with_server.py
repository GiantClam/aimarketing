from pathlib import Path
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "artifacts" / "writer-start.log"
NEXT_START = ROOT / "node_modules" / ".bin" / "next.CMD"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_ready(base_url: str, timeout_seconds: int = 90):
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
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"

    with LOG_PATH.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [str(NEXT_START), "start", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={
                **os.environ,
                "PORT": str(port),
                "ALLOW_DEMO_LOGIN": "true",
                "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
                "WRITER_E2E_FIXTURES": "true",
                "WRITER_USE_SYSTEM_PROXY": "false",
                "WRITER_HTTP_PROXY": "",
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
            },
        )

        try:
            wait_for_ready(base_url)
            smoke = subprocess.run(
                [sys.executable, "scripts/writer_local_smoke.py"],
                cwd=str(ROOT),
                check=False,
                env={**os.environ, "WRITER_TEST_BASE_URL": base_url},
            )
            raise SystemExit(smoke.returncode)
        finally:
            if proc.poll() is None:
                proc.send_signal(signal.SIGTERM)
                try:
                    proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=10)


if __name__ == "__main__":
    main()
