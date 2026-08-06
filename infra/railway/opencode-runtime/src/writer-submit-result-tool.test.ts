import assert from "node:assert/strict"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import writerSubmitResult from "../../../../content/opencode-tools/writer_submit_result"

test("writer_submit_result writes to the OpenCode session directory", async () => {
  const sessionDir = await mkdtemp(join(tmpdir(), "writer-submit-result-"))
  try {
    await mkdir(join(sessionDir, ".runtime"), { recursive: true })
    await writeFile(join(sessionDir, ".runtime", "writer-context.json"), JSON.stringify({ activeRevision: 7 }))

    await writerSubmitResult.execute({
      schemaVersion: 1,
      outcome: "draft_ready",
      operation: "revise",
      platform: "微信公众号",
      userMessage: "已完成修改。",
      draft: { title: "原始标题", content: "正文", baseRevision: 7 },
      research: { requested: false, completed: false, sourceUrls: [] },
      assetIntents: [{ id: "cover", kind: "cover", prompt: "editorial cover", placement: "after_title", aspectRatio: "16:9" }],
    }, { directory: sessionDir })

    const saved = JSON.parse(await readFile(join(sessionDir, ".runtime", "writer-submit-result.json"), "utf8")) as { draft?: { baseRevision?: number } }
    assert.equal(saved.draft?.baseRevision, 7)
  } finally {
    await rm(sessionDir, { recursive: true, force: true })
  }
})
