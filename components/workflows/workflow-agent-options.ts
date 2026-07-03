import { isWorkflowBuiltinAgentSelectable } from "@/lib/workflows/builtin-agent-policy"

export type WorkflowBuiltinAgentOption = {
  id: string
  name: string
  description: string
  category: "general" | "executive" | "business"
}

export type WorkflowCustomAgentOption = {
  id: number
  name: string
  summary: string
  status: "draft" | "published" | "disabled" | "archived"
  executionMode: "direct_agent" | "workflow_backed"
  linkedWorkflowId: number | null
  linkedWorkflowTitle: string | null
}

export { isWorkflowBuiltinAgentSelectable }
