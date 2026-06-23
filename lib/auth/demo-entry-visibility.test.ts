import assert from "node:assert/strict"
import test from "node:test"

import { shouldShowDemoEntry } from "./demo-entry-visibility"

function setEnv(name: "NODE_ENV" | "VERCEL_ENV", value: string | undefined) {
  Object.defineProperty(process.env, name, {
    configurable: true,
    enumerable: true,
    writable: true,
    value,
  })
}

test("shouldShowDemoEntry returns true in development", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  setEnv("NODE_ENV", "development")
  setEnv("VERCEL_ENV", undefined)

  try {
    assert.equal(shouldShowDemoEntry("www.aimarketingsite.com"), true)
  } finally {
    if (typeof previousNodeEnv === "string") {
      setEnv("NODE_ENV", previousNodeEnv)
    } else {
      setEnv("NODE_ENV", undefined)
    }
    if (typeof previousVercelEnv === "string") {
      setEnv("VERCEL_ENV", previousVercelEnv)
    } else {
      setEnv("VERCEL_ENV", undefined)
    }
  }
})

test("shouldShowDemoEntry returns true on preview and vercel preview hosts", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  setEnv("NODE_ENV", "production")
  setEnv("VERCEL_ENV", "preview")

  try {
    assert.equal(shouldShowDemoEntry("www.aimarketingsite.com"), true)
    assert.equal(shouldShowDemoEntry("aimarketing-git-test.vercel.app"), true)
  } finally {
    if (typeof previousNodeEnv === "string") {
      setEnv("NODE_ENV", previousNodeEnv)
    } else {
      setEnv("NODE_ENV", undefined)
    }
    if (typeof previousVercelEnv === "string") {
      setEnv("VERCEL_ENV", previousVercelEnv)
    } else {
      setEnv("VERCEL_ENV", undefined)
    }
  }
})

test("shouldShowDemoEntry returns true on loopback hosts in production", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  setEnv("NODE_ENV", "production")
  setEnv("VERCEL_ENV", undefined)

  try {
    assert.equal(shouldShowDemoEntry("localhost"), true)
    assert.equal(shouldShowDemoEntry("127.0.0.1"), true)
  } finally {
    if (typeof previousNodeEnv === "string") {
      setEnv("NODE_ENV", previousNodeEnv)
    } else {
      setEnv("NODE_ENV", undefined)
    }
    if (typeof previousVercelEnv === "string") {
      setEnv("VERCEL_ENV", previousVercelEnv)
    } else {
      setEnv("VERCEL_ENV", undefined)
    }
  }
})

test("shouldShowDemoEntry returns false on production custom domains", () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousVercelEnv = process.env.VERCEL_ENV

  setEnv("NODE_ENV", "production")
  setEnv("VERCEL_ENV", undefined)

  try {
    assert.equal(shouldShowDemoEntry("www.aimarketingsite.com"), false)
  } finally {
    if (typeof previousNodeEnv === "string") {
      setEnv("NODE_ENV", previousNodeEnv)
    } else {
      setEnv("NODE_ENV", undefined)
    }
    if (typeof previousVercelEnv === "string") {
      setEnv("VERCEL_ENV", previousVercelEnv)
    } else {
      setEnv("VERCEL_ENV", undefined)
    }
  }
})
