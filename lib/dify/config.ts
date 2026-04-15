import { and, desc, eq } from "drizzle-orm"

import { isDemoLoginEnabled } from "@/lib/auth/session"
import { db } from "@/lib/db"
import { createRetryableDbErrorMatcher, withDbRetry } from "@/lib/db/retry"
import { difyConnections, enterpriseDifyAdvisorConfigs, enterprises, users } from "@/lib/db/schema"
import { normalizeLeadHunterAdvisorType } from "@/lib/lead-hunter/types"

type DifyLookupOptions = {
  userId?: number | null
  userEmail?: string | null
  enterpriseId?: number | null
  enterpriseCode?: string | null
}

type ResolvedUserContext = {
  userId: number | null
  enterpriseId: number | null
  enterpriseCode: string | null
}

type DifyConfig = {
  baseUrl: string
  apiKey: string
}
type LeadHunterExecutionMode = "dify" | "skill"

type AdvisorType =
  | "brand-strategy"
  | "growth"
  | "copywriting"
  | "lead-hunter"
  | "company-search"
  | "contact-mining"
const DEMO_USER_EMAIL = "demo@example.com"
const DIFY_DB_RETRY_DELAYS_MS = [250, 750]
const isRetryableDifyDbError = createRetryableDbErrorMatcher(["timeout exceeded"])

function normalizeOptional(value?: string | null) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function normalizeBaseUrl(baseUrl?: string | null) {
  const trimmed = normalizeOptional(baseUrl)
  if (!trimmed) return null
  return /\/v1$/i.test(trimmed) ? trimmed : `${trimmed.replace(/\/+$/, "")}/v1`
}

function normalizeLeadHunterExecutionMode(raw: string | null | undefined): LeadHunterExecutionMode {
  return (raw || "").trim().toLowerCase() === "skill" ? "skill" : "dify"
}

async function withDifyDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: DIFY_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryableDifyDbError,
    logPrefix: "dify.db.retry",
    exhaustedErrorPrefix: "dify_db_retry_exhausted",
  })
}

function isStatelessDemoLookup(options?: DifyLookupOptions) {
  return options?.userEmail?.trim().toLowerCase() === DEMO_USER_EMAIL
}

function getAdvisorEnvPrefix(advisorType: AdvisorType) {
  if (advisorType === "brand-strategy") return "BRAND"
  if (advisorType === "growth") return "GROWTH"
  return "COPYWRITING"
}

function getSystemDefaultAdvisorConfig(advisorType: AdvisorType): DifyConfig | null {
  if (advisorType === "lead-hunter" || advisorType === "company-search" || advisorType === "contact-mining") {
    return null
  }

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
    leadHunter: {
      configured: false,
      baseUrl: null,
    },
    companySearch: {
      configured: false,
      baseUrl: null,
    },
    contactMining: {
      configured: false,
      baseUrl: null,
    },
  }
}

