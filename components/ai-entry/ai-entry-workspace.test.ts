import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { resolve } from "node:path"

test("AI Entry routes through an injected NavigationAdapter with a Next fallback", () => {
  const source = readFileSync(resolve(process.cwd(), "components/ai-entry/ai-entry-workspace.tsx"), "utf8")

  assert.match(source, /navigation\?: NavigationAdapter/)
  assert.match(source, /client\?: Pick<WorkbenchClient, "conversations" \| "navigation">/)
  assert.match(source, /const workspaceNavigation = useMemo<NavigationAdapter>/)
  assert.match(source, /navigation \?\? client\?\.navigation \?\? \{/)
  assert.match(source, /go: \(href\) => router\.push\(href\)/)
  assert.match(source, /replace: \(href\) => router\.replace\(href\)/)
  assert.match(source, /workspaceNavigation\.replace\(/)
  assert.equal(source.match(/\brouter\.replace\(/g)?.length, 1)
  assert.match(source, /onClick=\{\(\) => workspaceNavigation\.go\(action\.href\)\}/)
  assert.doesNotMatch(source, /from "next\/link"/)
})

test("AI Entry delegates common cloud message geometry to the shared workbench UI", () => {
  const source = readFileSync(resolve(process.cwd(), "components/ai-entry/ai-entry-workspace.tsx"), "utf8")

  assert.match(source, /import \{ WorkbenchCloudMessageShell, WorkbenchMessageTimeline \} from "@aimarketing\/workbench-ui"/)
  assert.match(source, /<WorkbenchMessageTimeline/)
  assert.equal(source.match(/<WorkbenchCloudMessageShell/g)?.length, 2)
  assert.doesNotMatch(source, /<Message key=\{message\.id\}/)
})

test("AI Entry can load portable conversation messages through an injected WorkbenchClient", () => {
  const source = readFileSync(resolve(process.cwd(), "components/ai-entry/ai-entry-workspace.tsx"), "utf8")

  assert.match(source, /const portableMessages = await client\.conversations\.messages\(targetConversationId\)/)
  assert.match(source, /response: \{ ok: true, status: 200 \}/)
  assert.match(source, /taskRuns: \[\]/)
})
