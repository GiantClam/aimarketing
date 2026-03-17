import { drizzle } from "drizzle-orm/node-postgres"
import { Pool, type PoolConfig } from "pg"

const PLACEHOLDER_CONNECTION_STRING = "postgresql://user:password@localhost:5432/aimarketing"
const DEFAULT_POOL_MAX = process.env.NODE_ENV === "development" ? 5 : 10

declare global {
  var __aimarketingPgPool: Pool | undefined
  var __aimarketingPgPoolConnectionString: string | undefined
}

const getConnectionString = (): string => {
  const isDevelopment = process.env.NODE_ENV === "development"
  const dbUrl = isDevelopment
    ? process.env.AI_MARKETING_DB_POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING
    : process.env.AI_MARKETING_DB_POSTGRES_URL ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      process.env.POSTGRES_PRISMA_URL ||
      process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING

  if (!dbUrl) {
    return PLACEHOLDER_CONNECTION_STRING
  }

  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    throw new Error(
      `DATABASE_URL must start with "postgresql://" or "postgres://". ` +
        `Received: ${dbUrl.substring(0, 50)}${dbUrl.length > 50 ? "..." : ""}`,
    )
  }

  return dbUrl
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
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      keepAlive: true,
    }
  }

  return {
    connectionString,
    max: DEFAULT_POOL_MAX,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  }
}

function createPool(connectionString: string) {
  const nextPool = new Pool(getPoolConfig(connectionString))

  nextPool.on("error", (error) => {
    console.error("db.pool.error", error)
  })

  return nextPool
}

const connectionString = getConnectionString()
const shouldReuseExistingPool =
  globalThis.__aimarketingPgPool &&
  globalThis.__aimarketingPgPoolConnectionString === connectionString

if (globalThis.__aimarketingPgPool && !shouldReuseExistingPool) {
  globalThis.__aimarketingPgPool.end().catch(() => {})
  globalThis.__aimarketingPgPool = undefined
  globalThis.__aimarketingPgPoolConnectionString = undefined
}

export const pool = globalThis.__aimarketingPgPool ?? createPool(connectionString)
if (process.env.NODE_ENV !== "production") {
  globalThis.__aimarketingPgPool = pool
  globalThis.__aimarketingPgPoolConnectionString = connectionString
}
export const db = drizzle(pool)
