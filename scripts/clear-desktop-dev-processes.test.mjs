import test from "node:test";
import assert from "node:assert/strict";
import { parseWindowsListeningPids } from "./clear-desktop-dev-processes.mjs";

test("desktop dev cleanup finds every Windows listener on the configured port once", () => {
  const output = [
    "  TCP    127.0.0.1:1420      0.0.0.0:0      LISTENING       1234",
    "  TCP    0.0.0.0:1420        0.0.0.0:0      LISTENING       1234",
    "  TCP    [::1]:1420          [::]:0         LISTENING       5678",
    "  TCP    127.0.0.1:1421      0.0.0.0:0      LISTENING       9999",
    "  TCP    127.0.0.1:1420      0.0.0.0:0      ESTABLISHED     1111",
  ].join("\n");
  assert.deepEqual(parseWindowsListeningPids(output, 1420), [1234, 5678]);
});
