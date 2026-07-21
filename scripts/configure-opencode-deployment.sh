#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNNER_DIR="$ROOT_DIR/infra/cloudflare/opencode-runner"
WORKER_NAME="aimarketing-opencode-runner"
TARGET_R2_BUCKET="aimarketing-opencode-runtime"
TARGET_SHARED_AGENT_R2_BUCKET="aimarketing-shared-agent-runtime"
TARGET_RUN_QUEUE="aimarketing-opencode-runs"
TARGET_DLQ_QUEUE="aimarketing-opencode-runs-dlq"
PRODUCTION_URL="https://www.aimarketingsite.com"
RUNNER_URL="https://${WORKER_NAME}.liulanggoukk.workers.dev"
PPT_RUNNER_URL="${RUNNER_URL}/ppt"
RAILWAY_OPENCODE_URL="${RAILWAY_OPENCODE_RUNTIME_URL:-https://opencode-runtime-production.up.railway.app}"

load_env_file() {
  local file="$1"
  if [[ -f "$file" ]]; then
    local normalized
    normalized="$(mktemp)"
    sed 's/\r$//' "$file" > "$normalized"
    set -a
    # shellcheck disable=SC1090
    source "$normalized"
    set +a
    rm -f "$normalized"
  fi
}

load_env_file "$ROOT_DIR/.env"
load_env_file "$ROOT_DIR/.env.local"

cf() {
  (cd "$RUNNER_DIR" && npx wrangler "$@")
}

log() {
  printf '[opencode-deploy] %s\n' "$1"
}

ensure_r2_bucket() {
  local bucket="$1"
  if cf r2 bucket list | grep -Fq "name:           $bucket"; then
    log "R2 bucket exists: $bucket"
  else
    printf 'n\n' | cf r2 bucket create "$bucket" >/dev/null
    log "R2 bucket created: $bucket"
  fi
}

ensure_queue() {
  local queue="$1"
  if cf queues list | grep -Fq " $queue "; then
    log "Queue exists: $queue"
  else
    cf queues create "$queue"
    log "Queue created: $queue"
  fi
}

secret_exists() {
  local key="$1"
  cf secret list --name "$WORKER_NAME" | grep -Fq "\"name\": \"$key\""
}

put_secret_if_missing() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    printf 'Missing secret source for %s\n' "$key" >&2
    exit 1
  fi
  if secret_exists "$key"; then
    log "Cloudflare secret exists; preserved: $key"
  else
    printf '%s' "$value" | cf secret put "$key" --name "$WORKER_NAME" >/dev/null
    log "Cloudflare secret created: $key"
  fi
}

put_secret_if_present() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    return 0
  fi
  if secret_exists "$key"; then
    log "Cloudflare secret exists; preserved: $key"
  else
    printf '%s' "$value" | cf secret put "$key" --name "$WORKER_NAME" >/dev/null
    log "Cloudflare secret created: $key"
  fi
}

vercel_set() {
  local key="$1"
  local value="$2"
  local sensitivity="${3:-plain}"
  for environment in production preview; do
    if [[ "$sensitivity" == "secret" ]]; then
      npx vercel env add "$key" "$environment" --value "$value" --force --yes --non-interactive --sensitive >/dev/null
    else
      npx vercel env add "$key" "$environment" --value "$value" --force --yes --non-interactive >/dev/null
    fi
  done
  log "Vercel env synchronized: $key (production, preview)"
}

read_vercel_env_value() {
  local key="$1"
  local pulled
  pulled="$(mktemp)"
  if npx vercel env pull "$pulled" --environment production --yes --non-interactive >/dev/null 2>&1; then
    grep -E "^${key}=" "$pulled" | tail -1 | cut -d= -f2- | sed -E "s/^['\"]|['\"]$//g"
  fi
  rm -f "$pulled"
}

ensure_r2_bucket "$TARGET_R2_BUCKET"
ensure_r2_bucket "$TARGET_SHARED_AGENT_R2_BUCKET"
ensure_queue "$TARGET_RUN_QUEUE"
ensure_queue "$TARGET_DLQ_QUEUE"

RUNNER_HMAC="${AGENT_RUNNER_HMAC_SECRET:-${CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET:-}}"
DEEPSEEK_PROVIDER_KEY="${DEEPSEEK_API_KEY:-${AI_ENTRY_DEEPSEEK_API_KEY:-}}"
RAILWAY_OPENCODE_RUNTIME_TOKEN="${RAILWAY_OPENCODE_RUNTIME_TOKEN:-${OPENCODE_WORKER_INTERNAL_TOKEN:-}}"
PPT_MASTER_TOKEN="${PPT_MASTER_INTERNAL_TOKEN:-${PPT_WORKER_INTERNAL_TOKEN:-}}"
# Cloudflare Containers should use Supabase's pooler endpoint. The direct
# database hostname is commonly IPv6-only and can time out from a container.
PPT_MASTER_DATABASE_URL="${AI_MARKETING_DB_POSTGRES_URL:-${AI_MARKETING_DB_POSTGRES_URL_NON_POOLING:-}}"
PPT_MASTER_PPTOKEN_API_KEY="${AI_ENTRY_PPTOKEN_API_KEY:-${PPTOKEN_API_KEY:-}}"
if [[ -z "$RUNNER_HMAC" ]]; then
  RUNNER_HMAC="$(openssl rand -hex 32)"
  log "Generated AGENT_RUNNER_HMAC_SECRET because no local value was available"
