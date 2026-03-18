from pathlib import Path
import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "image-assistant"
TSCONFIG_PATH = ROOT / "tsconfig.json"
VALIDATION_DIST_DIR = ".next-image-assistant-e2e"


def shell_command(*args: str) -> list[str]:
    if os.name == "nt":
        return ["cmd", "/c", *args]
    return list(args)


def get_next_cli() -> Path:
    next_bin_dir = ROOT / "node_modules" / ".bin"
    candidate = next_bin_dir / ("next.CMD" if os.name == "nt" else "next")
    if candidate.exists():
        return candidate

    fallback = next_bin_dir / "next"
    if fallback.exists():
        return fallback

    raise FileNotFoundError("next CLI was not found in node_modules/.bin")


def run_node_script(shared_env: dict[str, str], script_path: str, *, retries: int = 1, delay_seconds: int = 2):
    last_return_code = 0
    for attempt in range(1, retries + 1):
        result = subprocess.run(shell_command("node", script_path), cwd=str(ROOT), check=False, env=shared_env)
        last_return_code = result.returncode
        if result.returncode == 0:
            return
        if attempt < retries:
            time.sleep(delay_seconds)

    raise SystemExit(last_return_code)


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


def run_case(shared_env: dict[str, str], scenario: str, server_env: dict[str, str]):
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    log_path = ARTIFACT_DIR / f"{scenario}-server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    next_cli = get_next_cli()

    with log_path.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [str(next_cli), "start", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={
                **shared_env,
                **server_env,
                "PORT": str(port),
                "ALLOW_DEMO_LOGIN": "true",
                "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
                "NEXT_PUBLIC_ENABLE_IMAGE_DESIGN_GENERATION": "true",
            },
        )

        try:
            wait_for_ready(base_url)
            validation = subprocess.run(
                [sys.executable, "scripts/image_assistant_e2e.py"],
                cwd=str(ROOT),
                check=False,
                env={
                    **shared_env,
                    **server_env,
                    "IMAGE_ASSISTANT_TEST_BASE_URL": base_url,
                    "IMAGE_ASSISTANT_E2E_SCENARIO": scenario,
                },
            )
            return validation.returncode
        finally:
            stop_process_tree(proc)


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    original_tsconfig = TSCONFIG_PATH.read_text(encoding="utf-8")
    next_cli = get_next_cli()
    shared_env = {
      **os.environ,
      "HOME": str(ROOT),
      "USERPROFILE": str(ROOT),
      "APPDATA": str(ROOT),
      "NEXT_DIST_DIR": VALIDATION_DIST_DIR,
    }

    try:
        run_node_script(shared_env, "scripts/run-enterprise-migration.js", retries=3)
        run_node_script(shared_env, "scripts/run-image-assistant-migration.js", retries=3)
        subprocess.run([str(next_cli), "build"], cwd=str(ROOT), check=True, env=shared_env)

        results = {}

        fixture_rc = run_case(
            shared_env,
            "fixture_enabled",
            {
                "AIBERM_API_KEY": "",
                "WRITER_AIBERM_API_KEY": "",
                "IMAGE_ASSISTANT_FIXTURES": "true",
                "WRITER_USE_SYSTEM_PROXY": "false",
                "WRITER_HTTP_PROXY": "",
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
            },
        )
        results["fixture_enabled"] = fixture_rc

        missing_rc = run_case(
            shared_env,
            "provider_missing",
            {
                "AIBERM_API_KEY": "",
                "WRITER_AIBERM_API_KEY": "",
                "GOOGLE_AI_API_KEY": "",
                "GEMINI_API_KEY": "",
                "GOOGLE_API_KEY": "",
                "IMAGE_ASSISTANT_FIXTURES": "false",
                "WRITER_USE_SYSTEM_PROXY": "false",
                "WRITER_HTTP_PROXY": "",
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
            },
        )
        results["provider_missing"] = missing_rc

        (ARTIFACT_DIR / "results.json").write_text(
            json.dumps(results, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )

        if any(code != 0 for code in results.values()):
            raise SystemExit(1)
    finally:
        TSCONFIG_PATH.write_text(original_tsconfig, encoding="utf-8")


if __name__ == "__main__":
    main()
