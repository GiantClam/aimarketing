import { NextRequest, NextResponse } from "next/server"
import { sql } from "drizzle-orm"

import { runAssistantTaskRecoveryPass } from "@/lib/assistant-async"
import { db } from "@/lib/db"

export const runtime = "nodejs"
export const maxDuration = 60

const RUNNER_SECRET = process.env.ASSISTANT_TASK_RUNNER_SECRET || process.env.CRON_SECRET || ""
const RUNNER_CIRCUIT_KEY = "assistant_task_runner:circuit"
const RUNNER_ENABLED = process.env.ASSISTANT_TASK_RUNNER_ENABLED !== "false"
const RUNNER_CIRCUIT_THRESHOLD = Math.max(
  1,
  Number.parseInt(process.env.ASSISTANT_TASK_RUNNER_BREAKER_THRESHOLD || "", 10) || 5,
)
const RUNNER_CIRCUIT_WINDOW_MS = Math.max(
  30_000,
  Number.parseInt(process.env.ASSISTANT_TASK_RUNNER_BREAKER_WINDOW_MS || "", 10) || 5 * 60_000,
)
const RUNNER_CIRCUIT_COOLDOWN_MS = Math.max(
  30_000,
  Number.parseInt(process.env.ASSISTANT_TASK_RUNNER_BREAKER_COOLDOWN_MS || "", 10) || 10 * 60_000,
)
const RUNNER_COUNT_ALL_FAILED_PASS =
  process.env.ASSISTANT_TASK_RUNNER_BREAKER_COUNT_ALL_FAILED_PASS === "false" ? false : true
const RUNNER_CIRCUIT_FALLBACK_STATE_KEY = "__assistantTaskRunnerCircuitState__"

type RunnerCircuitState = {
  count: number
  resetAtMs: number
}

function getFallbackCircuitStateStore() {
  const globalScope = globalThis as typeof globalThis & {
    [RUNNER_CIRCUIT_FALLBACK_STATE_KEY]?: RunnerCircuitState
  }

  if (!globalScope[RUNNER_CIRCUIT_FALLBACK_STATE_KEY]) {
    globalScope[RUNNER_CIRCUIT_FALLBACK_STATE_KEY] = {
      count: 0,
      resetAtMs: 0,
    }
  }

  return globalScope[RUNNER_CIRCUIT_FALLBACK_STATE_KEY]!
}

function authorizeRequest(request: NextRequest) {
  if (!RUNNER_SECRET) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        status: 500,
        error: "assistant_task_runner_secret_missing",
      } as const
    }
    return { ok: true } as const
  }

  const authorization = request.headers.get("authorization") || ""
  if (authorization === `Bearer ${RUNNER_SECRET}`) {
    return { ok: true } as const
  }

  return {
    ok: false,
    status: 401,
    error: "unauthorized",
  } as const
}

