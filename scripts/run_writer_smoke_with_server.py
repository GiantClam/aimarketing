from pathlib import Path
import os
import signal
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "artifacts" / "writer-start.log"


def wait_for_ready(timeout_seconds: int = 90):
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
      try:
        with urllib.request.urlopen("http://localhost:3123/api/health", timeout=5) as response:
          body = response.read().decode("utf-8", errors="ignore")
          if response.status == 200 and '"ok":true' in body:
            return
      except Exception as error:  # noqa: BLE001
        last_error = error
      time.sleep(1)

    raise RuntimeError(f"server did not become ready: {last_error}")


def main():
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

    with LOG_PATH.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            ["cmd.exe", "/c", "npm run start -- --port 3123"],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={
                **os.environ,
                "PORT": "3123",
                "ALLOW_DEMO_LOGIN": "true",
                "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
            },
        )

        try:
            wait_for_ready()
            smoke = subprocess.run([sys.executable, "scripts/writer_local_smoke.py"], cwd=str(ROOT), check=False)
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
