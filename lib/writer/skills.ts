import { loadEnterpriseKnowledgeContext, type EnterpriseKnowledgeContext } from "@/lib/dify/enterprise-knowledge"
import { generateTextWithAiberm, hasAibermApiKey } from "@/lib/writer/aiberm"
import { type WriterLanguage, type WriterMode, type WriterPlatform } from "@/lib/writer/config"
import { writerRequestJson, writerRequestText } from "@/lib/writer/network"

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || ""
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || ""
const JINA_API_KEY = process.env.JINA_API_KEY || ""

const WRITER_TEXT_MODEL = process.env.WRITER_TEXT_MODEL || "google/gemini-3-flash-preview"
const WRITER_ENABLE_WEB_RESEARCH = process.env.WRITER_ENABLE_WEB_RESEARCH !== "false"
const WRITER_REQUIRE_WEB_RESEARCH = process.env.WRITER_REQUIRE_WEB_RESEARCH === "true"
const WRITER_RESEARCH_CACHE_TTL_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_RESEARCH_CACHE_TTL_MS || "600000", 10) || 600_000,
)
const WRITER_RESEARCH_BUDGET_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_RESEARCH_BUDGET_MS || "4500", 10) || 4_500,
)
const WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS = Math.max(
  0,
  Number.parseInt(process.env.WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS || "3000", 10) || 3_000,
)
const WRITER_SEARCH_RESULT_LIMIT = Math.min(
  10,
  Math.max(1, Number.parseInt(process.env.WRITER_SEARCH_RESULT_LIMIT || "4", 10) || 4),
)
const WRITER_SEARCH_EXTRACT_LIMIT = Math.min(
  3,
  Math.max(1, Number.parseInt(process.env.WRITER_SEARCH_EXTRACT_LIMIT || "1", 10) || 1),
)

const writerResearchCache = new Map<string, { expiresAt: number; value: Promise<WriterResearchResult> }>()

type SearchItem = {
  title: string
  snippet: string
  link: string
}

type WriterResearchResult = {
  items: SearchItem[]
  extracts: Array<{ url: string; content: string }>
  status: "ready" | "disabled" | "timed_out" | "unavailable"
}

type WriterPlatformGuide = {
  label: string
  tone: string
  format: string
  length: string
  image: string
  promptRules: string[]
}

const WRITER_PLATFORM_GUIDE: Record<WriterPlatform, WriterPlatformGuide> = {
  wechat: {
    label: "WeChat Official Account article writer",
    tone: "professional, analytical, trusted, story-driven",
    format: "publish-ready long-form article",
    length: "1500-3500 words or equivalent localized length",
    image: "16:9 cover plus 2-5 inline editorial images",
    promptRules: [
      "Follow a research-first workflow.",
      "Write as a polished article for direct publishing, not as a writing brief.",
      "Use H2 sections when they improve readability, but do not force a rigid intro-body-conclusion template.",
      "Allow the article to open directly with a strong first paragraph when that reads better.",
      "Allow the ending to be a natural closing paragraph or a labeled conclusion only when appropriate.",
      "Keep facts grounded in the provided material. Do not invent precise data or unsupported claims.",
    ],
  },
  xiaohongshu: {
    label: "Xiaohongshu image-post writer",
    tone: "conversational, catchy, friendly, save-worthy",
    format: "mobile-first visual note",
    length: "200-900 words or equivalent localized length",
    image: "3:4 cover plus 3-6 card-style images",
    promptRules: [
      "Lead with a hook and optimize for quick mobile reading.",
      "Keep paragraphs short and punchy.",
      "Avoid heavy article framing unless the user explicitly asks for it.",
      "End with a save/share/comment CTA only when it fits the platform style.",
      "Retain factual accuracy from the provided material.",
    ],
  },
  x: {
    label: "X writer",
    tone: "direct, sharp, opinion-driven, globally legible",
    format: "single post or thread-ready draft",
    length: "single post: concise long post; thread: 5-12 segments",
    image: "16:9 social image set with 1-3 visual assets",
    promptRules: [
      "If the mode is thread, structure the body as a clean sequence of short segments.",
      "Lead with a strong hook and keep every segment self-contained but connected.",
      "Prioritize clarity and takeaways over ornamental writing.",
      "Avoid forced section headers unless the user explicitly asks for article style.",
    ],
  },
  facebook: {
    label: "Facebook writer",
    tone: "narrative, community-oriented, shareable, brand-safe",
    format: "single long post or multi-part social post",
    length: "single post: medium to long; multi-part: 4-8 segments",
    image: "16:9 or 1.91:1 brand-friendly social visuals with 1-4 assets",
    promptRules: [
      "Balance story, practical insight, and shareability.",
      "If the mode is multi-part, write segments that flow naturally when posted sequentially.",
      "Use section labels only when they help reading; do not force article conventions from other platforms.",
      "Keep examples concrete and easy to understand without insider context.",
    ],
  },
}

