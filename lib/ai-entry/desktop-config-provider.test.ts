import assert from "node:assert/strict"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { resolveDesktopConfiguredWriterProvider } from "./desktop-config-provider"

const originalPath = process.env.AIMARKETING_DESKTOP_CONFIG_PATH

test.after(() => {
  if (originalPath === undefined) delete process.env.AIMARKETING_DESKTOP_CONFIG_PATH
  else process.env.AIMARKETING_DESKTOP_CONFIG_PATH = originalPath
})

test("resolves the desktop config.json text default and selected model", () => {
  const root = mkdtempSync(join(tmpdir(), "aimarketing-writer-config-"))
  const configPath = join(root, "config.json")
  writeFileSync(configPath, JSON.stringify({
    schemaVersion: 1,
    workspacePath: root,
    provider: { id: "legacy", model: "legacy/model", baseUrl: "https://legacy.example/v1", apiKey: "legacy-key" },
    providers: {
      "text-main": { id: "text-main", source: "openai-compatible", model: "gpt-5.4", baseUrl: "https://text.example/v1", apiKey: "configured-key", models: ["gpt-5.4", "gpt-5.4-mini"] },
    },
    defaults: { text: "text-main" },
    runtime: { source: "system" },
  }), "utf8")
  process.env.AIMARKETING_DESKTOP_CONFIG_PATH = configPath

  try {
    assert.deepEqual(resolveDesktopConfiguredWriterProvider(), {
      id: "desktop-configured",
      apiKey: "configured-key",
      baseURL: "https://text.example/v1",
      model: "gpt-5.4",
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("returns null when desktop config has no usable text endpoint", () => {
  const root = mkdtempSync(join(tmpdir(), "aimarketing-writer-config-"))
  const configPath = join(root, "config.json")
  writeFileSync(configPath, JSON.stringify({ provider: { id: "local", model: "ollama/qwen3:8b" } }), "utf8")
  process.env.AIMARKETING_DESKTOP_CONFIG_PATH = configPath

  try {
    assert.equal(resolveDesktopConfiguredWriterProvider(), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
