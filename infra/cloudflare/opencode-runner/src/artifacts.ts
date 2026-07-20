import type { RuntimeArtifactPayload } from "../../../../lib/ai-runtime/contracts"

type SandboxArtifactApi = {
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

function extension(fileName: string) {
  return fileName.split(".").at(-1)?.toLowerCase() || ""
}

function mimeType(fileName: string) {
  const ext = extension(fileName)
  if (ext === "md" || ext === "markdown") return "text/markdown"
  if (ext === "txt") return "text/plain"
  if (ext === "json") return "application/json"
  if (ext === "csv") return "text/csv"
  if (ext === "html") return "text/html"
  if (ext === "pdf") return "application/pdf"
  if (ext === "pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (ext === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (ext === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  if (ext === "png") return "image/png"
  if (ext === "svg") return "image/svg+xml"
  return "application/octet-stream"
}

async function readBase64(sandbox: SandboxArtifactApi, path: string) {
  const value = await sandbox.readFile(path, { encoding: "base64" })
  const content = value && typeof value === "object" && "content" in value ? (value as { content?: unknown }).content : value
  if (typeof content === "string") return content.replace(/\s+/g, "")
  if (content instanceof Uint8Array) return Buffer.from(content).toString("base64")
  throw new Error("runtime_artifact_read_failed")
}

type ArtifactRecord = { record: Record<string, unknown>; fullPath?: string }

function allowedFullPath(path: string, runDir: string) {
  return path.startsWith(`${runDir}/`) || path.startsWith("/opt/dashiai-ppt/project/") || path.startsWith("/workspace/output/")
}

function findExpression(allowedExtensions: string[]) {
  const patterns = [...new Set(allowedExtensions
    .map((extension) => extension.replace(/^\./, "").toLowerCase())
    .filter((extension) => /^[a-z0-9]+$/.test(extension)))]
    .map((extension) => `-iname '*.${extension}'`)
  return patterns.length > 0 ? `\\( ${patterns.join(" -o ")} \\)` : "-false"
}

async function discoverDashiArtifacts(sandbox: SandboxArtifactApi, runDir: string, allowedExtensions: string[]): Promise<ArtifactRecord[]> {
  const roots = [`${runDir}/artifacts`, `${runDir}`, "/opt/dashiai-ppt/project", "/workspace/output"]
  const rootArgs = roots.map((root) => JSON.stringify(root)).join(" ")
  const result = await sandbox.exec(`find ${rootArgs} -type f ${findExpression(allowedExtensions)} -print 2>/dev/null | head -200`)
  const records: ArtifactRecord[] = []
  const seen = new Set<string>()
  for (const fullPath of (result.stdout || "").split(/\r?\n/).map((value) => value.trim())) {
    if (!fullPath || seen.has(fullPath) || !allowedFullPath(fullPath, runDir)) continue
    seen.add(fullPath)
    const relativePath = fullPath.startsWith(`${runDir}/`)
      ? fullPath.slice(`${runDir}/`.length).replace(/^artifacts\//u, "")
      : fullPath.startsWith("/opt/dashiai-ppt/project/")
        ? `dashi/${fullPath.slice("/opt/dashiai-ppt/project/".length)}`
        : `dashi-output/${fullPath.slice("/workspace/output/".length)}`
    if (!relativePath || relativePath.split("/").some((segment) => !segment || segment === "." || segment === "..")) continue
    records.push({ record: { path: `artifacts/${relativePath}` }, fullPath })
  }
  return records
}

export async function collectRunArtifacts(sandbox: SandboxArtifactApi, runDir: string, input: {
  maxArtifacts: number
  maxArtifactBytes: number
  maxArtifactTotalBytes: number
  allowedExtensions: string[]
  discoverDashi?: boolean
}) {
  let manifest: unknown = null
  let manifestWarning: "runtime_artifact_manifest_missing" | "runtime_artifact_manifest_invalid" | null = null
  try {
    const raw = await sandbox.readFile(`${runDir}/artifact-manifest.json`, { encoding: "utf8" })
    const content = raw && typeof raw === "object" && "content" in raw ? (raw as { content?: unknown }).content : raw
    if (typeof content === "string") manifest = JSON.parse(content)
    else manifestWarning = "runtime_artifact_manifest_missing"
  } catch {
    manifestWarning = "runtime_artifact_manifest_missing"
  }
  const manifestItems = Array.isArray(manifest)
    ? manifest
    : manifest && typeof manifest === "object"
      ? ((manifest as Record<string, unknown>).artifacts ?? (manifest as Record<string, unknown>).files ?? (manifest as Record<string, unknown>).items)
      : null
  if (manifest && !Array.isArray(manifestItems)) manifestWarning = "runtime_artifact_manifest_invalid"
  const records: ArtifactRecord[] = []
  if (Array.isArray(manifestItems)) {
    for (const item of manifestItems) {
      if (!item || typeof item !== "object") continue
      const record = item as Record<string, unknown>
      const relativePath = typeof record.path === "string" ? safeArtifactPath(record.path) : null
      if (!relativePath) continue
      const requestedFullPath = typeof record.fullPath === "string" && allowedFullPath(record.fullPath, runDir) ? record.fullPath : undefined
      records.push({ record: { ...record, path: `artifacts/${relativePath}` }, fullPath: requestedFullPath })
    }
  }
  if (records.length === 0 && input.discoverDashi) records.push(...await discoverDashiArtifacts(sandbox, runDir, input.allowedExtensions))
  if (records.length === 0) return { artifacts: [] as RuntimeArtifactPayload[], warnings: manifestWarning ? [manifestWarning] : [] }

  const allowed = new Set(input.allowedExtensions.map((value) => value.replace(/^\./, "").toLowerCase()))
  const artifacts: RuntimeArtifactPayload[] = []
  const warnings: string[] = manifestWarning ? [manifestWarning] : []
  let totalBytes = 0
  for (const { record, fullPath: requestedFullPath } of records.slice(0, input.maxArtifacts)) {
    const relativePath = typeof record.path === "string" ? safeArtifactPath(record.path) : null
    if (!relativePath || !allowed.has(extension(relativePath))) {
      warnings.push("runtime_artifact_path_invalid")
      continue
    }
    const fullPath = requestedFullPath || `${runDir}/artifacts/${relativePath}`
    const symlink = await sandbox.exec(`test -L -- ${JSON.stringify(fullPath)}`)
    if (symlink.success) {
      warnings.push("runtime_artifact_symlink_rejected")
      continue
    }
    try {
      const contentBase64 = await readBase64(sandbox, fullPath)
      const content = Buffer.from(contentBase64, "base64")
      if (content.byteLength > input.maxArtifactBytes || totalBytes + content.byteLength > input.maxArtifactTotalBytes) {
        warnings.push("runtime_artifact_size_exceeded")
        continue
      }
      totalBytes += content.byteLength
      artifacts.push({
        path: `artifacts/${relativePath}`,
        title: typeof record.title === "string" && record.title.trim() ? record.title.trim().slice(0, 255) : relativePath,
        kind: typeof record.kind === "string" && record.kind.trim() ? record.kind.trim().slice(0, 64) : "file",
        mimeType: mimeType(relativePath),
        sizeBytes: content.byteLength,
        contentBase64,
      })
    } catch {
      warnings.push("runtime_artifact_read_failed")
    }
  }
  if (records.length > input.maxArtifacts) warnings.push("runtime_artifact_count_exceeded")
  return { artifacts, warnings }
}
