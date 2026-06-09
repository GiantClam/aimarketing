import assert from "node:assert/strict"
import test from "node:test"

import {
  getLocalizedPlatformDirectoryEntryBySlug,
  getLocalizedPublicToolsCenterEntries,
  getLocalizedToolDirectoryEntryBySlug,
  getPlatformDirectoryAvailability,
  getPlatformDirectorySourceMap,
} from "@/lib/platform/directory-registry"

test("tool directory exposes deferred waitlist state without pretending the tool is live", () => {
  const entry = getLocalizedToolDirectoryEntryBySlug("en", "sentiment-monitoring")

  assert.ok(entry)
  assert.equal(entry?.status, "coming_soon")
  assert.equal(entry?.availability, "waitlist")
  assert.equal(entry?.surface, "public")
  assert.equal(entry?.accessMode, "deferred")
})

test("deferred tool directory can mark enterprise-only entries without inventing runtime", () => {
  const entry = getLocalizedToolDirectoryEntryBySlug("en", "hot-video-research")

  assert.ok(entry)
  assert.equal(entry?.status, "coming_soon")
  assert.equal(entry?.availability, "enterprise_only")
  assert.equal(entry?.accessMode, "deferred")
})

test("workspace-only platform entries resolve to enterprise-only availability", () => {
  const plugin = getLocalizedPlatformDirectoryEntryBySlug("en", "plugin", "writer-memory")
  const workflow = getLocalizedPlatformDirectoryEntryBySlug("en", "workflow", "reputation-guard")

  assert.ok(plugin)
  assert.equal(plugin?.availability, "enterprise_only")
  assert.equal(plugin?.surface, "workspace")

  assert.ok(workflow)
  assert.equal(workflow?.availability, "waitlist")
})

test("public deferred platform entries can opt into waitlist state", () => {
  const agent = getLocalizedPlatformDirectoryEntryBySlug("en", "agent", "public-relations-agent")
  const workflow = getLocalizedPlatformDirectoryEntryBySlug("en", "workflow", "reputation-guard")

  assert.ok(agent)
  assert.equal(agent?.status, "planned")
  assert.equal(agent?.availability, "waitlist")

  assert.ok(workflow)
  assert.equal(workflow?.availability, "waitlist")
})

test("video operations agent can stay enterprise-only across shared directory surfaces", () => {
  const agent = getLocalizedPlatformDirectoryEntryBySlug("en", "agent", "video-ops-agent")

  assert.ok(agent)
  assert.equal(agent?.status, "planned")
  assert.equal(agent?.availability, "enterprise_only")
})

test("directory source map documents the registry inputs for toolsite and workspace reuse", () => {
  const sources = getPlatformDirectorySourceMap()

  assert.ok(sources.tool.some((item) => item.file === "lib/lead-tools/catalog.ts"))
  assert.ok(sources.capability.some((item) => item.file === "lib/platform/runtime.ts"))
  assert.ok(sources.workflow.some((item) => item.file === "lib/platform/workflow-templates.ts"))
})

test("availability helper keeps public planned items coming soon by default", () => {
  assert.equal(
    getPlatformDirectoryAvailability("workflow", "visual-ad-pipeline", {
      status: "planned",
      surface: "both",
    }),
    "coming_soon",
  )
})

test("public tools center unifies tool and agent entries for the /tools app center", () => {
  const entries = getLocalizedPublicToolsCenterEntries("en")
  const ppt = entries.find((item) => item.slug === "ai-ppt-preview")
  const agentHub = entries.find((item) => item.slug === "agents")

  assert.ok(ppt)
  assert.equal(ppt?.kind, "tool")
  assert.equal(ppt?.media, "presentation")
  assert.equal(ppt?.accessMode, "preview_then_login")

  assert.ok(agentHub)
  assert.equal(agentHub?.kind, "directory")
  assert.equal(agentHub?.media, "agent")
  assert.equal(agentHub?.availability, "available")
})
