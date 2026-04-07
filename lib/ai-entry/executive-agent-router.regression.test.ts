import assert from "node:assert/strict"
import test from "node:test"

import { routeExecutiveAgentByPrompt } from "./executive-agent-router"

test("routes brand prompt to executive-brand", () => {
  const decision = routeExecutiveAgentByPrompt(
    "我们要做品牌定位和价值主张重构，给我叙事框架。",
  )

  assert.equal(decision.agentId, "executive-brand")
  assert.equal(decision.fallback, false)
})

test("routes legal prompt to executive-legal-risk", () => {
  const decision = routeExecutiveAgentByPrompt(
    "Please review contract clauses and compliance risks for this employment case.",
  )

  assert.equal(decision.agentId, "executive-legal-risk")
  assert.equal(decision.fallback, false)
})

test("routes chinese growth prompt to executive-growth", () => {
  const decision = routeExecutiveAgentByPrompt("请做增长漏斗诊断，给30天实验排期。")

  assert.equal(decision.agentId, "executive-growth")
  assert.equal(decision.fallback, false)
})

test("falls back to diagnostic for weak signal prompt", () => {
  const decision = routeExecutiveAgentByPrompt("帮我想想下一步怎么做")
  assert.equal(decision.agentId, "executive-diagnostic")
  assert.equal(decision.fallback, true)
})
