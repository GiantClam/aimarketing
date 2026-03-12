import { type WriterMode, type WriterPlatform } from "@/lib/writer/config"
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
    format: "long-form article with title options, lead, structured sections, cases, insights, conclusion, image notes, and publishing notes",
    length: "2500-4000 Chinese characters",
    image: "16:9 cover plus 2-5 inline editorial images",
    promptRules: [
      "Follow the content-creation workflow from the reference writer project: research first, then outline mentally, then write the publish-ready final draft.",
      "Use 5-7 main sections with meaningful H2 headings and optional H3 subsections where useful.",
      "Each major section should include context, detailed analysis, at least one real case or practical example, and actionable takeaways.",
      "Include industry trends, implementation guidance, and a future outlook section when relevant.",
      "Keep facts grounded in the provided research. Do not invent precise data or source claims.",
    ],
  },
  xiaohongshu: {
    label: "Xiaohongshu image-post writer",
    tone: "conversational, catchy, friendly, save-worthy",
    format: "mobile-first visual note with strong hook, short sections, practical tips, hashtags, image notes, and publishing notes",
    length: "200-600 Chinese characters",
    image: "3:4 cover plus 3-6 card-style images",
    promptRules: [
      "Use a strong hook in the opening sentence and optimize for quick mobile reading.",
      "Keep paragraphs short and punchy, with visual rhythm and lightweight emoji usage where helpful.",
      "Output 3-6 practical takeaways that feel immediately useful and easy to save.",
      "End with 5-10 relevant hashtags and a clear engagement CTA.",
      "Retain factual accuracy from the research material and avoid exaggerated claims.",
    ],
  },
  x: {
    label: "X writer",
    tone: "direct, sharp, opinion-driven, globally legible",
    format: "single long post or thread-ready markdown with a strong hook, distilled takeaways, image notes, and publishing notes",
    length: "single post: 600-1400 Chinese characters; thread: 6-12 segments",
    image: "16:9 social image set with 1-3 visual assets",
    promptRules: [
      "If the mode is thread, structure the body as a clean sequence of short segments that can be posted one-by-one.",
      "Lead with a strong hook and keep every segment self-contained but connected to the main narrative.",
      "Prioritize clarity, takeaways, and concise argumentation over ornamental writing.",
      "Avoid filler, and keep CTA short and native to X posting style.",
    ],
  },
  facebook: {
    label: "Facebook writer",
    tone: "narrative, community-oriented, shareable, brand-safe",
    format: "single long post or multi-part social post with storytelling, engagement prompts, image notes, and publishing notes",
    length: "single post: 800-1800 Chinese characters; multi-part: 4-8 segments",
    image: "16:9 or 1.91:1 brand-friendly social visuals with 1-4 assets",
    promptRules: [
      "Balance story, practical insight, and shareability for a community-style feed context.",
      "If the mode is multi-part, write segments that flow naturally when posted sequentially.",
      "Use a warm, credible tone and end with a discussion prompt or community CTA.",
      "Keep examples concrete and easy to understand without insider context.",
    ],
  },
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
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

