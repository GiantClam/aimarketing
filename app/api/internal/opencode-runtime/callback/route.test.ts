import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let appendMessageCalls: Array<Record<string, unknown>> = []
let savedArtifacts: Array<Record<string, unknown>> = []
let recordedArtifactContexts: Array<Record<string, unknown>> = []
let updatedPlatformRunInput: Record<string, unknown> | null = null
let updatedRuntimeRunInput: Record<string, unknown> | null = null
let platformRunArtifacts: Array<Record<string, unknown>> = []
const originalCallbackSecret = process.env.CLOUDFLARE_OPENCODE_CALLBACK_SECRET

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({
          status: init?.status || 200,
          body,
        }),
      },
    }
  }

  if (request === "@/lib/ai-entry/runtime/callback-signature") {
    return {
      verifyRuntimeCallback: async () => true,
    }
  }

  if (request === "@/lib/ai-entry/repository") {
    return {
      appendAiEntryMessage: async (input: Record<string, unknown>) => {
        appendMessageCalls.push(input)
      },
      recordAiEntryRuntimeArtifactContext: async (input: Record<string, unknown>) => {
        recordedArtifactContexts.push(input)
        return { ok: true }
      },
    }
  }

  if (request === "@/lib/platform/artifact-storage") {
    return {
      isPlatformArtifactR2Available: () => false,
      uploadPlatformArtifactBufferToR2: async () => {
        throw new Error("unexpected_r2_upload")
      },
    }
  }

  if (request === "@/lib/platform/task-run-store") {
    return {
      appendPlatformRunEvent: async () => ({ id: 1 }),
      getPlatformTaskRun: async () => ({
        id: 91,
        enterpriseId: 3,
        userId: 7,
        inputPayload: {
          conversationId: "797",
          agentId: "executive-ppt",
          artifactContract: {
            maxArtifacts: 24,
            maxArtifactBytes: 2 * 1024 * 1024,
            maxArtifactTotalBytes: 16 * 1024 * 1024,
            allowedExtensions: [".pptx"],
          },
          selectedSkillIds: ["ppt-master"],
        },
        normalizedResult: {},
        artifacts: [...platformRunArtifacts],
      }),
      savePlatformArtifact: async (input: Record<string, unknown>) => {
        const saved = {
          id: 200 + savedArtifacts.length + 1,
          title: String(input.title || "artifact"),
          mimeType: input.mimeType || null,
          storageKey: input.storageKey || null,
          externalUrl: input.externalUrl || null,
          payload: input.payload || null,
        }
        savedArtifacts.push({ ...input, id: saved.id })
        return saved
      },
      updatePlatformTaskRun: async (_runId: number, input: Record<string, unknown>) => {
        updatedPlatformRunInput = input
        return { id: 91, ...input }
      },
    }
  }

  if (request === "@/lib/platform/opencode-runtime-store") {
    return {
      getOpenCodeRuntimeRunByRuntimeId: async () => ({
        taskRunId: 91,
        conversationId: "797",
        agentId: "executive-ppt",
      }),
      updateOpenCodeRuntimeRun: async (_runId: string, input: Record<string, unknown>) => {
        updatedRuntimeRunInput = input
        return { ok: true }
      },
    }
  }

  if (request === "@/lib/billing/runtime") {
    return {
      finalizeReservedCredits: async () => ({ ok: true }),
      releaseReservedCredits: async () => ({ ok: true }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let POST: typeof import("./route").POST

test.before(async () => {
  POST = (await import("./route")).POST
})

test.beforeEach(() => {
  appendMessageCalls = []
  savedArtifacts = []
  recordedArtifactContexts = []
  updatedPlatformRunInput = null
  updatedRuntimeRunInput = null
  platformRunArtifacts = []
  process.env.CLOUDFLARE_OPENCODE_CALLBACK_SECRET = "test-secret"
})

test.after(() => {
  nodeModule._load = originalLoad
  if (typeof originalCallbackSecret === "string") {
    process.env.CLOUDFLARE_OPENCODE_CALLBACK_SECRET = originalCallbackSecret
  } else {
    delete process.env.CLOUDFLARE_OPENCODE_CALLBACK_SECRET
  }
})

test("callback persists artifact_payload pptx and records exported conversation state", async () => {
  const response = await POST(
    new Request("http://localhost/api/internal/opencode-runtime/callback", {
      method: "POST",
      body: JSON.stringify({
        version: 1,
        runId: "11111111-1111-4111-8111-111111111111",
        sessionKey: "ppt-7-797",
        status: "succeeded",
        events: [
          {
            id: 1,
            event: {
              event: "artifact_payload",
              artifact: {
                path: "artifacts/final-deck.pptx",
                title: "Final Deck",
                kind: "pptx",
                mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                sizeBytes: 4,
                contentBase64: "dGVzdA==",
              },
            },
          },
        ],
      }),
    }) as any,
  )

  assert.equal((response as any).status, 200)
  assert.equal(savedArtifacts.length, 1)
  assert.equal(savedArtifacts[0]?.title, "Final Deck")
  assert.equal(recordedArtifactContexts.length, 1)
  assert.equal(
    ((recordedArtifactContexts[0]?.artifact as Record<string, unknown> | undefined)?.kind),
    "pptx",
  )
  assert.deepEqual((recordedArtifactContexts[0] as { exportContext?: unknown })?.exportContext, {
    previewSessionId: "11111111-1111-4111-8111-111111111111",
  })
  assert.equal(appendMessageCalls.length, 1)
  assert.match(String(appendMessageCalls[0]?.content || ""), /Final Deck|final-deck\.pptx/u)
  assert.equal(updatedPlatformRunInput?.status, "succeeded")
  assert.equal(
    ((updatedPlatformRunInput?.normalizedResult as Record<string, unknown> | undefined)?.artifacts),
    1,
  )
  assert.equal(updatedRuntimeRunInput?.status, "succeeded")
})

test("callback persists artifact_reference pptx with exported conversation metadata", async () => {
  const response = await POST(
    new Request("http://localhost/api/internal/opencode-runtime/callback", {
      method: "POST",
      body: JSON.stringify({
        version: 1,
        runId: "22222222-2222-4222-8222-222222222222",
        sessionKey: "ppt-7-797",
        status: "succeeded",
        events: [
          {
            id: 1,
            event: {
              event: "artifact_reference",
              artifact: {
                provider: "r2",
                bucket: "artifact-bucket",
                key: "artifacts/final/deck.pptx",
                publicUrl: null,
                fileName: "final/deck.pptx",
                title: "Cloud Deck",
                kind: "pptx",
                mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                sizeBytes: 128,
                checksumSha256: "a".repeat(64),
              },
            },
          },
        ],
      }),
    }) as any,
  )

  assert.equal((response as any).status, 200)
  assert.equal(savedArtifacts.length, 1)
  assert.equal(savedArtifacts[0]?.storageKey, "artifacts/final/deck.pptx")
  assert.equal(recordedArtifactContexts.length, 1)
  assert.equal(
    ((recordedArtifactContexts[0]?.artifact as Record<string, unknown> | undefined)?.kind),
    "pptx",
  )
  assert.deepEqual((recordedArtifactContexts[0] as { exportContext?: unknown })?.exportContext, {
    previewSessionId: "22222222-2222-4222-8222-222222222222",
  })
  assert.equal(
    ((updatedPlatformRunInput?.normalizedResult as Record<string, unknown> | undefined)?.artifacts),
    1,
  )
})

test("callback keeps only one final PPTX when runtime reports intermediate copies", async () => {
  const response = await POST(
    new Request("http://localhost/api/internal/opencode-runtime/callback", {
      method: "POST",
      body: JSON.stringify({
        version: 1,
        runId: "33333333-3333-4333-8333-333333333333",
        sessionKey: "ppt-7-797",
        status: "succeeded",
        events: [
          {
            id: 1,
            event: {
              event: "artifact_payload",
              artifact: {
                path: "artifacts/result.pptx",
                title: "result.pptx",
                kind: "pptx",
                mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                sizeBytes: 4,
                contentBase64: "dGVzdA==",
              },
            },
          },
          {
            id: 2,
            event: {
              event: "artifact_payload",
              artifact: {
                path: "artifacts/deck-copy.pptx",
                title: "Deck Copy",
                kind: "pptx",
                mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                sizeBytes: 4,
                contentBase64: "dGVzdA==",
              },
            },
          },
          {
            id: 3,
            event: {
              event: "artifact_payload",
              artifact: {
                path: "artifacts/final-deck.pptx",
                title: "Final Deck",
                kind: "pptx",
                mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                sizeBytes: 4,
                contentBase64: "dGVzdA==",
              },
            },
          },
        ],
      }),
    }) as any,
  )

  assert.equal((response as any).status, 200)
  assert.equal(savedArtifacts.length, 1)
  assert.equal(savedArtifacts[0]?.title, "Final Deck")
  assert.equal(recordedArtifactContexts.length, 1)
  assert.match(String(appendMessageCalls[0]?.content || ""), /Final Deck/u)
})
