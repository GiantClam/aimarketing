function encodeBase64Url(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

function decodeBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - (value.length % 4)) % 4)
  const binary = atob(normalized)
  return new Uint8Array([...binary].map((character) => character.charCodeAt(0)))
}

async function sign(secret: string, payload: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))
}

export async function createEventTicket(input: { runId: string; secret: string; nowSeconds?: number; ttlSeconds?: number }) {
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  const payload = JSON.stringify({ v: 1, runId: input.runId, scope: "events:read", exp: now + (input.ttlSeconds ?? 300), nonce: crypto.randomUUID() })
  const encodedPayload = encodeBase64Url(payload)
  return `${encodedPayload}.${encodeBase64Url(await sign(input.secret, encodedPayload))}`
}

export async function verifyEventTicket(token: string, input: { runId: string; secret: string; nowSeconds?: number }) {
  const [encodedPayload, encodedSignature] = token.split(".")
  if (!encodedPayload || !encodedSignature) return false
  let payload: { v?: unknown; runId?: unknown; scope?: unknown; exp?: unknown }
  try {
    payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload)))
  } catch {
    return false
  }
  if (payload.v !== 1 || payload.runId !== input.runId || payload.scope !== "events:read" || typeof payload.exp !== "number") return false
  if (payload.exp <= (input.nowSeconds ?? Math.floor(Date.now() / 1000))) return false
  const expected = await sign(input.secret, encodedPayload)
  const actual = decodeBase64Url(encodedSignature)
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) difference |= expected[index] ^ actual[index]
  return difference === 0
}

export function allowedEventOrigin(request: Request, configuredOrigins: string) {
  const origin = request.headers.get("Origin")
  if (!origin) return null
  const allowed = configuredOrigins.split(",").map((value) => value.trim()).filter(Boolean)
  return allowed.includes(origin) ? origin : null
}
