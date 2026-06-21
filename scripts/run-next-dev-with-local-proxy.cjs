const { spawn } = require("node:child_process")
const path = require("node:path")

const nextBin = require.resolve("next/dist/bin/next")
const bootstrapPath = path.join(__dirname, "register-local-dev-proxy.cjs")
const child = spawn(process.execPath, ["--require", bootstrapPath, nextBin, "dev", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
