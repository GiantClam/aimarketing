# `@aimarketing/workbench-ui`

Shared AI UI primitives for the Web and Tauri workbenches.

## AI Elements boundary

The `src/ai-elements/` directory is the stable shared source boundary for the selected AI Elements compound components. Page code should import from `@aimarketing/workbench-ui`; host actions such as navigation, cancellation, file access and provider execution remain typed callbacks.

Core domains currently covered:

- Chat: `PromptInput`, `Attachments`, `ModelSelector`, `Conversation`, `Message`, `Reasoning`, `Plan`, `Task`, `Tool`, `Confirmation`, `Shimmer`.
- Sources and artifacts: `Sources`, `Source`, `InlineCitation`, `Context`, `Artifact`, `Image`, `OpenInChat`.
- Host surfaces: `Agent`, `Queue`, `Checkpoint`, workflow Canvas primitives, audio/voice primitives and capability-gated code/runtime primitives.

`ai-elements.tsx` remains a migration compatibility layer. It must not acquire new page-specific behavior; new behavior belongs in the official composition or a typed adapter.

## Brand and dependency policy

Official structures use Workbench tokens and classes from `src/styles.css`. The canonical yellow is `--wb-brand-yellow`; page code should not introduce a second AI color system.

Optional Code, Voice, Runtime, token-cost and React Flow dependencies are capability-gated. The base chatbot bundle must remain usable without Shiki, media-chrome, Rive, tokenlens, Sandbox or a second canvas runtime.

## Verification

Run from the repository root:

```text
pnpm --filter @aimarketing/workbench-ui typecheck
pnpm --filter @aimarketing/workbench-ui test
pnpm desktop:typecheck
pnpm lint
pnpm run check:shared-boundaries
pnpm run check:shared-provenance
openspec validate upgrade-ai-elements-component-system
```

Web/Tauri parity is verified through the shared source exports and host-specific callback tests. Visual and live E2E checks require the corresponding local runtime/provider configuration.
