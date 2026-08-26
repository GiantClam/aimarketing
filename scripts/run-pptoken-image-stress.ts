import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import sharp from "sharp";
import {
  createOpenAICompatibleImageAdapter,
  downloadMediaOutputs,
  IMAGE_GENERATION_REQUEST_TIMEOUT_MS,
  type MediaProviderId,
} from "../packages/media-runtime/src/index";

const baseUrl = "https://api.pptoken.cc/v1";
const iterations = 10;
const credentials = JSON.parse(process.env.PPTOKEN_STRESS_CREDENTIALS_JSON ?? "[]") as Array<{ model?: unknown; apiKey?: unknown }>;
const providers = credentials.map((entry) => ({ model: String(entry.model ?? "").trim(), apiKey: String(entry.apiKey ?? "").trim() }));
if (providers.length !== 3 || providers.some((entry) => !entry.model || !entry.apiKey)) throw new Error("pptoken_stress_credentials_invalid");

const stamp = new Date().toISOString().replace(/[:.]/gu, "-");
const outputRoot = resolve("artifacts", `pptoken-image-stress-${stamp}`);

type StressResult = {
  model: string;
  iteration: number;
  ok: boolean;
  durationMs: number;
  stage: string;
  error?: string;
  bytes?: number;
  sha256?: string;
  contentType?: string;
  format?: string;
  width?: number;
  height?: number;
  relativePath?: string;
};

const redactError = (value: unknown) => {
  const raw = value instanceof Error ? value.message : String(value);
  return raw.replace(/sk-[a-zA-Z0-9_-]+/gu, "[REDACTED]").slice(0, 500);
};

async function runOne(model: string, apiKey: string, iteration: number): Promise<StressResult> {
  const startedAt = performance.now();
  const runDirectory = join(outputRoot, model.replace(/[^a-zA-Z0-9._-]/gu, "_"), String(iteration).padStart(2, "0"));
  let stage = "request";
  try {
    const adapter = createOpenAICompatibleImageAdapter({
      provider: "pptoken" as MediaProviderId,
      baseUrl,
      apiKey,
      fetchImpl: fetch,
      workspacePath: outputRoot,
      requestTimeoutMs: IMAGE_GENERATION_REQUEST_TIMEOUT_MS,
      imageTransport: "curl",
    });
    const task = await adapter.execute({
      provider: "pptoken" as MediaProviderId,
      modelId: model,
      input: {
        prompt: `Editorial product photograph for reliability test ${iteration}: a cobalt blue ceramic mug on a light gray studio surface, soft natural shadows, centered composition, no text, no logo, no watermark.`,
        size: "1024x1024",
        quality: "auto",
        n: 1,
      },
      idempotencyKey: `pptoken-stress:${model}:${iteration}:${randomUUID()}`,
    }, { throwIfCancelled: () => undefined });
    if (task.status !== "succeeded") throw new Error(`provider_task_${task.status}:${task.error ?? task.providerStatus ?? "unknown"}`);
    if (!task.outputs.length) throw new Error("provider_response_missing_image_output");

    stage = "download";
    const artifacts = await downloadMediaOutputs(task, runDirectory, {
      fetchImpl: fetch,
      filenamePrefix: `${model.replace(/[^a-zA-Z0-9._-]/gu, "_")}-${String(iteration).padStart(2, "0")}`,
      allowedContentTypes: ["image"],
      maxBytes: 64 * 1024 * 1024,
    });
    if (!artifacts.length) throw new Error("provider_image_not_downloadable");

    stage = "validate";
    const artifact = artifacts[0];
    const absolutePath = join(runDirectory, artifact.relativePath);
    const bytes = await readFile(absolutePath);
    const digest = createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex");
    if (bytes.byteLength < 1024) throw new Error(`provider_image_too_small:${bytes.byteLength}`);
    if (digest !== artifact.sha256) throw new Error("provider_image_digest_mismatch");
    const metadata = await sharp(bytes, { failOn: "error" }).metadata();
    if (!metadata.width || !metadata.height || metadata.width < 256 || metadata.height < 256) throw new Error(`provider_image_dimensions_invalid:${metadata.width ?? 0}x${metadata.height ?? 0}`);
    if (!metadata.format || !["png", "jpeg", "webp", "gif"].includes(metadata.format)) throw new Error(`provider_image_format_invalid:${metadata.format ?? "unknown"}`);

    return {
      model,
      iteration,
      ok: true,
      durationMs: Math.round(performance.now() - startedAt),
      stage: "complete",
      bytes: bytes.byteLength,
      sha256: digest,
      contentType: artifact.contentType,
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
      relativePath: relative(outputRoot, absolutePath).replaceAll("\\", "/"),
    };
  } catch (error) {
    return { model, iteration, ok: false, durationMs: Math.round(performance.now() - startedAt), stage, error: redactError(error) };
  }
}

async function runModel(model: string, apiKey: string) {
  const results: StressResult[] = [];
  for (let iteration = 1; iteration <= iterations; iteration += 1) {
    const result = await runOne(model, apiKey, iteration);
    results.push(result);
    console.log(JSON.stringify({ event: "iteration", model, iteration, ok: result.ok, durationMs: result.durationMs, stage: result.stage, ...(result.error ? { error: result.error } : {}), ...(result.bytes ? { bytes: result.bytes } : {}) }));
  }
  return results;
}

async function main() {
  await mkdir(outputRoot, { recursive: true });
  const startedAt = new Date().toISOString();
  const nestedResults = await Promise.all(providers.map(({ model, apiKey }) => runModel(model, apiKey)));
  const results = nestedResults.flat();
  const summaries = providers.map(({ model }) => {
    const modelResults = results.filter((result) => result.model === model);
    const successful = modelResults.filter((result) => result.ok);
    const sortedLatencies = successful.map((result) => result.durationMs).sort((a, b) => a - b);
    return {
      model,
      requested: modelResults.length,
      succeeded: successful.length,
      failed: modelResults.length - successful.length,
      successRate: modelResults.length ? successful.length / modelResults.length : 0,
      downloadedBytes: successful.reduce((total, result) => total + (result.bytes ?? 0), 0),
      latencyMs: successful.length ? {
        min: sortedLatencies[0],
        median: sortedLatencies[Math.floor((sortedLatencies.length - 1) / 2)],
        p95: sortedLatencies[Math.ceil(sortedLatencies.length * 0.95) - 1],
        max: sortedLatencies.at(-1),
        average: Math.round(sortedLatencies.reduce((total, value) => total + value, 0) / sortedLatencies.length),
      } : null,
    };
  });
  const report = {
    baseUrl,
    startedAt,
    finishedAt: new Date().toISOString(),
    execution: { modelsInParallel: providers.length, requestsPerModel: iterations, retries: 0, requestTimeoutMs: IMAGE_GENERATION_REQUEST_TIMEOUT_MS },
    summaries,
    results,
  };
  await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join(outputRoot, "summary.json"), `${JSON.stringify({ baseUrl, startedAt, finishedAt: report.finishedAt, execution: report.execution, summaries }, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ event: "complete", outputRoot, summaries }));
  if (results.some((result) => !result.ok)) process.exitCode = 1;
}

void main().catch((error) => {
  console.error(JSON.stringify({ event: "fatal", error: redactError(error) }));
  process.exitCode = 1;
});
