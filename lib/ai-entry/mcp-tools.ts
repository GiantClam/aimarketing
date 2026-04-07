import type { ToolSet } from "ai"
import { createMCPClient } from "@ai-sdk/mcp"

type AnyTool = {
  description?: unknown
}

type ToolRecord = Record<string, AnyTool>

export type AiEntrySkill = {
  id: string
  name: string
  description: string
}

export type LoadedAiEntryTools = {
  skills: AiEntrySkill[]
  tools: ToolSet
  close: () => Promise<void>
}

type CloseFn = () => void | Promise<void>

function normalizeEnvList(raw: string | undefined) {
  return (raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getAiEntryMcpServerUrls() {
  return normalizeEnvList(process.env.AI_ENTRY_MCP_SERVER_URLS)
}

export async function loadAiEntryMcpTools(urls: string[]): Promise<LoadedAiEntryTools> {
  const mergedTools: ToolRecord = {}
  const skills: AiEntrySkill[] = []
  const closers: CloseFn[] = []

  for (const url of urls) {
    const client = await createMCPClient({
      transport: {
        type: "sse",
        url,
      },
    })
    closers.push(() => client.close())

    const rawToolset = (await client.tools()) as unknown
    const toolset =
      rawToolset && typeof rawToolset === "object"
        ? (rawToolset as ToolRecord)
        : {}
    for (const [name, tool] of Object.entries(toolset)) {
      if (mergedTools[name]) continue
      mergedTools[name] = tool
      skills.push({
        id: name,
        name,
        description:
          typeof tool?.description === "string" && tool.description.trim()
            ? tool.description
            : "No description",
      })
    }
  }

  return {
    skills,
    tools: mergedTools as ToolSet,
    close: async () => {
      await Promise.allSettled(closers.map((closer) => Promise.resolve(closer())))
    },
  }
}

export function selectAiEntryTools(tools: ToolSet, enabledIds: string[]) {
  if (!enabledIds.length) return {} as ToolSet
  if (!tools || typeof tools !== "object") return {} as ToolSet
  const selected: ToolRecord = {}
  for (const toolId of enabledIds) {
    const tool = (tools as ToolRecord)[toolId]
    if (tool) {
      selected[toolId] = tool
    }
  }
  return selected as ToolSet
}
