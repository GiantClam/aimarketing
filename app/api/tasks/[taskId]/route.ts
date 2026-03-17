import { NextRequest, NextResponse } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import { getAssistantTask, toAssistantTaskView } from "@/lib/assistant-async"

export async function GET(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const user = await getSessionUser(req)
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const resolved = await params
    const taskId = Number.parseInt(resolved.taskId, 10)
    if (!Number.isFinite(taskId) || taskId <= 0) {
      return NextResponse.json({ error: "invalid_task_id" }, { status: 400 })
    }

    const task = await getAssistantTask(taskId, user.id)
    if (!task) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }

    return NextResponse.json({ data: toAssistantTaskView(task) })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "task_status_failed" }, { status: 500 })
  }
}
