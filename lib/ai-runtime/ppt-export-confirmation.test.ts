import assert from "node:assert/strict"
import test from "node:test"

import { isPptxExportAuthorized } from "./ppt-export-confirmation"

test("PPTX publication follows the native Skill result, not application language parsing", () => {
  assert.equal(
    isPptxExportAuthorized({
      agentId: "executive-ppt",
      selectedSkillIds: ["ppt-master"],
    }),
    true,
  )
  assert.equal(
    isPptxExportAuthorized({
      agentId: "executive-presentation-ppt",
      selectedSkillIds: ["dashiai-ppt"],
    }),
    true,
  )
})
