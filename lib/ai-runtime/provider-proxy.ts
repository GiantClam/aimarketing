import { createHmac, randomUUID, timingSafeEqual } from "node:crypto"

type ProviderRouteClaims = {
  providerId: string
  modelId: string
  runId: string
  enterpriseId: number | null
  expiresAt: number
  nonce: string
}

function encode(value: string | object) {
  return Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url")
}

function signature(secret: string, payload: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url")
}

export function createProviderRouteToken(input: { secret: string; providerId: string; modelId: string; runId: string; enterpriseId: number | null; ttlMs?: number }) {
  const claims: ProviderRouteClaims = {
    providerId: input.providerId,
    modelId: input.modelId,
    runId: input.runId,
    enterpriseId: input.enterpriseId,
    expiresAt: Date.now() + Math.min(Math.max(input.ttlMs || 5 * 60 * 1000, 30_000), 60 * 60 * 1000),
    nonce: randomUUID(),
  }
  const payload = encode(claims)
  return `v1.${payload}.${signature(input.secret, payload)}`
}

export function verifyProviderRouteToken(token: string, secret: string) {
  const [version, payload, providedSignature] = token.split(".")
  if (version !== "v1" || !payload || !providedSignature) return null
  const expected = signature(secret, payload)
  const expectedBuffer = new Uint8Array(Buffer.from(expected))
  const providedBuffer = new Uint8Array(Buffer.from(providedSignature))
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) return null
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<ProviderRouteClaims>
    if (typeof claims.providerId !== "string" || typeof claims.modelId !== "string" || typeof claims.runId !== "string" || !/^[0-9a-f-]{36}$/iu.test(claims.runId) || (claims.enterpriseId !== null && typeof claims.enterpriseId !== "number") || typeof claims.expiresAt !== "number" || claims.expiresAt <= Date.now()) return null
    return claims as ProviderRouteClaims
  } catch {
    return null
  }
}
