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
  const contentGrowthStrategistContent = await loadExecutiveSkillForAgent("business-content-growth-strategist")
  const seoRepurposeContent = await loadExecutiveSkillForAgent("business-seo-repurpose")
  const brandCreativeContent = await loadExecutiveSkillForAgent("business-brand-creative")
  const campaignCreativeContent = await loadExecutiveSkillForAgent("business-campaign-creative")
  const videoCreativeContent = await loadExecutiveSkillForAgent("business-video-creative")
  const ppcContent = await loadExecutiveSkillForAgent("business-ppc-strategist")
  const paidSocialContent = await loadExecutiveSkillForAgent("business-paid-social-strategist")
  const adCreativeContent = await loadExecutiveSkillForAgent("business-ad-creative-strategist")
  const paidMediaAuditContent = await loadExecutiveSkillForAgent("business-paid-media-auditor")
  const trackingContent = await loadExecutiveSkillForAgent("business-tracking-analytics-specialist")
  const pricingContent = await loadExecutiveSkillForAgent("business-pricing-analyst")
  const leadConversionContent = await loadExecutiveSkillForAgent("business-lead-conversion")
  const objectionHandlerContent = await loadExecutiveSkillForAgent("business-objection-handler")
  const proposalContent = await loadExecutiveSkillForAgent("business-proposal-strategist")
  const uiDesignSystemContent = await loadExecutiveSkillForAgent("business-ui-design-system")
  const privacyContent = await loadExecutiveSkillForAgent("business-privacy-officer")

  assert.match(content, /Deal Strategist Agent/)
  assert.match(content, /MEDDPICC/)
  assert.match(content, /Forecast Accuracy/)
  assert.match(complianceContent, /Compliance Auditor Agent/)
  assert.match(complianceContent, /SOC 2/)
  assert.match(legalContent, /Legal Document Review Agent/)
  assert.match(legalContent, /never provide legal advice/)
  assert.match(importedContent, /Deal Strategist Agent/)
  assert.match(importedContent, /MEDDPICC/)
  assert.match(importedContent, /Forecast Accuracy/)
  assert.match(contentGrowthStrategistContent, /Marketing Content Creator Agent/)
  assert.match(contentGrowthStrategistContent, /Editorial calendars/)
  assert.match(seoRepurposeContent, /Cannibalization Prevention/)
  assert.match(seoRepurposeContent, /Core Web Vitals/)
  assert.match(brandCreativeContent, /Brand Guardian Agent Personality/)
  assert.match(brandCreativeContent, /cohesive brand identities/)
  assert.match(campaignCreativeContent, /Social Media Strategist Agent/)
  assert.match(campaignCreativeContent, /Growth Hacker/)
  assert.match(campaignCreativeContent, /Paid Media Ad Creative Strategist Agent/)
  assert.match(videoCreativeContent, /Video Optimization Specialist/)
  assert.match(videoCreativeContent, /Short-Video Editing Coach/)
  assert.match(videoCreativeContent, /Meta Creative Strategy/)
  assert.match(ppcContent, /PPC Campaign Strategist/)
  assert.match(ppcContent, /Performance Max/)
  assert.match(paidSocialContent, /Paid Social Strategist/)
  assert.match(paidSocialContent, /Conversions API/)
  assert.match(adCreativeContent, /Ad Creative Strategist/)
  assert.match(adCreativeContent, /RSA Architecture/)
  assert.match(paidMediaAuditContent, /Paid Media Auditor Agent/)
  assert.match(paidMediaAuditContent, /200\+ point audit checklist/)
  assert.match(trackingContent, /Tracking & Measurement Specialist/)
  assert.match(trackingContent, /Consent mode v2/)
  assert.match(pricingContent, /Pricing Analyst Agent/)
  assert.match(pricingContent, /sensitivity analysis/)
  assert.match(leadConversionContent, /Offer & Lead Gen Strategist/)
  assert.match(leadConversionContent, /Email Marketing Strategist/)
  assert.match(leadConversionContent, /Outbound Strategist Agent/)
  assert.match(objectionHandlerContent, /Discovery Coach Agent/)
  assert.match(objectionHandlerContent, /Deal Strategist Agent/)
  assert.match(objectionHandlerContent, /Sales Coach Agent/)
  assert.match(proposalContent, /Proposal Strategist Agent/)
  assert.match(proposalContent, /Win Theme Development/)
  assert.match(uiDesignSystemContent, /UI Designer Agent Personality/)
  assert.match(uiDesignSystemContent, /WCAG AA minimum/)
  assert.match(privacyContent, /Data Privacy Officer/)
  assert.match(privacyContent, /72-hour breach notification rule/)
})

test("ppt assistant skill documents are loadable through the shared agent loader", async () => {
  const { isExecutiveConsultingAgent, loadExecutiveSkillForAgent } = await import("./executive-skill-loader")

  const content = await loadExecutiveSkillForAgent("executive-ppt")
  const presentationContent = await loadExecutiveSkillForAgent("executive-presentation-ppt")

  assert.equal(isExecutiveConsultingAgent("executive-ppt"), true)
  assert.equal(isExecutiveConsultingAgent("executive-presentation-ppt"), true)
  assert.match(content, /PPT Generation Advisor/)
  assert.match(content, /web_search/)
  assert.match(content, /preview_ppt_deck/)
  assert.match(content, /export_ppt_deck/)
  assert.match(content, /recommended brief draft/i)
  assert.match(content, /Do not call `preview_ppt_deck` or `export_ppt_deck` at the beginning/i)
  assert.match(content, /Do not ask the user to confirm the same export twice/i)
  assert.match(presentationContent, /Presentation PPT Advisor/)
  assert.match(presentationContent, /presentation-first/)
  assert.match(presentationContent, /preview_ppt_deck/)
  assert.match(presentationContent, /export_ppt_deck/)
  assert.match(presentationContent, /recommended brief draft/i)
  assert.match(presentationContent, /Do not call `preview_ppt_deck` or `export_ppt_deck` at the beginning/i)
  assert.match(presentationContent, /Do not ask the user to confirm the same export twice/i)
})
