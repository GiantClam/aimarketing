import { useEffect, useState } from "react";
import { parseWorkbenchQuestionEvent, type WorkbenchClient, type WorkbenchQuestionClient, type WorkbenchQuestionEvent } from "@coworkany/workbench-client";
import { NativeQuestions } from "./native-questions";

/** Workflow nodes create their own OpenCode sessions, discoverable from run events. */
export function NativeRunQuestions({ client, runId, locale }: {
  client: WorkbenchClient & { questions: WorkbenchQuestionClient };
  runId: string;
  locale: "zh" | "en";
}) {
  const [sessions, setSessions] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    const receive = (event: WorkbenchQuestionEvent) => {
      if (disposed || event.runId !== runId) return;
      setSessions((current) => current.includes(event.sessionId) ? current : [...current, event.sessionId]);
    };
    void (async () => {
      unlisten = await client.questions.subscribe(null, receive);
      if (disposed) { unlisten(); return; }
      const detail = await client.runs.inspect(runId);
      for (const row of detail.events) {
        try {
          const event = parseWorkbenchQuestionEvent(JSON.parse(row.payloadJson));
          if (event) receive(event);
        } catch { /* malformed historical frames cannot create a question */ }
      }
    })().catch((reason: unknown) => { if (!disposed) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => { disposed = true; unlisten?.(); };
  }, [client, runId]);
  return <div className="native-question-stack">
    {error ? <p role="alert" className="native-question-error">{locale === "zh" ? "无法恢复工作流问答" : "Unable to restore workflow questions"}: {error}</p> : null}
    {sessions.map((sessionId) => <NativeQuestions key={sessionId} client={client.questions} sessionId={sessionId} runId={runId} locale={locale} />)}
  </div>;
}
