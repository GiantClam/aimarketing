import assert from "node:assert/strict"
import test from "node:test"

import {
  buildWorkflowFromTemplate,
  getWorkflowTemplatePresentation,
  resolveWorkflowTemplateDefinitionKey,
} from "@/lib/workflows/template-definitions"

test("template key resolution supports workflow slug and binding target", () => {
  assert.equal(resolveWorkflowTemplateDefinitionKey({ slug: "campaign-launch" }), "campaign-launch")
  assert.equal(resolveWorkflowTemplateDefinitionKey({ bindingTarget: "content-repurpose" }), "content-repurpose")
  assert.equal(resolveWorkflowTemplateDefinitionKey({ slug: "lead-to-outreach" }), "lead-to-outreach")
  assert.equal(resolveWorkflowTemplateDefinitionKey({ slug: "sales-proposal" }), "sales-proposal")
  assert.equal(resolveWorkflowTemplateDefinitionKey({ slug: "unknown-template" }), null)
})

test("template presentation exposes localized inputs steps and outputs", () => {
  const presentation = getWorkflowTemplatePresentation({
    locale: "zh",
    slug: "content-repurpose",
  })

  assert.ok(presentation)
  assert.equal(presentation?.inputFields[0]?.label, "源内容资产")
  assert.equal(presentation?.outputs.includes("分发计划"), true)
  assert.equal(presentation?.steps.includes("SEO 复用智能体"), true)
})

test("template graph builder returns lead-to-outreach workflow blueprint", () => {
  const blueprint = buildWorkflowFromTemplate({
    key: "lead-to-outreach",
    locale: "en",
  })

  assert.equal(blueprint.title, "Lead-to-Outreach")
  assert.equal(blueprint.nodes.some((node) => node.type === "agent_execute" && node.config.agentId === "business-outreach-planner"), true)
  assert.equal(blueprint.edges.some((edge) => edge.sourceNodeKey === "outreach-agent" && edge.targetNodeKey === "sales-agent"), true)
  assert.equal(blueprint.metadata?.templateKey, "lead-to-outreach")
})

test("seo-aeo template exposes explicit knowledge and search steps", () => {
  const presentation = getWorkflowTemplatePresentation({
    locale: "en",
    slug: "seo-aeo-growth-engine",
  })

  assert.ok(presentation)
  assert.equal(presentation?.steps.includes("Knowledge Retrieve"), true)
  assert.equal(presentation?.steps.includes("AI Citation Strategist Agent"), true)
  assert.equal(presentation?.outputs.includes("Citation readiness plan"), true)
})

test("knowledge-asset-loop blueprint wires asset retention into knowledge write", () => {
  const blueprint = buildWorkflowFromTemplate({
    key: "knowledge-asset-loop",
    locale: "zh",
  })

  assert.equal(blueprint.nodes.some((node) => node.type === "knowledge_write"), true)
  assert.equal(blueprint.nodes.some((node) => node.type === "product_store"), true)
  assert.equal(
    blueprint.edges.some((edge) => edge.sourceNodeKey === "curator-agent" && edge.targetNodeKey === "knowledge-write"),
    true,
  )
})
