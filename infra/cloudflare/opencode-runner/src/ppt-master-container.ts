import { Container } from "@cloudflare/containers"

type PptMasterContainerEnv = {
  PPT_MASTER_INTERNAL_TOKEN?: string
  AI_ENTRY_DEEPSEEK_API_KEY?: string
  AI_ENTRY_DEEPSEEK_BASE_URL?: string
  AI_ENTRY_DEEPSEEK_MODEL?: string
  AI_ENTRY_PPTOKEN_API_KEY?: string
  AI_ENTRY_PPTOKEN_BASE_URL?: string
  AI_ENTRY_PPTOKEN_MODEL?: string
  LEAD_TOOLS_PPT_PREVIEW_MODEL?: string
  LEAD_TOOLS_MINIMAX_API_KEY?: string
  LEAD_TOOLS_MINIMAX_BASE_URL?: string
  LEAD_TOOLS_MINIMAX_MODEL?: string
  LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER?: string
  LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL?: string
  LEAD_TOOLS_PPT_RUNTIME_FALLBACK_ENABLED?: string
  LEAD_TOOLS_PPT_RUNTIME_FALLBACK_PROVIDER?: string
  LEAD_TOOLS_PPT_RUNTIME_FALLBACK_MODEL?: string
  PPT_MASTER_DATABASE_URL?: string
}

/**
 * Shared Cloudflare Container profile for document-heavy PPT work.
 *
 * The process inside the image is the existing ppt-master worker. The
 * container is shared at the profile level, while its durable job store and
 * leases keep individual preview jobs isolated and recoverable.
 */
export class PptMasterContainer extends Container<PptMasterContainerEnv> {
  defaultPort = 8080
  pingEndpoint = "/health"
  sleepAfter = "30m"
  enableInternet = true

  constructor(ctx: DurableObjectState<{}>, env: PptMasterContainerEnv) {
    super(ctx, env)
    this.envVars = {
      NODE_ENV: "production",
      PORT: "8080",
      PPT_WORKER_RUNTIME_PROFILE: "cloudflare-linux",
      PPT_WORKER_PREVIEW_JOB_STORE: "postgres",
      PPT_WORKER_INTERNAL_TOKEN: env.PPT_MASTER_INTERNAL_TOKEN || "",
      // Cloudflare Containers currently reach Supabase through the pooler.
      // The direct database hostname can be IPv6-only and is not a reliable
      // egress target for a container instance.
      AI_MARKETING_DB_POSTGRES_URL: env.PPT_MASTER_DATABASE_URL || "",
      DB_PREFER_NON_POOLING: "false",
      PPT_MASTER_REPO_DIR: "/opt/ppt-master",
      PPT_MASTER_PYTHON_BIN: "/opt/ppt-master-venv/bin/python",
      PPT_MASTER_SCRIPT_TIMEOUT_MS: "300000",
      PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS: "3600000",
      PPT_WORKER_PREVIEW_MAX_CONCURRENCY: "1",
      LEAD_TOOLS_PPT_EXECUTION_TRANSPORT: "local",
      LEAD_TOOLS_PPT_PREVIEW_RUNTIME: "ppt-master-agent",
      ...(env.AI_ENTRY_DEEPSEEK_API_KEY ? { AI_ENTRY_DEEPSEEK_API_KEY: env.AI_ENTRY_DEEPSEEK_API_KEY } : {}),
      ...(env.AI_ENTRY_DEEPSEEK_BASE_URL ? { AI_ENTRY_DEEPSEEK_BASE_URL: env.AI_ENTRY_DEEPSEEK_BASE_URL } : {}),
      ...(env.AI_ENTRY_DEEPSEEK_MODEL ? { AI_ENTRY_DEEPSEEK_MODEL: env.AI_ENTRY_DEEPSEEK_MODEL } : {}),
      ...(env.AI_ENTRY_PPTOKEN_API_KEY ? { AI_ENTRY_PPTOKEN_API_KEY: env.AI_ENTRY_PPTOKEN_API_KEY } : {}),
      ...(env.AI_ENTRY_PPTOKEN_BASE_URL ? { AI_ENTRY_PPTOKEN_BASE_URL: env.AI_ENTRY_PPTOKEN_BASE_URL } : {}),
      ...(env.AI_ENTRY_PPTOKEN_MODEL ? { AI_ENTRY_PPTOKEN_MODEL: env.AI_ENTRY_PPTOKEN_MODEL } : {}),
      ...(env.LEAD_TOOLS_PPT_PREVIEW_MODEL ? { LEAD_TOOLS_PPT_PREVIEW_MODEL: env.LEAD_TOOLS_PPT_PREVIEW_MODEL } : {}),
      ...(env.LEAD_TOOLS_MINIMAX_API_KEY ? { LEAD_TOOLS_MINIMAX_API_KEY: env.LEAD_TOOLS_MINIMAX_API_KEY } : {}),
      ...(env.LEAD_TOOLS_MINIMAX_BASE_URL ? { LEAD_TOOLS_MINIMAX_BASE_URL: env.LEAD_TOOLS_MINIMAX_BASE_URL } : {}),
      ...(env.LEAD_TOOLS_MINIMAX_MODEL ? { LEAD_TOOLS_MINIMAX_MODEL: env.LEAD_TOOLS_MINIMAX_MODEL } : {}),
      ...(env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER ? { LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER: env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER } : {}),
      ...(env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL ? { LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL: env.LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL } : {}),
      ...(env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_ENABLED ? { LEAD_TOOLS_PPT_RUNTIME_FALLBACK_ENABLED: env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_ENABLED } : {}),
      ...(env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_PROVIDER ? { LEAD_TOOLS_PPT_RUNTIME_FALLBACK_PROVIDER: env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_PROVIDER } : {}),
      ...(env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_MODEL ? { LEAD_TOOLS_PPT_RUNTIME_FALLBACK_MODEL: env.LEAD_TOOLS_PPT_RUNTIME_FALLBACK_MODEL } : {}),
    }
  }
}

// A separate Durable Object class is used only by the disposable staging
// canary so it always starts from a fresh container instance and secret set.
export class PptMasterCanaryContainer extends PptMasterContainer {
  constructor(ctx: DurableObjectState<{}>, env: PptMasterContainerEnv) {
    super(ctx, env)
    // Keep the canary aligned with the production 60-minute worker guard.
    this.envVars = {
      ...this.envVars,
      PPT_WORKER_PREVIEW_JOB_TIMEOUT_MS: "3600000",
    }
  }
}
