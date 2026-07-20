import assert from "node:assert/strict"
import test from "node:test"

import { resolveWorkflowFeatures } from "@/lib/workflows/features"

test("workflow feature flags only enable on exact 1", () => {
  const features = resolveWorkflowFeatures({
    WORKFLOW_NODE_REGISTRY_V2: "true",
    WORKFLOW_DEFINITION_V2_WRITE: "1",
    WORKFLOW_ITERATIONS_V1: "0",
    WORKFLOW_OPENAI_IMAGE_ADAPTER_V1: "01",
  })
  assert.deepEqual(features, {
    nodeRegistryV2: false,
    definitionV2Write: true,
    iterationsV1: false,
    openAiImageAdapterV1: false,
  })
})

test("iteration feature requires a 32-byte confirmation secret", () => {
  assert.throws(
    () => resolveWorkflowFeatures({ WORKFLOW_ITERATIONS_V1: "1", WORKFLOW_CONFIRMATION_SECRET: "short" }),
    /workflow_confirmation_secret_invalid/,
  )
  assert.equal(
    resolveWorkflowFeatures({ WORKFLOW_ITERATIONS_V1: "1", WORKFLOW_CONFIRMATION_SECRET: "01234567890123456789012345678901" }).iterationsV1,
    true,
  )
})
