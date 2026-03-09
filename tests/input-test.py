"""
Test scroll with content
"""

from playwright.sync_api import sync_playwright

PORT = "3000"


def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        page.goto(
            f"http://localhost:{PORT}/dashboard/advisor/brand-strategy", timeout=60000
        )
        page.wait_for_load_state("domcontentloaded", timeout=60000)
        page.wait_for_timeout(5000)

        print("=== Initial State ===")
        info = page.evaluate("""
            () => {
                const el = document.querySelector('.overflow-y-auto.scrollbar-hide');
                return el ? {
                    overflowY: window.getComputedStyle(el).overflowY,
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    canScroll: el.scrollHeight > el.clientHeight
                } : null;
            }
        """)
        print(f"Scroll: {info}")

        # Try to find and use input
        print("\\n=== Looking for input ===")
        input_selector = 'input[placeholder*="想聊"], input[placeholder*="发送"]'
        input_el = page.locator(input_selector)

        print(f"Input found: {input_el.count()}")

        if input_el.count() > 0:
            # Try to enable input
            print(f"Input enabled: {input_el.first.is_enabled()}")
            print(f"Input disabled: {input_el.first.is_disabled()}")

        # Check whole page for inputs
        all_inputs = page.locator("input").all()
        print(f"Total inputs on page: {len(all_inputs)}")

        # Get HTML to see input state
        input_html = page.locator("input").first.evaluate("el => el.outerHTML")
        print(f"First input HTML: {input_html[:200]}")

        page.screenshot(path="tests/screenshots/input-test.png", full_page=True)

        input("Press Enter...")
        browser.close()


if __name__ == "__main__":
    test()
