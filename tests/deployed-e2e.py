import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from time import time
from urllib.parse import urlparse
import re
import subprocess

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


@dataclass
class Account:
    name: str
    email: str
    password: str
    enterprise_name: str | None = None


@dataclass
class Config:
    base_url: str
    headless: bool
    timeout_ms: int
    artifact_dir: Path
    admin_email: str | None
    admin_password: str | None
    member_email: str | None
    member_password: str | None
    skip_member_flow: bool


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
        ssl: { rejectUnauthorized: false },
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


class Recorder:
    def __init__(self) -> None:
        self.results: list[dict[str, str]] = []

    def add(self, name: str, status: str, details: str = "") -> None:
        self.results.append({"name": name, "status": status, "details": details})

    def has_failures(self) -> bool:
        return any(item["status"] == "failed" for item in self.results)

    def print_summary(self) -> None:
        print("DEPLOYED_E2E_SUMMARY_START")
        print(json.dumps(self.results, ensure_ascii=False, indent=2))
        print("DEPLOYED_E2E_SUMMARY_END")


class EnvironmentSkipError(Exception):
    pass


def load_env_file(path: Path) -> None:
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

        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1]
        os.environ[key] = value


def load_repo_env() -> None:
    load_env_file(Path(".env"))
    load_env_file(Path(".env.local"))


def build_config() -> Config:
    parser = argparse.ArgumentParser(
        description="Run browser regression tests against a deployed aimarketing environment."
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BASE_URL") or os.environ.get("TEST_BASE_URL"),
        required=not (os.environ.get("BASE_URL") or os.environ.get("TEST_BASE_URL")),
    )
    parser.add_argument(
        "--headed", action="store_true", help="Run browser in headed mode"
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=int(os.environ.get("TEST_TIMEOUT_MS", "45000")),
    )
    parser.add_argument(
        "--artifact-dir",
        default=os.environ.get("TEST_ARTIFACT_DIR", "tests/screenshots/deployed"),
    )
    parser.add_argument("--admin-email", default=os.environ.get("TEST_ADMIN_EMAIL"))
    parser.add_argument(
        "--admin-password", default=os.environ.get("TEST_ADMIN_PASSWORD")
    )
    parser.add_argument("--member-email", default=os.environ.get("TEST_MEMBER_EMAIL"))
    parser.add_argument(
        "--member-password", default=os.environ.get("TEST_MEMBER_PASSWORD")
    )
    parser.add_argument(
        "--skip-member-flow",
        action="store_true",
        help="Skip enterprise join and approval flow",
    )
    args = parser.parse_args()

    artifact_dir = Path(args.artifact_dir)
    artifact_dir.mkdir(parents=True, exist_ok=True)

    return Config(
        base_url=args.base_url.rstrip("/"),
        headless=not args.headed,
        timeout_ms=args.timeout_ms,
        artifact_dir=artifact_dir,
        admin_email=args.admin_email,
        admin_password=args.admin_password,
        member_email=args.member_email,
        member_password=args.member_password,
        skip_member_flow=args.skip_member_flow,
    )


def account_with_suffix(prefix: str) -> Account:
    suffix = str(int(time() * 1000))
    return Account(
        name=f"{prefix.title()}User{suffix}",
        email=f"{prefix}_{suffix}@example.com",
        password="Passw0rd!234",
        enterprise_name=f"{prefix.title()} Enterprise {suffix}",
    )


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


def save_failure_screenshot(page, artifact_dir: Path, name: str) -> None:
    try:
        page.screenshot(path=str(artifact_dir / f"{name}.png"), full_page=True)
    except Exception:
        pass


def wait_for_dashboard(page, timeout_ms: int) -> None:
    page.wait_for_function(
        "() => ['/dashboard', '/dashboard/settings', '/dashboard/platform-settings'].includes(window.location.pathname)",
        timeout=timeout_ms,
    )
    page.wait_for_load_state("networkidle")


