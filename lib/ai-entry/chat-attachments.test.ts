import assert from "node:assert/strict"
import test from "node:test"

import { normalizeAttachmentList, normalizeMessages } from "./chat-attachments"

test("normalizes and caps incoming text attachments", () => {
  const longText = "x".repeat(80_005)
  const attachments = normalizeAttachmentList([
    {
      name: "brief.docx",
      mediaType: "TEXT/PLAIN",
      text: longText,
      size: 123,
    },
  ])

  assert.equal(attachments.length, 1)
  assert.equal(attachments[0].name, "brief.docx")
  assert.equal(attachments[0].mediaType, "text/plain")
  assert.equal(attachments[0].text.length, 80_000)
})

test("appends text attachment context to the latest user message", () => {
  const attachments = normalizeAttachmentList([
    {
      name: "brief.pdf",
      mediaType: "text/plain",
      text: "Attachment facts",
      size: 123,
    },
  ])
  const messages = normalizeMessages(
    [
      { role: "user", content: "Previous" },
      { role: "assistant", content: "Okay" },
      { role: "user", content: "Use the attachment" },
    ],
    attachments,
  )

  assert.equal(messages.length, 3)
  const latest = messages[2]
  assert.equal(latest.role, "user")
  assert.ok(Array.isArray(latest.content))
  const parts = latest.content as Array<{ type: string; text?: string }>
  assert.equal(parts[0].text, "Use the attachment")
  assert.match(parts[1].text || "", /brief\.pdf/)
  assert.match(parts[1].text || "", /Attachment facts/)
})

test("keeps image attachment parts intact", () => {
  const attachments = normalizeAttachmentList([
    {
      name: "reference.png",
      mediaType: "image/png",
      dataUrl: "data:image/png;base64,abc123",
      size: 123,
    },
  ])
  const messages = normalizeMessages([{ role: "user", content: "Look" }], attachments)
  const latest = messages[0]

  assert.ok(Array.isArray(latest.content))
  const parts = latest.content as Array<{ type: string; image?: string; mediaType?: string }>
  assert.equal(parts[1].type, "image")
  assert.equal(parts[1].image, "abc123")
  assert.equal(parts[1].mediaType, "image/png")
})

