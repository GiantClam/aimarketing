const fs = require("node:fs")
const path = require("node:path")

const SKILLS_ROOT = path.join(process.cwd(), "content", "skills")
const MARKDOWN_EXT = ".md"
const CJK_PATTERN = /[\p{Script=Han}]/u
const REPLACEMENT_CHAR = "\uFFFD"
const UTF8_BOM = "\uFEFF"

function collectMarkdownFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  const files = []

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath))
      continue
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(MARKDOWN_EXT)) {
      files.push(fullPath)
    }
  }

  return files
}

function findLineNumbers(content, pattern) {
  const lines = content.split(/\r?\n/)
  const matches = []
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) {
      matches.push({ line: i + 1, sample: lines[i].trim().slice(0, 120) })
    }
  }
  return matches
}

function main() {
  if (!fs.existsSync(SKILLS_ROOT)) {
    console.error(`skills directory not found: ${SKILLS_ROOT}`)
    process.exit(1)
  }

  const files = collectMarkdownFiles(SKILLS_ROOT)
  const issues = []

  for (const file of files) {
    const buffer = fs.readFileSync(file)
    const content = buffer.toString("utf8")
    const relative = path.relative(process.cwd(), file).replace(/\\/g, "/")

    if (content.startsWith(UTF8_BOM)) {
      issues.push(`${relative}: starts with UTF-8 BOM (use UTF-8 without BOM)`)
    }

    if (content.includes(REPLACEMENT_CHAR)) {
      issues.push(`${relative}: contains replacement char (possible broken encoding)`)
    }

    const cjkMatches = findLineNumbers(content, CJK_PATTERN)
    for (const match of cjkMatches) {
      issues.push(`${relative}:${match.line}: contains non-English Han character: "${match.sample}"`)
    }
  }

  if (issues.length > 0) {
    console.error("Skill file validation failed:")
    for (const issue of issues) {
      console.error(`- ${issue}`)
    }
    process.exit(1)
  }

  console.log(`Skill file validation passed (${files.length} files checked).`)
}

main()
