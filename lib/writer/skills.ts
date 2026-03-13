import { type WriterLanguage, type WriterMode, type WriterPlatform } from "@/lib/writer/config"
import { writerRequestJson, writerRequestText } from "@/lib/writer/network"

const OPENROUTER_API_BASE = (process.env.OPENROUTER_API_BASE || process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/$/, "")
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || ""
const OPENROUTER_REFERER =
  process.env.OPENROUTER_REFERER ||
  process.env.NEXT_PUBLIC_APP_URL ||
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.SITE_URL ||
  "https://www.aimarketingsite.com"
const OPENROUTER_TITLE = process.env.OPENROUTER_TITLE || "AI Marketing Writer"

const GOOGLE_SEARCH_API_KEY = process.env.GOOGLE_SEARCH_API_KEY || ""
const GOOGLE_SEARCH_ENGINE_ID = process.env.GOOGLE_SEARCH_ENGINE_ID || ""
const JINA_API_KEY = process.env.JINA_API_KEY || ""

const WRITER_TEXT_MODEL = process.env.WRITER_TEXT_MODEL || "google/gemini-3-flash-preview"

type SearchItem = {
  title: string
  snippet: string
  link: string
}

type WriterResearchResult = {
  items: SearchItem[]
  extracts: Array<{ url: string; content: string }>
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
      "Follow the research-first writing workflow from the reference writer project.",
      "Write as a polished article for direct publishing, not as a writing brief.",
      "Use clear H2 sections when the topic benefits from structure, but do not force a fixed section template.",
      "Allow the article to open directly with a strong first paragraph when that reads better than a labeled intro section.",
      "Allow the ending to be a natural closing paragraph or a labeled conclusion only when appropriate.",
      "Keep facts grounded in the provided research. Do not invent precise data or source claims.",
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
      "Use sectioning only where it improves readability; avoid heavy article framing.",
      "End with a save/share/comment CTA only when it fits the platform style.",
      "Retain factual accuracy from the research material and avoid exaggerated claims.",
    ],
  },
  x: {
    label: "X writer",
    tone: "direct, sharp, opinion-driven, globally legible",
    format: "single post or thread-ready draft",
    length: "single post: concise long post; thread: 5-12 segments",
    image: "16:9 social image set with 1-3 visual assets",
    promptRules: [
      "If the mode is thread, structure the body as a clean sequence of short segments that can be posted one-by-one.",
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
    return {
      label: "English",
      instruction: "Write the final output fully in English.",
    }
  }

  if (/日文|日语|日本語|japanese/.test(query)) {
    return {
      label: "Japanese",
      instruction: "Write the final output fully in Japanese.",
    }
  }

  if (/韩文|韩语|한국어|korean/.test(query)) {
    return {
      label: "Korean",
      instruction: "Write the final output fully in Korean.",
    }
  }

  if (/法文|法语|fran[cç]ais|french/.test(normalized) || /法文|法语/.test(query)) {
    return {
      label: "French",
      instruction: "Write the final output fully in French.",
    }
  }

  if (/德文|德语|deutsch|german/.test(normalized) || /德文|德语/.test(query)) {
    return {
      label: "German",
      instruction: "Write the final output fully in German.",
    }
  }

  if (/西班牙文|西班牙语|español|spanish/.test(normalized) || /西班牙文|西班牙语/.test(query)) {
    return {
      label: "Spanish",
      instruction: "Write the final output fully in Spanish.",
    }
  }

  return {
    label: "Chinese",
    instruction: "Write the final output fully in Chinese.",
  }
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
  const blockedHeadings = ["title options", "publishing notes", "image notes", "配图说明", "图片说明", "发布说明", "发布建议", "标题备选", "备选标题"]

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

  const headers: Record<string, string> = { Accept: "text/markdown" }
  headers.Authorization = `Bearer ${JINA_API_KEY}`

  const response = await writerRequestText(`https://r.jina.ai/${url}`, { headers }, { attempts: 2, timeoutMs: 90_000 })

  if (!response.ok) {
    throw new Error(`jina_http_${response.status}`)
  }

  return response.text
}

