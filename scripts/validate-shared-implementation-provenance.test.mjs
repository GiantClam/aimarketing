import test from "node:test";
import assert from "node:assert/strict";
import { compatibilitySurfaceHasSharedOwner, GENERATED_DESKTOP_DIRECTORIES, scanDesktopSourceText, scanSharedImplementationProvenance } from "./validate-shared-implementation-provenance.mjs";

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

test("ignores generated desktop bundles when scanning source provenance", () => {
  assert.deepEqual(GENERATED_DESKTOP_DIRECTORIES, [".opencode", ".opencode-server", "dist", "dist-runtime", "node_modules", "target"]);
});

test("production compatibility surfaces and desktop use their shared implementation owners", () => {
  assert.deepEqual(scanSharedImplementationProvenance(), []);
});
