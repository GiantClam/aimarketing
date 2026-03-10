import argparse
import json
import os
from dataclasses import dataclass
from pathlib import Path
from time import time

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


def build_config() -> Config:
    parser = argparse.ArgumentParser(description="Run browser regression tests against a deployed aimarketing environment.")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("BASE_URL") or os.environ.get("TEST_BASE_URL"),
        required=not (os.environ.get("BASE_URL") or os.environ.get("TEST_BASE_URL")),
    )
    parser.add_argument("--headed", action="store_true", help="Run browser in headed mode")
    parser.add_argument("--timeout-ms", type=int, default=int(os.environ.get("TEST_TIMEOUT_MS", "45000")))
    parser.add_argument("--artifact-dir", default=os.environ.get("TEST_ARTIFACT_DIR", "tests/screenshots/deployed"))
    parser.add_argument("--admin-email", default=os.environ.get("TEST_ADMIN_EMAIL"))
    parser.add_argument("--admin-password", default=os.environ.get("TEST_ADMIN_PASSWORD"))
    parser.add_argument("--member-email", default=os.environ.get("TEST_MEMBER_EMAIL"))
    parser.add_argument("--member-password", default=os.environ.get("TEST_MEMBER_PASSWORD"))
    parser.add_argument("--skip-member-flow", action="store_true", help="Skip enterprise join and approval flow")
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
    suffix = str(int(time()))
    return Account(
        name=f"{prefix.title()}User{suffix}",
        email=f"{prefix}_{suffix}@example.com",
        password="Passw0rd!234",
        enterprise_name=f"{prefix.title()} Enterprise {suffix}",
    )


def save_failure_screenshot(page, artifact_dir: Path, name: str) -> None:
    try:
        page.screenshot(path=str(artifact_dir / f"{name}.png"), full_page=True)
    except Exception:
        pass


def wait_for_dashboard(page, timeout_ms: int) -> None:
    page.wait_for_function(
        "() => window.location.pathname === '/dashboard' || window.location.pathname === '/dashboard/settings'",
        timeout=timeout_ms,
    )
    page.wait_for_load_state("networkidle")


def login(page, base_url: str, email: str, password: str, timeout_ms: int) -> None:
    page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.locator("#email").fill(email)
    page.locator("#password").fill(password)
    with page.expect_response("**/api/auth/login", timeout=timeout_ms):
        page.locator("form button[type='submit']").click()
    wait_for_dashboard(page, timeout_ms)


