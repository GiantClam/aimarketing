import assert from "node:assert/strict"
import test from "node:test"

import type { AuthUser } from "@/lib/auth/session"
import type { PptPreviewDeck } from "@/lib/lead-tools/ppt-preview-data-fixed"
import {
  createLeadToolPlatformRun,
  promoteLeadToolArtifactToWork,
  saveLeadToolPreviewArtifact,
  saveLeadToolSelectedArtifact,
} from "@/lib/lead-tools/platform-persistence"
import { createInMemoryPlatformTaskRunStore } from "@/lib/platform/task-run-store"

const sampleDeck: PptPreviewDeck = {
  title: "Formal AI PPT",
  scenario: "marketing-campaign",
  language: "zh-CN",
  generatedAt: "2026-06-11T00:00:00.000Z",
  outline: ["封面", "目录", "洞察", "对比", "结论"],
  previewEngine: "ppt-master-project" as const,
  previewSessionId: "preview-session-1",
  provider: "pptoken",
  previewModel: "gpt-5.4",
  templateMode: "single-template" as const,
  selectedTemplateId: "neo-grid-bold" as const,
  pageCount: null,
  resolvedPageCount: 5,
  variants: [
    {
      key: "variant-a",
      styleKey: "ppt169_brutalist_ai_newspaper_2026" as const,
      templateId: "neo-grid-bold" as const,
      slotLabel: "A" as const,
      name: "Variant A",
      summary: "A concise decision-ready route",
      stylePrompt: "brutalist editorial grid",
      palette: {
        background: "#111111",
        foreground: "#ffffff",
        accent: "#ff0000",
        panel: "#222222",
        border: "#333333",
      },
      strengths: ["Fast to compare"],
      slides: [
        {
          id: "cover-1",
          layout: "cover" as const,
          kicker: "Headline",
          title: "Formal AI PPT",
          body: "body",
          bullets: ["a", "b"],
          accent: "#ff0000",
        },
      ],
      preview: {
        format: "svg" as const,
        themeId: "ppt169_brutalist_ai_newspaper_2026",
        cover: {
          mimeType: "image/svg+xml" as const,
          width: 1280,
          height: 720,
          dataUrl: "data:image/svg+xml;base64,cover",
        },
        slides: [
          {
            mimeType: "image/svg+xml" as const,
            width: 1280,
            height: 720,
            dataUrl: "data:image/svg+xml;base64,slide-1",
          },
        ],
        htmlDocument: {
          fileName: "variant-a.html",
          html: "<html></html>",
        },
      },
    },
  ],
}

const enterpriseUser = {
  id: 7,
  email: "user@example.com",
  name: "Test User",
  isDemo: false,
  enterpriseId: 3,
  enterpriseCode: "acme",
  enterpriseName: "Acme",
  enterpriseRole: "admin",
  enterpriseStatus: "active",
  permissions: {},
} as unknown as AuthUser

const enterpriseId = 3

test("preview persistence creates a tool run and a lightweight deck artifact", async () => {
  const store = createInMemoryPlatformTaskRunStore()

  const run = await createLeadToolPlatformRun({
    currentUser: enterpriseUser,
    toolSlug: "ai-ppt-preview",
    action: "preview",
    inputPayload: {
      prompt: "AI marketing",
      pageCount: 5,
    },
    normalizedResult: {
      variantCount: 4,
    },
    store,
  })

  const artifact = await saveLeadToolPreviewArtifact({
    currentUser: enterpriseUser,
    toolSlug: "ai-ppt-preview",
    run,
    deck: sampleDeck,
    previewSessionId: sampleDeck.previewSessionId,
    store,
  })

  assert.ok(run)
  assert.equal(run.kind, "tool")
  assert.equal(run.itemType, "lead_tool_preview")
  assert.equal(run.itemSlug, "ai-ppt-preview")
  assert.ok(artifact)
  assert.equal(artifact.kind, "json")
  assert.equal(artifact.mimeType, "application/json")
  const payload = artifact.payload as {
    artifactType?: string
    previewSessionId?: string
    deck?: {
      variants?: Array<{
        preview?: {
          cover?: { hasDataUrl?: boolean }
          htmlDocument?: { hasHtml?: boolean }
        }
      }>
    }
  }
  assert.equal(payload.artifactType, "lead_tool_preview_deck")
  assert.equal(payload.previewSessionId, "preview-session-1")
  assert.equal(payload.deck?.variants?.[0]?.preview?.cover?.hasDataUrl, true)
  assert.equal(payload.deck?.variants?.[0]?.preview?.htmlDocument?.hasHtml, true)
})

