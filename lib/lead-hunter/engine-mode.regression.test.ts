import assert from "node:assert/strict"
import test from "node:test"

import {
  hasLeadHunterSkillSearchConfig,
  isLeadHunterSkillRuntimeAvailable,
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

test("lead hunter skill runtime availability is not controlled by env switch", () => {
  withEnv({ LEAD_HUNTER_SKILL_FORCE_DISABLE: "1" }, () => {
    assert.equal(isLeadHunterSkillRuntimeAvailable(), true)
  })
})

test("lead hunter skill search config checks Tavily/Serper keys", () => {
  withEnv({ TAVILY_API_KEY: undefined, SERPER_API_KEY: undefined }, () => {
    assert.equal(hasLeadHunterSkillSearchConfig(), false)
    assert.equal(isLeadHunterSkillRuntimeAvailable(), true)
  })

  withEnv({ TAVILY_API_KEY: "abc", SERPER_API_KEY: undefined }, () => {
    assert.equal(hasLeadHunterSkillSearchConfig(), true)
    assert.equal(isLeadHunterSkillRuntimeAvailable(), true)
  })

  withEnv({ TAVILY_API_KEY: undefined, SERPER_API_KEY: "xyz" }, () => {
    assert.equal(hasLeadHunterSkillSearchConfig(), true)
    assert.equal(isLeadHunterSkillRuntimeAvailable(), true)
  })
})

