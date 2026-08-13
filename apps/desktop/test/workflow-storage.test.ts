import assert from "node:assert/strict";
import test from "node:test";

import type { WorkflowDefinitionEnvelope } from "@aimarketing/workflow-core";
import { sanitizeWorkflowDefinitionForStorage } from "../src/workflow-storage";

test("workflow persistence removes provider credentials without changing executable fields", () => {
  const credentialField = ["api", "Key"].join("");
  const definition: WorkflowDefinitionEnvelope = {
    schemaVersion: 2,
    revision: 1,
    definitionHash: "",
    nodes: [{
      nodeKey: "image",
      type: "image_generate" as const,
      nodeVersion: 1,
      title: "Image",
      positionX: 0,
      positionY: 0,
      config: {
        prompt: "A yellow square",
        [credentialField]: "fixture-credential",
        nested: { access_token: "also-do-not-store", model: "provider/image" },
        provider: "provider-a",
        baseUrl: "https://provider.invalid/v1",
        project_id: "database-project-id",
        referencedArtifactIds: ["artifact-1", "artifact-2"],
        sourcePath: "C:\\Users\\alice\\Desktop\\input.png",
        relativePath: "attachments/input.png",
      },
    }],
    edges: [],
  };

  const sanitized = sanitizeWorkflowDefinitionForStorage(definition);
  assert.deepEqual(sanitized.nodes[0]?.config, {
    prompt: "A yellow square",
    nested: {},
    relativePath: "attachments/input.png",
  });
  assert.equal((definition.nodes[0]?.config as Record<string, unknown>)[credentialField], "fixture-credential");
});

test("workflow portability drops database/provider bindings but keeps relative file references", () => {
  const definition = {
    schemaVersion: 2,
    revision: 1,
    definitionHash: "",
    nodes: [{ nodeKey: "input", type: "upload", nodeVersion: 1, title: "Upload", positionX: 0, positionY: 0, config: {
      workspacePath: "D:\\old-machine\\projects",
      vaultPath: "vault",
      indexPath: "index",
      uploadedFiles: ["attachments/a.txt", "D:\\old-machine\\a.txt"],
      nested: { runId: "run-1", targetPath: "notes/output.md" },
    } }],
    edges: [],
  } as never;
  const sanitized = sanitizeWorkflowDefinitionForStorage(definition);
  assert.deepEqual(sanitized.nodes[0]?.config, {
    vaultPath: "vault",
    indexPath: "index",
    uploadedFiles: ["attachments/a.txt"],
    nested: { targetPath: "notes/output.md" },
  });
});
