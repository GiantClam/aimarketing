import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import test from "node:test"

const require = createRequire(import.meta.url)
const nodeModule = require("node:module") as {
  _load: (request: string, parent: unknown, isMain: boolean) => unknown
}
const originalLoad = nodeModule._load

let previewShouldFail = false
let exportShouldFail = false
let previewFailureMessage = "ppt_master_repo_missing"
let storedDeck: Record<string, unknown> | null = null
let previewInputs: Array<Record<string, unknown>> = []
let mockedDownloadDeckPreviewEngine: "ppt-master-project" | "frontend-slides-html" = "ppt-master-project"
let mockedDownloadContentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
let mockedDownloadFileName = "ai-marketing-workbench.pptx"

nodeModule._load = function patchedModuleLoad(request: string, parent: unknown, isMain: boolean) {
  if (request === "server-only") {
    return {}
  }

  if (request === "ai") {
    return {
      tool: (definition: Record<string, unknown>) => definition,
    }
  }

  if (request === "@/lib/lead-tools/runtime") {
    return {
      buildLeadToolPreview: async (_slug: string, input: Record<string, unknown>) => {
        previewInputs.push(input)
        if (previewShouldFail) {
          throw new Error(previewFailureMessage)
        }
        return {
          previewSessionId: "preview-session-1",
          generatedAt: "2026-06-24T00:00:00.000Z",
          deck: {
            title: "AI Marketing Workbench",
            scenario: "marketing-campaign",
            language: "zh-CN",
            generatedAt: "2026-06-24T00:00:00.000Z",
            outline: ["one", "two"],
            variants: [
              {
                key: "variant-a",
                name: "Variant A",
                summary: "Summary",
                styleKey: "ppt169_brutalist_ai_newspaper_2026",
                slides: [{ title: "Cover" }],
              },
            ],
          },
          meta: {
            platformRunId: 101,
            platformArtifactId: 201,
          },
        }
      },
      buildLeadToolDownload: async () => {
        if (exportShouldFail) {
          throw new Error("ppt_master_repo_missing")
        }
        return {
          artifact: {
            buffer: Buffer.from("pptx"),
            contentType: mockedDownloadContentType,
            fileName: mockedDownloadFileName,
          },
          deck: {
            title: "AI Marketing Workbench",
            pageCount: 5,
            resolvedPageCount: 5,
            previewEngine: mockedDownloadDeckPreviewEngine,
          },
          variant: {
            key: "variant-a",
            name: "Variant A",
            slides: [{}, {}, {}, {}, {}],
          },
          meta: {
            platformRunId: 301,
            platformArtifactId: 401,
            platformWorkItemId: 501,
          },
        }
      },
    }
  }

  if (request === "@/lib/lead-tools/ppt-preview-session-store") {
    return {
      getPptPreviewSessionDeck: async (previewSessionId: string) => {
        if (!storedDeck) {
          throw new Error(`missing_preview_session:${previewSessionId}`)
        }
        return storedDeck
      },
    }
  }

  return originalLoad.call(this, request, parent, isMain)
}

let buildAiEntryPptTools: typeof import("./ppt-tools").buildAiEntryPptTools
const yusuanAttachmentMarkdown = readFileSync(
  new URL("../../tests/fixtures/ppt/yusuan-intelligence-ppt-info.md", import.meta.url),
  "utf8",
)

type TestToolSet = Record<
  string,
  {
    inputSchema?: unknown
    execute: (input: Record<string, unknown>, options?: unknown) => Promise<Record<string, any>>
  }
>

const DEFAULT_PPT_BRIEF_INPUT = {
  audience: "管理层汇报",
  goal: "经营汇报与决策同步",
  scenario: "marketing-campaign",
  language: "zh-CN",
} as const

