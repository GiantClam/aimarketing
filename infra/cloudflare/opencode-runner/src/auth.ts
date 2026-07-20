const SIGNATURE_MAX_AGE_SECONDS = 300

export type NonceStore = {
  get(key: string): Promise<unknown>
  put(key: string, value: unknown, options?: { expirationTtl?: number }): Promise<void>
}

function fromHex(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) return null
  const bytes = new Uint8Array(value.length / 2)
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return bytes
}

async function digestHex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export async function verifyRunnerSignature(request: Request, body: string, secret: string, nonceStore: NonceStore, nowSeconds = Math.floor(Date.now() / 1000)) {
  const runId = request.headers.get("X-Idempotency-Key") || ""
  const timestamp = Number.parseInt(request.headers.get("X-Agent-Runner-Timestamp") || "", 10)
  const nonce = request.headers.get("X-Agent-Runner-Nonce") || ""
  const bodyHash = request.headers.get("X-Agent-Runner-Body-SHA256") || ""
  const signature = request.headers.get("X-Agent-Runner-Signature") || ""
  if (!isUuid(runId) || !nonce || !Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_MAX_AGE_SECONDS) throw new Error("runner_signature_invalid")
  if (await nonceStore.get(`nonce:${nonce}`)) throw new Error("runner_nonce_replayed")
  const calculatedBodyHash = await digestHex(body)
  if (calculatedBodyHash !== bodyHash) throw new Error("runner_body_hash_mismatch")
  const signatureBytes = fromHex(signature)
  if (!signatureBytes) throw new Error("runner_signature_invalid")
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
  const valid = await crypto.subtle.verify("HMAC", key, signatureBytes, new TextEncoder().encode(`${timestamp}.${nonce}.${bodyHash}`))
  if (!valid) throw new Error("runner_signature_invalid")
  await nonceStore.put(`nonce:${nonce}`, true, { expirationTtl: SIGNATURE_MAX_AGE_SECONDS + 30 })
  return { runId, timestamp, nonce }
}
