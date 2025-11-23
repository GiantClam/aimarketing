"use client"
import { useEffect, useState } from "react"

type Connection = {
	id: number
	userId: number
	name: string
	baseUrl: string
	apiKey?: string
	webhookSecret?: string
	isDefault: boolean
}

export default function N8nConnectionsPage() {
	const [userId] = useState(1)
	const [list, setList] = useState<Connection[]>([])
	const [form, setForm] = useState<Partial<Connection>>({ isDefault: false })
	const [loading, setLoading] = useState(false)

	async function load() {
		const res = await fetch(`/api/n8n/connections?userId=${userId}`)
		const data = await res.json()
		setList(data)
	}

	useEffect(() => { load() }, [])

	async function onSubmit(e: React.FormEvent) {
		e.preventDefault()
		setLoading(true)
		await fetch(`/api/n8n/connections`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ ...form, userId }),
		})
		setLoading(false)
		setForm({ isDefault: false })
		await load()
	}

	return (
		<div className="p-4 space-y-6">
			<h1 className="text-xl font-semibold">n8n 连接设置</h1>
			<form onSubmit={onSubmit} className="space-y-3 max-w-xl">
				<input className="border px-3 py-2 w-full" placeholder="名称" value={form.name || ""} onChange={e=>setForm(f=>({ ...f, name: e.target.value }))} required />
				<input className="border px-3 py-2 w-full" placeholder="Base URL (含协议)" value={form.baseUrl || ""} onChange={e=>setForm(f=>({ ...f, baseUrl: e.target.value }))} required />
				<input className="border px-3 py-2 w-full" placeholder="API Key (可选)" value={form.apiKey || ""} onChange={e=>setForm(f=>({ ...f, apiKey: e.target.value }))} />
				<input className="border px-3 py-2 w-full" placeholder="Webhook Secret (用于验签)" value={form.webhookSecret || ""} onChange={e=>setForm(f=>({ ...f, webhookSecret: e.target.value }))} />
				<label className="inline-flex items-center gap-2">
					<input type="checkbox" checked={!!form.isDefault} onChange={e=>setForm(f=>({ ...f, isDefault: e.target.checked }))} />
					<span>设为默认</span>
				</label>
				<button className="border px-4 py-2" disabled={loading}>{loading?"保存中...":"保存连接"}</button>
			</form>
			<div>
				<h2 className="font-medium mb-2">已保存连接</h2>
				<table className="w-full text-sm border">
					<thead>
						<tr className="bg-gray-50">
							<th className="p-2 text-left">名称</th>
							<th className="p-2 text-left">Base URL</th>
							<th className="p-2 text-left">默认</th>
						</tr>
					</thead>
					<tbody>
						{list.map(i=> (
							<tr key={i.id} className="border-t">
								<td className="p-2">{i.name}</td>
								<td className="p-2">{i.baseUrl}</td>
								<td className="p-2">{i.isDefault?"是":"否"}</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	)
}


