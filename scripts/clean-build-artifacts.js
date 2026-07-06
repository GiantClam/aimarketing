const fs = require("fs")
const path = require("path")

const root = process.cwd()

function resolveDistDir() {
  if (process.env.NEXT_DIST_DIR) {
    return process.env.NEXT_DIST_DIR
  }

  const isVercelBuild =
    process.env.VERCEL === "1" || process.env.VERCEL === "true"

  if (isVercelBuild) {
    return ".next"
  }

  return process.env.NODE_ENV === "production" ? ".next-build" : ".next"
}

const targets = [
  ".next",
  ".next-build",
  resolveDistDir(),
  "tsconfig.tsbuildinfo",
]

const seen = new Set()

for (const target of targets) {
  if (seen.has(target)) {
    continue
  }
  seen.add(target)

  const targetPath = path.join(root, target)
  if (!fs.existsSync(targetPath)) {
    continue
  }

  fs.rmSync(targetPath, { force: true, recursive: true })
  console.log(`removed ${target}`)
}
