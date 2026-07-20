import { getSandbox, type Sandbox as CloudflareSandbox } from "@cloudflare/sandbox"

export { Sandbox } from "@cloudflare/sandbox"

type Env = {
  Sandbox: DurableObjectNamespace<CloudflareSandbox>
  SMOKE_TOKEN: string
}

type OpenCodeModelConfig = {
  modelId: string
  baseUrl: string
  apiKey: string
}

// Bump this when the image changes so a retained Durable Object cannot reuse
// an older container filesystem for a new benchmark deck.
const SANDBOX_ID = "dashi-ppt-research-20260713"
const LEGACY_SANDBOX_ID = "dashi-ppt-smoke"
const SMOKE_DIR = "/workspace/dashi-smoke"
const PPTX_PATH = `${SMOKE_DIR}/dashi-cloudflare-smoke.pptx`
const BENCHMARK_DIR = "/workspace/dashi-benchmark-10"
const BENCHMARK_PPTX_PATH = `${BENCHMARK_DIR}/enterprise-ai-customer-service-evidence-10-pages.pptx`
const OPENCODE_CONFIG_PATH = `${BENCHMARK_DIR}/opencode-config.json`
const OPENCODE_KEY_PATH = `${BENCHMARK_DIR}/pptoken-api-key`
const OPENCODE_QA_SCRIPT_PATH = `${BENCHMARK_DIR}/opencode-qa.sh`

function authorized(request: Request, env: Env) {
  const token = env.SMOKE_TOKEN?.trim()
  return Boolean(token) && request.headers.get("authorization") === `Bearer ${token}`
}

function text(value: string | undefined) {
  return (value || "").replace(/[\u0000-\u001f\u007f]/g, " ").slice(-12_000)
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function nonEmptyString(value: unknown, maxLength: number) {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength ? value.trim() : null
}

async function modelConfigFrom(request: Request): Promise<OpenCodeModelConfig | null> {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return null
  }
  const input = body && typeof body === "object" ? (body as { opencode?: unknown }).opencode : null
  if (!input || typeof input !== "object") return null
  const fields = input as { modelId?: unknown; baseUrl?: unknown; apiKey?: unknown }
  const modelId = nonEmptyString(fields.modelId, 160)
  const baseUrl = nonEmptyString(fields.baseUrl, 1_024)
  const apiKey = nonEmptyString(fields.apiKey, 8_192)
  if (!modelId || !baseUrl || !/^[a-zA-Z0-9._-]+$/.test(modelId) || !apiKey) return null
  try {
    const url = new URL(baseUrl)
    if (url.protocol !== "https:" || !url.hostname || url.username || url.password) return null
  } catch {
    return null
  }
  return { modelId, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }
}

function opencodeConfig(model: OpenCodeModelConfig) {
  return JSON.stringify({
    permission: { read: "allow", edit: "deny", bash: "allow", websearch: "deny", task: "deny", skill: "deny" },
    provider: {
      pptoken: {
        npm: "@ai-sdk/openai-compatible",
        name: "PPToken",
        options: { baseURL: model.baseUrl, apiKey: "{env:PPTOKEN_API_KEY}" },
        models: { [model.modelId]: { name: model.modelId } },
      },
    },
  })
}

function smokeCommand() {
  return [
    "set -euo pipefail",
    "rm -rf /workspace/dashi-smoke",
    "mkdir -p /workspace/dashi-smoke",
    "cp /opt/dashiai-ppt/smoke-goal.json /workspace/dashi-smoke/goal.json",
    "printf 'OpenCode: ' && opencode --version",
    "test -f /opt/dashiai-ppt/SKILL.md",
    "DASHI_PPT_PREVIEW_PORT=5200 /opt/dashiai-ppt/scripts/render_goal_deck.sh /workspace/dashi-smoke/goal.json /workspace/dashi-smoke/ppt/index.html",
    "npm --prefix /opt/dashiai-ppt/project run export:pptx -- /workspace/dashi-smoke/ppt /workspace/dashi-smoke/dashi-cloudflare-smoke.pptx",
    "test -s /workspace/dashi-smoke/dashi-cloudflare-smoke.pptx",
    "stat --printf='PPTX bytes: %s\\n' /workspace/dashi-smoke/dashi-cloudflare-smoke.pptx",
  ].join("\n")
}

