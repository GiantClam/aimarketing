"""
Debug scroll issue - add test messages and check scrolling
"""

from playwright.sync_api import sync_playwright

PORT = "3000"


def test_scroll():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to Brand Strategy Advisor...")
        page.goto(
            f"http://localhost:{PORT}/dashboard/advisor/brand-strategy", timeout=60000
        )
        page.wait_for_load_state("domcontentloaded", timeout=60000)

        # Wait for React to render
        page.wait_for_timeout(3000)

        # Find input and type a message
        print("\n=== Sending test message ===")
        input_box = page.locator('input[placeholder*="想聊点什么"]').first
        if input_box.count() > 0:
            input_box.fill("测试消息")

            # Click send button
            send_btn = page.locator("button:has(svg.lucide-send)").first
            if send_btn.count() > 0:
                send_btn.click()
                print("Message sent, waiting for response...")
                page.wait_for_timeout(5000)

        # Now check scroll
        print("\n=== Checking Scroll Area After Message ===")
        viewport = page.locator("[data-radix-scroll-area-viewport]").first
        overflow = page.evaluate("""
            () => {
                const el = document.querySelector('[data-radix-scroll-area-viewport]');
                if (el) {
                    return {
                        overflow: window.getComputedStyle(el).overflow,
                        overflowY: window.getComputedStyle(el).overflowY,
                        scrollHeight: el.scrollHeight,
                        clientHeight: el.clientHeight,
                        canScroll: el.scrollHeight > el.clientHeight
                    };
                }
                return null;
            }
        """)
        print(f"Overflow: {overflow}")

        # Try scrolling
        print("\n=== Testing Scroll ===")
        page.evaluate("""
            () => {
                const el = document.querySelector('[data-radix-scroll-area-viewport]');
                if (el) {
                    el.scrollTop = 0;
                }
            }
        """)

        # Check scroll position
        scroll_pos = page.evaluate("""
            () => {
                const el = document.querySelector('[data-radix-scroll-area-viewport]');
                return el ? el.scrollTop : null;
            }
        """)
        print(f"Scroll position after scrollTop=0: {scroll_pos}")

        # Take screenshot
        page.screenshot(path="tests/screenshots/scroll-test.png", full_page=True)
        print("\nScreenshot saved")

        input("Press Enter to close...")
        browser.close()


if __name__ == "__main__":
    test_scroll()
