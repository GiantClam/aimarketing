import test from "node:test";
import assert from "node:assert/strict";
import { createSessionRecoverySnapshot } from "../src/session-recovery";

test("session recovery snapshot is bounded, text-only, and preserves turn order", () => {
  const snapshot = createSessionRecoverySnapshot([
    { role: "user", content: " first request\n" },
    { role: "assistant", content: "first answer" },
    { role: "user", content: "\u0000follow-up" },
  ]);
  assert.match(snapshot, /read-only conversation snapshot/);
  assert.match(snapshot, /Do not repeat, resume, or claim completion of any prior tool action/);
  assert.match(snapshot, /User: first request\nAssistant: first answer\nUser: follow-up/);
});

test("session recovery snapshot keeps the latest bounded transcript", () => {
  const history = Array.from({ length: 20 }, (_, index) => ({ role: index % 2 ? "assistant" as const : "user" as const, content: `turn-${index}` }));
  const snapshot = createSessionRecoverySnapshot(history);
  assert.doesNotMatch(snapshot, /turn-0/);
  assert.match(snapshot, /turn-19/);
  assert.equal((snapshot.match(/(?:User|Assistant):/g) ?? []).length, 12);
});

test("session recovery snapshot truncates an oversized latest turn instead of dropping all context", () => {
  const snapshot = createSessionRecoverySnapshot([
    { role: "user", content: "older request" },
    { role: "assistant", content: `latest-${"x".repeat(20_000)}` },
  ]);
  assert.match(snapshot, /Assistant: latest-/u);
  assert.ok(snapshot.length < 13_000);
});