function normalizeAdvisorType(advisorType: string | null | undefined): AdvisorType | null {
  if (advisorType === "brand-strategy" || advisorType === "growth" || advisorType === "copywriting") {
    return advisorType
  }

  const normalizedLeadHunterType = normalizeLeadHunterAdvisorType(advisorType)
  if (normalizedLeadHunterType) {
    return normalizedLeadHunterType
  }

  return null
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
  const enterpriseId =
    typeof options?.enterpriseId === "number" && Number.isFinite(options.enterpriseId) && options.enterpriseId > 0
      ? options.enterpriseId
      : null
  const enterpriseCode = normalizeOptional(options?.enterpriseCode || null)

  if (!userEmail && !normalizedUserId) {
    return { userId: null, enterpriseId, enterpriseCode }
  }

  if (normalizedUserId && enterpriseId && enterpriseCode) {
    return {
      userId: normalizedUserId,
      enterpriseId,
      enterpriseCode,
    }
  }

  try {
    const rows = await withDifyDbRetry("resolve-user-context", async () =>
      db
        .select({ id: users.id, enterpriseId: users.enterpriseId, enterpriseCode: enterprises.enterpriseCode })
        .from(users)
        .leftJoin(enterprises, eq(users.enterpriseId, enterprises.id))
        .where(userEmail ? eq(users.email, userEmail) : eq(users.id, normalizedUserId as number))
        .limit(1),
    )

    if (rows.length > 0) {
      return {
        userId: rows[0].id,
        enterpriseId: rows[0].enterpriseId ?? null,
        enterpriseCode: normalizeOptional(rows[0].enterpriseCode ?? null),
      }
    }
  } catch (error) {
    console.warn("dify.resolve_user_context.fallback", {
      userId: normalizedUserId,
      userEmail,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    userId: normalizedUserId,
    enterpriseId,
    enterpriseCode,
  }
}

export async function isWriterMockAvailable(options?: DifyLookupOptions) {
  const context = await resolveUserContext(options)
  return isWriterMockAvailableWithContext(context, options)
}

async function isWriterMockAvailableWithContext(context: ResolvedUserContext, options?: DifyLookupOptions) {
  if (isStatelessDemoLookup(options) && isDemoLoginEnabled()) {
    return true
  }

  const normalizedUserEmail = options?.userEmail?.trim().toLowerCase()
  if (!context.userId || !isDemoLoginEnabled()) {
    return normalizedUserEmail === DEMO_USER_EMAIL
  }

  const userId = context.userId
  try {
    const rows = await withDifyDbRetry("writer-mock-available", async () =>
      db
        .select({ isDemo: users.isDemo })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1),
    )

    return Boolean(rows[0]?.isDemo)
  } catch (error) {
    console.warn("dify.writer_mock_available.fallback", {
      userId: context.userId,
      userEmail: normalizedUserEmail,
      message: error instanceof Error ? error.message : String(error),
    })
    return normalizedUserEmail === DEMO_USER_EMAIL
  }
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
  return getLegacyDefaultDifyConfigWithContext(context, options)
}

async function getLegacyDefaultDifyConfigWithContext(context: ResolvedUserContext, options?: DifyLookupOptions) {
  if (isStatelessDemoLookup(options)) {
    return null
  }
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !context.userId) {
    return null
  }

  try {
    const userId = context.userId
    const defaultConns = await withDifyDbRetry("legacy-default-config.select-default", async () =>
      db
        .select()
        .from(difyConnections)
        .where(
          userId
            ? and(eq(difyConnections.isDefault, true), eq(difyConnections.userId, userId))
            : eq(difyConnections.isDefault, true),
        )
        .limit(1),
    )

    if (defaultConns.length > 0) {
      return {
        baseUrl: defaultConns[0].baseUrl,
        apiKey: defaultConns[0].apiKey || "",
      }
    }

    const anyConns = userId
      ? await withDifyDbRetry("legacy-default-config.select-any-user", async () =>
          db
            .select()
            .from(difyConnections)
            .where(eq(difyConnections.userId, userId))
            .orderBy(desc(difyConnections.createdAt))
            .limit(1),
        )
      : await withDifyDbRetry("legacy-default-config.select-any-global", async () =>
          db
            .select()
            .from(difyConnections)
            .orderBy(desc(difyConnections.createdAt))
            .limit(1),
        )

    if (anyConns.length > 0) {
      return {
        baseUrl: anyConns[0].baseUrl,
        apiKey: anyConns[0].apiKey || "",
      }
    }
  } catch (error) {
    console.warn("dify.legacy_default_config.fallback", {
      userId: context.userId,
      userEmail: options?.userEmail?.trim().toLowerCase() || null,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return null
}

async function getLegacyDifyConfigByName(name: string, options?: DifyLookupOptions, fallbackToDefault = true) {
  const context = await resolveUserContext(options)
  return getLegacyDifyConfigByNameWithContext(name, context, options, fallbackToDefault)
}

async function getLegacyDifyConfigByNameWithContext(
  name: string,
  context: ResolvedUserContext,
  options?: DifyLookupOptions,
  fallbackToDefault = true,
) {
  if (isStatelessDemoLookup(options)) {
    return fallbackToDefault ? getLegacyDefaultDifyConfigWithContext(context, options) : null
  }
  const scopedByUser = hasUserContext(options)

  if (scopedByUser && !context.userId) {
    return fallbackToDefault ? getLegacyDefaultDifyConfigWithContext(context, options) : null
  }

  try {
    const userId = context.userId
    const conns = await withDifyDbRetry("legacy-named-config.select", async () =>
      db
        .select()
        .from(difyConnections)
        .where(
          userId
            ? and(eq(difyConnections.name, name), eq(difyConnections.userId, userId))
            : eq(difyConnections.name, name),
        )
        .orderBy(desc(difyConnections.createdAt))
        .limit(1),
    )

    if (conns.length > 0) {
      return {
        baseUrl: conns[0].baseUrl,
        apiKey: conns[0].apiKey || "",
      }
    }
  } catch (error) {
    console.warn("dify.legacy_named_config.fallback", {
      name,
      userId: context.userId,
      userEmail: options?.userEmail?.trim().toLowerCase() || null,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  if (!fallbackToDefault) {
    return null
  }

  return getLegacyDefaultDifyConfigWithContext(context, options)
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

  const rows = await withDifyDbRetry("enterprise-advisor-override.select", async () =>
    db
      .select()
      .from(enterpriseDifyAdvisorConfigs)
      .where(and(eq(enterpriseDifyAdvisorConfigs.enterpriseId, enterpriseId), eq(enterpriseDifyAdvisorConfigs.advisorType, advisorType)))
      .limit(1),
  )

  const row = rows[0]
  if (!row) return null

  return {
    id: row.id,
    enterpriseId: row.enterpriseId,
    advisorType: row.advisorType,
    executionMode: normalizeLeadHunterExecutionMode(row.executionMode),
    baseUrl: row.baseUrl,
    apiKey: row.apiKey || "",
    enabled: Boolean(row.enabled),
  }
}

export async function listEnterpriseAdvisorOverrides(enterpriseId: number | null | undefined) {
  if (!enterpriseId || !Number.isFinite(enterpriseId) || enterpriseId <= 0) {
    return []
  }

  const rows = await withDifyDbRetry("enterprise-advisor-override.list", async () =>
    db
      .select()
      .from(enterpriseDifyAdvisorConfigs)
      .where(eq(enterpriseDifyAdvisorConfigs.enterpriseId, enterpriseId))
      .orderBy(desc(enterpriseDifyAdvisorConfigs.updatedAt), desc(enterpriseDifyAdvisorConfigs.id)),
  )

  return rows.map((row) => ({
    id: row.id,
    enterpriseId: row.enterpriseId,
    advisorType: row.advisorType,
    executionMode: normalizeLeadHunterExecutionMode(row.executionMode),
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
    executionMode?: LeadHunterExecutionMode
    baseUrl?: string
    apiKey?: string
  },
) {
  if (input.useDefault) {
    await withDifyDbRetry("enterprise-advisor-override.delete", async () =>
      db
        .delete(enterpriseDifyAdvisorConfigs)
        .where(and(eq(enterpriseDifyAdvisorConfigs.enterpriseId, enterpriseId), eq(enterpriseDifyAdvisorConfigs.advisorType, advisorType))),
    )
    return null
  }

  const existing = await getEnterpriseAdvisorOverride(enterpriseId, advisorType)
  const canUseSkillMode = advisorType === "lead-hunter"
  const executionMode = canUseSkillMode ? normalizeLeadHunterExecutionMode(input.executionMode) : "dify"
  const requiresDifyConfig = !(canUseSkillMode && executionMode === "skill")
  const sourceBaseUrl = normalizeOptional(input.baseUrl ?? existing?.baseUrl ?? null)
  const sourceApiKey = normalizeOptional(input.apiKey ?? existing?.apiKey ?? null)
  const baseUrl = requiresDifyConfig ? normalizeBaseUrl(sourceBaseUrl) : "skill://lead-hunter"
  const apiKey = requiresDifyConfig ? normalizeOptional(sourceApiKey) : "managed"
  const invalidPlaceholderConfig =
    requiresDifyConfig &&
    ((baseUrl && baseUrl.startsWith("skill://")) || apiKey === "managed")
  if (!baseUrl || !apiKey) {
    throw new Error("advisor_base_url_and_api_key_required")
  }
  if (invalidPlaceholderConfig) {
    throw new Error("advisor_base_url_and_api_key_required")
  }

  if (existing?.id) {
    await withDifyDbRetry("enterprise-advisor-override.update", async () =>
      db
        .update(enterpriseDifyAdvisorConfigs)
        .set({
          executionMode,
          baseUrl,
          apiKey,
          enabled: Boolean(input.enabled),
          updatedAt: new Date(),
        })
        .where(eq(enterpriseDifyAdvisorConfigs.id, existing.id)),
    )
  } else {
    await withDifyDbRetry("enterprise-advisor-override.insert", async () =>
      db.insert(enterpriseDifyAdvisorConfigs).values({
        enterpriseId,
        advisorType,
        executionMode,
        baseUrl,
        apiKey,
        enabled: Boolean(input.enabled),
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    )
  }

  return getEnterpriseAdvisorOverride(enterpriseId, advisorType)
}

async function getAdvisorConfig(
  advisorType: Exclude<AdvisorType, "copywriting">,
  options?: DifyLookupOptions,
  context?: ResolvedUserContext,
  config?: { includeSystemDefault?: boolean },
) {
  const resolvedContext = context || (await resolveUserContext(options))
  let enterpriseOverride = null
  try {
    enterpriseOverride = await getEnterpriseAdvisorOverride(resolvedContext.enterpriseId, advisorType)
  } catch (error) {
    console.warn("dify.enterprise_advisor_override.fallback", {
      enterpriseId: resolvedContext.enterpriseId,
      advisorType,
      message: getErrorMessage(error),
    })
  }
  if (enterpriseOverride && enterpriseOverride.enabled && enterpriseOverride.baseUrl && enterpriseOverride.apiKey) {
    const usesSkillPlaceholder =
      enterpriseOverride.baseUrl.startsWith("skill://") || enterpriseOverride.apiKey.trim().toLowerCase() === "managed"

    if (advisorType === "lead-hunter" && enterpriseOverride.executionMode === "skill") {
      return {
        source: "skill" as const,
        baseUrl: "skill://lead-hunter",
        apiKey: "managed",
        enterpriseId: resolvedContext.enterpriseId,
      }
    }

    if (advisorType !== "lead-hunter" && (enterpriseOverride.executionMode === "skill" || usesSkillPlaceholder)) {
      // Company Search / Contact Mining must stay on Dify workflow.
      return null
    }
    if (advisorType === "lead-hunter" && enterpriseOverride.executionMode !== "skill" && usesSkillPlaceholder) {
      return null
    }

    return {
      source: "enterprise" as const,
      baseUrl: enterpriseOverride.baseUrl,
      apiKey: enterpriseOverride.apiKey,
      enterpriseId: resolvedContext.enterpriseId,
    }
  }
  if (advisorType === "lead-hunter" || advisorType === "company-search" || advisorType === "contact-mining") {
    return null
  }

  if (config?.includeSystemDefault === false) {
    return null
  }

  const systemDefault = getSystemDefaultAdvisorConfig(advisorType)
  if (systemDefault) {
    return {
      source: "default" as const,
      baseUrl: systemDefault.baseUrl,
      apiKey: systemDefault.apiKey,
      enterpriseId: resolvedContext.enterpriseId,
    }
  }

  const legacyName = advisorType === "brand-strategy" ? "品牌战略顾问" : advisorType === "growth" ? "增长顾问" : null
  if (!legacyName) {
    return null
  }
  const legacyConfig = await getLegacyDifyConfigByNameWithContext(legacyName, context || resolvedContext, options, false)
  if (legacyConfig) {
    return {
      source: "legacy" as const,
      baseUrl: legacyConfig.baseUrl,
      apiKey: legacyConfig.apiKey,
      enterpriseId: resolvedContext.enterpriseId,
    }
  }

  return null
}

export async function getAdvisorAvailability(options?: DifyLookupOptions) {
  const context = await resolveUserContext(options)
  const [
    brandConfig,
    growthConfig,
    leadHunterConfig,
    companySearchConfig,
    contactMiningConfig,
    copywritingNamedConfig,
    defaultConfig,
    writerMockAvailable,
  ] =
    await Promise.all([
      getAdvisorConfig("brand-strategy", options, context),
      getAdvisorConfig("growth", options, context),
      getAdvisorConfig("lead-hunter", options, context, { includeSystemDefault: false }),
      getAdvisorConfig("company-search", options, context, { includeSystemDefault: false }),
      getAdvisorConfig("contact-mining", options, context, { includeSystemDefault: false }),
      hasDifyConfigByName("文案写作专家", options),
      getLegacyDefaultDifyConfigWithContext(context, options),
      isWriterMockAvailableWithContext(context, options),
    ])
  const copywriting = copywritingNamedConfig || Boolean(defaultConfig) || writerMockAvailable

  return {
    brandStrategy: Boolean(brandConfig),
    growth: Boolean(growthConfig),
    leadHunter: Boolean(leadHunterConfig),
    companySearch: Boolean(companySearchConfig),
    contactMining: Boolean(contactMiningConfig),
    copywriting,
    hasAny:
      Boolean(brandConfig) ||
      Boolean(growthConfig) ||
      Boolean(leadHunterConfig) ||
      Boolean(companySearchConfig) ||
      Boolean(contactMiningConfig) ||
      copywriting,
  }
}

export async function getDifyConfigByAdvisorType(advisorType?: string | null, options?: DifyLookupOptions) {
  const context = await resolveUserContext(options)
  const normalizedAdvisorType = normalizeAdvisorType(advisorType)
  if (normalizedAdvisorType === "brand-strategy") {
    const config = await getAdvisorConfig("brand-strategy", options, context)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (normalizedAdvisorType === "growth") {
    const config = await getAdvisorConfig("growth", options, context)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (normalizedAdvisorType === "lead-hunter") {
    const config = await getAdvisorConfig("lead-hunter", options, context)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (normalizedAdvisorType === "company-search") {
    const config = await getAdvisorConfig("company-search", options, context)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (normalizedAdvisorType === "contact-mining") {
    const config = await getAdvisorConfig("contact-mining", options, context)
    return config ? { baseUrl: config.baseUrl, apiKey: config.apiKey } : null
  }

  if (normalizedAdvisorType === "copywriting") {
    return getLegacyDifyConfigByName("文案写作专家", options, true)
  }

  return getLegacyDefaultDifyConfig(options)
}
