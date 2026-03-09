"""
Debug scroll issue - check scroll area structure
"""

from playwright.sync_api import sync_playwright
import sys

PORT = "3000"


def debug_scroll():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)  # Not headless to see browser
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to Brand Strategy Advisor...")
        page.goto(
            f"http://localhost:{PORT}/dashboard/advisor/brand-strategy", timeout=60000
        )
        page.wait_for_load_state("domcontentloaded", timeout=60000)

        # Wait a bit for React to render
        page.wait_for_timeout(2000)

        # Find scroll area viewport
        print("\n=== Checking Scroll Area Structure ===")

        # Look for radix scroll area viewport
        scroll_viewport = page.locator("[data-radix-scroll-area-viewport]")
        count = scroll_viewport.count()
        print(f"Scroll area viewport count: {count}")

        if count > 0:
            viewport = scroll_viewport.first
            style = viewport.get_attribute("style")
            print(f"Viewport style: {style}")

            classes = viewport.get_attribute("class")
            print(f"Viewport classes: {classes}")

            # Check overflow
            overflow = page.evaluate("""
                () => {
                    const el = document.querySelector('[data-radix-scroll-area-viewport]');
                    if (el) {
                        return {
                            overflow: window.getComputedStyle(el).overflow,
                            overflowY: window.getComputedStyle(el).overflowY,
                            scrollHeight: el.scrollHeight,
                            clientHeight: el.clientHeight
                        };
                    }
                    return null;
                }
            """)
            print(f"Computed overflow: {overflow}")

        # Check for messages container
        print("\n=== Checking Messages ===")
        messages = page.locator(".space-y-6").first
        msg_count = messages.locator("> div").count()
        print(f"Message count in container: {msg_count}")

        # Check scroll area parent
        print("\n=== Checking Parent Structure ===")
        parent_info = page.evaluate("""
            () => {
                const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
                if (!viewport) return 'No viewport found';
                
                let el = viewport;
                let info = [];
                for (let i = 0; i < 5 && el; i++) {
                    info.push({
                        tag: el.tagName,
                        class: el.className?.substring(0, 100),
                        overflow: window.getComputedStyle(el).overflow,
                        scrollHeight: el.scrollHeight,
                        clientHeight: el.clientHeight
                    });
                    el = el.parentElement;
                }
                return info;
            }
        """)
        print(f"Parent chain: {parent_info}")

        # Take screenshot
        page.screenshot(path="tests/screenshots/scroll-debug.png", full_page=True)
        print("\nScreenshot saved to tests/screenshots/scroll-debug.png")

        input("Press Enter to close browser...")
        browser.close()


if __name__ == "__main__":
    debug_scroll()
