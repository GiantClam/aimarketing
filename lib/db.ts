import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"

const PLACEHOLDER_CONNECTION_STRING = "postgresql://user:password@localhost:5432/aimarketing"
const DEFAULT_POOL_MAX = process.env.NODE_ENV === "development" ? 5 : 10
const DEFAULT_CONNECTION_TIMEOUT_MS = 12_000
const DEFAULT_IDLE_TIMEOUT_MS = 30_000
const POOL_WARMUP_RETRY_DELAYS_MS = [1_000, 3_000]
const FALLBACK_ERROR_TOKENS = [
  "getaddrinfo enotfound",
  "connection timeout",
  "connect timeout",
  "timeout exceeded when trying to connect",
  "connection terminated due to connection timeout",
  "connection terminated unexpectedly",
  "econnrefused",
  "econnreset",
  "und_err_connect_timeout",
  "fetch failed",
] as const

declare global {
  var __aimarketingPgPool: Pool | undefined
  var __aimarketingPgPoolConnectionString: string | undefined
  var __aimarketingPgPoolCandidatesKey: string | undefined
}

function isValidConnectionString(dbUrl: string) {
  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    throw new Error(
      `DATABASE_URL must start with "postgresql://" or "postgres://". ` +
        `Received: ${dbUrl.substring(0, 50)}${dbUrl.length > 50 ? "..." : ""}`,
    )
  }

  return dbUrl
}

function getConnectionCandidates(): string[] {
  const isDevelopment = process.env.NODE_ENV === "development"
  const preferNonPooling =
    process.env.DB_PREFER_NON_POOLING === "true" ||
    (isDevelopment && process.env.DB_PREFER_NON_POOLING !== "false")
  const pooledCandidates = [
    process.env.AI_MARKETING_DB_POSTGRES_URL,
    process.env.DATABASE_URL,
    process.env.POSTGRES_URL,
    process.env.POSTGRES_PRISMA_URL,
  ]
  const directCandidates = [
    process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING,
    process.env.DATABASE_URL_UNPOOLED,
    process.env.POSTGRES_URL_NON_POOLING,
  ]

  const orderedCandidates = isDevelopment && preferNonPooling
    ? [...directCandidates, ...pooledCandidates]
    : [...pooledCandidates, ...directCandidates]
  const normalized = orderedCandidates
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .map((value) => isValidConnectionString(value))

  return normalized.length > 0 ? [...new Set(normalized)] : [PLACEHOLDER_CONNECTION_STRING]
}

const shouldUseRelaxedSsl = (connectionString: string) => {
  const lower = connectionString.toLowerCase()
  return (
    lower.includes("sslmode=require") ||
    lower.includes("supabase.com") ||
    process.env.PGSSLMODE === "require"
  )
}