def logout(page, base_url: str) -> None:
    page.evaluate("() => fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })")
    page.goto(f"{base_url}/login", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")


def register_create_enterprise(page, config: Config, account: Account) -> None:
    page.goto(f"{config.base_url}/register", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    page.locator("#name").fill(account.name)
    page.locator("#email").fill(account.email)
    page.locator("#password").fill(account.password)
    page.locator("#confirmPassword").fill(account.password)
    page.locator("#enterpriseName").fill(account.enterprise_name or "Regression Enterprise")

    with page.expect_response("**/api/auth/register", timeout=config.timeout_ms) as response_info:
        page.locator("form button[type='submit']").click()

    response = response_info.value
    if not response.ok:
        raise AssertionError(f"Admin register failed: {response.status} {response.text()}")

    wait_for_dashboard(page, config.timeout_ms)


def register_join_enterprise(page, config: Config, account: Account, enterprise_code: str) -> None:
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

    with page.expect_response("**/api/auth/register", timeout=config.timeout_ms) as response_info:
        page.locator("form button[type='submit']").click()

    response = response_info.value
    if not response.ok:
        raise AssertionError(f"Member register failed: {response.status} {response.text()}")

    page.wait_for_url(lambda url: "/dashboard/settings" in url, timeout=config.timeout_ms)
    page.wait_for_load_state("networkidle")


def assert_public_pages(page, config: Config) -> None:
    page.goto(f"{config.base_url}/", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if page.locator("a[href='/login']").count() == 0 or page.locator("a[href='/register']").count() == 0:
        raise AssertionError("Homepage CTA links are missing")

    page.goto(f"{config.base_url}/login", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    login_text = page.locator("body").inner_text()
    if "网站生成和视频生成能力" in login_text:
        raise AssertionError("Login page still contains legacy generator marketing copy")

    page.goto(f"{config.base_url}/dashboard", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if not page.url.startswith(f"{config.base_url}/login"):
        raise AssertionError("Unauthenticated dashboard access should redirect to /login")


def verify_dashboard_shell(page, config: Config) -> None:
    page.goto(f"{config.base_url}/dashboard", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if page.locator("a[href='/dashboard/settings']").count() == 0:
        raise AssertionError("Settings link is missing from dashboard")
    if page.locator("a[href='/dashboard/video']").count() != 0:
        raise AssertionError("Video entry should be hidden")
    if page.locator("a[href='/dashboard/website-generator']").count() != 0:
        raise AssertionError("Website entry should be hidden")
    if page.locator("a[href^='/dashboard/advisor/']").count() != 0:
        raise AssertionError("Advisor entry should be hidden for accounts without Dify config")


def verify_settings(
    page,
    config: Config,
    expected_email: str,
    expected_status: str,
    expected_checkbox_count: int | None = None,
) -> dict[str, str]:
    page.goto(f"{config.base_url}/dashboard/settings", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    disabled_inputs = page.locator("input[disabled]")
    if disabled_inputs.count() < 5:
        raise AssertionError(f"Expected 5 disabled inputs on settings page, got {disabled_inputs.count()}")

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
    if status != expected_status:
        raise AssertionError(f"Unexpected enterprise status: {status} != {expected_status}")

    if expected_checkbox_count is not None:
        checkbox_count = page.locator("input[type='checkbox']").count()
        if checkbox_count != expected_checkbox_count:
            raise AssertionError(f"Expected {expected_checkbox_count} feature checkboxes, got {checkbox_count}")

    return {"enterprise_code": enterprise_code, "enterprise_name": enterprise_name}


def verify_disabled_routes(page, config: Config) -> None:
    for route in ("/dashboard/video", "/dashboard/website-generator"):
        page.goto(f"{config.base_url}{route}", wait_until="domcontentloaded")
        page.wait_for_load_state("networkidle")
        if page.url.rstrip("/") != f"{config.base_url}/dashboard":
            raise AssertionError(f"{route} should redirect to /dashboard, got {page.url}")


def verify_disabled_apis(page) -> None:
    responses = page.evaluate(
        """async () => {
            const outputs = [];
            for (const [url, payload] of [
                ['/api/webgen/generate', { prompt: 'test' }],
                ['/api/crewai/agent', { message: 'test' }],
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
    crewai = lookup["/api/crewai/agent"]
    dify = lookup["/api/dify/advisors/availability"]

    if webgen["status"] != 410 or webgen["body"].get("error") != "Feature disabled":
        raise AssertionError(f"Unexpected website API response: {webgen}")
    if crewai["status"] != 410 or crewai["body"].get("error") != "Feature disabled":
        raise AssertionError(f"Unexpected video API response: {crewai}")
    if dify["status"] != 200 or dify["body"].get("data", {}).get("hasAny") is not False:
        raise AssertionError(f"Unexpected Dify availability response: {dify}")


def approve_member_request(page, config: Config, member_email: str) -> None:
    page.goto(f"{config.base_url}/dashboard/settings", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    request_row = page.locator("div.rounded-lg.border.p-3", has_text=member_email).first
    request_row.wait_for(timeout=config.timeout_ms)
    request_row.locator("button").nth(1).click()
    page.wait_for_load_state("networkidle")


def enable_member_permissions(page, config: Config, member_email: str) -> None:
    page.goto(f"{config.base_url}/dashboard/settings", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    member_card = page.locator("div.rounded-lg.border.p-4", has_text=member_email).first
    member_card.wait_for(timeout=config.timeout_ms)
    checkboxes = member_card.locator("input[type='checkbox']")
    if checkboxes.count() != 2:
        raise AssertionError(f"Expected 2 member feature checkboxes, got {checkboxes.count()}")
    for index in range(checkboxes.count()):
        checkbox = checkboxes.nth(index)
        if not checkbox.is_checked():
            checkbox.check(force=True)
    member_card.locator("button").first.click()
    page.wait_for_load_state("networkidle")


def verify_member_dashboard(page, config: Config) -> None:
    page.goto(f"{config.base_url}/dashboard", wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")
    if page.locator("a[href='/dashboard/video']").count() != 0:
        raise AssertionError("Video entry should remain hidden for approved member")
    if page.locator("a[href='/dashboard/website-generator']").count() != 0:
        raise AssertionError("Website entry should remain hidden for approved member")
    if page.locator("a[href^='/dashboard/advisor/']").count() != 0:
        raise AssertionError("Advisor entry should remain hidden for member without Dify config")

    dify = page.evaluate(
        """async () => {
            const res = await fetch('/api/dify/advisors/availability', { credentials: 'same-origin' });
            return { status: res.status, body: await res.json() };
        }"""
    )
    if dify["status"] != 200 or dify["body"].get("data", {}).get("hasAny") is not False:
        raise AssertionError(f"Unexpected member Dify availability response: {dify}")


def run_step(recorder: Recorder, page, artifact_dir: Path, name: str, fn) -> None:
    try:
        fn()
        recorder.add(name, "passed")
    except (AssertionError, PlaywrightTimeoutError, Exception) as error:
        save_failure_screenshot(page, artifact_dir, name)
        recorder.add(name, "failed", str(error))


def main() -> None:
    config = build_config()
    recorder = Recorder()

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=config.headless)
        context = browser.new_context()
        page = context.new_page()
        page.set_default_timeout(config.timeout_ms)

        console_errors: list[str] = []

        def collect_console_error(msg) -> None:
            if msg.type != "error":
                return
            text = msg.text or ""
            if "Failed to load resource: the server responded with a status of 410" in text:
                return
            console_errors.append(text)

        page.on("console", collect_console_error)

        admin_account = Account(name="Admin", email=config.admin_email or "", password=config.admin_password or "")
        member_account = Account(name="Member", email=config.member_email or "", password=config.member_password or "")
        enterprise_meta: dict[str, str] = {}

        run_step(recorder, page, config.artifact_dir, "public_pages", lambda: assert_public_pages(page, config))

        def admin_bootstrap() -> None:
            nonlocal admin_account, enterprise_meta
            if admin_account.email and admin_account.password:
                login(page, config.base_url, admin_account.email, admin_account.password, config.timeout_ms)
            else:
                admin_account = account_with_suffix("admin")
                register_create_enterprise(page, config, admin_account)
            verify_dashboard_shell(page, config)
            enterprise_meta = verify_settings(page, config, admin_account.email, "已激活", expected_checkbox_count=2)
            verify_disabled_routes(page, config)
            verify_disabled_apis(page)

        run_step(recorder, page, config.artifact_dir, "admin_flow", admin_bootstrap)

        if not config.skip_member_flow and enterprise_meta:
            def member_flow() -> None:
                nonlocal member_account
                logout(page, config.base_url)
                if member_account.email and member_account.password:
                    login(page, config.base_url, member_account.email, member_account.password, config.timeout_ms)
                else:
                    member_account = account_with_suffix("member")
                    register_join_enterprise(page, config, member_account, enterprise_meta["enterprise_code"])
                verify_settings(page, config, member_account.email, "待审核", expected_checkbox_count=0)

                logout(page, config.base_url)
                login(page, config.base_url, admin_account.email, admin_account.password, config.timeout_ms)
                approve_member_request(page, config, member_account.email)
                enable_member_permissions(page, config, member_account.email)

                logout(page, config.base_url)
                login(page, config.base_url, member_account.email, member_account.password, config.timeout_ms)
                verify_settings(page, config, member_account.email, "已激活", expected_checkbox_count=0)
                verify_member_dashboard(page, config)
                logout(page, config.base_url)

            run_step(recorder, page, config.artifact_dir, "member_flow", member_flow)

        browser.close()

    if console_errors:
        recorder.add("console_errors", "failed", "\n".join(console_errors[:10]))

    recorder.print_summary()
    if recorder.has_failures():
        raise SystemExit(1)


if __name__ == "__main__":
    main()
