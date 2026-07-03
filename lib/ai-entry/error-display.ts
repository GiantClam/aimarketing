function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return ""
  return value.trim()
}

function extractRequestIdSuffix(message: string) {
  const match = message.match(/\(request id:\s*([^)]+)\)/i)
  if (!match?.[1]) return ""
  return ` (request id: ${match[1].trim()})`
}

export function renderAiEntryDisplayErrorMessage(input: {
  value: unknown
  unknownError: string
  isZh: boolean
}) {
  const raw = normalizeOptionalText(input.value)
  if (!raw) return input.unknownError

  if (raw === "insufficient_credits") {
    return input.isZh
      ? "当前工作区共享积分不足，请前往计费页充值或升级套餐。"
      : "Workspace credits are insufficient. Please top up or upgrade your billing plan."
  }

  if (
    /your account quota is insufficient|insufficient_quota|provider_quota_exceeded|quota exceeded|please recharge/i.test(
      raw,
    )
  ) {
    const suffix = extractRequestIdSuffix(raw)
    return input.isZh
      ? `上游模型或远端运行时账户额度不足，这不是当前工作区积分不足。请检查模型提供商或 PPT worker 账户额度。${suffix}`
      : `The upstream model or remote runtime account is out of quota. This is separate from your workspace credits. Check the provider or PPT worker account quota.${suffix}`
  }

  const unknownModelMatch = raw.match(/unknown model ['"]?([^'"]+)['"]?/i)
  if (unknownModelMatch?.[1]) {
    const model = unknownModelMatch[1].trim()
    return input.isZh
      ? `当前 PPT 运行时不支持模型 "${model}"。请改用 MiniMax-M3、MiniMax-M2.7-highspeed 或 step-3.7-flash。`
      : `The current PPT runtime does not support model "${model}". Switch to MiniMax-M3, MiniMax-M2.7-highspeed, or step-3.7-flash.`
  }

  return raw
}
