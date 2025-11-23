import { DashboardLayout } from "@/components/dashboard-layout"
import { ChatInterface } from "@/components/chat-interface"
import Link from "next/link"

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">控制台</h1>
          <div className="flex gap-3">
            <Link href="/dashboard/n8n/connections" className="underline">n8n 连接设置</Link>
            <Link href="/dashboard/tasks" className="underline">任务中心</Link>
            <Link href="/dashboard/generate" className="underline">工作流触发</Link>
          </div>
        </div>
        <ChatInterface />
      </div>
    </DashboardLayout>
  )
}
