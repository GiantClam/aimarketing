import assert from "node:assert/strict"
import test from "node:test"

import { fetchVideoAgentUpstream, getVideoAgentErrorMessage } from "./upstream"

test("video agent upstream retries transient fetch failures and then succeeds", async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = (async () => {
    attempts += 1
    if (attempts < 3) {
      const error = new Error("fetch failed")
      ;(error as Error & { cause?: { code: string } }).cause = { code: "UND_ERR_SOCKET" }
      throw error
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch

  try {
    const response = await fetchVideoAgentUpstream(
      "https://video-agent.example/jobs",
      {
        method: "GET",
      },
      {
        label: "video_agent.test",
        timeoutMs: 5_000,
        attempts: 3,
      },
    )

    assert.equal(attempts, 3)
    assert.equal(response.status, 200)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("video agent upstream retries retryable statuses and returns later success", async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = (async () => {
    attempts += 1
    if (attempts === 1) {
      return new Response(JSON.stringify({ error: "busy" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    })
  }) as typeof fetch

  try {
    const response = await fetchVideoAgentUpstream(
      "https://video-agent.example/workflow/run-clips",
      {
        method: "POST",
        body: JSON.stringify({ foo: "bar" }),
      },
      {
        label: "video_agent.test_status",
        timeoutMs: 5_000,
        attempts: 2,
      },
    )

    assert.equal(attempts, 2)
    assert.equal(response.status, 200)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("video agent upstream surfaces timeout as abort error after retries exhaust", async () => {
  const originalFetch = globalThis.fetch
  let attempts = 0

  globalThis.fetch = ((_: RequestInfo | URL, init?: RequestInit) => {
    attempts += 1
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener(
        "abort",
        () => reject(new Error("fetch failed", { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } })),
        { once: true },
      )
    })
  }) as typeof fetch

  try {
    await assert.rejects(
      () =>
        fetchVideoAgentUpstream(
          "https://video-agent.example/chat",
          {
            method: "POST",
            body: JSON.stringify({ foo: "bar" }),
          },
          {
            label: "video_agent.test_timeout",
            timeoutMs: 10,
            attempts: 2,
          },
        ),
      /video_agent\.test_timeout_timeout|fetch failed/,
    )
    assert.equal(attempts, 2)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("video agent error message prefers upstream payload error", () => {
  assert.equal(getVideoAgentErrorMessage({ error: "上游失败" }, "fallback"), "上游失败")
  assert.equal(getVideoAgentErrorMessage(null, "fallback"), "fallback")
})