test("selected output persistence creates artifact and promotes it into work", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await createLeadToolPlatformRun({
    currentUser: enterpriseUser,
    toolSlug: "ai-ppt-preview",
    action: "download",
    store,
  })

  const artifact = await saveLeadToolSelectedArtifact({
    currentUser: enterpriseUser,
    toolSlug: "ai-ppt-preview",
    run,
    deck: sampleDeck,
    selectedVariant: sampleDeck.variants[0],
    previewSessionId: sampleDeck.previewSessionId,
    action: "download",
    downloadResult: {
      artifact: {
        buffer: Buffer.from("pptx"),
        contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        fileName: "formal-ai-ppt.pptx",
      },
      deck: sampleDeck,
      variant: sampleDeck.variants[0],
    },
    store,
  })

  const workItem = await promoteLeadToolArtifactToWork({
    currentUser: enterpriseUser,
    artifact,
    title: "Formal AI PPT Variant A",
    summary: sampleDeck.variants[0].summary,
    metadata: {
      selectedVariantKey: sampleDeck.variants[0].key,
    },
    store,
  })

  assert.ok(artifact)
  assert.equal(artifact.kind, "file")
  assert.equal(artifact.title, "formal-ai-ppt.pptx")
  assert.equal(artifact.mimeType, "application/vnd.openxmlformats-officedocument.presentationml.presentation")
  const payload = artifact.payload as {
    artifactType?: string
    embeddedContentBase64?: string
  }
  assert.equal(payload.artifactType, "lead_tool_download_file")
  assert.ok(payload.embeddedContentBase64)

  const persistedArtifacts = await store.listPlatformArtifactsForEnterprise(enterpriseId)
  assert.equal(persistedArtifacts.length, 2)
  const metadataArtifact = persistedArtifacts.find((item) => item.kind === "json")
  const metadataPayload = metadataArtifact?.payload as
    | {
        artifactType?: string
        downloadResult?: { fileName?: string | null; resultArtifactId?: number | null }
      }
    | undefined
  assert.equal(metadataPayload?.artifactType, "lead_tool_download_selection")
  assert.equal(metadataPayload?.downloadResult?.fileName, "formal-ai-ppt.pptx")
  assert.equal(metadataPayload?.downloadResult?.resultArtifactId, artifact.id)

  assert.ok(workItem)
  assert.equal(workItem.type, "deck")
  assert.equal(workItem.title, "Formal AI PPT Variant A")
  assert.equal(workItem.metadata?.selectedVariantKey, "variant-a")
})

test("lead-tool persistence stays inert without enterprise context", async () => {
  const store = createInMemoryPlatformTaskRunStore()
  const run = await createLeadToolPlatformRun({
    currentUser: {
      ...enterpriseUser,
      enterpriseId: null,
    },
    toolSlug: "ai-ppt-preview",
    action: "preview",
    store,
  })

  const artifact = await saveLeadToolPreviewArtifact({
    currentUser: {
      ...enterpriseUser,
      enterpriseId: null,
    },
    toolSlug: "ai-ppt-preview",
    run,
    deck: sampleDeck,
    store,
  })

  assert.equal(run, null)
  assert.equal(artifact, null)
})