function shouldUseWriterE2EFixtures() {
  return process.env.WRITER_E2E_FIXTURES === "true"
}

function hasWriterResearchConfig() {
  return Boolean(GOOGLE_SEARCH_API_KEY && GOOGLE_SEARCH_ENGINE_ID && JINA_API_KEY)
}

function createEmptyResearchResult(status: WriterResearchResult["status"]): WriterResearchResult {
  return {
    items: [],
    extracts: [],
    status,
  }
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, fallback: () => T): Promise<T> {
  if (timeoutMs <= 0) {
    return fallback()
  }

  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback()), timeoutMs)
      }),
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function buildFixtureKnowledgeBlock(enterpriseKnowledge?: EnterpriseKnowledgeContext | null) {
  if (!enterpriseKnowledge?.snippets?.length) {
    return ""
  }

  return `\n## 企业知识锚点\n\n${enterpriseKnowledge.snippets.map((snippet) => `- ${snippet.content}`).join("\n")}\n`
}

function buildFixtureDraft(
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const language = preferredLanguage === "auto" ? "zh" : preferredLanguage
  const knowledgeBlock = buildFixtureKnowledgeBlock(enterpriseKnowledge)

  if (language !== "zh") {
    return `# Writer Fixture Draft

## Summary

This is a deterministic fixture draft for automated regression.

> Use this fixture only in E2E mode.

- Platform: ${platform}
- Mode: ${mode}
- Language: ${language}
${knowledgeBlock}
![Cover](writer-asset://cover)
`
  }

  if (platform === "x" && mode === "thread") {
    return `### 第 1 段
**先说结论：** AI 创业真正稀缺的不是模型，而是贴着业务流程落地的能力。

### 第 2 段
很多团队把时间花在追新模型上，却没有把用户旅程、数据回流和自动化闭环做扎实。

### 第 3 段
> 如果一个 Agent 不能稳定完成任务，它就只是一个会聊天的界面。

### 第 4 段
- 先选垂直场景
- 再补自动化能力
- 最后再优化模型效果

![Cover](writer-asset://cover)

### 第 5 段
把工程能力、工作流和反馈回路放在第一位，增长效率会高很多。

### 第 6 段
${enterpriseKnowledge?.snippets?.[0]?.content || "如果你也在做 AI 产品，欢迎交流你最关心的落地问题。"}
`
  }

  return `# AI 创业团队如何避免内容空转

${knowledgeBlock}
公众号内容真正稀缺的，不是“写得多”，而是“写了之后能形成增长资产”。

## 先明确内容服务的业务目标

很多团队一开始就追求选题数量，但没有先定义内容要服务哪一段业务链路：获客、教育、转化，还是客户成功。

> 没有业务目标的内容生产，通常只会变成内部自我感动。

## 建立稳定的内容复用机制

把一次调研拆成多个可复用资产，例如文章、社媒摘录、销售跟进素材和知识库更新，才能让内容真正沉淀下来。

**关键做法：** 每次发布后都要记录阅读、转发、咨询和转化反馈。

## 用固定工作流降低内容波动

- 先做研究和资料归纳
- 再产出首稿并确认文案
- 最后生成配图并统一预览

![Cover](writer-asset://cover)

## 让内容与团队协作闭环

运营、销售和产品都应该能从同一篇文章里抽取可用信息，避免内容停留在单点产出。

写到最后，真正有价值的内容，不是更花哨，而是更能帮助团队稳定复用、持续转化。
`
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

function detectRequestedLanguage(query: string, preferredLanguage: WriterLanguage = "auto") {
  if (preferredLanguage !== "auto") {
    const explicitMap: Record<Exclude<WriterLanguage, "auto">, { label: string; instruction: string }> = {
      zh: { label: "Chinese", instruction: "Write the final output fully in Chinese." },
      en: { label: "English", instruction: "Write the final output fully in English." },
      ja: { label: "Japanese", instruction: "Write the final output fully in Japanese." },
      ko: { label: "Korean", instruction: "Write the final output fully in Korean." },
      fr: { label: "French", instruction: "Write the final output fully in French." },
      de: { label: "German", instruction: "Write the final output fully in German." },
      es: { label: "Spanish", instruction: "Write the final output fully in Spanish." },
    }

    return explicitMap[preferredLanguage]
  }

  const normalized = query.toLowerCase()

  if (/\b(in|use|write|generate|output)\s+english\b/.test(normalized) || /英文|英语/.test(query)) {
    return { label: "English", instruction: "Write the final output fully in English." }
  }
  if (/日文|日语|日本語|japanese/i.test(query)) {
    return { label: "Japanese", instruction: "Write the final output fully in Japanese." }
  }
  if (/韩文|韩语|한국어|korean/i.test(query)) {
    return { label: "Korean", instruction: "Write the final output fully in Korean." }
  }
  if (/法文|法语|français|french/i.test(query)) {
    return { label: "French", instruction: "Write the final output fully in French." }
  }
  if (/德文|德语|deutsch|german/i.test(query)) {
    return { label: "German", instruction: "Write the final output fully in German." }
  }
  if (/西班牙文|西班牙语|español|spanish/i.test(query)) {
    return { label: "Spanish", instruction: "Write the final output fully in Spanish." }
  }

  return { label: "Chinese", instruction: "Write the final output fully in Chinese." }
}

function splitMarkdownSections(markdown: string) {
  const lines = markdown.split("\n")
  const sections: Array<{ heading: string | null; lines: string[] }> = []
  let current: { heading: string | null; lines: string[] } = { heading: null, lines: [] }

  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current.lines.length > 0) {
        sections.push(current)
      }
      current = { heading: line.replace(/^##\s+/, "").trim(), lines: [line] }
      continue
    }

    current.lines.push(line)
  }

  if (current.lines.length > 0) {
    sections.push(current)
  }

  return sections
}

