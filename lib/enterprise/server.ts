import { createHash, randomBytes } from "crypto"
import { and, eq, desc } from "drizzle-orm"

import { db } from "@/lib/db"
import { enterprises, enterpriseJoinRequests, userFeaturePermissions, users } from "@/lib/db/schema"
import { FEATURE_KEYS, type FeatureKey, buildPermissionMap, type PermissionMap } from "@/lib/enterprise/constants"

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
    name: row.name,
    isDemo: Boolean(row.isDemo),
    enterpriseId: row.enterpriseId,
    enterpriseCode: row.enterpriseCode ?? null,
    enterpriseName: row.enterpriseName ?? null,
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
}
