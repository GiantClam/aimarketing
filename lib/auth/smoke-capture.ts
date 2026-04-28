import { appendFile, mkdir } from "fs/promises"
import path from "path"

type AuthSmokeKind = "email_verification" | "password_reset"

type AuthSmokeRecord = {
  kind: AuthSmokeKind
  email: string
  url: string
  userId: number
  createdAt: string
}

function resolveCapturePath() {
  const configured = process.env.AUTH_SMOKE_CAPTURE_PATH?.trim()
  if (configured) return configured
  if (process.env.NODE_ENV === "production") return ""
  return path.join(process.cwd(), "artifacts", "auth-smoke", "auth-emails.jsonl")
}

export async function recordAuthSmokeEmail(record: AuthSmokeRecord) {
  const capturePath = resolveCapturePath()
  if (!capturePath) return

  try {
    await mkdir(path.dirname(capturePath), { recursive: true })
    await appendFile(capturePath, `${JSON.stringify(record)}\n`, "utf8")
  } catch {
    // Best-effort capture for local regression only.
  }
}
