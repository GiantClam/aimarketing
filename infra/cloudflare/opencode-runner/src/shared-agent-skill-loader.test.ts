import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import test from "node:test"

import type { SharedSkillSetSelection } from "../../../../lib/ai-runtime/contracts"
import { ensureSharedSkillSet } from "./shared-agent-skill-loader"

function selection(skillIds: string[]): SharedSkillSetSelection {
  const skillSetId = createHash("sha256").update(JSON.stringify([...skillIds].sort())).digest("hex").slice(0, 40)
  return {
    runtimeKind: "shared-agent",
    agentId: "business-content-growth",
    skills: skillIds.map((id, position) => ({ id, position })),
    skillSetId,
    bundleKey: `shared-agent-skillsets/enterprise-1/business-content-growth/${skillSetId}.json`,
  }
}

function bundle(value: SharedSkillSetSelection) {
  const source = {
    schemaVersion: 1 as const,
    agent: { id: value.agentId, instructions: "Follow the governed agent instructions." },
    skills: value.skills.map((skill) => ({ id: skill.id, position: skill.position, files: [{ path: "SKILL.md", content: `# ${skill.id}\nUse evidence.` }] })),
  }
  return JSON.stringify({ ...source, checksum: createHash("sha256").update(JSON.stringify(source)).digest("hex") })
}

test("reads R2 once, then serves active and cached SkillSets without another read", async () => {
  const activeIds = new Set<string>()
  const cachedIds = new Set<string>()
  const writes: string[] = []
  let r2Reads = 0
  const sandbox = {
    async exec(command: string) {
      if (command.startsWith("test -f") && command.includes("shared-skill-active-id")) {
        const requested = command.match(/= '([a-f0-9]{40})'/u)?.[1]
        return { success: Boolean(requested && activeIds.has(requested)) }
      }
      if (command.startsWith("test -f") && command.includes("ready.json")) {
        const requested = command.match(/\/([a-f0-9]{40})\/ready\.json/u)?.[1]
        return { success: Boolean(requested && cachedIds.has(requested)) }
      }
      const published = command.match(/mv '[^']+\.staging' '[^']+\/([a-f0-9]{40})'/u)
      if (published) cachedIds.add(published[1])
      const activated = command.match(/printf %s '([a-f0-9]{40})'/u)
      if (activated) activeIds.clear(), activeIds.add(activated[1])
      return { success: true }
    },
    async mkdir() {},
    async writeFile(path: string) { writes.push(path) },
  }
  const first = selection(["executive-consulting"])
  const second = selection(["longform-writing"])
  const bucket = {
    async get(key: string) {
      r2Reads += 1
      return { async text() { return key.includes(second.skillSetId) ? bundle(second) : bundle(first) } }
    },
  }

  assert.deepEqual(await ensureSharedSkillSet({ sandbox, bucket, sessionDir: "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", selection: first, enterpriseId: 1 }), { cacheHit: false, r2Read: true })
  assert.deepEqual(await ensureSharedSkillSet({ sandbox, bucket, sessionDir: "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", selection: first, enterpriseId: 1 }), { cacheHit: true, r2Read: false })
  assert.deepEqual(await ensureSharedSkillSet({ sandbox, bucket, sessionDir: "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", selection: second, enterpriseId: 1 }), { cacheHit: false, r2Read: true })
  assert.equal(r2Reads, 2)
  assert.equal(writes.some((path) => path.endsWith("/skills/executive-consulting/SKILL.md")), true)
})

test("rejects a bundle whose checksum does not match its contents", async () => {
  const value = selection(["executive-consulting"])
  const sandbox = { async exec() { return { success: false } }, async mkdir() {}, async writeFile() {} }
  const bucket = { async get() { return { async text() { return JSON.stringify({ schemaVersion: 1, agent: { id: value.agentId, instructions: "x" }, skills: [], checksum: "bad" }) } } } }
  await assert.rejects(() => ensureSharedSkillSet({ sandbox, bucket, sessionDir: "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", selection: value, enterpriseId: 1 }), /shared_skill_bundle_(invalid|checksum_invalid)/)
})

test("rejects cross-enterprise keys and duplicate Skill IDs before reading R2", async () => {
  const value = selection(["executive-consulting"])
  const sandbox = { async exec() { return { success: false } }, async mkdir() {}, async writeFile() {} }
  let reads = 0
  const bucket = { async get() { reads += 1; return null } }
  await assert.rejects(() => ensureSharedSkillSet({ sandbox, bucket, sessionDir: "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", selection: value, enterpriseId: 2 }), /shared_skill_selection_invalid/)
  await assert.rejects(() => ensureSharedSkillSet({ sandbox, bucket, sessionDir: "/workspace/sessions/sess-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", selection: { ...value, skills: [value.skills[0], { ...value.skills[0], position: 1 }] }, enterpriseId: 1 }), /shared_skill_selection_invalid/)
  assert.equal(reads, 0)
})
