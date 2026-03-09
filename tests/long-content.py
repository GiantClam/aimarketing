"""
Test scroll with long content
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

        # Find input and send multiple long messages
        input_el = page.locator("input").first

        if input_el.is_enabled():
            messages = [
                "这是一条非常非常长的测试消息，用来测试滚动功能。" * 20,
                "这是第二条测试消息，继续填充内容来测试滚动。" * 20,
                "第三条消息来了，继续增加内容高度。" * 20,
                "第四条消息，测试滚动是否正常工作。" * 20,
                "第五条消息，马上就能看到滚动条了。" * 20,
            ]

            for i, msg in enumerate(messages):
                print(f"Sending message {i + 1}...")
                input_el.fill(msg)

                # Find and click send button
                send_btn = (
                    page.locator("button")
                    .filter(has=page.locator("svg.lucide-send"))
                    .first
                )
                if send_btn.count() > 0:
                    send_btn.click()
                    page.wait_for_timeout(1500)

        # Check scroll after messages
        print("\\n=== After Multiple Messages ===")
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

        # Try scroll
        if info and info.get("canScroll"):
            result = page.evaluate("""
                () => {
                    const el = document.querySelector('.overflow-y-auto.scrollbar-hide');
                    el.scrollTop = el.scrollHeight;
                    return el.scrollTop;
                }
            """)
            print(f"Scroll position after scrollTop=max: {result}")

        page.screenshot(path="tests/screenshots/long-content.png", full_page=True)

        input("Press Enter...")
        browser.close()


if __name__ == "__main__":
    test()
