from __future__ import annotations

import argparse
import json
import os
import subprocess
import re
from pathlib import Path
from time import sleep, time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ARTIFACT_DIR = Path("artifacts") / "auth-smoke"
ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)

NODE_DB_SCRIPT = r"""
const { Pool } = require('pg')

const input = JSON.parse(process.argv[1])
const dbUrl =
  process.env.AI_MARKETING_DB_POSTGRES_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.POSTGRES_PRISMA_URL ||
  process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING

if (!dbUrl) {
  throw new Error('database url missing')
}

const shouldUseRelaxedSsl = (connectionString) => {
  const lower = String(connectionString).toLowerCase()
  return lower.includes('sslmode=require') || lower.includes('supabase.com') || process.env.PGSSLMODE === 'require'
}

const poolConfig = shouldUseRelaxedSsl(dbUrl)
  ? (() => {
      const parsed = new URL(dbUrl)
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : 5432,
        user: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password),
        database: parsed.pathname.replace(/^\//, ''),
        ssl: {
          rejectUnauthorized: false,
        },
      }
    })()
  : { connectionString: dbUrl }

const pool = new Pool(poolConfig)

;(async () => {
  try {
    const result = await pool.query(input.sql, input.params || [])
    process.stdout.write(JSON.stringify({ rows: result.rows, rowCount: result.rowCount }))
  } finally {
    await pool.end()
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : String(error))
  process.exit(1)
})
""" 


def load_env_file(path: Path):
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[len("export ") :].lstrip()
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key or key in os.environ:
            continue

        if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
            value = value[1:-1]
        os.environ[key] = value


def load_repo_env():
    load_env_file(Path(".env"))
    load_env_file(Path(".env.local"))


def expect(condition: bool, message: str):
    if not condition:
        raise AssertionError(message)


def save_debug(page, name: str):
    page.screenshot(path=str(ARTIFACT_DIR / f"{name}.png"), full_page=True)
    (ARTIFACT_DIR / f"{name}.html").write_text(page.content(), encoding="utf-8")


def wait_until_http_ready(base_url: str, timeout_seconds: int = 180):
    from urllib.request import Request, urlopen

    deadline = time() + timeout_seconds
    last_error = None
    while time() < deadline:
        try:
            request = Request(f"{base_url}/api/health")
            with urlopen(request, timeout=10) as response:
                body = response.read().decode("utf-8", errors="ignore")
                if response.status == 200 and '"ok":true' in body:
                    return
        except Exception as error:
            last_error = error
        sleep(1)

    raise RuntimeError(f"application did not become ready: {last_error}")


def run_db(sql: str, params: list | None = None) -> dict:
    payload = json.dumps({"sql": sql, "params": params or []})
    completed = subprocess.run(
        ["node", "-e", NODE_DB_SCRIPT, payload],
        capture_output=True,
        text=True,
        env=os.environ.copy(),
    )
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout or "database query failed").strip())
    return json.loads(completed.stdout)


def cleanup_user(email: str):
    rows = run_db(
        """
        SELECT id, enterprise_id
        FROM "AI_MARKETING_users"
        WHERE email = $1
        LIMIT 1
        """,
        [email],
    )["rows"]

    if not rows:
        return

    user_id = int(rows[0]["id"])
    enterprise_id = rows[0]["enterprise_id"]

    for table in [
        "AI_MARKETING_user_sessions",
        "AI_MARKETING_user_feature_permissions",
        "AI_MARKETING_email_verification_tokens",
        "AI_MARKETING_password_reset_tokens",
        "AI_MARKETING_enterprise_join_requests",
    ]:
        run_db(f'DELETE FROM "{table}" WHERE user_id = $1', [user_id])

    run_db('DELETE FROM "AI_MARKETING_users" WHERE id = $1', [user_id])

    if enterprise_id:
        run_db('DELETE FROM "AI_MARKETING_enterprises" WHERE id = $1', [int(enterprise_id)])


def clear_capture_file(capture_path: Path):
    if capture_path.exists():
        capture_path.unlink()
    capture_path.parent.mkdir(parents=True, exist_ok=True)


def rewrite_url_host(url: str, base_url: str) -> str:
    from urllib.parse import urlsplit, urlunsplit

    source = urlsplit(url)
    target = urlsplit(base_url)
    return urlunsplit((target.scheme, target.netloc, source.path, source.query, source.fragment))


def read_capture_records(capture_path: Path):
    if not capture_path.exists():
        return []
    records = []
    for line in capture_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return records


def wait_for_capture(capture_path: Path, kind: str, email: str, timeout_ms: int = 60000):
    deadline = time() + (timeout_ms / 1000)
    while time() < deadline:
        records = read_capture_records(capture_path)
        for record in reversed(records):
            if record.get("kind") == kind and record.get("email") == email:
                return record
        sleep(0.5)
    raise AssertionError(f"missing capture record kind={kind!r} email={email!r}")


def login_via_api(context, base_url: str, email: str, password: str):
    response = context.request.post(
        f"{base_url}/api/auth/login",
        headers={"Content-Type": "application/json"},
        data=json.dumps({"email": email, "password": password}),
    )
    return response


