# Conversation Shell Loading Implementation Plan

> Use this plan to execute the work task-by-task with tight verification after each step.

**Goal:** Ensure image assistant, lead hunter, writer, and expert advisors always render a conversation shell immediately on refresh/route switch, then hydrate data without blank-screen waiting.

**Architecture:** Introduce a shared conversation-shell loading contract (shell-first, cache-first, background refresh, inline error) and apply it consistently across the four assistant workspaces. Reuse existing session caches (`image-assistant`, `writer`, `advisor`) and keep data-fetch logic incremental (merge, not replace). Avoid API contract changes; this is a frontend orchestration and rendering-layer upgrade.

**Tech Stack:** Next.js App Router, React 19, TanStack Query v5, TypeScript, existing workspace UI primitives, sessionStorage/local cache stores.

---

### Task 1: Define Shared Loading Contract

**Files:**
- Modify: `d:/github/aimarketing/components/workspace/workspace-message-primitives.tsx`
- Create: `d:/github/aimarketing/components/workspace/workspace-conversation-shell.tsx`
- Modify: `d:/github/aimarketing/components/workspace/workspace-primitives.tsx`
- Test: `d:/github/aimarketing/scripts/workspace_visual_regression.py`

**Step 1: Write the failing visual expectation checklist**

```md
- Shell renders before network response.
- No full-viewport blank loading in conversation area.
- Cached messages remain visible while refreshing.
- Refresh failures show inline status, not page replacement.
```

**Step 2: Add shared shell primitives**

```tsx
export type WorkspaceConversationShellProps = {
  loading: boolean
  hasMessages: boolean
  skeletonRows?: number
  children: React.ReactNode
}
```

**Step 3: Add message skeleton frame primitive**

```tsx
export function WorkspaceMessageSkeletonFrame() {
  return <div className="..." />
}
```

**Step 4: Run visual regression snapshot**

Run: `python scripts/workspace_visual_regression.py`  
Expected: screenshots generated without blank conversation panel frames

**Step 5: Commit**

```bash
git add components/workspace/workspace-message-primitives.tsx components/workspace/workspace-conversation-shell.tsx components/workspace/workspace-primitives.tsx
git commit -m "feat(workspace): add shared conversation shell and message skeleton primitives"
```

### Task 2: Add Reusable Bootstrap Hook (Cache-First + Background Refresh)

**Files:**
- Create: `d:/github/aimarketing/lib/hooks/use-conversation-bootstrap.ts`
- Modify: `d:/github/aimarketing/lib/query/workspace-cache.ts`
- Test: `d:/github/aimarketing/lib/query/workspace-cache.bootstrap.test.ts` (new)

**Step 1: Write failing hook behavior test**

```ts
test("returns cached snapshot immediately and refreshes in background", async () => {
  // expect shellReady=true before fetch resolves
})
```

**Step 2: Implement minimal bootstrap state machine**

```ts
type BootstrapState = "bootstrapping" | "hydrated" | "refreshing" | "error"
```

**Step 3: Add guarded fetch helper (do not clear previous data on refresh)**

```ts
async function fetchWithFallback<T>(...)
```

**Step 4: Run tests**

Run: `npx tsx --test lib/query/workspace-cache.bootstrap.test.ts`  
Expected: PASS

**Step 5: Commit**

```bash
git add lib/hooks/use-conversation-bootstrap.ts lib/query/workspace-cache.ts lib/query/workspace-cache.bootstrap.test.ts
git commit -m "feat(workspace): add conversation bootstrap hook with cache-first refresh"
```

### Task 3: Integrate Image Assistant Shell-First Loading

**Files:**
- Modify: `d:/github/aimarketing/components/image-assistant/image-assistant-workspace.tsx`
- Modify: `d:/github/aimarketing/lib/image-assistant/session-store.ts`
- Test: `d:/github/aimarketing/scripts/image_assistant_e2e.py`

