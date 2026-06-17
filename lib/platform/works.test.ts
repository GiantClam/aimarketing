import assert from "node:assert/strict"
import test from "node:test"

import { mapWorkLibraryItemToCandidate } from "@/lib/platform/works"
import { filterWorkLibraryCandidates, groupWorkLibraryCandidates } from "@/lib/platform/work-library-shared"

test("mapWorkLibraryItemToCandidate derives preview kind and group", () => {
  const item = mapWorkLibraryItemToCandidate({
    workItem: {
      id: 4,
      enterpriseId: 2,
      ownerUserId: 1,
      sourceArtifactId: 9,
      type: "document",
      title: "Quarterly report",
      summary: null,
      metadata: { source: "workflow" },
      createdAt: new Date("2026-06-16T10:00:00.000Z"),
      updatedAt: new Date("2026-06-16T10:00:00.000Z"),
    },
    artifact: {
      id: 9,
      runId: 3,
      enterpriseId: 2,
      ownerUserId: 1,
      kind: "file",
      title: "Quarterly report.pdf",
      mimeType: "application/pdf",
      storageKey: null,
      externalUrl: "https://example.com/quarterly-report.pdf",
      payload: { source: "workflow" },
      createdAt: new Date("2026-06-16T09:59:00.000Z"),
    },
    referenceCount: 1,
  })

  assert.equal(item.previewKind, "pdf")
  assert.equal(item.formatGroup, "document")
  assert.equal(item.source, "workflow")
  assert.equal(item.previewUrl, "https://example.com/quarterly-report.pdf")
})

test("filterWorkLibraryCandidates matches title, mime, source, and ids", () => {
  const items = [
    {
      workId: 1,
      artifactId: 101,
      title: "Spring banner",
      type: "image_set",
      source: "assistant",
      mimeType: "image/png",
      artifactKind: "file",
      createdAt: "2026-06-16T10:00:00.000Z",
      previewKind: "image",
      formatGroup: "image",
      sourceUrl: "https://example.com/a.png",
      previewUrl: "https://example.com/a.png",
      downloadUrl: "/api/platform/artifacts/101/download?download=1",
      referenceCount: 1,
    },
    {
      workId: 2,
      artifactId: 202,
      title: "Launch narration",
      type: "audio",
      source: "workflow",
      mimeType: "audio/mpeg",
      artifactKind: "file",
      createdAt: "2026-06-16T09:00:00.000Z",
      previewKind: "audio",
      formatGroup: "audio",
      sourceUrl: "https://example.com/b.mp3",
      previewUrl: "https://example.com/b.mp3",
      downloadUrl: "/api/platform/artifacts/202/download?download=1",
      referenceCount: 1,
    },
  ] as const

  assert.equal(filterWorkLibraryCandidates([...items], "assistant").length, 1)
  assert.equal(filterWorkLibraryCandidates([...items], "audio/mpeg").length, 1)
  assert.equal(filterWorkLibraryCandidates([...items], "202").length, 1)
  assert.equal(filterWorkLibraryCandidates([...items], "launch").length, 1)
})

test("groupWorkLibraryCandidates keeps fixed group order and time descending inside groups", () => {
  const groups = groupWorkLibraryCandidates([
    {
      workId: 3,
      artifactId: 301,
      title: "Older image",
      type: "image_set",
      source: "workflow",
      mimeType: "image/png",
      artifactKind: "file",
      createdAt: "2026-06-16T08:00:00.000Z",
      previewKind: "image",
      formatGroup: "image",
      sourceUrl: "https://example.com/old.png",
      previewUrl: "https://example.com/old.png",
      downloadUrl: "/api/platform/artifacts/301/download?download=1",
      referenceCount: 1,
    },
    {
      workId: 4,
      artifactId: 302,
      title: "Newer image",
      type: "image_set",
      source: "workflow",
      mimeType: "image/png",
      artifactKind: "file",
      createdAt: "2026-06-16T09:00:00.000Z",
      previewKind: "image",
      formatGroup: "image",
      sourceUrl: "https://example.com/new.png",
      previewUrl: "https://example.com/new.png",
      downloadUrl: "/api/platform/artifacts/302/download?download=1",
      referenceCount: 1,
    },
    {
      workId: 5,
      artifactId: 401,
      title: "Brief",
      type: "document",
      source: "chat",
      mimeType: "application/pdf",
      artifactKind: "file",
      createdAt: "2026-06-16T07:00:00.000Z",
      previewKind: "pdf",
      formatGroup: "document",
      sourceUrl: "https://example.com/brief.pdf",
      previewUrl: "https://example.com/brief.pdf",
      downloadUrl: "/api/platform/artifacts/401/download?download=1",
      referenceCount: 1,
    },
  ])

  assert.deepEqual(groups.map((group) => group.key), ["image", "document"])
  assert.deepEqual(groups[0]?.items.map((item) => item.workId), [4, 3])
})
