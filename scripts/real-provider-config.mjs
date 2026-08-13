const REQUIRED_SMOKE_ENTRIES = ["llm", "image"];
const CAPABILITY_DEFAULTS = new Set(["text", "image", "video", "audio"]);

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
  return false;
}

export const REAL_PROVIDER_SMOKE_SCOPE = Object.freeze({ executed: ["llm", "image", "audio"], excluded: ["video", "seedance"] });
