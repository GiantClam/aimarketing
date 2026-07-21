import assert from "node:assert/strict"
import test from "node:test"
import { toUint8Array } from "@/lib/utils/binary"

import {
  buildAttachmentContentDisposition,
  buildInlineContentDisposition,
  buildDownloadFileName,
  extractMiniMaxAudioFileFromTar,
  getMiniMaxAudioConfig,
  isMiniMaxAudioConfigured,
  resolveMiniMaxFeatureId,
} from "@/lib/platform/minimax-audio"

function concatBytes(parts: Uint8Array[]) {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0)
  const output = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

function writeBytes(target: Uint8Array, offset: number, source: Uint8Array, maxLength?: number) {
  const chunk = maxLength == null ? source : source.subarray(0, maxLength)
  target.set(chunk, offset)
}

function buildTarArchive(entries: Array<{ name: string; content: Uint8Array }>) {
  const blocks: Uint8Array[] = []

  for (const entry of entries) {
    const header = new Uint8Array(512)
    writeBytes(header, 0, toUint8Array(Buffer.from(entry.name)), 100)
    writeBytes(header, 100, toUint8Array(Buffer.from("0000777\0")))
    writeBytes(header, 108, toUint8Array(Buffer.from("0000000\0")))
    writeBytes(header, 116, toUint8Array(Buffer.from("0000000\0")))
    writeBytes(header, 124, toUint8Array(Buffer.from(entry.content.length.toString(8).padStart(11, "0") + "\0")))
    writeBytes(header, 136, toUint8Array(Buffer.from("00000000000\0")))
    header.fill(0x20, 148, 156)
    header[156] = "0".charCodeAt(0)
    writeBytes(header, 257, toUint8Array(Buffer.from("ustar\0")))
    writeBytes(header, 263, toUint8Array(Buffer.from("00")))

    let checksum = 0
    for (const value of header) checksum += value
    writeBytes(header, 148, toUint8Array(Buffer.from(checksum.toString(8).padStart(6, "0") + "\0 ")))

    blocks.push(header)
    blocks.push(entry.content)

    const remainder = entry.content.length % 512
    if (remainder !== 0) {
      blocks.push(new Uint8Array(512 - remainder))
    }
  }

  blocks.push(new Uint8Array(1024))
  return concatBytes(blocks)
}

test("minimax audio config falls back to the default base url", () => {
  const previousBaseUrl = process.env.LEAD_TOOLS_MINIMAX_BASE_URL
  const previousApiKey = process.env.LEAD_TOOLS_MINIMAX_API_KEY

  delete process.env.LEAD_TOOLS_MINIMAX_BASE_URL
  process.env.LEAD_TOOLS_MINIMAX_API_KEY = "test-key"

  try {
    const config = getMiniMaxAudioConfig()
    assert.equal(config.baseUrl, "https://api.minimaxi.com/v1")
    assert.equal(isMiniMaxAudioConfigured(config), true)
  } finally {
    if (previousBaseUrl == null) {
      delete process.env.LEAD_TOOLS_MINIMAX_BASE_URL
    } else {
      process.env.LEAD_TOOLS_MINIMAX_BASE_URL = previousBaseUrl
    }

    if (previousApiKey == null) {
      delete process.env.LEAD_TOOLS_MINIMAX_API_KEY
    } else {
      process.env.LEAD_TOOLS_MINIMAX_API_KEY = previousApiKey
    }
  }
})

test("minimax audio feature resolver accepts the supported workspace feature ids", () => {
  assert.equal(resolveMiniMaxFeatureId("ai-music"), "ai-music")
  assert.equal(resolveMiniMaxFeatureId("voice-clone"), "voice-clone")
  assert.equal(resolveMiniMaxFeatureId("voice-synthesis"), "voice-synthesis")
  assert.equal(resolveMiniMaxFeatureId("ai-video"), null)
})

test("minimax audio attachment content disposition keeps a UTF-8 filename fallback", () => {
  const header = buildAttachmentContentDisposition("品牌发布曲，暖场版.mp3")
  assert.match(header, /attachment;/)
  assert.match(header, /filename="minimax-audio\.mp3"/)
  assert.match(header, /filename\*=UTF-8''/)
})

test("inline content disposition keeps a UTF-8 filename fallback", () => {
  const header = buildInlineContentDisposition("请生成一份 6 页中文销售提案 PPT.pptx")
  assert.match(header, /inline;/)
  assert.match(header, /filename="[^"]+\.pptx"/)
  assert.match(header, /filename\*=UTF-8''/)
})

test("attachment content disposition infers html extension from content type when title extension is missing", () => {
  const header = buildAttachmentContentDisposition("请生成一份 4 页中文产品方案演示稿", "text/html; charset=utf-8")
  assert.match(header, /attachment;/)
  assert.match(header, /filename="[^"]+\.html"/)
  assert.match(header, /filename\*=UTF-8''/)
})

test("attachment content disposition adds the inferred extension to the UTF-8 filename", () => {
  const header = buildAttachmentContentDisposition("屿算智能公司及产品介绍", "application/vnd.openxmlformats-officedocument.presentationml.presentation")
  assert.match(header, /filename="[^"]+\.pptx"/)
  assert.match(header, /filename\*=UTF-8''[^;]+\.pptx/)
})

test("minimax audio stored download file name keeps the human title", () => {
  assert.equal(buildDownloadFileName("品牌发布曲，暖场版", "mp3"), "品牌发布曲，暖场版.mp3")
})

test("minimax audio tar extraction returns the packaged audio file", () => {
  const archive = buildTarArchive([
    {
      name: "job-1/content.extra",
      content: new Uint8Array(Buffer.from('{"ok":true}', "utf8")),
    },
    {
      name: "job-1/content.mp3",
      content: new Uint8Array([0x49, 0x44, 0x33, 0x04]),
    },
  ])

  const extracted = extractMiniMaxAudioFileFromTar(archive)
  assert.ok(extracted)
  assert.equal(extracted?.fileName, "content.mp3")
  assert.equal(extracted?.contentType, "audio/mpeg")
  assert.deepEqual([...extracted!.bytes], [0x49, 0x44, 0x33, 0x04])
})
