import assert from "node:assert/strict"
import test from "node:test"

import { resolveWriterOpenCodeSkillIds } from "./skill-catalog"

test("Writer OpenCode skill selection mounts the orchestrator, content, platform, and WeChat style", () => {
  assert.deepEqual(resolveWriterOpenCodeSkillIds({
    contentType: "social_cn",
    targetPlatform: "WeChat Official Account",
  }), ["writer-orchestrator", "social-writing-cn", "writer-wechat", "khazix-writer"])
})

test("Writer OpenCode skill selection uses platform Skills without native model branches", () => {
  assert.deepEqual(resolveWriterOpenCodeSkillIds({
    contentType: "social_global",
    targetPlatform: "LinkedIn",
  }), ["writer-orchestrator", "social-writing-global", "writer-linkedin"])
})
