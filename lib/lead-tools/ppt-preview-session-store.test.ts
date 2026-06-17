import assert from "node:assert/strict"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import { getPptPreviewSessionDeck, storePptPreviewSessionDeck } from "./ppt-preview-session-store"

const tempRoot = path.join(os.tmpdir(), `aimarketing-ppt-preview-test-${Date.now()}`)

const sampleDeck = {
  title: "HTML Preview Deck",
  scenario: "marketing-campaign" as const,
  language: "zh-CN" as const,
  generatedAt: "2026-06-02T00:00:00.000Z",
  outline: ["机会窗口", "受众判断", "策略主轴", "执行组合", "转化动作"],
  previewEngine: "frontend-slides-html" as const,
  variants: [
    {
      key: "ppt169_swiss_grid_systems" as const,
      styleKey: "ppt169_swiss_grid_systems" as const,
      name: "Neo-Grid Bold",
      summary: "高密度、强网格、霓黄强调。",
      stylePrompt: "Write with a dense neo-grid mindset.",
      palette: {
        background: "#f4ecdf",
        foreground: "#111111",
        accent: "#2156f4",
        panel: "#ffffff",
        border: "#dddddd",
      },
      strengths: ["强网格"],
      slides: [
        {
          id: "cover-1",
          layout: "cover" as const,
          kicker: "EXECUTIVE BRIEF",
          title: "HTML Preview Deck",
          body: "A browser-first deck with a stored session.",
          bullets: ["Preview", "Share", "Compare", "Export"],
          accent: "#2156f4",
        },
      ],
      preview: {
        format: "svg" as const,
        themeId: "ppt169_swiss_grid_systems",
        cover: {
          mimeType: "image/svg+xml" as const,
          width: 1600,
          height: 900,
          dataUrl: "data:image/svg+xml;base64,cover",
        },
        slides: [
          {
            mimeType: "image/svg+xml" as const,
            width: 1600,
            height: 900,
            dataUrl: "data:image/svg+xml;base64,cover",
          },
        ],
        htmlDocument: {
          fileName: "html-preview-deck.html",
          html: "<!DOCTYPE html><html><body>preview</body></html>",
        },
      },
    },
  ],
}

test.before(() => {
  process.env.LEAD_TOOLS_PPT_SESSION_ROOT_DIR = tempRoot
})

test.after(async () => {
  delete process.env.LEAD_TOOLS_PPT_SESSION_ROOT_DIR
  await fs.rm(tempRoot, { recursive: true, force: true })
})

test("preview session store persists and reloads a frontend slides deck", async () => {
  const storedDeck = await storePptPreviewSessionDeck(sampleDeck)

  assert.ok(storedDeck.previewSessionId)

  const reloadedDeck = await getPptPreviewSessionDeck(storedDeck.previewSessionId)
  assert.equal(reloadedDeck.previewEngine, "frontend-slides-html")
  assert.equal(reloadedDeck.variants[0]?.preview?.htmlDocument?.fileName, "html-preview-deck.html")
  assert.equal(reloadedDeck.variants[0]?.preview?.slides[0]?.mimeType, "image/svg+xml")
})
