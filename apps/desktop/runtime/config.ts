import { copyFile, mkdir, open, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { DesktopPaths } from "./paths";

export interface DesktopConfig {
  readonly schemaVersion: 1;
  readonly locale?: "auto" | "zh" | "en";
  readonly workspacePath: string;
  readonly obsidianVaultPath?: string;
  readonly obsidianIndexPath?: string;
  readonly offlineRuntimeZipPath?: string;
  readonly provider: { readonly id: string; readonly source?: string; readonly model: string; readonly models?: readonly string[]; readonly baseUrl?: string; readonly apiKey?: string; readonly reasoningEffort?: string; readonly skillId?: string; readonly endpoint?: string; readonly queryEndpoint?: string };
  readonly runtime: { readonly source: "system" | "private"; readonly opencodePath?: string; readonly pythonPath?: string };
}

export function defaultDesktopConfig(paths: DesktopPaths): DesktopConfig {
  return { schemaVersion: 1, locale: "auto", workspacePath: paths.projects, provider: { id: "local", source: "local", model: "ollama/qwen3:8b", models: ["ollama/qwen3:8b"], baseUrl: "http://127.0.0.1:11434/v1", apiKey: "" }, runtime: { source: "system" } };
}

export async function readDesktopConfig(paths: DesktopPaths): Promise<DesktopConfig> {
  try { return parseConfig(await readFile(paths.configFile, "utf8")); }
  catch { try { return parseConfig(await readFile(join(paths.root, "config.backup.json"), "utf8")); } catch { return defaultDesktopConfig(paths); } }
}

export async function writeDesktopConfig(paths: DesktopPaths, config: DesktopConfig) {
  const normalized = parseConfig(JSON.stringify(config));
  await mkdir(dirname(paths.configFile), { recursive: true });
  const tmp = `${paths.configFile}.tmp`;
  const handle = await open(tmp, "w");
  try { await handle.writeFile(`${JSON.stringify(normalized, null, 2)}\n`, "utf8"); await handle.sync(); }
  finally { await handle.close(); }
  try { await copyFile(paths.configFile, join(paths.root, "config.backup.json")); } catch { /* first write */ }
  await rename(tmp, paths.configFile);
}

function parseConfig(raw: string): DesktopConfig {
  const value = JSON.parse(raw) as Partial<DesktopConfig>;
  if (value.schemaVersion !== 1 || typeof value.workspacePath !== "string" || !value.provider || !value.runtime) throw new Error("invalid desktop config");
  const models = normalizeConfiguredModels(value.provider.models);
  const requestedModel = String(value.provider.model ?? "").trim();
  const model = models.includes(requestedModel) ? requestedModel : (models[0] ?? requestedModel);
  return {
    schemaVersion: 1,
    locale: value.locale === "zh" || value.locale === "en" ? value.locale : "auto",
    workspacePath: value.workspacePath,
    ...(typeof value.obsidianVaultPath === "string" ? { obsidianVaultPath: value.obsidianVaultPath } : {}),
    ...(typeof value.obsidianIndexPath === "string" ? { obsidianIndexPath: value.obsidianIndexPath } : {}),
    ...(typeof (value as Partial<DesktopConfig>).offlineRuntimeZipPath === "string" ? { offlineRuntimeZipPath: (value as Partial<DesktopConfig>).offlineRuntimeZipPath } : {}),
    provider: { id: String(value.provider.id ?? "local"), model, ...(models.length ? { models } : {}), ...(value.provider.source ? { source: String(value.provider.source) } : {}), ...(value.provider.baseUrl ? { baseUrl: String(value.provider.baseUrl) } : {}), ...(value.provider.apiKey ? { apiKey: String(value.provider.apiKey) } : {}), ...(value.provider.reasoningEffort ? { reasoningEffort: String(value.provider.reasoningEffort) } : {}), ...(typeof value.provider.skillId === "string" && value.provider.skillId.trim() ? { skillId: value.provider.skillId.trim() } : {}), ...(value.provider.endpoint ? { endpoint: String(value.provider.endpoint) } : {}), ...(value.provider.queryEndpoint ? { queryEndpoint: String(value.provider.queryEndpoint) } : {}) },
    runtime: { source: value.runtime.source === "private" ? "private" : "system", ...(value.runtime.opencodePath ? { opencodePath: String(value.runtime.opencodePath) } : {}), ...(value.runtime.pythonPath ? { pythonPath: String(value.runtime.pythonPath) } : {}) },
  };
}

function normalizeConfiguredModels(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((model): model is string => typeof model === "string").map((model) => model.trim()).filter(Boolean))];
}

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [/(key|token|secret|password)/iu.test(key) ? key : key, /(key|token|secret|password)/iu.test(key) ? "[REDACTED]" : redactSecrets(item)]));
}