const getPoolConfig = (connectionString: string): PoolConfig => {
  if (shouldUseRelaxedSsl(connectionString)) {
    const parsed = new URL(connectionString)
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 5432,
      user: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      database: parsed.pathname.replace(/^\//, ""),
      ssl: {
        rejectUnauthorized: false,
      },
      max: DEFAULT_POOL_MAX,
      min: 1,
      connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
      idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
      keepAlive: true,
    }
  }

  return {
    connectionString,
    max: DEFAULT_POOL_MAX,
    min: 1,
    connectionTimeoutMillis: DEFAULT_CONNECTION_TIMEOUT_MS,
    idleTimeoutMillis: DEFAULT_IDLE_TIMEOUT_MS,
    keepAlive: true,
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

function shouldFallbackToNextCandidate(error: unknown) {
  const message = getErrorMessage(error).toLowerCase()
  return FALLBACK_ERROR_TOKENS.some((token) => message.includes(token))
}

function describeConnectionTarget(connectionString: string) {
  try {
    const parsed = new URL(connectionString)
    return `${parsed.hostname}:${parsed.port || "5432"}`
  } catch {
    return connectionString.slice(0, 64)
  }
}

function createRawPool(connectionString: string) {
  const nextPool = new Pool(getPoolConfig(connectionString))

  nextPool.on("error", (error) => {
    console.error("db.pool.error", error)
  })

  return nextPool
}

const connectionCandidates = getConnectionCandidates()
const connectionCandidatesKey = connectionCandidates.join("||")

let activeConnectionString =
  globalThis.__aimarketingPgPoolCandidatesKey === connectionCandidatesKey &&
  globalThis.__aimarketingPgPoolConnectionString &&
  connectionCandidates.includes(globalThis.__aimarketingPgPoolConnectionString)
    ? globalThis.__aimarketingPgPoolConnectionString
    : connectionCandidates[0]

let activePool =
  globalThis.__aimarketingPgPoolCandidatesKey === connectionCandidatesKey &&
  globalThis.__aimarketingPgPool &&
  globalThis.__aimarketingPgPoolConnectionString === activeConnectionString
    ? globalThis.__aimarketingPgPool
    : createRawPool(activeConnectionString)

let activeCandidateIndex = Math.max(0, connectionCandidates.indexOf(activeConnectionString))

function persistActivePool(nextPool: Pool, nextConnectionString: string, nextCandidateIndex: number) {
  activePool = nextPool
  activeConnectionString = nextConnectionString
  activeCandidateIndex = nextCandidateIndex

  globalThis.__aimarketingPgPool = nextPool
  globalThis.__aimarketingPgPoolConnectionString = nextConnectionString
  globalThis.__aimarketingPgPoolCandidatesKey = connectionCandidatesKey
}

persistActivePool(activePool, activeConnectionString, activeCandidateIndex)

async function advanceToNextPool(reason: string, error: unknown) {
  if (activeCandidateIndex >= connectionCandidates.length - 1) {
    return false
  }

  const previousPool = activePool
  const previousTarget = describeConnectionTarget(activeConnectionString)
  const nextCandidateIndex = activeCandidateIndex + 1
  const nextConnectionString = connectionCandidates[nextCandidateIndex]
  const nextPool = createRawPool(nextConnectionString)

  persistActivePool(nextPool, nextConnectionString, nextCandidateIndex)

  console.warn("db.pool.fallback", {
    reason,
    from: previousTarget,
    to: describeConnectionTarget(nextConnectionString),
    message: getErrorMessage(error),
  })

  void previousPool.end().catch(() => {})
  return true
}

async function warmupActivePool(reason: string) {
  const targetPool = activePool
  const attempts = POOL_WARMUP_RETRY_DELAYS_MS.length + 1

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await targetPool.query("select 1")
      if (attempt > 0) {
        console.info("db.pool.warmup.recovered", {
          attempt: attempt + 1,
          target: describeConnectionTarget(activeConnectionString),
        })
      }
      return
    } catch (error) {
      const isLastAttempt = attempt === attempts - 1
      console.warn("db.pool.warmup.failed", {
        attempt: attempt + 1,
        reason,
        target: describeConnectionTarget(activeConnectionString),
        message: getErrorMessage(error),
      })

      if (!isLastAttempt) {
        await sleep(POOL_WARMUP_RETRY_DELAYS_MS[attempt])
        continue
      }

      if (targetPool === activePool && shouldFallbackToNextCandidate(error) && await advanceToNextPool("warmup", error)) {
        await warmupActivePool("fallback")
      }
    }
  }
}

async function runWithPoolFallback<T>(reason: string, operation: (pool: Pool) => Promise<T>) {
  try {
    return await operation(activePool)
  } catch (error) {
    if (!shouldFallbackToNextCandidate(error) || !await advanceToNextPool(reason, error)) {
      throw error
    }

    return operation(activePool)
  }
}

void warmupActivePool("startup")

export const pool = {
  query: (...args: Parameters<Pool["query"]>) => runWithPoolFallback("query", (targetPool) => targetPool.query(...args)),
  connect: () => runWithPoolFallback("connect", (targetPool) => targetPool.connect()),
  end: () => activePool.end(),
  on: (...args: Parameters<Pool["on"]>) => {
    activePool.on(...args)
    return pool
  },
} as unknown as Pool

export const db = drizzle(pool)
