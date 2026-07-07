import assert from "node:assert/strict"
import test from "node:test"

import { buildAiEntryProviderMessages } from "./ai-entry-executor"

test("DeepSeek provider receives system instructions inside user content", () => {
  const result = buildAiEntryProviderMessages({
    providerId: "deepseek",
    systemPrompt: "Follow the workflow brief.",
    messages: [{ role: "user", content: "Create the answer." }],
  })

  assert.equal(result.system, undefined)
  assert.deepEqual(result.messages, [
    {
      role: "user",
      content: "System instruction (must follow):\nFollow the workflow brief.\n\nUser request:\nCreate the answer.",
    },
  ])
})

test("OpenAI-family providers keep native system instructions", () => {
  const result = buildAiEntryProviderMessages({
    providerId: "pptoken",
    systemPrompt: "Follow the workflow brief.",
    messages: [{ role: "user", content: "Create the answer." }],
  })

  assert.equal(result.system, "Follow the workflow brief.")
  assert.deepEqual(result.messages, [{ role: "user", content: "Create the answer." }])
})

test("enterprise qwen provider inlines system instructions into the first user message", () => {
  const result = buildAiEntryProviderMessages({
    providerId: "enterprise-qwen-official",
    systemPrompt: "Follow the workflow brief.",
    messages: [{ role: "user", content: "Create the answer." }],
  })

  assert.equal(result.system, undefined)
  assert.deepEqual(result.messages, [
    {
      role: "user",
      content: "System instruction (must follow):\nFollow the workflow brief.\n\nUser request:\nCreate the answer.",
    },
  ])
})