function normalizeWechatTitle(markdown: string) {
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line))

  if (titleIndex >= 0) {
    const title = lines[titleIndex].replace(/^#\s+/, "").trim()
    const rest = lines.filter((_, index) => index !== titleIndex && !/^#\s+/.test(lines[index]))
    return [`# ${title}`, ...rest].join("\n").trim()
  }

  const firstContentIndex = lines.findIndex((line) => line.trim())
  if (firstContentIndex < 0) {
    return "# 未命名文章"
  }

  const title = lines[firstContentIndex].replace(/^#+\s*/, "").trim() || "未命名文章"
  const rest = lines.filter((_, index) => index !== firstContentIndex)
  return [`# ${title}`, ...rest].join("\n").trim()
}

function normalizeWechatIntro(markdown: string) {
  const lines = markdown.split("\n")
  const titleIndex = lines.findIndex((line) => /^#\s+/.test(line))
  if (titleIndex < 0) {
    return markdown
  }

  let cursor = titleIndex + 1
  const introBuffer: string[] = []

  while (cursor < lines.length) {
    const line = lines[cursor]
    if (!line.trim()) {
      introBuffer.push(line)
      cursor += 1
      continue
    }

    if (/^!\[.*\]\(writer-asset:\/\/cover\)/.test(line)) {
      introBuffer.push(line)
      cursor += 1
      continue
    }

    break
  }

  const introStart = cursor
  while (cursor < lines.length) {
    const line = lines[cursor]
    if (/^##\s+/.test(line)) {
      break
    }
    introBuffer.push(line)
    cursor += 1
  }

  const introContent = introBuffer.join("\n").trim()
  if (!introContent) {
    return markdown
  }

  if (/^##\s+引言\b/m.test(markdown)) {
    return markdown
  }

  const beforeIntro = lines.slice(0, introStart).join("\n").replace(/\n+$/, "")
  const afterIntro = lines.slice(cursor).join("\n").replace(/^\n+/, "")
  const introSection = `## 引言\n\n${introContent}`

  return [beforeIntro, introSection, afterIntro].filter(Boolean).join("\n\n").trim()
}

function normalizeWechatEnding(markdown: string) {
  if (/^##\s+结束语\b/m.test(markdown)) {
    return markdown
  }

  return markdown.replace(
    /^##\s*(总结|结语|写在最后|最后的话|结尾|结论)\s*$/m,
    "## 结束语",
  )
}

function postProcessWriterDraft(platform: WriterPlatform, mode: WriterMode, markdown: string) {
  const normalized = normalizeLineBreaks(markdown)

  if (platform !== "wechat" || mode !== "article") {
    return normalized
  }

  let next = normalizeWechatTitle(normalized)
  next = stripWechatMetaSections(next)
  next = normalizeWechatIntro(next)
  next = normalizeWechatEnding(next)

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

  const response = await writerRequestText(`https://r.jina.ai/${url}`, {
    headers,
  }, { attempts: 2, timeoutMs: 90_000 })

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
    if (!item.link) {
      continue
    }

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

function buildSystemPrompt(platform: WriterPlatform, mode: WriterMode) {
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
    "Write the final answer in Chinese and return a publish-ready Markdown draft.",
    "Absorb the research first, then write.",
    "Do not reveal chain-of-thought, hidden reasoning, or internal analysis.",
    "Use writer-asset://cover, writer-asset://section-1, and writer-asset://section-2 as image placeholders inside the Markdown body.",
  ].join("\n")
}

function buildUserPrompt(query: string, mode: WriterMode, research: WriterResearchResult) {
  const references = research.items
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\nURL: ${item.link}\nSummary: ${item.snippet}`)
    .join("\n\n")

  const extracts = research.extracts
    .map((item, index) => `Source ${index + 1}: ${item.url}\n${item.content}`)
    .join("\n\n")

  const outputGuide =
    mode === "thread"
      ? [
          "Return Markdown using this structure:",
          "1. # Title",
          "2. ## Title options",
          "3. ## Publishing notes",
          "4. ## Main body with sections like ### Segment 1 / ### Segment 2",
          "5. Insert at least `![Cover](writer-asset://cover)` and two more asset placeholders in the body",
          "6. End with ## Image notes and provide an English prompt for each image",
        ].join("\n")
      : [
          "Return Markdown using this structure:",
          "1. # Title",
          "2. ## Title options",
          "3. ## Summary / lead",
          "4. At least three level-2 sections",
          "5. Insert the cover image placeholder right after the title using writer-asset://cover",
          "6. Insert writer-asset://section-1 and writer-asset://section-2 in the body",
          "7. End with ## Image notes and ## Publishing notes",
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
    outputGuide,
    "",
    "Requirements:",
    "- Output only the final draft. Do not explain the process.",
    "- The content must be in Chinese. Technical terms may stay in English when useful.",
    "- Use the source material for facts, trends, and cases. Do not invent specific data.",
    "- The result must be clean Markdown suitable for continued editing and publishing.",
    "- Include concrete examples and actionable takeaways where the format allows.",
  ].join("\n")
}

function buildWechatArticlePrompt(query: string, research: WriterResearchResult) {
  const references = research.items
    .slice(0, 5)
    .map((item, index) => `${index + 1}. ${item.title}\nURL: ${item.link}\nSummary: ${item.snippet}`)
    .join("\n\n")

  const extracts = research.extracts
    .map((item, index) => `Source ${index + 1}: ${item.url}\n${item.content}`)
    .join("\n\n")

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
    "Return Markdown using exactly this article structure:",
    "1. # Title",
    "2. ![Cover](writer-asset://cover)",
    "3. ## 引言",
    "4. 3-5 个正文二级标题，每个标题下是完整段落内容",
    "5. 在正文中自然插入 ![配图 1](writer-asset://section-1) 和 ![配图 2](writer-asset://section-2)",
    "6. ## 结束语",
    "",
    "Strict rules:",
    "- Do not output '标题备选', 'Title options', 'Publishing notes', 'Image notes', '发布说明', or any explanatory section.",
    "- Do not output more than one H1 title.",
    "- Do not use placeholder labels such as '正文', '小节一', '说明', or '示例格式'.",
    "- The final result must read like a finished WeChat article, not a writing brief.",
    "- Keep the article fully in Chinese.",
    "- Use the source material for facts and examples. Do not invent precise data.",
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

export async function generateWriterDraftWithSkills(query: string, platform: WriterPlatform, mode: WriterMode) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("openrouter_api_key_missing")
  }

  const research = await buildResearchContext(query)
  const systemPrompt = buildSystemPrompt(platform, mode)
  const userPrompt =
    platform === "wechat" && mode === "article"
      ? buildWechatArticlePrompt(query, research)
      : buildUserPrompt(query, mode, research)

  const answer = await generateTextWithOpenRouter(systemPrompt, userPrompt, WRITER_TEXT_MODEL)
  return postProcessWriterDraft(platform, mode, answer)
}
