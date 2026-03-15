import { and, desc, eq } from "drizzle-orm"

import { isDemoLoginEnabled } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { difyConnections, enterpriseDifyAdvisorConfigs, users } from "@/lib/db/schema"

type DifyLookupOptions = {
  userId?: number | null
  userEmail?: string | null
}

type ResolvedUserContext = {
  userId: number | null
  enterpriseId: number | null
}

type DifyConfig = {
  baseUrl: string
  apiKey: string
}

type AdvisorType = "brand-strategy" | "growth" | "copywriting"

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeBaseUrl(baseUrl?: string | null) {
  const trimmed = normalizeOptional(baseUrl)
  if (!trimmed) return null
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed.replace(/\/+$/, "")}/v1`
}

function getAdvisorEnvPrefix(advisorType: AdvisorType) {
  if (advisorType === "brand-strategy") return "BRAND"
  if (advisorType === "growth") return "GROWTH"
  return "COPYWRITING"
}

function getSystemDefaultAdvisorConfig(advisorType: AdvisorType): DifyConfig | null {
  const prefix = getAdvisorEnvPrefix(advisorType)
  const baseUrl =
    normalizeBaseUrl(process.env[`DIFY_DEFAULT_${prefix}_BASE_URL`]) || normalizeBaseUrl(process.env.DIFY_DEFAULT_BASE_URL)

  const apiKey = normalizeOptional(process.env[`DIFY_DEFAULT_${prefix}_API_KEY`])
  if (!baseUrl || !apiKey) {
    return null
  }

  return {
    baseUrl,
    apiKey,
  }
}

export function getSystemDefaultAdvisorSummary() {
  const brand = getSystemDefaultAdvisorConfig("brand-strategy")
  const growth = getSystemDefaultAdvisorConfig("growth")

  return {
    baseUrl: normalizeBaseUrl(process.env.DIFY_DEFAULT_BASE_URL),
    brandStrategy: {
      configured: Boolean(brand),
      baseUrl: brand?.baseUrl || null,
    },
    growth: {
      configured: Boolean(growth),
      baseUrl: growth?.baseUrl || null,
    },
  }
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

async function resolveUserContext(options?: DifyLookupOptions): Promise<ResolvedUserContext> {
  const rawUserId = options?.userId
  const normalizedUserId =
    typeof rawUserId === "number" && Number.isFinite(rawUserId) && rawUserId > 0 ? rawUserId : null
  const userEmail = options?.userEmail?.trim().toLowerCase()

  if (!userEmail && !normalizedUserId) {
    return { userId: null, enterpriseId: null }
  }

  const rows = await db
    .select({ id: users.id, enterpriseId: users.enterpriseId })
    .from(users)
    .where(userEmail ? eq(users.email, userEmail) : eq(users.id, normalizedUserId as number))
    .limit(1)

  if (rows.length > 0) {
    return {
      userId: rows[0].id,
      enterpriseId: rows[0].enterpriseId ?? null,
    }
  }

  return {
    userId: normalizedUserId,
    enterpriseId: null,
  }
}

export async function isWriterMockAvailable(options?: DifyLookupOptions) {
  const context = await resolveUserContext(options)
  if (!context.userId || !isDemoLoginEnabled()) {
    return false
  }

  const rows = await db
    .select({ isDemo: users.isDemo })
    .from(users)
    .where(eq(users.id, context.userId))
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

async function getLegacyDefaultDifyConfig(options?: DifyLookupOptions) {
  const context = await resolveUserContext(options)
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !context.userId) {
    return null
  }

  const defaultConns = await db
    .select()
    .from(difyConnections)
    .where(
      context.userId
        ? and(eq(difyConnections.isDefault, true), eq(difyConnections.userId, context.userId))
        : eq(difyConnections.isDefault, true),
    )
    .limit(1)

  if (defaultConns.length > 0) {
    return {
      baseUrl: defaultConns[0].baseUrl,
      apiKey: defaultConns[0].apiKey || "",
    }
  }

  const anyConns = context.userId
    ? await db
        .select()
        .from(difyConnections)
        .where(eq(difyConnections.userId, context.userId))
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

async function getLegacyDifyConfigByName(name: string, options?: DifyLookupOptions, fallbackToDefault = true) {
  const context = await resolveUserContext(options)
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !context.userId) {
    return fallbackToDefault ? getLegacyDefaultDifyConfig(options) : null
  }

  const conns = await db
    .select()
    .from(difyConnections)
    .where(
      context.userId
        ? and(eq(difyConnections.name, name), eq(difyConnections.userId, context.userId))
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

  return getLegacyDefaultDifyConfig(options)
}

export async function hasDifyConfigByName(name: string, options?: DifyLookupOptions) {
  const config = await getLegacyDifyConfigByName(name, options, false)
  return Boolean(config?.baseUrl && config?.apiKey)
}

export async function getEnterpriseAdvisorOverride(
  enterpriseId: number | null | undefined,
  advisorType: Exclude<AdvisorType, "copywriting">,
) {
  if (!enterpriseId || !Number.isFinite(enterpriseId) || enterpriseId <= 0) {
    return null
  }

  const rows = await db
    .select()
    .from(enterpriseDifyAdvisorConfigs)
    .where(and(eq(enterpriseDifyAdvisorConfigs.enterpriseId, enterpriseId), eq(enterpriseDifyAdvisorConfigs.advisorType, advisorType)))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    advisorType: row.advisorType,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey || "",
    enabled: Boolean(row.enabled),
  }
}

export async function listEnterpriseAdvisorOverrides(enterpriseId: number | null | undefined) {
  if (!enterpriseId || !Number.isFinite(enterpriseId) || enterpriseId <= 0) {
    return []
  }

  const rows = await db
    .select()
    .from(enterpriseDifyAdvisorConfigs)
    .where(eq(enterpriseDifyAdvisorConfigs.enterpriseId, enterpriseId))
    .orderBy(desc(enterpriseDifyAdvisorConfigs.updatedAt), desc(enterpriseDifyAdvisorConfigs.id))

  return rows.map((row) => ({
    id: row.id,
    enterpriseId: row.enterpriseId,
    advisorType: row.advisorType,
    baseUrl: row.baseUrl,
    apiKey: row.apiKey || "",
    enabled: Boolean(row.enabled),
  }))
}

export async function upsertEnterpriseAdvisorOverride(
  enterpriseId: number,
  advisorType: Exclude<AdvisorType, "copywriting">,
  input: {
    useDefault: boolean
    enabled: boolean
    baseUrl: string
    apiKey: string
  },
) {
  if (input.useDefault) {
    await db
      .delete(enterpriseDifyAdvisorConfigs)
      .where(and(eq(enterpriseDifyAdvisorConfigs.enterpriseId, enterpriseId), eq(enterpriseDifyAdvisorConfigs.advisorType, advisorType)))
    return null
  }

  const baseUrl = normalizeBaseUrl(input.baseUrl)
  const apiKey = normalizeOptional(input.apiKey)
  if (!baseUrl || !apiKey) {
    throw new Error("advisor_base_url_and_api_key_required")
  }

  const existing = await getEnterpriseAdvisorOverride(enterpriseId, advisorType)
  if (existing?.id) {
    await db
      .update(enterpriseDifyAdvisorConfigs)
      .set({
        baseUrl,
        apiKey,
        enabled: Boolean(input.enabled),
        updatedAt: new Date(),
      })
      .where(eq(enterpriseDifyAdvisorConfigs.id, existing.id))
  } else {
    await db.insert(enterpriseDifyAdvisorConfigs).values({
      enterpriseId,
      advisorType,
      baseUrl,
      apiKey,
      enabled: Boolean(input.enabled),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  return getEnterpriseAdvisorOverride(enterpriseId, advisorType)
}

async function getAdvisorContext(options?: DifyLookupOptions) {
  const context = await resolveUserContext(options)
  const systemDefaults = getSystemDefaultAdvisorSummary()

  return {
    userId: context.userId,
    enterpriseId: context.enterpriseId,
    systemDefaults,
  }
}

async function getAdvisorConfig(advisorType: Exclude<AdvisorType, "copywriting">, options?: DifyLookupOptions) {
  const context = await getAdvisorContext(options)
  const enterpriseOverride = await getEnterpriseAdvisorOverride(context.enterpriseId, advisorType)
  if (enterpriseOverride && enterpriseOverride.enabled && enterpriseOverride.baseUrl && enterpriseOverride.apiKey) {
    return {
      source: "enterprise" as const,
      baseUrl: enterpriseOverride.baseUrl,
      apiKey: enterpriseOverride.apiKey,
      enterpriseId: context.enterpriseId,
    }
  }

  const systemDefault = getSystemDefaultAdvisorConfig(advisorType)
  if (systemDefault) {
    return {
      source: "default" as const,
      baseUrl: systemDefault.baseUrl,
      apiKey: systemDefault.apiKey,
      enterpriseId: context.enterpriseId,
    }
  }

  const legacyName = advisorType === "brand-strategy" ? "品牌战略顾问" : "增长顾问"
  const legacyConfig = await getLegacyDifyConfigByName(legacyName, options, false)
  if (legacyConfig) {
    return {
      source: "legacy" as const,
      baseUrl: legacyConfig.baseUrl,
      apiKey: legacyConfig.apiKey,
      enterpriseId: context.enterpriseId,
    }
  }

  return null
}

export async function getAdvisorAvailability(options?: DifyLookupOptions) {
  const [brandConfig, growthConfig, hasCopywritingNamedConfig, defaultConfig, writerMockAvailable] = await Promise.all([
    getAdvisorConfig("brand-strategy", options),
    getAdvisorConfig("growth", options),
    hasDifyConfigByName("文案写作专家", options),
    getLegacyDefaultDifyConfig(options),
    isWriterMockAvailable(options),
  ])
  const copywriting = hasCopywritingNamedConfig || Boolean(defaultConfig) || writerMockAvailable

  return {
    brandStrategy: Boolean(brandConfig),
    growth: Boolean(growthConfig),
    copywriting,
    hasAny: Boolean(brandConfig) || Boolean(growthConfig) || copywriting,
  }
}

export async function getDifyConfigByAdvisorType(advisorType?: string | null, options?: DifyLookupOptions) {
  if (advisorType === "brand-strategy") {
    const config = await getAdvisorConfig("brand-strategy", options)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (advisorType === "growth") {
    const config = await getAdvisorConfig("growth", options)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (advisorType === "copywriting") {
    return getLegacyDifyConfigByName("文案写作专家", options, true)
  }

  return getLegacyDefaultDifyConfig(options)
}
