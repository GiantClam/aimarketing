import type { RuntimeArtifactReference } from "../../../../lib/ai-runtime/contracts"

type ArtifactSandbox = {
  readFile(path: string, options?: { encoding?: string }): Promise<unknown>
  exec(command: string, options?: Record<string, unknown>): Promise<{ success?: boolean; stdout?: string }>
}

function safeArtifactPath(path: string) {
  const normalized = path.replaceAll("\\", "/")
  if (!normalized.startsWith("artifacts/")) return null
  const relativePath = normalized.slice("artifacts/".length)
  const segments = relativePath.split("/")
  if (!relativePath || segments.some((segment) => !segment || segment === "." || segment === "..")) return null
  return relativePath
}

function mimeType(fileName: string) {
  const ext = fileName.split(".").at(-1)?.toLowerCase()
  return ({ md: "text/markdown", markdown: "text/markdown", txt: "text/plain", json: "application/json", csv: "text/csv", html: "text/html", pdf: "application/pdf", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml" } as Record<string, string>)[ext || ""] || "application/octet-stream"
}

function artifactPriority(item: unknown) {
  if (!item || typeof item !== "object") return 100
  const path = typeof (item as Record<string, unknown>).path === "string"
    ? String((item as Record<string, unknown>).path)
    : ""
  const ext = path.split(".").at(-1)?.toLowerCase() || ""
  return ({ pptx: 0, html: 1, pdf: 2, png: 3, jpg: 3, jpeg: 3, webp: 3, svg: 4, md: 5, markdown: 5, txt: 6, json: 7 } as Record<string, number>)[ext] ?? 50
}

async function readBytes(sandbox: ArtifactSandbox, path: string) {
  const value = await sandbox.readFile(path, { encoding: "none" }).catch(() => sandbox.readFile(path, { encoding: "base64" }))
  const record = value && typeof value === "object" ? value as { content?: unknown; encoding?: unknown } : null
  const content = record && "content" in record ? record.content : value
  if (content instanceof ReadableStream) return new Uint8Array(await new Response(content).arrayBuffer())
  if (content instanceof Uint8Array) return content
  if (typeof content === "string") {
    if (record?.encoding === "base64") {
      const binary = atob(content)
      const bytes = new Uint8Array(binary.length)
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
      return bytes
    }
    return new TextEncoder().encode(content)
  }
  throw new Error("runtime_artifact_read_failed")
}

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function findExpression(allowedExtensions: string[]) {
  const patterns = [...new Set(allowedExtensions
    .map((extension) => extension.replace(/^\./, "").toLowerCase())
    .filter((extension) => /^[a-z0-9]+$/.test(extension)))]
    .map((extension) => `-iname '*.${extension}'`)
  return patterns.length > 0 ? `\\( ${patterns.join(" -o ")} \\)` : "-false"
}

export async function publishRuntimeArtifactsV2(input: {
  bucket: R2Bucket
  sandbox: ArtifactSandbox
  sessionKey: string
  runId: string
  sessionDir: string
  maxArtifacts: number
  maxArtifactBytes: number
  maxArtifactTotalBytes: number
  allowedExtensions: string[]
  allowPptx: boolean
}) {
  const turnDir = `${input.sessionDir}/turns/${input.runId}`
  const manifestRaw = await input.sandbox.readFile(`${turnDir}/artifact-manifest.json`, { encoding: "utf8" }).catch(() => null)
  const content = manifestRaw && typeof manifestRaw === "object" && "content" in manifestRaw ? (manifestRaw as { content?: unknown }).content : manifestRaw
  let manifestWarning: "runtime_artifact_manifest_missing" | "runtime_artifact_manifest_invalid" | null = typeof content === "string" ? null : "runtime_artifact_manifest_missing"
  let records: unknown[] = []
  if (typeof content === "string") {
    try {
      const parsed: unknown = JSON.parse(content)
      const candidate = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object"
          ? ((parsed as Record<string, unknown>).artifacts ?? (parsed as Record<string, unknown>).files ?? (parsed as Record<string, unknown>).items)
          : null
      if (Array.isArray(candidate)) records = candidate
      else manifestWarning = "runtime_artifact_manifest_invalid"
    } catch {
      manifestWarning = "runtime_artifact_manifest_invalid"
    }
  }
  {
    // Native Dashi runs can finish with real files but without the platform's
    // manifest. Discover only the current turn and its persistent project
    // directories; never scan the container or trust a model-provided path.
    const dashiRoot = "/opt/dashiai-ppt/project"
    // The native Dashi exporter writes its final deck to the container-level
    // output root, not to the per-session workspace. Keep this root explicit
    // and only accept files newer than the current turn marker.
    const dashiOutputRoot = "/workspace/output"
    const sessionRoots = [`${turnDir}/artifacts`, `${turnDir}`, `${input.sessionDir}/final`, `${input.sessionDir}/project`, `${input.sessionDir}/workspace`]
    const findArgs = sessionRoots.map((root) => JSON.stringify(root)).join(" ")
    const findFiles = findExpression(input.allowedExtensions)
    const marker = `${turnDir}/.dashi-artifact-start`
    const discovered = await input.sandbox.exec(`{ find ${findArgs} -type f ${findFiles} -print 2>/dev/null; if [ -f ${JSON.stringify(marker)} ]; then find ${JSON.stringify(dashiRoot)} -newer ${JSON.stringify(marker)} -type f ${findFiles} -print 2>/dev/null; find ${JSON.stringify(dashiOutputRoot)} -newer ${JSON.stringify(marker)} -type f ${findFiles} -print 2>/dev/null; else find ${JSON.stringify(dashiRoot)} -mmin -180 -type f ${findFiles} -print 2>/dev/null; find ${JSON.stringify(dashiOutputRoot)} -mmin -180 -type f ${findFiles} -print 2>/dev/null; fi; } | head -200`)
    const seen = new Set<string>()
    const fallbackRecords = (discovered.stdout || "").split(/\r?\n/).map((path) => path.trim()).filter((path) => {
      if (!path || seen.has(path)) return false
      seen.add(path)
      return path.startsWith(`${turnDir}/`) || path.startsWith(`${input.sessionDir}/final/`) || path.startsWith(`${input.sessionDir}/project/`) || path.startsWith(`${input.sessionDir}/workspace/`) || path.startsWith(`${dashiRoot}/`) || path.startsWith(`${dashiOutputRoot}/`)
    }).map((fullPath) => {
      const relative = fullPath.startsWith(`${turnDir}/`)
        ? fullPath.slice(`${turnDir}/`.length)
        : fullPath.startsWith(`${dashiRoot}/`)
          ? `dashi/${fullPath.slice(`${dashiRoot}/`.length)}`
          : fullPath.startsWith(`${dashiOutputRoot}/`)
            ? `dashi-output/${fullPath.slice(`${dashiOutputRoot}/`.length)}`
          : fullPath.slice(`${input.sessionDir}/`.length)
      return { path: `artifacts/${relative.replace(/^artifacts\//u, "")}`, fullPath }
    })
    if (fallbackRecords.length > 0) records = [...records, ...fallbackRecords]
  }
  if (records.length === 0) return { artifacts: [] as RuntimeArtifactReference[], warnings: manifestWarning ? [manifestWarning] : [] }
  const allowed = new Set(input.allowedExtensions.map((item) => item.replace(/^\./, "").toLowerCase()))
  const artifacts: RuntimeArtifactReference[] = []
  const warnings: string[] = manifestWarning ? [manifestWarning] : []
  const seenRecordKeys = new Set<string>()
  let totalBytes = 0
  const prioritizedRecords = records
    .map((item, index) => ({ item, index }))
    .sort((left, right) => artifactPriority(left.item) - artifactPriority(right.item) || left.index - right.index)
    .map(({ item }) => item)
  for (const item of prioritizedRecords) {
    if (artifacts.length >= input.maxArtifacts) break
    if (!item || typeof item !== "object") { warnings.push("runtime_artifact_manifest_item_invalid"); continue }
    const record = item as Record<string, unknown>
    const recordKey = `${typeof record.path === "string" ? record.path : ""}|${typeof record.fullPath === "string" ? record.fullPath : ""}`
    if (seenRecordKeys.has(recordKey)) continue
    seenRecordKeys.add(recordKey)
    const relativePath = typeof record.path === "string" ? safeArtifactPath(record.path) : null
    const ext = relativePath?.split(".").at(-1)?.toLowerCase() || ""
    if (!relativePath || !allowed.has(ext)) { warnings.push("runtime_artifact_path_invalid"); continue }
    if (ext === "pptx" && !input.allowPptx) { warnings.push("runtime_artifact_export_confirmation_required"); continue }
    const fallbackFullPath = typeof record.fullPath === "string" && (record.fullPath.startsWith(`${turnDir}/`) || record.fullPath.startsWith(`${input.sessionDir}/final/`) || record.fullPath.startsWith(`${input.sessionDir}/project/`) || record.fullPath.startsWith(`${input.sessionDir}/workspace/`) || record.fullPath.startsWith("/opt/dashiai-ppt/project/") || record.fullPath.startsWith("/workspace/output/"))
      ? record.fullPath
      : null
    const fullPath = fallbackFullPath || `${turnDir}/artifacts/${relativePath}`
    const symlink = await input.sandbox.exec(`test -L -- ${JSON.stringify(fullPath)}`)
    if (symlink.success) { warnings.push("runtime_artifact_symlink_rejected"); continue }
    try {
      const bytes = await readBytes(input.sandbox, fullPath)
      if (bytes.byteLength > input.maxArtifactBytes || totalBytes + bytes.byteLength > input.maxArtifactTotalBytes) { warnings.push("runtime_artifact_size_exceeded"); continue }
      totalBytes += bytes.byteLength
      const key = `artifacts/${input.sessionKey}/${input.runId}/${relativePath}`
      const contentType = mimeType(relativePath)
      await input.bucket.put(key, bytes, { httpMetadata: { contentType, cacheControl: "public, max-age=31536000, immutable" } })
      artifacts.push({
        provider: "r2",
        bucket: "ARTIFACT_BUCKET",
        key,
        publicUrl: null,
        fileName: relativePath,
        mimeType: contentType,
        sizeBytes: bytes.byteLength,
        title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 255) : relativePath,
        kind: typeof record.kind === "string" && record.kind.trim() ? record.kind.trim().slice(0, 64) : "file",
        checksumSha256: await sha256(bytes),
      })
    } catch { warnings.push("runtime_artifact_publish_failed") }
  }
  if (records.length > input.maxArtifacts) warnings.push("runtime_artifact_count_exceeded")
  return { artifacts, warnings }
}
