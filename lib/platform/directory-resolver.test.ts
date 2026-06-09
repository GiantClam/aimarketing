import assert from "node:assert/strict"
import test from "node:test"

import { buildPlatformRegistryDefaultEntries } from "@/lib/platform/control-plane"
import { __testables__, filterPlatformRegistryEntriesForSurface } from "@/lib/platform/directory-resolver"

test("directory resolver keeps public-enabled registry entries on the public surface", () => {
  const entries = buildPlatformRegistryDefaultEntries("en", "plugin")
  const visible = filterPlatformRegistryEntriesForSurface(entries, "public")

  assert.ok(visible.length > 0)
  assert.ok(visible.every((entry) => entry.config.enabled && entry.config.publicVisible))
})

test("directory resolver excludes disabled entries from workspace surface", () => {
  const entries = buildPlatformRegistryDefaultEntries("en", "workflow")
  const hiddenSlug = entries[0]?.slug || "campaign-launch"
  const visible = filterPlatformRegistryEntriesForSurface(
    entries.map((entry) =>
      entry.slug === hiddenSlug
        ? {
            ...entry,
            config: {
              ...entry.config,
              enabled: false,
              workspaceVisible: true,
            },
          }
        : entry,
    ),
    "workspace",
  )

  assert.ok(visible.every((entry) => entry.config.enabled && entry.config.workspaceVisible))
  assert.equal(visible.some((entry) => entry.slug === hiddenSlug), false)
})

test("directory resolver merges enterprise custom entries and lets them override base slugs", async () => {
  const visible = await __testables__.buildVisiblePlatformRegistryEntries(
    {
      locale: "en",
      itemType: "agent",
      surface: "workspace",
      enterpriseId: 7,
    },
    {
      loadBaseEntries: async () => [
        {
          itemType: "agent",
          slug: "shared-agent",
          title: "Base agent",
          summary: "Base summary",
          status: "live",
          defaultConfig: {
            enabled: true,
            publicVisible: false,
            workspaceVisible: true,
            bindingTarget: "agent-platform",
            bindingMode: "existing_runtime",
            notes: "",
          },
          config: {
            enabled: true,
            publicVisible: false,
            workspaceVisible: true,
            bindingTarget: "agent-platform",
            bindingMode: "existing_runtime",
            notes: "",
          },
          proofPoints: ["Base proof"],
          surfaceLabel: "Workspace",
          bindingOptions: [],
        },
      ],
      loadCustomEntries: async (locale, _enterpriseId, itemType) => [
        __testables__.toCustomDirectoryEntry(locale, itemType, {
          id: 1,
          slug: "shared-agent",
          title: "Custom agent",
          summary: "Custom summary",
          focus: "Enterprise approvals",
          status: "beta",
          publicVisible: false,
          workspaceVisible: true,
          bindingTarget: "ai-chat",
          bindingMode: "existing_runtime",
          notes: "",
          bindingOptions: [],
        }),
        __testables__.toCustomDirectoryEntry(locale, itemType, {
          id: 2,
          slug: "public-agent",
          title: "Public custom agent",
          summary: "Public summary",
          focus: "Public entry",
          status: "live",
          publicVisible: true,
          workspaceVisible: true,
          bindingTarget: "ai-chat",
          bindingMode: "external_runtime",
          notes: "",
          bindingOptions: [],
        }),
      ],
    },
  )

  assert.equal(visible.length, 2)
  assert.equal(visible[0]?.slug, "shared-agent")
  assert.equal(visible[0]?.title, "Custom agent")
  assert.equal(visible[0]?.summary, "Custom summary")
  assert.ok(visible[0]?.proofPoints.includes("Enterprise custom agent card"))
  assert.equal(visible[1]?.slug, "public-agent")
})

test("directory resolver hides planned enterprise custom entries from public results", async () => {
  const visible = await __testables__.buildVisiblePlatformRegistryEntries(
    {
      locale: "en",
      itemType: "workflow",
      surface: "public",
      enterpriseId: 7,
    },
    {
      loadBaseEntries: async () => [],
      loadCustomEntries: async (locale, _enterpriseId, itemType) => [
        __testables__.toCustomDirectoryEntry(locale, itemType, {
          id: 9,
          slug: "planned-workflow",
          title: "Planned workflow",
          summary: "Summary",
          trigger: "Planner",
          status: "planned",
          publicVisible: true,
          workspaceVisible: true,
          bindingTarget: "agent-platform",
          bindingMode: "deferred",
          notes: "",
          bindingOptions: [],
        }),
      ],
    },
  )

  assert.equal(visible.length, 0)
})

