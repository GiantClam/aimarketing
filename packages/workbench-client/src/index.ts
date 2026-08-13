export interface NavigationAdapter {
  readonly go: (href: string) => void;
  readonly replace: (href: string) => void;
  readonly current: () => string;
}

export type WorkbenchRole = "system" | "user" | "assistant" | "tool";
export type WorkbenchRunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted";

export interface WorkbenchMessage {
  readonly id: string;
  readonly conversationId: string;
  readonly role: WorkbenchRole;
  readonly content: string;
  readonly createdAt: string;
}

export interface WorkbenchConversation {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
  readonly messageCount: number;
}

export interface WorkbenchRun {
  readonly id: string;
  readonly conversationId: string;
  readonly status: WorkbenchRunStatus;
  readonly startedAt: string;
  readonly finishedAt?: string;
}

export interface WorkbenchArtifact {
  readonly id: string;
  readonly relativePath: string;
  readonly title: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
}

export interface WorkbenchUsage {
  readonly runId: string;
  readonly model: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly estimatedCost?: number;
}

export interface WorkbenchWorkflowDefinition {
  readonly nodes: readonly unknown[];
  readonly edges: readonly unknown[];
}

export interface WorkbenchWorkflow {
  readonly id: string;
  readonly title: string;
  readonly definition: WorkbenchWorkflowDefinition;
  readonly updatedAt: string;
}

export interface WorkbenchWorkflowInput {
  readonly id?: string;
  readonly title: string;
  readonly definition: WorkbenchWorkflowDefinition;
}

export type WorkbenchRunEvent =
  | { readonly type: "text"; readonly delta: string }
  | { readonly type: "tool"; readonly tool: string; readonly phase: "started" | "completed" | "failed"; readonly message?: string }
  | { readonly type: "usage"; readonly usage: WorkbenchUsage }
  | { readonly type: "artifact"; readonly artifact: WorkbenchArtifact }
  | { readonly type: "status"; readonly status: WorkbenchRunStatus };

export interface WorkbenchRunRequest {
  readonly conversationId: string;
  readonly prompt: string;
  readonly model?: string;
  readonly skillId?: string;
  readonly reasoningEffort?: string;
}

export interface FileActionsAdapter {
  readonly open: (relativePath: string, mimeType?: string) => Promise<void>;
  readonly reveal: (relativePath: string, mimeType?: string) => Promise<void>;
}

export interface WorkbenchClient {
  readonly navigation: NavigationAdapter;
  readonly files: FileActionsAdapter;
  readonly conversations: {
    readonly list: () => Promise<readonly WorkbenchConversation[]>;
    readonly create: (title?: string) => Promise<WorkbenchConversation>;
    readonly messages: (conversationId: string) => Promise<readonly WorkbenchMessage[]>;
  };
  readonly workflows: {
    readonly list: () => Promise<readonly WorkbenchWorkflow[]>;
    readonly save: (input: WorkbenchWorkflowInput) => Promise<WorkbenchWorkflow>;
  };
  readonly runs: {
    readonly start: (request: WorkbenchRunRequest) => Promise<WorkbenchRun>;
    readonly cancel: (runId: string) => Promise<void>;
    readonly subscribe: (runId: string, onEvent: (event: WorkbenchRunEvent) => void) => () => void;
  };
  readonly usage: {
    readonly list: (conversationId?: string) => Promise<readonly WorkbenchUsage[]>;
  };
}
