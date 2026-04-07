import { createHash, createHmac, timingSafeEqual, randomBytes } from "crypto"
import { and, eq, gt } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import {
  createRetryableDbErrorMatcher,
  getErrorMessage,
  isDbUnavailableError,
  withDbRetry,
} from "@/lib/db/retry"
import { enterprises, userFeaturePermissions, userSessions, users } from "@/lib/db/schema"
import { FEATURE_KEYS, buildPermissionMap } from "@/lib/enterprise/constants"
import { normalizeDisplayText } from "@/lib/text/display-name"

export const SESSION_COOKIE_NAME = "aimarketing_session"
export const DEMO_SESSION_COOKIE_NAME = "aimarketing_demo_session"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const SESSION_DB_RETRY_DELAYS_MS = [250, 750, 1500]
const SESSION_TOUCH_INTERVAL_MS = 1000 * 60 * 5
const DEFAULT_DEMO_SESSION_ID = 1

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function isLoopbackHost(host: string) {
  const normalized = host.trim().toLowerCase()
  const hostname = normalized.startsWith("[") ? normalized.split("]")[0]?.slice(1) || normalized : normalized.split(":")[0]
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
}

function shouldUseSecureCookie(request?: NextRequest) {
  const explicit = process.env.AUTH_COOKIE_SECURE?.toLowerCase()
  if (explicit === "true") return true
  if (explicit === "false") return false

  if (process.env.NODE_ENV !== "production") return false

  const forwardedProto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase()
  if (forwardedProto) return forwardedProto === "https"

  const protocol = request?.nextUrl?.protocol?.replace(":", "").toLowerCase()
  if (protocol) return protocol === "https"

  const host = request?.headers.get("host")
  if (host && isLoopbackHost(host)) return false

  return true
}

function getCookieOptions(expiresAt: Date, request?: NextRequest) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldUseSecureCookie(request),
    path: "/",
    expires: expiresAt,
  }
}

function getDemoCookieSecret() {
  return (
    process.env.DEMO_SESSION_SECRET ||
    process.env.STACK_SECRET_SERVER_KEY ||
    process.env.NEXTAUTH_SECRET ||
    process.env.PGPASSWORD ||
    "aimarketing-demo-secret"
  )
}

function encodeBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url")
}

function decodeBase64Url(value: string) {
  return Buffer.from(value, "base64url").toString("utf8")
}

function signDemoPayload(payload: string) {
  return createHmac("sha256", getDemoCookieSecret()).update(payload).digest("base64url")
}

function buildDemoCookieValue(expiresAt: Date) {
  const payload = JSON.stringify({
    mode: "demo",
    exp: expiresAt.getTime(),
  })
  const encodedPayload = encodeBase64Url(payload)
  return `${encodedPayload}.${signDemoPayload(encodedPayload)}`
}

function parseDemoCookieValue(value?: string | null) {
  if (!value) return null
  const [encodedPayload, signature] = value.split(".")
  if (!encodedPayload || !signature) return null

  const expectedSignature = signDemoPayload(encodedPayload)
  const signatureBuffer = new Uint8Array(Buffer.from(signature))
  const expectedBuffer = new Uint8Array(Buffer.from(expectedSignature))
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null
  }

  const payload = JSON.parse(decodeBase64Url(encodedPayload)) as { mode?: string; exp?: number }
  if (payload.mode !== "demo" || typeof payload.exp !== "number" || payload.exp <= Date.now()) {
    return null
  }

  return payload
}

export function createDemoAuthPayload() {
  const configuredDemoUserId = Number(process.env.DEMO_FALLBACK_USER_ID || DEFAULT_DEMO_SESSION_ID)
  return {
    id: Number.isFinite(configuredDemoUserId) && configuredDemoUserId > 0 ? configuredDemoUserId : DEFAULT_DEMO_SESSION_ID,
    email: "demo@example.com",
    name: "体验用户",
    isDemo: true,
    enterpriseId: null,
    enterpriseCode: "experience-enterprise",
    enterpriseName: "体验企业",
    enterpriseRole: "admin",
    enterpriseStatus: "active",
    permissions: buildPermissionMap(true),
  }
}