**Step 1: Write failing UX assertion**

```md
Given /dashboard/image-assistant/{sessionId}
When refresh
Then conversation frame appears immediately (shell + skeleton), never center-only loading card
```

**Step 2: Replace full-panel loading branch with shell wrapper**

```tsx
if (!availability) return <WorkspaceConversationShell loading hasMessages={Boolean(displayMessages.length)} ... />
```

**Step 3: Ensure stale cache still renders shell + prior messages while detail fetch runs**

```ts
const cachedDetail = getImageAssistantSessionContentCache(sessionId)
```

**Step 4: Run regression**

Run: `python scripts/image_assistant_e2e.py`  
Expected: no blank conversation area during restore

**Step 5: Commit**

```bash
git add components/image-assistant/image-assistant-workspace.tsx lib/image-assistant/session-store.ts
git commit -m "feat(image-assistant): render shell-first conversation loading"
```

### Task 4: Integrate Writer Shell-First Loading

**Files:**
- Modify: `d:/github/aimarketing/components/writer/writer-workspace.tsx`
- Modify: `d:/github/aimarketing/lib/writer/session-store.ts`
- Test: `d:/github/aimarketing/lib/writer/skills.regression.test.ts`

**Step 1: Write failing UX assertion**

```md
On writer conversation refresh, show message shell immediately and preserve cached entries during refresh.
```

**Step 2: Wrap conversation area in shared shell**

```tsx
<WorkspaceConversationShell loading={isConversationLoading} hasMessages={messages.length > 0}>
```

**Step 3: Prevent resetting to empty array before cache probe completes**

```ts
// keep previous messages until fresh fetch settles
```

**Step 4: Run tests**

Run: `npx tsx --test lib/writer/skills.regression.test.ts`  
Expected: PASS, no routing/skills regression

**Step 5: Commit**

```bash
git add components/writer/writer-workspace.tsx lib/writer/session-store.ts
git commit -m "feat(writer): keep conversation shell and cached messages during refresh"
```

### Task 5: Integrate Advisor + Lead Hunter Shell-First Loading

**Files:**
- Modify: `d:/github/aimarketing/app/dashboard/advisor/[type]/[[...id]]/page.tsx`
- Modify: `d:/github/aimarketing/components/chat/DifyChatArea.tsx`
- Modify: `d:/github/aimarketing/lib/advisor/session-store.ts`
- Test: `d:/github/aimarketing/components/chat/dify-chat-area.loading.test.tsx` (new)

**Step 1: Write failing rendering test**

```tsx
expect(screen.getByTestId("advisor-conversation-shell")).toBeVisible()
```

**Step 2: Remove page-level center-only loading blocker**

```tsx
// render DifyChatArea shell even while auth/availability is resolving
```

**Step 3: In `DifyChatArea`, render shell when `isConversationLoading && messagesState.length===0`**

```tsx
<WorkspaceConversationShell loading hasMessages={false} />
```

**Step 4: Run tests**

Run: `npx tsx --test components/chat/dify-chat-area.loading.test.tsx`  
Expected: PASS

**Step 5: Commit**

```bash
git add app/dashboard/advisor/[type]/[[...id]]/page.tsx components/chat/DifyChatArea.tsx lib/advisor/session-store.ts components/chat/dify-chat-area.loading.test.tsx
git commit -m "feat(advisor): shell-first loading for advisor and lead-hunter conversations"
```

### Task 6: Unify Route Transition Behavior (No Flash-Clear)

**Files:**
- Modify: `d:/github/aimarketing/components/image-assistant/ImageAssistantSidebarItem.tsx`
- Modify: `d:/github/aimarketing/components/chat/AdvisorSidebarItem.tsx`
- Modify: `d:/github/aimarketing/components/writer/WriterSidebarItem.tsx`
- Test: `d:/github/aimarketing/scripts/workspace_visual_regression.py`

