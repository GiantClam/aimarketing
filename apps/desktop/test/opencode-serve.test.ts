import test from "node:test";
import assert from "node:assert/strict";
import { completedNewAssistant } from "../runtime/opencode-serve";

function assistant(completed?: number, error?: unknown) {
  return { info: { role: "assistant", time: completed === undefined ? undefined : { completed }, ...(error ? { error } : {}) } };
}

test("OpenCode turn completion ignores an already completed assistant", () => {
  const messages = [assistant(1_000)];
  assert.deepEqual(completedNewAssistant(messages, 1), { completed: false, error: "" });
  assert.deepEqual(completedNewAssistant([...messages, assistant()], 1), { completed: false, error: "" });
  assert.deepEqual(completedNewAssistant([...messages, assistant(2_000)], 1), { completed: true, error: "" });
});

test("OpenCode turn completion surfaces errors only for a new assistant", () => {
  const messages = [assistant(1_000)];
  assert.deepEqual(completedNewAssistant([...messages, assistant(undefined, { message: "provider failed" })], 1), { completed: false, error: "opencode_error:provider failed" });
});
