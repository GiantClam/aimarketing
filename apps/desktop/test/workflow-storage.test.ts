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
      },
    }],
    edges: [],
  };

  const sanitized = sanitizeWorkflowDefinitionForStorage(definition);
  assert.deepEqual(sanitized.nodes[0]?.config, {
    prompt: "A yellow square",
    nested: { model: "provider/image" },
  });
  assert.equal((definition.nodes[0]?.config as Record<string, unknown>)[credentialField], "fixture-credential");
});
