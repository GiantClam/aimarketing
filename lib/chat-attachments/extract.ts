import { inflateRawSync, inflateSync } from "node:zlib"

import {
  CHAT_ATTACHMENT_MAX_TEXT_CHARS,
  ChatAttachmentError,
  type ExtractChatAttachmentInput,
  type ExtractedChatAttachmentText,
} from "./types"
import { normalizeFileName, validateChatAttachmentFile } from "./validation"

type ZipEntry = {
  fileName: string
  compressionMethod: number
  compressedSize: number
  uncompressedSize: number
  localHeaderOffset: number
}

const TEXT_DECODER = new TextDecoder("utf-8", { fatal: false })

function normalizeExtractedText(text: string) {
  return text
    .split(String.fromCharCode(0))
    .join("")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
}

function capText(text: string, maxTextChars: number) {
  if (text.length <= maxTextChars) {
    return { text, truncated: false }
  }
  return { text: text.slice(0, maxTextChars).trimEnd(), truncated: true }
}

function readZipEntries(buffer: Buffer) {
  const eocdSignature = 0x06054b50
  let eocdOffset = -1
  for (let offset = buffer.length - 22; offset >= 0; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocdOffset = offset
      break
    }
  }
  if (eocdOffset < 0) {
    throw new ChatAttachmentError("docx_parse_failed", "DOCX zip directory not found")
  }

  const totalEntries = buffer.readUInt16LE(eocdOffset + 10)
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16)
  const entries: ZipEntry[] = []
  let offset = centralDirectoryOffset

  for (let index = 0; index < totalEntries; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw new ChatAttachmentError("docx_parse_failed", "DOCX central directory is invalid")
    }

    const compressionMethod = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const uncompressedSize = buffer.readUInt32LE(offset + 24)
    const fileNameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localHeaderOffset = buffer.readUInt32LE(offset + 42)
    const fileName = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8")

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    })

    offset += 46 + fileNameLength + extraLength + commentLength
  }

  return entries
}

function readZipEntry(buffer: Buffer, entry: ZipEntry) {
  const offset = entry.localHeaderOffset
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new ChatAttachmentError("docx_parse_failed", "DOCX local header is invalid")
  }

  const fileNameLength = buffer.readUInt16LE(offset + 26)
  const extraLength = buffer.readUInt16LE(offset + 28)
  const dataOffset = offset + 30 + fileNameLength + extraLength
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize)

  if (entry.compressionMethod === 0) return compressed
  if (entry.compressionMethod === 8) {
    const inflated = inflateRawSync(compressed)
    if (entry.uncompressedSize > 0 && inflated.length !== entry.uncompressedSize) {
      return inflated
    }
    return inflated
  }

  throw new ChatAttachmentError("docx_parse_failed", "DOCX compression method is not supported")
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
}

function extractDocxDocumentXmlText(xml: string) {
  const parts: string[] = []
  const tokenPattern = /<(\/?w:p\b[^>]*)>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<w:cr\b[^>]*\/>|<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g
  let match: RegExpExecArray | null

  while ((match = tokenPattern.exec(xml))) {
    const token = match[0]
    if (token.startsWith("</w:p")) {
      parts.push("\n")
      continue
    }
    if (token.startsWith("<w:tab")) {
      parts.push("\t")
      continue
    }
    if (token.startsWith("<w:br") || token.startsWith("<w:cr")) {
      parts.push("\n")
      continue
    }
    if (typeof match[2] === "string") {
      parts.push(decodeXmlEntities(match[2]))
    }
  }

  return parts.join("")
}

export function extractDocxText(bytes: Buffer) {
  try {
    const entries = readZipEntries(bytes)
    const documentEntry = entries.find((entry) => entry.fileName === "word/document.xml")
    if (!documentEntry) {
      throw new ChatAttachmentError("docx_parse_failed", "DOCX document body not found")
    }

    const xml = readZipEntry(bytes, documentEntry).toString("utf8")
    return normalizeExtractedText(extractDocxDocumentXmlText(xml))
  } catch (error) {
    if (error instanceof ChatAttachmentError) throw error
    throw new ChatAttachmentError("docx_parse_failed", error instanceof Error ? error.message : "DOCX parse failed")
  }
}

function decodePdfLiteralString(source: string, start: number) {
  let depth = 1
  let output = ""
  let index = start + 1

  while (index < source.length && depth > 0) {
    const char = source[index]
    if (char === "\\") {
      const next = source[index + 1]
      if (!next) break
      if (next === "n") output += "\n"
      else if (next === "r") output += "\r"
      else if (next === "t") output += "\t"
      else if (next === "b") output += "\b"
      else if (next === "f") output += "\f"
      else if (next === "\n" || next === "\r") {
        if (next === "\r" && source[index + 2] === "\n") index += 1
      } else if (/[0-7]/.test(next)) {
        const octal = source.slice(index + 1, index + 4).match(/^[0-7]{1,3}/)?.[0] || next
        output += String.fromCharCode(Number.parseInt(octal, 8))
        index += octal.length - 1
      } else {
        output += next
      }
      index += 2
      continue
    }
    if (char === "(") {
      depth += 1
      output += char
      index += 1
      continue
    }
    if (char === ")") {
      depth -= 1
      if (depth > 0) output += char
      index += 1
      continue
    }
    output += char
    index += 1
  }

  return { value: output, end: index }
}

