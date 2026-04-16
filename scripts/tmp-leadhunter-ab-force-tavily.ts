import "./load-env"
import { createRequire } from "node:module"

const bootstrapRequire = createRequire(import.meta.url)
bootstrapRequire("./register-server-only-shim.cjs")

process.env.LEAD_HUNTER_MAX_SEARCH_QUERIES = "3"
process.env.LEAD_HUNTER_PAGE_EXTRACTION_LIMIT = "2"
process.env.LEAD_HUNTER_SERPER_RESULT_NUM = "4"
process.env.LEAD_HUNTER_SEARCH_EARLY_STOP_SIGNALS = "48"
process.env.LEAD_HUNTER_TAVILY_SUPPLEMENT_TRIGGER_SIGNALS = "48"
process.env.LEAD_HUNTER_TAVILY_SUPPLEMENT_MAX_QUERIES = "3"
process.env.LEAD_HUNTER_REPORT_TIMEOUT_MS = "25000"
process.env.LEAD_HUNTER_REPORT_PROVIDER_TIMEOUT_MS = "18000"

import { runLeadHunterSkillConversation } from "../lib/lead-hunter/skill-engine"

const query = "SWAG GOLF https://swag.golf/"

async function runCase(name: string, disableTavily: boolean) {
  const prev = process.env.TAVILY_API_KEY
  if (disableTavily) delete process.env.TAVILY_API_KEY

  const started = Date.now()
  const result = await runLeadHunterSkillConversation({
    advisorType: "company-search",
    query,
    preferredLanguage: "zh",
    conversationId: `manual-${Date.now()}-${name}`,
  })
  const duration = Date.now() - started

  const byProvider = result.evidence.reduce<Record<string, number>>((acc, item) => {
    const key = item.source_provider || "unknown"
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})

  console.log("\n=====", name, "=====")
  console.log("duration_ms:", duration)
  console.log("language:", result.language)
  console.log("evidence_count:", result.evidence.length)
  console.log("evidence_by_provider:", JSON.stringify(byProvider))

  if (disableTavily && prev) process.env.TAVILY_API_KEY = prev
}

async function main() {
  await runCase("with_tavily_forced", false)
  await runCase("without_tavily", true)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