function getRequestUserAgent(request?: NextRequest) {
  return request?.headers.get("user-agent")?.slice(0, 1000) || null
}

function getRequestIpAddress(request?: NextRequest) {
  const forwardedFor = request?.headers.get("x-forwarded-for")
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim().slice(0, 64) || null
  }
  return request?.headers.get("x-real-ip")?.slice(0, 64) || null
}

const isRetryableSessionDbError = createRetryableDbErrorMatcher()

export function isSessionDbUnavailableError(error: unknown) {
  return isDbUnavailableError(error, isRetryableSessionDbError)
}

export async function withSessionDbRetry<T>(label: string, operation: () => Promise<T>) {
  return withDbRetry(label, operation, {
    retryDelaysMs: SESSION_DB_RETRY_DELAYS_MS,
    isRetryable: isRetryableSessionDbError,
    logPrefix: "auth.session.db.retry",
    exhaustedErrorPrefix: "auth_session_retry_exhausted",
  })
}

export function isDemoLoginEnabled() {
  if (process.env.ALLOW_DEMO_LOGIN === "true") return true
  return process.env.NODE_ENV === "development"
}

export async function createUserSession(userId: number, request?: NextRequest) {
  const sessionToken = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await withSessionDbRetry("create-user-session", async () => {
    await db.insert(userSessions).values({
      userId,
      tokenHash: hashSessionToken(sessionToken),
      expiresAt,
      lastSeenAt: new Date(),
      userAgent: getRequestUserAgent(request),
      ipAddress: getRequestIpAddress(request),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  return { sessionToken, expiresAt }
}

export async function getSessionUser(request: NextRequest) {
  const demoCookie = request.cookies.get(DEMO_SESSION_COOKIE_NAME)?.value
  if (parseDemoCookieValue(demoCookie)) {
    try {
      const rows = await withSessionDbRetry("get-session-user.demo-select", async () =>
        db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, "demo@example.com"))
          .limit(1),
      )

      const demoUserId = rows[0]?.id
      if (demoUserId) {
        const permissionRows = await withSessionDbRetry("get-session-user.demo-permissions", async () =>
          db
            .select({
              featureKey: userFeaturePermissions.featureKey,
              enabled: userFeaturePermissions.enabled,
            })
            .from(userFeaturePermissions)
            .where(eq(userFeaturePermissions.userId, demoUserId)),
        )

        const demoRows = await withSessionDbRetry("get-session-user.demo-payload", async () =>
          db
            .select({
              userId: users.id,
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
            .where(eq(users.id, demoUserId))
            .limit(1),
        )

        const demoUser = demoRows[0]
        if (demoUser) {
          const permissions = buildPermissionMap(false)
          for (const row of permissionRows) {
            if ((FEATURE_KEYS as readonly string[]).includes(row.featureKey)) {
              permissions[row.featureKey as (typeof FEATURE_KEYS)[number]] = Boolean(row.enabled)
            }
          }

          return {
            id: demoUser.userId,
            email: demoUser.email,
            name: normalizeDisplayText(demoUser.name) || "",
            isDemo: Boolean(demoUser.isDemo),
            enterpriseId: demoUser.enterpriseId,
            enterpriseCode: demoUser.enterpriseCode ?? "experience-enterprise",
            enterpriseName: normalizeDisplayText(demoUser.enterpriseName ?? null),
            enterpriseRole: demoUser.enterpriseRole ?? "admin",
            enterpriseStatus: demoUser.enterpriseStatus ?? "active",
            permissions,
          }
        }
      }
    } catch (error) {
      console.warn("auth.demo.cookie.resolve.failed", {
        message: getErrorMessage(error),
      })
    }

    return createDemoAuthPayload()
  }

  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!sessionToken) return null

  const now = new Date()
  const rows = await withSessionDbRetry("get-session-user.select", async () =>
    db
      .select({
        sessionId: userSessions.id,
        userId: users.id,
        lastSeenAt: userSessions.lastSeenAt,
        email: users.email,
        name: users.name,
        isDemo: users.isDemo,
        enterpriseId: users.enterpriseId,
        enterpriseRole: users.enterpriseRole,
        enterpriseStatus: users.enterpriseStatus,
        enterpriseCode: enterprises.enterpriseCode,
        enterpriseName: enterprises.name,
      })
      .from(userSessions)
      .innerJoin(users, eq(userSessions.userId, users.id))
      .leftJoin(enterprises, eq(users.enterpriseId, enterprises.id))
      .where(and(eq(userSessions.tokenHash, hashSessionToken(sessionToken)), gt(userSessions.expiresAt, now)))
      .limit(1),
  )

  if (rows.length === 0) return null

  const session = rows[0]
  const permissionRows = await withSessionDbRetry("get-session-user.permissions", async () =>
    db
      .select({
        featureKey: userFeaturePermissions.featureKey,
        enabled: userFeaturePermissions.enabled,
      })
      .from(userFeaturePermissions)
      .where(eq(userFeaturePermissions.userId, session.userId)),
  )

  const lastSeenValue = session.lastSeenAt as Date | string | null
  const lastSeenAt = lastSeenValue ? new Date(lastSeenValue) : null

  if (!lastSeenAt || now.getTime() - lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    void withSessionDbRetry("get-session-user.update", async () => {
      await db
        .update(userSessions)
        .set({
          lastSeenAt: now,
          updatedAt: now,
        })
        .where(eq(userSessions.id, session.sessionId))
    }).catch((error) => {
      console.warn("auth.session.touch.failed", {
        sessionId: session.sessionId,
        message: getErrorMessage(error),
      })
    })
  }

  const permissions = buildPermissionMap(false)
  for (const row of permissionRows) {
    if ((FEATURE_KEYS as readonly string[]).includes(row.featureKey)) {
      permissions[row.featureKey as (typeof FEATURE_KEYS)[number]] = Boolean(row.enabled)
    }
  }

  return {
    id: session.userId,
    email: session.email,
    name: normalizeDisplayText(session.name) || "",
    isDemo: Boolean(session.isDemo),
    enterpriseId: session.enterpriseId,
    enterpriseCode: session.enterpriseCode ?? null,
    enterpriseName: normalizeDisplayText(session.enterpriseName ?? null),
    enterpriseRole: session.enterpriseRole ?? null,
    enterpriseStatus: session.enterpriseStatus ?? null,
    permissions,
  }
}

export async function deleteSessionFromRequest(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!sessionToken) return

  await withSessionDbRetry("delete-session-from-request", async () => {
    await db.delete(userSessions).where(eq(userSessions.tokenHash, hashSessionToken(sessionToken)))
  })
}

export function applySessionCookie(response: NextResponse, sessionToken: string, expiresAt: Date, request?: NextRequest) {
  const secure = shouldUseSecureCookie(request)
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getCookieOptions(expiresAt, request))
  response.cookies.set(DEMO_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(0),
  })
  return response
}

export function applyDemoSessionCookie(response: NextResponse, expiresAt?: Date, request?: NextRequest) {
  const secure = shouldUseSecureCookie(request)
  const finalExpiresAt = expiresAt || new Date(Date.now() + SESSION_TTL_MS)
  response.cookies.set(DEMO_SESSION_COOKIE_NAME, buildDemoCookieValue(finalExpiresAt), getCookieOptions(finalExpiresAt, request))
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(0),
  })
  return response
}

export function clearSessionCookie(response: NextResponse, request?: NextRequest) {
  const secure = shouldUseSecureCookie(request)
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(0),
  })
  response.cookies.set(DEMO_SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires: new Date(0),
  })
  return response
}
