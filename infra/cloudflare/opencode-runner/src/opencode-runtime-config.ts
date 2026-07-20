import type { AgentRuntimeInputV2, OpenCodeProviderConfig } from "../../../../lib/ai-runtime/contracts"
import type { createOpencode } from "@cloudflare/sandbox/opencode"
import { providerRuntimeKey } from "./opencode-provider"

type RuntimeConfig = NonNullable<NonNullable<Parameters<typeof createOpencode>[1]>["config"]>

export function buildRuntimeConfig(input: AgentRuntimeInputV2, provider: OpenCodeProviderConfig): RuntimeConfig {
  const sharedAgent = input.sharedSkillSetSelection?.runtimeKind === "shared-agent"
  const tools: Record<string, boolean> | undefined = input.agentId === "executive-presentation-ppt"
    ? {
        bash: true, read: true, write: true, edit: true, glob: true, grep: true, list: true, skill: true,
        question: false, todowrite: true, lsp: true, doom_loop: true,
        websearch: input.policy.allowNetwork, webfetch: input.policy.allowNetwork,
      }
    : sharedAgent ? { read: true, glob: true, grep: true, list: true, skill: true } : undefined
  return {
    share: "disabled" as const,
    autoupdate: false as const,
    plugin: [],
    ...(input.agentId === "executive-presentation-ppt" ? { default_agent: "build" as const } : {}),
    ...(tools ? { tools } : {}),
    permission: {
      read: "allow" as const,
      edit: sharedAgent ? "deny" as const : "allow" as const,
      bash: sharedAgent ? "deny" as const : "allow" as const,
      glob: "allow" as const,
      grep: "allow" as const,
      list: "allow" as const,
      websearch: input.agentId === "executive-presentation-ppt" && input.policy.allowNetwork ? "allow" as const : "deny" as const,
      webfetch: !sharedAgent && input.policy.allowNetwork ? "allow" as const : "deny" as const,
      task: input.agentId === "executive-presentation-ppt" ? "allow" as const : "deny" as const,
      skill: input.agentId === "executive-presentation-ppt" || sharedAgent ? "allow" as const : "deny" as const,
      question: "deny" as const,
      todowrite: input.agentId === "executive-presentation-ppt" ? "allow" as const : "deny" as const,
      lsp: input.agentId === "executive-presentation-ppt" ? "allow" as const : "deny" as const,
      doom_loop: input.agentId === "executive-presentation-ppt" ? "allow" as const : "deny" as const,
      external_directory: input.agentId === "executive-presentation-ppt" ? "allow" as const : "deny" as const,
      delete: "deny" as const,
    },
    provider: (() => {
      const runtime = providerRuntimeKey(provider.providerId)
      return {
        [runtime.configKey]: {
          npm: "@ai-sdk/openai-compatible",
          name: runtime.configKey,
          options: {
            baseURL: provider.baseUrl,
            apiKey: `{env:${runtime.envKey}}`,
          },
          models: { [provider.modelId]: { name: provider.modelId } },
        },
      }
    })(),
  } as RuntimeConfig
}