function buildStructuredPrompt(
  prompt: string,
  input: Partial<{
    audience: string
    goal: string
    scenario: string
    language: string
  }> & {
    pageCount?: number
    tone?: string
    mustInclude?: string[]
  } = {},
) {
  const brief = {
    ...DEFAULT_PPT_BRIEF_INPUT,
    ...input,
  }

  return [
    prompt,
    "",
    "Structured brief:",
    `Audience: ${brief.audience}`,
    `Goal: ${brief.goal}`,
    `Scenario: ${brief.scenario}`,
    `Language: ${brief.language}`,
    typeof input.pageCount === "number" ? `Page count: ${input.pageCount}` : null,
    input.tone ? `Tone: ${input.tone}` : null,
    input.mustInclude?.length ? `Must include: ${input.mustInclude.join("; ")}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")
}

function readZodObjectShape(schema: unknown) {
  const shape = (schema as { shape?: unknown } | null)?.shape
  if (typeof shape === "function") return shape() as Record<string, unknown>
  if (shape && typeof shape === "object") return shape as Record<string, unknown>
  return {}
}

test.before(async () => {
  const mod = await import("./ppt-tools")
  buildAiEntryPptTools = mod.buildAiEntryPptTools
})

test.beforeEach(() => {
  previewShouldFail = false
  exportShouldFail = false
  previewFailureMessage = "ppt_master_repo_missing"
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "remote-worker"
  previewInputs = []
  mockedDownloadDeckPreviewEngine = "ppt-master-project"
  mockedDownloadContentType = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  mockedDownloadFileName = "ai-marketing-workbench.pptx"
  storedDeck = {
    title: "AI Marketing Workbench",
    pageCount: 5,
    resolvedPageCount: 5,
    previewEngine: "ppt-master-project",
    variants: [
      {
        key: "variant-a",
        name: "Variant A",
        summary: "Summary",
        styleKey: "ppt169_brutalist_ai_newspaper_2026",
        slides: [{ title: "Cover" }, {}, {}, {}, {}],
      },
    ],
  }
})

test.after(() => {
  delete process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT
  nodeModule._load = originalLoad
})

test("editable ppt agent tool schema does not expose auto template mode to the model", () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const shape = readZodObjectShape(tools.preview_ppt_deck.inputSchema)

  assert.equal("templateMode" in shape, false)
  assert.equal("templateId" in shape, true)
})

test("editable ppt brief updates are merged by the model-facing tool and preserve unchanged fields", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
    briefState: {
      topic: "俄乌战争现状",
      audience: "军事爱好者",
      goal: "培训讲解与统一认知",
      scenario: "training",
      language: "zh-CN",
      pageCount: 12,
      tone: "简洁、专业、决策导向",
      mustInclude: [],
      missingFields: [],
      readyForPreview: true,
      suggestedValues: {
        audience: "军事爱好者",
        goal: "培训讲解与统一认知",
        scenario: "training",
        language: "zh-CN",
        pageCount: 12,
        tone: "简洁、专业、决策导向",
      },
    },
  }) as unknown as TestToolSet

  const result = await tools.update_ppt_brief.execute({ pageCount: 10 })

  assert.equal(result.ok, true)
  assert.equal((result.brief as Record<string, unknown>).pageCount, 10)
  assert.equal((result.brief as Record<string, unknown>).topic, "俄乌战争现状")
  assert.match(String(result.message), /ai-entry-ppt-brief-confirmation:/u)
})

test("editable ppt template recommendations are accepted only as exact catalog ids", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet & {
    recommend_ppt_templates: { execute: (input: unknown) => Promise<Record<string, unknown>> }
  }

  const recommendation = await tools.recommend_ppt_templates.execute({
    templateIds: ["ppt169_global_ai_capital_2026"],
  })

  assert.equal(recommendation.ok, true)
  assert.equal(
    (recommendation.recommendedTemplates as Array<{ templateId?: unknown }>)[0]?.templateId,
    "ppt169_global_ai_capital_2026",
  )
  assert.match(String(recommendation.message), /ai-entry-ppt-template-recommendations:/u)

  const multiple = await tools.recommend_ppt_templates.execute({
    templateIds: ["ppt169_global_ai_capital_2026", "ppt169_building_effective_agents"],
  })
  assert.equal(multiple.ok, false)
  assert.equal(
    (multiple.error as { code?: unknown }).code,
    "ppt_template_recommendation_requires_single_template",
  )

  const invalid = await tools.recommend_ppt_templates.execute({ templateIds: ["not-a-ppt-master-template"] })
  assert.equal(invalid.ok, false)
  assert.equal((invalid.error as { code?: unknown }).code, "ppt_template_recommendation_invalid")
})

test("ppt tools return preview metadata and export a downloadable PPTX artifact", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份 AI Marketing Workbench 的汇报 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })
  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  assert.equal(preview.ok, true)
  assert.equal(preview.previewSessionId, "preview-session-1")
  assert.equal(Array.isArray(preview.variants), true)
  assert.equal(typeof preview.nextStep, "string")
  assert.match(
    preview.nextStep,
    /export_ppt_deck/u,
  )
  assert.equal("artifact" in preview, false)
  assert.deepEqual(previewInputs[0], {
    prompt: buildStructuredPrompt("做一份 AI Marketing Workbench 的汇报 PPT"),
    researchBrief: undefined,
    scenario: "marketing-campaign",
    language: "zh-CN",
    previewRuntime: undefined,
    templateMode: "auto-4",
    templateId: undefined,
    narrativeAngle: undefined,
    pageCount: undefined,
  })
  assert.equal(exported.ok, true)
  assert.equal(exported.fileName, "ai-marketing-workbench.pptx")
  assert.equal(
    exported.contentType,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )
  assert.equal(exported.artifactId, 401)
  assert.equal(exported.toolRunId, 301)
  assert.equal(exported.downloadUrl, "/api/platform/artifacts/401/download?download=1")
})

test("editable ppt agent requires an LLM-selected template before preview", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会经营复盘与风险诊断汇报 PPT，包含财务预算、关键决策与下一步计划",
    audience: "董事会",
    goal: "管理层决策同步",
    scenario: "sales-deck",
    language: "zh-CN",
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_template_selection_required")
  assert.equal(previewInputs.length, 0)
})

test("editable ppt agent does not infer a template from topic keywords", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "写一份介绍预算智能公司和业务的 PPT，强调科技公司介绍、解决方案能力和专业但有活力的视觉表达",
    audience: "潜在客户与合作伙伴",
    goal: "公司与业务介绍",
    scenario: "sales-deck",
    language: "zh-CN",
    researchBrief: {
      topic: "预算智能公司介绍",
      keyFacts: ["企业 AI 业务工作台", "面向老板、销售、运营和内容团队", "产品介绍与解决方案叙事并重"],
      implications: ["需要兼顾商务表达、科技感和产品能力展示"],
    },
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_template_selection_required")
  assert.equal(previewInputs.length, 0)
})

test("editable ppt agent can preview through local ppt-master transport after template selection", async () => {
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "local"

  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会经营复盘与风险诊断汇报 PPT，包含财务预算、关键决策与下一步计划",
    audience: "董事会",
    goal: "管理层决策同步",
    scenario: "sales-deck",
    language: "zh-CN",
    templateId: "ppt169_global_ai_capital_2026",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
  assert.equal(previewInputs[0]?.previewRuntime, "ppt-master-agent")
})

test("editable ppt agent can export through local ppt-master transport", async () => {
  process.env.LEAD_TOOLS_PPT_EXECUTION_TRANSPORT = "local"

  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  assert.equal(exported.ok, true)
  assert.equal(exported.fileName, "ai-marketing-workbench.pptx")
})

test("editable ppt agent uses the user's selected model for content planning", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
    selectedPreviewModel: "deepseek-v4-pro",
    selectedPreviewProviderId: "enterprise-openai-compatible",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份屿算智能管理层培训 PPT",
    audience: "管理层",
    goal: "统一产品认知与对外口径",
    scenario: "training",
    language: "zh-CN",
    templateId: "ppt169_global_ai_capital_2026",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
  assert.equal(previewInputs[0]?.model, "deepseek-v4-pro")
  assert.equal(previewInputs[0]?.preferredProviderId, "enterprise-openai-compatible")
  assert.equal(previewInputs[0]?.previewRuntime, "ppt-master-agent")
})

test("editable ppt agent only honors explicit template requests when sourcePrompt is provided", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const promptOnlyResult = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会经营复盘与风险诊断汇报 PPT，包含财务预算、关键决策与下一步计划",
    audience: "董事会",
    goal: "管理层决策同步",
    scenario: "sales-deck",
    language: "zh-CN",
  })

  await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会经营复盘与风险诊断汇报 PPT，包含财务预算、关键决策与下一步计划",
    sourcePrompt: "做一份企业 AI 工作台的产品发布演示 PPT，强调视觉冲击、系统感和产品能力展示",
    audience: "董事会",
    goal: "管理层决策同步",
    scenario: "sales-deck",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "ppt169_general_dark_tech_claude_code_auto_mode",
  })
  const sourcePromptInput = previewInputs.at(-1)

  assert.equal(promptOnlyResult.ok, false)
  assert.equal(promptOnlyResult.error?.code, "ppt_template_selection_required")
  assert.equal(sourcePromptInput?.templateMode, "single-template")
  assert.equal(sourcePromptInput?.templateId, "ppt169_general_dark_tech_claude_code_auto_mode")
})

test("ppt tools forward researchBrief into preview generation", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状汇报 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    researchBrief:
      "主题：霍尔木兹海峡现状。关键事实：保险成本上升，航运风险溢价扩大，买方库存前移。结论：运输成本和交付周期同步受压。",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
  assert.equal(
    previewInputs[0]?.researchBrief,
    "主题：霍尔木兹海峡现状。关键事实：保险成本上升，航运风险溢价扩大，买方库存前移。结论：运输成本和交付周期同步受压。",
  )
})

test("ppt tools pin a single narrative angle for single-template preview generation", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会摘要 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    templateMode: "single-template",
    templateId: "broadside",
  })

  assert.equal(preview.ok, true)
  assert.deepEqual(previewInputs[0], {
    prompt: buildStructuredPrompt("做一份董事会摘要 PPT"),
    researchBrief: undefined,
    scenario: "marketing-campaign",
    language: "zh-CN",
    previewRuntime: undefined,
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
    pageCount: undefined,
  })
})

test("ppt tools coerce template id preview requests to single-template mode", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份课堂讲解 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    templateMode: "auto-4",
    templateId: "ppt169_attention_is_all_you_need",
  })

  assert.equal(preview.ok, true)
  assert.deepEqual(previewInputs[0], {
    prompt: buildStructuredPrompt("做一份课堂讲解 PPT"),
    researchBrief: undefined,
    scenario: "marketing-campaign",
    language: "zh-CN",
    previewRuntime: "ppt-master-agent",
    templateMode: "single-template",
    templateId: "ppt169_attention_is_all_you_need",
    narrativeAngle: "executive-brief",
    pageCount: undefined,
  })
})

test("editable ppt agent rejects internal mapped template ids in favor of vendor template ids", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份军事态势课堂讲解 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    templateMode: "single-template",
    templateId: "general-dark-tech-claude-code-auto-mode",
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_editable_template_unsupported")
  assert.match(String(preview.error?.message || ""), /general-dark-tech-claude-code-auto-mode/)
  assert.equal(previewInputs.length, 0)
})

test("ppt tools accept official ppt-master example ids for single-template preview", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份预算智能公司和业务介绍 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    templateMode: "single-template",
    templateId: "ppt169_building_effective_agents",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs[0]?.templateMode, "single-template")
  assert.equal(previewInputs[0]?.templateId, "ppt169_building_effective_agents")
  assert.equal(previewInputs[0]?.narrativeAngle, "executive-brief")
})

test("editable ppt agent rejects internal style aliases that are not in the ppt-master template library", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份预算智能公司介绍 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    templateMode: "single-template",
    templateId: "long-table",
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_editable_template_unsupported")
  assert.match(String(preview.error?.message || ""), /long-table/)
  assert.equal(previewInputs.length, 0)
})

test("ppt tools forward structured researchBrief objects into preview generation", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状汇报 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    researchBrief: {
      topic: "霍尔木兹海峡现状",
      keyFacts: ["保险成本上升", "航运风险溢价扩大"],
      risks: ["运输成本抬升"],
      implications: ["买方库存前移"],
      sourceNotes: ["Source A - https://example.com/a"],
      rawSummary: "关键事实：保险成本上升，航运风险溢价扩大。",
    },
  })

  assert.equal(preview.ok, true)
  assert.deepEqual(previewInputs[0]?.researchBrief, {
    topic: "霍尔木兹海峡现状",
    keyFacts: ["保险成本上升", "航运风险溢价扩大"],
    risks: ["运输成本抬升"],
    implications: ["买方库存前移"],
    sourceNotes: ["Source A - https://example.com/a"],
    rawSummary: "关键事实：保险成本上升，航运风险溢价扩大。",
  })
})

test("ppt tools can preview and export a deck from the yusuan attachment markdown", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "基于附件文档生成一份屿算智能企业 AI 业务工具介绍 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    researchBrief: yusuanAttachmentMarkdown,
    templateMode: "single-template",
    templateId: "broadside",
  })
  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  const forwardedInput = previewInputs.at(-1)

  assert.match(yusuanAttachmentMarkdown, /企业专属 AI 业务工具/u)
  assert.match(yusuanAttachmentMarkdown, /17 个 AI 智能体员工/u)
  assert.equal(preview.ok, true)
  assert.equal(exported.ok, true)
  assert.deepEqual(forwardedInput, {
    prompt: buildStructuredPrompt("基于附件文档生成一份屿算智能企业 AI 业务工具介绍 PPT"),
    researchBrief: yusuanAttachmentMarkdown,
    scenario: "marketing-campaign",
    language: "zh-CN",
    previewRuntime: undefined,
    templateMode: "single-template",
    templateId: "broadside",
    narrativeAngle: "executive-brief",
    pageCount: undefined,
  })
  assert.equal(exported.fileName, "ai-marketing-workbench.pptx")
  assert.equal(
    exported.contentType,
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  )
  assert.equal(exported.artifactId, 401)
  assert.equal(exported.downloadUrl, "/api/platform/artifacts/401/download?download=1")
})

test("ppt tools return a safe runtime error when ppt-master is unavailable", async () => {
  previewShouldFail = true
  previewFailureMessage = "ppt_master_repo_missing"
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_master_runtime_unavailable")
  assert.equal(preview.error?.rawMessage, "ppt_master_repo_missing")
})

test("ppt tools surface ppt-master integrity failures as regeneration-required errors", async () => {
  previewShouldFail = true
  previewFailureMessage =
    "ppt_master_quality_check_failed:/tmp/project/svg_output/03_insight.svg:Invalid XML: not well-formed"
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_master_quality_check_failed")
  assert.match(String(preview.error?.message || ""), /must be regenerated/i)
})

test("ppt tools separate upstream quota failures from workspace billing failures", async () => {
  previewShouldFail = true
  previewFailureMessage = "Your account quota is insufficient. Please recharge. (request id: req_123)"
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "upstream_provider_quota_exceeded")
  assert.match(String(preview.error?.message || ""), /separate from workspace credits/i)
})

test("ppt tools explain unsupported remote worker models clearly", async () => {
  previewShouldFail = true
  previewFailureMessage = "invalid params, unknown model 'gpt-5.4' (2013)"
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份董事会 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_runtime_model_unsupported")
  assert.match(String(preview.error?.message || ""), /MiniMax-M3/)
})

test("ppt tools do not use keyword gates to decide whether research is needed", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状和对全球能源运输影响的 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("ppt tools allow factual decks to preview after a researchBrief is provided", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份霍尔木兹海峡现状和对全球能源运输影响的 PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
    researchBrief: "关键事实：霍尔木兹海峡风险抬升导致保费和运输成本上升。",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("ppt tools do not require a researchBrief only because structured brief details mention market pain points", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: [
      "生成一份4页中文产品方案PPT，主题是企业AI营销工作台。面向企业管理层，用于产品发布场景下的产品介绍。",
      "",
      "Structured brief:",
      "Audience: 企业管理层",
      "Goal: 产品介绍",
      "Scenario: product-launch",
      "Language: zh-CN",
      "Page count: 4",
      "Must include: 市场痛点 & 产品定位; 核心功能与竞争优势",
    ].join("\n"),
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("ppt tools do not require a researchBrief for product deck copy with generic market opportunity language", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: [
      "制作一份4页产品方案PPT，主题为「企业AI营销工作台」。按以下结构展开：",
      "",
      "第1页 - 封面：标题「企业AI营销工作台」，副标题「让营销团队效率翻倍的AI工作台」。",
      "第2页 - 问题与机会：指出当前企业营销三大核心痛点，内容生产效率低、数据洞察滞后、团队协作碎片化。引出AI营销工作台的市场机会和解决方向。",
      "第3页 - 产品方案与核心价值：展示AI内容引擎、数据决策中心、协同工作流。",
      "第4页 - 落地路径：试点导入、规模推广、持续优化，并附关键成功指标。",
      "Structured brief:",
      "Audience: 管理层",
      "Goal: 帮助管理层快速理解产品价值和落地路径",
      "Scenario: product-launch",
      "Language: zh-CN",
      "Page count: 4",
      "Tone: 简洁、专业、决策导向",
    ].join("\n"),
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("ppt tools leave research-needed decisions to the LLM", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份2026年AI营销市场趋势和行业竞争格局PPT",
    ...DEFAULT_PPT_BRIEF_INPUT,
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("ppt tools preserve sourcePrompt while leaving research decisions to the LLM", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: [
      "请生成一份董事会经营复盘与风险诊断汇报 PPT。",
      "",
      "本次 Deck 结构（10 页）",
      "关键风险诊断（外部） —— 市场、竞争、政策",
      "",
      "Structured brief:",
      "Audience: 董事会和管理层",
      "Goal: 经营汇报与决策同步",
      "Scenario: sales-deck",
      "Language: zh-CN",
      "Page count: 10",
    ].join("\n"),
    sourcePrompt:
      "请生成一份董事会经营复盘与风险诊断汇报 PPT。受众是董事会和管理层，目标是经营汇报与决策同步，场景是 sales-deck，语言是中文，10 页，强调财务预算、关键决策与下一步计划。",
    audience: "董事会和管理层",
    goal: "经营汇报与决策同步",
    scenario: "sales-deck",
    language: "zh-CN",
    pageCount: 10,
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs.length, 1)
})

test("presentation ppt agent pins frontend runtime and accepts html export artifacts", async () => {
  mockedDownloadDeckPreviewEngine = "frontend-slides-html"
  mockedDownloadContentType = "text/html; charset=utf-8"
  mockedDownloadFileName = "ai-marketing-workbench.html"
  storedDeck = {
    title: "AI Marketing Workbench",
    pageCount: 5,
    resolvedPageCount: 5,
    previewEngine: "frontend-slides-html",
    variants: [
      {
        key: "variant-a",
        name: "Variant A",
        summary: "Summary",
        styleKey: "ppt169_brutalist_ai_newspaper_2026",
        slides: [{ title: "Cover" }, {}, {}, {}, {}],
      },
    ],
  }

  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-presentation-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份适合现场演讲的发布会 PPT",
    audience: "发布会现场观众",
    goal: "现场演讲与品牌传播",
    scenario: "product-launch",
    language: "zh-CN",
  })
  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs[0]?.previewRuntime, "frontend-slides-agent")
  assert.equal(exported.ok, true)
  assert.equal(exported.fileName, "ai-marketing-workbench.html")
  assert.equal(exported.contentType, "text/html; charset=utf-8")
})

test("presentation ppt agent forwards the selected model routing into frontend-slides preview generation", async () => {
  mockedDownloadDeckPreviewEngine = "frontend-slides-html"
  mockedDownloadContentType = "text/html; charset=utf-8"
  mockedDownloadFileName = "ai-marketing-workbench.html"
  storedDeck = {
    title: "AI Marketing Workbench",
    pageCount: 5,
    resolvedPageCount: 5,
    previewEngine: "frontend-slides-html",
    variants: [
      {
        key: "variant-a",
        name: "Variant A",
        summary: "Summary",
        styleKey: "ppt169_brutalist_ai_newspaper_2026",
        slides: [{ title: "Cover" }, {}, {}, {}, {}],
      },
    ],
  }

  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-presentation-ppt",
    selectedPreviewModel: "gpt-5.4",
    selectedPreviewProviderId: "pptoken",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份 10 分钟发布会演讲型 PPT",
    audience: "发布会现场观众",
    goal: "现场演讲与品牌传播",
    scenario: "product-launch",
    language: "zh-CN",
  })

  assert.equal(preview.ok, true)
  assert.equal(previewInputs[0]?.previewRuntime, "frontend-slides-agent")
  assert.equal(previewInputs[0]?.model, "gpt-5.4")
  assert.equal(previewInputs[0]?.preferredProviderId, "pptoken")
})

test("editable ppt agent rejects frontend-slides html sessions during export", async () => {
  mockedDownloadDeckPreviewEngine = "frontend-slides-html"
  mockedDownloadContentType = "text/html; charset=utf-8"
  mockedDownloadFileName = "ai-marketing-workbench.html"
  storedDeck = {
    title: "AI Marketing Workbench",
    pageCount: 5,
    resolvedPageCount: 5,
    previewEngine: "frontend-slides-html",
    variants: [
      {
        key: "variant-a",
        name: "Variant A",
        summary: "Summary",
        styleKey: "ppt169_brutalist_ai_newspaper_2026",
        slides: [{ title: "Cover" }, {}, {}, {}, {}],
      },
    ],
  }

  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-ppt",
  }) as unknown as TestToolSet

  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  assert.equal(exported.ok, false)
  assert.equal(exported.error?.code, "ppt_export_runtime_mismatch")
  assert.match(String(exported.error?.message || ""), /editable PPTX/i)
})

test("presentation ppt agent rejects editable ppt-master sessions during export", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-presentation-ppt",
  }) as unknown as TestToolSet

  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-a",
  })

  assert.equal(exported.ok, false)
  assert.equal(exported.error?.code, "ppt_export_runtime_mismatch")
  assert.match(String(exported.error?.message || ""), /presentation HTML/i)
})

test("presentation ppt agent rejects ppt-master-only template ids", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
    agentId: "executive-presentation-ppt",
  }) as unknown as TestToolSet

  const preview = await tools.preview_ppt_deck.execute({
    prompt: "做一份适合现场演讲的发布会 PPT",
    audience: "发布会现场观众",
    goal: "现场演讲与品牌传播",
    scenario: "product-launch",
    language: "zh-CN",
    templateMode: "single-template",
    templateId: "ppt169_global_ai_capital_2026",
  })

  assert.equal(preview.ok, false)
  assert.equal(preview.error?.code, "ppt_presentation_template_unsupported")
  assert.match(String(preview.error?.message || ""), /frontend-slides/i)
  assert.equal(previewInputs.length, 0)
})

test("ppt tools return an explainable error when the selected variant is missing", async () => {
  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-1",
    selectedVariantKey: "variant-z",
  })

  assert.equal(exported.ok, false)
  assert.equal(exported.error?.code, "ppt_variant_not_found")
  assert.equal(Array.isArray(exported.availableVariants), true)
})

test("ppt tools return an explainable error when the preview session is missing", async () => {
  storedDeck = null

  const tools = buildAiEntryPptTools({
    currentUser: {
      id: 7,
      enterpriseId: 3,
    } as never,
  }) as unknown as TestToolSet

  const exported = await tools.export_ppt_deck.execute({
    previewSessionId: "preview-session-missing",
    selectedVariantKey: "variant-a",
  })

  assert.equal(exported.ok, false)
  assert.equal(exported.error?.code, "missing_preview_session")
  assert.equal(exported.previewSessionId, "preview-session-missing")
})
