import { capabilityForWorkflowAction, providerForCapability, type DesktopProviderConfig } from "./provider-config";
import type { WorkflowDefinitionEnvelope, WorkflowNodeType } from "@coworkany/workflow-core";

type WorkflowProviderConfig = {
  readonly provider: DesktopProviderConfig;
  readonly providers?: Readonly<Record<string, DesktopProviderConfig>>;
  readonly defaults?: Partial<Record<"text" | "image" | "video" | "audio", string>>;
};

const PROVIDER_NODE_TYPES = new Set<WorkflowNodeType>([
  "writer",
  "llm_generate",
  "agent_execute",
  "ppt_generate",
  "image_generate",
  "video_generate",
  "digital_human",
  "music_generate",
  "voice_synthesis",
  "voice_clone",
  "audio_generate",
]);

/**
 * Rebind provider-backed nodes only for the in-memory host request. Persisted/exported
 * definitions are sanitized separately so Provider/model bindings never
 * become portable state. Each capability resolves its own configured profile,
 * which is required for mixed image/video/audio workflows.
 */
export function bindWorkflowProviderDefaults(definition: WorkflowDefinitionEnvelope, config: WorkflowProviderConfig): WorkflowDefinitionEnvelope {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      if (!PROVIDER_NODE_TYPES.has(node.type as WorkflowNodeType)) return node;
      const provider = providerForCapability(config, capabilityForWorkflowAction(node.type as WorkflowNodeType));
      // Provider bindings are rebuilt from the current local profile. Remove
      // stale workflow IDs from imported definitions so a developer account's
      // private workflow cannot survive a provider switch.
      const nodeConfig = Object.fromEntries(Object.entries(node.config).filter(([key]) => !["apiKey", "workflowId", "digitalHumanWorkflowId", "videoEnhanceWorkflowId"].includes(key)));
      // Media feature tabs can select a model that is not the profile's first
      // model. Keep that explicit music selection; otherwise the audio profile
      // (often configured for speech) silently changes a music request back to
      // its speech model before it reaches the provider adapter.
      const selectedMusicModel = node.type === "music_generate" && typeof nodeConfig.model === "string" && nodeConfig.model.trim() && /music/iu.test(nodeConfig.model)
        ? nodeConfig.model.trim()
        : undefined;
      const boundModel = selectedMusicModel ?? provider.model;
      return {
        ...node,
        config: {
          ...nodeConfig,
          provider: provider.id,
          model: boundModel,
          baseUrl: provider.baseUrl,
          ...(provider.endpoint ? { endpoint: provider.endpoint } : {}),
          ...(provider.queryEndpoint ? { queryEndpoint: provider.queryEndpoint } : {}),
          ...(node.type === "image_generate" && ("selectedProviderId" in nodeConfig || "selectedModelId" in nodeConfig)
            ? { selectedProviderId: provider.id, selectedModelId: boundModel }
            : {}),
        },
      };
    }),
  };
}

export function isMediaWorkflowNodeType(type: string): type is WorkflowNodeType {
  return PROVIDER_NODE_TYPES.has(type as WorkflowNodeType) && !["writer", "llm_generate", "agent_execute", "ppt_generate"].includes(type);
}