function opencodeQaScript() {
  return [
    "set -euo pipefail",
    `npm --prefix /opt/dashiai-ppt/project run validate:goal-spec -- ${BENCHMARK_DIR}/goal.json`,
    `npm --prefix /opt/dashiai-ppt/project run validate:swiss -- ${BENCHMARK_DIR}/ppt/index.html`,
    `npm --prefix /opt/dashiai-ppt/project run validate:goal-copy -- ${BENCHMARK_DIR}/goal.json ${BENCHMARK_DIR}/ppt/index.html`,
    `unzip -t ${BENCHMARK_PPTX_PATH} >/dev/null`,
    `test "$(unzip -Z1 ${BENCHMARK_PPTX_PATH} | grep -E '^ppt/slides/slide[0-9]+\\.xml$' | wc -l | tr -d ' ')" -eq 10`,
    `grep -Fq '"value": "10k+ 人"' ${BENCHMARK_DIR}/goal.json`,
    `grep -Fq '"value": "22 国"' ${BENCHMARK_DIR}/goal.json`,
    `grep -Fq '10k+ 人' ${BENCHMARK_DIR}/ppt/index.html`,
    `grep -Fq '22 国' ${BENCHMARK_DIR}/ppt/index.html`,
    "printf 'OPENCODE_QA_SCRIPT_PASS\\n'",
  ].join("\n")
}

function benchmarkCommand(model: OpenCodeModelConfig) {
  const qaPrompt = [
    "You are a read-only OpenCode QA agent.",
    "Read /opt/dashiai-ppt/SKILL.md before checking the deck.",
    `Then run ${OPENCODE_QA_SCRIPT_PATH} exactly once; it independently runs the required Dashi validators, PPTX ZIP integrity check, 10-slide count, and slide 7 count-unit checks.`,
    "Do not edit any file. Your final line must be exactly QA_RESULT: PASS only when every check passes; otherwise exactly QA_RESULT: FAIL.",
  ].join(" ")
  return [
    "set -euo pipefail",
    `rm -rf ${BENCHMARK_DIR}/ppt ${BENCHMARK_PPTX_PATH}`,
    `mkdir -p ${BENCHMARK_DIR}`,
    `trap 'rm -f ${OPENCODE_CONFIG_PATH} ${OPENCODE_KEY_PATH} ${OPENCODE_QA_SCRIPT_PATH}' EXIT`,
    `cp /opt/dashiai-ppt/benchmark-10-goal.json ${BENCHMARK_DIR}/goal.json`,
    "printf 'OpenCode: ' && opencode --version",
    "test -f /opt/dashiai-ppt/SKILL.md",
    `DASHI_PPT_PREVIEW_PORT=5201 /opt/dashiai-ppt/scripts/render_goal_deck.sh ${BENCHMARK_DIR}/goal.json ${BENCHMARK_DIR}/ppt/index.html`,
    `npm --prefix /opt/dashiai-ppt/project run export:pptx -- ${BENCHMARK_DIR}/ppt ${BENCHMARK_PPTX_PATH}`,
    `test -s ${BENCHMARK_PPTX_PATH}`,
    `printf '%s' ${shellQuote(opencodeQaScript())} > ${OPENCODE_QA_SCRIPT_PATH}`,
    `chmod 700 ${OPENCODE_QA_SCRIPT_PATH}`,
    `QA_OUTPUT=$(OPENCODE_CONFIG_CONTENT="$(cat ${OPENCODE_CONFIG_PATH})" PPTOKEN_API_KEY="$(cat ${OPENCODE_KEY_PATH})" opencode run --model pptoken/${model.modelId} --auto --dir ${BENCHMARK_DIR} ${shellQuote(qaPrompt)})`,
    "printf '%s\\n' \"$QA_OUTPUT\"",
    "printf '%s\\n' \"$QA_OUTPUT\" | grep -Fqx 'QA_RESULT: PASS'",
    `stat --printf='PPTX bytes: %s\\n' ${BENCHMARK_PPTX_PATH}`,
  ].join("\n")
}

async function runDeck(command: string, sandbox: CloudflareSandbox) {
  const startedAt = Date.now()
  const result = await sandbox.exec(`bash -lc ${shellQuote(command)}`, {
    cwd: "/workspace",
    timeout: 15 * 60 * 1000,
  })
  return { result, durationMs: Date.now() - startedAt }
}

