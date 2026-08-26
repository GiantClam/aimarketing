import assert from "node:assert/strict"
import test from "node:test"

import { isPlatformArtifactR2Available, uploadPlatformArtifactBufferToR2 } from "./artifact-storage"

const originalDesktopLocal = process.env.AIMARKETING_DESKTOP_LOCAL
const originalRuntimeMode = process.env.AI_ENTRY_RUNTIME_MODE

test.after(() => {
  if (originalDesktopLocal === undefined) delete process.env.AIMARKETING_DESKTOP_LOCAL
  else process.env.AIMARKETING_DESKTOP_LOCAL = originalDesktopLocal
  if (originalRuntimeMode === undefined) delete process.env.AI_ENTRY_RUNTIME_MODE
  else process.env.AI_ENTRY_RUNTIME_MODE = originalRuntimeMode
})

test("desktop-local execution disables platform artifact R2 uploads", async () => {
  process.env.AIMARKETING_DESKTOP_LOCAL = "1"
  delete process.env.AI_ENTRY_RUNTIME_MODE

  assert.equal(isPlatformArtifactR2Available(), false)
  await assert.rejects(
    uploadPlatformArtifactBufferToR2({
      buffer: Buffer.from("local-artifact"),
      enterpriseId: 42,
      runId: 7,
      provider: "writer",
      fileName: "cover.png",
      contentType: "image/png",
    }),
    /platform_artifact_r2_disabled/u,
  )
})

test("desktop-local runtime mode also disables platform artifact R2", () => {
  delete process.env.AIMARKETING_DESKTOP_LOCAL
  process.env.AI_ENTRY_RUNTIME_MODE = "desktop-local-exec"

  assert.equal(isPlatformArtifactR2Available(), false)
})
