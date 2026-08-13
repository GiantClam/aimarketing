import test from "node:test";
import assert from "node:assert/strict";
import { scanSourceText } from "./validate-shared-package-boundaries.mjs";

test("rejects host-specific imports", () => {
  const violations = scanSourceText(
    'import { redirect } from "next/navigation";\nimport { db } from "@/lib/db";',
    "fixture.ts",
  );
  assert.equal(violations.length, 2);
  assert.deepEqual(violations.map(({ line }) => line), [1, 2]);
});

test("rejects SaaS infrastructure imports", () => {
  const violations = scanSourceText('import { charge } from "@/lib/billing/charge";', "fixture.ts");
  assert.equal(violations.length, 1);
});

test("allows host-neutral ports and standard libraries", () => {
  const violations = scanSourceText(
    'import type { ArtifactPort } from "./ports";\nimport { randomUUID } from "node:crypto";',
    "fixture.ts",
  );
  assert.deepEqual(violations, []);
});
