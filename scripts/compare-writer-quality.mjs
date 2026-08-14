import { readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const SCORE_FIELDS = ["factuality", "compliance", "editorial"];

function parseArgs(argv) {
  const result = { baseline: null, candidate: null, output: null };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--baseline") result.baseline = argv[++index] || null;
    else if (value === "--candidate") result.candidate = argv[++index] || null;
    else if (value === "--write") result.output = argv[++index] || null;
    else if (value === "--help") {
      console.log("usage: node scripts/compare-writer-quality.mjs --baseline <json> --candidate <json> [--write <json>]");
      process.exit(0);
    } else throw new Error(`writer_quality_unknown_arg:${value}`);
  }
  if (!result.baseline || !result.candidate) throw new Error("writer_quality_baseline_and_candidate_required");
  return result;
}

async function readDataset(path, label) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    throw new Error(`writer_quality_${label}_invalid:${error instanceof Error ? error.message : String(error)}`);
  }
}

function validateDataset(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`writer_quality_${label}_not_object`);
  if (value.schemaVersion !== 1) throw new Error(`writer_quality_${label}_schema_invalid`);
  if (typeof value.corpusId !== "string" || !value.corpusId.trim()) throw new Error(`writer_quality_${label}_corpus_missing`);
  if (!Array.isArray(value.samples) || value.samples.length === 0) throw new Error(`writer_quality_${label}_samples_missing`);
  const seen = new Set();
  const samples = value.samples.map((sample, index) => {
    if (!sample || typeof sample !== "object" || Array.isArray(sample)) throw new Error(`writer_quality_${label}_sample_invalid:${index}`);
    const id = typeof sample.id === "string" ? sample.id.trim() : "";
    const prompt = typeof sample.prompt === "string" ? sample.prompt.trim() : "";
    const platform = typeof sample.platform === "string" ? sample.platform.trim() : "";
    if (!id || seen.has(id)) throw new Error(`writer_quality_${label}_sample_id_invalid:${index}`);
    if (!prompt || !platform) throw new Error(`writer_quality_${label}_sample_context_invalid:${id || index}`);
    if (sample.blind !== true) throw new Error(`writer_quality_${label}_sample_not_blind:${id}`);
    seen.add(id);
    const scores = {};
    for (const field of SCORE_FIELDS) {
      const score = sample[field];
      if (typeof score !== "number" || !Number.isFinite(score) || score < 0 || score > 5) {
        throw new Error(`writer_quality_${label}_score_invalid:${id}:${field}`);
      }
      scores[field] = score;
    }
    return { id, prompt, platform, ...scores };
  });
  return { schemaVersion: 1, corpusId: value.corpusId.trim(), samples };
}

function mean(samples, field) {
  return samples.reduce((sum, sample) => sum + sample[field], 0) / samples.length;
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function compareWriterQuality(baselineValue, candidateValue) {
  const baseline = validateDataset(baselineValue, "baseline");
  const candidate = validateDataset(candidateValue, "candidate");
  if (baseline.corpusId !== candidate.corpusId) throw new Error("writer_quality_corpus_mismatch");
  const baselineById = new Map(baseline.samples.map((sample) => [sample.id, sample]));
  const candidateById = new Map(candidate.samples.map((sample) => [sample.id, sample]));
  if (baselineById.size !== candidateById.size || [...baselineById.keys()].some((id) => !candidateById.has(id))) {
    throw new Error("writer_quality_prompt_set_mismatch");
  }
  for (const baselineSample of baseline.samples) {
    const candidateSample = candidateById.get(baselineSample.id);
    if (candidateSample.prompt !== baselineSample.prompt || candidateSample.platform !== baselineSample.platform) {
      throw new Error(`writer_quality_prompt_context_mismatch:${baselineSample.id}`);
    }
  }
  const sampleComparisons = baseline.samples.map((baselineSample) => {
    const candidateSample = candidateById.get(baselineSample.id);
    return {
      id: baselineSample.id,
      platform: baselineSample.platform,
      factualityDelta: round(candidateSample.factuality - baselineSample.factuality),
      complianceDelta: round(candidateSample.compliance - baselineSample.compliance),
    };
  });
  const metrics = Object.fromEntries(SCORE_FIELDS.map((field) => {
    const baselineMean = mean(baseline.samples, field);
    const candidateMean = mean(candidate.samples, field);
    return [field, { baseline: round(baselineMean), candidate: round(candidateMean), delta: round(candidateMean - baselineMean) }];
  }));
  const gate = {
    factualityNoRegression: sampleComparisons.every((sample) => sample.factualityDelta >= 0),
    platformComplianceNoRegression: sampleComparisons.every((sample) => sample.complianceDelta >= 0),
    blindEditorialImproved: metrics.editorial.delta > 0,
  };
  return {
    schemaVersion: 1,
    status: Object.values(gate).every(Boolean) ? "pass" : "changes_required",
    corpusId: baseline.corpusId,
    sampleCount: baseline.samples.length,
    metrics,
    regressions: sampleComparisons.filter((sample) => sample.factualityDelta < 0 || sample.complianceDelta < 0),
    gate,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseline = await readDataset(args.baseline, "baseline");
  const candidate = await readDataset(args.candidate, "candidate");
  const manifest = compareWriterQuality(baseline, candidate);
  if (args.output) {
    const outputPath = isAbsolute(args.output) ? args.output : join(repoRoot, args.output);
    await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifest.output = outputPath;
  }
  console.log(JSON.stringify(manifest, null, 2));
  if (manifest.status !== "pass") process.exitCode = 1;
}

if (pathToFileURL(resolve(process.argv[1] || "")).href === import.meta.url) {
  await main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}

export { compareWriterQuality, validateDataset };
