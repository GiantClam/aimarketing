"""
Test scroll with native div - fresh test
"""

from playwright.sync_api import sync_playwright

PORT = "3000"


def test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        # Force fresh load
        page.goto(
            f"http://localhost:{PORT}/dashboard/advisor/brand-strategy?nocache={id(page)}",
            timeout=60000,
        )
        page.wait_for_load_state("domcontentloaded", timeout=60000)
        page.wait_for_timeout(5000)

        print("=== Checking Scroll Structure ===")

        # Check for scroll container
        scroll_div = page.locator(".overflow-y-auto.scrollbar-hide")
        count = scroll_div.count()
        print(f"Custom scroll div count: {count}")

        # Check viewport structure
        radix_viewport = page.locator("[data-radix-scroll-area-viewport]")
        print(f"Radix viewport count: {radix_viewport.count()}")

        # Check actual element
        element_info = page.evaluate("""
            () => {
                // Look for our custom scroll container
                const scrollDiv = document.querySelector('.overflow-y-auto.scrollbar-hide');
                if (scrollDiv) {
                    return {
                        found: 'custom-div',
                        overflowY: window.getComputedStyle(scrollDiv).overflowY,
                        scrollHeight: scrollDiv.scrollHeight,
                        clientHeight: scrollDiv.clientHeight
                    };
                }
                
                // Fallback to radix
                const radix = document.querySelector('[data-radix-scroll-area-viewport]');
                if (radix) {
                    return {
                        found: 'radix',
                        overflowY: window.getComputedStyle(radix).overflowY,
                        scrollHeight: radix.scrollHeight,
                        clientHeight: radix.clientHeight
                    };
                }
                
                return { found: 'none' };
            }
        """)

        print(f"Element: {element_info}")

        page.screenshot(path="tests/screenshots/fresh-test.png", full_page=True)

        input("Press Enter...")
        browser.close()


if __name__ == "__main__":
    test()
