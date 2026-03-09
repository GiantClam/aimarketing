import { NextResponse, type NextRequest } from "next/server"

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

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [GLOBAL_BUCKET_KEY]?: Map<string, RateLimitEntry>
  }

  if (!globalScope[GLOBAL_BUCKET_KEY]) {
    globalScope[GLOBAL_BUCKET_KEY] = new Map<string, RateLimitEntry>()
  }

  return globalScope[GLOBAL_BUCKET_KEY]!
}

export function getRequestIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown"
  }

  return request.headers.get("x-real-ip")?.trim() || "unknown"
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): RateLimitResult {
  const store = getStore()
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || entry.resetAt <= now) {
    store.set(key, {
      count: 1,
      resetAt: now + windowMs,
    })

    return {
      ok: true,
      remaining: Math.max(limit - 1, 0),
      resetAt: now + windowMs,
    }
  }

  if (entry.count >= limit) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(Math.ceil((entry.resetAt - now) / 1000), 1),
      remaining: 0,
      resetAt: entry.resetAt,
    }
  }

  entry.count += 1
  store.set(key, entry)

  return {
    ok: true,
    remaining: Math.max(limit - entry.count, 0),
    resetAt: entry.resetAt,
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
