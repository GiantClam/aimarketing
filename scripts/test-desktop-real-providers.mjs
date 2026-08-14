import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertRealProviderConfig, buildRealProviderSmokeScope, defaultVideoPollBudget, hasExpectedSmokeResponse, resolveNonSeedanceVideoProfile } from "./real-provider-config.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(process.env.AIMARKETING_REAL_PROVIDER_CONFIG ?? resolve(repoRoot, "apps/desktop/real-providers.test.local.json"));
const config = assertRealProviderConfig(JSON.parse(await readFile(configPath, "utf8")));
const videoOnly = process.argv.includes("--video-only") || process.env.AIMARKETING_PROVIDER_SMOKE_VIDEO_ONLY === "1";
const audioOnly = process.argv.includes("--audio-only") || process.env.AIMARKETING_PROVIDER_SMOKE_AUDIO_ONLY === "1";
const imageOnly = process.argv.includes("--image-only") || process.env.AIMARKETING_PROVIDER_SMOKE_IMAGE_ONLY === "1";
const includeVideo = videoOnly || process.argv.includes("--include-video") || process.env.AIMARKETING_PROVIDER_SMOKE_INCLUDE_VIDEO === "1";
const smokeScope = buildRealProviderSmokeScope({ includeVideo, videoOnly, audioOnly, imageOnly });
const imageSize = String(process.env.AIMARKETING_PROVIDER_IMAGE_SIZE ?? "256x256").trim();
const supportedImageSizes = new Set(["256x256", "512x512", "1024x1024", "1536x1024", "1024x1536"]);
if (!supportedImageSizes.has(imageSize)) throw new Error(`real_provider_image_size_unsupported:${imageSize}`);

