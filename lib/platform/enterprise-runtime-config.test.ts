import assert from "node:assert/strict"
import test from "node:test"

import { mergeEnterpriseTextProviderConfigs } from "./enterprise-runtime-provider-config"

test("enterprise text runtime keeps env providers selectable alongside the enterprise default", () => {
  const merged = mergeEnterpriseTextProviderConfigs({
    enterpriseProviderConfigs: [
      {
        id: "enterprise-openai-compatible",
        apiKey: "enterprise-key",
        baseURL: "https://api.deepseek.com",
        model: "deepseek-v4-pro",
      },
    ],
    platformProviderConfigs: [
      {
        id: "pptoken",
        apiKey: "pptoken-key",
        baseURL: "https://cn.pptoken.cc/v1",
        model: "gpt-5.6-luna",
      },
      {
        id: "aiberm",
        apiKey: "aiberm-key",
        baseURL: "https://aiberm.com/v1",
        model: "gpt-5.4",
      },
    ],
  })

  assert.deepEqual(merged.map((provider) => provider.id), [
    "enterprise-openai-compatible",
    "pptoken",
    "aiberm",
  ])
  assert.equal(merged[1]?.baseURL, "https://cn.pptoken.cc/v1")
})

test("enterprise provider config wins when ids overlap", () => {
  const merged = mergeEnterpriseTextProviderConfigs({
    enterpriseProviderConfigs: [
      {
        id: "pptoken",
        apiKey: "enterprise-key",
        baseURL: "https://enterprise-pptoken.example/v1",
        model: "gpt-5.6-luna",
      },
    ],
    platformProviderConfigs: [
      {
        id: "pptoken",
        apiKey: "platform-key",
        baseURL: "https://cn.pptoken.cc/v1",
        model: "gpt-5.6-luna",
      },
    ],
  })

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.baseURL, "https://enterprise-pptoken.example/v1")
})
