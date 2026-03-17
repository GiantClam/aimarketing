import { createHash, randomBytes } from "crypto"
import { and, eq, desc, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprises, enterpriseJoinRequests, userFeaturePermissions, users } from "@/lib/db/schema"
import { FEATURE_KEYS, type FeatureKey, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"
import { normalizeDisplayText } from "@/lib/text/display-name"

export type AuthUserPayload = {
  id: number
  email: string
  name: string
  isDemo: boolean
  enterpriseId: number | null
  enterpriseCode: string | null
  enterpriseName: string | null
  enterpriseRole: string | null
  enterpriseStatus: string | null
  permissions: PermissionMap
}

export function hashPassword(password: string) {
  return createHash("sha256").update(password).digest("hex")
}

export function verifyPassword(input: string, hashed?: string | null) {
  if (!hashed) return false
  return hashPassword(input) === hashed
}

export function generateEnterpriseCode(name: string) {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)

  const rand = randomBytes(2).toString("hex")
  return `${normalized || "enterprise"}-${rand}`
}

let ensureEnterpriseAuthTablesPromise: Promise<void> | null = null

export async function ensureEnterpriseAuthTables() {
  if (!ensureEnterpriseAuthTablesPromise) {
    ensureEnterpriseAuthTablesPromise = (async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_users" (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          password VARCHAR(255),
          is_demo BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprises" (
          id SERIAL PRIMARY KEY,
          enterprise_code VARCHAR(64) NOT NULL UNIQUE,
          name VARCHAR(255) NOT NULL,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await db.execute(sql`
        ALTER TABLE "AI_MARKETING_users"
        ADD COLUMN IF NOT EXISTS enterprise_id INTEGER REFERENCES "AI_MARKETING_enterprises"(id)
      `)
      await db.execute(sql`
        ALTER TABLE "AI_MARKETING_users"
        ADD COLUMN IF NOT EXISTS enterprise_role VARCHAR(20) DEFAULT 'member'
      `)
      await db.execute(sql`
        ALTER TABLE "AI_MARKETING_users"
        ADD COLUMN IF NOT EXISTS enterprise_status VARCHAR(20) DEFAULT 'active'
      `)
      await db.execute(sql`
        ALTER TABLE "AI_MARKETING_users"
        ADD COLUMN IF NOT EXISTS is_demo BOOLEAN DEFAULT FALSE
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_enterprise_join_requests" (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
          enterprise_id INTEGER NOT NULL REFERENCES "AI_MARKETING_enterprises"(id),
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          note TEXT,
          reviewed_by INTEGER REFERENCES "AI_MARKETING_users"(id),
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_feature_permissions" (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
          feature_key VARCHAR(100) NOT NULL,
          enabled BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_user_feature_permissions_user_feature_idx"
        ON "AI_MARKETING_user_feature_permissions"(user_id, feature_key)
      `)

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS "AI_MARKETING_user_sessions" (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES "AI_MARKETING_users"(id),
          token_hash VARCHAR(64) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          user_agent TEXT,
          ip_address VARCHAR(64),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
      await db.execute(sql`
        CREATE UNIQUE INDEX IF NOT EXISTS "AI_MARKETING_user_sessions_token_hash_idx"
        ON "AI_MARKETING_user_sessions"(token_hash)
      `)
    })().catch((error) => {
      ensureEnterpriseAuthTablesPromise = null
      throw error
    })
  }

  await ensureEnterpriseAuthTablesPromise
}

export async function getPermissionMap(userId: number): Promise<PermissionMap> {
  const rows = await db
    .select({ featureKey: userFeaturePermissions.featureKey, enabled: userFeaturePermissions.enabled })
    .from(userFeaturePermissions)
    .where(eq(userFeaturePermissions.userId, userId))

  const map = buildPermissionMap(false)
  for (const row of rows) {
    if ((FEATURE_KEYS as readonly string[]).includes(row.featureKey)) {
      map[row.featureKey as FeatureKey] = Boolean(row.enabled)
    }
  }
  return map
}

export async function upsertPermissions(userId: number, permissionMap: Partial<PermissionMap>) {
  const updates = FEATURE_KEYS.map(async (featureKey) => {
    if (typeof permissionMap[featureKey] !== "boolean") return

    const exists = await db
      .select({ id: userFeaturePermissions.id })
      .from(userFeaturePermissions)
      .where(and(eq(userFeaturePermissions.userId, userId), eq(userFeaturePermissions.featureKey, featureKey)))
      .limit(1)

    if (exists.length > 0) {
      await db
        .update(userFeaturePermissions)
        .set({ enabled: permissionMap[featureKey], updatedAt: new Date() })
        .where(eq(userFeaturePermissions.id, exists[0].id))
      return
    }

    await db.insert(userFeaturePermissions).values({
      userId,
      featureKey,
      enabled: permissionMap[featureKey],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  await Promise.all(updates)
}

export async function ensurePermissions(userId: number, enabled: boolean) {
  const defaults = buildPermissionMap(enabled)
  await upsertPermissions(userId, defaults)
}

export async function getUserAuthPayload(userId: number): Promise<AuthUserPayload | null> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      isDemo: users.isDemo,
      enterpriseId: users.enterpriseId,
      enterpriseRole: users.enterpriseRole,
      enterpriseStatus: users.enterpriseStatus,
      enterpriseCode: enterprises.enterpriseCode,
      enterpriseName: enterprises.name,
    })
    .from(users)
    .leftJoin(enterprises, eq(users.enterpriseId, enterprises.id))
    .where(eq(users.id, userId))
    .limit(1)

  if (rows.length === 0) return null
  const row = rows[0]
  const permissions = await getPermissionMap(row.id)

  return {
    id: row.id,
    email: row.email,
    name: normalizeDisplayText(row.name) || "",
    isDemo: Boolean(row.isDemo),
    enterpriseId: row.enterpriseId,
    enterpriseCode: row.enterpriseCode ?? null,
    enterpriseName: normalizeDisplayText(row.enterpriseName ?? null),
    enterpriseRole: row.enterpriseRole ?? null,
    enterpriseStatus: row.enterpriseStatus ?? null,
    permissions,
  }
}

export async function isEnterpriseAdmin(userId: number) {
  const rows = await db
    .select({
      enterpriseRole: users.enterpriseRole,
      enterpriseStatus: users.enterpriseStatus,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (rows.length === 0) return false
  return rows[0].enterpriseRole === "admin" && rows[0].enterpriseStatus === "active"
}

export async function listPendingRequests(adminUserId: number) {
  const admin = await db
    .select({ enterpriseId: users.enterpriseId })
    .from(users)
    .where(eq(users.id, adminUserId))
    .limit(1)

  const enterpriseId = admin[0]?.enterpriseId
  if (!enterpriseId) return []

  return db
    .select({
      requestId: enterpriseJoinRequests.id,
      userId: users.id,
      userName: users.name,
      userEmail: users.email,
      createdAt: enterpriseJoinRequests.createdAt,
      note: enterpriseJoinRequests.note,
    })
    .from(enterpriseJoinRequests)
    .innerJoin(users, eq(enterpriseJoinRequests.userId, users.id))
    .where(and(eq(enterpriseJoinRequests.enterpriseId, enterpriseId), eq(enterpriseJoinRequests.status, "pending")))
    .orderBy(desc(enterpriseJoinRequests.createdAt))
    .then((rows) => rows.map((row) => ({ ...row, userName: normalizeDisplayText(row.userName) || "" })))
}
