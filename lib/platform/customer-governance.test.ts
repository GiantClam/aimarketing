import assert from "node:assert/strict"
import { createRequire } from "node:module"
import test from "node:test"

import { buildDefaultEnterpriseModelConfiguration } from "@/lib/platform/model-config"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let buildCustomerGovernanceSnapshot: typeof import("./customer-governance").buildCustomerGovernanceSnapshot
let normalizeCustomerGovernanceSettingsPatch: typeof import("./customer-governance").normalizeCustomerGovernanceSettingsPatch

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "@/lib/platform/runtime") {
    return {
      getPlatformRuntimeSnapshot: () => ({
        generatedAt: "2026-06-11T00:00:00.000Z",
        activeTextProvider: "openai",
        providers: [],
        entitlements: [],
        tasks: [],
      }),
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

test.before(async () => {
  const module = await import("./customer-governance")
  buildCustomerGovernanceSnapshot = module.buildCustomerGovernanceSnapshot
  normalizeCustomerGovernanceSettingsPatch = module.normalizeCustomerGovernanceSettingsPatch
})

test.after(() => {
  nodeModule._load = originalLoad
})

test("buildCustomerGovernanceSnapshot maps member, credit, runtime, and sso posture", () => {
  const snapshot = buildCustomerGovernanceSnapshot({
    memberCounts: {
      total: 12,
      active: 9,
    },
    seatLimit: 15,
    sharedCredits: 3200,
    currentPlan: "Growth",
    recentLedgerEntries: 8,
    recentLedgerNetCredits: -420,
    runtime: {
      generatedAt: "2026-06-11T00:00:00.000Z",
      activeTextProvider: "openai",
      providers: [],
      entitlements: [],
      tasks: [
        {
          id: "task-ai-chat",
          capabilitySlug: "ai-chat",
          title: "AI Chat",
          mode: "interactive",
          enabled: true,
          runtimeId: "ai-entry",
          statuses: ["running"],
          notes: [],
        },
        {
          id: "task-ai-ppt",
          capabilitySlug: "ai-ppt",
          title: "AI PPT",
          mode: "deferred",
          enabled: true,
          runtimeId: "lead-tools",
          statuses: ["queued"],
          notes: [],
        },
        {
          id: "task-ai-video",
          capabilitySlug: "ai-video",
          title: "AI Video",
          mode: "async",
          enabled: false,
          runtimeId: "runninghub",
          statuses: ["queued"],
          notes: [],
        },
      ],
    },
    settings: {
      ssoDomain: "acme.com",
      seatRequestNote: "Route seat increases through procurement.",
      runtimeIntakeMode: "admin_review",
      modelConfig: buildDefaultEnterpriseModelConfiguration(),
      updatedAt: "2026-06-11T00:00:00.000Z",
    },
    canManageSettings: true,
  })

  assert.deepEqual(snapshot.members, {
    total: 12,
    active: 9,
    seatLimit: 15,
  })
  assert.deepEqual(snapshot.usage, {
    sharedCredits: 3200,
    currentPlan: "Growth",
    recentLedgerEntries: 8,
    recentLedgerNetCredits: -420,
  })
  assert.equal(snapshot.sso.status, "configured")
  assert.equal(snapshot.sso.domain, "acme.com")
  assert.equal(snapshot.runtimes.find((item) => item.slug === "ai-chat")?.status, "ready")
  assert.equal(snapshot.runtimes.find((item) => item.slug === "ai-ppt")?.status, "deferred")
  assert.equal(snapshot.runtimes.find((item) => item.slug === "ai-video")?.status, "runtime_disabled")
  assert.equal(snapshot.canManageSettings, true)
})

test("normalizeCustomerGovernanceSettingsPatch trims values and keeps supported modes", () => {
  const validModelConfig = buildDefaultEnterpriseModelConfiguration()
  validModelConfig.text_generation.providers[0] = {
    ...validModelConfig.text_generation.providers[0],
    baseUrl: "https://openrouter.ai/api/v1",
  }

  assert.deepEqual(
    normalizeCustomerGovernanceSettingsPatch({
      ssoDomain: "  acme.com  ",
      seatRequestNote: "  Review seat upgrades weekly.  ",
      runtimeIntakeMode: "admin_review",
      modelConfig: validModelConfig,
    }),
    {
      ssoDomain: "acme.com",
      seatRequestNote: "Review seat upgrades weekly.",
      runtimeIntakeMode: "admin_review",
      modelConfig: validModelConfig,
    },
  )

  assert.deepEqual(
    normalizeCustomerGovernanceSettingsPatch({
      ssoDomain: "   ",
      seatRequestNote: "",
      runtimeIntakeMode: "unsupported" as never,
      modelConfig: validModelConfig,
    }),
    {
      ssoDomain: null,
      seatRequestNote: null,
      runtimeIntakeMode: "workspace_default",
      modelConfig: validModelConfig,
    },
  )
})

test("normalizeCustomerGovernanceSettingsPatch rejects selected OpenAI compatible providers without base url", () => {
  const modelConfig = buildDefaultEnterpriseModelConfiguration()
  modelConfig.text_generation.selectedProviderId = "openai_compatible"
  modelConfig.text_generation.providers[0] = {
    ...modelConfig.text_generation.providers[0],
    modelId: "gpt-4.1-mini",
    baseUrl: null,
  }

  assert.throws(
    () =>
      normalizeCustomerGovernanceSettingsPatch({
        modelConfig,
      }),
    /base_url_required:text_generation:openai_compatible/,
  )
})

test("normalizeCustomerGovernanceSettingsPatch allows untouched default model config placeholders", () => {
  const modelConfig = buildDefaultEnterpriseModelConfiguration()

  assert.doesNotThrow(() =>
    normalizeCustomerGovernanceSettingsPatch({
      seatRequestNote: "Leave defaults untouched for now.",
      modelConfig,
    }),
  )
})
