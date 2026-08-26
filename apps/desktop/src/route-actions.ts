const MEDIA_FEATURE_ACTIONS: Readonly<Record<string, string>> = {
  "ai-music": "music_generate",
  "audio-generate": "audio_generate",
  "voice-clone": "voice_clone",
  "voice-synthesis": "voice_synthesis",
  "text-to-video": "video_generate",
  "image-to-video": "video_generate",
  "reference-to-video": "video_generate",
  "video-edit": "video_generate",
  "digital-human": "digital_human",
  "video-enhance": "video_generate",
};

export function workflowActionForMediaFeature(featureId?: string | null): string | null {
  return featureId ? MEDIA_FEATURE_ACTIONS[featureId] ?? null : null;
}

/**
 * Resolve the capability that a desktop run must execute.
 *
 * The video route and the capability center are shared catalogs for media
 * features. The selected feature is authoritative; using the route-level or
 * stale text action would silently execute the wrong Provider.
 */
export function resolveDesktopRunAction(path: string, routeAction: string | null, selectedAction: string, mediaFeatureId?: string | null): string {
  const mediaAction = workflowActionForMediaFeature(mediaFeatureId);
  if (mediaAction) return mediaAction;
  if (path === "/dashboard/video") return selectedAction;
  if (path === "/dashboard" || path.startsWith("/dashboard/ai")) return "llm_generate";
  return routeAction ?? selectedAction;
}