function stripWechatMetaSections(markdown: string) {
  const blockedHeadings = [
    "title options",
    "publishing notes",
    "image notes",
    "配图说明",
    "图片说明",
    "发布说明",
    "发布建议",
    "标题备选",
    "备选标题",
  ]

  const sections = splitMarkdownSections(markdown).filter((section) => {
    const heading = (section.heading || "").toLowerCase()
    return !blockedHeadings.some((blocked) => heading.includes(blocked))
  })

  return sections
    .map((section) => section.lines.join("\n").trim())
    .filter(Boolean)
    .join("\n\n")
}

function normalizeWechatTitle(markdown: string, languageLabel: string) {
  const fallbackTitle = languageLabel === "Chinese" ? "未命名文章" : "Untitled Article"
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line))

  if (titleIndex >= 0) {
    const title = lines[titleIndex].replace(/^#\s+/, "").trim()
    const rest = lines.filter((_, index) => index !== titleIndex && !/^#\s+/.test(lines[index]))
    return [`# ${title || fallbackTitle}`, ...rest].join("\n").trim()
  }

  const firstContentIndex = lines.findIndex((line) => line.trim())
  if (firstContentIndex < 0) {
    return `# ${fallbackTitle}`
  }

  const title = lines[firstContentIndex].replace(/^#+\s*/, "").trim() || fallbackTitle
  const rest = lines.filter((_, index) => index !== firstContentIndex)
  return [`# ${title}`, ...rest].join("\n").trim()
}

function postProcessWriterDraft(platform: WriterPlatform, mode: WriterMode, markdown: string, languageLabel: string) {
  const normalized = normalizeLineBreaks(markdown)

  if (platform !== "wechat" || mode !== "article") {
    return normalized
  }

  let next = normalizeWechatTitle(normalized, languageLabel)
  next = stripWechatMetaSections(next)
  return next.replace(/\n{3,}/g, "\n\n").trim()
}

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength)}...`
}

async function googleSearch(query: string, num = 5): Promise<SearchItem[]> {
  if (!GOOGLE_SEARCH_API_KEY || !GOOGLE_SEARCH_ENGINE_ID) {
    throw new Error("writer_search_config_missing")
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1")
  url.searchParams.set("key", GOOGLE_SEARCH_API_KEY)
  url.searchParams.set("cx", GOOGLE_SEARCH_ENGINE_ID)
  url.searchParams.set("q", query)
  url.searchParams.set("num", String(Math.min(Math.max(num, 1), 10)))

  const response = await writerRequestJson(url.toString(), {}, { attempts: 2, timeoutMs: 60_000 })
  if (!response.ok) {
    throw new Error(`google_search_http_${response.status}`)
  }

  const data = response.data as any
  return Array.isArray(data?.items)
    ? data.items.map((item: any) => ({
        title: item?.title || "",
        snippet: item?.snippet || "",
        link: item?.link || "",
      }))
    : []
}

async function readWithJina(url: string) {
  if (!JINA_API_KEY) {
    throw new Error("writer_jina_config_missing")
  }

  const headers: Record<string, string> = {
    Accept: "text/markdown",
    Authorization: `Bearer ${JINA_API_KEY}`,
  }

  const response = await writerRequestText(`https://r.jina.ai/${url}`, { headers }, { attempts: 2, timeoutMs: 90_000 })
  if (!response.ok) {
    throw new Error(`jina_http_${response.status}`)
  }

  return response.text
}

