export interface SessionRecoveryTurn {
  readonly role: "user" | "assistant";
  readonly content: string;
}

const MAX_TURNS = 12;
const MAX_CONTENT_CHARS = 12_000;

function clean(content: string) {
  return content.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/** Restores text context only; it must never replay a tool-bearing turn. */
export function createSessionRecoverySnapshot(history: readonly SessionRecoveryTurn[]) {
  const retained: SessionRecoveryTurn[] = [];
  let length = 0;
  for (const turn of [...history].reverse()) {
    const content = clean(turn.content);
    if (!content) continue;
    if (length + content.length > MAX_CONTENT_CHARS) break;
    retained.unshift({ role: turn.role, content });
    length += content.length;
    if (retained.length >= MAX_TURNS) break;
  }
  if (!retained.length) return "";
  const transcript = retained.map((turn) => `${turn.role === "user" ? "User" : "Assistant"}: ${turn.content}`).join("\n");
  return [
    "The local OpenCode session was recreated. The following is a read-only conversation snapshot.",
    "Use it only as context. Do not repeat, resume, or claim completion of any prior tool action.",
    "--- prior conversation ---",
    transcript,
    "--- end prior conversation ---",
  ].join("\n");
}