function parseLimit(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("limit")
  const parsed = Number.parseInt(raw || "", 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined
  return Math.max(1, Math.min(30, parsed))
}

function parseBooleanQueryValue(value: string | null) {
  if (!value) return false
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes"
}

function getRetryAfterSeconds(resetAtMs: number) {
  return Math.max(1, Math.ceil((resetAtMs - Date.now()) / 1000))
}

function toOpenCircuitResponse(input: { reason: string; count: number; resetAtMs: number }) {
  const retryAfterSeconds = getRetryAfterSeconds(input.resetAtMs)
  return NextResponse.json(
    {
      error: "assistant_task_runner_circuit_open",
      reason: input.reason,
      circuit: {
        state: "open",
        count: input.count,
        threshold: RUNNER_CIRCUIT_THRESHOLD,
        resetAt: input.resetAtMs,
        retryAfterSeconds,
      },
    },
    {
      status: 503,
      headers: {
        "Retry-After": String(retryAfterSeconds),
      },
    },
  )
}

async function readRunnerCircuitState(): Promise<RunnerCircuitState> {
  try {
    const result = await db.execute(sql`
      SELECT
        "count",
        FLOOR(EXTRACT(EPOCH FROM "reset_at") * 1000)::bigint AS "reset_at_ms"
      FROM "AI_MARKETING_rate_limit_buckets"
      WHERE "bucket_key" = ${RUNNER_CIRCUIT_KEY}
      LIMIT 1
    `)

    const row = (result.rows[0] ?? {}) as { count?: number | string; reset_at_ms?: number | string }
    const count = Math.max(0, Number(row.count || 0))
    const resetAtMs = Math.max(0, Number(row.reset_at_ms || 0))
    return { count, resetAtMs }
  } catch (error) {
    console.warn("assistant.task.runner.circuit.db_fallback_read", {
      message: error instanceof Error ? error.message : String(error),
    })
    return getFallbackCircuitStateStore()
  }
}

async function writeRunnerCircuitState(next: RunnerCircuitState) {
  try {
    await db.execute(sql`
      INSERT INTO "AI_MARKETING_rate_limit_buckets" ("bucket_key", "count", "reset_at", "created_at", "updated_at")
      VALUES (${RUNNER_CIRCUIT_KEY}, ${Math.max(0, next.count)}, TO_TIMESTAMP(${Math.max(0, next.resetAtMs)} / 1000.0), NOW(), NOW())
      ON CONFLICT ("bucket_key")
      DO UPDATE SET
        "count" = ${Math.max(0, next.count)},
        "reset_at" = TO_TIMESTAMP(${Math.max(0, next.resetAtMs)} / 1000.0),
        "updated_at" = NOW()
    `)
  } catch (error) {
    console.warn("assistant.task.runner.circuit.db_fallback_write", {
      message: error instanceof Error ? error.message : String(error),
    })
    const fallback = getFallbackCircuitStateStore()
    fallback.count = Math.max(0, next.count)
    fallback.resetAtMs = Math.max(0, next.resetAtMs)
  }
}

async function clearRunnerFailureCircuit() {
  await writeRunnerCircuitState({
    count: 0,
    resetAtMs: Date.now(),
  })
}

async function recordRunnerFailure(reason: string) {
  const now = Date.now()
  const current = await readRunnerCircuitState()

  const inActiveWindow = current.resetAtMs > now
  const nextCount = inActiveWindow ? current.count + 1 : 1
  const shouldOpen = nextCount >= RUNNER_CIRCUIT_THRESHOLD
  const nextResetAtMs = shouldOpen ? now + RUNNER_CIRCUIT_COOLDOWN_MS : now + RUNNER_CIRCUIT_WINDOW_MS

  await writeRunnerCircuitState({
    count: nextCount,
    resetAtMs: nextResetAtMs,
  })

  return {
    reason,
    count: nextCount,
    resetAtMs: nextResetAtMs,
    opened: shouldOpen,
    retryAfterSeconds: getRetryAfterSeconds(nextResetAtMs),
  }
}

async function handleRunnerRequest(request: NextRequest) {
  const auth = authorizeRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!RUNNER_ENABLED) {
    return NextResponse.json({
      data: {
        skipped: true,
        reason: "runner_disabled",
      },
    })
  }

  const force = parseBooleanQueryValue(request.nextUrl.searchParams.get("force"))
  const circuit = await readRunnerCircuitState()
  const now = Date.now()
  const circuitOpen = circuit.count >= RUNNER_CIRCUIT_THRESHOLD && circuit.resetAtMs > now
  if (circuitOpen && !force) {
    return toOpenCircuitResponse({
      reason: "cooldown_active",
      count: circuit.count,
      resetAtMs: circuit.resetAtMs,
    })
  }

  const startedAt = Date.now()
  try {
    const result = await runAssistantTaskRecoveryPass({
      limit: parseLimit(request),
    })

    const passAllFailed = result.inspected > 0 && result.failed > 0 && result.failed === result.inspected
    if (RUNNER_COUNT_ALL_FAILED_PASS && passAllFailed) {
      const failure = await recordRunnerFailure("all_candidates_failed")
      if (failure.opened) {
        return toOpenCircuitResponse({
          reason: failure.reason,
          count: failure.count,
          resetAtMs: failure.resetAtMs,
        })
      }
      return NextResponse.json({
        data: {
          ...result,
          elapsedMs: Date.now() - startedAt,
          warning: "assistant_task_runner_pass_all_failed",
          circuit: {
            state: "half_open",
            count: failure.count,
            threshold: RUNNER_CIRCUIT_THRESHOLD,
            resetAt: failure.resetAtMs,
            retryAfterSeconds: failure.retryAfterSeconds,
          },
        },
      })
    }

    await clearRunnerFailureCircuit()
    return NextResponse.json({
      data: {
        ...result,
        elapsedMs: Date.now() - startedAt,
        circuit: {
          state: "closed",
          count: 0,
          threshold: RUNNER_CIRCUIT_THRESHOLD,
        },
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "assistant_task_runner_failed"
    const failure = await recordRunnerFailure(message)
    if (failure.opened) {
      return toOpenCircuitResponse({
        reason: failure.reason,
        count: failure.count,
        resetAtMs: failure.resetAtMs,
      })
    }

    return NextResponse.json(
      {
        error: message,
        circuit: {
          state: "half_open",
          count: failure.count,
          threshold: RUNNER_CIRCUIT_THRESHOLD,
          resetAt: failure.resetAtMs,
          retryAfterSeconds: failure.retryAfterSeconds,
        },
      },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  return handleRunnerRequest(request)
}

export async function POST(request: NextRequest) {
  return GET(request)
}
