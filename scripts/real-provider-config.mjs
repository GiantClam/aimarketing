const REQUIRED_SMOKE_ENTRIES = ["llm", "image"];

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value) {
  return typeof value === "string" && value.trim().length > 0;
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
  return false;
}

export const REAL_PROVIDER_SMOKE_SCOPE = Object.freeze({ executed: ["llm", "image"], excluded: ["video"] });
