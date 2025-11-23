import { NextRequest, NextResponse } from "next/server"
import { n8nClient } from "@/lib/integrations/n8n-client"
import { createTask, getConnectionById, updateTaskStatus } from "@/lib/services/tasks"

export async function POST(req: NextRequest) {
	try {
		const body = await req.json().catch(() => ({}))
		const {
			userId,
			connectionId,
			webhookPath,
			payload,
			workflowName,
			relatedStorageKey,
		} = body || {}

		if (!userId || !webhookPath) {
			return NextResponse.json({ error: "userId and webhookPath are required" }, { status: 400 })
		}

		const connection = connectionId ? await getConnectionById(connectionId, userId) : null
		const baseUrl = connection?.baseUrl

		const task = await createTask({ userId, connectionId, workflowName, webhookPath, payload, relatedStorageKey })

		const resp = await n8nClient.triggerWorkflow({
			webhookPath,
			payload: { ...(payload || {}), taskId: task.id },
			userScopedBaseUrl: baseUrl,
		})

		await updateTaskStatus(task.id, { status: "running" })

		return NextResponse.json({ taskId: task.id, webhook: resp })
	} catch (err: any) {
		return NextResponse.json({ error: err?.message || "Internal error" }, { status: 500 })
	}
}


