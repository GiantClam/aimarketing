# AI Elements source and dependency audit

**Change:** `upgrade-ai-elements-component-system`
**Date:** 2026-08-21

## Source review

The selected component contract follows the official AI Elements component directory and compound APIs. The repository keeps the source under `packages/workbench-ui/src/ai-elements/` and exposes it through `@aimarketing/workbench-ui`.

Reviewed domains: PromptInput, Attachments, ModelSelector, Conversation, Message, process components, Sources, Context, Artifact, Agent, Queue/Checkpoint/Confirmation, Canvas, Audio/Voice and capability-gated Code/Runtime structures.

## CLI and dependency gate

The official registry CLI was probed but not applied to the workspace. The registry attempted to install the full example dependency set at the workspace root, including `radix-ui`, `media-chrome`, `@xyflow/react`, `shiki`, `tokenlens`, `streamdown` and Rive packages. pnpm correctly blocked the workspace-root install.

No new optional dependency was added by this change. The stable implementation uses the existing React/Markdown/runtime dependencies and host adapters; optional structures remain inert until a capability requires them.

## Local modifications

- Brand colors and status styles are mapped to Workbench CSS tokens, especially `--wb-brand-yellow`, surface, ink, border, muted and focus variables.
- Workbench compatibility exports remain temporarily to protect existing Web/Tauri callers.
- Workflow and media business shells remain host-owned; shared components provide semantics and callbacks only.
- Writer resolves the desktop text provider from `%LOCALAPPDATA%/AIMarketing/config.json` (or the explicit test/config path override), using `defaults.text` and its profile model/base URL/API key. The Tauri Writer composer reuses the same profile's model catalog and persists a changed model id through the existing config writer.
- Current product has no durable Checkpoint restore/branch runtime and no high-risk tool approval runtime. Those paths are explicitly capability-gated rather than represented by fake callbacks.

## Remaining risk

Before an upstream source upgrade, rerun the CLI in an isolated package, capture the exact source/dependency/license diff, then repeat type, SSR, keyboard and visual checks. Writer live E2E still requires a signed-in environment that permits the configured text and image provider calls; local config resolution and a mock text-provider first turn are covered by tests.
