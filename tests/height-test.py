"""
Debug scroll - check container heights
"""

from playwright.sync_api import sync_playwright

PORT = "3000"


def test_heights():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()

        page.goto(
            f"http://localhost:{PORT}/dashboard/advisor/brand-strategy", timeout=60000
        )
        page.wait_for_load_state("domcontentloaded", timeout=60000)
        page.wait_for_timeout(3000)

        print("=== Container Heights Analysis ===")

        # Check heights
        heights = page.evaluate("""
            () => {
                const viewport = document.querySelector('[data-radix-scroll-area-viewport]');
                const root = viewport?.parentElement;
                const chatArea = root?.parentElement;
                const mainContainer = chatArea?.parentElement;
                
                const results = {};
                
                if (viewport) {
                    results.viewport = {
                        scrollHeight: viewport.scrollHeight,
                        clientHeight: viewport.clientHeight,
                        canScroll: viewport.scrollHeight > viewport.clientHeight
                    };
                }
                
                if (root) {
                    results.root = {
                        scrollHeight: root.scrollHeight,
                        clientHeight: root.clientHeight,
                        offsetHeight: root.offsetHeight
                    };
                }
                
                if (chatArea) {
                    results.chatArea = {
                        h: chatArea.style.height,
                        className: chatArea.className.substring(0, 50)
                    };
                }
                
                return results;
            }
        """)

        print(f"Viewport: {heights.get('viewport')}")
        print(f"Root: {heights.get('root')}")
        print(f"ChatArea: {heights.get('chatArea')}")

        # Find all scrollable elements
        scrollables = page.evaluate("""
            () => {
                const all = document.querySelectorAll('*');
                const scrollable = [];
                all.forEach(el => {
                    const style = window.getComputedStyle(el);
                    if (style.overflowY === 'auto' || style.overflowY === 'scroll' || 
                        style.overflow === 'auto' || style.overflow === 'scroll') {
                        if (el.scrollHeight > el.clientHeight) {
                            scrollable.push({
                                tag: el.tagName,
                                class: el.className?.substring(0, 30),
                                scrollHeight: el.scrollHeight,
                                clientHeight: el.clientHeight
                            });
                        }
                    }
                });
                return scrollable;
            }
        """)

        print(f"\\nScrollable elements: {scrollables}")

        page.screenshot(path="tests/screenshots/heights.png", full_page=True)

        input("Press Enter...")
        browser.close()


if __name__ == "__main__":
    test_heights()
