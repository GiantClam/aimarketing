import "./load-env"
import { createRequire } from "node:module"

const bootstrapRequire = createRequire(import.meta.url)
bootstrapRequire("./register-server-only-shim.cjs")

process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES = "1"
process.env.LEAD_HUNTER_PAGE_EXTRACTION_LIMIT = "0"
process.env.LEAD_HUNTER_REPORT_TIMEOUT_MS = "25000"
process.env.LEAD_HUNTER_REPORT_PROVIDER_TIMEOUT_MS = "18000"

delete process.env.SERPER_API_KEY
delete process.env.TAVILY_API_KEY

import { runLeadHunterSkillConversation } from "../lib/lead-hunter/skill-engine"

async function main() {
  const started = Date.now()
  const result = await runLeadHunterSkillConversation({
    advisorType: "company-search",
    query: "SWAG GOLF https://swag.golf/",
    preferredLanguage: "zh",
    conversationId: `manual-${Date.now()}-fast-retest`,
  })
  const duration = Date.now() - started

  console.log("duration_ms:", duration)
  console.log("language:", result.language)
  console.log("evidence_count:", result.evidence.length)
  console.log("answer_head:", result.answer.slice(0, 160).replace(/\n/g, " "))
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