function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/u, "")}/${String(path).replace(/^\/+/, "")}`;
}

function boundedPositiveInt(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, maximum);
}

function boundedNonNegativeInt(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.min(parsed, maximum);
}

async function request(label, url, apiKey, body, { method = "POST", headers = {} } = {}) {
  const retries = Math.max(0, Number(process.env.AIMARKETING_PROVIDER_RETRIES ?? 2));
  const transientStatuses = new Set([408, 425, 429, 500, 502, 503, 504]);
  let lastResult;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        method,
        headers: { authorization: `Bearer ${apiKey}`, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
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

function providerSource(profile) {
  return String(profile.source ?? profile.provider ?? "").trim().toLowerCase();
}

function resolveImageSmokeModel(profile) {
  return providerSource(profile) === "pptoken" ? "gpt-image-2" : profile.model;
}

function taskIdFromResponse(response) {
  const data = response?.data && typeof response.data === "object" ? response.data : undefined;
  const output = response?.output && typeof response.output === "object" ? response.output : undefined;
  return response?.task_id ?? response?.taskId ?? response?.id ?? data?.task_id ?? data?.taskId ?? output?.task_id ?? output?.taskId;
}

async function pollVideo(label, profile, taskId, source, queryPath) {
  const maxPolls = Math.max(1, Number(process.env.AIMARKETING_PROVIDER_VIDEO_POLLS ?? defaultVideoPollBudget(profile, source)));
  const delayMs = Math.max(0, Number(process.env.AIMARKETING_PROVIDER_VIDEO_POLL_DELAY_MS ?? 1500));
  let query;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
    const isRunningHub = source === "runninghub";
    const url = isRunningHub
      ? endpoint(profile.baseUrl, queryPath)
      : endpoint(profile.baseUrl, `${queryPath}${queryPath.includes("?") ? "&" : "?"}task_id=${encodeURIComponent(String(taskId))}`);
    query = await request(label, url, profile.apiKey, isRunningHub ? { taskId: String(taskId) } : undefined, { method: isRunningHub ? "POST" : "GET" });
    query.attempt = attempt;
    query.providerTaskId = String(taskId);
    const status = String(query.response?.status ?? query.response?.taskStatus ?? query.response?.data?.status ?? query.response?.data?.taskStatus ?? query.response?.output?.status ?? query.response?.output?.taskStatus ?? query.response?.output?.task_status ?? "").toLowerCase();
    if (!query.ok || ["success", "succeeded", "completed", "done", "failed", "error"].includes(status) || hasExpectedSmokeResponse("video", query.response)) return query;
    if (attempt < maxPolls) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return query ?? { label, ok: false, error: "video_provider_smoke_no_query_result" };
}

async function requestVideo(profileEntry) {
  const { profile } = profileEntry;
  const source = providerSource(profile);
  let submitPath;
  let queryPath;
  let body;
  let headers;
  if (source === "bailian" || source === "dashscope") {
    submitPath = profile.endpoint || "/api/v1/services/aigc/video-generation/video-synthesis";
    queryPath = profile.queryEndpoint || "/api/v1/tasks";
    body = { model: profile.model, input: { prompt: "A short desktop provider smoke video of a yellow cube on a white table" }, parameters: { resolution: "720P", ratio: "16:9", duration: 3 } };
    headers = { "X-DashScope-Async": "enable" };
  } else if (source === "minimax") {
    submitPath = profile.endpoint || "/video_generation";
    queryPath = profile.queryEndpoint || "/query/video_generation";
    body = { model: profile.model, prompt: "A short desktop provider smoke video of a yellow cube on a white table", duration: 6, resolution: "768P", prompt_optimizer: true };
  } else if (source === "runninghub") {
    submitPath = profile.endpoint;
    queryPath = profile.queryEndpoint || "/openapi/v2/query";
    if (!submitPath) return { label: "video", ok: false, error: "real_provider_config_video_endpoint_missing" };
    const isHailuoH3 = /hailuo|h3/iu.test(`${profile.model ?? ""} ${submitPath}`);
    body = { prompt: "A short desktop provider smoke video of a yellow cube on a white table", resolution: isHailuoH3 ? "2K" : "720p", duration: "5", ratio: isHailuoH3 ? "16:9" : "adaptive", generateAudio: false };
  } else {
    return { label: "video", ok: false, error: `real_provider_video_source_unsupported:${source || "missing"}` };
  }
  const submit = await request("video", endpoint(profile.baseUrl, submitPath), profile.apiKey, body, { headers });
  const taskId = taskIdFromResponse(submit.response);
  if (!submit.ok || taskId === undefined || taskId === null || taskId === "") return submit;
  if (source === "bailian" || source === "dashscope") queryPath = `${queryPath.replace(/\/+$/u, "")}/${encodeURIComponent(String(taskId))}`;
  return pollVideo("video", profile, taskId, source, queryPath);
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
  const maxPolls = boundedPositiveInt(
    process.env.AIMARKETING_PROVIDER_AUDIO_POLLS,
    attempts * 8,
    240,
  );
  const pollDelayMs = boundedNonNegativeInt(
    process.env.AIMARKETING_PROVIDER_AUDIO_POLL_DELAY_MS,
    1500,
    60_000,
  );
  let query;
  for (let attempt = 1; attempt <= maxPolls; attempt += 1) {
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
    if (attempt < maxPolls) await new Promise((resolve) => setTimeout(resolve, pollDelayMs));
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
// bounded number of times. The default scope excludes video/Seedance; the
// explicit --include-video path only selects a configured non-Seedance profile.
const configuredVideoProfile = includeVideo ? resolveNonSeedanceVideoProfile(config) : undefined;
const imageSmokeModel = resolveImageSmokeModel(config.image);
const results = includeVideo && !configuredVideoProfile
  ? [{ label: "video", ok: false, error: "real_provider_config_non_seedance_video_profile_missing" }]
  : videoOnly
    ? []
  : imageOnly
    ? [await request("image", endpoint(config.image.baseUrl, "images/generations"), config.image.apiKey, {
        model: imageSmokeModel,
        prompt: "A simple yellow square on a white background, no text",
        size: imageSize,
        n: 1,
        response_format: "url",
      })]
  : audioOnly
    ? [await requestAudio(configuredAudioProfile(config))]
  : [
      await request("llm", endpoint(config.llm.baseUrl, "chat/completions"), config.llm.apiKey, {
        model: config.llm.model,
        messages: [{ role: "user", content: "Reply with exactly: desktop provider smoke ok" }],
        max_tokens: 32,
        temperature: 0,
      }),
      await request("image", endpoint(config.image.baseUrl, "images/generations"), config.image.apiKey, {
        model: imageSmokeModel,
        prompt: "A simple yellow square on a white background, no text",
        size: imageSize,
        n: 1,
        response_format: "url",
      }),
      await requestAudio(configuredAudioProfile(config)),
    ];

if (includeVideo && configuredVideoProfile) {
  const videoResult = await requestVideo(configuredVideoProfile);
  videoResult.profileId = configuredVideoProfile.id;
  results.push(videoResult);
}

const sanitized = results.map((result) => ({
  label: result.label,
  ...(typeof result.status === "number" ? { status: result.status } : {}),
  ok: result.ok,
  schemaOk: result.ok === true && hasExpectedSmokeResponse(result.label, result.response),
  ...(typeof result.attempt === "number" ? { attempts: result.attempt } : {}),
  ...(typeof result.profileId === "string" ? { profileId: result.profileId } : {}),
  ...(typeof result.providerTaskId === "string" ? { providerTaskId: result.providerTaskId } : {}),
  ...((result.response?.status !== undefined) ? { providerStatus: String(result.response.status).slice(0, 80) } : {}),
  ...((result.response?.data?.status !== undefined) ? { providerStatus: String(result.response.data.status).slice(0, 80) } : {}),
  ...((result.response?.errorCode !== undefined) ? { providerErrorCode: String(result.response.errorCode).slice(0, 120) } : {}),
  ...((result.response?.errorMessage !== undefined) ? { providerErrorMessage: String(result.response.errorMessage).replace(/(?:api[-_ ]?key|token|authorization)[^\s:=]*[\s:=]+[^\s,;]+/giu, "[REDACTED]").slice(0, 300) } : {}),
  ...((result.response?.failedReason !== undefined) ? { failedReason: String(result.response.failedReason).replace(/(?:api[-_ ]?key|token|authorization)[^\s:=]*[\s:=]+[^\s,;]+/giu, "[REDACTED]").slice(0, 300) } : {}),
  ...(result.response && typeof result.response === "object" ? { responseKeys: Object.keys(result.response) } : {}),
  ...(result.error ? { error: result.error } : {}),
}));
console.log(JSON.stringify({ configFile: configPath, scope: smokeScope, results: sanitized }, null, 2));
if (results.some((result) => result.ok !== true || !hasExpectedSmokeResponse(result.label, result.response))) process.exitCode = 1;
