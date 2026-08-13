import assert from "node:assert/strict"
import test from "node:test"

import { validateWriterPlatformRegistry } from "./platform-registry"

const primary = (skillId: string) => ({
  skillId,
  dirName: skillId,
  interfaceVersion: "writer-result-v1",
  release: "2026.08.06",
  digest: `sha256:${"a".repeat(64)}`,
})

const platforms = ["wechat", "xiaohongshu", "weibo", "douyin", "x", "linkedin", "instagram", "tiktok", "facebook", "reddit", "generic"]
const registry = {
  schemaVersion: 2,
  platformBindings: platforms.map((platform) => ({
    platformId: platform,
    aliases: [],
    primary: primary(platform === "wechat" ? "khazix-writer" : `writer-${platform}`),
    compatibleStyleSkillIds: [],
    operations: ["create", "revise", "translate", "adapt_platform"],
    modes: ["article"],
    research: { enabled: true },
    assets: { cover: true, inline: true, maxCount: 4, aspectRatios: ["16:9"] },
    output: { titleRequired: true, preserveAuthoredTitle: true, maxChars: 50_000 },
  })),
}

test("registry requires exactly one primary binding for every supported platform", () => {
  const result = validateWriterPlatformRegistry(registry)
  assert.equal(result.platformBindings.length, 11)
  assert.equal(result.platformBindings.find((entry) => entry.platformId === "wechat")?.primary.skillId, "khazix-writer")
})

test("registry rejects duplicate, missing, unknown, and digest-drifted bindings", () => {
  assert.throws(() => validateWriterPlatformRegistry({ ...registry, platformBindings: registry.platformBindings.slice(1) }), /primary_missing:wechat/u)
  assert.throws(() => validateWriterPlatformRegistry({ ...registry, platformBindings: [...registry.platformBindings, registry.platformBindings[0]] }), /duplicate_platform:wechat/u)
  assert.throws(() => validateWriterPlatformRegistry({ ...registry, platformBindings: registry.platformBindings.map((entry, index) => index === 0 ? { ...entry, platformId: "unknown" } : entry) }), /platform_unknown/u)
  assert.throws(() => validateWriterPlatformRegistry(registry, { digestFor: () => `sha256:${"b".repeat(64)}` }), /digest_mismatch/u)
})

test("a platform primary can be replaced without changing the common contract", () => {
  const replacement = {
    ...registry,
    platformBindings: registry.platformBindings.map((entry) => entry.platformId === "reddit"
      ? { ...entry, primary: primary("reddit-community-writer") }
      : entry),
  }
  assert.equal(validateWriterPlatformRegistry(replacement).platformBindings.find((entry) => entry.platformId === "reddit")?.primary.skillId, "reddit-community-writer")
})
