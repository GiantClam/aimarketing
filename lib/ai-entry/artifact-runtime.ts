export type AiEntryArtifactKind = "pptx" | "html" | "pdf" | "image" | "markdown" | "report"

export type AiEntryArtifactDescriptor = {
  kind: AiEntryArtifactKind
  title: string | null
  fileName: string | null
  mimeType: string | null
  artifactId: number | null
  previewUrl: string | null
  downloadUrl: string | null
  workItemId: number | null
  toolRunId: number | null
}

export type AiEntryToolErrorResult = {
  ok: false
  error: {
    code: string
    message: string
  }
}

export type AiEntryValidationResult = {
  ok: boolean
  checks: Array<{
    code: string
    ok: boolean
    message: string
  }>
}

function readOptionalString(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function readOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function isAiEntryToolErrorResult(value: unknown): value is AiEntryToolErrorResult {
  if (!value || typeof value !== "object") return false
  const error = (value as { error?: unknown }).error
  return (value as { ok?: unknown }).ok === false && Boolean(error && typeof error === "object")
}

export function getAiEntryValidationResult(value: unknown): AiEntryValidationResult | null {
  if (!value || typeof value !== "object") return null
  const validation = (value as { validation?: unknown }).validation
  if (!validation || typeof validation !== "object") return null
  const checks = Array.isArray((validation as { checks?: unknown }).checks)
    ? (validation as { checks: Array<{ code?: unknown; ok?: unknown; message?: unknown }> }).checks
        .map((check) => ({
          code: readOptionalString(check.code) || "validation_check",
          ok: check.ok === true,
          message: readOptionalString(check.message) || "Validation check completed.",
        }))
    : []

  return {
    ok: (validation as { ok?: unknown }).ok !== false,
    checks,
  }
}

export function extractAiEntryArtifactsFromToolResult(input: {
  toolName: string
  result: unknown
}): AiEntryArtifactDescriptor[] {
  if (input.toolName !== "export_ppt_deck" || !input.result || typeof input.result !== "object") {
    return []
  }
  if (isAiEntryToolErrorResult(input.result)) {
    return []
  }

  const artifact =
    (input.result as { artifact?: unknown }).artifact &&
    typeof (input.result as { artifact?: unknown }).artifact === "object"
      ? ((input.result as { artifact?: Record<string, unknown> }).artifact as Record<string, unknown>)
      : null

  const kind =
    readOptionalString(artifact?.kind) === "pptx" ? "pptx" : null

  if (!kind) return []

  return [
    {
      kind,
      title:
        readOptionalString(artifact?.title) ||
        readOptionalString((input.result as { title?: unknown }).title),
      fileName:
        readOptionalString(artifact?.fileName) ||
        readOptionalString((input.result as { fileName?: unknown }).fileName),
      mimeType:
        readOptionalString(artifact?.mimeType) ||
        readOptionalString((input.result as { contentType?: unknown }).contentType),
      artifactId:
        readOptionalNumber(artifact?.artifactId) ||
        readOptionalNumber((input.result as { artifactId?: unknown }).artifactId),
      previewUrl:
        readOptionalString(artifact?.previewUrl) ||
        readOptionalString((input.result as { previewUrl?: unknown }).previewUrl),
      downloadUrl:
        readOptionalString(artifact?.downloadUrl) ||
        readOptionalString((input.result as { downloadUrl?: unknown }).downloadUrl),
      workItemId:
        readOptionalNumber(artifact?.workItemId) ||
        readOptionalNumber((input.result as { workItemId?: unknown }).workItemId),
      toolRunId:
        readOptionalNumber(artifact?.toolRunId) ||
        readOptionalNumber((input.result as { toolRunId?: unknown }).toolRunId),
    },
  ]
}
