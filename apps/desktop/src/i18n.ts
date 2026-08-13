export type DesktopLocale = "zh" | "en";
export type DesktopLocalePreference = "auto" | DesktopLocale;

/** Resolve the UI locale from the user's explicit preference or Windows/WebView language. */
export function detectDesktopLocale(systemLanguage?: string): DesktopLocale {
  const language = systemLanguage ?? (typeof navigator === "undefined" ? "" : navigator.language);
  return /^zh(?:-|$)/iu.test(language) ? "zh" : "en";
}

export function resolveDesktopLocale(preference: DesktopLocalePreference, systemLanguage?: string): DesktopLocale {
  return preference === "auto" ? detectDesktopLocale(systemLanguage) : preference;
}

export const desktopCopy = {
  zh: {
    localWorkspace: "",
    runtimeReady: "运行环境已就绪",
    modelSettings: "模型与工作区设置",
    welcome: "欢迎回来，伙伴",
    welcomeSubtitle: "你的营销工作台已准备好。今天想创建什么？",
    homePlaceholder: "输入你的问题...",
    send: "发送",
    stop: "停止",
    language: "界面语言",
    languageAuto: "跟随系统",
    languageZh: "中文",
    languageEn: "English",
  },
  en: {
    localWorkspace: "",
    runtimeReady: "Runtime ready",
    modelSettings: "Model & workspace settings",
    // The cloud home uses the same fallback display name when no account is
    // present; keep the local account-free adapter text identical.
    welcome: "Welcome back, there",
    welcomeSubtitle: "Your marketing workspace is ready. What would you like to create today?",
    homePlaceholder: "Ask anything...",
    send: "Send",
    stop: "Stop",
    language: "Interface language",
    languageAuto: "System",
    languageZh: "中文",
    languageEn: "English",
  },
} as const;

export const desktopQuickPrompts = {
  zh: ["帮我拆解这个问题，直接给出结论、步骤和交付物。", "把下面的信息整理成结构化方案，优先输出可执行动作。", "基于这段背景，给我一版清晰、专业、可直接使用的回复。"],
  en: ["Break this down and give me conclusions, steps, and deliverables directly.", "Turn the context below into a structured plan with execution-ready actions.", "Based on this background, draft a clear professional response I can use right away."],
} as const;

/** Keep retained Agent-entry prompts aligned with the cloud AI-entry catalog. */
export const desktopAgentQuickPrompts: Record<string, { zh: readonly string[]; en: readonly string[] }> = {
  "executive-brand": {
    zh: ["基于这段业务介绍，重写品牌定位、价值主张和一句话口号。", "帮我梳理品牌叙事结构，并给出首页最该强调的核心表达。", "分析竞品后，给出品牌差异化策略和传播重点。"],
    en: ["Based on this business intro, rewrite the positioning, value proposition, and one-line slogan.", "Structure the brand narrative and tell me what the homepage should emphasize most.", "Review the competitors and give me a differentiation strategy with communication priorities."],
  },
  "executive-growth": {
    zh: ["分析当前增长瓶颈，给我未来 30 天实验排期和优先级。", "基于这个渠道数据，输出漏斗诊断、关键假设和第一批动作。", "给我一套获客、转化、留存联动的增长计划，直接列执行节奏。"],
    en: ["Analyze the current growth bottleneck and give me a prioritized 30-day experiment plan.", "Based on this channel data, produce a funnel diagnosis, key hypotheses, and the first actions.", "Create an acquisition, conversion, and retention plan with a concrete execution cadence."],
  },
  "executive-ppt": {
    zh: ["根据这份 brief，生成一套可编辑 PPT 的目录、页稿和设计要求。", "把这段方案整理成适合汇报的可编辑 PPT 结构，并补齐每页要点。", "基于目标受众和场景，输出可编辑 PPT 的完整制作指令。"],
    en: ["Turn this brief into an editable PPT outline, page copy, and design requirements.", "Restructure this proposal into an editable presentation deck and fill in the key points for each page.", "Based on the audience and use case, generate a complete editable PPT production brief."],
  },
  "executive-presentation-ppt": {
    zh: ["围绕这个主题通过 Dashi 多轮生成一套演讲型 PPT，大纲要有起承转合。", "把这份材料改写成适合路演的演讲型展示稿，突出叙事节奏。", "为 10 分钟现场分享设计一套有节奏的演示结构和讲述重点。"],
    en: ["Use the Dashi presentation skill to build a presentation-first deck around this topic with a clear narrative arc.", "Rewrite this material into a pitch-style presentation deck with stronger storytelling flow.", "Design a paced presentation structure for a 10-minute live talk, including speaking beats."],
  },
};

export function quickPromptsForDesktopRoute(path: string, locale: DesktopLocale) {
  const query = path.includes("?") ? new URLSearchParams(path.slice(path.indexOf("?") + 1)) : null;
  const agentId = query?.get("agent");
  const prompts = agentId ? desktopAgentQuickPrompts[agentId]?.[locale] : undefined;
  return prompts ? [...prompts] : [...desktopQuickPrompts[locale]];
}

export const workflowActionEnglish: Record<string, string> = {
  upload: "Upload asset", text_input: "Text input", file_create: "Local file", writer: "Content writing", llm_generate: "Model generation", agent_execute: "Agent execution", ppt_generate: "PPT (ppt-master)", image_generate: "Image generation", video_generate: "Video generation", digital_human: "Digital human", music_generate: "Music generation", voice_synthesis: "Voice synthesis", voice_clone: "Voice cloning", audio_generate: "General audio", knowledge_retrieve: "Obsidian retrieval", knowledge_write: "Write to Obsidian", product_store: "Asset store", foreach: "Process each", collect: "Collect results", output: "Workflow output",
};

