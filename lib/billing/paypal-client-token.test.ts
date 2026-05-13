import assert from "node:assert/strict"
import test from "node:test"

import { createPayPalBrowserSafeClientToken } from "./paypal"

test("paypal browser-safe client token helper requests sdk_init token for app domain", async () => {
  const originalFetch = global.fetch
  const originalEnv = {
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENV: process.env.PAYPAL_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    APP_URL: process.env.APP_URL,
  }

  const calls: Array<{ url: string; init?: RequestInit }> = []
  global.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const href = String(url)
    calls.push({ url: href, init })

    if (calls.length === 1) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "access-token-123" }),
      } as Response
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ client_token: "client-token-456" }),
    } as Response
  }) as typeof global.fetch

  process.env.PAYPAL_CLIENT_ID = "client-id"
  process.env.PAYPAL_CLIENT_SECRET = "client-secret"
  process.env.PAYPAL_ENV = "sandbox"
  process.env.NEXT_PUBLIC_APP_URL = "https://aimarketingsite.com/dashboard/billing"
  process.env.APP_URL = "https://aimarketingsite.com"

  try {
    const token = await createPayPalBrowserSafeClientToken()

    assert.equal(token, "client-token-456")
    assert.equal(calls.length, 2)
    assert.match(calls[0]?.url || "", /api-m\.sandbox\.paypal\.com\/v1\/oauth2\/token$/)
    assert.match(calls[1]?.url || "", /api-m\.sandbox\.paypal\.com\/v1\/oauth2\/token$/)

    const secondBody = String(calls[1]?.init?.body || "")
    assert.match(secondBody, /grant_type=client_credentials/)
    assert.match(secondBody, /response_type=client_token/)
    assert.match(secondBody, /intent=sdk_init/)
    assert.match(secondBody, /domains%5B%5D=aimarketingsite\.com/)
  } finally {
    global.fetch = originalFetch
    process.env.PAYPAL_CLIENT_ID = originalEnv.PAYPAL_CLIENT_ID
    process.env.PAYPAL_CLIENT_SECRET = originalEnv.PAYPAL_CLIENT_SECRET
    process.env.PAYPAL_ENV = originalEnv.PAYPAL_ENV
    process.env.NEXT_PUBLIC_APP_URL = originalEnv.NEXT_PUBLIC_APP_URL
    process.env.APP_URL = originalEnv.APP_URL
  }
})