function decodePdfHexString(hex: string) {
  const normalized = hex.replace(/\s+/g, "")
  const bytes: number[] = []
  for (let index = 0; index < normalized.length; index += 2) {
    const pair = normalized.slice(index, index + 2).padEnd(2, "0")
    const value = Number.parseInt(pair, 16)
    if (Number.isFinite(value)) bytes.push(value)
  }
  return Buffer.from(bytes).toString("utf8").split(String.fromCharCode(0)).join("")
}

function extractPdfStringsFromContent(source: string) {
  const pieces: string[] = []
  let index = 0

  while (index < source.length) {
    const char = source[index]
    if (char === "(") {
      const literal = decodePdfLiteralString(source, index)
      const tail = source.slice(literal.end, literal.end + 80)
      if (/^\s*(?:Tj|'|"|[\]\d.\-\s]*TJ)/.test(tail)) {
        pieces.push(literal.value)
      }
      index = literal.end
      continue
    }
    if (char === "<" && source[index + 1] !== "<") {
      const end = source.indexOf(">", index + 1)
      if (end > index) {
        const tail = source.slice(end + 1, end + 81)
        if (/^\s*(?:Tj|'|"|[\]\d.\-\s]*TJ)/.test(tail)) {
          pieces.push(decodePdfHexString(source.slice(index + 1, end)))
        }
        index = end + 1
        continue
      }
    }
    if (source.startsWith("Td", index) || source.startsWith("TD", index) || source.startsWith("T*", index)) {
      pieces.push("\n")
      index += 2
      continue
    }
    index += 1
  }

  return pieces.join(" ")
}

function maybeInflatePdfStream(raw: Buffer, dictionary: string) {
  if (!/\/Filter\s*(?:\/FlateDecode|\[\s*\/FlateDecode)/.test(dictionary)) {
    return raw
  }
  try {
    return inflateSync(raw)
  } catch {
    return inflateRawSync(raw)
  }
}

export function extractPdfText(bytes: Buffer) {
  const latin1 = bytes.toString("latin1")
  if (/\/Encrypt\b/.test(latin1)) {
    throw new ChatAttachmentError("pdf_encrypted", "PDF is encrypted")
  }

  const parts: string[] = []
  const streamPattern = /<<(.*?)>>\s*stream\r?\n([\s\S]*?)\r?\nendstream/g
  let match: RegExpExecArray | null

  while ((match = streamPattern.exec(latin1))) {
    const dictionary = match[1]
    const streamStart = match.index + match[0].indexOf(match[2])
    const streamEnd = streamStart + match[2].length
    const raw = bytes.subarray(streamStart, streamEnd)
    try {
      const decoded = maybeInflatePdfStream(raw, dictionary).toString("latin1")
      const text = extractPdfStringsFromContent(decoded)
      if (text.trim()) parts.push(text)
    } catch {
      // Ignore binary or unsupported streams; copyable text PDFs usually have at least one readable content stream.
    }
  }

  if (parts.length === 0) {
    const fallback = extractPdfStringsFromContent(latin1)
    if (fallback.trim()) parts.push(fallback)
  }

  const text = normalizeExtractedText(parts.join("\n"))
  if (!text) {
    throw new ChatAttachmentError("pdf_no_extractable_text", "PDF has no extractable text")
  }

  return text
}

export function extractPlainText(bytes: Buffer) {
  return normalizeExtractedText(TEXT_DECODER.decode(bytes))
}

export function extractChatAttachmentText(input: ExtractChatAttachmentInput): ExtractedChatAttachmentText {
  const fileName = normalizeFileName(input.fileName)
  const originalMediaType = (input.mediaType || "").trim().toLowerCase()
  const extension = validateChatAttachmentFile({
    fileName,
    mediaType: originalMediaType,
    size: input.bytes.length,
  })

  let rawText = ""
  if (extension === "txt" || extension === "md") {
    rawText = extractPlainText(input.bytes)
  } else if (extension === "docx") {
    rawText = extractDocxText(input.bytes)
  } else if (extension === "pdf") {
    rawText = extractPdfText(input.bytes)
  }

  if (!rawText) {
    throw new ChatAttachmentError("extracted_text_empty", "Attachment has no readable text")
  }

  const capped = capText(rawText, input.maxTextChars ?? CHAT_ATTACHMENT_MAX_TEXT_CHARS)
  return {
    fileName,
    extension,
    mediaType: "text/plain",
    originalMediaType,
    size: input.bytes.length,
    text: capped.text,
    textCharCount: rawText.length,
    truncated: capped.truncated,
  }
}
