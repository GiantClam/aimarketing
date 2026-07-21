# SaaS OpenCode Runner

This Worker is the SaaS execution backend for OpenCode CLI and its persistent
session runtime. Speaker-style PPT turns use the native Dashi AI PPT skill.
The application remains the authority for authentication, conversation history,
workflow state, billing, tools, and platform artifacts.

## Pinned runtime

- `@cloudflare/sandbox`: `0.12.3`
- container base: `docker.io/cloudflare/sandbox:0.12.3`
- OpenCode CLI: Cloudflare's `sandbox:0.12.3-opencode` image (`opencode 1.17.13`)
- Dashi AI PPT: `chuspeeism/dashi-ppt-skill` pinned at `ff3a7330e4967147a40310669703b911fb1f708a` (`v0.4.5`), published only in the Cloudflare Sandbox image as `dashi-v0.4.5-ff3a733-20260720`
- `ppt-master` is hosted by Railway; Cloudflare must not deploy or bind a PptMaster Container
- Dashi Sandbox class: Cloudflare `standard-4` with Chromium headless-shell
- Sandbox transport: `rpc`
- Speaker PPT sessions enable OpenCode `webfetch`/`websearch` when the runtime
  network policy is enabled. Provider credentials are injected only for the
  configured PPToken/DeepSeek hosts; metadata and loopback hosts remain blocked.

## Required secrets

Set these with Wrangler; never put values in `wrangler.jsonc`, the application
repository, `input.json`, `prompt.md`, or logs:

```bash
wrangler secret put AGENT_RUNNER_HMAC_SECRET
```

For every OpenCode request, the application server must send the selected
provider id, model id, base URL, and key in the signed runtime request. The
key is never written to `input.json`, `prompt.md`, or logs; OpenCode receives
only that request's provider key in the running Sandbox process.

## Automatic configuration

From the repository root, the idempotent configuration command creates or
reuses the runtime R2 bucket, Queue, dead-letter Queue, Workflow bindings and
Worker secrets, then synchronizes the Vercel production/preview variables:

```bash
npm run opencode:deploy:configure
```

It preserves existing Runner and provider secrets, generates the event-ticket
and callback secrets, deploys the Worker, and verifies `/health`. It does not
trigger a Vercel deployment; the next Vercel deployment consumes the new
environment variables.

## Staging

```bash
cd infra/cloudflare/opencode-runner
npm ci
npm test
npm run typecheck
npm run deploy:dry-run
wrangler deploy --env staging
```

Configure the application with:

```text
AI_ENTRY_RUNTIME_MODE=opencode-cloudflare-sandbox
AI_ENTRY_SAAS_OPENCODE_ENABLED=true
AI_ENTRY_OPENCODE_BACKEND=cloudflare-sandbox-exec
AI_ENTRY_OPENCODE_FALLBACK=ai-sdk-native
CLOUDFLARE_OPENCODE_RUNNER_URL=https://<staging-worker-domain>
CLOUDFLARE_OPENCODE_RUNNER_HMAC_SECRET=<same-secret-as-worker>
```

Before promotion, verify ordinary chat emits a `text_delta` before command
completion, timeout/cancel destroys the sandbox, duplicate `runId` returns 409,
artifact validation publishes once, the next conversation turn sees artifact
metadata, and PPT/native tool requests never enter OpenCode.

## Shared Agent Skill runtime

The Phase 1 shared-Agent path is opt-in and only applies to the platform's
`agency-*`, `business-*`, `executive-*` (excluding PPT), and direct custom
Agents. It reads a private R2 bundle through `SHARED_AGENT_SKILL_BUNDLE_BUCKET`;
the Sandbox never receives R2 credentials. Create that bucket before deploying
the binding and give the application server a least-privilege write token via
`SHARED_AGENT_SKILL_R2_*` variables.

Enable it gradually in the application:

```text
AI_ENTRY_SHARED_AGENT_RUNTIME_ENABLED=true
AI_ENTRY_SHARED_AGENT_ALLOWLIST=business-content-growth,executive-growth
SHARED_AGENT_PREWARM_ENABLED=false
SHARED_AGENT_SKILL_R2_BUCKET=aimarketing-shared-agent-runtime
```

Run `npm run shared-agent:skills:sync` after changing built-in text Skills.
The active session caches each named SkillSet locally; the default shared
session idle timeout is 15 minutes and can be set from 5 to 30 minutes with
`SHARED_AGENT_SESSION_SLEEP_AFTER`. `ppt-master` and Dashi never use this
binding, loader, or preparation endpoint.

The application uses `AI_ENTRY_OPENCODE_PREWARM_ENABLED` for all Cloudflare
session-capable chat contexts. It prepares ordinary Chat, selected Agents,
PPT Agents, and direct custom Agents before the first user turn. The legacy
`SHARED_AGENT_PREWARM_ENABLED` variable is retained only for compatibility and
is no longer the general prewarm gate. Preparation never calls a model, writes
a message, creates an artifact, or keeps the Sandbox alive permanently.

## Production and rollback

Production deployment requires a reviewed staging canary and an approved
production environment. Disable the app path first if rollback is required:

```text
AI_ENTRY_SAAS_OPENCODE_ENABLED=false
AI_ENTRY_RUNTIME_MODE=ai-sdk-native
```

Then roll the Worker back to the last known-good version:

```bash
wrangler rollback --env production
```

No database rollback is needed: OpenCode never owns conversation, workflow,
billing, or artifact state.