**Step 1: Write failing route-switch checklist**

```md
Switching between sessions should not clear message area before next data arrives.
```

**Step 2: Prefetch detail on hover/focus for top N recent sessions**

```ts
prefetchItem(...)
```

**Step 3: Keep previous detail mounted until next detail is resolved or shell is ready**

```ts
// avoid setDetail(null) during transition
```

**Step 4: Run visual regression**

Run: `python scripts/workspace_visual_regression.py`  
Expected: no blank transition frames

**Step 5: Commit**

```bash
git add components/image-assistant/ImageAssistantSidebarItem.tsx components/chat/AdvisorSidebarItem.tsx components/writer/WriterSidebarItem.tsx
git commit -m "feat(sidebar): prefetch and preserve conversation shell during route switches"
```

### Task 7: Instrumentation + Error UX Hardening

**Files:**
- Modify: `d:/github/aimarketing/components/image-assistant/image-assistant-workspace.tsx`
- Modify: `d:/github/aimarketing/components/writer/writer-workspace.tsx`
- Modify: `d:/github/aimarketing/components/chat/DifyChatArea.tsx`
- Test: `d:/github/aimarketing/scripts/workspace_visual_regression.py`

**Step 1: Add client-side telemetry markers**

```ts
console.info("workspace.shell.rendered", {...})
console.info("workspace.data.hydrated", {...})
```

**Step 2: Add consistent inline retry banner component**

```tsx
<WorkspaceInlineStatus state="error" onRetry={...} />
```

**Step 3: Ensure retry does not clear current messages**

```ts
await refreshDetail(..., { keepCurrentOnError: true })
```

**Step 4: Validate manually**

Run:
- `npm run dev`
- Open each workspace, hard refresh, switch sessions
- Confirm shell-first behavior and inline retry banner

Expected: no blank conversation panel

**Step 5: Commit**

```bash
git add components/image-assistant/image-assistant-workspace.tsx components/writer/writer-workspace.tsx components/chat/DifyChatArea.tsx
git commit -m "feat(workspaces): unify inline loading and retry UX without clearing messages"
```

### Task 8: Final Verification and Release Notes

**Files:**
- Create: `d:/github/aimarketing/docs/plans/2026-03-23-conversation-shell-loading-verification.md`
- Modify: `d:/github/aimarketing/docs/api/2026-03-15-image-design-assistant-data-api.md` (loading semantics note)
- Modify: `d:/github/aimarketing/docs/perf/` (add before/after screenshots and timings)

**Step 1: Execute full test matrix**

Run:
- `npx tsx --test lib/image-assistant/turn-routing.test.ts`
- `npx tsx --test lib/image-assistant/tools.regression.test.ts`
- `npx tsx --test lib/writer/skills.regression.test.ts`
- `python scripts/workspace_visual_regression.py`

Expected: PASS

**Step 2: Record acceptance checklist**

```md
- Image assistant: shell-first on refresh/switch
- Writer: shell-first on refresh/switch
- Advisor: shell-first on refresh/switch
- Lead hunter: shell-first on refresh/switch
```

**Step 3: Publish release note entry**

```md
Conversation area now renders shell immediately and hydrates data in place.
```

**Step 4: Smoke test in staging**

Run: manual cross-browser check (Chrome + Safari + mobile viewport)  
Expected: no blank waiting panel

**Step 5: Commit**

```bash
git add docs/plans/2026-03-23-conversation-shell-loading-verification.md docs/api/2026-03-15-image-design-assistant-data-api.md docs/perf
git commit -m "docs: add verification and release notes for conversation shell-first loading"
```

---

**Execution notes**
- Keep scope DRY/YAGNI: do not alter backend APIs unless a blocker is proven.
- Prioritize shell rendering and transition behavior first, then polish.
- Relevant skills to apply during implementation: `@frontend-design`, `@webapp-testing`, `@code-simplifier`.
