import { capabilityForWorkflowAction, providerForCapability, type DesktopProviderConfig } from "./provider-config";
import type { WorkflowDefinitionEnvelope, WorkflowNodeType } from "@aimarketing/workflow-core";

type WorkflowProviderConfig = {
  readonly provider: DesktopProviderConfig;
  readonly providers?: Readonly<Record<string, DesktopProviderConfig>>;
  readonly defaults?: Partial<Record<"text" | "image" | "video" | "audio", string>>;
};

const MEDIA_NODE_TYPES = new Set<WorkflowNodeType>([
  "image_generate",
  "video_generate",
  "digital_human",
  "music_generate",
  "voice_synthesis",
  "voice_clone",
  "audio_generate",
]);

/**
 * Rebind media nodes only for the in-memory host request. Persisted/exported
 * definitions are sanitized separately so Provider/model bindings never
 * become portable state. Each capability resolves its own configured profile,
 * which is required for mixed image/video/audio workflows.
 */
export function bindWorkflowProviderDefaults(definition: WorkflowDefinitionEnvelope, config: WorkflowProviderConfig): WorkflowDefinitionEnvelope {
  return {
    ...definition,
    nodes: definition.nodes.map((node) => {
      if (!MEDIA_NODE_TYPES.has(node.type as WorkflowNodeType)) return node;
      const provider = providerForCapability(config, capabilityForWorkflowAction(node.type as WorkflowNodeType));
      return {
        ...node,
        config: {
          ...node.config,
          provider: provider.id,
          model: provider.model,
          baseUrl: provider.baseUrl,
          ...(provider.endpoint ? { endpoint: provider.endpoint } : {}),
          ...(provider.queryEndpoint ? { queryEndpoint: provider.queryEndpoint } : {}),
        },
      };
    }),
  };
}

export function isMediaWorkflowNodeType(type: string): type is WorkflowNodeType {
  return MEDIA_NODE_TYPES.has(type as WorkflowNodeType);
}