test("admin registry entries include enterprise custom entries even when they are not visible on a surface", async () => {
  const entries = await __testables__.buildAdminPlatformRegistryEntries(
    {
      locale: "en",
      itemType: "workflow",
      enterpriseId: 9,
    },
    {
      loadBaseEntries: async () => [
        {
          itemType: "workflow",
          slug: "campaign-launch",
          title: "Campaign launch",
          summary: "Base workflow",
          status: "live",
          defaultConfig: {
            enabled: true,
            publicVisible: true,
            workspaceVisible: true,
            bindingTarget: "ai-ppt",
            bindingMode: "existing_runtime",
            notes: "",
          },
          config: {
            enabled: true,
            publicVisible: true,
            workspaceVisible: true,
            bindingTarget: "ai-ppt",
            bindingMode: "existing_runtime",
            notes: "",
          },
          proofPoints: ["Base workflow"],
          surfaceLabel: "Public + workspace",
          bindingOptions: [],
        },
      ],
      loadCustomEntries: async (locale, _enterpriseId, itemType) => [
        __testables__.toCustomDirectoryEntry(locale, itemType, {
          id: 1,
          slug: "private-workflow",
          title: "Private workflow",
          summary: "Workspace-only custom workflow",
          trigger: "Internal approval",
          status: "beta",
          publicVisible: false,
          workspaceVisible: false,
          bindingTarget: "agent-platform",
          bindingMode: "deferred",
          notes: "",
          bindingOptions: [],
        }),
      ],
    },
  )

  assert.equal(entries.length, 2)
  assert.equal(entries[0]?.slug, "campaign-launch")
  assert.equal(entries[1]?.slug, "private-workflow")
  assert.equal(entries[1]?.config.publicVisible, false)
  assert.equal(entries[1]?.config.workspaceVisible, false)
  assert.ok(entries[1]?.proofPoints.includes("Enterprise custom workflow template"))
})

test("directory resolver resolves binding targets into real public and workspace hrefs", () => {
  const entry = __testables__.withResolvedEntryHrefs({
    itemType: "plugin",
    slug: "custom-plugin",
    title: "Custom plugin",
    summary: "Summary",
    status: "live",
    defaultConfig: {
      enabled: true,
      publicVisible: true,
      workspaceVisible: true,
      bindingTarget: "ai-image",
      bindingMode: "existing_runtime",
      notes: "",
    },
    config: {
      enabled: true,
      publicVisible: true,
      workspaceVisible: true,
      bindingTarget: "ai-image",
      bindingMode: "existing_runtime",
      notes: "",
    },
    proofPoints: ["One"],
    surfaceLabel: "Public + workspace",
    bindingOptions: [],
  })

  assert.equal(entry.publicHref, "/tools/ai-image")
  assert.equal(entry.workspaceHref, "/dashboard/image-assistant")
})

test("directory resolver keeps deferred entries on directory hubs instead of pretending runtime execution", () => {
  const entry = __testables__.withResolvedEntryHrefs({
    itemType: "mcp_service",
    slug: "planned-mcp",
    title: "Planned MCP",
    summary: "Summary",
    status: "planned",
    publicHref: "/mcp-services",
    workspaceHref: "/dashboard/mcp-services",
    defaultConfig: {
      enabled: false,
      publicVisible: true,
      workspaceVisible: true,
      bindingTarget: "knowledge-base",
      bindingMode: "deferred",
      notes: "",
    },
    config: {
      enabled: false,
      publicVisible: true,
      workspaceVisible: true,
      bindingTarget: "knowledge-base",
      bindingMode: "deferred",
      notes: "",
    },
    proofPoints: ["One"],
    surfaceLabel: "Public + workspace",
    bindingOptions: [],
  })

  assert.equal(entry.publicHref, "/mcp-services")
  assert.equal(entry.workspaceHref, "/dashboard/mcp-services")
})
