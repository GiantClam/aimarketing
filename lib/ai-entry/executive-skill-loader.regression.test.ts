import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}

test("default executive diagnostic loads compact runtime brief", async () => {
  const { loadExecutiveSkillForAgent } = await import("./executive-skill-loader")

  const content = await loadExecutiveSkillForAgent("executive-diagnostic")

  assert.match(content, /Executive Diagnostic Runtime Brief/)
  assert.match(content, /Use enterprise knowledge first/)
  assert.ok(
    content.length < 6_000,
    `expected compact default diagnostic prompt, received ${content.length} chars`,
  )
})

test("brand and growth executive skills load from the self-hosted consulting suite", async () => {
  const { loadExecutiveSkillForAgent } = await import("./executive-skill-loader")

  const brandContent = await loadExecutiveSkillForAgent("executive-brand")
  const growthContent = await loadExecutiveSkillForAgent("executive-growth")

  assert.match(brandContent, /executive-level diagnosis of brand positioning/)
  assert.match(brandContent, /diagnostic thinking style/)
  assert.match(growthContent, /executive-level diagnosis of growth logic/)
  assert.match(growthContent, /diagnostic thinking style/)
})

test("business agent prompt documents are loadable through the shared agent loader", async () => {
  const { loadExecutiveSkillForAgent } = await import("./executive-skill-loader")

  const content = await loadExecutiveSkillForAgent("business-sales-close")
  const complianceContent = await loadExecutiveSkillForAgent("business-compliance-auditor")
  const legalContent = await loadExecutiveSkillForAgent("business-legal-document-review")
  const importedContent = await loadExecutiveSkillForAgent("agency-sales-deal-strategist")

  assert.match(content, /Sales Close Agent/)
  assert.match(content, /MEDDPICC/)
  assert.match(content, /Expected outputs/)
  assert.match(complianceContent, /Compliance Auditor Agent/)
  assert.match(complianceContent, /audit-readiness checklist/)
  assert.match(legalContent, /Legal Document Review Agent/)
  assert.match(legalContent, /not a substitute for counsel/)
  assert.match(importedContent, /Deal Strategist Agent/)
  assert.match(importedContent, /MEDDPICC/)
  assert.match(importedContent, /Forecast Accuracy/)
})

test("ppt assistant skill documents are loadable through the shared agent loader", async () => {
  const { isExecutiveConsultingAgent, loadExecutiveSkillForAgent } = await import("./executive-skill-loader")

  const content = await loadExecutiveSkillForAgent("executive-ppt")

  assert.equal(isExecutiveConsultingAgent("executive-ppt"), true)
  assert.match(content, /PPT Generation Advisor/)
  assert.match(content, /web_search/)
  assert.match(content, /preview_ppt_deck/)
  assert.match(content, /export_ppt_deck/)
})