async function buildResearchContext(query: string): Promise<WriterResearchResult> {
  if (!WRITER_ENABLE_WEB_RESEARCH) {
    return createEmptyResearchResult("disabled")
  }

  if (!hasWriterResearchConfig()) {
    if (WRITER_REQUIRE_WEB_RESEARCH) {
      throw new Error("writer_search_config_missing")
    }

    return createEmptyResearchResult("unavailable")
  }

  const cacheKey = query.trim().toLowerCase()
  const cached = writerResearchCache.get(cacheKey)
  const now = Date.now()
  if (cached && cached.expiresAt > now) {
    return cached.value
  }

  const nextValue = withTimeout(buildResearchContextFresh(query), WRITER_RESEARCH_BUDGET_MS, () =>
    createEmptyResearchResult("timed_out"),
  )
  writerResearchCache.set(cacheKey, {
    expiresAt: now + WRITER_RESEARCH_CACHE_TTL_MS,
    value: nextValue,
  })

  try {
    return await nextValue
  } catch (error) {
    writerResearchCache.delete(cacheKey)
    throw error
  }
}

async function buildResearchContextFresh(query: string): Promise<WriterResearchResult> {
  const items = await googleSearch(`${query} latest trends case study`, WRITER_SEARCH_RESULT_LIMIT)
  if (items.length === 0) {
    return createEmptyResearchResult("unavailable")
  }

  const extracts = (
    await Promise.all(
      items.slice(0, WRITER_SEARCH_EXTRACT_LIMIT).map(async (item) => {
        if (!item.link) return null

        try {
          const content = await readWithJina(item.link)
          if (!content.trim()) return null

          return {
            url: item.link,
            content: compactText(content, 2400),
          }
        } catch {
          return null
        }
      }),
    )
  ).filter((item): item is WriterResearchResult["extracts"][number] => Boolean(item))

  return { items, extracts, status: "ready" }
}