async function prepareOpenCodeQa(sandbox: CloudflareSandbox, model: OpenCodeModelConfig) {
  await sandbox.mkdir(BENCHMARK_DIR, { recursive: true })
  await sandbox.writeFile(OPENCODE_CONFIG_PATH, opencodeConfig(model))
  await sandbox.writeFile(OPENCODE_KEY_PATH, model.apiKey)
}

function sandboxFor(env: Env) {
  return getSandbox(env.Sandbox, SANDBOX_ID, {
    transport: "rpc",
    enableDefaultSession: true,
    sleepAfter: "10m",
  })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, service: "dashi-ppt-smoke", instanceType: "standard-4", dashiVersion: "0.3.1" })
    }
    if (!authorized(request, env)) return new Response("Unauthorized", { status: 401 })

    if (request.method === "POST" && url.pathname === "/cleanup-legacy") {
      const legacySandbox = getSandbox(env.Sandbox, LEGACY_SANDBOX_ID, {
        transport: "rpc",
        enableDefaultSession: true,
      })
      await legacySandbox.destroy()
      return Response.json({ ok: true, destroyed: LEGACY_SANDBOX_ID })
    }

    if (request.method === "POST" && url.pathname === "/cleanup-current") {
      const currentSandbox = sandboxFor(env)
      await currentSandbox.destroy()
      return Response.json({ ok: true, destroyed: SANDBOX_ID })
    }

    const sandbox = sandboxFor(env)
    if (request.method === "POST" && url.pathname === "/smoke") {
      const { result, durationMs } = await runDeck(smokeCommand(), sandbox)
      if (!result.success || result.exitCode !== 0) {
        return Response.json({ ok: false, durationMs, exitCode: result.exitCode, stdout: text(result.stdout), stderr: text(result.stderr) }, { status: 500 })
      }
      return Response.json({
        ok: true,
        durationMs,
        stdout: text(result.stdout),
        download: `${url.origin}/smoke.pptx`,
      })
    }
    if (request.method === "GET" && url.pathname === "/smoke.pptx") {
      const file = await sandbox.readFile(PPTX_PATH, { encoding: "base64" })
      if (!file.success || !file.content) return new Response("PPTX not found; run POST /smoke first.", { status: 404 })
      const bytes = Uint8Array.from(atob(file.content), (character) => character.charCodeAt(0))
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": 'attachment; filename="dashi-cloudflare-smoke.pptx"',
          "Cache-Control": "no-store",
        },
      })
    }
    if (request.method === "POST" && url.pathname === "/benchmark-10") {
      const model = await modelConfigFrom(request)
      if (!model) return Response.json({ ok: false, error: "invalid_opencode_config" }, { status: 400 })
      await prepareOpenCodeQa(sandbox, model)
      try {
        const { result, durationMs } = await runDeck(benchmarkCommand(model), sandbox)
        if (!result.success || result.exitCode !== 0) {
          return Response.json({ ok: false, durationMs, exitCode: result.exitCode, stdout: text(result.stdout), stderr: text(result.stderr) }, { status: 500 })
        }
        return Response.json({
          ok: true,
          durationMs,
          model: `pptoken/${model.modelId}`,
          stdout: text(result.stdout),
          download: `${url.origin}/benchmark-10.pptx`,
        })
      } finally {
        await sandbox.exec(`rm -f ${OPENCODE_CONFIG_PATH} ${OPENCODE_KEY_PATH}`, { cwd: "/workspace" })
      }
    }
    if (request.method === "GET" && url.pathname === "/benchmark-10.pptx") {
      const file = await sandbox.readFile(BENCHMARK_PPTX_PATH, { encoding: "base64" })
      if (!file.success || !file.content) return new Response("PPTX not found; run POST /benchmark-10 first.", { status: 404 })
      const bytes = Uint8Array.from(atob(file.content), (character) => character.charCodeAt(0))
      return new Response(bytes, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          "Content-Disposition": 'attachment; filename="enterprise-ai-customer-service-evidence-10-pages.pptx"',
          "Cache-Control": "no-store",
        },
      })
    }
    return new Response("Not found", { status: 404 })
  },
}
