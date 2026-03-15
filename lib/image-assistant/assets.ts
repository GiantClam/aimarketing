import { createHash } from "crypto"

export async function fileToBuffer(file: File) {
  const arrayBuffer = await file.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export function sha256Buffer(buffer: Buffer) {
  return createHash("sha256").update(new Uint8Array(buffer)).digest("hex")
}

export async function urlToInlineImage(url: string) {
  if (url.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/i.exec(url)
    if (!match) {
      throw new Error("image_asset_data_url_invalid")
    }

    return {
      mimeType: match[1],
      base64Data: match[2],
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
