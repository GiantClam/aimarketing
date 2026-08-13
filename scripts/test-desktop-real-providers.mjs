import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(process.env.AIMARKETING_REAL_PROVIDER_CONFIG ?? resolve(repoRoot, "apps/desktop/real-providers.test.local.json"));
const config = JSON.parse(await readFile(configPath, "utf8"));
const results = [];

function endpoint(baseUrl, path) {
  return `${String(baseUrl).replace(/\/+$/u, "")}/${String(path).replace(/^\/+/, "")}`;
}

async function request(label, url, apiKey, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.AIMARKETING_PROVIDER_TIMEOUT_MS ?? 120000)),
  });
  const text = await response.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = undefined; }
  const result = { label, status: response.status, ok: response.ok, ...(parsed ? { response: parsed } : { responseText: text.slice(0, 1000) }) };
  results.push(result);
  if (!response.ok) throw new Error(`${label} failed with HTTP ${response.status}`);
  return parsed;
}

await Promise.all([
  request("llm", endpoint(config.llm.baseUrl, "chat/completions"), config.llm.apiKey, {
    model: config.llm.model,
    messages: [{ role: "user", content: "Reply with exactly: desktop provider smoke ok" }],
    max_tokens: 32,
    temperature: 0,
  }).catch((error) => results.push({ label: "llm", ok: false, error: error instanceof Error ? error.message : String(error) })),
  request("image", endpoint(config.image.baseUrl, "images/generations"), config.image.apiKey, {
    model: config.image.model,
    prompt: "A simple yellow square on a white background, no text",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  }).catch((error) => results.push({ label: "image", ok: false, error: error instanceof Error ? error.message : String(error) })),
]);

const sanitized = results.map((result) => ({
  label: result.label,
  ...(typeof result.status === "number" ? { status: result.status } : {}),
  ok: result.ok,
  ...(result.response && typeof result.response === "object" ? { responseKeys: Object.keys(result.response) } : {}),
  ...(result.error ? { error: result.error } : {}),
}));
console.log(JSON.stringify({ configFile: configPath, results: sanitized }, null, 2));
if (results.some((result) => result.ok !== true)) process.exitCode = 1;
