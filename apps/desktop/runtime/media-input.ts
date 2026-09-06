const TRANSPORT_CONFIG_KEYS = new Set([
  "provider",
  "selectedProviderId",
  "selectedModelId",
  "model",
  "baseUrl",
  "apiKey",
  "endpoint",
  "queryEndpoint",
]);

function firstNonEmptyString(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function firstUrl(value: unknown) {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!Array.isArray(value)) return undefined;
  return value.find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim();
}

function secondUrl(value: unknown) {
  if (!Array.isArray(value)) return undefined;
  return value.slice(1).find((item): item is string => typeof item === "string" && item.trim().length > 0)?.trim();
}

export type MediaAssetReference = {
  readonly url?: string;
  readonly localPath?: string;
  readonly fileName?: string;
  readonly mimeType?: string;
  readonly byteLength?: number;
};

function collectMediaReferences(value: unknown, references: MediaAssetReference[] = []): MediaAssetReference[] {
  if (Array.isArray(value)) {
    for (const item of value) collectMediaReferences(item, references);
    return references;
  }
  if (typeof value === "string" && value.trim()) {
    references.push({ url: value.trim() });
    return references;
  }
  if (!value || typeof value !== "object") return references;
  const record = value as Record<string, unknown>;
  const localPath = typeof record.localPath === "string" && record.localPath.trim() ? record.localPath.trim() : undefined;
  const url = firstNonEmptyString(record.url, record.uri, record.remoteUrl);
  if (localPath || url) references.push({
    ...(url ? { url } : {}),
    ...(localPath ? { localPath } : {}),
    ...(typeof record.fileName === "string" ? { fileName: record.fileName } : {}),
    ...(typeof record.mimeType === "string" ? { mimeType: record.mimeType } : {}),
    ...(typeof record.byteLength === "number" ? { byteLength: record.byteLength } : {}),
  });
  if (!localPath && !url) {
    for (const item of Object.values(record)) collectMediaReferences(item, references);
  }
  return references;
}

function omitLocalPaths(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(omitLocalPaths);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => key !== "localPath")
    .map(([key, item]) => [key, omitLocalPaths(item)]));
}

