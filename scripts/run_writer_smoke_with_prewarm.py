import os
from time import sleep, time
import runpy
import urllib.request


BASE_URL = os.environ.get("WRITER_TEST_BASE_URL", "http://localhost:3123").strip()


def wait_for_url(url: str, timeout_seconds: int = 180):
    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=10) as response:
                response.read()
                if response.status == 200:
                    return
        except Exception as error:
            last_error = error
        sleep(1)
    raise RuntimeError(f"prewarm failed for {url}: {last_error}")


wait_for_url(f"{BASE_URL}/api/health")
wait_for_url(f"{BASE_URL}/login")
os.environ["WRITER_SKIP_READY"] = "1"
runpy.run_path("scripts/writer_local_smoke.py", run_name="__main__")
