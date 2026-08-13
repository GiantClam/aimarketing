export type WorkbenchMediaFeatureId =
  | "ai-music"
  | "audio-generate"
  | "voice-clone"
  | "voice-synthesis"
  | "text-to-video"
  | "image-to-video"
  | "reference-to-video"
  | "video-edit"
  | "digital-human"
  | "video-enhance";

export type WorkbenchMediaField = {
  id: string;
  label: string;
  type: "text" | "url" | "textarea" | "number" | "select";
  placeholder?: string;
  defaultValue?: string;
  options?: Array<{ value: string; label: string }>;
};

export type WorkbenchMediaFeature = {
  id: WorkbenchMediaFeatureId;
  group: "audio" | "video";
  title: string;
  summary: string;
  submitLabel: string;
  fields: WorkbenchMediaField[];
};

/** Shared feature/field contract for the cloud media workspace and Tauri adapter. */
export const WORKBENCH_MEDIA_FEATURES: readonly WorkbenchMediaFeature[] = [
  { id: "ai-music", group: "audio", title: "AI音乐", summary: "生成歌曲与配乐，支持手填歌词或 AI 自动写词。", submitLabel: "生成音频", fields: [
    { id: "stylePrompt", label: "风格 / 情绪 / 场景", type: "textarea", placeholder: "例如：独立电子流行，适合 AI 产品发布片头。" },
    { id: "lyricsSource", label: "歌词来源", type: "select", defaultValue: "manual", options: [{ value: "manual", label: "手动填写" }, { value: "ai_generate", label: "AI 自动生成" }] },
    { id: "lyrics", label: "歌词", type: "textarea", placeholder: "手动填写歌词，或在结果区回显 AI 生成歌词。" },
    { id: "lyricsPrompt", label: "AI 写词提示", type: "textarea", placeholder: "例如：写一首关于新品牌发布夜的中文流行歌。" },
  ] },
  { id: "audio-generate", group: "audio", title: "通用音频", summary: "生成环境音、音效和其他通用音频内容。", submitLabel: "生成音频", fields: [
    { id: "prompt", label: "音频提示词", type: "textarea", placeholder: "例如：生成一段适合科技产品发布会转场的短音效。" },
    { id: "duration", label: "时长（秒）", type: "number", defaultValue: "8" },
    { id: "format", label: "格式", type: "select", defaultValue: "mp3", options: [{ value: "mp3", label: "MP3" }, { value: "wav", label: "WAV" }] },
  ] },
  { id: "voice-clone", group: "audio", title: "声音克隆", summary: "上传或录制参考音频，复刻音色并生成试听结果。", submitLabel: "复刻音色", fields: [
    { id: "voiceId", label: "新音色 ID", type: "text", placeholder: "留空则自动生成，例如 voice_brand_host" },
    { id: "previewText", label: "试听文本", type: "textarea", placeholder: "例如：欢迎来到 AI Marketing 新品发布会。" },
    { id: "promptText", label: "示例音频文本", type: "text", placeholder: "上传示例音频时可填写。" },
    { id: "needNoiseReduction", label: "降噪", type: "select", defaultValue: "false", options: [{ value: "false", label: "关闭" }, { value: "true", label: "开启" }] },
  ] },
  { id: "voice-synthesis", group: "audio", title: "声音合成", summary: "把长文本提交为异步语音任务，查询状态后下载音频。", submitLabel: "合成语音", fields: [
    { id: "prompt", label: "文本内容", type: "textarea", placeholder: "输入需要合成的完整文本" },
    { id: "voiceId", label: "音色", type: "text", placeholder: "从可用音色库选择" },
    { id: "model", label: "模型", type: "select", defaultValue: "speech-2.8-hd", options: [{ value: "speech-2.8-hd", label: "Speech 2.8 HD" }, { value: "speech-2.8-turbo", label: "Speech 2.8 Turbo" }] },
    { id: "languageBoost", label: "语言增强", type: "select", defaultValue: "auto", options: [{ value: "auto", label: "自动" }, { value: "Chinese", label: "中文" }, { value: "English", label: "英文" }] },
    { id: "speed", label: "语速", type: "number", defaultValue: "1" }, { id: "volume", label: "音量", type: "number", defaultValue: "1" }, { id: "pitch", label: "音高", type: "number", defaultValue: "1" },
  ] },
  { id: "text-to-video", group: "video", title: "文生视频", summary: "直接输入提示词生成视频。", submitLabel: "生成视频", fields: [{ id: "model", label: "模型", type: "select", defaultValue: "minimax/video-01", options: [{ value: "minimax/video-01", label: "MiniMax Hailuo" }, { value: "bailian/video", label: "Aliyun Bailian" }] }, { id: "prompt", label: "视频提示词", type: "textarea", placeholder: "描述镜头、人物动作、风格和时长" }] },
  { id: "image-to-video", group: "video", title: "图生视频", summary: "上传或选择首帧图片生成视频。", submitLabel: "生成视频", fields: [{ id: "model", label: "模型", type: "select", defaultValue: "minimax/video-01-live", options: [{ value: "minimax/video-01-live", label: "MiniMax Hailuo Image-to-Video" }] }, { id: "firstFrameUrl", label: "首帧图片", type: "url", placeholder: "粘贴本地素材相对路径或 URL" }, { id: "prompt", label: "动作提示", type: "textarea", placeholder: "描述图片中的主体如何运动" }] },
  { id: "reference-to-video", group: "video", title: "参考生视频", summary: "使用一至多张参考图保持主体特征。", submitLabel: "生成视频", fields: [{ id: "model", label: "模型", type: "select", defaultValue: "minimax/video-01-live", options: [{ value: "minimax/video-01-live", label: "MiniMax Hailuo Reference" }] }, { id: "referenceImageUrls", label: "参考图片", type: "url", placeholder: "粘贴本地素材路径，多个路径用逗号分隔" }, { id: "prompt", label: "场景提示", type: "textarea", placeholder: "描述参考主体在镜头中的动作" }] },
  { id: "video-edit", group: "video", title: "视频编辑", summary: "上传视频并用文字指令完成风格转换或元素替换。", submitLabel: "编辑视频", fields: [{ id: "model", label: "模型", type: "select", defaultValue: "minimax/video-edit", options: [{ value: "minimax/video-edit", label: "MiniMax Video Edit" }] }, { id: "sourceVideoUrl", label: "源视频", type: "url", placeholder: "粘贴本地视频路径或 URL" }, { id: "prompt", label: "编辑指令", type: "textarea", placeholder: "例如：把背景替换为夜景城市" }] },
  { id: "digital-human", group: "video", title: "口播数字人", summary: "上传音频和人物图，或只填文案走 TTS 驱动。", submitLabel: "生成口播视频", fields: [{ id: "audioUrl", label: "音频", type: "url", placeholder: "选择本地音频产物或粘贴路径" }, { id: "avatarImageUrl", label: "人物图片", type: "url", placeholder: "选择本地人物图片或粘贴路径" }, { id: "script", label: "口播文案", type: "textarea", placeholder: "未上传音频时，这段文案会走 TTS 合成。" }, { id: "prompt", label: "场景提示", type: "textarea", placeholder: "例如：模特正在做产品展示" }, { id: "seed", label: "Seed", type: "number", defaultValue: "-1" }] },
  { id: "video-enhance", group: "video", title: "视频高清化", summary: "上传源视频，执行视频修复和高清化。", submitLabel: "开始高清化", fields: [{ id: "sourceVideoUrl", label: "源视频", type: "url", placeholder: "选择本地视频产物或粘贴路径" }, { id: "prompt", label: "增强目标", type: "textarea", placeholder: "例如：提升细节、修复压缩模糊" }, { id: "durationLimit", label: "处理时长上限（秒）", type: "number", defaultValue: "10" }, { id: "seed", label: "Seed", type: "number", defaultValue: "-1" }] },
] as const;