function buildSystemPrompt(
  platform: WriterPlatform,
  mode: WriterMode,
  languageInstruction: string,
  research: WriterResearchResult,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const guide = WRITER_PLATFORM_GUIDE[platform]
  const modeLabel = mode === "thread" ? "thread or multi-part post" : "single long-form article"

  return [
    `You are a ${guide.label}.`,
    "You are implementing the same writing-skill approach used by the reference project at D:/OpenCode/writer.",
    `Tone: ${guide.tone}.`,
    `Output mode: ${modeLabel}.`,
    `Content format: ${guide.format}.`,
    `Length target: ${guide.length}.`,
    `Image guidance: ${guide.image}.`,
    ...guide.promptRules,
    languageInstruction,
    enterpriseKnowledge?.snippets?.length
      ? "Enterprise knowledge is provided separately. Treat it as first-party brand truth and prefer it over generic assumptions."
      : "No enterprise knowledge is attached for this request.",
    "Return a publish-ready Markdown draft.",
    research.status === "ready"
      ? "Absorb the research first, then write."
      : "External research may be partial or unavailable. If so, rely on enterprise knowledge and broadly known information, and avoid precise unsupported claims.",
    "Do not reveal chain-of-thought, hidden reasoning, or internal analysis.",
    "Use writer-asset://cover, writer-asset://section-1, and writer-asset://section-2 as image placeholders inside the Markdown body when images are useful.",
  ].join("\n")
}

function buildUserPrompt(
  query: string,
  platform: WriterPlatform,
  mode: WriterMode,
  research: WriterResearchResult,
  languageInstruction: string,
  enterpriseKnowledge?: EnterpriseKnowledgeContext | null,
) {
  const researchAvailabilityNote =
    research.status === "ready"
      ? "Live web research was included."
      : research.status === "timed_out"
        ? "Live web research timed out, so continue with partial context."
        : research.status === "disabled"
          ? "Live web research is disabled for this environment."
          : "Live web research was unavailable for this request."

  const references = research.items
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\nURL: ${item.link}\nSummary: ${item.snippet}`)
    .join("\n\n")

  const extracts = research.extracts
    .map((item, index) => `Source ${index + 1}: ${item.url}\n${item.content}`)
    .join("\n\n")

  const enterpriseKnowledgeText = enterpriseKnowledge?.snippets?.length
    ? enterpriseKnowledge.snippets
        .map(
          (snippet, index) =>
            `${index + 1}. [${snippet.scope}] ${snippet.datasetName} - ${snippet.title}\n${snippet.content}`,
        )
        .join("\n\n")
    : ""

  const platformStructureGuide =
    platform === "wechat"
      ? [
          "Write as a complete article suitable for WeChat publishing.",
          "You may use H2 headings where they improve readability.",
          "Do not force labeled sections such as intro or conclusion unless the topic naturally benefits from them.",
          "Insert `![Cover](writer-asset://cover)` near the opening and inline image placeholders where relevant.",
        ].join("\n")
      : platform === "xiaohongshu"
        ? [
            "Write as a mobile-first image note.",
            "Use short paragraphs and punchy pacing.",
            "Do not force traditional article sections unless explicitly requested.",
            "Insert `![Cover](writer-asset://cover)` and inline image placeholders that map to visual cards.",
          ].join("\n")
        : mode === "thread"
          ? [
              "Write as a sequential multi-part post.",
              "Use `### Segment 1`, `### Segment 2`, etc. so the UI can render thread cards.",
              "Keep each segment publishable on its own.",
              "Use only the image placeholders actually needed for this mode.",
            ].join("\n")
          : [
              "Write as a single social post or article-style post for the selected platform.",
              "Use headings only when helpful; do not force long-form article conventions.",
              "Insert image placeholders only where they improve the post.",
            ].join("\n")

  return [
    "User request:",
    query.trim(),
    "",
    "Enterprise knowledge:",
    enterpriseKnowledgeText || "No enterprise knowledge context was attached.",
    "",
    "Search findings:",
    researchAvailabilityNote,
    references || "No search results.",
    "",
    "Extracted source material:",
    extracts || "No extracted source text.",
    "",
    "Platform-specific writing guidance:",
    platformStructureGuide,
    "",
    "Requirements:",
    languageInstruction,
    "- Output only the final draft. Do not explain the process.",
    "- Use enterprise knowledge first when it directly answers the topic.",
    "- Use the source material for trends, external facts, and cases. Do not invent specific data.",
    "- The result must be clean Markdown suitable for continued editing and publishing.",
    "- Keep the structure native to the selected platform and selected mode.",
  ].join("\n")
}

