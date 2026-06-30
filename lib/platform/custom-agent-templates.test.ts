import assert from "node:assert/strict"
import test from "node:test"

import { listCustomAgentTemplates } from "@/lib/platform/custom-agent-templates"

test("custom agent templates expose the documented starter set", () => {
  const templates = listCustomAgentTemplates("zh")
  assert.deepEqual(
    templates.map((item) => item.slug),
    ["expert-advisor", "content-growth", "sales-close", "compliance-review", "brand-creative"],
  )
  assert.equal(templates.every((item) => item.businessSlugs.length > 0), true)
})

test("custom agent templates localize names per locale", () => {
  const zh = listCustomAgentTemplates("zh")
  const en = listCustomAgentTemplates("en")
  assert.equal(zh[0]?.name, "专家顾问模板")
  assert.equal(en[0]?.name, "Expert advisor template")
})
