import { randomUUID } from "node:crypto"

import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { platformTaskRuns } from "@/lib/db/schema"
import {
  appendPlatformRunEvent,
  createPlatformTaskRun,
  getPlatformArtifact,
  getPlatformTaskRun,
  savePlatformArtifact,
  type HydratedPlatformTaskRun,
  type PlatformArtifactRecord,
  type PlatformTaskRunStatus,
} from "@/lib/platform/task-run-store"

export type MiniMaxAudioFeatureId = "ai-music" | "voice-clone" | "voice-synthesis"
export type MiniMaxVoiceType = "system" | "voice_cloning" | "voice_generation" | "all"
export type MiniMaxVoicePurpose = "voice_clone" | "prompt_audio"

export type MiniMaxNormalizedResult = {
  url?: string | null
  outputType?: string | null
  text?: string | null
  title?: string | null
}

export type MiniMaxNormalizedTask = {
  taskId: string
  mediaTarget: "ai-music"
  requestedTarget: MiniMaxAudioFeatureId
  provider: "minimax"
  status: "QUEUED" | "RUNNING" | "SUCCESS" | "FAILED"
  results: MiniMaxNormalizedResult[]
  extra?: Record<string, unknown> | null
  raw?: Record<string, unknown> | null
}

export type MiniMaxVoiceOption = {
  voiceId: string
  voiceName: string
  category: "system" | "voice_cloning" | "voice_generation"
  description: string[]
  createdTime: string | null
}

type MiniMaxRuntimeUser = {
  id: number
  enterpriseId: number | null
}

type MiniMaxBaseResp = {
  status_code?: number
  status_msg?: string
}

type MiniMaxVoiceRecord = {
  voice_id?: string
  voice_name?: string
  description?: string[]
  created_time?: string
}

type MiniMaxGetVoiceResponse = {
  system_voice?: MiniMaxVoiceRecord[]
  voice_cloning?: MiniMaxVoiceRecord[]
  voice_generation?: MiniMaxVoiceRecord[]
  base_resp?: MiniMaxBaseResp
}

type MiniMaxUploadResponse = {
  file?: {
    file_id?: number | string
    bytes?: number
    created_at?: number
    filename?: string
    purpose?: string
  }
  base_resp?: MiniMaxBaseResp
}

type MiniMaxVoiceCloneResponse = {
  input_sensitive?: boolean
  input_sensitive_type?: number
  demo_audio?: string
  extra_info?: Record<string, unknown> | null
  base_resp?: MiniMaxBaseResp
}

type MiniMaxLyricsResponse = {
  song_title?: string
  style_tags?: string
  lyrics?: string
  base_resp?: MiniMaxBaseResp
}

type MiniMaxMusicResponse = {
  data?: {
    audio?: string
    status?: number | string
  }
  trace_id?: string
  extra_info?: Record<string, unknown> | null
  analysis_info?: Record<string, unknown> | null
  base_resp?: MiniMaxBaseResp
}

type MiniMaxT2AAsyncCreateResponse = {
  task_id?: number | string
  task_token?: string
  file_id?: number | string
  usage_characters?: number
  base_resp?: MiniMaxBaseResp
}

type MiniMaxT2AAsyncQueryResponse = {
  task_id?: number | string
  status?: string
  file_id?: number | string
  base_resp?: MiniMaxBaseResp
}

export type MiniMaxAudioConfig = {
  baseUrl: string
  apiKey: string
}

export type MiniMaxDownloadedFile = {
  bytes: Uint8Array
  contentType: string
  fileName: string | null
}

