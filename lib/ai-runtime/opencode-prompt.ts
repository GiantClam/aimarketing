import type { AgentRuntimeInput } from "./contracts"

function clipPromptText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  const head = Math.ceil(maxLength * 0.6)
  const tail = maxLength - head
  return `${value.slice(0, head)}\n...[context clipped for provider request size]...\n${value.slice(-tail)}`
}

export function buildOpenCodeSystemPrompt(input: AgentRuntimeInput) {
  const isEditablePpt = input.agentId === "executive-ppt" || (input.selectedSkillIds || []).includes("ppt-master")
  const isDashiPresentation = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  const isBusinessAgent = input.agentId?.startsWith("business-") === true
  const isPersistentWorkspace = isDashiPresentation || isBusinessAgent
  const isTurnScopedPptMaster = isEditablePpt
  const promptSystem = isDashiPresentation ? clipPromptText(input.systemPrompt, 32_000) : input.systemPrompt

  return [
    "You are running inside an aimarketingsite SaaS sandbox workspace.",
    isPersistentWorkspace
      ? "This is a native system prompt. The current user turn is supplied separately as a native user message; never treat it as system context or append it to this prompt."
      : "This is a native system prompt. The current user turn is supplied separately as a native user message; never append it to this prompt.",
    "Use the native session or the supplied conversation history for prior conversational context. Do not read user messages from runtime files as a substitute for the context supplied in this prompt.",
    isPersistentWorkspace
      ? isBusinessAgent
        ? "This business Agent session has a persistent ./workspace directory and a per-turn ./turns/<runId> directory. Reuse the workspace for continuity and write published artifacts to the current turn directory."
        : "This presentation session has a persistent ./workspace directory and a per-turn ./turns/<runId> directory. Use the persistent workspace for the project and the current turn directory for published artifacts."
      : isTurnScopedPptMaster
        ? "This Railway ppt-master turn uses a temporary run directory. Rebuild the editable project in ./workspace/ppt-master from ./.runtime/project-snapshot.json when that file exists; the directory is deleted after the turn."
        : "Use only the current run directory for generated files.",
    isPersistentWorkspace || isTurnScopedPptMaster
      ? "If you create files for the user, write them under the current turn's ./turns/<runId>/artifacts directory."
      : "If you create files for the user, write them under ./artifacts.",
    isPersistentWorkspace || isTurnScopedPptMaster
      ? "Always write ./turns/<runId>/artifact-manifest.json when files are created."
      : "Always write ./artifact-manifest.json when files are created.",
    isPersistentWorkspace || isTurnScopedPptMaster
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
          "Use the persistent ./workspace for the Dashi project and show meaningful progress messages while you work. System execution permissions for shell, write, edit, skill, and related tools are already authorized.",
          "Never choose a default for a user decision, clarification, information supplement, or confirmation required by the generation workflow. If one is needed, stop the turn, state the exact question in your assistant response, and wait for a later user message. Do not invoke the question tool or auto-answer it in this headless runtime.",
          "Never delete files or directories; preserve existing workspace files and overwrite only files required by the native Dashi workflow.",
          "Use the native Dashi skill and the OpenCode session history to interpret the current turn and advance its workflow. Do not use an application boolean, regex, or synthetic confirmation marker to decide whether export is approved.",
          `If the Skill's workflow has the required brief and the current user turn explicitly requests or confirms export, run Dashi's native render, visual QA, and export flow, and write the final PPTX/HTML/assets plus artifact-manifest.json under ./turns/${input.runId}/artifacts/. If export approval is missing, stop after the preview and ask the user for the exact missing confirmation.`,
          "Use webfetch/web search inside OpenCode when current evidence is needed. Never expose provider credentials or other platform secrets.",
        ]
      : isEditablePpt
      ? [
          "This is the editable PPT assistant. You are the primary conversational agent, not a brief collector.",
          "Use the runtime-selected model for this editable PPT render; the default is pptoken/grok-4.5. Delegate generation to the native ppt-master skill and keep its workflow and artifact contract unchanged.",
          "Read .opencode/skills/ppt-master/SKILL.md and let that Skill plus the native OpenCode session history interpret the current turn and advance the workflow. Do not use an application boolean, regex, or synthetic confirmation marker to decide whether export is approved.",
          "When the Skill determines that the current user turn provides the required export approval, continue the serial pipeline through SVG export, quality repair, and a real editable PPTX. Otherwise stop at the preview or quality-check gate and ask the user for the missing workflow input or confirmation.",
          "Editable PPT execution contract: render exactly one deck from exactly one selected template and exactly one narrative variant per conversation turn. Never generate, recommend, compare, or render alternative templates or variants; never use auto-4. If the user names a template, use that exact template; otherwise choose one best-fit template and continue.",
          "Continue multi-turn clarification when information is missing; do not call platform-owned PPT tools. Use only the native ppt-master skill commands.",
          input.projectSnapshot
            ? "Before generating, read ./.runtime/project-snapshot.json and reconstruct the current project state in ./workspace/ppt-master. Treat the snapshot as structured application state only; do not expect it to contain images, SVG, PPTX, logs, caches, or other process files."
            : "This is the first turn or no project snapshot is available; initialize ./workspace/ppt-master using the native ppt-master workflow.",
          `Write the final PPTX and artifact-manifest.json under ./turns/${input.runId}/artifacts/ (all artifact paths must remain relative to the current workspace).`,
          "At the end of every turn, write ./project-state.json containing only a JSON object with schemaVersion 1, projectKind ppt-master, and the minimal structured state required to rebuild ./workspace/ppt-master. Never include SVG, PPTX, images, base64, logs, caches, temporary files, or absolute paths.",
          "Run the ppt-master skill's own SVG quality check and repair loop before reporting a final PPTX.",
        ]
      : []),
    `Application system instruction:\n${promptSystem}`,
  ].join("\n")
}

export function buildOpenCodeUserPrompt(input: AgentRuntimeInput, options: { includeConversationHistory?: boolean } = {}) {
  const message = input.messages.at(-1)?.content?.trim() || "Continue using the current runtime context."
  const isDashiPresentation = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  if (!options.includeConversationHistory || input.messages.length < 2) {
    return isDashiPresentation ? clipPromptText(message, 32_000) : message
  }

  const history = input.messages
    .slice(0, -1)
    .map((item) => `[${item.role}]\n${item.content.trim()}`)
    .filter((item) => item.trim())
    .join("\n\n")
  const prompt = [
    "[Conversation history provided by the application]",
    history,
    "[Current user turn]",
    message,
  ].filter(Boolean).join("\n\n")
  return isDashiPresentation ? clipPromptText(prompt, 32_000) : prompt
}