def assert_no_critical_console_errors(console_errors):
    critical_errors = [
        error
        for error in console_errors
        if "Failed to load resource" not in error
        and "404" not in error
        and "favicon" not in error
        and "AbortError" not in error
        and 'An empty string ("") was passed to the src attribute' not in error
    ]
    expect(not critical_errors, f"critical console errors found: {critical_errors[:5]}")


def main():
    load_repo_env()
    parser = argparse.ArgumentParser(description="Local auth smoke test")
    parser.add_argument("--base-url", default=os.environ.get("AUTH_TEST_BASE_URL", "http://localhost:3000"))
    parser.add_argument(
        "--capture-path",
        default=os.environ.get(
            "AUTH_SMOKE_CAPTURE_PATH",
            str(ARTIFACT_DIR / "auth-emails.jsonl"),
        ),
    )
    parser.add_argument("--keep-data", action="store_true")
    args = parser.parse_args()

    base_url = args.base_url.rstrip("/")
    capture_path = Path(args.capture_path)
    clear_capture_file(capture_path)
    wait_until_http_ready(base_url)

    test_id = str(int(time() * 1000))[-8:]
    email = f"qa-auth-{test_id}@aimarketingsite.com"
    name = f"QA Auth {test_id}"
    enterprise_name = f"QA Auth Enterprise {test_id}"
    password_1 = "Qa#12345678"
    password_2 = "Qa#23456789"
    password_3 = "Qa#34567890"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 1100})
        page = context.new_page()
        page.set_default_timeout(90000)

        console_errors = []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)

        try:
            page.goto(f"{base_url}/register", timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "00-register")

            page.locator("#name").fill(name)
            page.locator("#email").fill(email)
            page.locator("#password").fill(password_1)
            page.locator("#confirmPassword").fill(password_1)
            page.locator("#enterpriseName").fill(enterprise_name)
            page.locator('form button[type="submit"]').first.click()

            page.wait_for_url("**/verify-email**", timeout=90000)
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "01-await-verification")

            verification_record = wait_for_capture(capture_path, "email_verification", email, timeout_ms=90000)
            verification_url = rewrite_url_host(verification_record["url"], base_url)

            page.goto(verification_url, timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            page.wait_for_url("**/dashboard**", timeout=90000)
            save_debug(page, "02-verified")

            page.goto(f"{base_url}/dashboard/settings", timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            page.locator("#current-password").wait_for(state="visible", timeout=90000)
            save_debug(page, "03-settings")

            page.locator("#current-password").fill(password_1)
            page.locator("#new-password").fill(password_2)
            page.locator("#confirm-password").fill(password_2)
            change_button = page.get_by_role(
                "button",
                name=re.compile(r"Change password|确认修改密码|修改密码", re.IGNORECASE),
            )
            change_button.click()
            page.wait_for_timeout(10000)
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "04-password-changed")

            old_login = login_via_api(context, base_url, email, password_1)
            expect(old_login.status == 401, f"old password should be rejected, got {old_login.status}")

            new_login = login_via_api(context, base_url, email, password_2)
            expect(new_login.ok, f"new password login failed: {new_login.status}")

            page.goto(f"{base_url}/forgot-password", timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "05-forgot-password")

            page.locator("#email").fill(email)
            page.locator('form button[type="submit"]').first.click()
            page.wait_for_load_state("networkidle", timeout=90000)
            save_debug(page, "06-reset-requested")

            reset_record = wait_for_capture(capture_path, "password_reset", email, timeout_ms=90000)
            reset_url = rewrite_url_host(reset_record["url"], base_url)

            page.goto(reset_url, timeout=90000, wait_until="domcontentloaded")
            page.wait_for_load_state("networkidle", timeout=90000)
            page.locator("#newPassword").wait_for(state="visible", timeout=90000)
            save_debug(page, "07-reset-form")

            page.locator("#newPassword").fill(password_3)
            page.locator("#confirmPassword").fill(password_3)
            page.locator('form button[type="submit"]').first.click()
            page.wait_for_load_state("networkidle", timeout=90000)
            page.wait_for_url("**/dashboard**", timeout=90000)
            save_debug(page, "08-reset-complete")

            post_reset_old_login = login_via_api(context, base_url, email, password_2)
            expect(
                post_reset_old_login.status == 401,
                f"old post-reset password should be rejected, got {post_reset_old_login.status}",
            )

            post_reset_new_login = login_via_api(context, base_url, email, password_3)
            expect(post_reset_new_login.ok, f"new post-reset password login failed: {post_reset_new_login.status}")

            assert_no_critical_console_errors(console_errors)
            print(json.dumps({
                "ok": True,
                "email": email,
                "verificationUrl": verification_url,
                "resetUrl": reset_url,
            }))
        except (AssertionError, PlaywrightTimeoutError, Exception) as error:
            try:
                save_debug(page, "99-failure")
            except Exception:
                pass
            raise
        finally:
            browser.close()
            if not args.keep_data:
                cleanup_user(email)


if __name__ == "__main__":
    main()
