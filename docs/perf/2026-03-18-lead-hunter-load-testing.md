# Lead Hunter Load Testing

This document covers the current `lead-hunter` load-test path after it was aligned to Dify `chat app` mode.

## What changed

- `lead-hunter` now talks only to Dify `/chat-messages`
- The old `/workflows/run` probe and fallback path was removed
- Async task execution now uses DB-backed task claiming instead of instance-local in-memory scheduling
- Request rate limiting now uses DB-backed counters instead of instance-local maps

## What to measure

Use the load test to separate two bottlenecks:

1. Vercel accept path
   - `POST /api/dify/chat-messages` latency
   - request acceptance success rate
2. End-to-end task completion
   - time from async accept to `/api/tasks/:id` success
   - failure or timeout rate

## Prepare a test user

Create or refresh an active VBUY admin with `expert_advisor` enabled:

```bash
node scripts/provision_lead_hunter_load_test_user.js \
  --email lead-hunter-load@example.com \
  --password 'TempLoadTest123!'
```

## Run against a deployed Vercel app

```bash
python scripts/lead_hunter_load_test.py \
  --base-url https://your-app.vercel.app \
  --email lead-hunter-load@example.com \
  --password 'TempLoadTest123!' \
  --stage 1x3 \
  --stage 3x6 \
  --stage 5x10
```

Each stage is `concurrency x total_requests`.

Artifacts are written to `artifacts/load-tests/`.

## Recommended initial baseline

Start with these stages:

- `1x3`: smoke check, verifies auth, queueing, and task polling
- `3x6`: initial concurrency baseline
- `5x10`: moderate stress on Vercel + current Dify upstream

## Current baseline snapshot (2026-03-18)

Measured from the current workspace:

- Vercel deployed app `https://v0-aimarketing.vercel.app`
  - `lead-hunter` async submit currently returns `400 {"error":"Invalid advisor type"}`
  - Current deployed lead-hunter success baseline is effectively `0%` until that deployment is updated
- Direct Dify upstream for the configured enterprise `lead-hunter` chat app
  - Stage `1x2`: `2/2` success, p50 about `20.2s`
  - Stage `2x4`: `4/4` success, p50 about `37.8s`, p95 about `42.6s`

Interpretation:

- The current bottleneck for end-to-end lead-hunter is not just raw concurrency, but deployment/config alignment
- The upstream Dify app is healthy enough to answer concurrent chat requests, but each request is still expensive in wall-clock time
- Keeping the app path asynchronous remains necessary even after removing workflow fallback

Interpretation:

- `submit_latency_ms` mostly measures Vercel accept path and database writes
- `total_latency_ms` mostly measures Dify generation time plus task polling lag
- High submit latency with low total latency suggests the app tier is the bottleneck
- Low submit latency with high total latency suggests Dify upstream is the bottleneck

## Current known limits

- `lead-hunter` is a Dify `chat app`, not a `workflow app`
- The project relies on an upstream Dify deployment at `https://dify-api.o3-tools.com/v1`
- End-to-end throughput still depends heavily on upstream Dify model latency and queue depth