type UpdateMiniMaxMediaRunPatch = {
  status?: PlatformTaskRunStatus
  normalizedResult?: Record<string, unknown> | null
  externalSystem?: string | null
  externalRunId?: string | null
  startedAt?: Date | null
  finishedAt?: Date | null
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function normalizeMiniMaxBaseUrl(value: string | undefined) {
  const trimmed = value?.trim() || "https://api.minimaxi.com/v1"
  return trimmed.replace(/\/+$/, "")
}

function toMiniMaxPath(path: string) {
  if (!path.startsWith("/")) return `/${path}`
  return path
}

function trimNullTerminatedAscii(input: Uint8Array) {
  const text = Buffer.from(input).toString("utf8")
  return text.replace(/\0.*$/, "").trim()
}

function parseTarOctal(value: string) {
  const normalized = value.replace(/\0.*$/, "").trim()
  if (!normalized) return 0
  return Number.parseInt(normalized, 8)
}

function detectContentTypeFromFileName(fileName: string) {
  const normalized = fileName.toLowerCase()
  if (normalized.endsWith(".mp3")) return "audio/mpeg"
  if (normalized.endsWith(".wav")) return "audio/wav"
  if (normalized.endsWith(".m4a")) return "audio/mp4"
  if (normalized.endsWith(".ogg")) return "audio/ogg"
  return "application/octet-stream"
}

function isTarArchiveBytes(bytes: Uint8Array) {
  if (bytes.byteLength < 512) return false
  return Buffer.from(bytes.subarray(257, 262)).toString("utf8") === "ustar"
}

export function extractMiniMaxAudioFileFromTar(bytes: Uint8Array): MiniMaxDownloadedFile | null {
  if (!isTarArchiveBytes(bytes)) return null

  let offset = 0
  let fallbackEntry: MiniMaxDownloadedFile | null = null

  while (offset + 512 <= bytes.byteLength) {
    const header = bytes.subarray(offset, offset + 512)
    const isEmptyBlock = header.every((value) => value === 0)
    if (isEmptyBlock) break

    const fileName = trimNullTerminatedAscii(header.subarray(0, 100))
    const size = parseTarOctal(trimNullTerminatedAscii(header.subarray(124, 136)))
    const typeFlag = trimNullTerminatedAscii(header.subarray(156, 157)) || "0"
    const contentStart = offset + 512
    const contentEnd = contentStart + size

    if (contentEnd > bytes.byteLength) break

    if (typeFlag === "0" && fileName) {
      const entryBytes = bytes.slice(contentStart, contentEnd)
      const entry = {
        bytes: entryBytes,
        contentType: detectContentTypeFromFileName(fileName),
        fileName: fileName.split("/").pop() || fileName,
      } satisfies MiniMaxDownloadedFile

      if (/\.(mp3|wav|m4a|ogg)$/i.test(fileName)) {
        return entry
      }

      if (!fallbackEntry) {
        fallbackEntry = entry
      }
    }

    offset = contentStart + Math.ceil(size / 512) * 512
  }

  return fallbackEntry
}

function assertMiniMaxSuccess(payload: { base_resp?: MiniMaxBaseResp } | null | undefined, fallback: string) {
  const statusCode = payload?.base_resp?.status_code
  if (statusCode === undefined || statusCode === 0) return
  throw new Error(payload?.base_resp?.status_msg || fallback)
}

function createMiniMaxHeaders(config: MiniMaxAudioConfig, contentType?: string) {
  const headers = new Headers()
  headers.set("Authorization", `Bearer ${config.apiKey}`)
  if (contentType) {
    headers.set("Content-Type", contentType)
  }
  return headers
}

function coerceStringId(value: string | number | null | undefined) {
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  if (typeof value === "string" && value.trim()) return value.trim()
  return null
}

function coerceNumericId(value: string | number | null | undefined) {
  const stringValue = coerceStringId(value)
  if (!stringValue) return null
  const numeric = Number(stringValue)
  return Number.isFinite(numeric) ? String(numeric) : null
}

function buildMiniMaxDownloadPath(fileId: string) {
  return `/api/platform/minimax/files/${encodeURIComponent(fileId)}/download`
}

function buildMiniMaxArtifactPath(artifactId: number) {
  return `/api/platform/minimax/artifacts/${artifactId}/download`
}

function mapMiniMaxStatus(value: string | null | undefined): MiniMaxNormalizedTask["status"] {
  const normalized = String(value || "").trim().toLowerCase()
  if (!normalized) return "RUNNING"
  if (normalized.includes("success") || normalized.includes("finish") || normalized.includes("complete") || normalized === "done") {
    return "SUCCESS"
  }
  if (normalized.includes("fail") || normalized.includes("error") || normalized.includes("cancel")) {
    return "FAILED"
  }
  if (normalized.includes("queue") || normalized.includes("pending")) {
    return "QUEUED"
  }
  return "RUNNING"
}

function normalizeStoredFileTitle(title: string) {
  const trimmed = title
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/(^[,\-.\s]+|[,\-.\s]+$)/g, "")

  return trimmed || "minimax-audio"
}

function splitFileNameExtension(fileName: string) {
  const match = fileName.match(/(\.[A-Za-z0-9]{1,8})$/)
  if (!match) {
    return {
      baseName: fileName,
      extension: "",
    }
  }

  return {
    baseName: fileName.slice(0, -match[1].length),
    extension: match[1],
  }
}

export function buildDownloadFileName(title: string, extension: string) {
  const base = normalizeStoredFileTitle(title)
  return `${base}.${extension.replace(/^\./, "")}`
}

