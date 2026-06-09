import assert from "node:assert/strict"
import test from "node:test"
import { deflateRawSync, deflateSync } from "node:zlib"

import { ChatAttachmentError } from "./types"
import { extractChatAttachmentText } from "./extract"

function crc32(buffer: Buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

function createZip(entries: Array<{ name: string; content: string | Buffer }>) {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0

  for (const entry of entries) {
    const name = Buffer.from(entry.name)
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content)
    const compressed = deflateRawSync(content)
    const crc = crc32(content)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(content.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)

    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(content.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)

    offset += local.length + name.length + compressed.length
  }

  const centralDirectory = Buffer.concat(centralParts)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralDirectory.length, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...localParts, centralDirectory, end])
}

function createDocx(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  return createZip([
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types" />`,
    },
    {
      name: "word/document.xml",
      content: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${escaped}</w:t></w:r></w:p></w:body></w:document>`,
    },
  ])
}

function createPdf(text: string) {
  const content = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, "\\$&")}) Tj ET`
  const compressed = deflateSync(Buffer.from(content, "latin1"))
  const objects: string[] = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n",
    "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    `5 0 obj << /Length ${compressed.length} /Filter /FlateDecode >> stream\n${compressed.toString("latin1")}\nendstream endobj\n`,
  ]
  let body = "%PDF-1.4\n"
  const offsets = [0]
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body, "latin1"))
    body += object
  }
  const xrefOffset = Buffer.byteLength(body, "latin1")
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets.slice(1)) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  return Buffer.from(body, "latin1")
}

test("extracts plain text attachments", () => {
  const result = extractChatAttachmentText({
    fileName: "notes.txt",
    mediaType: "text/plain",
    bytes: Buffer.from("Line one\r\nLine two\0"),
  })

  assert.equal(result.extension, "txt")
  assert.equal(result.text, "Line one\nLine two")
  assert.equal(result.mediaType, "text/plain")
})

test("extracts markdown attachments", () => {
  const result = extractChatAttachmentText({
    fileName: "brief.md",
    mediaType: "text/markdown",
    bytes: Buffer.from("# Brief\n\nUse this tone."),
  })

  assert.equal(result.extension, "md")
  assert.match(result.text, /Use this tone/)
})

test("extracts docx document body text", () => {
  const result = extractChatAttachmentText({
    fileName: "brand.docx",
    mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: createDocx("Brand voice: direct and precise."),
  })

  assert.equal(result.extension, "docx")
  assert.equal(result.text, "Brand voice: direct and precise.")
})

test("extracts copyable pdf text from flate streams", () => {
  const result = extractChatAttachmentText({
    fileName: "brief.pdf",
    mediaType: "application/pdf",
    bytes: createPdf("PDF attachment text"),
  })

  assert.equal(result.extension, "pdf")
  assert.match(result.text, /PDF attachment text/)
})

test("rejects unsupported legacy doc files", () => {
  assert.throws(
    () =>
      extractChatAttachmentText({
        fileName: "legacy.doc",
        mediaType: "application/msword",
        bytes: Buffer.from("not supported"),
      }),
    (error) => error instanceof ChatAttachmentError && error.code === "unsupported_file_type",
  )
})

test("caps extracted text", () => {
  const result = extractChatAttachmentText({
    fileName: "long.txt",
    mediaType: "text/plain",
    bytes: Buffer.from("abcdef"),
    maxTextChars: 3,
  })

  assert.equal(result.text, "abc")
  assert.equal(result.textCharCount, 6)
  assert.equal(result.truncated, true)
})

