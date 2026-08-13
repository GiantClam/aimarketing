import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("desktop OpenCode uses the shared synchronous serve-session contract", () => {
  const source = readFileSync(resolve(process.cwd(), "runtime/opencode-serve.ts"), "utf8");
  assert.match(source, /createOpenCodeServeSessionPayload/);
  assert.match(source, /createOpenCodeServePromptPayload/);
  assert.match(source, /openCodeServeSessionPath\(sessionId, workspacePath, "message"\)/);
  assert.match(source, /30 \* 60 \* 1000/);
  assert.doesNotMatch(source, /prompt_async/);
});