function uniqueReferences(references: readonly MediaAssetReference[]) {
  const keys = new Set<string>();
  return references.filter((reference) => {
    const key = reference.localPath ?? reference.url ?? `${reference.fileName ?? ""}:${reference.mimeType ?? ""}:${reference.byteLength ?? ""}`;
    if (!key || keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

function urlsFor(value: unknown) {
  return uniqueReferences(collectMediaReferences(value)).flatMap((reference) => reference.url ? [reference.url] : []);
}

function assertMaximum(role: string, references: readonly MediaAssetReference[], maximum: number) {
  if (references.length > maximum) throw new Error(`workflow_media_role_limit:${role}:${maximum}`);
}

/**
 * Keep canvas-facing parameter names independent from the direct provider
 * payload. Provider profiles are transport configuration, not generation
 * inputs, and must never be forwarded to third parties.
 */
export function buildMediaCapabilityInput(executorId: string, config: Record<string, unknown>, inputs: Record<string, unknown>) {
  // A generated upstream artifact may contain both a local cache path and a
  // provider URL. Only path-only references represent user-selected local
  // attachments that still need provider-specific handling.
  const localAttachments = [...new Set(uniqueReferences(collectMediaReferences(inputs)).flatMap((reference) => reference.localPath && !reference.url ? [reference.localPath] : []))];
  const safeConfig = omitLocalPaths(config) as Record<string, unknown>;
  const safeInputs = omitLocalPaths(inputs) as Record<string, unknown>;
  const request = Object.fromEntries(Object.entries({ ...safeConfig, ...safeInputs }).filter(([key]) => !TRANSPORT_CONFIG_KEYS.has(key))) as Record<string, unknown>;
  if (localAttachments.length) request.localAttachments = localAttachments;
  const prompt = firstNonEmptyString(inputs.text, config.prompt, config.script, config.text);
  if (prompt) request.prompt = prompt;

  if (executorId === "image_generate") {
    const referenceInput = inputs.referenceImages ?? inputs.images ?? inputs.image;
    const references = uniqueReferences(collectMediaReferences(referenceInput));
    assertMaximum("image.reference", references, 9);
    const inputImageUrl = firstNonEmptyString(config.inputImageUrl, inputs.inputImageUrl);
    const referenceImageUrls = [...new Set([
      ...urlsFor(referenceInput),
      ...(inputImageUrl ? [inputImageUrl] : []),
    ])];
    delete request.referenceImages;
    delete request.inputImageUrl;
    if (referenceImageUrls.length) request.referenceImageUrls = referenceImageUrls;
    const size = firstNonEmptyString(config.size, config.imageSize);
    const quality = firstNonEmptyString(config.quality, config.imageQuality);
    const background = firstNonEmptyString(config.background, config.imageBackground);
    const outputFormat = firstNonEmptyString(config.output_format, config.imageOutputFormat);
    const moderation = firstNonEmptyString(config.moderation, config.imageModeration);
    const compression = config.output_compression ?? config.imageOutputCompression;
    if (size) request.size = size;
    if (quality) request.quality = quality;
    if (background) request.background = background;
    if (outputFormat) request.output_format = outputFormat;
    if (moderation) request.moderation = moderation;
    // OpenAI-compatible image APIs only accept output_compression for encoded
    // JPEG/WebP output. The workflow node keeps a UI default for those formats,
    // so never let that stale default leak into a PNG request.
    if (typeof compression === "number" && outputFormat !== "png") request.output_compression = compression;
  }

  if (executorId === "video_generate") {
    if (typeof config.sound === "string") request.generateAudio = config.sound === "on";
    if (!firstNonEmptyString(request.resolution)) request.resolution = "720p";
    // Older workflow definitions used images[] for first/last frames. Keep
    // that convention readable while preferring the role-specific ports.
    const legacyImages = Array.isArray(inputs.images) ? inputs.images : undefined;
    const firstFrame = uniqueReferences(collectMediaReferences(legacyImages ? legacyImages.slice(0, 1) : inputs.images ?? inputs.image));
    const lastFrame = uniqueReferences(collectMediaReferences(inputs["image.last_frame"] ?? (legacyImages ? legacyImages.slice(1, 2) : undefined)));
    const referenceImages = uniqueReferences(collectMediaReferences(inputs.referenceImages));
    const sourceVideo = uniqueReferences(collectMediaReferences(inputs.videos ?? inputs.video));
    const referenceVideos = uniqueReferences(collectMediaReferences(inputs.referenceVideos));
    const referenceAudios = uniqueReferences(collectMediaReferences(inputs.referenceAudios));
    assertMaximum("image.first_frame", firstFrame, 1);
    assertMaximum("image.last_frame", lastFrame, 1);
    assertMaximum("image.reference", referenceImages, 9);
    assertMaximum("video.source", sourceVideo, 1);
    assertMaximum("video.reference", referenceVideos, 3);
    assertMaximum("audio.reference", referenceAudios, 3);
    const mode = firstNonEmptyString(config.mode) ?? "auto";
    if (mode === "first-last-frame" && (!firstFrame.length || !lastFrame.length)) throw new Error("workflow_media_role_required:first-last-frame");
    if (mode === "video-edit" && !sourceVideo.length) throw new Error("workflow_media_role_required:video.source");
    const firstFrameUrl = firstNonEmptyString(config.firstFrameUrl, firstFrame[0]?.url, firstUrl(inputs.images), firstUrl(inputs.image));
    const lastFrameUrl = firstNonEmptyString(config.lastFrameUrl, lastFrame[0]?.url, secondUrl(inputs.images));
    if (firstFrameUrl) request.firstFrameUrl = firstFrameUrl;
    if (lastFrameUrl) request.lastFrameUrl = lastFrameUrl;
    const referenceImageUrls = referenceImages.flatMap((reference) => reference.url ? [reference.url] : []);
    const sourceVideoUrl = sourceVideo[0]?.url;
    const referenceVideoUrls = referenceVideos.flatMap((reference) => reference.url ? [reference.url] : []);
    const referenceAudioUrls = referenceAudios.flatMap((reference) => reference.url ? [reference.url] : []);
    if (referenceImageUrls.length) request.referenceImageUrls = referenceImageUrls;
    if (sourceVideoUrl) request.sourceVideoUrl = sourceVideoUrl;
    if (referenceVideoUrls.length) request.referenceVideoUrls = referenceVideoUrls;
    if (referenceAudioUrls.length) request.referenceAudioUrls = referenceAudioUrls;
    const localMediaReferences = {
      firstFrame: firstFrame.filter((reference) => reference.localPath), lastFrame: lastFrame.filter((reference) => reference.localPath), referenceImages: referenceImages.filter((reference) => reference.localPath), sourceVideo: sourceVideo.filter((reference) => reference.localPath), referenceVideos: referenceVideos.filter((reference) => reference.localPath), referenceAudios: referenceAudios.filter((reference) => reference.localPath),
    };
    if (Object.values(localMediaReferences).some((references) => references.length)) request.localMediaReferences = localMediaReferences;
  }

  if (executorId === "digital_human") {
    const imageReferences = uniqueReferences(collectMediaReferences(inputs.images ?? inputs.image));
    const audioReferences = uniqueReferences(collectMediaReferences(inputs.audios ?? inputs.audio));
    const avatarImageUrl = firstNonEmptyString(config.avatarImageUrl, imageReferences[0]?.url);
    const audioUrl = firstNonEmptyString(config.audioUrl, audioReferences[0]?.url);
    if (avatarImageUrl) request.avatarImageUrl = avatarImageUrl;
    if (audioUrl) request.audioUrl = audioUrl;
    const localMediaReferences = {
      images: imageReferences.filter((reference) => reference.localPath),
      audios: audioReferences.filter((reference) => reference.localPath),
    };
    if (Object.values(localMediaReferences).some((references) => references.length)) request.localMediaReferences = localMediaReferences;
  }

  if (executorId === "music_generate") {
    request.kind = "music";
    request.featureId = "ai-music";
    const sourceAudioUrl = firstNonEmptyString(config.sourceAudioUrl, firstUrl(inputs.audios), firstUrl(inputs.audio));
    delete request.sourceAudioUrl;
    if (sourceAudioUrl) request.audio_url = sourceAudioUrl;
  }

  if (executorId === "voice_synthesis" || executorId === "audio_generate") {
    request.kind = firstNonEmptyString(config.kind) ?? "speech";
    const text = firstNonEmptyString(config.text, inputs.text, config.prompt);
    if (text) request.text = text;
    request.language_boost = firstNonEmptyString(config.languageBoost) ?? "auto";
    request.voice_setting = {
      voice_id: firstNonEmptyString(config.voiceId) ?? "English_Trustworth_Man",
      speed: Number(config.speed ?? 1),
      vol: Number(config.volume ?? 1),
      pitch: Number(config.pitch ?? 0),
    };
    request.audio_setting = { audio_sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 };
  }

  return request;
}
