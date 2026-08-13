import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { createPaths, detectDesktopPaths } from "../runtime/paths";
import { defaultDesktopConfig, readDesktopConfig, redactSecrets, writeDesktopConfig } from "../runtime/config";
import { acquireInstanceLock } from "../runtime/lock";

test("normal and portable paths are deterministic", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing desktop "));
  try {
    const normal = detectDesktopPaths({ executableDir: root, localAppData: join(root, "local") });
    assert.equal(normal.mode, "normal");
    await writeFile(join(root, "portable.flag"), "", "utf8");
    assert.equal(detectDesktopPaths({ executableDir: root }).mode, "portable");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("config writes atomically and recovers from backup", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-config-"));
  const paths = createPaths(root, "normal");
  try {
    const initial = defaultDesktopConfig(paths);
    assert.equal(initial.locale, "auto");
    await writeDesktopConfig(paths, initial);
    await writeDesktopConfig(paths, { ...initial, workspacePath: join(root, "项目"), obsidianIndexPath: join(root, "索引"), provider: { ...initial.provider, source: "openai-compatible", model: "retired/model", models: ["provider/fast", "provider/reasoning", "provider/fast", ""], reasoningEffort: "high", skillId: "ppt-master", endpoint: "/videos/generations", queryEndpoint: "/api/v1/tasks" } });
    const updated = await readDesktopConfig(paths);
    assert.equal(updated.obsidianIndexPath, join(root, "索引"));
    assert.equal(updated.provider.source, "openai-compatible");
    assert.deepEqual(updated.provider.models, ["provider/fast", "provider/reasoning"]);
    assert.equal(updated.provider.model, "provider/fast");
    assert.equal(updated.provider.reasoningEffort, "high");
    assert.equal(updated.provider.skillId, "ppt-master");
    assert.equal(updated.provider.endpoint, "/videos/generations");
    assert.equal(updated.provider.queryEndpoint, "/api/v1/tasks");
    const selectedRuntime = {
      source: "system" as const,
      nodePath: join(root, "runtime", "node.exe"),
      opencodePath: join(root, "runtime", "opencode.exe"),
      pythonPath: join(root, "runtime", "python.exe"),
      hostPath: join(root, "runtime", "host.mjs"),
      skillsPath: join(root, "runtime", "skills"),
      fontsPath: join(root, "runtime", "fonts"),
      lancedbPath: join(root, "runtime", "lancedb"),
      embeddingPath: join(root, "runtime", "embedding.json"),
    };
    await writeDesktopConfig(paths, { ...updated, runtime: selectedRuntime });
    const persistedRuntime = await readDesktopConfig(paths);
    assert.deepEqual(persistedRuntime.runtime, selectedRuntime);
    await writeDesktopConfig(paths, { ...updated, offlineRuntimeZipPath: join(root, "runtime.zip") });
    const offlineConfigured = await readDesktopConfig(paths);
    assert.equal(offlineConfigured.offlineRuntimeZipPath, join(root, "runtime.zip"));
    await writeFile(paths.configFile, "{broken", "utf8");
    const recovered = await readDesktopConfig(paths);
    assert.equal(recovered.workspacePath, updated.workspacePath);
    assert.equal(recovered.provider.source, updated.provider.source);
    const redacted = JSON.stringify(redactSecrets({ apiKey: "secret", nested: { token: "token-value" } }));
    assert.equal(redacted.includes("secret"), false);
    assert.equal((await readFile(join(root, "config.backup.json"), "utf8")).includes("workspacePath"), true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("same root allows one writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-lock-"));
  const paths = createPaths(root, "normal");
  try {
    const release = await acquireInstanceLock(paths);
    await assert.rejects(() => acquireInstanceLock(paths), /desktop_instance_already_running/);
    await release();
    const second = await acquireInstanceLock(paths);
    await second();
  } finally { await rm(root, { recursive: true, force: true }); }
});
