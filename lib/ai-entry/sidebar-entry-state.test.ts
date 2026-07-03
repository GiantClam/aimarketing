import assert from "node:assert/strict"
import test from "node:test"

import { resolveAiEntrySidebarEntryState } from "./sidebar-entry-state"

test("plain ai chat entry does not inherit the current agent", () => {
  const state = resolveAiEntrySidebarEntryState({
    entryHref: "/dashboard/ai",
    currentAgentId: "executive-ppt",
    currentEntryMode: null,
  })

  assert.equal(state.effectiveAgentId, null)
  assert.equal(state.hrefSuffix, "")
  assert.equal(state.cacheKeySuffix, "chat")
  assert.equal(state.isMatchedAgent, false)
})

test("fixed agent entry keeps its own agent context", () => {
  const state = resolveAiEntrySidebarEntryState({
    entryHref: "/dashboard/ai?agent=executive-ppt",
    activeAgentId: "executive-ppt",
    currentAgentId: "executive-ppt",
    currentEntryMode: null,
  })

  assert.equal(state.effectiveAgentId, "executive-ppt")
  assert.equal(state.hrefSuffix, "?agent=executive-ppt")
  assert.equal(state.cacheKeySuffix, "chat:executive-ppt")
  assert.equal(state.isMatchedAgent, true)
})

test("consulting entry only matches consulting routes", () => {
  const plainState = resolveAiEntrySidebarEntryState({
    entryHref: "/dashboard/ai?entry=consulting-advisor",
    currentAgentId: null,
    currentEntryMode: null,
  })
  const consultingState = resolveAiEntrySidebarEntryState({
    entryHref: "/dashboard/ai?entry=consulting-advisor",
    currentAgentId: null,
    currentEntryMode: "consulting-advisor",
  })

  assert.equal(plainState.isMatchedAgent, false)
  assert.equal(consultingState.isMatchedAgent, true)
  assert.equal(consultingState.hrefSuffix, "?entry=consulting-advisor")
})
