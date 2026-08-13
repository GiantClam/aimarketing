import os from "node:os"

export type CheckStatus = "pass" | "fail" | "blocked" | "not-supported"

export type SpikeCheck = {
  name: string
  status: CheckStatus
  durationMs: number
  detail?: string
  blocker?: string
  observed?: unknown
}

export type EvidenceInput = {
  runId: string
  candidate: {
    kind: string
    version: string
    executableSha256: string
  }
  startedAt: string
  finishedAt: string
  checks: SpikeCheck[]
  process?: Record<string, unknown>
  protocol?: Record<string, unknown>
  artifacts?: Array<Record<string, unknown>>
}

const MODEL_CHECKS = new Set([
  "model_provider_preflight",
  "prompt_turn_1",
  "prompt_turn_2_same_session",
  "stream_text",
  "tool_events",
  "usage_events",
  "abort_active_prompt",
])

function verdict(checks: SpikeCheck[], model: boolean) {
  const selected = checks.filter((check) => MODEL_CHECKS.has(check.name) === model)
  if (selected.some((check) => check.status === "fail")) return "fail"
  if (selected.some((check) => check.status === "blocked")) return "blocked"
  if (selected.some((check) => check.status === "not-supported")) return "not-supported"
  if (selected.length > 0 && selected.every((check) => check.status === "pass")) return "pass"
  return "incomplete"
}

export function buildEvidence(input: EvidenceInput) {
  const transport = verdict(input.checks, false)
  const modelBacked = verdict(input.checks, true)
  const cleanVm = process.env.DESKTOP_SPIKE_CLEAN_VM === "true"
  const hasFailure = input.checks.some((check) => check.status === "fail")
  const hasLimitation = input.checks.some((check) => check.status === "blocked" || check.status === "not-supported") || !cleanVm
  const status = hasFailure ? "fail" : hasLimitation ? "changes-required" : "pass"
  const processRecords = input.process && Object.keys(input.process).length > 0 ? [input.process] : []
  const commands = processRecords.flatMap((record, index) => {
    const restart = record.restartProcess && typeof record.restartProcess === "object"
      ? [record.restartProcess as Record<string, unknown>]
      : []
    return [record, ...restart].map((command, commandIndex) => ({
      id: commandIndex === 0 && index === 0 ? "opencode-serve" : "opencode-serve-restart",
      startedAtUtc: command.startedAtUtc,
      finishedAtUtc: command.finishedAtUtc,
      exitCode: command.exitCode,
      signal: command.signal,
      durationMs: command.durationMs,
      stdoutSummary: `bytes=${String(command.stdoutBytes ?? 0)} sha256=${String(command.stdoutSha256 ?? "")}`,
      stderrSummary: `bytes=${String(command.stderrBytes ?? 0)} sha256=${String(command.stderrSha256 ?? "")}`,
    }))
  })
  const limitations = [
    ...(!cleanVm ? ["Current evidence is from the development machine, not a clean Windows 10 22H2 or Windows 11 x64 VM."] : []),
    ...input.checks
      .filter((check) => check.status === "blocked" || check.status === "not-supported")
      .map((check) => `${check.name}: ${check.blocker ?? check.detail ?? check.status}`),
  ]
  return {
    schemaVersion: 1,
    spikeId: `opencode-session-${input.candidate.kind}`,
    status,
    runId: input.runId,
    environment: {
      osCaption: os.version(),
      osVersion: os.release(),
      build: os.release().split(".").at(-1) ?? "unknown",
      architecture: os.arch(),
      processArchitecture: process.arch,
      powershellVersion: process.env.DESKTOP_SPIKE_POWERSHELL_VERSION ?? "unknown",
      cleanVm,
      baselineId: `local-${os.release().split(".").at(-1) ?? "unknown"}-${process.arch}`,
      node: process.version,
    },
    components: [{
      name: `opencode-${input.candidate.kind}`,
      version: input.candidate.version,
      executableSha256: input.candidate.executableSha256,
    }],
    commands,
    assertions: input.checks.map((check) => ({
      id: check.name,
      status: check.status === "blocked" || check.status === "not-supported" ? "changes-required" : check.status,
      details: [
        check.blocker,
        check.detail,
        check.observed === undefined ? undefined : JSON.stringify(check.observed),
      ].filter(Boolean).join(" | ") || check.status,
    })),
    artifacts: input.artifacts ?? [],
    limitations,
    candidate: input.candidate,
    startedAtUtc: input.startedAt,
    finishedAtUtc: input.finishedAt,
    durationMs: Math.max(0, Date.parse(input.finishedAt) - Date.parse(input.startedAt)),
    verdict: {
      transport,
      modelBacked,
      overall: status,
    },
    checks: input.checks,
    ...(input.process ? { process: input.process } : {}),
    ...(input.protocol ? { protocol: input.protocol } : {}),
  }
}

type RedactionOptions = {
  secrets?: string[]
  userRoots?: string[]
}

const SENSITIVE_KEY = /authorization|cookie|credential|password|secret|token|api[-_]?key/i

function redactString(value: string, options: RedactionOptions) {
  let result = value.replace(/Basic\s+[A-Za-z0-9+/=]+/giu, "Basic [redacted]")
  for (const secret of options.secrets ?? []) {
    if (!secret) continue
    result = result.split(secret).join("[redacted]")
  }
  for (const root of options.userRoots ?? []) {
    if (!root) continue
    result = result.replaceAll(root, "[user-root]")
    result = result.replaceAll(root.replaceAll("\\", "/"), "[user-root]")
  }
  result = result.replace(/([A-Za-z]:\\Users\\)[^\\/]+/giu, "$1[redacted-user]")
  result = result.replace(/(\/home\/)[^/]+/gu, "$1[redacted-user]")
  return result
}

export function redactEvidence(value: unknown, options: RedactionOptions = {}, key = ""): unknown {
  if (SENSITIVE_KEY.test(key)) return "[redacted]"
  if (typeof value === "string") return redactString(value, options)
  if (Array.isArray(value)) return value.map((item) => redactEvidence(item, options))
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [nestedKey, redactEvidence(nestedValue, options, nestedKey)]),
    )
  }
  return value
}
