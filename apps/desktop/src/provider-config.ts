export type DesktopProviderConfig = {
  readonly id?: string;
  readonly source?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly models?: readonly string[];
  readonly apiKey?: string;
  readonly reasoningEffort?: string;
  readonly skillId?: string;
  readonly endpoint?: string;
  readonly queryEndpoint?: string;
  readonly capabilities?: readonly ProviderCapability[];
};

export type ProviderCapability = "text" | "image" | "video" | "audio";
export type DesktopProviderProfiles = Readonly<Record<string, DesktopProviderConfig>>;
export type DesktopProviderDefaults = Partial<Record<ProviderCapability, string>>;

type ProviderConfigContainer = {
  readonly provider: DesktopProviderConfig;
  readonly providers?: DesktopProviderProfiles;
  readonly defaults?: DesktopProviderDefaults;
};

export type ResolvedDesktopProviderConfig = DesktopProviderConfig & { readonly id: string; readonly model: string };

/** Keep configured provider models canonical across every desktop surface. */
export function configuredModelOptions(provider: DesktopProviderConfig): string[] {
  return [...new Set((provider.models ?? []).map((model) => model.trim()).filter(Boolean))];
}

export function modelOptionsForProvider(config: ProviderConfigContainer, provider: DesktopProviderConfig): readonly string[] | undefined {
  if (provider.models !== undefined) return configuredModelOptions(provider);
  const providerId = provider.id?.trim();
  const fallbackId = config.provider.id?.trim();
  return provider === config.provider || (providerId && fallbackId && providerId === fallbackId)
    ? configuredModelOptions(config.provider)
    : undefined;
}

export function preferredConfiguredModel(provider: DesktopProviderConfig): string {
  const models = configuredModelOptions(provider);
  const selected = provider.model?.trim() ?? "";
  return models.includes(selected) ? selected : (models[0] ?? selected);
}

export function providerForId(config: ProviderConfigContainer, providerId?: string | null): ResolvedDesktopProviderConfig {
  const id = providerId?.trim() ?? "";
  const selected = (id && config.providers?.[id]) || config.provider;
  const resolvedId = selected.id?.trim() || id || config.provider.id?.trim() || "local";
  const resolvedModel = preferredConfiguredModel(selected);
  if (selected.id === resolvedId && selected.model === resolvedModel) return selected as ResolvedDesktopProviderConfig;
  return {
    ...selected,
    id: resolvedId,
    model: resolvedModel,
  };
}

export function providerForCapability(config: ProviderConfigContainer, capability: ProviderCapability): ResolvedDesktopProviderConfig {
  const selectedId = config.defaults?.[capability];
  const selected = selectedId ? config.providers?.[selectedId] : undefined;
  if (selected && !supportsProviderCapability(selected, capability)) {
    const compatible = Object.entries(config.providers ?? {}).find(([id, provider]) => id !== selectedId && supportsProviderCapability(provider, capability));
    if (compatible) return providerForId(config, compatible[0]);
  }
  return providerForId(config, selectedId);
}

export function capabilityForWorkflowAction(action: string): ProviderCapability {
  if (action === "image_generate") return "image";
  if (["video_generate", "digital_human"].includes(action)) return "video";
  if (["music_generate", "voice_synthesis", "voice_clone", "audio_generate"].includes(action)) return "audio";
  return "text";
}

/**
 * Keep the settings capability defaults aligned with the runtime adapter
 * boundary. Explicit capabilities win; older profiles are inferred from
 * their source/model identity and unknown profiles remain selectable for
 * backwards compatibility.
 */
export function supportsProviderCapability(provider: DesktopProviderConfig, capability: ProviderCapability) {
  const explicit = Array.isArray(provider.capabilities)
    ? provider.capabilities.map((value) => String(value).trim().toLowerCase()).filter(Boolean)
    : [];
  if (explicit.length) return explicit.includes(capability);
  const source = (provider.source ?? provider.id ?? "").trim().toLowerCase();
  const identity = [provider.id, provider.model, provider.endpoint, provider.queryEndpoint]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  if (/image|vision|text2image|images/iu.test(identity)) return capability === "image";
  if (/video|hailuo|seedance|wanx|digital[-_ ]?human/iu.test(identity)) return capability === "video";
  if (/audio|speech|music|voice|tts/iu.test(identity)) return capability === "audio";
  if (/text|chat|llm|language|gpt|deepseek|qwen|claude/iu.test(identity)) return capability === "text";
  if (source === "runninghub") return capability === "video";
  if (source === "minimax") return capability === "audio";
  if (source === "bailian" || source === "dashscope") return capability === "image";
  if (["openai", "openai-compatible", "pptoken", "deepseek", "openrouter"].includes(source)) return capability === "text";
  return true;
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
