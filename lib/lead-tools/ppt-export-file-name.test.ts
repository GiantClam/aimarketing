import assert from "node:assert/strict"
import test from "node:test"

import { buildPptExportFileName } from "@/lib/lead-tools/ppt-export-file-name"

test("buildPptExportFileName includes resolved page count and template id", () => {
  const fileName = buildPptExportFileName(
    {
      title: "AI Growth Deck",
      pageCount: null,
      resolvedPageCount: 11,
    },
    {
      key: "ppt169_swiss_grid_systems",
      styleKey: "ppt169_swiss_grid_systems",
      templateId: "neo-grid-bold",
      slides: new Array(11).fill({}),
    },
    "html",
  )

  assert.equal(fileName, "ai-growth-deck-11p-neo-grid-bold.html")
})

test("buildPptExportFileName keeps narrative angle in single-template variants", () => {
  const fileName = buildPptExportFileName(
    {
      title: "Launch Narrative",
      pageCount: null,
      resolvedPageCount: 9,
    },
    {
      key: "neo-grid-bold-executive-brief",
      styleKey: "ppt169_swiss_grid_systems",
      templateId: "neo-grid-bold",
      narrativeAngle: "executive-brief",
      slides: new Array(9).fill({}),
    },
    "pptx",
  )

  assert.equal(fileName, "launch-narrative-9p-neo-grid-bold-executive-brief.pptx")
})
