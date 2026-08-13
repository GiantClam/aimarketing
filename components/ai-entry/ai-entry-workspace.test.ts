import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import { resolve } from "node:path"

test("AI Entry routes through an injected NavigationAdapter with a Next fallback", () => {
  const source = readFileSync(resolve(process.cwd(), "components/ai-entry/ai-entry-workspace.tsx"), "utf8")

  assert.match(source, /navigation\?: NavigationAdapter/)
  assert.match(source, /const workspaceNavigation = useMemo<NavigationAdapter>/)
  assert.match(source, /go: \(href\) => router\.push\(href\)/)
  assert.match(source, /replace: \(href\) => router\.replace\(href\)/)
  assert.match(source, /workspaceNavigation\.replace\(/)
  assert.equal(source.match(/\brouter\.replace\(/g)?.length, 1)
})
