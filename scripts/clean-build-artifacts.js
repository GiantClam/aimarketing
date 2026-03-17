const fs = require("fs")
const path = require("path")

const root = process.cwd()
const targets = [
  ".next",
  ".next-image-assistant-e2e",
  "tsconfig.tsbuildinfo",
]

for (const target of targets) {
  const targetPath = path.join(root, target)
  if (!fs.existsSync(targetPath)) {
    continue
  }

  fs.rmSync(targetPath, { force: true, recursive: true })
  console.log(`removed ${target}`)
}
