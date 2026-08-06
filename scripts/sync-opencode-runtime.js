#!/usr/bin/env node

const fs = require("node:fs")
const path = require("node:path")

const repoRoot = path.resolve(__dirname, "..")
const sourceRoot = path.join(repoRoot, "content", "skills")
const runtimeRoot = path.join(repoRoot, "infra", "cloudflare", "opencode-runner", "runtime")
const skillRoot = path.join(runtimeRoot, "skills")
const agentRoot = path.join(runtimeRoot, "agents")
const toolSourceRoot = path.join(repoRoot, "content", "opencode-tools")
const toolRoot = path.join(runtimeRoot, "tools")

const agentColorMap = {
  teal: "#14B8A6",
  orange: "#F97316",
  green: "#22C55E",
  pink: "#EC4899",
  blue: "#3B82F6",
  indigo: "#6366F1",
  purple: "#A855F7",
  "neon-green": "#22C55E",
  cyan: "#06B6D4",
  navy: "#1E3A8A",
  "metallic-blue": "#2563EB",
  gold: "#EAB308",
  amber: "#F59E0B",
  red: "#EF4444",
}

function copyTree(source, target) {
  fs.rmSync(target, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true })
}

function normalizeAgentFrontmatter(filePath) {
  const source = fs.readFileSync(filePath, "utf8")
  const normalized = source
    .replace(/^(color:\s*)([^\r\n]+)$/m, (_, prefix, value) => {
      const color = value.trim().replace(/^['"]|['"]$/g, "")
      const hex = /^#[0-9a-fA-F]{6}$/.test(color) ? color : (agentColorMap[color.toLowerCase()] || "#64748B")
      return `${prefix}"${hex}"`
    })
    .replace(/^(tools:\s*)([^\r\n{][^\r\n]*)$/m, (_, prefix, value) => {
      const toolMap = { WebFetch: "webfetch", WebSearch: "websearch", Read: "read", Write: "write", Edit: "edit", Bash: "bash" }
      const tools = value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => toolMap[item] || item.toLowerCase())
      return `${prefix}{ ${tools.map((tool) => `${tool}: true`).join(", ")} }`
    })
  if (normalized !== source) fs.writeFileSync(filePath, normalized)
}

function normalizeAgentBundle() {
  const pending = [agentRoot]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(entryPath)
      else if (entry.isFile() && entry.name.endsWith(".md")) normalizeAgentFrontmatter(entryPath)
    }
  }
}

function listSkillIds() {
  return fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && fs.existsSync(path.join(sourceRoot, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort()
}

function listFiles(root, prefix = "") {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(prefix, entry.name)
    const absolute = path.join(root, entry.name)
    return entry.isDirectory() ? listFiles(absolute, relative) : [relative]
  })
}

function assertRuntimeInSync() {
  const mismatches = []
  const compareTree = (source, target, label) => {
    for (const relative of listFiles(source)) {
      const sourceFile = path.join(source, relative)
      const targetFile = path.join(target, relative)
      if (!fs.existsSync(targetFile) || Buffer.compare(fs.readFileSync(sourceFile), fs.readFileSync(targetFile)) !== 0) {
        mismatches.push(`${label}/${relative}`)
      }
    }
  }
  for (const skillId of listSkillIds()) {
    compareTree(path.join(sourceRoot, skillId), path.join(skillRoot, skillId), `skills/${skillId}`)
  }
  compareTree(toolSourceRoot, toolRoot, "tools")
  for (const file of ["writer-catalog.json"]) {
    const sourceFile = path.join(sourceRoot, file)
    const targetFile = path.join(runtimeRoot, file)
    if (!fs.existsSync(targetFile) || Buffer.compare(fs.readFileSync(sourceFile), fs.readFileSync(targetFile)) !== 0) {
      mismatches.push(file)
    }
  }
  if (mismatches.length) {
    console.error(`OpenCode runtime drift detected:\n${mismatches.map((item) => `- ${item}`).join("\n")}`)
    process.exitCode = 1
    return
  }
  console.log("OpenCode runtime is synchronized with canonical content/skills and tools")
}

function main() {
  if (process.argv.includes("--check")) {
    assertRuntimeInSync()
    return
  }
  fs.rmSync(runtimeRoot, { recursive: true, force: true })
  fs.mkdirSync(skillRoot, { recursive: true })
  fs.mkdirSync(agentRoot, { recursive: true })
  fs.mkdirSync(toolRoot, { recursive: true })

  const skillIds = listSkillIds()
  for (const id of skillIds) copyTree(path.join(sourceRoot, id), path.join(skillRoot, id))
  for (const id of ["agency-agents", "business-agents"]) {
    const source = path.join(sourceRoot, id)
    if (fs.existsSync(source)) copyTree(source, path.join(agentRoot, id))
  }
  normalizeAgentBundle()
  if (fs.existsSync(toolSourceRoot)) {
    for (const entry of fs.readdirSync(toolSourceRoot, { withFileTypes: true })) {
      if (entry.isFile() && /\.(?:ts|js)$/u.test(entry.name)) fs.copyFileSync(path.join(toolSourceRoot, entry.name), path.join(toolRoot, entry.name))
    }
  }
  const catalog = path.join(sourceRoot, "writer-catalog.json")
  if (fs.existsSync(catalog)) fs.copyFileSync(catalog, path.join(runtimeRoot, "writer-catalog.json"))

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    skills: skillIds,
    agentBundles: ["agency-agents", "business-agents"].filter((id) => fs.existsSync(path.join(agentRoot, id))),
    tools: fs.existsSync(toolRoot) ? fs.readdirSync(toolRoot).sort() : [],
  }
  fs.writeFileSync(path.join(runtimeRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`synced ${skillIds.length} OpenCode skills and ${manifest.agentBundles.length} agent bundles`)
}

main()
