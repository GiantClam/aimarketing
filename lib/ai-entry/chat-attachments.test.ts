import assert from "node:assert/strict"
import test from "node:test"

import {
  extractEmbeddedAttachmentSummaries,
  extractUserIntentFromMessageContent,
  normalizeMessageTextContent,
  normalizeAttachmentList,
  normalizeMessages,
} from "./chat-attachments"

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

test("extracts embedded uploaded file blocks for display", () => {
  const parsed = extractEmbeddedAttachmentSummaries(
    [
      "请基于附件生成 PPT",
      "",
      "[Uploaded file: 屿算智能_ppt信息提取.md / text/markdown]",
      "# 文档标题",
      "很长的附件正文",
    ].join("\n"),
  )

  assert.equal(parsed.content, "请基于附件生成 PPT")
  assert.deepEqual(parsed.attachments, [
    {
      name: "屿算智能_ppt信息提取.md",
      mediaType: "text/markdown",
    },
  ])
})

test("extracts multiple embedded uploaded file blocks for display", () => {
  const parsed = extractEmbeddedAttachmentSummaries(
    [
      "先看两个附件",
      "",
      "[Uploaded file: brief.md / text/markdown]",
      "附件一内容",
      "",
      "[Uploaded file: data.csv / text/csv]",
      "a,b,c",
    ].join("\n"),
  )

  assert.equal(parsed.content, "先看两个附件")
  assert.deepEqual(parsed.attachments, [
    {
      name: "brief.md",
      mediaType: "text/markdown",
    },
    {
      name: "data.csv",
      mediaType: "text/csv",
    },
  ])
})

test("normalizes message text content from multipart user messages", () => {
  const normalized = normalizeMessageTextContent([
    { type: "text", text: "请生成 PPT" },
    { type: "text", text: "\n\n[Uploaded file: brief.md / text/markdown]\n附件正文" },
  ])

  assert.equal(
    normalized,
    "请生成 PPT \n\n[Uploaded file: brief.md / text/markdown]\n附件正文",
  )
})

test("extracts user intent from multipart message content without attachment blocks", () => {
  const normalized = extractUserIntentFromMessageContent([
    { type: "text", text: "写一份介绍预算智能公司和业务的 ppt" },
    {
      type: "text",
      text: "\n\n[Uploaded file: 屿算智能_ppt信息提取.md / text/markdown]\n资源现状\n行业研究报告\n更多附件正文",
    },
  ])

  assert.equal(normalized, "写一份介绍预算智能公司和业务的 ppt")
})
