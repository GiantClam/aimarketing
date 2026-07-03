import assert from "node:assert/strict"
import test from "node:test"

import {
  buildGovernedAiEntryModelCatalog,
  buildGovernedWorkflowImageProviderOptions,
  canUserAccessAssignedRoute,
  type RuntimeProviderLike,
} from "./model-governance-core"

const runtimeProviders: RuntimeProviderLike[] = [
  {
    id: "deepseek",
    scope: "text",
    configured: true,
    active: false,
    model: "deepseek-v4-pro",
    baseURL: "https://api.deepseek.com",
  },
  {
    id: "pptoken",
    scope: "text",
    configured: true,
    active: true,
    model: "gpt-5.4-mini",
    baseURL: "https://pptoken.example/v1",
  },
  {
    id: "openrouter",
    scope: "text",
    configured: true,
    active: false,
    model: "claude-sonnet-4.6",
    baseURL: "https://openrouter.example/v1",
  },
  {
    id: "aiberm",
    scope: "text",
    configured: true,
    active: false,
    model: "gpt-5.4",
    baseURL: "https://aiberm.example/v1",
  },
]

test("canUserAccessAssignedRoute allows open routes and blocks inactive enterprise users", () => {
  assert.equal(canUserAccessAssignedRoute({ user: null, assignedUserIds: [] }), true)
  assert.equal(canUserAccessAssignedRoute({ user: { id: 8, enterpriseId: 3, enterpriseRole: "member", enterpriseStatus: "pending" }, assignedUserIds: [] }), false)
  assert.equal(canUserAccessAssignedRoute({ user: { id: 8, enterpriseId: 3, enterpriseRole: "member", enterpriseStatus: "active" }, assignedUserIds: [12] }), false)
  assert.equal(canUserAccessAssignedRoute({ user: { id: 8, enterpriseId: 3, enterpriseRole: "admin", enterpriseStatus: "active" }, assignedUserIds: [12] }), true)
})

test("buildGovernedAiEntryModelCatalog keeps only account-visible runtime models", () => {
  const catalog = buildGovernedAiEntryModelCatalog({
    user: {
      id: 11,
      enterpriseId: 2,
      enterpriseRole: "member",
      enterpriseStatus: "active",
    },
    runtimeProviders,
    assignments: [
      { routeId: "pptoken", assignedUserIds: [11] },
      { routeId: "openrouter", assignedUserIds: [99] },
    ],
  })

  assert.equal(catalog.selectedProviderId, "pptoken")
  assert.equal(catalog.selectedModelId, "pptoken::gpt-5.4-mini")
  assert.deepEqual(catalog.providers.map((item) => item.id), ["deepseek", "pptoken", "aiberm"])
  assert.deepEqual(catalog.models.map((item) => item.id), [
    "deepseek::deepseek-v4-pro",
    "pptoken::gpt-5.4-mini",
    "aiberm::gpt-5.4",
  ])
})

test("buildGovernedAiEntryModelCatalog falls back when requested provider is not accessible", () => {
  const catalog = buildGovernedAiEntryModelCatalog({
    user: {
      id: 11,
      enterpriseId: 2,
      enterpriseRole: "member",
      enterpriseStatus: "active",
    },
    runtimeProviders,
    assignments: [{ routeId: "openrouter", assignedUserIds: [99] }],
    requestedProviderId: "openrouter",
  })

  assert.equal(catalog.selectedProviderId, "pptoken")
  assert.equal(catalog.selectedModelId, "pptoken::gpt-5.4-mini")
})

test("buildGovernedAiEntryModelCatalog prefers the configured default-model provider when present", () => {
  const previous = process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL
  process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL = "deepseek-v4-pro"

  try {
    const catalog = buildGovernedAiEntryModelCatalog({
      user: {
        id: 11,
        enterpriseId: 2,
        enterpriseRole: "member",
        enterpriseStatus: "active",
      },
      runtimeProviders,
      assignments: [],
    })

    assert.equal(catalog.selectedProviderId, "deepseek")
    assert.equal(catalog.selectedModelId, "deepseek::deepseek-v4-pro")
  } finally {
    if (typeof previous === "string") {
      process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL = previous
    } else {
      delete process.env.AI_ENTRY_NORMAL_DEFAULT_MODEL
    }
  }
})

test("buildGovernedWorkflowImageProviderOptions respects account assignments", () => {
  const providers = buildGovernedWorkflowImageProviderOptions({
    user: {
      id: 7,
      enterpriseId: 4,
      enterpriseRole: "member",
      enterpriseStatus: "active",
    },
    providers: [
      { providerId: "pptoken", label: "PPTOKEN", models: [{ modelId: "gpt-image-2", label: "gpt-image-2" }] },
      { providerId: "aiberm", label: "Aiberm", models: [{ modelId: "gpt-image-2", label: "gpt-image-2" }] },
      { providerId: "crazyroute", label: "CrazyRouter", models: [{ modelId: "gpt-image-2", label: "gpt-image-2" }] },
    ],
    assignments: [
      { routeId: "pptoken", assignedUserIds: [7] },
      { routeId: "aiberm", assignedUserIds: [99] },
    ],
  })

  assert.deepEqual(providers.map((item) => item.providerId), ["pptoken", "crazyroute"])
  assert.equal(providers[0]?.models[0]?.modelId, "gpt-image-2")
})
