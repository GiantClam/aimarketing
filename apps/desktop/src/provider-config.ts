export type DesktopProviderConfig = {
  readonly id?: string;
  readonly source?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly models?: readonly string[];
};

/** Keep configured provider models canonical across every desktop surface. */
export function configuredModelOptions(provider: DesktopProviderConfig): string[] {
  return [...new Set((provider.models ?? []).map((model) => model.trim()).filter(Boolean))];
}

export function preferredConfiguredModel(provider: DesktopProviderConfig): string {
  const models = configuredModelOptions(provider);
  const selected = provider.model?.trim() ?? "";
  return models.includes(selected) ? selected : (models[0] ?? selected);
}

/**
 * Media needs a configured HTTP endpoint, but the default local text model is
 * intentionally not treated as a media provider. The settings UI keeps the
 * stable `local` id when a user switches the source to an OpenAI-compatible
 * endpoint, so source is the authoritative signal here.
 */
export function isMediaProviderConfigured(provider: DesktopProviderConfig) {
  if (!provider.baseUrl?.trim()) return false;
  const source = (provider.source ?? provider.id ?? "").trim().toLowerCase();
  return source !== "" && source !== "local";
}

const mediaWorkflowActions = new Set([
  "image_generate",
  "video_generate",
  "digital_human",
  "music_generate",
  "voice_synthesis",
  "voice_clone",
  "audio_generate",
]);

export function requiresConfiguredProviderForWorkflowAction(action: string): boolean {
  return mediaWorkflowActions.has(action);
}
