import assert from "node:assert/strict"
import test from "node:test"

import { isDemoSessionDbHydrationEnabled } from "@/lib/auth/session"

const mutableEnv = process.env as Record<string, string | undefined>

test("demo session db hydration defaults to enabled in development", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousHydration = process.env.DEMO_SESSION_DB_HYDRATE

  mutableEnv.NODE_ENV = "development"
  delete mutableEnv.DEMO_SESSION_DB_HYDRATE

  try {
    assert.equal(isDemoSessionDbHydrationEnabled(), true)
  } finally {
    if (previousNodeEnv == null) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = previousNodeEnv
    }

    if (previousHydration == null) {
      delete mutableEnv.DEMO_SESSION_DB_HYDRATE
    } else {
      mutableEnv.DEMO_SESSION_DB_HYDRATE = previousHydration
    }
  }
})

test("demo session db hydration still respects explicit disable", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousHydration = process.env.DEMO_SESSION_DB_HYDRATE

  mutableEnv.NODE_ENV = "development"
  mutableEnv.DEMO_SESSION_DB_HYDRATE = "false"

  try {
    assert.equal(isDemoSessionDbHydrationEnabled(), false)
  } finally {
    if (previousNodeEnv == null) {
      delete mutableEnv.NODE_ENV
    } else {
      mutableEnv.NODE_ENV = previousNodeEnv
    }

    if (previousHydration == null) {
      delete mutableEnv.DEMO_SESSION_DB_HYDRATE
    } else {
      mutableEnv.DEMO_SESSION_DB_HYDRATE = previousHydration
    }
  }
})