def complete_email_verification(
    page, config: Config, email: str, timeout_ms: int
) -> None:
    rows = run_db(
        """
        SELECT u.id
        FROM "AI_MARKETING_users" u
        WHERE u.email = $1
        LIMIT 1
        """,
        [email.strip().lower()],
    )["rows"]

    if not rows:
        raise AssertionError(f"User not found for email verification: {email}")

    user_id = int(rows[0]["id"])
    run_db(
        """
        UPDATE "AI_MARKETING_users"
        SET email_verified = TRUE, updated_at = NOW()
        WHERE id = $1
        """,
        [user_id],
    )
    run_db(
        'DELETE FROM "AI_MARKETING_email_verification_tokens" WHERE user_id = $1',
        [user_id],
    )


def login(page, base_url: str, email: str, password: str, timeout_ms: int) -> None:
    page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    with page.expect_response("**/api/auth/login", timeout=timeout_ms):
        page.locator("form button[type='submit']").click()
    wait_for_dashboard(page, timeout_ms)


def logout(page, base_url: str) -> None:
    page.evaluate(
        "() => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })"
    )
    page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")


def register_create_enterprise(page, config: Config, account: Account) -> None:
    page.goto(f"{config.base_url}/register", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.locator("#name").fill(account.name)
    page.locator("#email").fill(account.email)
    page.locator("#password").fill(account.password)
    page.locator("#confirmPassword").fill(account.password)
    page.locator("#enterpriseName").fill(
        account.enterprise_name or "Regression Enterprise"
    )

    with page.expect_response(
        "**/api/auth/register", timeout=config.timeout_ms
    ) as response_info:
        page.locator("form button[type='submit']").click()

    response = response_info.value
    if not response.ok:
        raise AssertionError(
            f"Admin register failed: {response.status} {response.text()}"
        )

    response_json = response.json()
    if response_json.get("requiresEmailVerification"):
        complete_email_verification(page, config, account.email, config.timeout_ms)
        login(page, config.base_url, account.email, account.password, config.timeout_ms)
        return

    wait_for_dashboard(page, config.timeout_ms)


def register_join_enterprise(
    page, config: Config, account: Account, enterprise_code: str
) -> None:
    page.goto(f"{config.base_url}/register", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.locator("#name").fill(account.name)
    page.locator("#email").fill(account.email)
    page.locator("#password").fill(account.password)
    page.locator("#confirmPassword").fill(account.password)
    page.locator("form button[type='button']").nth(1).click()
    page.locator("#enterpriseCode").fill(enterprise_code)
    page.locator("form button[type='button']").nth(2).click()
    page.locator("#joinNote").fill("Automated deployed regression test")

    with page.expect_response(
        "**/api/auth/register", timeout=config.timeout_ms
    ) as response_info:
        page.locator("form button[type='submit']").click()

    response = response_info.value
    if not response.ok:
        raise AssertionError(
            f"Member register failed: {response.status} {response.text()}"
        )

    response_json = response.json()
    if response_json.get("requiresEmailVerification"):
        complete_email_verification(page, config, account.email, config.timeout_ms)
        login(page, config.base_url, account.email, account.password, config.timeout_ms)
        page.goto(f"{config.base_url}/dashboard/settings", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        return

    page.wait_for_url(
        lambda url: "/dashboard/settings" in url, timeout=config.timeout_ms
    )
    page.wait_for_load_state("networkidle")


def assert_public_pages(page, config: Config) -> None:
    page.goto(f"{config.base_url}/", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if (
        page.locator("a[href='/login']").count() == 0
        or page.locator("a[href='/register']").count() == 0
    ):
        raise AssertionError("Homepage CTA links are missing")

    page.goto(f"{config.base_url}/login", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")

    page.goto(f"{config.base_url}/dashboard", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if urlparse(page.url).path != "/login":
        raise AssertionError(
            f"Unauthenticated dashboard access should redirect to /login, got {page.url}"
        )


def verify_dashboard_shell(page, config: Config) -> None:
    page.goto(f"{config.base_url}/dashboard", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    settings_link_count = page.locator("a[href='/dashboard/platform-settings']").count()
    legacy_settings_link_count = page.locator("a[href='/dashboard/settings']").count()
    if settings_link_count == 0 and legacy_settings_link_count == 0:
        raise AssertionError("Settings link is missing from dashboard")
    if page.locator("a[href='/dashboard/website-generator']").count() != 0:
        raise AssertionError("Website entry should be hidden")

    availability = page.evaluate(
        """async () => {
            const res = await fetch('/api/dashboard/availability', { credentials: 'same-origin' });
            let body = null;
            try { body = await res.json(); } catch {}
            return { status: res.status, body };
        }"""
    )

    if availability["status"] != 200:
        raise AssertionError(
            f"Unexpected dashboard availability response: {availability}"
        )

    advisor = (availability.get("body") or {}).get("data", {}).get("advisor", {})
    expected_entries = {
        re.compile("Brand strategy advisor", re.IGNORECASE): bool(
            advisor.get("brandStrategy")
        ),
        re.compile("Growth advisor", re.IGNORECASE): bool(advisor.get("growth")),
        re.compile("Company Search", re.IGNORECASE): bool(
            advisor.get("companySearch")
        ),
        re.compile("Contact Mining", re.IGNORECASE): bool(
            advisor.get("contactMining")
        ),
    }

    for label_pattern, should_exist in expected_entries.items():
        count = page.get_by_role("button", name=label_pattern).count()
        if should_exist and count == 0:
            raise AssertionError(
                f"Expected dashboard advisor entry to be visible: {label_pattern.pattern}"
            )
        if not should_exist and count != 0:
            raise AssertionError(
                f"Expected dashboard advisor entry to be hidden: {label_pattern.pattern}"
            )


def find_member_permission_card(page, member_email: str):
    candidates = page.locator("div", has_text=member_email).filter(
        has=page.get_by_role("button", name=re.compile("保存权限|Save permissions"))
    )
    best_candidate = None
    best_checkbox_count = None
    for index in range(candidates.count()):
        candidate = candidates.nth(index)
        text = candidate.inner_text()
        if member_email not in text:
            continue
        if re.search(r"Status:\s+active", text, re.IGNORECASE) is None:
            if "状态：已激活" not in text and "状态： active" not in text:
                continue
        checkbox_count = candidate.locator("input[type='checkbox']").count()
        if checkbox_count <= 0:
            continue
        if best_checkbox_count is None or checkbox_count < best_checkbox_count:
            best_candidate = candidate
            best_checkbox_count = checkbox_count
    if best_candidate is not None:
        return best_candidate
    raise AssertionError(
        f"Member permission card with feature toggles not found for {member_email}"
    )


def find_pending_request_card(page, member_email: str):
    candidates = page.locator("div", has_text=member_email).filter(
        has=page.get_by_role("button", name=re.compile("通过|Approve"))
    )
    best_candidate = None
    best_button_count = None
    for index in range(candidates.count()):
        candidate = candidates.nth(index)
        button_count = candidate.get_by_role("button").count()
        if button_count <= 0:
            continue
        if best_button_count is None or button_count < best_button_count:
            best_candidate = candidate
            best_button_count = button_count
    if best_candidate is not None:
        return best_candidate
    return None


def verify_settings(
    page,
    config: Config,
    expected_email: str,
    expected_status: str | None = None,
    expected_checkbox_count: int | None = None,
) -> dict[str, str]:
    page.goto(f"{config.base_url}/dashboard/settings", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    disabled_inputs = page.locator("input[disabled]")
    if disabled_inputs.count() < 5:
        raise AssertionError(
            f"Expected 5 disabled inputs on settings page, got {disabled_inputs.count()}"
        )

    email = disabled_inputs.nth(0).input_value().strip()
    enterprise_code = disabled_inputs.nth(1).input_value().strip()
    enterprise_name = disabled_inputs.nth(2).input_value().strip()
    status = disabled_inputs.nth(4).input_value().strip()

    if email != expected_email:
        raise AssertionError(f"Settings email mismatch: {email} != {expected_email}")
    if not enterprise_code:
        raise AssertionError("Enterprise code is missing")
    if not enterprise_name:
        raise AssertionError("Enterprise name is missing")
    if expected_status is not None and status != expected_status:
        raise AssertionError(
            f"Unexpected enterprise status: {status} != {expected_status}"
        )

    if expected_checkbox_count is not None:
        if expected_checkbox_count == 0:
            checkbox_count = page.locator("input[type='checkbox']").count()
        else:
            member_card = find_member_permission_card(page, expected_email)
            checkbox_count = member_card.locator("input[type='checkbox']").count()
        if checkbox_count != expected_checkbox_count:
            raise AssertionError(
                f"Expected {expected_checkbox_count} feature checkboxes, got {checkbox_count}"
            )

    return {
        "enterprise_code": enterprise_code,
        "enterprise_name": enterprise_name,
        "status": status,
    }


def verify_disabled_routes(page, config: Config) -> None:
    for route in ("/dashboard/website-generator",):
        page.goto(f"{config.base_url}{route}", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        if urlparse(page.url).path not in ("/dashboard", "/dashboard/ai"):
            raise AssertionError(
                f"{route} should redirect to dashboard shell, got {page.url}"
            )


def verify_disabled_apis(page) -> None:
    responses = page.evaluate(
        """async () => {
            const outputs = [];
            for (const [url, payload] of [
                ['/api/webgen/generate', { prompt: 'test' }],
                ['/api/dify/advisors/availability', null],
            ]) {
                const options = payload
                    ? {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        credentials: 'same-origin',
                    }
                    : { credentials: 'same-origin' };
                const res = await fetch(url, options);
                let body = null;
                try { body = await res.json(); } catch {}
                outputs.push({ url, status: res.status, body });
            }
            return outputs;
        }"""
    )

    lookup = {item["url"]: item for item in responses}
    webgen = lookup["/api/webgen/generate"]
    dify = lookup["/api/dify/advisors/availability"]

    if webgen["status"] != 410 or webgen["body"].get("error") != "Feature disabled":
        raise AssertionError(f"Unexpected website API response: {webgen}")
    dify_data = dify["body"].get("data", {})
    expected_dify_keys = {
        "brandStrategy",
        "growth",
        "leadHunter",
        "companySearch",
        "contactMining",
        "copywriting",
        "hasAny",
    }
    if dify["status"] != 200:
        raise AssertionError(f"Unexpected Dify availability response: {dify}")
    if set(dify_data.keys()) != expected_dify_keys:
        raise AssertionError(
            f"Unexpected Dify availability shape: {sorted(dify_data.keys())}"
        )
    if any(not isinstance(dify_data.get(key), bool) for key in expected_dify_keys):
        raise AssertionError(f"Unexpected Dify availability values: {dify}")


def verify_ai_entry_apis(page) -> None:
    responses = page.evaluate(
        """async () => {
            const outputs = [];
            for (const url of ['/api/ai/models', '/api/ai/agents']) {
                const res = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
                let body = null;
                try { body = await res.json(); } catch {}
                outputs.push({ url, status: res.status, body });
            }
            return outputs;
        }"""
    )
    lookup = {item["url"]: item for item in responses}
    models = lookup["/api/ai/models"]
    agents = lookup["/api/ai/agents"]
    if models["status"] != 200:
        raise AssertionError(f"Unexpected AI models response: {models}")
    if agents["status"] != 200:
        raise AssertionError(f"Unexpected AI agents response: {agents}")


def wait_for_member_status(page, member_email: str, expected_status: str, timeout_ms: int) -> None:
    deadline = time() + timeout_ms / 1000
    last_status = None
    while time() < deadline:
        result = page.evaluate(
            """async (email) => {
                const res = await fetch('/api/enterprise/members', {
                    cache: 'no-store',
                    credentials: 'same-origin',
                });
                const body = await res.json().catch(() => null);
                const rows = Array.isArray(body?.data) ? body.data : [];
                const member = rows.find((item) => String(item?.email || '').toLowerCase() === String(email || '').toLowerCase());
                return member ? String(member.enterpriseStatus || '') : null;
            }""",
            member_email,
        )
        last_status = result
        if result == expected_status:
            return
        page.wait_for_timeout(1000)
    raise AssertionError(
        f"Member {member_email} did not reach status {expected_status}; last status: {last_status}"
    )


def approve_member_request(page, config: Config, member_email: str) -> None:
    response = page.goto(
        f"{config.base_url}/dashboard/platform-settings",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    if response and response.status >= 400:
        raise AssertionError(f"Settings page returned {response.status}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    if "login" in page.url:
        raise AssertionError("Not logged in - redirected to login page")
    request_row = find_pending_request_card(page, member_email)
    if request_row is None:
        return
    request_row.wait_for(timeout=config.timeout_ms)
    with page.expect_response(
        lambda response: "/api/enterprise/requests/" in response.url
        and response.request.method == "POST",
        timeout=config.timeout_ms,
    ) as response_info:
        request_row.get_by_role("button", name=re.compile("通过|Approve")).first.click()
    review_response = response_info.value
    if not review_response.ok:
        response_text = review_response.text()
        if (
            review_response.status == 409
            and "billing_member_limit_reached" in response_text
        ):
            raise EnvironmentSkipError(
                f"Member approval skipped: workspace seat limit reached ({response_text})"
            )
        raise AssertionError(
            f"Approve request failed: {review_response.status} {response_text}"
        )
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)
    wait_for_member_status(page, member_email, "active", config.timeout_ms)
    page.goto(f"{config.base_url}/dashboard/platform-settings", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    find_member_permission_card(page, member_email)


def enable_member_permissions(page, config: Config, member_email: str) -> None:
    response = page.goto(
        f"{config.base_url}/dashboard/platform-settings",
        wait_until="domcontentloaded",
        timeout=30000,
    )
    if response and response.status >= 400:
        raise AssertionError(f"Settings page returned {response.status}")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    if "login" in page.url:
        raise AssertionError("Not logged in - redirected to login page")
    member_card = find_member_permission_card(page, member_email)
    member_card.wait_for(timeout=config.timeout_ms)
    checkboxes = member_card.locator("input[type='checkbox']")
    if checkboxes.count() != 4:
        raise AssertionError(
            f"Expected 4 member feature checkboxes, got {checkboxes.count()}"
        )
    made_changes = False
    for index in range(checkboxes.count()):
        checkbox = checkboxes.nth(index)
        if not checkbox.is_checked():
            checkbox.check(force=True)
            made_changes = True
    save_button = member_card.locator("button").first
    if made_changes and save_button.is_enabled():
        save_button.click()
        page.wait_for_load_state("networkidle")


def verify_member_dashboard(page, config: Config) -> None:
    page.goto(f"{config.base_url}/dashboard", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if page.locator("a[href='/dashboard/website-generator']").count() != 0:
        raise AssertionError("Website entry should remain hidden for approved member")

    dify = page.evaluate(
        """async () => {
            const res = await fetch('/api/dify/advisors/availability', { credentials: 'same-origin' });
            return { status: res.status, body: await res.json() };
        }"""
    )
    if dify["status"] != 200:
        raise AssertionError(f"Unexpected member Dify availability response: {dify}")


def run_step(recorder: Recorder, page, artifact_dir: Path, name: str, fn) -> None:
    try:
        fn()
        recorder.add(name, "passed")
    except EnvironmentSkipError as error:
        recorder.add(name, "skipped", str(error))
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        save_failure_screenshot(page, artifact_dir, name)
        recorder.add(name, "failed", str(error))


def main() -> None:
    load_repo_env()
    config = build_config()
    recorder = Recorder()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=config.headless)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(config.timeout_ms)

        console_errors: list[str] = []
        ignore_member_limit_console = False

        def collect_console_error(msg) -> None:
            if msg.type != "error":
                return
            text = msg.text or ""
            if (
                "Failed to load resource: the server responded with a status of 410"
                in text
            ):
                return
            if "Failed to fetch" in text and "dashboard.availability" in text:
                return
            if "Failed to load resource" in text and "401" in text:
                return
            if "Failed to load resource" in text and "403" in text:
                return
            if "ai-entry.models.load.failed" in text:
                return
            if "ai-entry.agents.load.failed" in text:
                return
            console_errors.append(text)

        page.on("console", collect_console_error)

        admin_account = Account(
            name="Admin",
            email=config.admin_email or "",
            password=config.admin_password or "",
        )
        member_account = Account(
            name="Member",
            email=config.member_email or "",
            password=config.member_password or "",
        )
        enterprise_meta: dict[str, str] = {}

        run_step(
            recorder,
            page,
            config.artifact_dir,
            "public_pages",
            lambda: assert_public_pages(page, config),
        )

        def admin_bootstrap() -> None:
            nonlocal admin_account, enterprise_meta
            if admin_account.email and admin_account.password:
                login(
                    page,
                    config.base_url,
                    admin_account.email,
                    admin_account.password,
                    config.timeout_ms,
                )
            else:
                admin_account = account_with_suffix("admin")
                register_create_enterprise(page, config, admin_account)
            verify_dashboard_shell(page, config)
            enterprise_meta = verify_settings(
                page,
                config,
                admin_account.email,
            )
            verify_disabled_routes(page, config)
            verify_disabled_apis(page)
            verify_ai_entry_apis(page)

        run_step(recorder, page, config.artifact_dir, "admin_flow", admin_bootstrap)

        if not config.skip_member_flow and enterprise_meta:

            def member_flow() -> None:
                nonlocal member_account, ignore_member_limit_console
                logout(page, config.base_url)
                if member_account.email and member_account.password:
                    login(
                        page,
                        config.base_url,
                        member_account.email,
                        member_account.password,
                        config.timeout_ms,
                    )
                    existing_member = verify_settings(
                        page,
                        config,
                        member_account.email,
                        expected_checkbox_count=0,
                    )
                    member_is_pending = existing_member.get("status", "").lower() == "pending"
                    logout(page, config.base_url)
                else:
                    member_account = account_with_suffix("member")
                    register_join_enterprise(
                        page, config, member_account, enterprise_meta["enterprise_code"]
                    )
                    verify_settings(
                        page,
                        config,
                        member_account.email,
                        expected_checkbox_count=0,
                    )
                    member_is_pending = True

                logout(page, config.base_url)
                login(
                    page,
                    config.base_url,
                    admin_account.email,
                    admin_account.password,
                    config.timeout_ms,
                )
                try:
                    if member_is_pending:
                        approve_member_request(page, config, member_account.email)
                except EnvironmentSkipError:
                    ignore_member_limit_console = True
                    raise
                enable_member_permissions(page, config, member_account.email)

                logout(page, config.base_url)
                login(
                    page,
                    config.base_url,
                    member_account.email,
                    member_account.password,
                    config.timeout_ms,
                )
                verify_settings(
                    page,
                    config,
                    member_account.email,
                    expected_checkbox_count=0,
                )
                verify_member_dashboard(page, config)
                logout(page, config.base_url)

            run_step(recorder, page, config.artifact_dir, "member_flow", member_flow)

        browser.close()

    if ignore_member_limit_console:
        console_errors = [
            text
            for text in console_errors
            if "Failed to load resource: the server responded with a status of 409"
            not in text
        ]

    if console_errors:
        recorder.add("console_errors", "failed", "\n".join(console_errors[:10]))

    recorder.print_summary()
    if recorder.has_failures():
        raise SystemExit(1)


if __name__ == "__main__":
    main()