export function isWriterSkillsAvailable() {
  return Boolean(hasAibermApiKey() && (hasWriterResearchConfig() || !WRITER_REQUIRE_WEB_RESEARCH))
}

export type WriterSkillsAvailability = {
  enabled: boolean
  provider: "aiberm" | "unavailable"
  reason: "ok" | "aiberm_api_key_missing" | "research_config_missing"
  requiresWebResearch: boolean
  webResearchEnabled: boolean
}

export function getWriterSkillsAvailability(): WriterSkillsAvailability {
  if (!hasAibermApiKey()) {
    return {
      enabled: false,
      provider: "unavailable",
      reason: "aiberm_api_key_missing",
      requiresWebResearch: WRITER_REQUIRE_WEB_RESEARCH,
      webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
    }
  }

  if (WRITER_REQUIRE_WEB_RESEARCH && !hasWriterResearchConfig()) {
    return {
      enabled: false,
      provider: "aiberm",
      reason: "research_config_missing",
      requiresWebResearch: true,
      webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
    }
  }

  return {
    enabled: true,
    provider: "aiberm",
    reason: "ok",
    requiresWebResearch: WRITER_REQUIRE_WEB_RESEARCH,
    webResearchEnabled: WRITER_ENABLE_WEB_RESEARCH,
  }
}

export async function generateWriterDraftWithSkills(
  query: string,
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage = "auto",
  options?: {
    enterpriseId?: number | null
  },
) {
  const enterpriseKnowledgePromise = withTimeout(
    loadEnterpriseKnowledgeContext({
      enterpriseId: options?.enterpriseId,
      query,
      platform,
      mode,
    }).catch(() => null),
    WRITER_ENTERPRISE_KNOWLEDGE_BUDGET_MS,
    () => null,
  )

  if (shouldUseWriterE2EFixtures()) {
    const enterpriseKnowledge = await enterpriseKnowledgePromise
    return buildFixtureDraft(platform, mode, preferredLanguage, enterpriseKnowledge)
  }

  const language = detectRequestedLanguage(query, preferredLanguage)
  const researchPromise = buildResearchContext(query)
  const [enterpriseKnowledge, research] = await Promise.all([enterpriseKnowledgePromise, researchPromise])
  const systemPrompt = buildSystemPrompt(platform, mode, language.instruction, research, enterpriseKnowledge)
  const userPrompt = buildUserPrompt(query, platform, mode, research, language.instruction, enterpriseKnowledge)
  const answer = await generateTextWithAiberm(systemPrompt, userPrompt, WRITER_TEXT_MODEL)

  return postProcessWriterDraft(platform, mode, answer, language.label)
}
