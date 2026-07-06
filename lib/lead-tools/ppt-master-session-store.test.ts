import assert from "node:assert/strict"
import fs from "node:fs/promises"
import test from "node:test"

import {
  createPptMasterSessionArchive,
  getPptMasterSessionDir,
  restorePptMasterSessionArchive,
  setConfiguredPptMasterSessionStoreForTests,
  type PptMasterSessionStore,
} from "@/lib/lead-tools/ppt-master-session-store"
import { __testables__ } from "@/lib/lead-tools/ppt-master-runtime"

test("ppt master session archive round-trips nested files", async () => {
  const sessionDir = getPptMasterSessionDir(`archive-roundtrip-${Date.now()}`)

  await fs.rm(sessionDir, { recursive: true, force: true })
  await fs.mkdir(`${sessionDir}/nested`, { recursive: true })
  await fs.writeFile(`${sessionDir}/manifest.json`, "{\"ok\":true}\n", "utf8")
  await fs.writeFile(`${sessionDir}/nested/slide.svg`, "<svg>slide</svg>", "utf8")

  const archive = await createPptMasterSessionArchive(sessionDir)
  await fs.rm(sessionDir, { recursive: true, force: true })
  await restorePptMasterSessionArchive(sessionDir, archive)

  assert.equal(await fs.readFile(`${sessionDir}/manifest.json`, "utf8"), "{\"ok\":true}\n")
  assert.equal(await fs.readFile(`${sessionDir}/nested/slide.svg`, "utf8"), "<svg>slide</svg>")

  await fs.rm(sessionDir, { recursive: true, force: true })
})

test("ppt master runtime restores missing manifest from configured session store", async () => {
  const sessionId = `persisted-session-${Date.now()}`
  const sessionDir = getPptMasterSessionDir(sessionId)
  const manifest = {
    sessionId,
    createdAt: "2026-06-25T00:00:00.000Z",
    title: "Persisted Session",
    deck: {
      title: "Persisted Session",
      scenario: "sales-deck",
      language: "zh-CN",
      generatedAt: "2026-06-25T00:00:00.000Z",
      outline: ["封面", "价值"],
      previewEngine: "ppt-master-project",
      previewSessionId: sessionId,
      provider: "pptoken",
      previewModel: "gpt-5.4",
      variants: [],
    },
    variants: [],
  }

  await fs.rm(sessionDir, { recursive: true, force: true })
  await fs.mkdir(`${sessionDir}/notes`, { recursive: true })
  await fs.writeFile(`${sessionDir}/manifest.json`, JSON.stringify(manifest, null, 2), "utf8")
  await fs.writeFile(`${sessionDir}/notes/01_cover.md`, "# persisted\n", "utf8")

  const archive = await createPptMasterSessionArchive(sessionDir)
  await fs.rm(sessionDir, { recursive: true, force: true })

  const store: PptMasterSessionStore = {
    async saveSession() {},
    async getSession(requestedSessionId) {
      if (requestedSessionId !== sessionId) return null
      return {
        sessionId,
        createdAt: manifest.createdAt,
        manifest,
        archive,
      }
    },
  }

  setConfiguredPptMasterSessionStoreForTests(store)

  try {
    const restored = await __testables__.readManifest(sessionId)
    assert.equal(restored.sessionId, sessionId)
    assert.equal(restored.title, "Persisted Session")
    assert.equal(await fs.readFile(`${sessionDir}/notes/01_cover.md`, "utf8"), "# persisted\n")
  } finally {
    setConfiguredPptMasterSessionStoreForTests(null)
    await fs.rm(sessionDir, { recursive: true, force: true })
  }
})

test("ppt master runtime restores variant project files when only manifest is present", async () => {
  const sessionId = `partial-session-${Date.now()}`
  const sessionDir = getPptMasterSessionDir(sessionId)
  const variantDir = `${sessionDir}/variant-a`
  const manifest = {
    sessionId,
    createdAt: "2026-06-25T00:00:00.000Z",
    title: "Partial Session",
    deck: {
      title: "Partial Session",
      scenario: "training",
      language: "zh-CN",
      generatedAt: "2026-06-25T00:00:00.000Z",
      outline: ["封面"],
      previewEngine: "ppt-master-project",
      previewSessionId: sessionId,
      provider: "pptoken",
      previewModel: "gpt-5.4",
      variants: [],
    },
    variants: [
      {
        key: "variant-a",
        name: "Variant A",
        projectDir: variantDir,
        slideCount: 1,
      },
    ],
  }

  await fs.rm(sessionDir, { recursive: true, force: true })
  await fs.mkdir(`${variantDir}/svg_final`, { recursive: true })
  await fs.writeFile(`${sessionDir}/manifest.json`, JSON.stringify(manifest, null, 2), "utf8")
  await fs.writeFile(`${variantDir}/svg_final/01_cover.svg`, "<svg>restored</svg>", "utf8")

  const archive = await createPptMasterSessionArchive(sessionDir)
  await fs.rm(`${variantDir}/svg_final`, { recursive: true, force: true })

  const store: PptMasterSessionStore = {
    async saveSession() {},
    async getSession(requestedSessionId) {
      if (requestedSessionId !== sessionId) return null
      return {
        sessionId,
        createdAt: manifest.createdAt,
        manifest,
        archive,
      }
    },
  }

  setConfiguredPptMasterSessionStoreForTests(store)

  try {
    const { variant } = await __testables__.getPptMasterSessionVariant(sessionId, "variant-a")
    assert.equal(variant.key, "variant-a")
    assert.equal(await fs.readFile(`${variantDir}/svg_final/01_cover.svg`, "utf8"), "<svg>restored</svg>")
  } finally {
    setConfiguredPptMasterSessionStoreForTests(null)
    await fs.rm(sessionDir, { recursive: true, force: true })
  }
})
