import assert from "node:assert/strict"
import test from "node:test"

import { getFallbackReferenceAssetIdsFromVersions, shouldUseImplicitEditMode } from "./turn-routing"

test("fallback reference prefers selected version candidate asset", () => {
  const result = getFallbackReferenceAssetIdsFromVersions({
    versions: [
      {
        id: "v2",
        selected_candidate_id: "c2",
        candidates: [
          { id: "c2", asset_id: "asset-2" },
          { id: "c3", asset_id: "asset-3" },
        ],
      },
      {
        id: "v1",
        selected_candidate_id: "c1",
        candidates: [{ id: "c1", asset_id: "asset-1" }],
      },
    ],
    selectedVersionId: "v2",
    currentVersionId: "v1",
  })

  assert.deepEqual(result, ["asset-2"])
})

test("fallback reference can resolve from current version when selected has no candidate", () => {
  const result = getFallbackReferenceAssetIdsFromVersions({
    versions: [
      {
        id: "v3",
        selected_candidate_id: null,
        candidates: [],
      },
      {
        id: "v2",
        selected_candidate_id: "c2",
        candidates: [{ id: "c2", asset_id: "asset-2" }],
      },
    ],
    selectedVersionId: "v3",
    currentVersionId: "v2",
  })

  assert.deepEqual(result, ["asset-2"])
})

test("implicit edit mode is enabled for follow-up replacement prompt with inherited reference", () => {
  const shouldPromote = shouldUseImplicitEditMode({
    requestedKind: "generate",
    prompt: "Change the person in the previous image to a Chinese worker",
    guidedSelection: null,
    explicitReferenceCount: 0,
    fallbackReferenceCount: 1,
  })

  assert.equal(shouldPromote, true)
})

test("implicit edit mode stays off during guided selection turns", () => {
  const shouldPromote = shouldUseImplicitEditMode({
    requestedKind: "generate",
    prompt: "Change the person in the previous image to a Chinese worker",
    guidedSelection: {
      source_message_id: "123",
      question_id: "resolution",
      option_id: "1K",
    },
    explicitReferenceCount: 0,
    fallbackReferenceCount: 1,
  })

  assert.equal(shouldPromote, false)
})

test("implicit edit mode is enabled for explicit references when prompt asks upscale edit", () => {
  const shouldPromote = shouldUseImplicitEditMode({
    requestedKind: "generate",
    prompt: "变成高清4k",
    guidedSelection: null,
    explicitReferenceCount: 1,
    fallbackReferenceCount: 0,
  })

  assert.equal(shouldPromote, true)
})

test("implicit edit mode stays off for explicit references without edit intent", () => {
  const shouldPromote = shouldUseImplicitEditMode({
    requestedKind: "generate",
    prompt: "Use this image as style reference and generate a new campaign poster",
    guidedSelection: null,
    explicitReferenceCount: 1,
    fallbackReferenceCount: 0,
  })

  assert.equal(shouldPromote, false)
})
