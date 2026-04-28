import { createHash, randomBytes } from "crypto"
import { and, eq, isNull } from "drizzle-orm"

import { db } from "@/lib/db"
import { buildAppUrl } from "@/lib/app-url"
import { passwordResetTokens, users } from "@/lib/db/schema"
import { sendCloudflareEmail } from "@/lib/auth/email-verification"
import { recordAuthSmokeEmail } from "@/lib/auth/smoke-capture"

const PASSWORD_RESET_TTL_MS = 1000 * 60 * 30

function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex")
}

function generateToken() {
  return randomBytes(32).toString("hex")
}

export function buildPasswordResetUrl(baseUrl: string, token: string) {
  const url = new URL(buildAppUrl("/reset-password", baseUrl))
  url.searchParams.set("token", token)
  return url.toString()
}

export function buildPasswordResetEmailContent(params: { name: string; resetUrl: string }) {
  const title = "Reset your password / 重置密码"
  const safeName = escapeHtml(params.name || "there")
  const safeResetUrl = escapeHtml(params.resetUrl)
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">${title}</h1>
      <p style="margin: 0 0 12px;">Hi ${safeName},</p>
      <p style="margin: 0 0 12px;">We received a request to reset your password for your AI Marketing account.</p>
      <p style="margin: 0 0 12px;">我们收到了重置 AI Marketing 账号密码的请求。</p>
      <p style="margin: 24px 0;">
        <a href="${safeResetUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 18px; border-radius: 9999px; text-decoration: none;">
          Reset password
        </a>
      </p>
      <p style="margin: 0 0 8px; color: #4b5563;">This link expires in 30 minutes.</p>
      <p style="margin: 0; color: #4b5563;">链接将在 30 分钟后失效。</p>
    </div>
  `
  const text = [
    title,
    "",
    `Hi ${params.name || "there"},`,
    "We received a request to reset your password for your AI Marketing account.",
    "我们收到了重置 AI Marketing 账号密码的请求。",
    "",
    `Reset: ${params.resetUrl}`,
    "",
    "This link expires in 30 minutes.",
    "链接将在 30 分钟后失效。",
  ].join("\n")

  return { subject: title, html, text }
}

export async function issuePasswordResetToken(
  userId: number,
  metadata?: { requestedIp?: string | null; userAgent?: string | null },
) {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS)
  const now = new Date()

  await db.transaction(async (tx) => {
    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, userId))
    await tx.insert(passwordResetTokens).values({
      userId,
      tokenHash,
      expiresAt,
      requestedIp: metadata?.requestedIp || null,
      userAgent: metadata?.userAgent || null,
      createdAt: now,
      updatedAt: now,
    })
  })

  return { token, expiresAt }
}

export async function sendPasswordResetEmail(params: {
  userId: number
  email: string
  name: string
  resetUrlBuilder: (token: string) => string
  requestedIp?: string | null
  userAgent?: string | null
}) {
  const { token } = await issuePasswordResetToken(params.userId, {
    requestedIp: params.requestedIp,
    userAgent: params.userAgent,
  })
  const resetUrl = params.resetUrlBuilder(token)
  const content = buildPasswordResetEmailContent({
    name: params.name,
    resetUrl,
  })

  await sendCloudflareEmail({
    to: normalizeEmail(params.email),
    subject: content.subject,
    html: content.html,
    text: content.text,
  })

  await recordAuthSmokeEmail({
    kind: "password_reset",
    email: normalizeEmail(params.email),
    url: resetUrl,
    userId: params.userId,
    createdAt: new Date().toISOString(),
  })

  return { resetUrl }
}

export async function consumePasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken.trim())
  const now = new Date()

  const rows = await db
    .select({
      tokenId: passwordResetTokens.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      enterpriseStatus: users.enterpriseStatus,
    })
    .from(passwordResetTokens)
    .innerJoin(users, eq(passwordResetTokens.userId, users.id))
    .where(
      and(
        eq(passwordResetTokens.tokenHash, tokenHash),
        isNull(passwordResetTokens.usedAt),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const tokenRecord = await db
    .select({ expiresAt: passwordResetTokens.expiresAt })
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.id, row.tokenId))
    .limit(1)

  const expiresAtValue = tokenRecord[0]?.expiresAt
  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    await db.delete(passwordResetTokens).where(eq(passwordResetTokens.id, row.tokenId))
    return null
  }

  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        emailVerified: true,
        updatedAt: now,
      })
      .where(eq(users.id, row.userId))

    await tx
      .update(passwordResetTokens)
      .set({
        usedAt: now,
        updatedAt: now,
      })
      .where(eq(passwordResetTokens.id, row.tokenId))

    await tx.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, row.userId))
  })

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    enterpriseStatus: row.enterpriseStatus,
  }
}
