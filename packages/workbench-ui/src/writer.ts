export const WORKBENCH_WRITER_PLATFORMS = [
  { id: "wechat", label: "公众号" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "weibo", label: "微博" },
  { id: "douyin", label: "抖音" },
  { id: "x", label: "X" },
  { id: "linkedin", label: "LinkedIn" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "facebook", label: "Facebook" },
  { id: "reddit", label: "Reddit" },
  { id: "generic", label: "通用内容" },
] as const;

export const WORKBENCH_WRITER_CONTENT_TYPES = [
  { id: "social_cn", label: "中文社媒" },
  { id: "social_global", label: "海外社媒" },
  { id: "longform", label: "长文" },
  { id: "email", label: "邮件" },
  { id: "newsletter", label: "Newsletter" },
  { id: "website_copy", label: "网站文案" },
  { id: "ads", label: "广告文案" },
  { id: "case_study", label: "案例研究" },
  { id: "product", label: "产品内容" },
  { id: "speech", label: "演讲稿" },
] as const;

export const WORKBENCH_WRITER_MODES = [
  { id: "article", label: "文章" },
  { id: "thread", label: "串文" },
] as const;

export const WORKBENCH_WRITER_LANGUAGES = [
  { id: "auto", label: "自动识别" },
  { id: "zh", label: "中文" },
  { id: "en", label: "English" },
  { id: "ja", label: "日本語" },
  { id: "ko", label: "한국어" },
  { id: "fr", label: "Français" },
  { id: "de", label: "Deutsch" },
  { id: "es", label: "Español" },
] as const;

export const WORKBENCH_WRITER_QUICK_PROMPTS = [
  "帮我为 AI 营销 Agent 产品写一篇公众号文章，突出企业协作、专家能力和多线程工作台。",
  "请围绕 AI 营销工作台写一条适合小红书发布的种草内容，强调品牌增长和执行效率。",
  "为面向海外市场的 AI 产品生成一组 X / Facebook 宣传文案，包含 hook、主体卖点与 CTA。",
] as const;

/** The landing cards used by the online AI-entry workspace and the Tauri chat surface. */
export const WORKBENCH_CHAT_QUICK_PROMPTS = [
  "帮我拆解这个问题，直接给出结论、步骤和交付物。",
  "把下面的信息整理成结构化方案，优先输出可执行动作。",
  "基于这段背景，给我一版清晰、专业、可直接使用的回复。",
] as const;
