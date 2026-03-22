const fs = require("fs")
const path = require("path")

const root = process.cwd()
const distDir = process.env.NEXT_DIST_DIR || ".next"
const targets = [
  distDir,
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
