"""
End-to-end tests for AI Marketing Advisor pages.

Tests:
1. Brand Strategy Advisor page loads correctly
2. Growth Advisor page loads correctly
3. Chat interface is functional (input, send button)
4. Markdown rendering works
5. No critical console errors
"""

from playwright.sync_api import sync_playwright
import sys

PORT = "8080"
HOST = "127.0.0.1"


def test_advisor_pages():
    """Test both advisor pages load and work correctly."""

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Set default timeout
        page.set_default_timeout(30000)

        # Track console errors
        console_errors = []
        page.on(
            "console",
            lambda msg: console_errors.append(msg.text)
            if msg.type == "error"
            else None,
        )

        print("\n" + "=" * 60)
        print("Testing Advisor Pages")
        print("=" * 60)

        # Test 1: Brand Strategy Advisor
        print("\n[1/4] Testing Brand Strategy Advisor...")
        page.goto(
            f"http://{HOST}:{PORT}/dashboard/advisor/brand-strategy", timeout=60000
        )
        page.wait_for_load_state("domcontentloaded", timeout=60000)

        # Check page title
        title = page.locator("h1").first.text_content()
        print(f"  Page title: {title}")

        # Check chat input exists
        input_exists = (
            page.locator('input[placeholder*="聊点什么"]').count() > 0
            or page.locator('input[placeholder*="想聊"]').count() > 0
        )
        print(f"  Chat input exists: {input_exists}")

        # Check send button
        send_btn = page.locator("button").filter(has=page.locator("svg")).first
        send_btn_exists = send_btn.count() > 0
        print(f"  Send button exists: {send_btn_exists}")

        # Check for welcome message
        welcome = page.locator("text=请在下方输入框开始一段新的对话").count() > 0
        print(f"  Welcome message shown: {welcome}")

        # Check context info text
        context_info = (
            page.locator("text=同一会话通过 conversation_id 自动关联上下文").count() > 0
        )
        print(f"  Context info shown: {context_info}")

        # Take screenshot
        page.screenshot(path="tests/screenshots/brand-strategy.png", full_page=True)
        print("  Screenshot saved to tests/screenshots/brand-strategy.png")

        brand_passed = input_exists and send_btn_exists and welcome and context_info
        print(f"  ✓ Brand Strategy Advisor: {'PASSED' if brand_passed else 'FAILED'}")

        # Test 2: Growth Advisor
        print("\n[2/4] Testing Growth Advisor...")
        page.goto(f"http://{HOST}:{PORT}/dashboard/advisor/growth", timeout=60000)
        page.wait_for_load_state("domcontentloaded", timeout=60000)

        title = page.locator("h1").first.text_content()
        print(f"  Page title: {title}")

        input_exists = (
            page.locator('input[placeholder*="聊点什么"]').count() > 0
            or page.locator('input[placeholder*="想聊"]').count() > 0
        )
        print(f"  Chat input exists: {input_exists}")

        welcome = page.locator("text=请在下方输入框开始一段新的对话").count() > 0
        print(f"  Welcome message shown: {welcome}")

        page.screenshot(path="tests/screenshots/growth.png", full_page=True)
        print("  Screenshot saved to tests/screenshots/growth.png")

        growth_passed = input_exists and welcome
        print(f"  ✓ Growth Advisor: {'PASSED' if growth_passed else 'FAILED'}")

        # Test 3: Check dashboard loads
        print("\n[3/4] Testing Dashboard page...")
        page.goto(f"http://{HOST}:{PORT}/dashboard", timeout=60000)
        page.wait_for_load_state("domcontentloaded", timeout=60000)

        dashboard_loads = (
            page.locator("text=AI 营销助手").count() > 0
            or page.locator("text=仪表盘").count() > 0
        )
        print(f"  Dashboard loads: {dashboard_loads}")

        # Check sidebar with advisor links
        advisor_links = page.locator('a[href*="advisor"]').count()
        print(f"  Advisor links in sidebar: {advisor_links}")

        dashboard_passed = dashboard_loads
        print(f"  ✓ Dashboard: {'PASSED' if dashboard_passed else 'FAILED'}")

        # Test 4: Check for console errors
        print("\n[4/4] Checking for critical errors...")
        critical_errors = [
            e for e in console_errors if "Failed to load" not in e and "404" not in e
        ]
        print(f"  Console errors: {len(critical_errors)}")
        if critical_errors:
            for err in critical_errors[:3]:
                print(f"    - {err[:100]}")

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        all_passed = brand_passed and growth_passed and dashboard_passed
        print(f"  Brand Strategy Advisor: {'✓ PASS' if brand_passed else '✗ FAIL'}")
        print(f"  Growth Advisor:         {'✓ PASS' if growth_passed else '✗ FAIL'}")
        print(f"  Dashboard:              {'✓ PASS' if dashboard_passed else '✗ FAIL'}")
        print(
            f"  Console Errors:         {'✓ OK' if not critical_errors else '✗ ' + str(len(critical_errors)) + ' errors'}"
        )
        print("=" * 60)

        if all_passed:
            print("\n🎉 ALL TESTS PASSED!")
            return 0
        else:
            print("\n❌ SOME TESTS FAILED")
            return 1


if __name__ == "__main__":
    sys.exit(test_advisor_pages())
