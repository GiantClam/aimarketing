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
let platformRunArtifacts: Array<Record<string, unknown>> = []
let normalizedResult: Record<string, unknown> = {}
let currentState: Record<string, unknown> | null = null

const runtimeRunId = "44444444-4444-4444-8444-444444444444"
const artifact = {
  provider: "r2",
  bucket: "platform-artifacts",
  key: "platform-artifacts/151/601/opencode/final-deck.pptx",
  publicUrl: "https://s.aimarketingsite.com/platform-artifacts/151/601/opencode/final-deck.pptx",
  fileName: "TeachAny_latest.pptx",
  title: "TeachAny latest",
  kind: "pptx",
  mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  sizeBytes: 128,
  checksumSha256: "b".repeat(64),
}

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "next/server") {
    return {
      NextResponse: {
        json: (body: unknown, init?: { status?: number }) => ({ status: init?.status || 200, body }),
      },
    }
  }

  if (request === "@/lib/ai-entry/repository") {
    return {
      appendAiEntryMessage: async (input: Record<string, unknown>) => {
        appendMessageCalls.push(input)
      },
      recordAiEntryRuntimeArtifactContext: async (input: Record<string, unknown>) => {
        recordedArtifactContexts.push(input)
      },
      recordAiEntryRuntimeProjectSnapshot: async () => undefined,
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
        id: 601,
        enterpriseId: 151,
        userId: 7,
        inputPayload: {
          conversationId: "831",
          agentId: "executive-ppt",
          artifactContract: {
            maxArtifacts: 24,
            maxArtifactBytes: 2 * 1024 * 1024,
            maxArtifactTotalBytes: 16 * 1024 * 1024,
            allowedExtensions: [".pptx"],
          },
        },
        normalizedResult,
        artifacts: [...platformRunArtifacts],
        startedAt: null,
      }),
      savePlatformArtifact: async (input: Record<string, unknown>) => {
        const saved = {
          ...input,
          id: 900 + savedArtifacts.length + 1,
          storageKey: input.storageKey || null,
          externalUrl: input.externalUrl || null,
          payload: input.payload || null,
          mimeType: input.mimeType || null,
          title: String(input.title || "artifact"),
        }
        savedArtifacts.push(saved)
        platformRunArtifacts.push(saved)
        return saved
      },
      updatePlatformTaskRun: async (_runId: number, input: Record<string, unknown>) => {
        if (input.normalizedResult && typeof input.normalizedResult === "object") normalizedResult = input.normalizedResult as Record<string, unknown>
        return { id: 601, ...input }
      },
    }
  }

  if (request === "@/lib/platform/opencode-runtime-store") {
    return {
      getOpenCodeRuntimeRunByRuntimeId: async () => ({ taskRunId: 601, conversationId: "831", agentId: "executive-ppt" }),
      appendRailwayOpenCodeRuntimeEvent: async () => currentState,
      getRailwayOpenCodeRuntimeState: async () => currentState,
      updateRailwayOpenCodeRuntimeState: async () => currentState,
      updateOpenCodeRuntimeRun: async () => ({ ok: true }),
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
  platformRunArtifacts = []
  normalizedResult = {}
  currentState = {
    status: "succeeded",
    events: [
      { sequence: 1, event: { event: "text_delta", delta: "重新导出成功" } },
      { sequence: 2, event: { event: "artifact_reference", artifact } },
      { sequence: 3, event: { event: "done" } },
    ],
  }
  process.env.RUNTIME_STATE_TOKEN = "test-token"
})

test.after(() => {
  nodeModule._load = originalLoad
  delete process.env.RUNTIME_STATE_TOKEN
})

test("state sync persists Railway artifact_reference into the conversation", async () => {
  const response = await POST(new Request("http://localhost/api/internal/opencode-runtime/state", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify({ runId: runtimeRunId, status: "succeeded", event: { event: "done" } }),
  }) as never)

  assert.equal((response as any).status, 200)
  assert.equal(savedArtifacts.length, 1)
  assert.equal(savedArtifacts[0]?.storageKey, artifact.key)
  assert.equal((savedArtifacts[0]?.payload as Record<string, unknown>)?.runtimeRunId, runtimeRunId)
  assert.equal(recordedArtifactContexts.length, 1)
  assert.equal(((recordedArtifactContexts[0]?.artifact as Record<string, unknown>)?.kind), "pptx")
  assert.deepEqual((recordedArtifactContexts[0] as { exportContext?: unknown }).exportContext, { previewSessionId: runtimeRunId })
  assert.equal(appendMessageCalls.length, 1)
  assert.equal(appendMessageCalls[0]?.content, "重新导出成功")

  await POST(new Request("http://localhost/api/internal/opencode-runtime/state", {
    method: "POST",
    headers: { authorization: "Bearer test-token" },
    body: JSON.stringify({ runId: runtimeRunId, status: "succeeded" }),
  }) as never)

  assert.equal(savedArtifacts.length, 1)
  assert.equal(recordedArtifactContexts.length, 1)
  assert.equal(appendMessageCalls.length, 1)
})
