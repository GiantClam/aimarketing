import assert from "node:assert/strict"
import test from "node:test"

import {
  hasLeadHunterSkillSearchConfig,
  isLeadHunterSkillEngineEnabled,
  isLeadHunterSkillRuntimeAvailable,
  resolveLeadHunterEngineMode,
} from "./engine-mode"

function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T) {
  const previous = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key])
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }

  try {
    return fn()
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }
}

test("lead hunter engine mode defaults to dify", () => {
  withEnv({ LEAD_HUNTER_ENGINE: undefined, LEAD_HUNTER_EXECUTION_ENGINE: undefined }, () => {
    assert.equal(resolveLeadHunterEngineMode(), "dify")
    assert.equal(isLeadHunterSkillEngineEnabled(), false)
  })
})

test("lead hunter engine mode reads skill flag", () => {
  withEnv({ LEAD_HUNTER_ENGINE: "skill" }, () => {
    assert.equal(resolveLeadHunterEngineMode(), "skill")
    assert.equal(isLeadHunterSkillEngineEnabled(), true)
  })
})

test("lead hunter skill search config checks Tavily/Serper keys", () => {
  withEnv({ LEAD_HUNTER_ENGINE: "dify", TAVILY_API_KEY: undefined, SERPER_API_KEY: undefined }, () => {
    assert.equal(hasLeadHunterSkillSearchConfig(), false)
    assert.equal(isLeadHunterSkillRuntimeAvailable(), false)
  })

  withEnv({ LEAD_HUNTER_ENGINE: "dify", TAVILY_API_KEY: "abc", SERPER_API_KEY: undefined }, () => {
    assert.equal(hasLeadHunterSkillSearchConfig(), true)
    assert.equal(isLeadHunterSkillRuntimeAvailable(), true)
  })

  withEnv({ LEAD_HUNTER_ENGINE: "dify", TAVILY_API_KEY: undefined, SERPER_API_KEY: "xyz" }, () => {
    assert.equal(hasLeadHunterSkillSearchConfig(), true)
    assert.equal(isLeadHunterSkillRuntimeAvailable(), true)
  })
})

