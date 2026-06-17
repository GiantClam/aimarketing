import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }
  return originalLoad.call(this, request, parent, isMain)
}

async function loadBusinessWorkbenchStateModule() {
  return import("./business-workbench-state")
}

test("business workbench state sanitizer keeps only valid business agent tabs", async () => {
  const { sanitizeBusinessWorkbenchStateInput } = await loadBusinessWorkbenchStateModule()
  const state = sanitizeBusinessWorkbenchStateInput({
    currentViewSlug: "sales-close",
    activeTabId: "tab-2",
    tabs: [
      {
        id: "tab-1",
        agentId: "business-content-growth",
        conversationId: "conv-1",
        draftSeed: "hello",
        workspaceVersion: 1,
      },
      {
        id: "tab-2",
        agentId: "business-sales-close",
        conversationId: null,
        draftSeed: "close plan",
        workspaceVersion: 3,
      },
      {
        id: "bad-tab",
        agentId: "not-real-agent",
      },
    ],
  })

  assert.equal(state.currentViewSlug, "sales-close")
  assert.equal(state.tabs.length, 2)
  assert.equal(state.activeTabId, "tab-2")
  assert.equal(state.tabs[1]?.agentId, "business-sales-close")
})

test("business workbench state sanitizer falls back when active tab is invalid", async () => {
  const { sanitizeBusinessWorkbenchStateInput } = await loadBusinessWorkbenchStateModule()
  const state = sanitizeBusinessWorkbenchStateInput({
    currentViewSlug: "not-a-real-view",
    activeTabId: "missing-tab",
    tabs: [
      {
        id: "tab-1",
        agentId: "business-seo-repurpose",
        conversationId: "conv-1",
        draftSeed: "seo",
        workspaceVersion: 2,
      },
    ],
  })

  assert.equal(state.currentViewSlug, "content-growth")
  assert.equal(state.activeTabId, "tab-1")
})

test("business workbench state sanitizer dedupes tabs by agent id", async () => {
  const { sanitizeBusinessWorkbenchStateInput } = await loadBusinessWorkbenchStateModule()
  const state = sanitizeBusinessWorkbenchStateInput({
    currentViewSlug: "content-growth",
    activeTabId: "tab-2",
    tabs: [
      {
        id: "tab-1",
        agentId: "business-content-growth",
        conversationId: "201",
        draftSeed: "first",
        workspaceVersion: 1,
      },
      {
        id: "tab-2",
        agentId: "business-content-growth",
        conversationId: "202",
        draftSeed: "second",
        workspaceVersion: 2,
      },
    ],
  })

  assert.equal(state.tabs.length, 1)
  assert.equal(state.tabs[0]?.id, "tab-1")
  assert.equal(state.activeTabId, "tab-1")
})

test("business workbench state validation clears stale conversation ids that no longer belong to the tab agent", async () => {
  const {
    sanitizeBusinessWorkbenchStateInput,
    validateBusinessWorkbenchStateConversations,
  } = await loadBusinessWorkbenchStateModule()
  const state = sanitizeBusinessWorkbenchStateInput({
    currentViewSlug: "lead-conversion",
    activeTabId: "tab-1",
    tabs: [
      {
        id: "tab-1",
        agentId: "business-lead-conversion",
        conversationId: "239",
        draftSeed: "lead qualification",
        workspaceVersion: 1,
      },
      {
        id: "tab-2",
        agentId: "business-knowledge-assets",
        conversationId: "240",
        draftSeed: "knowledge sync",
        workspaceVersion: 1,
      },
    ],
  })

  const validated = await validateBusinessWorkbenchStateConversations(state, async (tab) => tab.conversationId === "240")

  assert.equal(validated.tabs[0]?.conversationId, null)
  assert.equal(validated.tabs[1]?.conversationId, "240")
})
