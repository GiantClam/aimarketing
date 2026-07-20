import assert from "node:assert/strict"
import test from "node:test"

import { getR2Client, getR2PublicBase, getR2PublicUrl, isR2Available } from "@/lib/r2"

const envKeys = [
  "R2_ENDPOINT",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_ACCESS_KEY",
  "R2_SECRET_ACCESS_KEY",
  "R2_SECRET_KEY",
  "R2_BUCKET_NAME",
  "R2_BUCKET",
  "R2_PUBLIC_BASE",
  "R2_PUBLIC_URL",
] as const

async function withR2Env(values: Record<string, string>, callback: () => void | Promise<void>) {
  const previous = new Map(envKeys.map((key) => [key, process.env[key]]))

  try {
    for (const key of envKeys) delete process.env[key]
    Object.assign(process.env, values)
    await callback()
  } finally {
    for (const key of envKeys) {
      const value = previous.get(key)
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test("R2 configuration strips shell-style quotes before building the endpoint", async () => {
  await withR2Env(
    {
      R2_ACCOUNT_ID: '"9630806d5a588fc350ee64c395005cfa"',
      R2_ACCESS_KEY: '"access-key"',
      R2_SECRET_KEY: '"secret-key"',
      R2_BUCKET: '"saleagent"',
      R2_PUBLIC_BASE: '"https://s.aimarketingsite.com/"',
    },
    () => {
      assert.equal(getR2PublicBase(), "https://s.aimarketingsite.com")
      assert.equal(getR2PublicUrl("platform-artifacts/1/test.pptx"), "https://s.aimarketingsite.com/platform-artifacts/1/test.pptx")
      assert.ok(getR2Client())
      assert.equal(isR2Available(), true)
    },
  )
})

test("R2 configuration strips quotes embedded in an explicit endpoint", async () => {
  await withR2Env(
    {
      R2_ENDPOINT: 'https://"9630806d5a588fc350ee64c395005cfa".r2.cloudflarestorage.com',
      R2_ACCESS_KEY_ID: "access-key",
      R2_SECRET_ACCESS_KEY: "secret-key",
      R2_BUCKET_NAME: "saleagent",
      R2_PUBLIC_BASE: "https://s.aimarketingsite.com",
    },
    () => {
      assert.ok(getR2Client())
      assert.equal(isR2Available(), true)
    },
  )
})
