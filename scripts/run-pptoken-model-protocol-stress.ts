import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";
import { downloadMediaOutputs } from "../packages/media-runtime/src/index";

const root = "https://api.pptoken.cc";
const iterations = 10;
const credentials = JSON.parse(process.env.PPTOKEN_STRESS_CREDENTIALS_JSON ?? "[]") as Array<{ model?: unknown; apiKey?: unknown }>;
const byModel = new Map(credentials.map((entry) => [String(entry.model ?? "").trim(), String(entry.apiKey ?? "").trim()]));
const grokKey = byModel.get("grok-imagine-image") ?? "";
const geminiKey = byModel.get("gemini-3.1-flash-image") ?? "";
if (!grokKey || !geminiKey) throw new Error("pptoken_protocol_stress_credentials_invalid");

const outputRoot = resolve("artifacts", `pptoken-model-protocol-stress-${new Date().toISOString().replace(/[:.]/gu, "-")}`);

type Result = { model: string; iteration: number; ok: boolean; durationMs: number; stage: string; error?: string; bytes?: number; sha256?: string; contentType?: string; format?: string; width?: number; height?: number; relativePath?: string };
const sanitize = (value: unknown) => (value instanceof Error ? value.message : String(value)).replace(/sk-[a-zA-Z0-9_-]+/gu, "[REDACTED]").slice(0, 500);

async function validateDownload(model: string, iteration: number, output: { url?: string; b64_json?: string; contentType?: string }) {
  const directory = join(outputRoot, model, String(iteration).padStart(2, "0"));
  const task = { providerTaskId: `${model}-${iteration}`, status: "succeeded" as const, outputs: [output] };
  const artifacts = await downloadMediaOutputs(task, directory, { fetchImpl: fetch, filenamePrefix: `${model}-${iteration}`, allowedContentTypes: ["image"], maxBytes: 64 * 1024 * 1024 });
  if (!artifacts.length) throw new Error("provider_image_not_downloadable");
  const artifact = artifacts[0];
  const absolutePath = join(directory, artifact.relativePath);
  const bytes = await readFile(absolutePath);
  const digest = createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex");
  if (bytes.byteLength < 1024 || digest !== artifact.sha256) throw new Error("provider_image_file_validation_failed");
  const metadata = await sharp(bytes, { failOn: "error" }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 256 || metadata.height < 256) throw new Error(`provider_image_dimensions_invalid:${metadata.width ?? 0}x${metadata.height ?? 0}`);
  return { bytes: bytes.byteLength, sha256: digest, contentType: artifact.contentType, format: metadata.format, width: metadata.width, height: metadata.height, relativePath: relative(outputRoot, absolutePath).replaceAll("\\", "/") };
}

async function jsonRequest(url: string, key: string, body: Record<string, unknown>) {
  const response = await fetch(url, { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(IMAGE_TIMEOUT_MS) });
  const raw = await response.text();
  let payload: any;
  try { payload = raw ? JSON.parse(raw) : undefined; } catch { payload = undefined; }
  if (!response.ok) throw new Error(`provider_http_${response.status}:${String(payload?.error?.message ?? raw).slice(0, 180)}`);
  return payload;
}

const IMAGE_TIMEOUT_MS = 5 * 60 * 1000;

async function runGrok(iteration: number): Promise<Result> {
  const model = "grok-imagine-image";
  const started = performance.now();
  let stage = "request";
  try {
    const payload = await jsonRequest(`${root}/v1/images/generations`, grokKey, { model, prompt: `Reliability test ${iteration}: a cobalt blue ceramic mug on a light gray studio surface, soft natural shadows, centered composition, no text, no logo, no watermark.` });
    const url = payload?.data?.[0]?.url;
    if (typeof url !== "string" || !url) throw new Error("grok_response_missing_image_url");
    stage = "download";
    const downloaded = await validateDownload(model, iteration, { url });
    return { model, iteration, ok: true, durationMs: Math.round(performance.now() - started), stage: "complete", ...downloaded };
  } catch (error) { return { model, iteration, ok: false, durationMs: Math.round(performance.now() - started), stage, error: sanitize(error) }; }
}

async function runGemini(iteration: number): Promise<Result> {
  const model = "gemini-3.1-flash-image";
  const started = performance.now();
  let stage = "request";
  try {
    const payload = await jsonRequest(`${root}/v1beta/models/${model}:generateContent`, geminiKey, { contents: [{ role: "user", parts: [{ text: `Reliability test ${iteration}: a cobalt blue ceramic mug on a light gray studio surface, soft natural shadows, centered composition, no text, no logo, no watermark.` }] }], generationConfig: { responseModalities: ["IMAGE"] } });
    const parts = payload?.candidates?.[0]?.content?.parts;
    const inlineData = Array.isArray(parts) ? parts.find((part: any) => typeof part?.inlineData?.data === "string")?.inlineData : undefined;
    const fileData = Array.isArray(parts) ? parts.find((part: any) => typeof part?.fileData?.fileUri === "string")?.fileData : undefined;
    if (!inlineData && !fileData) throw new Error("gemini_response_missing_image_output");
    stage = "download";
    const downloaded = inlineData
      ? await validateDownload(model, iteration, { b64_json: inlineData.data, contentType: inlineData.mimeType })
      : await validateDownload(model, iteration, { url: fileData.fileUri, contentType: fileData.mimeType });
    return { model, iteration, ok: true, durationMs: Math.round(performance.now() - started), stage: "complete", ...downloaded };
  } catch (error) { return { model, iteration, ok: false, durationMs: Math.round(performance.now() - started), stage, error: sanitize(error) }; }
}

async function runModel(model: string, worker: (iteration: number) => Promise<Result>) {
  const results: Result[] = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const result = await worker(iteration);
    results.push(result);
    console.log(JSON.stringify({ event: "iteration", model, iteration, ok: result.ok, durationMs: result.durationMs, stage: result.stage, ...(result.error ? { error: result.error } : {}), ...(result.bytes ? { bytes: result.bytes } : {}) }));
  }
  return results;
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const results = (await Promise.all([runModel("grok-imagine-image", runGrok), runModel("gemini-3.1-flash-image", runGemini)])).flat();
  const summaries = ["grok-imagine-image", "gemini-3.1-flash-image"].map((model) => {
    const entries = results.filter((result) => result.model === model);
    const success = entries.filter((result) => result.ok);
    const latencies = success.map((result) => result.durationMs).sort((a, b) => a - b);
    return { model, requested: entries.length, succeeded: success.length, failed: entries.length - success.length, successRate: success.length / entries.length, downloadedBytes: success.reduce((total, result) => total + (result.bytes ?? 0), 0), latencyMs: latencies.length ? { min: latencies[0], median: latencies[Math.floor((latencies.length - 1) / 2)], p95: latencies[Math.ceil(latencies.length * 0.95) - 1], max: latencies.at(-1), average: Math.round(latencies.reduce((total, value) => total + value, 0) / latencies.length) } : null };
  });
  const report = { root, startedAt, finishedAt: new Date().toISOString(), execution: { requestsPerModel: iterations, retries: 0, protocols: { "grok-imagine-image": "/v1/images/generations", "gemini-3.1-flash-image": "/v1beta/models/:model:generateContent" } }, summaries, results };
  await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "complete", outputRoot, summaries }));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

void main().catch((error) => { console.error(JSON.stringify({ event: "fatal", error: sanitize(error) })); process.exitCode = 1; });
