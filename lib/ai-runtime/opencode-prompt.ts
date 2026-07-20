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
    "Use the native session for prior conversational context. Do not read user messages from runtime input files as a substitute for the native user message.",
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
          input.exportConfirmationGranted === true
            ? `The current user turn explicitly confirms export. Use Dashi's native render, visual QA, and export flow, and write the final PPTX/HTML/assets plus artifact-manifest.json under ./turns/${input.runId}/artifacts/.`
            : `The current user turn does not confirm export. Prepare the Dashi project, render and QA an HTML preview, and write only preview artifacts plus artifact-manifest.json under ./turns/${input.runId}/artifacts/. Do not run the Dashi PPTX/PDF export or publish a final PPTX. Ask the user to explicitly confirm export.`,
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

export function buildOpenCodeUserPrompt(input: AgentRuntimeInput) {
  const message = input.messages.at(-1)?.content?.trim() || "Continue using the current runtime context."
  const isDashiPresentation = input.agentId === "executive-presentation-ppt" || (input.selectedSkillIds || []).includes("dashiai-ppt")
  return isDashiPresentation ? clipPromptText(message, 32_000) : message
}
