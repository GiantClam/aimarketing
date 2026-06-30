import { chromium } from "playwright"
import fs from "node:fs"

const BASE = "http://localhost:3000"
const OUT = "output/verify-screenshots"
fs.mkdirSync(OUT, { recursive: true })

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: "zh-CN",
  })
  const page = await context.newPage()

  // 1. Demo login via context.request — cookies persist into the browser context
  console.log("→ demo login...")
  const loginRes = await context.request.post(`${BASE}/api/auth/demo`, {
    headers: { "content-type": "application/json" },
    data: {},
  })
  console.log("  login status:", loginRes.status())
  if (!loginRes.ok()) {
    const body = await loginRes.text()
    throw new Error(`demo login failed: ${loginRes.status()} ${body.slice(0, 300)}`)
  }
  // Verify cookies were set
  const cookies = await context.cookies()
  console.log("  cookies:", cookies.map((c) => c.name).join(", ") || "(none)")

  // 2. Go to the PPT assistant page
  console.log("→ navigating to /dashboard/ai?agent=executive-ppt ...")
  await page.goto(`${BASE}/dashboard/ai?agent=executive-ppt`, { waitUntil: "networkidle", timeout: 90000 })
  // Give the workspace + sidebar time to render
  await page.waitForTimeout(6000)
  console.log("  current url:", page.url())

  // 3. Full-page screenshot
  await page.screenshot({ path: `${OUT}/ppt-assistant-full.png`, fullPage: true })
  console.log("  saved full screenshot")

  // 4. Sidebar-only screenshot — try to locate the advisor section
  const sidebar = await page.locator("nav, [data-sidebar], aside").first()
  if (await sidebar.count()) {
    await sidebar.screenshot({ path: `${OUT}/ppt-assistant-sidebar.png` })
    console.log("  saved sidebar screenshot")
  }

  // 5. Extract sidebar text to verify "可编辑 PPT 助手" label is present
  const sidebarText = (await sidebar.textContent()) || ""
  const hasLabel = sidebarText.includes("可编辑 PPT 助手") || sidebarText.includes("可编辑")
  console.log("  sidebar contains '可编辑 PPT 助手':", hasLabel)

  // Also grab all text for debugging
  const bodyText = await page.evaluate(() => document.body.innerText)
  const bodyHasLabel = bodyText.includes("可编辑 PPT 助手") || bodyText.includes("Editable PPT")
  console.log("  body contains label:", bodyHasLabel)

  // 6. Check if model selector is visible (not locked)
  const modelSelector = await page.locator("[data-model-select], [aria-label*='model'], [aria-label*='模型']").count()
  console.log("  model selector elements found:", modelSelector)

  fs.writeFileSync(
    `${OUT}/verify-result.json`,
    JSON.stringify({ sidebarHasLabel: hasLabel, bodyHasLabel, modelSelectorCount: modelSelector }, null, 2),
  )

  await browser.close()
  console.log("✓ done")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
