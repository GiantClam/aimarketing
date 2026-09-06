import { questionAnswers, questionKey, type WorkbenchQuestionClient, type WorkbenchQuestionEvent, type WorkbenchQuestionRequest } from "@coworkany/workbench-client";

export interface QuestionSnapshot {
  readonly requests: readonly WorkbenchQuestionRequest[];
  readonly busy: Readonly<Record<string, boolean>>;
  readonly errors: Readonly<Record<string, string>>;
  readonly loading: boolean;
  readonly error?: string;
}

/** Session-scoped control state. Nothing here is appended to the transcript. */
export class QuestionSession {
  private snapshot: QuestionSnapshot = { requests: [], busy: {}, errors: {}, loading: false };
  private listeners = new Set<() => void>();
  private unlisten?: () => void;
  private connecting?: Promise<void>;
  private disposed = false;
  private generation = 0;
  private revision = 0;
  private changes = new Map<string, { revision: number; request?: WorkbenchQuestionRequest }>();

  constructor(private readonly client: WorkbenchQuestionClient, private readonly sessionId: string, private readonly runId?: string) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };

  private update(patch: Partial<QuestionSnapshot>) {
    if (this.disposed) return;
    this.snapshot = { ...this.snapshot, ...patch };
    this.listeners.forEach((listener) => listener());
  }

  private receive = (event: WorkbenchQuestionEvent) => {
    if (this.disposed || event.sessionId !== this.sessionId) return;
    if (this.runId && event.runId !== this.runId) return;
    const key = questionKey(event);
    const existing = this.snapshot.requests.find((item) => questionKey(item) === key);
    if (existing?.runId && existing.runId !== event.runId) return;
    if (event.type === "question_request" && this.changes.has(key) && !this.changes.get(key)?.request) return;
    const request = event.type === "question_request"
      ? { requestId: event.requestId, sessionId: event.sessionId, runId: event.runId, questions: event.questions }
      : undefined;
    this.changes.set(key, { revision: ++this.revision, request });
    const remaining = this.snapshot.requests.filter((item) => questionKey(item) !== key);
    const busy = { ...this.snapshot.busy };
    const errors = { ...this.snapshot.errors };
    if (!request) { delete busy[key]; delete errors[key]; }
    this.update({ requests: request ? [...remaining, request] : remaining, busy, errors });
  };

  start() { return this.refresh(); }

  refresh = async () => {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.update({ loading: true, error: undefined });
    try {
      if (!this.unlisten) {
        this.connecting ??= this.client.subscribe(this.sessionId, this.receive).then((unlisten) => {
          if (this.disposed) unlisten();
          else this.unlisten = unlisten;
        }).finally(() => { this.connecting = undefined; });
        await this.connecting;
      }
      if (this.disposed || generation !== this.generation) return;
      const revision = this.revision;
      const requests = await this.client.list(this.sessionId);
      if (this.disposed || generation !== this.generation) return;
      const restored = new Map(requests.filter((request) => request.sessionId === this.sessionId && (!this.runId || !request.runId || request.runId === this.runId)).map((request) => {
        const key = questionKey(request);
        const previous = this.snapshot.requests.find((item) => questionKey(item) === key);
        const runId = request.runId ?? previous?.runId ?? this.runId;
        return [key, { ...request, ...(runId ? { runId } : {}) }];
      }));
      // Replay events received after this fetch began, including response tombstones.
      for (const [key, change] of this.changes) {
        if (change.request && change.revision <= revision) continue;
        if (change.request) restored.set(key, change.request);
        else restored.delete(key);
      }
      this.update({ requests: [...restored.values()], loading: false });
    } catch (error) {
      if (generation === this.generation) this.update({ loading: false, error: error instanceof Error ? error.message : String(error) });
    }
  };

  async respond(key: string, answers: string[][] | null) {
    const request = this.snapshot.requests.find((item) => questionKey(item) === key);
    if (this.disposed || !request || this.snapshot.busy[key]) return;
    if (answers !== null) {
      const drafts = answers.map((answer, index) => {
        const options = request.questions[index]?.options ?? [];
        return { selected: answer.filter((label) => options.some((option) => option.label === label)), custom: answer.filter((label) => !options.some((option) => option.label === label)).join("\n") };
      });
      const valid = questionAnswers(request.questions, drafts);
      if (!valid || JSON.stringify(valid) !== JSON.stringify(answers)) {
        this.update({ errors: { ...this.snapshot.errors, [key]: "question_answers_invalid" } });
        return;
      }
    }
    this.update({ busy: { ...this.snapshot.busy, [key]: true }, errors: { ...this.snapshot.errors, [key]: "" } });
    try {
      const payload = { sessionId: request.sessionId, requestId: request.requestId };
      if (answers === null) await this.client.reject(payload);
      else await this.client.reply({ ...payload, answers });
      if (request.runId) this.receive({ type: "question_response", ...payload, runId: request.runId, rejected: answers === null });
      else {
        this.changes.set(key, { revision: ++this.revision });
        this.update({ requests: this.snapshot.requests.filter((item) => questionKey(item) !== key) });
      }
    } catch (error) {
      if (this.snapshot.requests.some((item) => questionKey(item) === key)) {
        this.update({ errors: { ...this.snapshot.errors, [key]: error instanceof Error ? error.message : String(error) } });
      }
    } finally {
      this.update({ busy: { ...this.snapshot.busy, [key]: false } });
    }
  }

  dispose() {
    this.disposed = true;
    this.generation++;
    this.unlisten?.();
    this.listeners.clear();
  }
}
