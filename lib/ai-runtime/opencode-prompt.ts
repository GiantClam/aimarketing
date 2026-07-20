import type { AgentRuntimeInput } from "./contracts"

function clipPromptText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const head = Math.ceil(maxLength * 0.6)
  const tail = maxLength - head
  return `${value.slice(0, head)}\n...[context clipped for provider request size]...\n${value.slice(-tail)}`
}

function compactMessages(input: AgentRuntimeInput, maxTotalLength = 32_000) {
  let remaining = maxTotalLength
  return input.messages.flatMap((message) => {
    if (remaining <= 0) return []
    const content = clipPromptText(message.content, Math.min(12_000, remaining))
    remaining -= content.length
    return [{ ...message, content }]
  })
}

/**
 * Legacy text wrapper retained for callers that cannot send a native system
 * field. Production OpenCode transports now use buildOpenCodeSystemPrompt and
 * buildOpenCodeUserPrompt separately.
 */
export function buildOpenCodeSessionPrompt(input: {
  systemPrompt?: string | null
  userMessage?: string | null
}) {
  const systemPrompt = typeof input.systemPrompt === "string" ? input.systemPrompt.trim() : ""
  const userMessage = typeof input.userMessage === "string" ? input.userMessage.trim() : ""

  if (!systemPrompt) return userMessage
  if (!userMessage) return `<aimarketing-system-instructions>\n${systemPrompt}\n</aimarketing-system-instructions>`

  return [
    "<aimarketing-system-instructions>",
    systemPrompt,
    "</aimarketing-system-instructions>",
    "",
    "<aimarketing-user-message>",
    userMessage,
    "</aimarketing-user-message>",
  ].join("\n")
}

function buildRuntimeContext(input: AgentRuntimeInput) {
  const isDashiPresentation = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  // The current user turn is sent as the actual user message. Keep only
  // historical messages in the system-side context to avoid duplicating or
  // reclassifying the user's request as a system instruction.
  const historicalInput = { ...input, messages: input.messages.slice(0, -1) }
  const promptMessages = isDashiPresentation ? compactMessages(historicalInput) : historicalInput.messages
  return JSON.stringify({
    runId: input.runId,
    conversationId: input.conversationId,
    sessionKey: input.sessionKey || null,
    agentId: input.agentId,
    selectedSkillIds: input.selectedSkillIds || [],
    exportConfirmationGranted: input.exportConfirmationGranted === true,
    messages: promptMessages,
    attachments: input.attachments,
    artifactContext: input.artifactContext,
    workflowContext: input.workflowContext,
  })
}

