import assert from "node:assert/strict"
import test from "node:test"

import type { SharedSkillSetSelection } from "@/lib/ai-runtime/contracts"
import { buildSharedSkillSetBundle, validateSharedSkillSetBundle } from "./shared-agent-skill-bundle"
import { normalizeQuotedEnvValue, normalizeR2Endpoint, upsertSharedSkillSetBundle } from "./shared-agent-skill-bundle-store"

const selection: SharedSkillSetSelection = {
  runtimeKind: "shared-agent",
  agentId: "business-content-growth",
  skills: [
    { id: "executive-consulting", position: 0 },
    { id: "longform-writing", position: 1 },
  ],
  skillSetId: "skills",
  bundleKey: "shared-agent-skillsets/enterprise-1/business-content-growth/skills.json",
}

test("compiles independent, checked text Skill directories into one canonical bundle", async () => {
  const bundle = await buildSharedSkillSetBundle({ selection, agentInstructions: "---\ntools: [bash]\n---\nUse the governed platform instructions." })
  assert.equal(bundle.agent.instructions, "Use the governed platform instructions.")
  assert.deepEqual(bundle.skills.map((skill) => skill.id), ["executive-consulting", "longform-writing"])
  assert.equal(bundle.skills.every((skill) => skill.files.some((file) => file.path === "SKILL.md")), true)
  assert.equal(validateSharedSkillSetBundle(bundle), true)
  assert.equal(validateSharedSkillSetBundle({ ...bundle, checksum: "tampered" }), false)
})

test("only writes when the current same-name bundle content changed", async () => {
  const values = new Map<string, string>()
  let writes = 0
  const store = {
    async readChecksum(key: string) { return values.get(key) || null },
    async put(key: string, bundle: { checksum: string }) { writes += 1; values.set(key, bundle.checksum) },
  }
  const first = await upsertSharedSkillSetBundle({ selection, agentInstructions: "A", store })
  const second = await upsertSharedSkillSetBundle({ selection, agentInstructions: "A", store })
  const changed = await upsertSharedSkillSetBundle({ selection, agentInstructions: "B", store })
  assert.equal(first.written, true)
  assert.equal(second.written, false)
  assert.equal(changed.written, true)
  assert.equal(writes, 2)
})

test("normalizes shell-style quotes from deployed R2 environment values", () => {
  assert.equal(normalizeQuotedEnvValue('"9630806d5a588fc350ee64c395005cfa"'), "9630806d5a588fc350ee64c395005cfa")
  assert.equal(normalizeQuotedEnvValue("'aimarketing-shared-agent-runtime'"), "aimarketing-shared-agent-runtime")
  assert.equal(normalizeQuotedEnvValue(" https://example.r2.cloudflarestorage.com "), "https://example.r2.cloudflarestorage.com")
  assert.equal(normalizeR2Endpoint('https://bucket."9630806d5a588fc350ee64c395005cfa".r2.cloudflarestorage.com'), "https://bucket.9630806d5a588fc350ee64c395005cfa.r2.cloudflarestorage.com")
})
