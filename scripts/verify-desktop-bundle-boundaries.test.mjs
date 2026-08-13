import assert from "node:assert/strict";
import test from "node:test";

import { scanDesktopBundle } from "./verify-desktop-bundle-boundaries.mjs";

test("desktop bundle boundary scan accepts local workbench markers and Full Access warning copy", () => {
  assert.deepEqual(scanDesktopBundle([{ filePath: "fixture.js", source: "OpenCode Full Access · local artifacts · /api/local-only" }]), []);
});

test("desktop bundle boundary scan rejects excluded SaaS routes and capabilities", () => {
  const violations = scanDesktopBundle([{ filePath: "fixture.js", source: "fetch('/api/billing/credits'); lead-hunter marketplace" }]);
  assert.deepEqual(violations.map((item) => item.label), ["SaaS API route", "excluded desktop capability"]);
});

test("desktop bundle boundary scan does not match words embedded in ordinary copy", () => {
  assert.deepEqual(scanDesktopBundle([{ filePath: "fixture.js", source: "modify files directly; configurable" }]), []);
});
