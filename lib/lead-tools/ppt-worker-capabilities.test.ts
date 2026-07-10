import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  getPptMasterTemplateCatalog,
  getPptMasterLibraryTemplateIds,
  getPptWorkerSupportedTemplateIds,
  isPptMasterLibraryTemplateSupported,
  resetPptWorkerCapabilitiesCachesForTests,
} from "./ppt-worker-capabilities"

test("ppt-master template manifest keeps worker ids available without runtime repo indexes", () => {
  const originalCwd = process.cwd()
  const originalRepoDir = process.env.PPT_MASTER_REPO_DIR
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ppt-worker-capabilities-"))

  try {
    process.chdir(tempDir)
    process.env.PPT_MASTER_REPO_DIR = path.join(tempDir, "missing-ppt-master")
    resetPptWorkerCapabilitiesCachesForTests()

    const templateIds = getPptWorkerSupportedTemplateIds()
    assert.equal(templateIds.length > 0, true)
    assert.equal(templateIds.includes("ppt169_building_effective_agents"), true)
    assert.equal(templateIds.includes("ppt169_global_ai_capital_2026"), true)
    const catalog = getPptMasterTemplateCatalog()
    assert.equal(catalog.length > 0, true)
    assert.equal(catalog.some((template) => template.id === "ppt169_global_ai_capital_2026"), true)
  } finally {
    process.chdir(originalCwd)
    if (originalRepoDir === undefined) {
      delete process.env.PPT_MASTER_REPO_DIR
    } else {
      process.env.PPT_MASTER_REPO_DIR = originalRepoDir
    }
    resetPptWorkerCapabilitiesCachesForTests()
    fs.rmSync(tempDir, { recursive: true, force: true })
  }
})

test("ppt-master library template ids exclude internal style aliases", () => {
  const templateIds = getPptMasterLibraryTemplateIds()

  assert.equal(templateIds.includes("long-table"), false)
  assert.equal(templateIds.includes("playful"), false)
  assert.equal(templateIds.includes("broadside"), false)
  assert.equal(templateIds.includes("neo-grid-bold"), false)
  assert.equal(templateIds.includes("cangzhuo"), false)
  assert.equal(templateIds.includes("general-dark-tech-claude-code-auto-mode"), false)
  assert.equal(templateIds.includes("smart_red"), false)
  assert.equal(templateIds.includes("科技蓝商务"), false)
  assert.equal(templateIds.includes("anthropic"), true)
  assert.equal(templateIds.includes("中国电信"), true)
  assert.equal(templateIds.includes("ppt169_general_dark_tech_claude_code_auto_mode"), true)
})

test("ppt-master library template support only accepts concrete template ids", () => {
  assert.equal(isPptMasterLibraryTemplateSupported("long-table"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("broadside"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("cangzhuo"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("smart_red"), false)
  assert.equal(isPptMasterLibraryTemplateSupported("anthropic"), true)
  assert.equal(isPptMasterLibraryTemplateSupported("ppt169_general_dark_tech_claude_code_auto_mode"), true)
})
