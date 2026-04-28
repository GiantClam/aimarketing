import { createHash, randomBytes } from "crypto"
import { and, eq, isNull } from "drizzle-orm"
import { type NextRequest } from "next/server"

import { db } from "@/lib/db"
import { emailVerificationTokens, users } from "@/lib/db/schema"
import { buildAppUrl } from "@/lib/app-url"
import { recordAuthSmokeEmail } from "@/lib/auth/smoke-capture"

const EMAIL_VERIFICATION_TTL_MS = 1000 * 60 * 60 * 24
const CLOUDFLARE_EMAIL_API_BASE = "https://api.cloudflare.com/client/v4/accounts"

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

function requireEmailServiceConfig() {
  const accountId = process.env.CLOUDFLARE_EMAIL_ACCOUNT_ID?.trim()
  const apiToken = process.env.CLOUDFLARE_EMAIL_API_TOKEN?.trim()
  const from = process.env.CLOUDFLARE_EMAIL_FROM?.trim()

  if (!accountId || !apiToken || !from) {
    throw new Error("cloudflare_email_service_not_configured")
  }

  return { accountId, apiToken, from }
}

export function buildEmailVerificationUrl(request: NextRequest, token: string) {
  const url = new URL(buildAppUrl("/verify-email", request.url))
  url.searchParams.set("token", token)
  return url.toString()
}

export function buildVerificationEmailContent(params: {
  name: string
  verificationUrl: string
}) {
  const title = "Verify your email / 验证邮箱"
  const safeName = escapeHtml(params.name || "there")
  const safeVerificationUrl = escapeHtml(params.verificationUrl)
  const html = `
    <div style="font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #111827;">
      <h1 style="font-size: 20px; margin: 0 0 16px;">${title}</h1>
      <p style="margin: 0 0 12px;">Hi ${safeName},</p>
      <p style="margin: 0 0 12px;">Please verify your email address to finish creating your AI Marketing account.</p>
      <p style="margin: 0 0 12px;">请先验证邮箱地址，才能完成 AI Marketing 账号注册。</p>
      <p style="margin: 24px 0;">
        <a href="${safeVerificationUrl}" style="display: inline-block; background: #111827; color: #ffffff; padding: 12px 18px; border-radius: 9999px; text-decoration: none;">
          Verify email
        </a>
      </p>
      <p style="margin: 0 0 8px; color: #4b5563;">This link expires in 24 hours.</p>
      <p style="margin: 0; color: #4b5563;">链接将在 24 小时后失效。</p>
    </div>
  `
  const text = [
    title,
    "",
    `Hi ${params.name || "there"},`,
    "Please verify your email address to finish creating your AI Marketing account.",
    "请先验证邮箱地址，才能完成 AI Marketing 账号注册。",
    "",
    `Verify: ${params.verificationUrl}`,
    "",
    "This link expires in 24 hours.",
    "链接将在 24 小时后失效。",
  ].join("\n")

  return { subject: title, html, text }
}

export async function sendCloudflareEmail(options: {
  to: string
  subject: string
  html: string
  text: string
}) {
  const { accountId, apiToken, from } = requireEmailServiceConfig()
  const response = await fetch(`${CLOUDFLARE_EMAIL_API_BASE}/${accountId}/email/sending/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: options.to,
      from,
      subject: options.subject,
      html: options.html,
      text: options.text,
    }),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok || json?.success === false) {
    const detail =
      json?.errors?.[0]?.message ||
      json?.error ||
      `status_${response.status}`
    throw new Error(`cloudflare_email_send_failed:${detail}`)
  }

  return json
}

export async function issueEmailVerificationToken(userId: number) {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS)

  await db.transaction(async (tx) => {
    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId))
    await tx.insert(emailVerificationTokens).values({
      userId,
      tokenHash,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })

  return { token, expiresAt }
}

export async function resendEmailVerification(params: {
  userId: number
  email: string
  name: string
  verificationUrlBuilder: (token: string) => string
}) {
  const { token } = await issueEmailVerificationToken(params.userId)
  const verificationUrl = params.verificationUrlBuilder(token)
  const content = buildVerificationEmailContent({
    name: params.name,
    verificationUrl,
  })

  await sendCloudflareEmail({
    to: normalizeEmail(params.email),
    subject: content.subject,
    html: content.html,
    text: content.text,
  })

  await recordAuthSmokeEmail({
    kind: "email_verification",
    email: normalizeEmail(params.email),
    url: verificationUrl,
    userId: params.userId,
    createdAt: new Date().toISOString(),
  })

  return { verificationUrl }
}

export async function consumeEmailVerificationToken(rawToken: string) {
  const tokenHash = hashToken(rawToken.trim())
  const now = new Date()

  const rows = await db
    .select({
      tokenId: emailVerificationTokens.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      emailVerified: users.emailVerified,
      enterpriseStatus: users.enterpriseStatus,
    })
    .from(emailVerificationTokens)
    .innerJoin(users, eq(emailVerificationTokens.userId, users.id))
    .where(
      and(
        eq(emailVerificationTokens.tokenHash, tokenHash),
        isNull(emailVerificationTokens.usedAt),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null

  const tokenRecord = await db
    .select({ expiresAt: emailVerificationTokens.expiresAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.id, row.tokenId))
    .limit(1)

  const expiresAtValue = tokenRecord[0]?.expiresAt
  const expiresAt = expiresAtValue ? new Date(expiresAtValue) : null
  if (!expiresAt || expiresAt.getTime() <= now.getTime()) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, row.tokenId))
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
      .update(emailVerificationTokens)
      .set({
        usedAt: now,
        updatedAt: now,
      })
      .where(eq(emailVerificationTokens.id, row.tokenId))

    await tx.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, row.userId))
  })

  return {
    userId: row.userId,
    email: row.email,
    name: row.name,
    emailVerified: row.emailVerified,
    enterpriseStatus: row.enterpriseStatus,
  }
}

export function normalizeVerificationEmail(value: string) {
  return normalizeEmail(value)
}
