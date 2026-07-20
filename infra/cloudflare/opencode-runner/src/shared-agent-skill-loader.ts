import type { SharedSkillSetSelection } from "../../../../lib/ai-runtime/contracts"

const MAX_BUNDLE_BYTES = 512 * 1024
const SAFE_SKILL_ID = /^[a-zA-Z0-9_-]{1,128}$/
const SAFE_SKILL_SET_ID = /^[a-f0-9]{40}$/
const SAFE_FILE_PATH = /^(?:SKILL\.md|references\/[a-zA-Z0-9._/-]+\.(?:md|markdown|json|ya?ml))$/u

type BundleFile = { path: string; content: string }
type SharedBundle = {
  schemaVersion: 1
  agent: { id: string; instructions: string }
  skills: Array<{ id: string; position: number; files: BundleFile[] }>
  checksum: string
}

export type SharedSkillBundleBucket = {
  get(key: string): Promise<{ text(): Promise<string> } | null>
}

export type SharedSkillSandbox = {
  exec(command: string, options?: Record<string, unknown>): Promise<{ success?: boolean; stderr?: string }>
  mkdir(path: string, options?: { recursive?: boolean }): Promise<unknown>
  writeFile(path: string, content: string): Promise<unknown>
}

function shell(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function bytes(value: string) {
  return new TextEncoder().encode(value).byteLength
}

function validSelection(selection: SharedSkillSetSelection) {
  if (selection.runtimeKind !== "shared-agent" || !selection.agentId || !SAFE_SKILL_SET_ID.test(selection.skillSetId)) return false
  if (!Array.isArray(selection.skills) || selection.skills.length === 0) return false
  const ids = new Set<string>()
  return selection.skills.every((skill, index) => {
    if (!SAFE_SKILL_ID.test(skill.id) || skill.position !== index || ids.has(skill.id)) return false
    ids.add(skill.id)
    return true
  })
}

async function checksum(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("")
}

function isSharedAgentId(value: string) {
  return value.startsWith("agency-") || value.startsWith("business-") || /^custom-agent:[1-9][0-9]*$/u.test(value)
}

/** Repeat the control-plane key derivation before a Worker reads R2. */
async function isCanonicalSelection(selection: SharedSkillSetSelection, enterpriseId: number | null) {
  if (!validSelection(selection) || !isSharedAgentId(selection.agentId)) return false
  const expectedSkillSetId = (await checksum(JSON.stringify(selection.skills.map((skill) => skill.id).sort()))).slice(0, 40)
  if (selection.skillSetId !== expectedSkillSetId) return false
  const enterpriseScope = typeof enterpriseId === "number" && enterpriseId > 0 ? `enterprise-${enterpriseId}` : "global"
  const safeAgentId = selection.agentId.replace(/[^a-zA-Z0-9:_-]/g, "-")
  return selection.bundleKey === `shared-agent-skillsets/${enterpriseScope}/${safeAgentId}/${selection.skillSetId}.json`
}

async function parseBundle(value: string, selection: SharedSkillSetSelection): Promise<SharedBundle> {
  if (bytes(value) > MAX_BUNDLE_BYTES) throw new Error("shared_skill_bundle_too_large")
  let bundle: SharedBundle
  try {
    bundle = JSON.parse(value) as SharedBundle
  } catch {
    throw new Error("shared_skill_bundle_invalid_json")
  }
  if (bundle.schemaVersion !== 1 || !bundle.agent || bundle.agent.id !== selection.agentId || typeof bundle.agent.instructions !== "string" || !Array.isArray(bundle.skills) || typeof bundle.checksum !== "string") {
    throw new Error("shared_skill_bundle_invalid")
  }
  const source = JSON.stringify({ schemaVersion: bundle.schemaVersion, agent: bundle.agent, skills: bundle.skills })
  if (await checksum(source) !== bundle.checksum) throw new Error("shared_skill_bundle_checksum_invalid")
  if (bundle.skills.length !== selection.skills.length) throw new Error("shared_skill_bundle_selection_mismatch")
  for (const [index, skill] of bundle.skills.entries()) {
    const expected = selection.skills[index]
    if (!expected || skill.id !== expected.id || skill.position !== expected.position || !SAFE_SKILL_ID.test(skill.id) || !Array.isArray(skill.files) || skill.files.length === 0) {
      throw new Error("shared_skill_bundle_selection_mismatch")
    }
    const paths = new Set<string>()
    for (const file of skill.files) {
      if (!file || typeof file.path !== "string" || typeof file.content !== "string" || !SAFE_FILE_PATH.test(file.path) || file.path.includes("../") || file.path.startsWith("/") || paths.has(file.path)) {
        throw new Error("shared_skill_bundle_file_invalid")
      }
      paths.add(file.path)
      if (bytes(file.content) > MAX_BUNDLE_BYTES || file.content.includes("\u0000")) throw new Error("shared_skill_bundle_file_invalid")
    }
    if (!paths.has("SKILL.md")) throw new Error("shared_skill_bundle_entry_missing")
  }
  return bundle
}

async function command(sandbox: SharedSkillSandbox, value: string, code: string) {
  const result = await sandbox.exec(value)
  if (result.success === false) throw new Error(result.stderr || code)
}

export async function ensureSharedSkillSet(input: {
  sandbox: SharedSkillSandbox
  bucket: SharedSkillBundleBucket
  sessionDir: string
  selection: SharedSkillSetSelection
  enterpriseId: number | null
}) {
  const { sandbox, bucket, sessionDir, selection } = input
  if (!await isCanonicalSelection(selection, input.enterpriseId)) throw new Error("shared_skill_selection_invalid")
  const cacheRoot = `${sessionDir}/.platform/shared-skill-cache/${selection.skillSetId}`
  const activePath = `${sessionDir}/.platform/shared-skill-active-id`
  const active = await sandbox.exec(`test -f ${shell(activePath)} && test "$(cat ${shell(activePath)})" = ${shell(selection.skillSetId)}`)
  if (active.success !== false) return { cacheHit: true, r2Read: false }

  const readyPath = `${cacheRoot}/ready.json`
  const cached = await sandbox.exec(`test -f ${shell(readyPath)}`)
  let r2Read = false
  if (cached.success === false) {
    const object = await bucket.get(selection.bundleKey)
    if (!object) throw new Error("shared_skill_bundle_not_found")
    r2Read = true
    const bundle = await parseBundle(await object.text(), selection)
    const staging = `${cacheRoot}.staging`
    await command(sandbox, `rm -rf ${shell(staging)} && mkdir -p ${shell(`${staging}/skills`)} ${shell(`${staging}/agent`)}`, "shared_skill_staging_prepare_failed")
    for (const skill of bundle.skills) {
      for (const file of skill.files) {
        const target = `${staging}/skills/${skill.id}/${file.path}`
        const parent = target.slice(0, target.lastIndexOf("/"))
        await sandbox.mkdir(parent, { recursive: true })
        await sandbox.writeFile(target, file.content)
      }
    }
    await sandbox.writeFile(`${staging}/agent/shared-agent.md`, [
      `# ${bundle.agent.id}`,
      bundle.agent.instructions.trim(),
      "",
      "## Available Skills",
      ...bundle.skills.map((skill) => `- ${skill.id}`),
    ].filter(Boolean).join("\n"))
    await sandbox.writeFile(`${staging}/ready.json`, JSON.stringify({ schemaVersion: 1, skillSetId: selection.skillSetId, checksum: bundle.checksum }))
    await command(sandbox, `rm -rf ${shell(cacheRoot)} && mv ${shell(staging)} ${shell(cacheRoot)}`, "shared_skill_cache_publish_failed")
  }

  await command(sandbox, [
    `rm -rf ${shell(`${sessionDir}/.opencode/skills`)}`,
    `rm -rf ${shell(`${sessionDir}/.opencode/agents`)}`,
    `mkdir -p ${shell(`${sessionDir}/.opencode/skills`)} ${shell(`${sessionDir}/.opencode/agents`)}`,
    `cp -R ${shell(`${cacheRoot}/skills/.`)} ${shell(`${sessionDir}/.opencode/skills/`)}`,
    `cp -R ${shell(`${cacheRoot}/agent/.`)} ${shell(`${sessionDir}/.opencode/agents/`)}`,
    `printf %s ${shell(selection.skillSetId)} > ${shell(activePath)}`,
  ].join(" && "), "shared_skill_activate_failed")
  return { cacheHit: !r2Read, r2Read }
}
