import test from "node:test";
import assert from "node:assert/strict";
import type { WorkflowCapabilityPort } from "../src/index";

test("workflow capability port is host-neutral", () => {
  const port: WorkflowCapabilityPort = { execute: async () => ({ text: "ok" }) };
  assert.equal(typeof port.execute, "function");
});
