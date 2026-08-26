import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import test from "node:test"

const source = readFileSync(resolve(process.cwd(), "components/platform/workspace-capabilities-media-workspace.tsx"), "utf8")

test("online capability workspace delegates directory and launcher UI to the shared center", () => {
  assert.match(source, /import \{ WorkbenchCapabilityCenter, type WorkbenchCapabilityCenterGroup \} from "@aimarketing\/workbench-ui"/)
  assert.match(source, /const capabilityCenterGroups = useMemo<WorkbenchCapabilityCenterGroup\[\]>/)
  assert.match(source, /disabledReason: locale === "zh" \? "当前账号或运行时尚未配置"/)
  assert.match(source, /<WorkbenchCapabilityCenter[\s\S]*?groups=\{capabilityCenterGroups\}/)
  assert.match(source, /onFeatureOpen=\{\(featureId\) => openFeatureTab/)
  assert.match(source, /onFeatureClose=\{\(featureId\) => closeFeatureTab/)
  assert.match(source, /onOpenTasks=\{\(\) => router\.push\("\/dashboard\/tasks"\)\}/)
})
