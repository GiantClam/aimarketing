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
  readonly model?: string;
}

export interface WorkbenchRunDetail {
  readonly run: WorkbenchRun;
  readonly nodes: readonly { readonly nodeKey: string; readonly status: string; readonly outputJson?: string | null; readonly updatedAt: string }[];
  readonly events: readonly { readonly sequence: number; readonly eventType: string; readonly payloadJson: string; readonly createdAt: string }[];
  readonly usage: readonly { readonly provider?: string | null; readonly model: string; readonly inputTokens?: number | null; readonly outputTokens?: number | null; readonly providerCost?: number | null; readonly estimatedCost?: number | null; readonly createdAt: string }[];
}

export interface WorkbenchArtifact {
  readonly id: string;
  readonly relativePath: string;
  readonly title: string;
  readonly mimeType: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly createdAt?: string;
  readonly available?: boolean;
}

export interface WorkbenchUsage {
  readonly runId: string;
  readonly provider?: string;
  readonly model: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly providerCost?: number;
  readonly estimatedCost?: number;
}

export interface WorkbenchWorkflowDefinition {
  readonly schemaVersion?: number;
  readonly revision?: number;
  readonly definitionHash?: string;
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
  readonly id?: string;
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

export interface ArtifactActionsAdapter {
  readonly list: () => Promise<readonly WorkbenchArtifact[]>;
  readonly remove: (artifactId: string) => Promise<void>;
}

export interface WorkbenchEmbeddingConfig {
  readonly mode: "local" | "remote";
  readonly baseUrl?: string;
  readonly model?: string;
  readonly apiKey?: string;
}

export interface WorkbenchKnowledgeResult {
  readonly chunkId: string;
  readonly documentPath: string;
  readonly heading?: string;
  readonly excerpt: string;
  readonly score: number;
  readonly lineStart?: number;
  readonly lineEnd?: number;
}

export interface WorkbenchKnowledgeIndex {
  readonly generation: number;
  readonly documents: number;
  readonly chunks: number;
  readonly indexPath: string;
  readonly semantic: boolean;
  readonly embeddingModel?: string;
  readonly embeddingDimension?: number;
  readonly watcher?: string;
}

export interface WorkbenchClient {
  readonly navigation: NavigationAdapter;
  readonly files: FileActionsAdapter;
  readonly artifacts: ArtifactActionsAdapter;
  readonly knowledge: {
    readonly index: (options: { readonly vaultPath: string; readonly indexPath: string; readonly embedding?: WorkbenchEmbeddingConfig }) => Promise<WorkbenchKnowledgeIndex>;
    readonly search: (options: { readonly indexPath: string; readonly query: string; readonly limit?: number; readonly embedding?: WorkbenchEmbeddingConfig }) => Promise<readonly WorkbenchKnowledgeResult[]>;
    readonly open: (relativePath: string) => Promise<void>;
  };
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
    readonly list: () => Promise<readonly WorkbenchRun[]>;
    readonly inspect: (runId: string) => Promise<WorkbenchRunDetail>;
    readonly cancel: (runId: string) => Promise<void>;
    readonly emergencyStop: (runId: string) => Promise<void>;
    readonly subscribe: (runId: string, onEvent: (event: WorkbenchRunEvent) => void) => () => void;
  };
  readonly usage: {
    readonly list: (conversationId?: string) => Promise<readonly WorkbenchUsage[]>;
  };
}
