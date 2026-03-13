import { createHash, randomBytes } from "crypto"
import { and, eq, gt } from "drizzle-orm"
import { type NextRequest, NextResponse } from "next/server"

import { db } from "@/lib/db"
import { userSessions } from "@/lib/db/schema"
import { getUserAuthPayload } from "@/lib/enterprise/server"

export const SESSION_COOKIE_NAME = "aimarketing_session"
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30
const SESSION_DB_RETRY_DELAYS_MS = [250, 750]

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function getCookieOptions(expiresAt: Date) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return String(error)
}

function isRetryableSessionDbError(error: unknown) {
  const message = getErrorMessage(error)
  const causeMessage =
    error && typeof error === "object" && "cause" in error ? getErrorMessage((error as { cause?: unknown }).cause) : ""
  const combined = `${message} ${causeMessage}`.toLowerCase()

  return (
    combined.includes("error connecting to database") ||
    combined.includes("fetch failed") ||
    combined.includes("connect timeout") ||
    combined.includes("econnreset") ||
    combined.includes("und_err_connect_timeout")
  )
}

async function withSessionDbRetry<T>(label: string, operation: () => Promise<T>) {
  for (let attempt = 0; attempt <= SESSION_DB_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isRetryableSessionDbError(error) || attempt === SESSION_DB_RETRY_DELAYS_MS.length) {
        throw error
      }

      console.warn("auth.session.db.retry", {
        label,
        attempt: attempt + 1,
        message: getErrorMessage(error),
      })
      await sleep(SESSION_DB_RETRY_DELAYS_MS[attempt])
    }
  }

  throw new Error(`auth_session_retry_exhausted:${label}`)
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
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!sessionToken) return null

  const rows = await withSessionDbRetry("get-session-user.select", async () =>
    db
      .select({
        id: userSessions.id,
        userId: userSessions.userId,
      })
      .from(userSessions)
      .where(and(eq(userSessions.tokenHash, hashSessionToken(sessionToken)), gt(userSessions.expiresAt, new Date())))
      .limit(1),
  )

  if (rows.length === 0) return null

  const session = rows[0]
  await withSessionDbRetry("get-session-user.update", async () => {
    await db
      .update(userSessions)
      .set({
        lastSeenAt: new Date(),
        updatedAt: new Date(),
        userAgent: getRequestUserAgent(request),
        ipAddress: getRequestIpAddress(request),
      })
      .where(eq(userSessions.id, session.id))
  })

  return withSessionDbRetry("get-session-user.payload", async () => getUserAuthPayload(session.userId))
}

export async function deleteSessionFromRequest(request: NextRequest) {
  const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value
  if (!sessionToken) return

  await withSessionDbRetry("delete-session-from-request", async () => {
    await db.delete(userSessions).where(eq(userSessions.tokenHash, hashSessionToken(sessionToken)))
  })
}

export function applySessionCookie(response: NextResponse, sessionToken: string, expiresAt: Date) {
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getCookieOptions(expiresAt))
  return response
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(0),
  })
  return response
}
