import test from "node:test";
import assert from "node:assert/strict";
import { compatibilitySurfaceHasSharedOwner, scanDesktopSourceText, scanSharedImplementationProvenance } from "./validate-shared-implementation-provenance.mjs";

test("detects desktop imports that bypass a shared compatibility surface", () => {
  assert.deepEqual(
    scanDesktopSourceText('import { validateWorkflowDefinition } from "@/lib/workflows/workflow-definition-v2";', "desktop.ts"),
    [{ filePath: "desktop.ts", reason: "desktop_imports_legacy_shared_surface" }],
  );
  assert.deepEqual(scanDesktopSourceText('import { validateWorkflowDefinition } from "@aimarketing/workflow-core";'), []);
});

test("requires compatibility surfaces to name their shared owner", () => {
  assert.equal(compatibilitySurfaceHasSharedOwner('export * from "@aimarketing/workflow-core";', "@aimarketing/workflow-core"), true);
  assert.equal(compatibilitySurfaceHasSharedOwner('export const localCopy = true;', "@aimarketing/workflow-core"), false);
});

test("production compatibility surfaces and desktop use their shared implementation owners", () => {
  assert.deepEqual(scanSharedImplementationProvenance(), []);
});
