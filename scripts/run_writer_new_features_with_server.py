from pathlib import Path
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request


ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = ROOT / "artifacts" / "writer-new-features"
NEXT_CLI = ROOT / "node_modules" / ".bin" / "next.CMD"
TSCONFIG_PATH = ROOT / "tsconfig.json"
VALIDATION_DIST_DIR = os.environ.get("NEXT_DIST_DIR", ".next-writer-new-features")
SKIP_BUILD = os.environ.get("WRITER_NEW_FEATURES_SKIP_BUILD", "").strip().lower() == "true"


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


def run_case(shared_env: dict[str, str], scenario: str, server_env: dict[str, str], *, seed_history: bool):
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    log_path = ARTIFACT_DIR / f"{scenario}-server.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)

    with log_path.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            [str(NEXT_CLI), "start", "--hostname", "127.0.0.1", "--port", str(port)],
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={
                **shared_env,
                **server_env,
                "PORT": str(port),
                "ALLOW_DEMO_LOGIN": "true",
                "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
            },
        )

        try:
            wait_for_ready(base_url)
            if seed_history:
                seed = subprocess.run(
                    shell_command("node", "scripts/seed-writer-history.js"),
                    cwd=str(ROOT),
                    check=False,
                    env={**shared_env, **server_env},
                )
                if seed.returncode != 0:
                    return seed.returncode

            validation = subprocess.run(
                [sys.executable, "scripts/writer_new_features_e2e.py"],
                cwd=str(ROOT),
                check=False,
                env={
                    **shared_env,
                    **server_env,
                    "WRITER_TEST_BASE_URL": base_url,
                    "WRITER_E2E_SCENARIO": scenario,
                },
            )
            return validation.returncode
        finally:
            stop_process_tree(proc)


def build_validation_bundle(shared_env: dict[str, str], validation_dist_path: Path, attempts: int = 3):
    last_return_code = 1

    for attempt in range(1, attempts + 1):
        shutil.rmtree(validation_dist_path, ignore_errors=True)
        build = subprocess.run([str(NEXT_CLI), "build"], cwd=str(ROOT), check=False, env=shared_env)
        if build.returncode == 0:
            return
        last_return_code = build.returncode
        if attempt < attempts:
            time.sleep(2)

    raise subprocess.CalledProcessError(last_return_code, [str(NEXT_CLI), "build"])


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    original_tsconfig = TSCONFIG_PATH.read_text(encoding="utf-8")
    validation_dist_path = ROOT / VALIDATION_DIST_DIR
    shared_env = {
        **os.environ,
        "HOME": str(ROOT),
        "USERPROFILE": str(ROOT),
        "APPDATA": str(ROOT),
        "NEXT_DIST_DIR": VALIDATION_DIST_DIR,
    }

    try:
        if not SKIP_BUILD:
            build_validation_bundle(shared_env, validation_dist_path)

        results = {}

        fixture_rc = run_case(
            shared_env,
            "fixture_enabled",
            {
                "AIBERM_API_KEY": "e2e-fixture-key",
                "WRITER_AIBERM_API_KEY": "e2e-fixture-key",
                "WRITER_E2E_FIXTURES": "true",
                "WRITER_ENABLE_WEB_RESEARCH": "false",
                "WRITER_REQUIRE_WEB_RESEARCH": "false",
                "WRITER_USE_SYSTEM_PROXY": "false",
                "WRITER_HTTP_PROXY": "",
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
            },
            seed_history=True,
        )
        results["fixture_enabled"] = fixture_rc

        missing_rc = run_case(
            shared_env,
            "provider_missing",
            {
                "AIBERM_API_KEY": "",
                "WRITER_AIBERM_API_KEY": "",
                "WRITER_E2E_FIXTURES": "false",
                "WRITER_ENABLE_WEB_RESEARCH": "false",
                "WRITER_REQUIRE_WEB_RESEARCH": "false",
                "WRITER_USE_SYSTEM_PROXY": "false",
                "WRITER_HTTP_PROXY": "",
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
            },
            seed_history=False,
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
