import { createHash } from "crypto"

function parseDataUrl(dataUrl: string) {
  const match = /^data:([^;,]+)(?:;[^,]*)?;base64,([\s\S]+)$/i.exec(dataUrl.trim())
  if (!match) {
    throw new Error("image_asset_data_url_invalid")
  }

  return {
    mimeType: match[1].toLowerCase(),
    buffer: Buffer.from(match[2], "base64"),
  }
}

function parseSvgLength(value: string | null | undefined) {
  if (!value) return null
  const normalized = value.trim()
  const match = /^([0-9]+(?:\.[0-9]+)?)(px)?$/i.exec(normalized)
  if (!match) return null
  const parsed = Number.parseFloat(match[1])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function getPngDimensions(buffer: Buffer) {
  if (buffer.length < 24 || buffer.toString("ascii", 1, 4) !== "PNG") return null
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

function getJpegDimensions(buffer: Buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null

  let offset = 2
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }

    const marker = buffer[offset + 1]
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2
      continue
    }

    const segmentLength = buffer.readUInt16BE(offset + 2)
    if (segmentLength < 2 || offset + 2 + segmentLength > buffer.length) {
      break
    }

    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      return {
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7),
      }
    }

    offset += 2 + segmentLength
  }

  return null
}

function getWebpDimensions(buffer: Buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null
  }

  const chunkType = buffer.toString("ascii", 12, 16)
  if (chunkType === "VP8X" && buffer.length >= 30) {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
    }
  }

  if (chunkType === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff,
    }
  }

  if (chunkType === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21)
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    }
  }

  return null
}

function getSvgDimensions(buffer: Buffer) {
  const source = buffer.toString("utf8")
  const svgTag = /<svg\b[^>]*>/i.exec(source)?.[0]
  if (!svgTag) return null

  const width = parseSvgLength(/\bwidth=["']([^"']+)["']/i.exec(svgTag)?.[1])
  const height = parseSvgLength(/\bheight=["']([^"']+)["']/i.exec(svgTag)?.[1])
  if (width && height) {
    return { width: Math.round(width), height: Math.round(height) }
  }

  const viewBox = /\bviewBox=["'][^"']*?([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)["']/i.exec(svgTag)
  if (!viewBox) return null

  const viewBoxWidth = Number.parseFloat(viewBox[3])
  const viewBoxHeight = Number.parseFloat(viewBox[4])
  if (!Number.isFinite(viewBoxWidth) || !Number.isFinite(viewBoxHeight) || viewBoxWidth <= 0 || viewBoxHeight <= 0) {
    return null
  }

  return {
    width: Math.round(viewBoxWidth),
    height: Math.round(viewBoxHeight),
  }
}

function getImageDimensions(buffer: Buffer, mimeType: string) {
  const normalizedMimeType = mimeType.toLowerCase()
  const parsed =
    (normalizedMimeType === "image/png" ? getPngDimensions(buffer) : null) ||
    (normalizedMimeType === "image/jpeg" ? getJpegDimensions(buffer) : null) ||
    (normalizedMimeType === "image/webp" ? getWebpDimensions(buffer) : null) ||
    (normalizedMimeType === "image/svg+xml" ? getSvgDimensions(buffer) : null)

  return {
    width: parsed?.width ?? null,
    height: parsed?.height ?? null,
  }
}

export async function fileToBuffer(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(new Uint8Array(buffer)).digest("hex")
}

export function getInlineImageMetadata(dataUrl: string) {
  const parsed = parseDataUrl(dataUrl)
  return {
    mimeType: parsed.mimeType,
    buffer: parsed.buffer,
    ...getImageDimensions(parsed.buffer, parsed.mimeType),
  }
}

export async function urlToInlineImage(url: string) {
  if (url.startsWith("data:")) {
    const match = parseDataUrl(url)
    return {
      mimeType: match.mimeType,
      base64Data: match.buffer.toString("base64"),
    }
  }

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`image_asset_fetch_failed:${response.status}`)
  }

  const mimeType = response.headers.get("content-type") || "image/png"
  const arrayBuffer = await response.arrayBuffer()
  return {
    mimeType,
    base64Data: Buffer.from(arrayBuffer).toString("base64"),
  }
}