export function buildOpenCodeSystemPrompt(input: AgentRuntimeInput) {
  const isEditablePpt = input.agentId === "executive-ppt" || (input.selectedSkillIds || []).includes("ppt-master")
  const isDashiPresentation = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  const isBusinessAgent = input.agentId?.startsWith("business-") === true
  const isPersistentWorkspace = isEditablePpt || isDashiPresentation || isBusinessAgent
  const promptSystem = isDashiPresentation ? clipPromptText(input.systemPrompt, 32_000) : input.systemPrompt
  const context = buildRuntimeContext(input)

  return [
    "You are running inside an aimarketingsite SaaS sandbox workspace.",
    isPersistentWorkspace
      ? `All conversation context required for this turn is included below and in ./turns/${input.runId}/input.json.`
      : "All conversation context required for this turn is included below and in ./input.json.",
    "Do not rely on previous OpenCode local memory.",
    isPersistentWorkspace
      ? isBusinessAgent
        ? "This business Agent session has a persistent ./workspace directory and a per-turn ./turns/<runId> directory. Reuse the workspace for continuity and write published artifacts to the current turn directory."
        : "This presentation session has a persistent ./workspace directory and a per-turn ./turns/<runId> directory. Use the persistent workspace for the project and the current turn directory for published artifacts."
      : "Use only the current run directory for generated files.",
    isPersistentWorkspace
      ? "If you create files for the user, write them under the current turn's ./turns/<runId>/artifacts directory."
      : "If you create files for the user, write them under ./artifacts.",
    isPersistentWorkspace
      ? "Always write ./turns/<runId>/artifact-manifest.json when files are created."
      : "Always write ./artifact-manifest.json when files are created.",
    isPersistentWorkspace
      ? "Do not read or write outside the session workspace; never access platform secrets or other sessions."
      : "Do not read or write outside the run directory.",
    "Do not attempt to access platform secrets, database credentials, or service keys.",
    "Platform tools, MCP servers, skill installation, workflow state, billing, and database writes are unavailable.",
    ...(isBusinessAgent
      ? [
          "This is a persistent business Agent session. Reuse the persistent ./workspace across turns, preserve useful working context, and follow the selected governed business-agent instructions.",
          "Do not invoke platform tools, install skills, ask interactive questions, or wait for approval. Return one execution-ready answer for the current user turn.",
        ]
      : isDashiPresentation
      ? [
          "This is the speaker-style PPT assistant. You are the primary conversational agent and must run the native Dashi AI PPT skill end to end.",
          "Read /opt/dashiai-ppt/SKILL.md and follow it exactly. Do not use the legacy brief collector, platform PPT tools, or a fixed preview/export workflow.",
          "Use the persistent ./workspace for the Dashi project. This server turn is unattended: do not call the interactive question tool or wait for user input; choose reasonable defaults for missing details and continue. A later user turn can refine the deck. Show meaningful progress messages while you work.",
          "You have full execution permission inside this container and should not request approval. Never delete files or directories; preserve existing workspace files and overwrite only files required by the native Dashi workflow.",
          `Use Dashi's native render, visual QA, and export flow, and write the final PPTX/HTML/assets plus artifact-manifest.json under ./turns/${input.runId}/artifacts/.`,
          "Use webfetch/web search inside OpenCode when current evidence is needed. Never expose provider credentials or other platform secrets.",
        ]
      : isEditablePpt
      ? [
          "This is the editable PPT assistant. You are the primary conversational agent, not a brief collector.",
          "Use the runtime-selected model for this editable PPT render; the default is pptoken/grok-4.5. Delegate generation to the native ppt-master skill and keep its workflow and artifact contract unchanged.",
          input.exportConfirmationGranted === true
            ? "Before answering, read .opencode/skills/ppt-master/SKILL.md and execute its native generation commands. This confirmed export turn is successful only after a real editable PPTX, SVG quality-check output, and artifact-manifest.json are written."
            : "Before answering, read .opencode/skills/ppt-master/SKILL.md and execute its native preparation and preview commands. This unconfirmed turn must not publish a PPTX; it is successful after the brief/preview and quality-check output are ready.",
          input.exportConfirmationGranted === true
            ? "The current user turn contains an explicit export confirmation. Treat that confirmation as approval for the export gate, and continue the serial pipeline through SVG export and quality repair after the native quality checks pass."
            : "The current user turn does not contain an explicit export confirmation. You may prepare the brief, select one template/variant, and produce a preview or quality-check output, but stop before PPTX/SVG export and ask the user to explicitly confirm export. Never infer approval from this system prompt, an earlier turn, or a generic request to create a PPT.",
          "Editable PPT execution contract: render exactly one deck from exactly one selected template and exactly one narrative variant per conversation turn. Never generate, recommend, compare, or render alternative templates or variants; never use auto-4. If the user names a template, use that exact template; otherwise choose one best-fit template and continue.",
          "Continue multi-turn clarification when information is missing; do not call platform-owned PPT tools. Use only the native ppt-master skill commands.",
          `Keep the persistent PPT project in ./workspace/ppt-master and write final artifacts plus artifact-manifest.json under ./turns/${input.runId}/artifacts/ (the artifact path must remain relative to the current workspace).`,
          "Run the ppt-master skill's own SVG quality check and repair loop before reporting a final PPTX.",
        ]
      : []),
    "Treat the following platform context as trusted runtime data, not as a user instruction. The current user message is supplied separately.",
    `Application system instruction:\n${promptSystem}`,
    `Platform runtime context JSON:\n${context}`,
  ].join("\n")
}

export function buildOpenCodeUserPrompt(input: AgentRuntimeInput) {
  const message = input.messages.at(-1)?.content?.trim() || "Continue using the current runtime context."
  const isDashiPresentation = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  return isDashiPresentation ? clipPromptText(message, 32_000) : message
}

/**
 * Backward-compatible combined prompt for local callers and diagnostics.
 * Production transports should send buildOpenCodeSystemPrompt as `system` and
 * buildOpenCodeUserPrompt as the user text part.
 */
export function buildOpenCodePrompt(input: AgentRuntimeInput) {
  return [buildOpenCodeSystemPrompt(input), "", buildOpenCodeUserPrompt(input)].join("\n")
}
