import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";

const execFileAsync = promisify(execFile);
const installerPath = join(dirname(fileURLToPath(import.meta.url)), "install-desktop-runtime.ps1");

async function runPowerShellDownload(functionSource, url, destination) {
  const root = await mkdtemp(join(tmpdir(), "aimarketing-runtime-download-"));
  const wrapper = join(root, "download.ps1");
  const script = [
    "$ErrorActionPreference = 'Stop'",
    "$Proxy = ''",
    functionSource,
    `Invoke-ResumableDownload $env:TEST_DOWNLOAD_URL $env:TEST_DOWNLOAD_DEST 30`,
  ].join("\n");
  await writeFile(wrapper, script, "utf8");
  try {
    await execFileAsync(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", wrapper],
      { windowsHide: true, env: { ...process.env, TEST_DOWNLOAD_URL: url, TEST_DOWNLOAD_DEST: destination } },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("runtime downloader resumes a partial file and handles servers that ignore Range", async (t) => {
  if (process.platform !== "win32") {
    t.skip("PowerShell runtime download behavior is Windows-only");
    return;
  }
  const source = await readFile(installerPath, "utf8");
  const start = source.indexOf("function Invoke-ResumableDownload");
  const end = source.indexOf("function Seed-BundledRuntime");
  assert.ok(start >= 0 && end > start, "download function should remain an isolated installer helper");
  const functionSource = source.slice(start, end);
  const payload = Buffer.from("AIMarketing runtime payload with a resumable tail", "utf8");
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ range: request.headers.range ?? null, ignoreRange: request.url.includes("ignore") });
    if (request.url.includes("ignore")) {
      response.writeHead(200, { "Content-Length": payload.length });
      response.end(payload);
      return;
    }
    const offset = Number((request.headers.range ?? "bytes=0-").match(/bytes=(\d+)-/)?.[1] ?? 0);
    response.writeHead(offset > 0 ? 206 : 200, {
      "Content-Length": payload.length - offset,
      ...(offset > 0 ? { "Content-Range": `bytes ${offset}-${payload.length - 1}/${payload.length}` } : {}),
    });
    response.end(payload.subarray(offset));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const root = await mkdtemp(join(tmpdir(), "aimarketing-runtime-download-fixture-"));
  try {
    const resumed = join(root, "resumed.bin");
    await writeFile(`${resumed}.part`, payload.subarray(0, 12));
    await runPowerShellDownload(functionSource, `http://127.0.0.1:${port}/resume`, resumed);
    assert.deepEqual(await readFile(resumed), payload);
    assert.equal(requests[0].range, "bytes=12-");

    const ignored = join(root, "ignored.bin");
    await writeFile(`${ignored}.part`, payload.subarray(0, 7));
    await runPowerShellDownload(functionSource, `http://127.0.0.1:${port}/ignore`, ignored);
    assert.deepEqual(await readFile(ignored), payload);
    assert.equal(requests[1].ignoreRange, true);
  } finally {
    await rm(root, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});
