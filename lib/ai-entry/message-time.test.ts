import assert from "node:assert/strict"
import test from "node:test"

import { formatMessageTime, normalizeTimestampMs } from "@/lib/ai-entry/message-time"

test("normalizeTimestampMs preserves milliseconds and expands seconds", () => {
  assert.equal(normalizeTimestampMs(1_720_000_000), 1_720_000_000_000)
  assert.equal(normalizeTimestampMs(1_720_000_000_123), 1_720_000_000_123)
})

test("formatMessageTime uses the provided timezone instead of server local time", () => {
  const timestampMs = Date.UTC(2026, 6, 6, 12, 0, 0)

  const shanghai = formatMessageTime(timestampMs, "en", "Asia/Shanghai")
  const losAngeles = formatMessageTime(timestampMs, "en", "America/Los_Angeles")

  assert.equal(shanghai, "08:00 PM")
  assert.equal(losAngeles, "05:00 AM")
})

test("formatMessageTime falls back to browser local time when timezone is unavailable", () => {
  const timestampMs = Date.UTC(2026, 6, 6, 12, 0, 0)
  const expected = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestampMs))

  assert.equal(formatMessageTime(timestampMs, "en", null), expected)
})

test("formatMessageTime does not force UTC when timezone is unavailable", () => {
  const timestampMs = Date.UTC(2026, 6, 6, 12, 0, 0)
  const OriginalDateTimeFormat = Intl.DateTimeFormat
  const calls: Intl.DateTimeFormatOptions[] = []

  Object.defineProperty(Intl, "DateTimeFormat", {
    configurable: true,
    value: function MockDateTimeFormat(
      locale?: string | string[],
      options?: Intl.DateTimeFormatOptions,
    ) {
      calls.push(options ?? {})
      return new OriginalDateTimeFormat(locale, options)
    },
  })

  try {
    formatMessageTime(timestampMs, "en", null)
  } finally {
    Object.defineProperty(Intl, "DateTimeFormat", {
      configurable: true,
      value: OriginalDateTimeFormat,
    })
  }

  assert.equal(calls.length > 0, true)
  assert.equal("timeZone" in calls[0], false)
})

test("formatMessageTime falls back to browser local time when timezone is invalid", () => {
  const timestampMs = Date.UTC(2026, 6, 6, 12, 0, 0)
  const expected = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestampMs))

  assert.equal(formatMessageTime(timestampMs, "en", "Invalid/Timezone"), expected)
})
