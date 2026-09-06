import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const source = readFileSync(resolve(process.cwd(), "components/workflows/workflow-list-page.tsx"), "utf8")

test("workflow list adapts online data and actions through the shared workbench directory", () => {
  assert.match(source, /import \{ WorkbenchWorkflowDirectory(?:, type WorkbenchWorkflowDirectoryAction)? \} from "@coworkany\/workbench-ui"/)
  assert.match(source, /<WorkbenchWorkflowDirectory[\s\S]*?workflows=\{workflows\.map\(/)
  assert.match(source, /templates=\{templates\.map\(/)
  assert.match(source, /recentRuns=\{recentRuns\.map\(/)
  assert.match(source, /onAction=\{handleDirectoryAction\}/)
  assert.match(source, /action\.type === "create"/)
  assert.match(source, /action\.type === "open"/)
  assert.match(source, /action\.type === "duplicate"/)
  assert.match(source, /action\.type === "delete"/)
  assert.match(source, /action\.type === "instantiate"/)
  assert.match(source, /action\.type === "open-run"/)
  assert.match(source, /action\.type === "duplicate"[\s\S]*?await handleDuplicate\(workflow\)/)
  assert.match(source, /action\.type === "delete"[\s\S]*?await handleDeleteWorkflow\(workflow\)/)
  assert.match(source, /action\.type === "instantiate"[\s\S]*?await handleCreateFromTemplate\(template\)/)
  assert.match(source, /action\.type === "open-run"[\s\S]*?router\.push\(`\/dashboard\/workflows\/runs\/\$\{action\.id\}`\)/)
})
