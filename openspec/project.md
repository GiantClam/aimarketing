# AIMARKETING OpenSpec project conventions

- Preserve existing Web/Tauri business behavior, route contracts, runtime adapters and local data boundaries.
- Prefer shared, host-neutral components under `packages/workbench-ui` with typed callbacks for navigation, files, device permissions and execution.
- Keep official AI Elements source under `packages/workbench-ui/src/ai-elements/`; compatibility exports are temporary migration aliases.
- Do not add optional AI Elements dependencies unless the corresponding capability is active and its bundle, SSR and fallback behavior are verified.
- Use UTF-8 source files, preserve existing unrelated worktree changes, and run typecheck, tests, lint, build and OpenSpec validation before closing a change.