fi
if [[ -z "$PPT_MASTER_TOKEN" ]]; then PPT_MASTER_TOKEN="$(openssl rand -hex 32)"; fi
if [[ -z "$PPT_MASTER_DATABASE_URL" ]]; then
  printf 'Missing AI_MARKETING_DB_POSTGRES_URL(_NON_POOLING) for the Cloudflare PPT job store secret\n' >&2
  exit 1
fi
if [[ -z "$RAILWAY_OPENCODE_RUNTIME_TOKEN" ]]; then
  printf 'Missing RAILWAY_OPENCODE_RUNTIME_TOKEN (or OPENCODE_WORKER_INTERNAL_TOKEN) for business Agent SSE runtime\n' >&2
  exit 1
fi

EVENT_TICKET_SECRET="$(openssl rand -hex 32)"
CALLBACK_SECRET="${CLOUDFLARE_OPENCODE_CALLBACK_SECRET:-}"
if [[ -z "$CALLBACK_SECRET" ]]; then
  CALLBACK_SECRET="$(read_vercel_env_value CLOUDFLARE_OPENCODE_CALLBACK_SECRET || true)"
fi
if [[ -z "$CALLBACK_SECRET" ]] && secret_exists PLATFORM_CALLBACK_SECRET; then
  printf 'Cloudflare callback secret exists but its Vercel value could not be read; refusing to rotate it\n' >&2
  exit 1
fi
if [[ -z "$CALLBACK_SECRET" ]]; then CALLBACK_SECRET="$(openssl rand -hex 32)"; fi
put_secret_if_missing AGENT_RUNNER_HMAC_SECRET "$RUNNER_HMAC"
put_secret_if_missing PPT_MASTER_INTERNAL_TOKEN "$PPT_MASTER_TOKEN"
put_secret_if_missing PPT_MASTER_DATABASE_URL "$PPT_MASTER_DATABASE_URL"
put_secret_if_present AI_ENTRY_DEEPSEEK_API_KEY "$DEEPSEEK_PROVIDER_KEY"
put_secret_if_present AI_ENTRY_PPTOKEN_API_KEY "$PPT_MASTER_PPTOKEN_API_KEY"
if secret_exists OPENCODE_EVENT_TICKET_SECRET; then
  log "Cloudflare secret exists; preserved: OPENCODE_EVENT_TICKET_SECRET"
else
  put_secret_if_missing OPENCODE_EVENT_TICKET_SECRET "$EVENT_TICKET_SECRET"
fi
put_secret_if_missing PLATFORM_CALLBACK_SECRET "$CALLBACK_SECRET"

vercel_set AI_ENTRY_RUNTIME_MODE opencode-cloudflare-sandbox
vercel_set AI_ENTRY_SAAS_OPENCODE_ENABLED true
vercel_set AI_ENTRY_OPENCODE_BACKEND cloudflare-sandbox-exec
vercel_set AI_ENTRY_OPENCODE_FALLBACK disabled
vercel_set AI_ENTRY_OPENCODE_ASYNC_ENABLED false
vercel_set AI_ENTRY_OPENCODE_SESSION_ENABLED true
vercel_set AI_ENTRY_BUSINESS_AGENT_RAILWAY_ENABLED true
vercel_set RAILWAY_OPENCODE_RUNTIME_URL "$RAILWAY_OPENCODE_URL"
vercel_set RAILWAY_OPENCODE_RUNTIME_TOKEN "$RAILWAY_OPENCODE_RUNTIME_TOKEN" secret
vercel_set CLOUDFLARE_OPENCODE_RUNNER_URL "$RUNNER_URL"
vercel_set CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET "$RUNNER_HMAC" secret
vercel_set CLOUDFLARE_OPENCODE_CALLBACK_SECRET "$CALLBACK_SECRET" secret
vercel_set CLOUDFLARE_OPENCODE_V2_TIMEOUT_MS 3600000
vercel_set AI_ENTRY_SHARED_AGENT_RUNTIME_ENABLED true
vercel_set AI_ENTRY_SHARED_AGENT_ALLOWLIST ""
vercel_set AI_ENTRY_SHARED_AGENT_SCOPE business-prefix
vercel_set AI_ENTRY_NORMAL_DEFAULT_MODEL deepseek-v4-pro
vercel_set AI_ENTRY_CONSULTING_QUALITY_MODEL deepseek-v4-pro
vercel_set SHARED_AGENT_PREWARM_ENABLED false
vercel_set SHARED_AGENT_SKILL_R2_BUCKET "$TARGET_SHARED_AGENT_R2_BUCKET"
vercel_set PLATFORM_ARTIFACT_R2_BUCKET "$TARGET_R2_BUCKET"
vercel_set PPT_WORKER_BASE_URL "$PPT_RUNNER_URL"
vercel_set PPT_WORKER_INTERNAL_TOKEN "$PPT_MASTER_TOKEN" secret
vercel_set PPT_WORKER_RUNTIME_PROFILE cloudflare-linux
vercel_set LEAD_TOOLS_PPT_EXECUTION_TRANSPORT remote-worker
vercel_set LEAD_TOOLS_PPT_PREVIEW_RUNTIME ppt-master-agent

log "Deploying Worker and applying Queue/Workflow/R2 bindings"
cf deploy --no-install-skills
log "Verifying Worker health"
curl --fail --silent --show-error "$RUNNER_URL/health" >/dev/null
curl --fail --silent --show-error --max-time 180 -H "Authorization: Bearer $PPT_MASTER_TOKEN" "$PPT_RUNNER_URL/health" >/dev/null
log "Deployment configuration completed"
