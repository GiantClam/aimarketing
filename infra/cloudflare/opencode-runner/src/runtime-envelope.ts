import type { CloudflareSessionRunRequest } from "../../../../lib/ai-runtime/contracts"

export const MAX_RUNTIME_ENVELOPE_BYTES = 96 * 1024

export function runtimeDispatchKey(runId: string) {
  return `runtime-dispatch/${runId}.json`
}

export async function writeRuntimeDispatchEnvelope(bucket: R2Bucket, request: CloudflareSessionRunRequest) {
  const body = JSON.stringify({ version: 2, createdAt: new Date().toISOString(), request })
  if (new TextEncoder().encode(body).byteLength > MAX_RUNTIME_ENVELOPE_BYTES) throw new Error("runtime_envelope_too_large")
  const key = runtimeDispatchKey(request.runId)
  await bucket.put(key, body, { httpMetadata: { contentType: "application/json" } })
  return key
}

export async function readRuntimeDispatchEnvelope(bucket: R2Bucket, runId: string) {
  const object = await bucket.get(runtimeDispatchKey(runId))
  if (!object) return null
  const body = await object.text()
  const value = JSON.parse(body) as { request?: CloudflareSessionRunRequest }
  return value.request || null
}

export async function deleteRuntimeDispatchEnvelope(bucket: R2Bucket, runId: string) {
  await bucket.delete(runtimeDispatchKey(runId))
}
