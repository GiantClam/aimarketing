require("./load-env")

async function runStep(label, command) {
  const { spawnSync } = require("node:child_process")
  const result = spawnSync(process.execPath, [command], {
    stdio: "inherit",
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

async function main() {
  await runStep("enterprise migration", "scripts/run-enterprise-migration.js")
  await runStep("enterprise dify migration", "scripts/run-enterprise-dify-migration.js")
  await runStep("writer migration", "scripts/run-writer-migration.js")
  await runStep("image assistant migration", "scripts/run-image-assistant-migration.js")
  console.log("All database migrations completed successfully")
}

main().catch((error) => {
  console.error("All database migrations failed:", error)
  process.exit(1)
})
