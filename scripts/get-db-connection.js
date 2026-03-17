function getAppConnectionString() {
  return (
    process.env.AI_MARKETING_DB_POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    null
  )
}

function getConstructedDirectConnectionString() {
  const host =
    process.env.PGHOST_UNPOOLED ||
    process.env.AI_MARKETING_DB_POSTGRES_HOST ||
    process.env.POSTGRES_HOST
  const user =
    process.env.PGUSER ||
    process.env.AI_MARKETING_DB_POSTGRES_USER ||
    process.env.POSTGRES_USER
  const password =
    process.env.PGPASSWORD ||
    process.env.AI_MARKETING_DB_POSTGRES_PASSWORD ||
    process.env.POSTGRES_PASSWORD
  const database =
    process.env.PGDATABASE ||
    process.env.AI_MARKETING_DB_POSTGRES_DATABASE ||
    process.env.POSTGRES_DATABASE

  if (!host || !user || !password || !database) {
    return null
  }

  return `postgres://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:5432/${database}?sslmode=require`
}

function getMigrationConnectionString() {
  return (
    getAppConnectionString() ||
    process.env.AI_MARKETING_DB_POSTGRES_URL_NON_POOLING ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL_NON_POOLING ||
    getConstructedDirectConnectionString()
  )
}

function shouldUseRelaxedSsl(connectionString) {
  if (!connectionString) return false

  const lower = connectionString.toLowerCase()
  return (
    lower.includes("sslmode=require") ||
    lower.includes("supabase.com") ||
    process.env.PGSSLMODE === "require"
  )
}

function getPoolConfig(connectionString) {
  if (!connectionString) {
    throw new Error("A database URL is required")
  }

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
    }
  }

  return { connectionString }
}

function getAppPoolConfig() {
  return getPoolConfig(getAppConnectionString())
}

function getMigrationPoolConfig() {
  return getPoolConfig(getMigrationConnectionString())
}

module.exports = {
  getAppConnectionString,
  getMigrationConnectionString,
  getAppPoolConfig,
  getMigrationPoolConfig,
}
