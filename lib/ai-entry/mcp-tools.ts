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
  loadedServerIds: string[]
  warnings: string[]
}

type CloseFn = () => void | Promise<void>

export type AiEntryMcpServerDefinition = {
  id: string
  name: string
  transport: "sse" | "http" | "stdio"
  url?: string
  command?: string
  args?: string[]
  allowedToolNames?: string[]
  timeoutMs: number
  enabled: boolean
}

function normalizeEnvList(raw: string | undefined) {
  return (raw || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
}

export function getAiEntryMcpServerUrls() {
  return normalizeEnvList(process.env.AI_ENTRY_MCP_SERVER_URLS)
}

export function getAiEntryMcpServerDefinitions(): AiEntryMcpServerDefinition[] {
  const rawDefinitions = process.env.AI_ENTRY_MCP_SERVER_DEFINITIONS?.trim()
  if (rawDefinitions) {
    try {
      const parsed = JSON.parse(rawDefinitions) as Array<Record<string, unknown>>
      if (Array.isArray(parsed)) {
        return parsed
          .map((item, index) => {
            const id =
              typeof item.id === "string" && item.id.trim()
                ? item.id.trim()
                : `mcp-${index + 1}`
            const transport =
              item.transport === "http" || item.transport === "sse" || item.transport === "stdio"
                ? item.transport
                : "sse"
            const url = typeof item.url === "string" ? item.url.trim() : undefined
            const command = typeof item.command === "string" ? item.command.trim() : undefined
            const args = Array.isArray(item.args)
              ? item.args.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : undefined
            const allowedToolNames = Array.isArray(item.allowedToolNames)
              ? item.allowedToolNames.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
              : undefined
            return {
              id,
              name:
                typeof item.name === "string" && item.name.trim()
                  ? item.name.trim()
                  : id,
              transport,
              url,
              command,
              args,
              allowedToolNames,
              timeoutMs:
                typeof item.timeoutMs === "number" && Number.isFinite(item.timeoutMs)
                  ? item.timeoutMs
                  : 30_000,
              enabled: item.enabled !== false,
            } satisfies AiEntryMcpServerDefinition
          })
          .filter((item) => item.enabled)
      }
    } catch (error) {
      console.warn("ai-entry.mcp.registry.parse-failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return getAiEntryMcpServerUrls().map((url, index) => ({
    id: `mcp-sse-${index + 1}`,
    name: `MCP Server ${index + 1}`,
    transport: "sse" as const,
    url,
    timeoutMs: 30_000,
    enabled: true,
  }))
}

export async function loadAiEntryMcpTools(
  input:
    | string[]
    | {
        serverDefinitions: AiEntryMcpServerDefinition[]
        allowedToolNames?: string[]
      },
): Promise<LoadedAiEntryTools> {
  const serverDefinitions = Array.isArray(input)
    ? input.map((url, index) => ({
        id: `mcp-sse-${index + 1}`,
        name: `MCP Server ${index + 1}`,
        transport: "sse" as const,
        url,
        allowedToolNames: undefined,
        timeoutMs: 30_000,
        enabled: true,
      }))
    : input.serverDefinitions
  const mergedTools: ToolRecord = {}
  const skills: AiEntrySkill[] = []
  const closers: CloseFn[] = []
  const warnings: string[] = []
  const loadedServerIds: string[] = []

  for (const definition of serverDefinitions) {
    if (!definition.enabled) continue
    if (definition.transport === "stdio") {
      warnings.push(`mcp_server_unsupported_transport:${definition.id}`)
      continue
    }
    if (!definition.url) {
      warnings.push(`mcp_server_missing_url:${definition.id}`)
      continue
    }

    let client: Awaited<ReturnType<typeof createMCPClient>> | null = null
    try {
      client = await createMCPClient({
        transport: {
          type: definition.transport,
          url: definition.url,
        },
      })
    } catch (error) {
      warnings.push(
        `mcp_server_load_failed:${definition.id}:${error instanceof Error ? error.message : String(error)}`,
      )
      continue
    }

    closers.push(() => client.close())
    loadedServerIds.push(definition.id)

    const rawToolset = (await client.tools()) as unknown
    const toolset =
      rawToolset && typeof rawToolset === "object"
        ? (rawToolset as ToolRecord)
        : {}
    const definitionAllowed = new Set((definition.allowedToolNames ?? []).filter(Boolean))
    const requestedAllowed = new Set(
      (!Array.isArray(input) && Array.isArray(input.allowedToolNames) ? input.allowedToolNames : []).filter(Boolean),
    )
    for (const [name, tool] of Object.entries(toolset)) {
      if (definitionAllowed.size > 0 && !definitionAllowed.has(name)) continue
      if (requestedAllowed.size > 0 && !requestedAllowed.has(name)) continue
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
    loadedServerIds,
    warnings,
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
