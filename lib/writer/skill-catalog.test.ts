import assert from "node:assert/strict"
import test from "node:test"

import { resolveWriterOpenCodeSkillIds } from "./skill-catalog"

test("Writer OpenCode skill selection mounts khazix as the sole WeChat platform authority", () => {
  assert.deepEqual(resolveWriterOpenCodeSkillIds({
    contentType: "social_cn",
    targetPlatform: "WeChat Official Account",
  }), ["writer-orchestrator", "social-writing-cn", "khazix-writer"])
})

test("Writer OpenCode skill selection uses platform Skills without native model branches", () => {
  assert.deepEqual(resolveWriterOpenCodeSkillIds({
    contentType: "social_global",
    targetPlatform: "LinkedIn",
  }), ["writer-orchestrator", "social-writing-global", "writer-linkedin"])
})
