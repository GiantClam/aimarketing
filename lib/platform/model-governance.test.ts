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

test("buildGovernedAiEntryModelCatalog exposes PPToken Grok when its dedicated account is configured", () => {
  const previous = {
    pptoken: process.env.AI_ENTRY_PPTOKEN_API_KEY,
    grok: process.env.AI_ENTRY_PPTOKEN_GROK_API_KEY,
    grokBaseUrl: process.env.AI_ENTRY_PPTOKEN_GROK_BASE_URL,
  }
  process.env.AI_ENTRY_PPTOKEN_API_KEY = "pptoken-gpt-key"
  process.env.AI_ENTRY_PPTOKEN_GROK_API_KEY = "pptoken-grok-key"
  process.env.AI_ENTRY_PPTOKEN_GROK_BASE_URL = "https://grok.pptoken.example/v1"

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

    assert.equal(catalog.models.some((item) => item.providerId === "pptoken" && item.modelId === "grok-4.5"), true)
  } finally {
    if (previous.pptoken === undefined) delete process.env.AI_ENTRY_PPTOKEN_API_KEY
    else process.env.AI_ENTRY_PPTOKEN_API_KEY = previous.pptoken
    if (previous.grok === undefined) delete process.env.AI_ENTRY_PPTOKEN_GROK_API_KEY
    else process.env.AI_ENTRY_PPTOKEN_GROK_API_KEY = previous.grok
    if (previous.grokBaseUrl === undefined) delete process.env.AI_ENTRY_PPTOKEN_GROK_BASE_URL
    else process.env.AI_ENTRY_PPTOKEN_GROK_BASE_URL = previous.grokBaseUrl
  }
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

test("buildGovernedAiEntryModelCatalog keeps platform models visible when enterprise default is selected", () => {
  const catalog = buildGovernedAiEntryModelCatalog({
    user: {
      id: 11,
      enterpriseId: 2,
      enterpriseRole: "member",
      enterpriseStatus: "active",
    },
    runtimeProviders: [
      {
        id: "enterprise-openai-compatible",
        scope: "text",
        configured: true,
        active: true,
        model: "deepseek-v4-pro",
        baseURL: "https://api.deepseek.com",
      },
      ...runtimeProviders,
    ],
    assignments: [],
    preferredSelectedProviderId: "enterprise-openai-compatible",
    disableEnvDefaultPreference: true,
  })

  assert.equal(catalog.selectedProviderId, "enterprise-openai-compatible")
  assert.equal(catalog.selectedModelId, "enterprise-openai-compatible::deepseek-v4-pro")
  assert.deepEqual(catalog.providers.map((item) => item.id), [
    "enterprise-openai-compatible",
    "deepseek",
    "pptoken",
    "openrouter",
    "aiberm",
  ])
  assert.deepEqual(catalog.models.map((item) => item.id), [
    "enterprise-openai-compatible::deepseek-v4-pro",
    "deepseek::deepseek-v4-pro",
    "pptoken::gpt-5.4-mini",
    "openrouter::claude-sonnet-4.6",
    "aiberm::gpt-5.4",
  ])
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
