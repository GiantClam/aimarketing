import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"

import type { PptPreviewDeck, PptPreviewVariant } from "@/lib/lead-tools/ppt-preview-data"

const ARTIFACT_NODE_BIN = process.env.CODEX_ARTIFACT_NODE_BIN || path.join(
  process.env.HOME || "",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "node",
  "bin",
  "node",
)

const EXPORT_SCRIPT_PATH = path.join(process.cwd(), "scripts", "export_lead_tool_pptx.mjs")

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

async function runNodeScript(args: string[]) {
  await fs.access(ARTIFACT_NODE_BIN)
  await fs.access(EXPORT_SCRIPT_PATH)

  return await new Promise<void>((resolve, reject) => {
    const child = spawn(ARTIFACT_NODE_BIN, [EXPORT_SCRIPT_PATH, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    })

    let stderr = ""
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk)
    })

    child.on("error", reject)
    child.on("close", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(stderr.trim() || `pptx_export_failed_${code}`))
    })
  })
}

export async function exportPptVariantToPptx(params: {
  deck: PptPreviewDeck
  variant: PptPreviewVariant
}) {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "lead-tool-pptx-"))
  const workspaceDir = path.join(tempRoot, "workspace")
  const payloadPath = path.join(tempRoot, "payload.json")
  const outputPath = path.join(tempRoot, `${slugify(params.deck.title || "deck")}-${params.variant.key}.pptx`)

  try {
    await fs.mkdir(workspaceDir, { recursive: true })
    await fs.writeFile(
      payloadPath,
      JSON.stringify(
        {
          deck: params.deck,
          variant: params.variant,
        },
        null,
        2,
      ),
      "utf8",
    )

    await runNodeScript(["--payload", payloadPath, "--output", outputPath, "--workspace", workspaceDir])
    const buffer = await fs.readFile(outputPath)

    return {
      fileName: `${slugify(params.deck.title || "deck")}-${params.variant.key}.pptx`,
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      buffer,
    }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true }).catch(() => undefined)
  }
}
