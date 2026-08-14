const REQUIRED_SMOKE_ENTRIES = ["llm", "image"];
const CAPABILITY_DEFAULTS = new Set(["text", "image", "video", "audio"]);
const VIDEO_PROVIDER_SOURCES = new Set(["bailian", "dashscope", "minimax", "runninghub"]);

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validateProviderProfile(profileId, profile) {
  const errors = [];
  const prefix = `provider_${profileId}`;
  if (!isRecord(profile)) return [`${prefix}_entry_invalid`];
  for (const field of ["id", "model", "baseUrl", "apiKey"]) {
    if (!requiredString(profile[field])) errors.push(`${prefix}_${field}_missing`);
  }
  if (!requiredString(profile.source) && !requiredString(profile.provider)) errors.push(`${prefix}_source_missing`);
  if (requiredString(profile.id) && profile.id.trim() !== profileId) errors.push(`${prefix}_id_mismatch`);
  if (requiredString(profile.baseUrl)) {
    try {
      const url = new URL(profile.baseUrl);
      if (url.protocol !== "https:" && url.protocol !== "http:") errors.push(`${prefix}_baseUrl_protocol_invalid`);
    } catch { errors.push(`${prefix}_baseUrl_invalid`); }
  }
  return errors;
}

export function validateRealProviderConfig(value) {
  const errors = [];
  if (!isRecord(value)) return ["config_not_object"];
  for (const label of REQUIRED_SMOKE_ENTRIES) {
    const entry = value[label];
    if (!isRecord(entry)) {
      errors.push(`${label}_entry_missing`);
      continue;
    }
    for (const field of ["provider", "baseUrl", "apiKey", "model"]) {
      if (!requiredString(entry[field])) errors.push(`${label}_${field}_missing`);
    }
    if (requiredString(entry.baseUrl)) {
      try {
        const url = new URL(entry.baseUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") errors.push(`${label}_baseUrl_protocol_invalid`);
      } catch { errors.push(`${label}_baseUrl_invalid`); }
    }
  }
  if (value.providers !== undefined) {
    if (!isRecord(value.providers)) errors.push("providers_not_object");
    else {
      for (const [profileId, profile] of Object.entries(value.providers)) {
        if (!requiredString(profileId)) errors.push("provider_id_missing");
        else errors.push(...validateProviderProfile(profileId, profile));
      }
    }
  }
  if (value.defaults !== undefined) {
    if (!isRecord(value.defaults)) errors.push("defaults_not_object");
    else {
      for (const [capability, profileId] of Object.entries(value.defaults)) {
        if (!CAPABILITY_DEFAULTS.has(capability)) {
          errors.push(`default_${capability}_unsupported`);
          continue;
        }
        if (!requiredString(profileId)) {
          errors.push(`default_${capability}_missing`);
          continue;
        }
        if (!isRecord(value.providers) || !isRecord(value.providers[profileId])) errors.push(`default_${capability}_unknown_provider`);
      }
    }
  }
  return errors;
}

export function assertRealProviderConfig(value) {
  const errors = validateRealProviderConfig(value);
  if (errors.length) throw new Error(`real_provider_config_invalid:${errors.join(",")}`);
  return value;
}

export function hasExpectedSmokeResponse(label, response) {
  if (!isRecord(response)) return false;
  if (label === "llm") return Array.isArray(response.choices) && isRecord(response.usage) && requiredString(response.model);
  if (label === "image") return Array.isArray(response.data) && response.data.length > 0;
  if (label === "audio") {
    const statusCode = response.base_resp && typeof response.base_resp === "object" ? response.base_resp.status_code : undefined;
    return (requiredString(String(response.task_id ?? "")) && statusCode === 0 && ["Success", "Succeeded"].includes(String(response.status ?? ""))) || (isRecord(response.data) && requiredString(String(response.data.audio ?? "")));
  }
  if (label === "video") {
    const nestedData = isRecord(response.data) ? response.data : undefined;
    const output = isRecord(response.output) ? response.output : undefined;
    const status = String(response.status ?? response.taskStatus ?? nestedData?.status ?? nestedData?.taskStatus ?? output?.status ?? output?.taskStatus ?? output?.task_status ?? "").toLowerCase();
    const successfulStatus = ["success", "succeeded", "completed", "done"].includes(status);
    const directUrl = requiredString(response.url) || requiredString(response.video_url) || requiredString(response.videoUrl);
    const outputResult = output && (requiredString(output.url) || requiredString(output.video_url) || requiredString(output.videoUrl));
    const results = Array.isArray(response.results) && response.results.some((item) => isRecord(item) && (requiredString(item.url) || requiredString(item.video_url) || requiredString(item.videoUrl)));
    const nestedResults = isRecord(response.data) && Array.isArray(response.data.results) && response.data.results.some((item) => isRecord(item) && (requiredString(item.url) || requiredString(item.video_url) || requiredString(item.videoUrl)));
    return successfulStatus && (directUrl || outputResult || results || nestedResults);
  }
  return false;
}

export const REAL_PROVIDER_SMOKE_SCOPE = Object.freeze({ executed: ["llm", "image", "audio"], excluded: ["video", "seedance"] });

function profileContainsSeedance(profile) {
  if (!isRecord(profile)) return false;
  return [profile.model, profile.source, profile.provider, profile.endpoint, profile.queryEndpoint]
    .filter((value) => typeof value === "string")
    .some((value) => /seedance|sparkvideo/iu.test(value));
}

function profileDeclaresVideoCapability(profile) {
  if (!isRecord(profile)) return false;
  const capabilities = Array.isArray(profile.capabilities)
    ? profile.capabilities
    : typeof profile.capabilities === "string"
      ? profile.capabilities.split(/[,\s]+/u)
      : [];
  if (capabilities.some((value) => String(value).trim().toLowerCase() === "video")) return true;
  const identity = [profile.model, profile.endpoint, profile.queryEndpoint]
    .filter((value) => typeof value === "string")
    .join(" ")
    .toLowerCase();
  return /video|hailuo|wanx/iu.test(identity);
}

/**
 * Resolve a configured video profile that is safe to exercise in the real
 * provider smoke. Seedance is intentionally excluded by acceptance scope;
 * callers can fail closed when no other configured video profile exists.
 */
export function resolveNonSeedanceVideoProfile(config) {
  if (!isRecord(config) || !isRecord(config.providers)) return undefined;
  const preferredId = isRecord(config.defaults) && requiredString(config.defaults.video) ? config.defaults.video : undefined;
  const ordered = [
    ...(preferredId && config.providers[preferredId] ? [[preferredId, config.providers[preferredId]]] : []),
    ...Object.entries(config.providers).filter(([id]) => id !== preferredId),
  ];
  for (const [id, profile] of ordered) {
    if (!isRecord(profile) || profileContainsSeedance(profile)) continue;
    const source = String(profile.source ?? profile.provider ?? "").trim().toLowerCase();
    if (!VIDEO_PROVIDER_SOURCES.has(source)) continue;
    if (!profileDeclaresVideoCapability(profile)) continue;
    if (!requiredString(profile.baseUrl) || !requiredString(profile.apiKey) || !requiredString(profile.model)) continue;
    return { id, profile };
  }
  return undefined;
}

export function buildRealProviderSmokeScope({ includeVideo = false } = {}) {
  return Object.freeze({
    executed: Object.freeze(includeVideo ? ["llm", "image", "audio", "video"] : ["llm", "image", "audio"]),
    excluded: Object.freeze(["seedance"]),
  });
}
