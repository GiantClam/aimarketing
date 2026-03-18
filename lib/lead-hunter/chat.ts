type LeadHunterChatPayload = {
  query: string
  responseMode: "blocking" | "streaming"
  user: string
}

function toReadableLabel(key: string) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
}

function isPrimitive(value: unknown): value is string | number | boolean {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean"
}

function extractPreferredText(value: unknown): string {
  if (typeof value === "string") return value.trim()
  if (!value || typeof value !== "object") return ""

  const record = value as Record<string, unknown>
  for (const key of ["answer", "text", "content", "result", "output", "summary", "message"]) {
    const candidate = record[key]
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim()
    }
  }

  for (const nested of Object.values(record)) {
    const next = extractPreferredText(nested)
    if (next) return next
  }

  return ""
}

function formatInlineValue(value: unknown) {
  if (value == null) return "-"
  if (isPrimitive(value)) return String(value)
  if (Array.isArray(value)) {
    const primitives = value.filter(isPrimitive)
    if (primitives.length === value.length) {
      return primitives.join(" / ")
    }
  }
  return JSON.stringify(value)
}

function formatObjectList(items: Array<Record<string, unknown>>) {
  return items
    .map((item, index) => {
      const lines = Object.entries(item).map(([key, value]) => `- **${toReadableLabel(key)}**: ${formatInlineValue(value)}`)
      return `${index + 1}. ${lines.join("\n")}`
    })
    .join("\n\n")
}

export function buildLeadHunterChatPayload({ query, responseMode, user }: LeadHunterChatPayload) {
  return {
    inputs: {
      contents: query,
      user_query: query,
      search_query: query,
      search_conditions: query,
    },
    query,
    response_mode: responseMode,
    user,
  }
}

export function formatLeadHunterChatOutput(outputs: unknown) {
  const preferredText = extractPreferredText(outputs)
  if (preferredText) {
    return preferredText
  }

  if (Array.isArray(outputs)) {
    if (outputs.length === 0) {
      return "未返回客户信息列表。"
    }

    if (outputs.every((item) => item && typeof item === "object" && !Array.isArray(item))) {
      return formatObjectList(outputs as Array<Record<string, unknown>>)
    }

    return outputs.map((item, index) => `${index + 1}. ${formatInlineValue(item)}`).join("\n")
  }

  if (outputs && typeof outputs === "object") {
    const record = outputs as Record<string, unknown>
    for (const key of ["leads", "lead_list", "customers", "customer_list", "items", "results", "data"]) {
      const nested = record[key]
      if (Array.isArray(nested)) {
        return formatLeadHunterChatOutput(nested)
      }
    }

    return Object.entries(record)
      .map(([key, value]) => `- **${toReadableLabel(key)}**: ${formatInlineValue(value)}`)
      .join("\n")
  }

  if (isPrimitive(outputs)) {
    return String(outputs)
  }

  return "未返回客户信息列表。"
}