function toAsciiDownloadFileName(fileName: string) {
  const { baseName, extension } = splitFileNameExtension(fileName)
  const normalizedBase = baseName
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^[,\-.\s]+|[,\-.\s]+$)/g, "")

  const safeBase = normalizeStoredFileTitle(normalizedBase)
  return `${safeBase}${extension || ".bin"}`
}

export function buildAttachmentContentDisposition(fileName: string) {
  const asciiFileName = toAsciiDownloadFileName(fileName)
  return `attachment; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`
}

export function getMiniMaxAudioConfig(): MiniMaxAudioConfig {
  return {
    baseUrl: normalizeMiniMaxBaseUrl(process.env.LEAD_TOOLS_MINIMAX_BASE_URL),
    apiKey: process.env.LEAD_TOOLS_MINIMAX_API_KEY?.trim() || "",
  }
}

export function isMiniMaxAudioConfigured(config = getMiniMaxAudioConfig()) {
  return Boolean(config.apiKey && config.baseUrl)
}

async function requestMiniMaxJson<T>(
  path: string,
  init: {
    method?: "GET" | "POST"
    query?: Record<string, string | number | null | undefined>
    body?: Record<string, unknown> | null
    config?: MiniMaxAudioConfig
  },
) {
  const config = init.config ?? getMiniMaxAudioConfig()
  if (!isMiniMaxAudioConfigured(config)) {
    throw new Error("minimax_not_configured")
  }

  const url = new URL(`${config.baseUrl}${toMiniMaxPath(path)}`)
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === null || value === undefined || value === "") continue
    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    method: init.method ?? "POST",
    headers: createMiniMaxHeaders(config, "application/json"),
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as T | null
  if (!response.ok) {
    const fallback =
      payload && typeof payload === "object" && payload && "base_resp" in payload
        ? ((payload as { base_resp?: MiniMaxBaseResp }).base_resp?.status_msg ?? "minimax_request_failed")
        : "minimax_request_failed"
    throw new Error(fallback)
  }

  return payload
}

async function uploadMiniMaxFile(
  purpose: MiniMaxVoicePurpose,
  file: File,
  config = getMiniMaxAudioConfig(),
) {
  if (!isMiniMaxAudioConfigured(config)) {
    throw new Error("minimax_not_configured")
  }

  const form = new FormData()
  form.set("purpose", purpose)
  form.set("file", file)

  const response = await fetch(`${config.baseUrl}/files/upload`, {
    method: "POST",
    headers: createMiniMaxHeaders(config),
    body: form,
    cache: "no-store",
  })

  const payload = (await response.json().catch(() => null)) as MiniMaxUploadResponse | null
  if (!response.ok) {
    throw new Error(payload?.base_resp?.status_msg || "minimax_upload_failed")
  }
  assertMiniMaxSuccess(payload, "minimax_upload_failed")

  const fileId = coerceNumericId(payload?.file?.file_id)
  if (!fileId) {
    throw new Error("minimax_upload_missing_file_id")
  }

  return {
    fileId,
    fileName: normalizeOptionalText(payload?.file?.filename) || file.name || "audio",
    purpose,
    sizeBytes: typeof payload?.file?.bytes === "number" ? payload.file.bytes : file.size,
    raw: payload,
  }
}

