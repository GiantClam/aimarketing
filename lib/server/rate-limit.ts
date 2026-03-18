import { sql } from "drizzle-orm"
import { NextResponse, type NextRequest } from "next/server"

import { db } from "@/lib/db"

type RateLimitEntry = {
  count: number
  resetAt: number
}

type RateLimitOptions = {
  key: string
  limit: number
  windowMs: number
}

type RateLimitResult =
  | { ok: true; remaining: number; resetAt: number }
  | { ok: false; retryAfterSeconds: number; remaining: number; resetAt: number }

const GLOBAL_BUCKET_KEY = "__aimarketing_rate_limit_store__"

function getFallbackStore() {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_BUCKET_KEY]?: Map<string, RateLimitEntry>
  }

  if (!globalScope[GLOBAL_BUCKET_KEY]) {
    globalScope[GLOBAL_BUCKET_KEY] = new Map<string, RateLimitEntry>()
  }

  return globalScope[GLOBAL_BUCKET_KEY]!
}

function evaluateRateLimit(count: number, resetAt: number, limit: number): RateLimitResult {
  if (count > limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(Math.ceil((resetAt - Date.now()) / 1000), 1),
      remaining: 0,
      resetAt,
    }
  }

  return {
    ok: true,
    remaining: Math.max(limit - count, 0),
    resetAt,
  }
}

function checkRateLimitFallback({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const store = getFallbackStore()
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt <= now) {
    const resetAt = now + windowMs
    store.set(key, {
      count: 1,
      resetAt,
    })

    return evaluateRateLimit(1, resetAt, limit)
  }

  entry.count += 1
  store.set(key, entry)
  return evaluateRateLimit(entry.count, entry.resetAt, limit)
}

export function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown"
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export async function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): Promise<RateLimitResult> {
  try {
    const result = await db.execute(sql`
      INSERT INTO "AI_MARKETING_rate_limit_buckets" ("bucket_key", "count", "reset_at", "created_at", "updated_at")
      VALUES (${key}, 1, NOW() + (${Math.max(windowMs, 0)} / 1000.0) * interval '1 second', NOW(), NOW())
      ON CONFLICT ("bucket_key")
      DO UPDATE SET
        "count" = CASE
          WHEN "AI_MARKETING_rate_limit_buckets"."reset_at" <= NOW() THEN 1
          ELSE "AI_MARKETING_rate_limit_buckets"."count" + 1
        END,
        "reset_at" = CASE
          WHEN "AI_MARKETING_rate_limit_buckets"."reset_at" <= NOW()
            THEN NOW() + (${Math.max(windowMs, 0)} / 1000.0) * interval '1 second'
          ELSE "AI_MARKETING_rate_limit_buckets"."reset_at"
        END,
        "updated_at" = NOW()
      RETURNING
        "count",
        FLOOR(EXTRACT(EPOCH FROM "reset_at") * 1000)::bigint AS "reset_at_ms"
    `)

    const row = (result.rows[0] ?? {}) as { count?: number | string; reset_at_ms?: number | string }
    const count = Number(row.count || 0)
    const resetAt = Number(row.reset_at_ms || Date.now() + windowMs)
    return evaluateRateLimit(count, resetAt, limit)
  } catch (error) {
    console.warn("rate_limit.db_fallback", {
      key,
      message: error instanceof Error ? error.message : String(error),
    })
    return checkRateLimitFallback({ key, limit, windowMs })
  }
}

export function createRateLimitResponse(message: string, result: Extract<RateLimitResult, { ok: false }>) {
  return NextResponse.json(
    {
      error: message,
      retryAfterSeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    },
  )
}