export const mediaEnglish: Record<string, string> = {
  "ai-music": "AI music", "audio-generate": "General audio", "voice-clone": "Voice cloning", "voice-synthesis": "Voice synthesis", "text-to-video": "Text to video", "image-to-video": "Image to video", "reference-to-video": "Reference to video", "video-edit": "Video editing", "digital-human": "Digital human", "video-enhance": "Video enhancement",
};

export const mediaSummaryEnglish: Record<string, string> = {
  "ai-music": "Create songs and soundtracks with manual or AI-generated lyrics.", "audio-generate": "Generate ambience, sound effects, and other general audio.", "voice-clone": "Use reference audio to clone a voice and create a preview.", "voice-synthesis": "Submit long text for asynchronous speech generation and download the audio.", "text-to-video": "Enter a prompt to generate a video.", "image-to-video": "Choose a first-frame image and generate a video.", "reference-to-video": "Use one or more reference images to preserve subject identity.", "video-edit": "Upload a video and apply text-directed edits.", "digital-human": "Use audio and an avatar image, or drive the avatar with TTS copy.", "video-enhance": "Repair and upscale a source video.",
};
export const mediaSubmitEnglish: Record<string, string> = { "ai-music": "Generate audio", "audio-generate": "Generate audio", "voice-clone": "Clone voice", "voice-synthesis": "Synthesize speech", "text-to-video": "Generate video", "image-to-video": "Generate video", "reference-to-video": "Generate video", "video-edit": "Edit video", "digital-human": "Generate avatar video", "video-enhance": "Start enhancement" };
export const mediaFieldEnglish: Record<string, string> = {
  "风格 / 情绪 / 场景": "Style / mood / scene", "歌词来源": "Lyrics source", "歌词": "Lyrics", "AI 写词提示": "AI lyric prompt", "音频提示词": "Audio prompt", "时长（秒）": "Duration (seconds)", "格式": "Format", "新音色 ID": "New voice ID", "试听文本": "Preview text", "示例音频文本": "Sample audio text", "降噪": "Noise reduction", "文本内容": "Text content", "音色": "Voice", "模型": "Model", "语言增强": "Language boost", "语速": "Speed", "音量": "Volume", "音高": "Pitch", "视频提示词": "Video prompt", "首帧图片": "First-frame image", "动作提示": "Motion prompt", "参考图片": "Reference images", "场景提示": "Scene prompt", "源视频": "Source video", "编辑指令": "Edit instruction", "音频": "Audio", "人物图片": "Avatar image", "口播文案": "Spoken copy", "增强目标": "Enhancement target", "处理时长上限（秒）": "Maximum duration (seconds)", Seed: "Seed",
};
export const mediaOptionEnglish: Record<string, string> = { "手动填写": "Enter manually", "AI 自动生成": "Generate with AI", "关闭": "Off", "开启": "On", "自动": "Auto", "中文": "Chinese", "英文": "English", 标准: "Standard", 高清: "HD", "横版 · 1536×1024": "Landscape · 1536×1024", "竖版 · 1024×1536": "Portrait · 1024×1536" };

export const writerPlatformEnglish: Record<string, string> = {
  wechat: "WeChat Official Account", xiaohongshu: "Xiaohongshu", weibo: "Weibo", douyin: "Douyin", x: "X", linkedin: "LinkedIn", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", reddit: "Reddit", generic: "General content",
};

export const writerContentTypeEnglish: Record<string, string> = {
  social_cn: "Chinese social", social_global: "Global social", longform: "Long-form", email: "Email", newsletter: "Newsletter", website_copy: "Website copy", ads: "Ad copy", case_study: "Case study", product: "Product content", speech: "Speech",
};

export const writerModeEnglish: Record<string, string> = { article: "Article", thread: "Thread" };

export const writerLanguageEnglish: Record<string, string> = { auto: "Auto-detect", zh: "Chinese", en: "English", ja: "Japanese", ko: "Korean", fr: "French", de: "German", es: "Spanish" };

export const capabilityEnglish: Record<string, { title: string; description: string }> = {
  writer: { title: "Content writing", description: "Generate, rewrite, and organize marketing content with the local OpenCode Writer Skill." },
  ppt_generate: { title: "AI PPT", description: "Generate editable PPTX files in the project directory with OpenCode + ppt-master." },
  image_generate: { title: "AI image", description: "Use the configured image Provider and register generated images locally." },
  video_generate: { title: "AI video", description: "Run video Providers and keep asynchronous tasks and files on this machine." },
  digital_human: { title: "Digital human", description: "Generate local video results with the digital-human media capability." },
  music_generate: { title: "AI music", description: "Generate music and manage audio files in the local artifact library." },
  voice_synthesis: { title: "Voice synthesis", description: "Convert text to speech and write the output directly to the project." },
  voice_clone: { title: "Voice cloning", description: "Create a reusable MiniMax voice from a provider-uploaded reference file and optional preview text." },
  audio_generate: { title: "General audio", description: "Generate general audio content with a configured Provider." },
  knowledge_retrieve: { title: "Obsidian knowledge", description: "Search local Vault indexes and open the cited source note." },
  knowledge_write: { title: "Write to Obsidian", description: "Write Agent output to the configured Vault while preserving the local index." },
};
