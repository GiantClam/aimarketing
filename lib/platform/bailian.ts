export type BailianConfig = {
  baseUrl: string
  apiKey: string
}

const DEFAULT_BAILIAN_BASE_URL = "https://dashscope.aliyuncs.com"

function normalizeBaseUrl(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : ""
  return (normalized || DEFAULT_BAILIAN_BASE_URL).replace(/\/+$/, "")
}

export function getBailianConfig(): BailianConfig {
  return {
    baseUrl: normalizeBaseUrl(process.env.BAILIAN_BASE_URL || process.env.DASHSCOPE_BASE_URL),
    apiKey: (process.env.BAILIAN_API_KEY || process.env.DASHSCOPE_API_KEY || "").trim(),
  }
}

export function isBailianConfigured(config = getBailianConfig()) {
  return Boolean(config.baseUrl && config.apiKey)
}

export function buildBailianUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`
}
