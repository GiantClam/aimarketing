# Railway Services

## Phase 1

- `ragflow`
- `ragflow-mysql`
- `ragflow-redis`
- `ragflow-minio`
- `ppt-master-worker`

## Shared Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## `ppt-master-worker`

- Build context: repo root, reusing `/lib/lead-tools/*` runtime code.
- Image build clones latest `hugohe3/ppt-master` sparse subtree into `/opt/ppt-master`.
- `PPT_WORKER_INTERNAL_TOKEN`
- `PPT_WORKER_RUNTIME_PROFILE=railway-linux`
- `PPT_MASTER_REPO_DIR=/opt/ppt-master`
- `PPT_MASTER_PYTHON_BIN=/usr/bin/python3`
- `PPT_MASTER_SLIDE_TIMEOUT_MS=180000`
- `PPT_MASTER_ALLOW_EMERGENCY_FALLBACK=false`
- `PPT_MASTER_SESSION_STORE=postgres`
- `LEAD_TOOLS_PPT_PREVIEW_PROVIDER=deepseek`
- `LEAD_TOOLS_PPT_PREVIEW_MODEL=deepseek-v4-pro`
- `LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER=minimax`
- `LEAD_TOOLS_PPT_RUNTIME_SLIDE_MODEL=MiniMax-M2.7-highspeed`
- `PPT_WORKER_PREVIEW_JOB_STORE=postgres`
- `AI_MARKETING_DB_POSTGRES_URL=<shared app database url>`
- `PPT_WORKER_JOB_LEASE_MS=120000`
- `PPT_WORKER_JOB_HEARTBEAT_INTERVAL_MS=15000`
- `PPT_WORKER_JOB_RECOVERY_INTERVAL_MS=20000`
- `PPT_WORKER_JOB_RECOVERY_BATCH_SIZE=8`
- `PPT_WORKER_JOB_SHUTDOWN_GRACE_MS=10000`

Preview requests persist their full request payload in Postgres. The worker claims queued or expired jobs with a lease, renews the lease during execution, and scans for recoverable jobs on startup and on a timer. On `SIGTERM`/`SIGINT`, it stops scheduling new work, waits for the configured grace period, and releases active leases so another replica can resume them.

If Railway logs show `ppt_master_runtime_provider_headers_timeout:*` for the slide-SVG stage, keep the model constant first and switch only the provider override for this worker hop, for example:

- `LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER=stepfun`
- `LEAD_TOOLS_PPT_RUNTIME_SLIDE_PROVIDER=minimax`

If the preview planning stage itself is unstable, set `LEAD_TOOLS_PPT_PREVIEW_PROVIDER=minimax` for the same worker deployment.

## App Runtime

- `PPT_WORKER_BASE_URL=https://<gateway-or-worker-domain>`
- `PPT_WORKER_INTERNAL_TOKEN=<same-token>`
- Optional explicit overrides:
  - `LEAD_TOOLS_PPT_EXECUTION_TRANSPORT=remote-worker`
  - `LEAD_TOOLS_PPT_PREVIEW_RUNTIME=ppt-master-agent`
  - `PPT_WORKER_PREVIEW_TIMEOUT_MS=5400000`

## Rollout Order

1. Deploy `ragflow` stack into Railway.
2. Deploy `ppt-master-worker` with font baseline and health checks.
3. Verify `/health` and `/fonts/check`.
4. Enable `remote-worker` mode only in non-production first.
5. Run PPT canary validation before production promotion.
