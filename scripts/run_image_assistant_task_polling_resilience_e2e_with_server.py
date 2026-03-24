from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASE_RUNNER = ROOT / "scripts" / "run_image_assistant_brief_generate_e2e_with_server.py"
SCENARIO = os.environ.get("IMAGE_ASSISTANT_E2E_SCENARIO", "task-polling-resilience")
E2E_SCRIPT = os.environ.get(
    "IMAGE_ASSISTANT_E2E_SCRIPT", "scripts/image_assistant_task_polling_resilience_e2e.py"
)


def main():
    env = {
        **os.environ,
        "IMAGE_ASSISTANT_E2E_SCENARIO": SCENARIO,
        "IMAGE_ASSISTANT_E2E_SCRIPT": E2E_SCRIPT,
    }
    result = subprocess.run(
        [sys.executable, str(BASE_RUNNER)],
        cwd=str(ROOT),
        check=False,
        env=env,
    )
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
