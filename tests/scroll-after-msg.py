"""
Test scroll after sending message
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

        # Find input
        input_el = page.locator("input").first

        if input_el.is_enabled():
            print("=== Sending test message ===")
            # Type message
            input_el.fill("测试滚动功能请输入很长很长的内容来测试滚动功能")

            # Find send button - look for button with Send icon
            send_btn = page.locator("button:not([disabled]) svg.lucide-send").first
            if send_btn.count() == 0:
                # Try alternative selector
                send_btn = (
                    page.locator("button")
                    .filter(has=page.locator('svg.lucide-send, svg[class*="send"]'))
                    .first
                )

            print(f"Send button count: {send_btn.count()}")

            if send_btn.count() > 0:
                send_btn.click()
                print("Clicked send, waiting...")
                page.wait_for_timeout(8000)

        # Check scroll after message
        print("\\n=== After Message ===")
        info = page.evaluate("""
            () => {
                const el = document.querySelector('.overflow-y-auto.scrollbar-hide');
                return el ? {
                    overflowY: window.getComputedStyle(el).overflowY,
                    scrollHeight: el.scrollHeight,
                    clientHeight: el.clientHeight,
                    canScroll: el.scrollHeight > el.clientHeight,
                    scrollTop: el.scrollTop
                } : null;
            }
        """)
        print(f"Scroll: {info}")

        # Try scroll
        print("\\n=== Testing Scroll ===")
        result = page.evaluate("""
            () => {
                const el = document.querySelector('.overflow-y-auto.scrollbar-hide');
                if (!el) return 'No element';
                
                const before = el.scrollTop;
                el.scrollTop = 100;
                const after = el.scrollTop;
                
                return { before, after, success: after > before };
            }
        """)
        print(f"Scroll result: {result}")

        page.screenshot(path="tests/screenshots/scroll-after-msg.png", full_page=True)

        input("Press Enter...")
        browser.close()


if __name__ == "__main__":
    test()