async function buildResearchContext(query: string): Promise<WriterResearchResult> {
  const items = await googleSearch(`${query} latest trends case study`, 5)
  if (items.length === 0) {
    throw new Error("writer_search_empty")
  }

  const extracts: WriterResearchResult["extracts"] = []
  for (const item of items.slice(0, 2)) {
    if (!item.link) continue

    try {
      const content = await readWithJina(item.link)
      if (content.trim()) {
        extracts.push({
          url: item.link,
          content: compactText(content, 2400),
        })
      }
    } catch {
      continue
    }
  }

  return { items, extracts }
}

function buildSystemPrompt(platform: WriterPlatform, mode: WriterMode, languageInstruction: string) {
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
    "Return a publish-ready Markdown draft.",
    "Absorb the research first, then write.",
    "Do not reveal chain-of-thought, hidden reasoning, or internal analysis.",
    "Use writer-asset://cover, writer-asset://section-1, and writer-asset://section-2 as image placeholders inside the Markdown body when images are useful.",
  ].join("\n")
}

function buildUserPrompt(query: string, platform: WriterPlatform, mode: WriterMode, research: WriterResearchResult, languageInstruction: string) {
  const references = research.items
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\nURL: ${item.link}\nSummary: ${item.snippet}`)
    .join("\n\n")

  const extracts = research.extracts
    .map((item, index) => `Source ${index + 1}: ${item.url}\n${item.content}`)
    .join("\n\n")

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
    "Search findings:",
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
    "- Use the source material for facts, trends, and cases. Do not invent specific data.",
    "- The result must be clean Markdown suitable for continued editing and publishing.",
    "- Keep the structure native to the selected platform and selected mode.",
  ].join("\n")
}

function extractTextFromOpenRouterResponse(data: any) {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null
  const message = choice?.message || {}
  const content = message?.content

  if (typeof content === "string" && content.trim()) {
    return content.trim()
  }

  if (Array.isArray(content)) {
    const text = content
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("")
      .trim()
    if (text) {
      return text
    }
  }

  if (typeof choice?.text === "string" && choice.text.trim()) {
    return choice.text.trim()
  }

  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim()
  }

  if (typeof message?.reasoning === "string" && message.reasoning.trim()) {
    return message.reasoning.trim()
  }

  throw new Error("openrouter_text_empty")
}

async function generateTextWithOpenRouter(systemPrompt: string, userPrompt: string, model = WRITER_TEXT_MODEL) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("openrouter_api_key_missing")
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
  }

  if (OPENROUTER_API_BASE.includes("openrouter.ai")) {
    headers["HTTP-Referer"] = OPENROUTER_REFERER
    headers["X-Title"] = OPENROUTER_TITLE
  }

  const response = await writerRequestJson(
    `${OPENROUTER_API_BASE}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 4096,
      }),
    },
    { attempts: 2, timeoutMs: 120_000 },
  )

  if (!response.ok) {
    const data = response.data as any
    throw new Error(data?.error?.message || `openrouter_text_http_${response.status}`)
  }

  return extractTextFromOpenRouterResponse(response.data)
}

export function isWriterSkillsAvailable() {
  return Boolean(OPENROUTER_API_KEY && GOOGLE_SEARCH_API_KEY && GOOGLE_SEARCH_ENGINE_ID && JINA_API_KEY)
}

export function getWriterSkillsProvider() {
  if (OPENROUTER_API_KEY) {
    return "openrouter" as const
  }

  return "unavailable" as const
}

export async function generateWriterDraftWithSkills(
  query: string,
  platform: WriterPlatform,
  mode: WriterMode,
  preferredLanguage: WriterLanguage = "auto",
) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("openrouter_api_key_missing")
  }

  const language = detectRequestedLanguage(query, preferredLanguage)
  const research = await buildResearchContext(query)
  const systemPrompt = buildSystemPrompt(platform, mode, language.instruction)
  const userPrompt = buildUserPrompt(query, platform, mode, research, language.instruction)
  const answer = await generateTextWithOpenRouter(systemPrompt, userPrompt, WRITER_TEXT_MODEL)

  return postProcessWriterDraft(platform, mode, answer, language.label)
}
