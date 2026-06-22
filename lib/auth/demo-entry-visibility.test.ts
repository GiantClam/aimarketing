import assert from "node:assert/strict"
import test from "node:test"

import { shouldShowDemoEntry } from "./demo-entry-visibility"

test("shouldShowDemoEntry returns true in development", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  process.env.NODE_ENV = "development"
  delete process.env.VERCEL_ENV

  try {
    assert.equal(shouldShowDemoEntry("www.aimarketingsite.com"), true)
  } finally {
    if (typeof previousNodeEnv === "string") {
      process.env.NODE_ENV = previousNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
    if (typeof previousVercelEnv === "string") {
      process.env.VERCEL_ENV = previousVercelEnv
    } else {
      delete process.env.VERCEL_ENV
    }
  }
})

test("shouldShowDemoEntry returns true on preview and vercel preview hosts", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  process.env.NODE_ENV = "production"
  process.env.VERCEL_ENV = "preview"

  try {
    assert.equal(shouldShowDemoEntry("www.aimarketingsite.com"), true)
    assert.equal(shouldShowDemoEntry("aimarketing-git-test.vercel.app"), true)
  } finally {
    if (typeof previousNodeEnv === "string") {
      process.env.NODE_ENV = previousNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
    if (typeof previousVercelEnv === "string") {
      process.env.VERCEL_ENV = previousVercelEnv
    } else {
      delete process.env.VERCEL_ENV
    }
  }
})

test("shouldShowDemoEntry returns true on loopback hosts in production", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  process.env.NODE_ENV = "production"
  delete process.env.VERCEL_ENV

  try {
    assert.equal(shouldShowDemoEntry("localhost"), true)
    assert.equal(shouldShowDemoEntry("127.0.0.1"), true)
  } finally {
    if (typeof previousNodeEnv === "string") {
      process.env.NODE_ENV = previousNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
    if (typeof previousVercelEnv === "string") {
      process.env.VERCEL_ENV = previousVercelEnv
    } else {
      delete process.env.VERCEL_ENV
    }
  }
})

test("shouldShowDemoEntry returns false on production custom domains", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  process.env.NODE_ENV = "production"
  delete process.env.VERCEL_ENV

  try {
    assert.equal(shouldShowDemoEntry("www.aimarketingsite.com"), false)
  } finally {
    if (typeof previousNodeEnv === "string") {
      process.env.NODE_ENV = previousNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
    if (typeof previousVercelEnv === "string") {
      process.env.VERCEL_ENV = previousVercelEnv
    } else {
      delete process.env.VERCEL_ENV
    }
  }
})
