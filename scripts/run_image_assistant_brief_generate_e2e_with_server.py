from __future__ import annotations

import json
import os
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENV_FILES = [ROOT / ".env", ROOT / ".env.local"]
E2E_EMAIL = "image-e2e@example.com"
E2E_PASSWORD = "ImageE2E123!"
E2E_ENTERPRISE_CODE = "experience-enterprise"
E2E_SCRIPT = os.environ.get(
    "IMAGE_ASSISTANT_E2E_SCRIPT", "scripts/image_assistant_guided_card_flow_e2e.py"
)
E2E_SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "guided-card-flow")
ARTIFACT_DIR = ROOT / "artifacts" / "image-assistant" / E2E_SCENARIO
E2E_REAL_MODE = os.environ.get("IMAGE_ASSISTANT_E2E_REAL_MODE", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def shell_command(*args: str) -> list[str]:
    if os.name == "nt":
        return ["cmd", "/c", *args]
    return list(args)


def load_env_files(base: dict[str, str]) -> dict[str, str]:
    result = dict(base)
    for env_file in ENV_FILES:
        if not env_file.exists():
            continue
        for raw_line in env_file.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            if not key or key in result:
                continue
            value = value.strip()
            if (value.startswith('"') and value.endswith('"')) or (
                value.startswith("'") and value.endswith("'")
            ):
                value = value[1:-1]
            result[key] = value
    return result


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def wait_for_ready(base_url: str, timeout_seconds: int = 180):
    deadline = time.time() + timeout_seconds
    last_error: Exception | None = None
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(
                f"{base_url}/api/health", timeout=5
            ) as response:
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


def run_node_script(
    env: dict[str, str], script_path: str, args: list[str] | None = None
):
    cmd = shell_command("node", script_path, *(args or []))
    result = subprocess.run(cmd, cwd=str(ROOT), check=False, env=env)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main():
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    shared_env = load_env_files(os.environ)
    shared_env.update(
        {
            "ALLOW_DEMO_LOGIN": "true",
            "NEXT_PUBLIC_ALLOW_DEMO_LOGIN": "true",
            "NEXT_PUBLIC_ENABLE_IMAGE_DESIGN_GENERATION": "true",
            "NEXT_DIST_DIR": ".next-image-assistant-e2e",
        }
    )

    if not E2E_REAL_MODE:
        # Opt-in fallback for local debug only.
        shared_env.update(
            {
                "IMAGE_ASSISTANT_FIXTURES": "true",
                "AIBERM_API_KEY": "",
                "WRITER_AIBERM_API_KEY": "",
                "GOOGLE_AI_API_KEY": "",
                "GEMINI_API_KEY": "",
                "GOOGLE_API_KEY": "",
                "WRITER_USE_SYSTEM_PROXY": "false",
                "WRITER_HTTP_PROXY": "",
                "HTTP_PROXY": "",
                "HTTPS_PROXY": "",
                "ALL_PROXY": "",
            }
        )
    else:
        shared_env["IMAGE_ASSISTANT_FIXTURES"] = "false"

    # Ensure Next.js dev runtime starts from a clean build cache to avoid stale vendor chunk crashes.
    run_node_script(shared_env, "scripts/clean-build-artifacts.js")

    # Skip database migrations for faster testing - use demo login only
    # run_node_script(shared_env, "scripts/run-enterprise-migration.js")
    # run_node_script(shared_env, "scripts/run-image-assistant-migration.js")
    # run_node_script(
    #     shared_env,
    #     "scripts/provision_visual_regression_user.js",
    #     [
    #         "--email",
    #         E2E_EMAIL,
    #         "--password",
    #         E2E_PASSWORD,
    #         "--enterprise-code",
    #         E2E_ENTERPRISE_CODE,
    #         "--name",
    #         "Image Assistant E2E",
    #         "--role",
    #         "admin",
    #     ],
    # )

    port = find_free_port()
    host = "localhost"
    base_url = f"http://{host}:{port}"
    server_log_path = ARTIFACT_DIR / "server.log"

    with server_log_path.open("w", encoding="utf-8") as log_file:
        proc = subprocess.Popen(
            shell_command(
                "npm",
                "run",
                "dev",
                "--",
                "--hostname",
                host,
                "--port",
                str(port),
            ),
            cwd=str(ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            env={
                **shared_env,
                "PORT": str(port),
                "NEXT_DIST_DIR": ".next-image-assistant-e2e",
            },
        )
        try:
            wait_for_ready(base_url, timeout_seconds=240)
            result = subprocess.run(
                [
                    sys.executable,
                    E2E_SCRIPT,
                ],
                cwd=str(ROOT),
                check=False,
                env={
                    **shared_env,
                    "IMAGE_ASSISTANT_TEST_BASE_URL": base_url,
                    "IMAGE_ASSISTANT_E2E_SCENARIO": E2E_SCENARIO,
                    "IMAGE_ASSISTANT_E2E_EMAIL": E2E_EMAIL,
                    "IMAGE_ASSISTANT_E2E_PASSWORD": E2E_PASSWORD,
                },
            )
            (ARTIFACT_DIR / "runner-result.json").write_text(
                json.dumps(
                    {
                        "ok": result.returncode == 0,
                        "return_code": result.returncode,
                        "base_url": base_url,
                        "email": E2E_EMAIL,
                        "script": E2E_SCRIPT,
                        "real_mode": E2E_REAL_MODE,
                    },
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            if result.returncode != 0:
                raise SystemExit(result.returncode)
        finally:
            stop_process_tree(proc)


if __name__ == "__main__":
    main()
