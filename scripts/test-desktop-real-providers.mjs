import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRealProviderConfig, hasExpectedSmokeResponse, REAL_PROVIDER_SMOKE_SCOPE } from "./real-provider-config.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(process.env.AIMARKETING_REAL_PROVIDER_CONFIG ?? resolve(repoRoot, "apps/desktop/real-providers.test.local.json"));
const config = assertRealProviderConfig(JSON.parse(await readFile(configPath, "utf8")));

function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/u, "")}/${String(path).replace(/^\/+/, "")}`;
}

async function request(label, url, apiKey, body) {
  const retries = Math.max(0, Number(process.env.AIMARKETING_PROVIDER_RETRIES ?? 2));
  const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  let lastResult;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(Number(process.env.AIMARKETING_PROVIDER_TIMEOUT_MS ?? 120000)),
      });
      const text = await response.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = undefined; }
      lastResult = { label, status: response.status, ok: response.ok, attempt: attempt + 1, ...(parsed ? { response: parsed } : { responseText: text.slice(0, 1000) }) };
      if (response.ok || !transientStatuses.has(response.status) || attempt === retries) return lastResult;
    } catch (error) {
      lastResult = { label, ok: false, attempt: attempt + 1, error: error instanceof Error ? error.message : String(error) };
      if (attempt === retries) return lastResult;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(5000, 500 * 2 ** attempt)));
  }
  return lastResult ?? { label, ok: false, error: "provider_smoke_no_result" };
}

async function requestAudio(profile) {
  const baseUrl = endpoint(profile.baseUrl, "t2a_async_v2");
  const submit = await request("audio", baseUrl, profile.apiKey, {
    model: profile.model,
    text: "desktop audio provider smoke",
    voice_setting: { voice_id: "English_Trustworth_Man", speed: 1, vol: 1, pitch: 0 },
    audio_setting: { audio_type: "mp3" },
  });
  const submittedTaskId = submit.response?.task_id;
  if (!submit.ok || submittedTaskId === undefined || submittedTaskId === null || submittedTaskId === 0) return submit;
  const retries = Math.max(0, Number(process.env.AIMARKETING_PROVIDER_RETRIES ?? 2));
  const attempts = Math.max(3, retries + 1);
  let query;
  for (let attempt = 1; attempt <= attempts * 8; attempt += 1) {
    const response = await fetch(endpoint(profile.baseUrl, "query/t2a_async_query_v2") + `?task_id=${encodeURIComponent(String(submittedTaskId))}`, {
      headers: { authorization: `Bearer ${profile.apiKey}` },
      signal: AbortSignal.timeout(Number(process.env.AIMARKETING_PROVIDER_TIMEOUT_MS ?? 120000)),
    });
    const text = await response.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = undefined; }
    query = { label: "audio", status: response.status, ok: response.ok, attempt, response: parsed };
    const taskStatus = String(parsed?.status ?? "");
    if (["Success", "Succeeded", "Failed", "Fail"].includes(taskStatus) || !response.ok) return query;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  return query ?? { label: "audio", ok: false, error: "audio_provider_smoke_no_query_result" };
}

function configuredAudioProfile(value) {
  const profileId = value?.defaults?.audio;
  const profile = profileId && value?.providers?.[profileId];
  if (!profile || typeof profile !== "object") throw new Error("real_provider_config_audio_profile_missing");
  for (const field of ["baseUrl", "apiKey", "model"]) if (typeof profile[field] !== "string" || !profile[field].trim()) throw new Error(`real_provider_config_audio_${field}_missing`);
  return profile;
}

// The configured LLM and image entries can point at the same upstream. Run
// them serially so a capacity-limited gateway does not turn a valid smoke into
// a client-side concurrency failure. Transient upstream errors are retried a
// bounded number of times; video generation (including seedance) remains
// intentionally out of this smoke suite.
const results = [
  await request("llm", endpoint(config.llm.baseUrl, "chat/completions"), config.llm.apiKey, {
    model: config.llm.model,
    messages: [{ role: "user", content: "Reply with exactly: desktop provider smoke ok" }],
    max_tokens: 32,
    temperature: 0,
  }),
  await request("image", endpoint(config.image.baseUrl, "images/generations"), config.image.apiKey, {
    model: config.image.model,
    prompt: "A simple yellow square on a white background, no text",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  }),
  await requestAudio(configuredAudioProfile(config)),
];

const sanitized = results.map((result) => ({
  label: result.label,
  ...(typeof result.status === "number" ? { status: result.status } : {}),
  ok: result.ok,
  schemaOk: result.ok === true && hasExpectedSmokeResponse(result.label, result.response),
  ...(typeof result.attempt === "number" ? { attempts: result.attempt } : {}),
  ...(result.response && typeof result.response === "object" ? { responseKeys: Object.keys(result.response) } : {}),
  ...(result.error ? { error: result.error } : {}),
}));
console.log(JSON.stringify({ configFile: configPath, scope: REAL_PROVIDER_SMOKE_SCOPE, results: sanitized }, null, 2));
if (results.some((result) => result.ok !== true || !hasExpectedSmokeResponse(result.label, result.response))) process.exitCode = 1;
