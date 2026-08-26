import assert from "node:assert/strict";
import test from "node:test";
import { groupReasoningParts, isKnownAIElementPart, toAIElementPlanStep, toAIElementStatus } from "../src/adapters";

test("AI Elements adapter maps Workbench statuses and consolidates reasoning", () => {
  assert.equal(toAIElementStatus("blocked"), "waiting");
  assert.deepEqual(toAIElementPlanStep({ id: "p1", title: "Research", status: "completed" }), { id: "p1", title: "Research", status: "completed" });
  assert.equal(groupReasoningParts([{ id: "r1", type: "reasoning", text: "one", status: "completed" }, { id: "r2", type: "reasoning", text: "two", status: "running" }]), "one\ntwo");
});

test("AI Elements adapter identifies supported and fallback parts", () => {
  assert.equal(isKnownAIElementPart({ id: "text", type: "text", text: "hello" }), true);
  assert.equal(isKnownAIElementPart({ id: "usage", type: "usage", usage: { runId: "run", model: "model" } }), false);
});
