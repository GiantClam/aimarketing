export type PlatformDirectoryAvailability = "available" | "coming_soon" | "waitlist" | "enterprise_only"
export type PlatformDirectoryItemType = "tool" | "capability" | "agent" | "plugin" | "mcp_service" | "workflow"
export type PlatformDirectorySurface = "public" | "workspace" | "both"

export type PlatformDirectorySourceRef = {
  id: string
  label: string
  file: string
  description: string
}

type AvailabilityOverrideMap = Partial<Record<PlatformDirectoryItemType, Partial<Record<string, PlatformDirectoryAvailability>>>>

const DIRECTORY_SOURCE_MAP: Record<PlatformDirectoryItemType, PlatformDirectorySourceRef[]> = {
  tool: [
    {
      id: "lead-tools-catalog",
      label: "Lead tool catalog",
      file: "lib/lead-tools/catalog.ts",
      description: "Public tool definitions, localized copy, preview settings, and login gates.",
    },
    {
      id: "lead-tools-config",
      label: "Lead tool runtime config",
      file: "lib/lead-tools/config.ts",
      description: "Preview/final model routing and environment-aware runtime toggles for public tools.",
    },
  ],
  capability: [
    {
      id: "platform-catalog",
      label: "Platform capability catalog",
      file: "lib/platform/catalog.ts",
      description: "Canonical capability descriptors, surfaces, and default binding metadata.",
    },
    {
      id: "capability-resolver",
      label: "Capability resolver",
      file: "lib/platform/capability-resolver.ts",
      description: "Combines capability descriptors with runtime snapshot status before directory display.",
    },
    {
      id: "platform-runtime",
      label: "Platform runtime snapshot",
      file: "lib/platform/runtime.ts",
      description: "Runtime/provider/task state used to avoid presenting deferred capabilities as fully live.",
    },
  ],
  agent: [
    {
      id: "platform-catalog",
      label: "Platform agent catalog",
      file: "lib/platform/catalog.ts",
      description: "Built-in agent descriptors and platform-facing copy.",
    },
    {
      id: "platform-control-plane",
      label: "Platform registry control plane",
      file: "lib/platform/control-plane.ts",
      description: "Enterprise visibility, binding target, and deferred-mode configuration for registry entries.",
    },
    {
      id: "enterprise-agent-cards",
      label: "Enterprise agent cards",
      file: "lib/platform/agent-cards.ts",
      description: "Enterprise-side custom agent records merged into the shared registry directory.",
    },
  ],
  plugin: [
    {
      id: "platform-catalog",
      label: "Platform plugin catalog",
      file: "lib/platform/catalog.ts",
      description: "Built-in plugin descriptors and shared proof points.",
    },
    {
      id: "platform-control-plane",
      label: "Platform registry control plane",
      file: "lib/platform/control-plane.ts",
      description: "Enterprise visibility and binding configuration for registry-backed plugin entries.",
    },
    {
      id: "enterprise-plugin-slots",
      label: "Enterprise plugin slots",
      file: "lib/platform/plugin-slots.ts",
      description: "Enterprise-side plugin slot records merged into the shared directory model.",
    },
  ],
  mcp_service: [
    {
      id: "platform-catalog",
      label: "Platform MCP catalog",
      file: "lib/platform/catalog.ts",
      description: "Built-in MCP service descriptors and surface rules.",
    },
    {
      id: "platform-control-plane",
      label: "Platform registry control plane",
      file: "lib/platform/control-plane.ts",
      description: "Enterprise visibility and binding configuration for MCP registry entries.",
    },
    {
      id: "enterprise-mcp-service-profiles",
      label: "Enterprise MCP profiles",
      file: "lib/platform/mcp-service-profiles.ts",
      description: "Enterprise custom MCP service records merged into the shared directory model.",
    },
  ],
  workflow: [
    {
      id: "platform-catalog",
      label: "Platform workflow catalog",
      file: "lib/platform/catalog.ts",
      description: "Built-in workflow template descriptors and surface rules.",
    },
    {
      id: "platform-control-plane",
      label: "Platform registry control plane",
      file: "lib/platform/control-plane.ts",
      description: "Enterprise visibility and binding configuration for workflow registry entries.",
    },
    {
      id: "enterprise-workflow-templates",
      label: "Enterprise workflow templates",
      file: "lib/platform/workflow-templates.ts",
      description: "Enterprise-side workflow template records merged into the shared directory model.",
    },
  ],
}

const AVAILABILITY_OVERRIDES: AvailabilityOverrideMap = {
  tool: {
    "sentiment-monitoring": "waitlist",
    "hot-video-research": "enterprise_only",
  },
  agent: {
    "public-relations-agent": "waitlist",
    "video-ops-agent": "enterprise_only",
  },
  workflow: {
    "reputation-guard": "waitlist",
  },
}

export function getPlatformDirectorySourceMap() {
  return DIRECTORY_SOURCE_MAP
}

export function getPlatformDirectoryAvailability(
  itemType: PlatformDirectoryItemType,
  slug: string,
  fallback: {
    status: "live" | "beta" | "planned" | "live_tool" | "coming_soon_tool"
    surface: PlatformDirectorySurface
  },
) {
  const override = AVAILABILITY_OVERRIDES[itemType]?.[slug]
  if (override) return override
  if (fallback.surface === "workspace") return "enterprise_only" as const
  if (fallback.status === "planned" || fallback.status === "coming_soon_tool") return "coming_soon" as const
  return "available" as const
}
