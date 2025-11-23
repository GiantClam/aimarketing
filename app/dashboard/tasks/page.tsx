"use client"
import { useEffect, useState } from "react"

type Task = {
  id: number
  userId: number
  connectionId?: number
  workflowName?: string
  webhookPath: string
  executionId?: string
  payload?: string
  result?: string
  status: "pending" | "running" | "completed" | "failed" | "approved" | "rejected"
  error?: string
  relatedStorageKey?: string
  createdAt: string
  updatedAt: string
}

export default function TasksPage() {
  const [userId] = useState(1)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  async function loadTasks() {
    setLoading(true)
    try {
      const res = await fetch(`/api/tasks?userId=${userId}`)
      const data = await res.json()
      setTasks(data)
    } catch (error) {
      console.error("Failed to load tasks:", error)
    } finally {
      setLoading(false)
    }
  }

  async function loadTaskDetail(taskId: number) {
    try {
      const res = await fetch(`/api/tasks/${taskId}`)
      const data = await res.json()
      setSelectedTask(data)
    } catch (error) {
      console.error("Failed to load task detail:", error)
    }
  }

  useEffect(() => {
    loadTasks()
    // 轮询更新任务状态
    const interval = setInterval(loadTasks, 5000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case "completed": return "text-green-600"
      case "failed": return "text-red-600"
      case "running": return "text-blue-600"
      case "pending": return "text-yellow-600"
      case "approved": return "text-green-600"
      case "rejected": return "text-red-600"
      default: return "text-gray-600"
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "completed": return "已完成"
      case "failed": return "失败"
      case "running": return "运行中"
      case "pending": return "等待中"
      case "approved": return "已批准"
      case "rejected": return "已拒绝"
      default: return status
    }
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">任务中心</h1>
        <button 
          onClick={loadTasks} 
          disabled={loading}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50"
        >
          {loading ? "刷新中..." : "刷新"}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 任务列表 */}
        <div>
          <h2 className="font-medium mb-3">任务列表</h2>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left">ID</th>
                  <th className="p-3 text-left">工作流</th>
                  <th className="p-3 text-left">状态</th>
                  <th className="p-3 text-left">创建时间</th>
                  <th className="p-3 text-left">操作</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr key={task.id} className="border-t hover:bg-gray-50">
                    <td className="p-3">{task.id}</td>
                    <td className="p-3">{task.workflowName || task.webhookPath}</td>
                    <td className="p-3">
                      <span className={getStatusColor(task.status)}>
                        {getStatusText(task.status)}
                      </span>
                    </td>
                    <td className="p-3">
                      {new Date(task.createdAt).toLocaleString()}
                    </td>
                    <td className="p-3">
                      <button
                        onClick={() => loadTaskDetail(task.id)}
                        className="text-blue-600 hover:text-blue-800 underline"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {tasks.length === 0 && (
              <div className="p-8 text-center text-gray-500">
                暂无任务
              </div>
            )}
          </div>
        </div>

        {/* 任务详情 */}
        <div>
          <h2 className="font-medium mb-3">任务详情</h2>
          {selectedTask ? (
            <div className="border rounded-lg p-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-600">任务ID</label>
                <p className="text-sm">{selectedTask.id}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">工作流名称</label>
                <p className="text-sm">{selectedTask.workflowName || "未设置"}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">Webhook路径</label>
                <p className="text-sm font-mono">{selectedTask.webhookPath}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">状态</label>
                <p className={`text-sm ${getStatusColor(selectedTask.status)}`}>
                  {getStatusText(selectedTask.status)}
                </p>
              </div>
              {selectedTask.executionId && (
                <div>
                  <label className="text-sm font-medium text-gray-600">执行ID</label>
                  <p className="text-sm font-mono">{selectedTask.executionId}</p>
                </div>
              )}
              {selectedTask.payload && (
                <div>
                  <label className="text-sm font-medium text-gray-600">输入数据</label>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(JSON.parse(selectedTask.payload), null, 2)}
                  </pre>
                </div>
              )}
              {selectedTask.result && (
                <div>
                  <label className="text-sm font-medium text-gray-600">输出结果</label>
                  <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-32">
                    {JSON.stringify(JSON.parse(selectedTask.result), null, 2)}
                  </pre>
                </div>
              )}
              {selectedTask.error && (
                <div>
                  <label className="text-sm font-medium text-gray-600">错误信息</label>
                  <pre className="text-xs bg-red-50 p-2 rounded overflow-auto max-h-32 text-red-600">
                    {selectedTask.error}
                  </pre>
                </div>
              )}
              <div>
                <label className="text-sm font-medium text-gray-600">创建时间</label>
                <p className="text-sm">{new Date(selectedTask.createdAt).toLocaleString()}</p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-600">更新时间</label>
                <p className="text-sm">{new Date(selectedTask.updatedAt).toLocaleString()}</p>
              </div>
            </div>
          ) : (
            <div className="border rounded-lg p-8 text-center text-gray-500">
              选择一个任务查看详情
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