export async function listMiniMaxVoices(
  voiceType: MiniMaxVoiceType = "all",
  config = getMiniMaxAudioConfig(),
) {
  const payload = await requestMiniMaxJson<MiniMaxGetVoiceResponse>("/get_voice", {
    body: { voice_type: voiceType },
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_get_voice_failed")

  const mapCategory = (
    category: MiniMaxVoiceOption["category"],
    values: MiniMaxVoiceRecord[] | undefined,
  ): MiniMaxVoiceOption[] =>
    (values ?? [])
      .map((item) => {
        const voiceId = normalizeOptionalText(item.voice_id)
        if (!voiceId) return null
        return {
          voiceId,
          voiceName: normalizeOptionalText(item.voice_name) || voiceId,
          category,
          description: Array.isArray(item.description) ? item.description.filter((value) => typeof value === "string") : [],
          createdTime: normalizeOptionalText(item.created_time),
        } satisfies MiniMaxVoiceOption
      })
      .filter((item): item is MiniMaxVoiceOption => Boolean(item))

  return {
    voices: [
      ...mapCategory("system", payload?.system_voice),
      ...mapCategory("voice_cloning", payload?.voice_cloning),
      ...mapCategory("voice_generation", payload?.voice_generation),
    ],
    raw: payload,
  }
}

export async function createMiniMaxAsyncSpeechTask(
  body: Record<string, unknown>,
  config = getMiniMaxAudioConfig(),
) {
  const payload = await requestMiniMaxJson<MiniMaxT2AAsyncCreateResponse>("/t2a_async_v2", {
    body,
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_t2a_async_create_failed")

  const taskId = coerceStringId(payload?.task_id)
  if (!taskId) {
    throw new Error("minimax_t2a_async_missing_task_id")
  }

  return {
    taskId,
    fileId: coerceStringId(payload?.file_id),
    usageCharacters: typeof payload?.usage_characters === "number" ? payload.usage_characters : null,
    raw: payload,
  }
}

export async function queryMiniMaxAsyncSpeechTask(taskId: string, config = getMiniMaxAudioConfig()) {
  const payload = await requestMiniMaxJson<MiniMaxT2AAsyncQueryResponse>("/query/t2a_async_query_v2", {
    method: "GET",
    query: { task_id: taskId },
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_t2a_async_query_failed")
  return {
    taskId: coerceStringId(payload?.task_id) || taskId,
    fileId: coerceStringId(payload?.file_id),
    status: mapMiniMaxStatus(payload?.status),
    providerStatus: normalizeOptionalText(payload?.status),
    raw: payload,
  }
}

export async function cloneMiniMaxVoice(
  body: Record<string, unknown>,
  config = getMiniMaxAudioConfig(),
) {
  const payload = await requestMiniMaxJson<MiniMaxVoiceCloneResponse>("/voice_clone", {
    body,
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_voice_clone_failed")
  return {
    demoAudioUrl: normalizeOptionalText(payload?.demo_audio),
    extraInfo: payload?.extra_info ?? null,
    raw: payload,
  }
}

export async function generateMiniMaxLyrics(
  body: Record<string, unknown>,
  config = getMiniMaxAudioConfig(),
) {
  const payload = await requestMiniMaxJson<MiniMaxLyricsResponse>("/lyrics_generation", {
    body,
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_lyrics_generation_failed")
  return {
    title: normalizeOptionalText(payload?.song_title),
    styleTags: normalizeOptionalText(payload?.style_tags),
    lyrics: normalizeOptionalText(payload?.lyrics),
    raw: payload,
  }
}

export async function generateMiniMaxMusic(
  body: Record<string, unknown>,
  config = getMiniMaxAudioConfig(),
) {
  const payload = await requestMiniMaxJson<MiniMaxMusicResponse>("/music_generation", {
    body,
    config,
  })
  assertMiniMaxSuccess(payload, "minimax_music_generation_failed")

  const audio = normalizeOptionalText(payload?.data?.audio)
  if (!audio) {
    throw new Error("minimax_music_generation_missing_audio")
  }

  return {
    audio,
    status: payload?.data?.status ?? null,
    traceId: normalizeOptionalText(payload?.trace_id),
    extraInfo: payload?.extra_info ?? null,
    raw: payload,
  }
}

export async function downloadMiniMaxFileContent(fileId: string, config = getMiniMaxAudioConfig()) {
  if (!isMiniMaxAudioConfigured(config)) {
    throw new Error("minimax_not_configured")
  }

  const url = new URL(`${config.baseUrl}/files/retrieve_content`)
  url.searchParams.set("file_id", fileId)

  const response = await fetch(url, {
    method: "GET",
    headers: createMiniMaxHeaders(config),
    cache: "no-store",
  })

  if (!response.ok) {
    throw new Error("minimax_file_download_failed")
  }

  return response
}

export async function resolveMiniMaxDownloadedFile(fileId: string, config = getMiniMaxAudioConfig()) {
  const response = await downloadMiniMaxFileContent(fileId, config)
  const bytes = new Uint8Array(await response.arrayBuffer())
  const extracted = extractMiniMaxAudioFileFromTar(bytes)

  if (extracted) {
    return extracted
  }

  return {
    bytes,
    contentType: response.headers.get("content-type") || "application/octet-stream",
    fileName: null,
  } satisfies MiniMaxDownloadedFile
}

export async function createMiniMaxAudioUpload(
  purpose: MiniMaxVoicePurpose,
  file: File,
  config = getMiniMaxAudioConfig(),
) {
  return uploadMiniMaxFile(purpose, file, config)
}

function ensureEnterpriseUser(currentUser: MiniMaxRuntimeUser) {
  if (!currentUser?.id) {
    throw new Error("platform_media_user_required")
  }
  if (!currentUser.enterpriseId) {
    throw new Error("platform_media_enterprise_required")
  }
}

function requireEnterpriseId(currentUser: MiniMaxRuntimeUser) {
  ensureEnterpriseUser(currentUser)
  if (typeof currentUser.enterpriseId !== "number") {
    throw new Error("platform_media_enterprise_required")
  }
  return currentUser.enterpriseId
}

async function updateMiniMaxMediaRunRecord(runId: number, patch: UpdateMiniMaxMediaRunPatch) {
  const nextValues: Partial<typeof platformTaskRuns.$inferInsert> & { updatedAt: Date } = {
    updatedAt: new Date(),
  }

  if (patch.status !== undefined) nextValues.status = patch.status
  if (patch.normalizedResult !== undefined) nextValues.normalizedResult = patch.normalizedResult
  if (patch.externalSystem !== undefined) nextValues.externalSystem = patch.externalSystem
  if (patch.externalRunId !== undefined) nextValues.externalRunId = patch.externalRunId
  if (patch.startedAt !== undefined) nextValues.startedAt = patch.startedAt
  if (patch.finishedAt !== undefined) nextValues.finishedAt = patch.finishedAt

  await db.update(platformTaskRuns).set(nextValues).where(eq(platformTaskRuns.id, runId))
}

export async function createMiniMaxMediaRun(input: {
  currentUser: MiniMaxRuntimeUser
  featureId: MiniMaxAudioFeatureId
  inputPayload?: Record<string, unknown> | null
}) {
  const enterpriseId = requireEnterpriseId(input.currentUser)

  const run = await createPlatformTaskRun({
    enterpriseId,
    userId: input.currentUser.id,
    kind: "media",
    itemType: "capability",
    itemSlug: input.featureId,
    status: "queued",
    inputPayload: input.inputPayload ?? null,
  })

  await appendPlatformRunEvent(run.id, {
    level: "info",
    message: "media_queued",
    payload: {
      provider: "minimax",
      featureId: input.featureId,
    },
  })

  const detail = await getPlatformTaskRun(run.id)
  if (!detail) {
    throw new Error("platform_media_run_not_found_after_create")
  }

  return detail
}

export async function patchMiniMaxMediaRun(input: {
  runId: number
  patch: UpdateMiniMaxMediaRunPatch
  event?:
    | {
        level: "info" | "warn" | "error"
        message: string
        payload?: Record<string, unknown> | null
      }
    | undefined
}) {
  await updateMiniMaxMediaRunRecord(input.runId, input.patch)
  if (input.event) {
    await appendPlatformRunEvent(input.runId, input.event)
  }
  const detail = await getPlatformTaskRun(input.runId)
  if (!detail) {
    throw new Error("platform_media_run_not_found_after_update")
  }
  return detail
}

export async function getMiniMaxMediaRunForUser(runId: number, currentUser: MiniMaxRuntimeUser) {
  ensureEnterpriseUser(currentUser)

  const detail = await getPlatformTaskRun(runId)
  if (!detail) return null
  if (detail.enterpriseId !== currentUser.enterpriseId) return null
  return detail
}

export async function getMiniMaxArtifactForUser(artifactId: number, currentUser: MiniMaxRuntimeUser) {
  ensureEnterpriseUser(currentUser)

  const artifact = await getPlatformArtifact(artifactId)
  if (!artifact) return null
  if (artifact.enterpriseId !== currentUser.enterpriseId) return null
  return artifact
}

async function saveExternalAudioArtifact(input: {
  run: HydratedPlatformTaskRun
  title: string
  externalUrl: string
  mimeType?: string | null
  payload?: Record<string, unknown> | null
}) {
  return savePlatformArtifact({
    runId: input.run.id,
    enterpriseId: input.run.enterpriseId,
    ownerUserId: input.run.userId,
    kind: "file",
    title: input.title,
    mimeType: input.mimeType ?? "audio/mpeg",
    externalUrl: input.externalUrl,
    payload: input.payload ?? null,
  })
}

function buildVoiceCloneId() {
  const token = randomUUID().replace(/-/g, "").slice(0, 12)
  return `voice_${token}`
}

function buildMusicTitle(params: Record<string, unknown>, lyricsTitle: string | null) {
  if (lyricsTitle) return lyricsTitle
  const title = normalizeOptionalText(params.title)
  if (title) return title
  const stylePrompt = normalizeOptionalText(params.stylePrompt)
  if (stylePrompt) return stylePrompt.slice(0, 48)
  return "AI music"
}

function buildCloneTitle(voiceId: string) {
  return `voice-clone-${voiceId}`
}

function normalizeResultsFromTaskResult(normalizedResult: Record<string, unknown> | null | undefined) {
  const results = normalizedResult?.results
  if (!Array.isArray(results)) return []
  return results
    .map((item) => {
      if (!item || typeof item !== "object") return null
      const record = item as Record<string, unknown>
      return {
        url: normalizeOptionalText(record.url),
        outputType: normalizeOptionalText(record.outputType),
        text: normalizeOptionalText(record.text),
        title: normalizeOptionalText(record.title),
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
}

function buildTaskResponseFromRun(run: HydratedPlatformTaskRun): MiniMaxNormalizedTask {
  const normalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : null
  const requestedTarget = (run.itemSlug === "voice-clone" || run.itemSlug === "voice-synthesis" ? run.itemSlug : "ai-music") satisfies MiniMaxAudioFeatureId

  const status =
    run.status === "succeeded"
      ? "SUCCESS"
      : run.status === "failed" || run.status === "cancelled"
        ? "FAILED"
        : run.status === "queued"
          ? "QUEUED"
          : "RUNNING"

  return {
    taskId: String(run.id),
    mediaTarget: "ai-music",
    requestedTarget,
    provider: "minimax",
    status,
    results: normalizeResultsFromTaskResult(normalizedResult),
    extra:
      normalizedResult?.extra && typeof normalizedResult.extra === "object"
        ? (normalizedResult.extra as Record<string, unknown>)
        : null,
    raw:
      normalizedResult?.raw && typeof normalizedResult.raw === "object"
        ? (normalizedResult.raw as Record<string, unknown>)
        : null,
  }
}

export async function executeMiniMaxAudioFeature(input: {
  currentUser: MiniMaxRuntimeUser
  featureId: MiniMaxAudioFeatureId
  params: Record<string, unknown>
  config?: MiniMaxAudioConfig
  defaultModel?: string | null
}) {
  const run = await createMiniMaxMediaRun({
    currentUser: input.currentUser,
    featureId: input.featureId,
    inputPayload: input.params,
  })

  if (input.featureId === "voice-synthesis") {
    const prompt = normalizeOptionalText(input.params.prompt)
    const voiceId = normalizeOptionalText(input.params.voiceId) || normalizeOptionalText(input.params.voicePreset)
    if (!prompt) {
      throw new Error("voice_synthesis_text_required")
    }
    if (!voiceId) {
      throw new Error("voice_synthesis_voice_required")
    }

    const task = await createMiniMaxAsyncSpeechTask({
      model:
        normalizeOptionalText(input.params.model) ||
        normalizeOptionalText(input.defaultModel) ||
        "speech-2.8-hd",
      text: prompt,
      language_boost: normalizeOptionalText(input.params.languageBoost) || "auto",
      voice_setting: {
        voice_id: voiceId,
        speed: Number(input.params.speed || 1),
        vol: Number(input.params.volume || 1),
        pitch: Number(input.params.pitch || 1),
      },
      audio_setting: {
        audio_sample_rate: 32000,
        bitrate: 128000,
        format: "mp3",
        channel: 2,
      },
    }, input.config)

    const detail = await patchMiniMaxMediaRun({
      runId: run.id,
      patch: {
        status: "running",
        externalSystem: "minimax",
        externalRunId: task.taskId,
        startedAt: new Date(),
        normalizedResult: {
          requestedTarget: input.featureId,
          provider: "minimax",
          status: "RUNNING",
          results: [],
          extra: {
            voiceId,
            fileId: task.fileId,
            usageCharacters: task.usageCharacters,
          },
          raw: task.raw as Record<string, unknown>,
        },
      },
      event: {
        level: "info",
        message: "minimax_voice_synthesis_submitted",
        payload: {
          providerTaskId: task.taskId,
          voiceId,
        },
      },
    })

    return buildTaskResponseFromRun(detail)
  }

  if (input.featureId === "voice-clone") {
    const sourceFileId = normalizeOptionalText(input.params.sourceFileId)
    if (!sourceFileId) {
      throw new Error("voice_clone_source_file_required")
    }

    const voiceId = normalizeOptionalText(input.params.voiceId) || buildVoiceCloneId()
    const previewText = normalizeOptionalText(input.params.previewText) || normalizeOptionalText(input.params.prompt)
    const promptAudioFileId = normalizeOptionalText(input.params.promptAudioFileId)
    const promptText = normalizeOptionalText(input.params.promptText)

    const cloneBody: Record<string, unknown> = {
      file_id: Number(sourceFileId),
      voice_id: voiceId,
      need_noise_reduction: String(input.params.needNoiseReduction || "false") === "true",
      need_volume_normalization: String(input.params.needVolumeNormalization || "false") === "true",
      aigc_watermark: false,
    }

    if (previewText) {
      cloneBody.text = previewText
      cloneBody.model = normalizeOptionalText(input.params.model) || "speech-2.8-turbo"
      cloneBody.language_boost = normalizeOptionalText(input.params.languageBoost) || "auto"
    }

    if (promptAudioFileId && promptText) {
      cloneBody.clone_prompt = {
        prompt_audio: Number(promptAudioFileId),
        prompt_text: promptText,
      }
    }

    const result = await cloneMiniMaxVoice(cloneBody, input.config)
    let artifact: PlatformArtifactRecord | null = null
    if (result.demoAudioUrl) {
      artifact = await saveExternalAudioArtifact({
        run,
        title: buildCloneTitle(voiceId),
        externalUrl: result.demoAudioUrl,
        payload: {
          voiceId,
          requestedTarget: input.featureId,
        },
      })
    }

    const detail = await patchMiniMaxMediaRun({
      runId: run.id,
      patch: {
        status: "succeeded",
        externalSystem: "minimax",
        startedAt: new Date(),
        finishedAt: new Date(),
        normalizedResult: {
          requestedTarget: input.featureId,
          provider: "minimax",
          status: "SUCCESS",
          results: [
            {
              url: artifact ? buildMiniMaxArtifactPath(artifact.id) : null,
              outputType: artifact?.mimeType || "audio/mpeg",
              text: artifact ? `试听音频 / Preview audio` : "新音色已创建，可用于声音合成。",
              title: artifact?.title || null,
            },
            {
              outputType: "voice_profile",
              text: `voice_id: ${voiceId}`,
              title: voiceId,
            },
          ],
          extra: {
            voiceId,
            previewText,
            sourceFileId,
            promptAudioFileId,
          },
          raw: result.raw as Record<string, unknown>,
        },
      },
      event: {
        level: "info",
        message: "minimax_voice_clone_succeeded",
        payload: {
          voiceId,
          hasPreviewAudio: Boolean(artifact),
        },
      },
    })

    return buildTaskResponseFromRun(detail)
  }

  const lyricsSource = normalizeOptionalText(input.params.lyricsSource) || "manual"
  let lyrics = normalizeOptionalText(input.params.lyrics)
  const stylePrompt =
    normalizeOptionalText(input.params.stylePrompt) ||
    normalizeOptionalText(input.params.prompt) ||
    [normalizeOptionalText(input.params.genre), normalizeOptionalText(input.params.mood), normalizeOptionalText(input.params.instrumentation)]
      .filter(Boolean)
      .join(", ")
  if (!stylePrompt) {
    throw new Error("music_style_prompt_required")
  }

  let lyricsMeta: Record<string, unknown> | null = null
  if (lyricsSource === "ai_generate") {
    const lyricsPrompt =
      normalizeOptionalText(input.params.lyricsPrompt) ||
      normalizeOptionalText(input.params.prompt) ||
      stylePrompt
    const lyricsResult = await generateMiniMaxLyrics({
      mode: "write_full_song",
      prompt: lyricsPrompt,
      title: normalizeOptionalText(input.params.title) || undefined,
    }, input.config)
    lyrics = lyricsResult.lyrics
    lyricsMeta = {
      title: lyricsResult.title,
      styleTags: lyricsResult.styleTags,
    }
  }

  if (!lyrics) {
    throw new Error("music_lyrics_required")
  }

  const music = await generateMiniMaxMusic({
    model:
      normalizeOptionalText(input.params.model) ||
      normalizeOptionalText(input.defaultModel) ||
      "music-2.6",
    prompt: stylePrompt,
    lyrics,
    output_format: "url",
    audio_setting: {
      sample_rate: 44100,
      bitrate: 256000,
      format: "mp3",
    },
    aigc_watermark: false,
  }, input.config)

  const musicTitle = buildMusicTitle(input.params, normalizeOptionalText(String(lyricsMeta?.title || "")))
  const artifact = await saveExternalAudioArtifact({
    run,
    title: buildDownloadFileName(musicTitle, "mp3"),
    externalUrl: music.audio,
    payload: {
      requestedTarget: input.featureId,
      traceId: music.traceId,
    },
  })

  const detail = await patchMiniMaxMediaRun({
    runId: run.id,
    patch: {
      status: "succeeded",
      externalSystem: "minimax",
      startedAt: new Date(),
      finishedAt: new Date(),
      normalizedResult: {
        requestedTarget: input.featureId,
        provider: "minimax",
        status: "SUCCESS",
        results: [
          {
            url: buildMiniMaxArtifactPath(artifact.id),
            outputType: "audio/mpeg",
            title: artifact.title,
            text: musicTitle,
          },
        ],
        extra: {
          lyricsSource,
          lyrics,
          stylePrompt,
          title: musicTitle,
          traceId: music.traceId,
          ...lyricsMeta,
          ...(music.extraInfo ?? {}),
        },
        raw: music.raw as Record<string, unknown>,
      },
    },
    event: {
      level: "info",
      message: "minimax_music_generation_succeeded",
      payload: {
        artifactId: artifact.id,
        title: musicTitle,
      },
    },
  })

  return buildTaskResponseFromRun(detail)
}

export async function queryMiniMaxAudioTask(input: {
  currentUser: MiniMaxRuntimeUser
  runId: number
  config?: MiniMaxAudioConfig
}) {
  const run = await getMiniMaxMediaRunForUser(input.runId, input.currentUser)
  if (!run) {
    throw new Error("platform_media_task_not_found")
  }

  const featureId = (run.itemSlug === "voice-clone" || run.itemSlug === "voice-synthesis" ? run.itemSlug : "ai-music") satisfies MiniMaxAudioFeatureId
  if (featureId !== "voice-synthesis" || !run.externalRunId || run.status === "succeeded" || run.status === "failed" || run.status === "cancelled") {
    return buildTaskResponseFromRun(run)
  }

  const query = await queryMiniMaxAsyncSpeechTask(run.externalRunId, input.config)
  const currentNormalizedResult =
    run.normalizedResult && typeof run.normalizedResult === "object" ? run.normalizedResult : {}

  const nextResults: MiniMaxNormalizedResult[] =
    query.status === "SUCCESS" && query.fileId
      ? [
          {
            url: buildMiniMaxDownloadPath(query.fileId),
            outputType: "audio/mpeg",
            text: "语音合成结果 / Synthesized audio",
            title: "speech-synthesis.mp3",
          },
        ]
      : []

  const nextStatus: PlatformTaskRunStatus =
    query.status === "SUCCESS"
      ? "succeeded"
      : query.status === "FAILED"
        ? "failed"
        : query.status === "QUEUED"
          ? "queued"
          : "running"

  const detail = await patchMiniMaxMediaRun({
    runId: run.id,
    patch: {
      status: nextStatus,
      externalSystem: "minimax",
      externalRunId: run.externalRunId,
      finishedAt: nextStatus === "succeeded" || nextStatus === "failed" ? new Date() : null,
      normalizedResult: {
        ...currentNormalizedResult,
        requestedTarget: featureId,
        provider: "minimax",
        status: query.status,
        results: nextResults,
        extra: {
          ...(currentNormalizedResult.extra && typeof currentNormalizedResult.extra === "object"
            ? (currentNormalizedResult.extra as Record<string, unknown>)
            : {}),
          fileId: query.fileId,
          providerStatus: query.providerStatus,
        },
        raw: query.raw as Record<string, unknown>,
      },
    },
    event:
      nextStatus === run.status
        ? undefined
        : {
            level: nextStatus === "failed" ? "error" : "info",
            message:
              nextStatus === "succeeded"
                ? "minimax_voice_synthesis_succeeded"
                : nextStatus === "failed"
                  ? "minimax_voice_synthesis_failed"
                  : "minimax_voice_synthesis_running",
            payload: {
              providerTaskId: run.externalRunId,
              providerStatus: query.providerStatus,
              fileId: query.fileId,
            },
          },
  })

  return buildTaskResponseFromRun(detail)
}

export function resolveMiniMaxFeatureId(value: unknown): MiniMaxAudioFeatureId | null {
  return value === "voice-clone" || value === "voice-synthesis" || value === "ai-music" ? value : null
}

export async function fetchMiniMaxArtifactSource(input: {
  artifact: PlatformArtifactRecord
}) {
  if (!input.artifact.externalUrl) {
    throw new Error("platform_media_artifact_missing_url")
  }

  const response = await fetch(input.artifact.externalUrl, {
    cache: "no-store",
  })
  if (!response.ok) {
    throw new Error("platform_media_artifact_fetch_failed")
  }
  return response
}

export async function getOwnedMiniMaxRunForUser(input: {
  currentUser: MiniMaxRuntimeUser
  runId: number
}) {
  const enterpriseId = requireEnterpriseId(input.currentUser)
  const [row] = await db
    .select()
    .from(platformTaskRuns)
    .where(and(eq(platformTaskRuns.id, input.runId), eq(platformTaskRuns.enterpriseId, enterpriseId)))

  return row ?? null
}
