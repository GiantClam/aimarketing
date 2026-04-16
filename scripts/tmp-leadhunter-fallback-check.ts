import "./load-env"
import { createRequire } from "node:module"
const bootstrapRequire = createRequire(import.meta.url)
bootstrapRequire("./register-server-only-shim.cjs")

process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES = "1"
process.env.LEAD_HUNTER_PAGE_EXTRACTION_LIMIT = "0"
process.env.LEAD_HUNTER_REPORT_TIMEOUT_MS = "20000"
process.env.LEAD_HUNTER_REPORT_PROVIDER_TIMEOUT_MS = "15000"

import { runLeadHunterSkillConversation } from "../lib/lead-hunter/skill-engine"

async function main() {
  const result = await runLeadHunterSkillConversation({
    advisorType: "company-search",
    query: "SWAG GOLF https://swag.golf/",
    preferredLanguage: "zh",
    conversationId: `manual-${Date.now()}-fallback-check`,
  })
  console.log("language:", result.language)
  console.log("preview:", result.answer.slice(0, 220).replace(/\n/g, " "))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
