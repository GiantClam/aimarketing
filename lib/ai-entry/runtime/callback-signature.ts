function hex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function digest(value: string) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))))
}

async function signature(secret: string, value: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"])
  return { key, bytes: new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))) }
}

export async function createRuntimeCallbackHeaders(input: { body: string; secret: string; timestamp?: number; nonce?: string }) {
  const timestamp = input.timestamp ?? Math.floor(Date.now() / 1000)
  const nonce = input.nonce || crypto.randomUUID()
  const bodyHash = await digest(input.body)
  const signed = await signature(input.secret, `${timestamp}.${nonce}.${bodyHash}`)
  return {
    "Content-Type": "application/json",
    "X-Agent-Runner-Timestamp": String(timestamp),
    "X-Agent-Runner-Nonce": nonce,
    "X-Agent-Runner-Body-SHA256": bodyHash,
    "X-Agent-Runner-Signature": hex(signed.bytes),
  }
}

export async function verifyRuntimeCallback(input: { body: string; headers: Headers; secret: string; nowSeconds?: number }) {
  const timestamp = Number.parseInt(input.headers.get("X-Agent-Runner-Timestamp") || "", 10)
  const nonce = input.headers.get("X-Agent-Runner-Nonce") || ""
  const bodyHash = input.headers.get("X-Agent-Runner-Body-SHA256") || ""
  const provided = input.headers.get("X-Agent-Runner-Signature") || ""
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (!nonce || !Number.isFinite(timestamp) || Math.abs(now - timestamp) > 300 || bodyHash !== await digest(input.body)) return false
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
  const raw = provided.match(/^[0-9a-f]{64}$/i)
  if (!raw) return false
  const bytes = new Uint8Array(raw[0].match(/.{2}/g)!.map((value) => Number.parseInt(value, 16)))
  return crypto.subtle.verify("HMAC", key, bytes, new TextEncoder().encode(`${timestamp}.${nonce}.${bodyHash}`))
}
