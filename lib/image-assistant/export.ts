import type { ImageAssistantLayer } from "@/lib/image-assistant/types"

function createCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas")
  canvas.width = width
  canvas.height = height
  return canvas
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = "anonymous"
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("image_load_failed"))
    img.src = url
  })
}

function applyOpacity(ctx: CanvasRenderingContext2D, opacity: number | undefined) {
  ctx.globalAlpha = typeof opacity === "number" ? Math.max(0, Math.min(opacity, 1)) : 1
}

function drawShape(ctx: CanvasRenderingContext2D, layer: ImageAssistantLayer) {
  const transform = layer.transform
  const style = layer.style || {}
  const shapeType = layer.content?.shapeType || "rect"
  const x = transform.x
  const y = transform.y
  const width = transform.width
  const height = transform.height

  ctx.save()
  applyOpacity(ctx, style.opacity)
  ctx.translate(x, y)
  ctx.rotate(((transform.rotation || 0) * Math.PI) / 180)

  if (shapeType === "circle") {
    ctx.beginPath()
    ctx.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
    if (style.fill) {
      ctx.fillStyle = style.fill
      ctx.fill()
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = style.strokeWidth || 2
      ctx.stroke()
    }
  } else if (shapeType === "line" || shapeType === "arrow") {
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.strokeStyle = style.stroke || style.fill || "#0f172a"
    ctx.lineWidth = style.strokeWidth || Math.max(2, Math.min(height, 8))
    ctx.stroke()

    if (shapeType === "arrow") {
      const arrowSize = 16
      ctx.beginPath()
      ctx.moveTo(width, height / 2)
      ctx.lineTo(width - arrowSize, height / 2 - arrowSize / 2)
      ctx.lineTo(width - arrowSize, height / 2 + arrowSize / 2)
      ctx.closePath()
      ctx.fillStyle = style.stroke || style.fill || "#0f172a"
      ctx.fill()
    }
  } else {
    const radius = style.borderRadius || 0
    ctx.beginPath()
    if (radius > 0) {
      ctx.roundRect(0, 0, width, height, radius)
    } else {
      ctx.rect(0, 0, width, height)
    }
    if (style.fill) {
      ctx.fillStyle = style.fill
      ctx.fill()
    }
    if (style.stroke) {
      ctx.strokeStyle = style.stroke
      ctx.lineWidth = style.strokeWidth || 2
      ctx.stroke()
    }
  }

  ctx.restore()
}

function drawText(ctx: CanvasRenderingContext2D, layer: ImageAssistantLayer) {
  const transform = layer.transform
  const style = layer.style || {}
  const text = layer.content?.text || "文本"

  ctx.save()
  applyOpacity(ctx, style.opacity)
  ctx.translate(transform.x, transform.y)
  ctx.rotate(((transform.rotation || 0) * Math.PI) / 180)
  const fontSize = style.fontSize || 42
  const fontWeight = style.fontWeight || 700
  const fontFamily = style.fontFamily || "Arial"
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`
  ctx.fillStyle = style.color || style.fill || "#0f172a"
  ctx.textBaseline = "top"

  const lineHeight = Math.round(fontSize * 1.25)
  const lines = text.split(/\r?\n/)
  lines.forEach((line, index) => {
    ctx.fillText(line, 0, index * lineHeight)
  })
  ctx.restore()
}

export async function renderImageAssistantLayersToCanvas(params: {
  width: number
  height: number
  layers: ImageAssistantLayer[]
}) {
  const canvas = createCanvas(params.width, params.height)
  const ctx = canvas.getContext("2d")
  if (!ctx) {
    throw new Error("canvas_context_missing")
  }

  const sortedLayers = [...params.layers].filter((layer) => layer.visible).sort((a, b) => a.z_index - b.z_index)

  for (const layer of sortedLayers) {
    if (layer.layer_type === "background" || layer.layer_type === "image") {
      if (!layer.asset_url) continue
      const img = await loadImage(layer.asset_url)
      ctx.save()
      applyOpacity(ctx, layer.style?.opacity)
      ctx.translate(layer.transform.x, layer.transform.y)
      ctx.rotate((((layer.transform.rotation || 0) * Math.PI) / 180))
      ctx.drawImage(img, 0, 0, layer.transform.width, layer.transform.height)
      ctx.restore()
      continue
    }

    if (layer.layer_type === "shape") {
      drawShape(ctx, layer)
      continue
    }

    if (layer.layer_type === "text") {
      drawText(ctx, layer)
    }
  }

  return canvas
}

export async function exportImageAssistantDataUrl(params: {
  width: number
  height: number
  layers: ImageAssistantLayer[]
  format: "png" | "jpg" | "webp"
}) {
  const canvas = await renderImageAssistantLayersToCanvas(params)
  if (params.format === "jpg") {
    return canvas.toDataURL("image/jpeg", 0.92)
  }
  if (params.format === "webp") {
    return canvas.toDataURL("image/webp", 0.92)
  }
  return canvas.toDataURL("image/png")
}
