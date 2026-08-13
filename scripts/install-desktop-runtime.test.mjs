import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), "install-desktop-runtime.ps1");

test("runtime installer keeps the approved mirror order", async () => {
  const source = await readFile(scriptPath, "utf8");
  const mirrorOrder = ["$mirrors = @(\"aliyun\", \"tencent\", \"tsinghua\", \"official\")"];
  assert.ok(source.includes(mirrorOrder[0]));
  assert.match(source, /Install-OpenCodePackage\s+-Offline:\(\[bool\]\$OfflineZip\)/u);
  assert.match(source, /offline_opencode_missing/u);
});

test("OpenCode npm fallback includes the Qinghua registry before official npm", async () => {
  const source = await readFile(scriptPath, "utf8");
  const npmStart = source.indexOf("$registries = @(");
  const npmBlock = source.slice(npmStart, source.indexOf(")", npmStart) + 1);
  assert.ok(npmBlock.indexOf("registry.npmmirror.com") < npmBlock.indexOf("mirrors.cloud.tencent.com/npm"));
  assert.ok(npmBlock.indexOf("mirrors.cloud.tencent.com/npm") < npmBlock.indexOf("mirrors.tuna.tsinghua.edu.cn/npm"));
  assert.ok(npmBlock.indexOf("mirrors.tuna.tsinghua.edu.cn/npm") < npmBlock.indexOf("registry.npmjs.org"));
});

test("installer seeds bundled runtime and skills before downloading missing components", async () => {
  const source = await readFile(scriptPath, "utf8");
  assert.match(source, /Seed-BundledRuntime/);
  assert.match(source, /localPath|bundledRuntime/);
  assert.match(source, /alreadyExtracted/u);
  assert.match(source, /runtime archive missing/u);
  assert.match(source, /Invoke-WebRequest[^\n]+TimeoutSec 90/u);
  assert.match(source, /pip install[^\n]+--timeout 30/u);
});
