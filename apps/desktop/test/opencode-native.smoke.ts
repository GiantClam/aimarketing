// Opt-in real-runtime smoke. Reads an existing provider; never prints credentials.
// Run: pnpm exec tsx test/opencode-native.smoke.ts <desktop-config.json> <opencode.exe> <skills-dir>
import assert from "node:assert/strict";
import { mkdtemp, readFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { OpenCodeServeClient } from "../runtime/opencode-serve";
import type { OpenCodeRuntimeEvent } from "@coworkany/runtime-contracts/opencode";

async function main() {
const [configPath, executable, skillsPath] = process.argv.slice(2);
assert.ok(configPath && executable && skillsPath, "config, executable and skills paths are required");
const config = JSON.parse(await readFile(resolve(configPath), "utf8"));
const profile = config.providers?.["pptoken-grok"];
assert.ok(profile?.apiKey && profile?.baseUrl && profile?.model, "configured pptoken-grok profile is required");
const workspace = await mkdtemp(join(tmpdir(), "coworkany-native-smoke-"));
const configDirectory = join(workspace, "config");
await mkdir(configDirectory);
const model = `regression/${profile.model}`;
const runtimeConfig = {
  $schema: "https://opencode.ai/config.json",
  model,
  skills: { paths: [resolve(skillsPath)] },
  permission: { "*": "allow", question: "allow" },
  provider: { regression: { npm: "@ai-sdk/openai-compatible", name: "Configured regression provider", options: { baseURL: profile.baseUrl, apiKey: profile.apiKey }, models: { [profile.model]: { name: profile.model, limit: { context: 131072, output: 8192 } } } } },
};
const client = new OpenCodeServeClient(resolve(executable), workspace);
const events: OpenCodeRuntimeEvent[] = [];
const controller = new AbortController();
const watchdog = setTimeout(() => controller.abort(), 180_000); // Test budget only.
try {
  const session = await client.createOrResumeSession(workspace, undefined, { model }, {
    ...process.env,
    HOME: workspace, USERPROFILE: workspace,
    XDG_CONFIG_HOME: configDirectory, XDG_DATA_HOME: join(workspace, "data"), XDG_CACHE_HOME: join(workspace, "cache"), XDG_STATE_HOME: join(workspace, "state"),
    OPENCODE_CONFIG_DIR: configDirectory, OPENCODE_CLIENT: "desktop", OPENCODE_CONFIG_CONTENT: JSON.stringify(runtimeConfig),
  });
  console.log(JSON.stringify({ phase: "session", sessionId: session.sessionId, provider: "pptoken-grok", model: profile.model, workspace }));
  let answering: Promise<void> | undefined;
  await client.prompt(session.sessionId, workspace, "native-question-smoke", "这是一项接入回归测试：请先用 question 工具让我选择受众（内部同事或外部客户）。我回答后，仅确认选择，不生成文件。", { model }, event => {
    events.push(event);
    if (event.event === "question_request") {
      console.log(JSON.stringify({ phase: "question", requestId: event.requestId, count: event.questions.length }));
      answering = client.replyQuestion(session.sessionId, event.requestId, event.questions.map(question => [question.options[0]?.label ?? "内部同事"]), workspace);
      void answering.catch(() => controller.abort());
    }
    if (event.event === "done" || event.event === "runtime_error") console.log(JSON.stringify({ phase: "terminal", event: event.event, ...(event.event === "runtime_error" ? { code: event.code } : {}) }));
  }, controller.signal, undefined, undefined, "dashi-ppt");
  await answering;
  assert.ok(events.some(event => event.event === "question_request"), "native question must be delivered");
  assert.ok(events.some(event => event.event === "question_response"), "native question response must be delivered");
  assert.ok(events.some(event => event.event === "done"), "native task must finish");
  assert.ok(!events.some(event => event.event === "runtime_error"), "no runtime errors");
  console.log(JSON.stringify({ phase: "passed", textLength: events.filter(event => event.event === "text_delta").map(event => event.delta).join("").length }));
} finally {
  clearTimeout(watchdog);
  await client.stop();
}
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
