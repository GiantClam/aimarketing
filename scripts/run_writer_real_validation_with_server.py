from pathlib import Path
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
LOG_PATH = ROOT / "artifacts" / "writer-real-validation-start.log"
NEXT_CLI = ROOT / "node_modules" / ".bin" / "next.CMD"
VALIDATION_DIST_DIR = ".next-writer-real-validation"
TSCONFIG_PATH = ROOT / "tsconfig.json"


def shell_command(*args: str) -> list[str]:
    if os.name == "nt":
        return ["cmd", "/c", *args]
    return list(args)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_ready(base_url: str, timeout_seconds: int = 120):
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
    original_tsconfig = TSCONFIG_PATH.read_text(encoding="utf-8")
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

    with LOG_PATH.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [str(NEXT_CLI), "start", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={
                **shared_env,
                "PORT": str(port),
                "ALLOW_DEMO_LOGIN": "true",
                "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
            },
        )

        try:
            wait_for_ready(base_url)
            seed = subprocess.run(
                shell_command("node", "scripts/seed-writer-history.js"),
                cwd=str(ROOT),
                check=False,
                env=shared_env.copy(),
            )
            if seed.returncode != 0:
                raise SystemExit(seed.returncode)

            validation = subprocess.run(
                [sys.executable, "scripts/writer_real_browser_validation.py"],
                cwd=str(ROOT),
                check=False,
                env={**shared_env, "WRITER_TEST_BASE_URL": base_url},
            )
            raise SystemExit(validation.returncode)
        finally:
            TSCONFIG_PATH.write_text(original_tsconfig, encoding="utf-8")
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
