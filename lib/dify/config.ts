import { db } from "@/lib/db"
import { difyConnections, users } from "@/lib/db/schema"
import { and, desc, eq } from "drizzle-orm"
import { isDemoLoginEnabled } from "@/lib/auth/session"

type DifyLookupOptions = {
  userId?: number | null
  userEmail?: string | null
}

export function buildDifyUserIdentity(userEmail: string, advisorType?: string | null) {
  const normalizedEmail = userEmail.trim().toLowerCase()
  return advisorType ? `${normalizedEmail}_${advisorType}` : normalizedEmail
}

function hasUserContext(options?: DifyLookupOptions) {
  const userId = options?.userId
  const hasNumericUserId = typeof userId === "number" && Number.isFinite(userId) && userId > 0
  const hasUserEmail = Boolean(options?.userEmail?.trim())
  return hasNumericUserId || hasUserEmail
}

async function resolveUserId(options?: DifyLookupOptions) {
  const rawUserId = options?.userId
  const normalizedUserId =
    typeof rawUserId === "number" && Number.isFinite(rawUserId) && rawUserId > 0 ? rawUserId : null

  const userEmail = options?.userEmail?.trim()
  if (userEmail) {
    const rows = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, userEmail))
      .limit(1)

    if (rows.length > 0) {
      return rows[0].id
    }

    if (normalizedUserId) {
      return normalizedUserId
    }

    return null
  }

  return normalizedUserId
}

export async function isWriterMockAvailable(options?: DifyLookupOptions) {
  const resolvedUserId = await resolveUserId(options)
  if (!resolvedUserId || !isDemoLoginEnabled()) {
    return false
  }

  const rows = await db
    .select({ isDemo: users.isDemo })
    .from(users)
    .where(eq(users.id, resolvedUserId))
    .limit(1)

  return Boolean(rows[0]?.isDemo)
}

export function extractUserEmailFromDifyUser(difyUser?: string | null, advisorType?: string | null) {
  if (!difyUser) return null

  if (advisorType) {
    const suffix = `_${advisorType}`
    if (difyUser.endsWith(suffix)) {
      return difyUser.slice(0, -suffix.length)
    }
  }

  const idx = difyUser.lastIndexOf("_")
  if (idx > 0) {
    return difyUser.slice(0, idx)
  }

  return difyUser
}

export async function getDefaultDifyConfig(options?: DifyLookupOptions) {
  const resolvedUserId = await resolveUserId(options)
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !resolvedUserId) {
    return null
  }

  const defaultConns = await db
    .select()
    .from(difyConnections)
    .where(
      resolvedUserId
        ? and(eq(difyConnections.isDefault, true), eq(difyConnections.userId, resolvedUserId))
        : eq(difyConnections.isDefault, true),
    )
    .limit(1)

  if (defaultConns.length > 0) {
    return {
      baseUrl: defaultConns[0].baseUrl,
      apiKey: defaultConns[0].apiKey || "",
    }
  }

  const anyConns = resolvedUserId
    ? await db
        .select()
        .from(difyConnections)
        .where(eq(difyConnections.userId, resolvedUserId))
        .orderBy(desc(difyConnections.createdAt))
        .limit(1)
    : await db
        .select()
        .from(difyConnections)
        .orderBy(desc(difyConnections.createdAt))
        .limit(1)

  if (anyConns.length > 0) {
    return {
      baseUrl: anyConns[0].baseUrl,
      apiKey: anyConns[0].apiKey || "",
    }
  }

  return null
}

export async function getDifyConfigByName(name: string, options?: DifyLookupOptions, fallbackToDefault = true) {
  const resolvedUserId = await resolveUserId(options)
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !resolvedUserId) {
    return fallbackToDefault ? getDefaultDifyConfig(options) : null
  }

  const conns = await db
    .select()
    .from(difyConnections)
    .where(
      resolvedUserId
        ? and(eq(difyConnections.name, name), eq(difyConnections.userId, resolvedUserId))
        : eq(difyConnections.name, name),
    )
    .orderBy(desc(difyConnections.createdAt))
    .limit(1)

  if (conns.length > 0) {
    return {
      baseUrl: conns[0].baseUrl,
      apiKey: conns[0].apiKey || "",
    }
  }

  if (!fallbackToDefault) {
    return null
  }

  return getDefaultDifyConfig(options)
}

export async function hasDifyConfigByName(name: string, options?: DifyLookupOptions) {
  const resolvedUserId = await resolveUserId(options)
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !resolvedUserId) {
    return false
  }

  const conns = await db
    .select({ id: difyConnections.id })
    .from(difyConnections)
    .where(
      resolvedUserId
        ? and(eq(difyConnections.name, name), eq(difyConnections.userId, resolvedUserId))
        : eq(difyConnections.name, name),
    )
    .limit(1)

  return conns.length > 0
}

export async function getAdvisorAvailability(options?: DifyLookupOptions) {
  const [brandStrategy, growth, hasCopywritingNamedConfig, defaultConfig, writerMockAvailable] = await Promise.all([
    hasDifyConfigByName("品牌战略顾问", options),
    hasDifyConfigByName("增长顾问", options),
    hasDifyConfigByName("文案写作专家", options),
    getDefaultDifyConfig(options),
    isWriterMockAvailable(options),
  ])
  const copywriting = hasCopywritingNamedConfig || Boolean(defaultConfig) || writerMockAvailable

  return {
    brandStrategy,
    growth,
    copywriting,
    hasAny: brandStrategy || growth || copywriting,
  }
}

export async function getDifyConfigByAdvisorType(advisorType?: string | null, options?: DifyLookupOptions) {
  if (advisorType === "brand-strategy") {
    return getDifyConfigByName("品牌战略顾问", options, false)
  }

  if (advisorType === "growth") {
    return getDifyConfigByName("增长顾问", options, false)
  }

  if (advisorType === "copywriting") {
    return getDifyConfigByName("文案写作专家", options, true)
  }

  return getDefaultDifyConfig(options)
}

