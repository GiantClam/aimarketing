import type { AuthUser } from "@/lib/auth/session"
import {
  isPlatformArtifactR2Available,
  uploadPlatformArtifactBufferToR2,
} from "@/lib/platform/artifact-storage"
import {
  createPlatformTaskRun,
  savePlatformArtifact,
  type PlatformArtifactKind,
  type PlatformArtifactRecord,
  type PlatformTaskRunKind,
} from "@/lib/platform/task-run-store"
import { byteLengthOf, toBase64 } from "@/lib/utils/binary"

type AssetLibrarySource = "upload" | "generated" | "workflow" | "chat" | "assistant" | "import"

type AssetLibraryActor = AuthUser & {
  id: number
  enterpriseId: number
}

type AssetLibraryReferenceInput = {
  currentUser: AuthUser | null | undefined
  runKind: PlatformTaskRunKind
  itemType: string
  itemSlug: string
  title: string
  mimeType?: string | null
  storageKey?: string | null
  publicUrl?: string | null
  source: AssetLibrarySource
  artifactKind?: PlatformArtifactKind
  payload?: Record<string, unknown> | null
}

type AssetLibraryBufferInput = {
  currentUser: AuthUser | null | undefined
  runKind: PlatformTaskRunKind
  itemType: string
  itemSlug: string
  provider: string
  fileName: string
  mimeType: string
  buffer: Uint8Array | Buffer
  source: AssetLibrarySource
  artifactKind?: PlatformArtifactKind
  payload?: Record<string, unknown> | null
}

function getAssetLibraryActor(currentUser: AuthUser | null | undefined): AssetLibraryActor | null {
  if (!currentUser) return null
  const userId = currentUser.id
  const enterpriseId = currentUser.enterpriseId

  if (typeof userId !== "number" || !Number.isInteger(userId) || userId <= 0) return null
  if (typeof enterpriseId !== "number" || !Number.isInteger(enterpriseId) || enterpriseId <= 0) return null

  return currentUser as AssetLibraryActor
}

async function createAssetLibraryRun(input: {
  actor: AssetLibraryActor
  runKind: PlatformTaskRunKind
  itemType: string
  itemSlug: string
  source: AssetLibrarySource
  payload?: Record<string, unknown> | null
}) {
  return createPlatformTaskRun({
    enterpriseId: input.actor.enterpriseId,
    userId: input.actor.id,
    kind: input.runKind,
    itemType: input.itemType,
    itemSlug: input.itemSlug,
    status: "succeeded",
    inputPayload: {
      source: input.source,
      ...(input.payload ?? {}),
    },
    normalizedResult: {
      source: input.source,
      ...(input.payload ?? {}),
    },
    startedAt: new Date(),
    finishedAt: new Date(),
  })
}

export async function registerAssetLibraryArtifactReference(
  input: AssetLibraryReferenceInput,
): Promise<PlatformArtifactRecord | null> {
  const actor = getAssetLibraryActor(input.currentUser)
  if (!actor) return null

  const run = await createAssetLibraryRun({
    actor,
    runKind: input.runKind,
    itemType: input.itemType,
    itemSlug: input.itemSlug,
    source: input.source,
    payload: {
      title: input.title,
      mimeType: input.mimeType ?? null,
      storageKey: input.storageKey ?? null,
      publicUrl: input.publicUrl ?? null,
      ...(input.payload ?? {}),
    },
  })

  return savePlatformArtifact({
    runId: run.id,
    enterpriseId: actor.enterpriseId,
    ownerUserId: actor.id,
    kind: input.artifactKind ?? "file",
    title: input.title,
    mimeType: input.mimeType ?? null,
    storageKey: input.storageKey ?? null,
    externalUrl: input.publicUrl ?? null,
    source: input.source,
    payload: input.payload ?? undefined,
  })
}

export async function uploadAssetLibraryArtifactBuffer(
  input: AssetLibraryBufferInput,
): Promise<PlatformArtifactRecord | null> {
  const actor = getAssetLibraryActor(input.currentUser)
  if (!actor) return null

  const payload = {
    title: input.fileName,
    mimeType: input.mimeType,
    fileSize: byteLengthOf(input.buffer),
    ...(input.payload ?? {}),
  }
  const run = await createAssetLibraryRun({
    actor,
    runKind: input.runKind,
    itemType: input.itemType,
    itemSlug: input.itemSlug,
    source: input.source,
    payload,
  })

  if (isPlatformArtifactR2Available()) {
    try {
      const uploaded = await uploadPlatformArtifactBufferToR2({
        buffer: input.buffer,
        enterpriseId: actor.enterpriseId,
        runId: run.id,
        provider: input.provider,
        fileName: input.fileName,
        contentType: input.mimeType,
      })

      return savePlatformArtifact({
        runId: run.id,
        enterpriseId: actor.enterpriseId,
        ownerUserId: actor.id,
        kind: input.artifactKind ?? "file",
        title: uploaded.fileName,
        mimeType: uploaded.contentType,
        storageKey: uploaded.storageKey,
        externalUrl: uploaded.publicUrl,
        source: input.source,
        payload: input.payload ?? undefined,
      })
    } catch (error) {
      console.warn("platform.asset-library-ingest.r2-upload-fallback", {
        provider: input.provider,
        fileName: input.fileName,
        message: error instanceof Error ? error.message : "unknown_error",
      })
    }
  }

  return savePlatformArtifact({
    runId: run.id,
    enterpriseId: actor.enterpriseId,
    ownerUserId: actor.id,
    kind: input.artifactKind ?? "file",
    title: input.fileName,
    mimeType: input.mimeType,
    source: input.source,
    payload: {
      ...(input.payload ?? {}),
      embeddedContentBase64: toBase64(input.buffer),
    },
  })
}
