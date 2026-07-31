import { clipRuntimeContextText, MAX_RUNTIME_SUMMARY_CHARS } from "./context-window"

type SummaryMessage = { role: "user" | "assistant" | "tool"; content: string }

/**
 * Build a bounded, deterministic summary for the platform-owned conversation
 * context. OpenCode can compact its own session, but it cannot compact the
 * prompt.md snapshot that the platform creates before invoking it.
 */
export function buildPersistedConversationSummary(messages: SummaryMessage[], previousSummary?: string | null) {
  const older = messages.slice(0, -4)
  if (older.length === 0 && !previousSummary?.trim()) return null

  const goals = older.filter((message) => message.role === "user").slice(0, 3)
  const completed = older.filter((message) => message.role === "assistant").slice(-3)
  const digest = older.slice(-8).map((message) => {
    const label = message.role === "user" ? "用户" : message.role === "assistant" ? "助手" : "工具"
    return `- ${label}: ${clipRuntimeContextText(message.content, 900)}`
  })
  const previous = previousSummary?.trim() ? clipRuntimeContextText(previousSummary, 3_000) : "无"

  return clipRuntimeContextText([
    "用户目标",
    goals.length > 0 ? goals.map((message) => `- ${clipRuntimeContextText(message.content, 900)}`).join("\n") : "- 见当前请求",
    "已完成工作",
    completed.length > 0 ? completed.map((message) => `- ${clipRuntimeContextText(message.content, 900)}`).join("\n") : "- 暂无",
    "关键决策",
    "- 保留当前请求和最近 4 轮；更早消息使用本摘要。",
    "当前文件/PPT 状态",
    "- 文件和 PPT 通过 artifact 元数据与 project snapshot 传递，不把二进制内容放入 prompt.md。",
    "未完成事项",
    "- 以当前请求和最近消息为准。",
    "下一步动作",
    "- 执行当前用户请求并更新本摘要。",
    "历史摘要（前一版本）",
    previous,
    "历史消息压缩摘录",
    digest.length > 0 ? digest.join("\n") : "- 无",
  ].join("\n"), MAX_RUNTIME_SUMMARY_CHARS)
}
