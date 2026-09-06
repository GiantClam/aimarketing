import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { questionAnswers, questionKey, type WorkbenchQuestionClient, type WorkbenchQuestionDraft, type WorkbenchQuestionRequest } from "@coworkany/workbench-client";
import { QuestionSession } from "./question-session";

const copy = {
  zh: { title: "需要你的回答", hide: "收起", open: "打开待回答问题", retry: "重新获取", submit: "提交回答", reject: "拒绝回答", custom: "其他回答", placeholder: "输入你的回答…", multiple: "可选择多项，也可补充回答", single: "选择一项或输入回答", optionsOnly: "请选择", sending: "正在提交…", failed: "操作未完成，请重试。", restoreFailed: "无法获取待回答问题", empty: "请完成每一道问题后提交。" },
  en: { title: "Your input is needed", hide: "Minimize", open: "Open pending questions", retry: "Refresh", submit: "Submit answers", reject: "Decline", custom: "Other answer", placeholder: "Type your answer…", multiple: "Select multiple options or add an answer", single: "Select an option or type an answer", optionsOnly: "Select an option", sending: "Submitting…", failed: "The action failed. Please try again.", restoreFailed: "Unable to load pending questions", empty: "Answer every question before submitting." },
};

export function NativeQuestionForm({ request, locale, busy, error, onRespond }: {
  request: WorkbenchQuestionRequest;
  locale: "zh" | "en";
  busy: boolean;
  error?: string;
  onRespond: (answers: string[][] | null) => void;
}) {
  const text = copy[locale];
  const formId = useId();
  const [drafts, setDrafts] = useState<WorkbenchQuestionDraft[]>(() => request.questions.map(() => ({ selected: [], custom: "" })));
  const answers = questionAnswers(request.questions, drafts);
  const update = (index: number, draft: WorkbenchQuestionDraft) => setDrafts((current) => current.map((value, position) => position === index ? draft : value));
  return <form className="native-question-form" data-question-request={request.requestId} data-question-run={request.runId} onSubmit={(event) => { event.preventDefault(); if (answers && !busy) onRespond(answers); }}>
    {request.questions.map((question, index) => {
      const draft = drafts[index] ?? { selected: [], custom: "" };
      return <fieldset key={index} disabled={busy}>
        <legend>{question.header || `${index + 1}`}</legend>
        <p className="native-question-prompt">{question.question}</p>
        <p className="native-question-hint">{question.multiple ? text.multiple : question.custom === false ? text.optionsOnly : text.single}</p>
        <div className="native-question-options">
          {question.options.map((option, optionIndex) => <label key={optionIndex} className="native-question-option">
            <input type={question.multiple ? "checkbox" : "radio"} name={`${formId}-${index}`} checked={draft.selected.includes(option.label)} onChange={() => {
              const selected = question.multiple
                ? draft.selected.includes(option.label) ? draft.selected.filter((label) => label !== option.label) : [...draft.selected, option.label]
                : [option.label];
              update(index, { selected, custom: question.multiple ? draft.custom : "" });
            }} />
            <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
          </label>)}
        </div>
        {question.custom !== false ? <label className="native-question-custom">
          <span>{text.custom}</span>
          <textarea rows={2} value={draft.custom} placeholder={text.placeholder} onChange={(event) => update(index, { selected: question.multiple ? draft.selected : [], custom: event.target.value })} />
        </label> : null}
      </fieldset>;
    })}
    {error ? <p role="alert" className="native-question-error">{text.failed} <span>{error}</span></p> : null}
    {!answers ? <p className="native-question-hint">{text.empty}</p> : null}
    <div className="native-question-actions">
      <button type="button" disabled={busy} onClick={() => onRespond(null)}>{text.reject}</button>
      <button type="submit" className="native-question-submit" disabled={busy || !answers}>{busy ? text.sending : text.submit}</button>
    </div>
  </form>;
}

function QuestionPanel({ store, locale }: { store: QuestionSession; locale: "zh" | "en" }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [collapsed, setCollapsed] = useState(false);
  const text = copy[locale];
  const panelId = useId();
  if (!snapshot.requests.length && !snapshot.error) return null;
  return <aside className="native-questions" aria-label={text.title}>
    <div className="native-question-toolbar">
      <button type="button" aria-expanded={!collapsed} aria-controls={panelId} aria-label={collapsed ? text.open : text.hide} onClick={() => { setCollapsed(!collapsed); if (collapsed) void store.refresh(); }}>
        <span aria-live="polite">{text.title} {snapshot.requests.length ? `(${snapshot.requests.length})` : ""}</span><span aria-hidden="true">{collapsed ? "+" : "−"}</span>
      </button>
    </div>
    <div id={panelId} hidden={collapsed} className="native-question-body">
      {snapshot.error ? <p role="alert" className="native-question-error">{text.restoreFailed}: {snapshot.error}</p> : null}
      <button className="native-question-refresh" type="button" disabled={snapshot.loading} onClick={() => void store.refresh()}>{text.retry}</button>
      {snapshot.requests.map((request) => {
        const key = questionKey(request);
        return <NativeQuestionForm key={key} request={request} locale={locale} busy={Boolean(snapshot.busy[key])} error={snapshot.errors[key]} onRespond={(answers) => void store.respond(key, answers)} />;
      })}
    </div>
  </aside>;
}

/** Mount with a session key so a route change cannot retain another session's form. */
export function NativeQuestions({ client, sessionId, runId, locale }: { client: WorkbenchQuestionClient; sessionId: string; runId?: string; locale: "zh" | "en" }) {
  const [store, setStore] = useState<QuestionSession>();
  useEffect(() => {
    const next = new QuestionSession(client, sessionId, runId);
    setStore(next);
    void next.start();
    const refresh = () => { if (document.visibilityState !== "hidden") void next.refresh(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { next.dispose(); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [client, sessionId, runId]);
  return store ? <QuestionPanel store={store} locale={locale} /> : null;
}
