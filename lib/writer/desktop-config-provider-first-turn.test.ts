import assert from "node:assert/strict"
import { createServer } from "node:http"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { runWriterSkillFirstTurn } from "./skills"

test("Writer uses the desktop config.json text provider when Railway OpenCode is unavailable", async () => {
  const result = {
    schemaVersion: 1,
    outcome: "draft_ready",
    operation: "create",
    platform: "wechat",
    userMessage: "Draft ready.",
    draft: {
      title: "配置驱动的内容策略",
      content: "# 配置驱动的内容策略\n\n## 方法\n\n- 先定义受众\n\n> 让内容服务于决策。\n\n**重点：持续复盘。**\n\n![Cover](writer-asset://cover)",
      baseRevision: 0,
    },
    research: { requested: false, completed: false, sourceUrls: [] },
    assetIntents: [{ id: "cover", kind: "cover", prompt: "editorial cover", placement: "after_title", aspectRatio: "16:9" }],
  }
  const server = createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      response.writeHead(404).end()
      return
    }
    await new Promise<void>((resolve) => request.on("data", () => undefined).on("end", resolve))
    response.writeHead(200, { "content-type": "application/json" })
    response.end(JSON.stringify({
      id: "chatcmpl-desktop-config-test",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "gpt-5.4",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          tool_calls: [{
            id: "call_writer_submit_result",
            type: "function",
            function: { name: "writer_submit_result", arguments: JSON.stringify(result) },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 12, completion_tokens: 24, total_tokens: 36 },
    }))
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  const root = mkdtempSync(join(tmpdir(), "aimarketing-writer-config-"))
  const configPath = join(root, "config.json")
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    workspacePath: root,
    provider: { id: "local", source: "local", model: "ollama/qwen3:8b" },
    providers: {
      "text-main": { id: "text-main", source: "openai-compatible", model: "gpt-5.4", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "config-test-key" },
    },
    defaults: { text: "text-main" },
    runtime: { source: "system" },
  }), "utf8")
  const originalPath = process.env.AIMARKETING_DESKTOP_CONFIG_PATH
  const originalFixtures = process.env.WRITER_E2E_FIXTURES
  process.env.AIMARKETING_DESKTOP_CONFIG_PATH = configPath
  delete process.env.WRITER_E2E_FIXTURES

  try {
    const output = await runWriterSkillFirstTurn({
      query: "Write a WeChat article about sustainable AI content operations.",
      platform: "wechat",
      mode: "article",
      preferredLanguage: "zh",
    })
    assert.equal(output.outcome, "draft_ready")
    assert.match(output.answer, /配置驱动的内容策略/u)
    assert.equal(output.assetIntents?.[0]?.id, "cover")
  } finally {
    if (originalPath === undefined) delete process.env.AIMARKETING_DESKTOP_CONFIG_PATH
    else process.env.AIMARKETING_DESKTOP_CONFIG_PATH = originalPath
    if (originalFixtures === undefined) delete process.env.WRITER_E2E_FIXTURES
    else process.env.WRITER_E2E_FIXTURES = originalFixtures
    rmSync(root, { recursive: true, force: true })
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
