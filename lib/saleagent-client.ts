type ClipKeyframes = { in?: string; out?: string }
export type ClipSpec = { idx: number; desc: string; begin_s: number; end_s: number; keyframes?: ClipKeyframes }
export type EventItem = { thread_id?: string; run_id?: string; agent?: string; type: string; delta?: string | null; payload?: any; progress?: { current: number; total: number }; ts?: number }
export type RunClipResult = { idx: number; status: 'succeeded' | 'failed'; video_url?: string; detail?: any }
export type JobInfo = { run_id: string; slogan?: string; cover_url?: string; video_url?: string; share_slug?: string; status?: string; created_at?: string; updated_at?: string }
export type CrewStatus = { run_id: string; status: string; result?: string; error?: string; expected_clips?: number; context?: any; created_at?: string; updated_at?: string }

const DEFAULT_BASE = typeof process !== 'undefined' && (process.env.NEXT_PUBLIC_AGENT_URL || process.env.AGENT_URL) ? (process.env.NEXT_PUBLIC_AGENT_URL || process.env.AGENT_URL)! : 'https://api.aimarketingsite.com'

export function getBaseUrl(base?: string) { return base || DEFAULT_BASE }

export async function postJson<T>(url: string, body: any, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), ...(init || {}) })
  if (!res.ok) { try { const err = await res.json(); throw new Error(err?.error || `HTTP ${res.status}`) } catch { throw new Error(`HTTP ${res.status}`) } }
  return res.json() as Promise<T>
}

export type SSEHandle = { stop: () => void }
export async function streamSSE(url: string, body: any, onEvent: (e: EventItem) => void, init?: RequestInit): Promise<SSEHandle> {
  const controller = new AbortController()
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream' }, body: JSON.stringify(body), signal: controller.signal, ...(init || {}) })
  if (!res.ok || !res.body) { controller.abort(); throw new Error(`HTTP ${res.status}`) }
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''
  ;(async () => {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() || ''
      for (const part of parts) {
        const line = part.split('data:').pop()?.trim()
        if (!line) continue
        try { const evt = JSON.parse(line) as EventItem; onEvent(evt) } catch {}
      }
    }
  })()
  return { stop: () => controller.abort() }
}

export type SSEOptions = { onOpen?: () => void; onError?: (err: any) => void; onDone?: () => void; reconnect?: boolean; maxAttempts?: number; backoffMs?: number; init?: RequestInit }
export async function streamSSEEx(url: string, body: any, onEvent: (e: EventItem) => void, opts?: SSEOptions): Promise<SSEHandle> {
  let stopped = false
  let attempts = 0
  const maxAttempts = opts?.maxAttempts ?? 3
  const backoffMs = opts?.backoffMs ?? 1000
  let controller: AbortController | null = null
  async function connect(): Promise<void> {
    if (stopped) return
    attempts++
    controller = new AbortController()
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'text/event-stream', ...(opts?.init?.headers || {}) }, body: JSON.stringify(body), signal: controller.signal, ...(opts?.init || {}) })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)
      opts?.onOpen?.()
      const reader = res.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const parts = buffer.split('\n\n')
        buffer = parts.pop() || ''
        for (const part of parts) {
          const line = part.split('data:').pop()?.trim()
          if (!line) continue
          try { const evt = JSON.parse(line) as EventItem; onEvent(evt) } catch {}
        }
      }
      opts?.onDone?.()
    } catch (err) {
      if (stopped) return
      opts?.onError?.(err)
      if (opts?.reconnect && attempts < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoffMs * attempts))
        await connect()
      }
    }
  }
  void connect()
  return { stop: () => { stopped = true; controller?.abort(); controller = null } }
}

export function createSaleAgentClient(config?: { base?: string; init?: RequestInit }) {
  const base = getBaseUrl(config?.base)
  const init = config?.init
  return {
    postJson: <T>(path: string, body: any, extra?: RequestInit) => postJson<T>(`${base}${path}`, body, { ...(init || {}), ...(extra || {}) }),
    streamSSE: (path: string, body: any, onEvent: (e: EventItem) => void, extra?: RequestInit) => streamSSE(`${base}${path}`, body, onEvent, { ...(init || {}), ...(extra || {}) }),
    streamSSEEx: (path: string, body: any, onEvent: (e: EventItem) => void, opts?: SSEOptions) => streamSSEEx(`${base}${path}`, body, onEvent, { ...(opts || {}), init: { ...(init || {}), ...(opts?.init || {}) } }),
  }
}

export async function workflowPlan(goal: string, total_duration: number, styles: string[] = [], image_control = false, num_clips?: number, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/plan`
  return postJson<{ storyboards: ClipSpec[] }>(url, { goal, total_duration, styles, image_control, num_clips })
}

export async function workflowKeyframes(storyboards: ClipSpec[], image_control = false, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/keyframes`
  return postJson<{ storyboards: ClipSpec[] }>(url, { storyboards, image_control })
}

export async function workflowConfirm(storyboards: ClipSpec[], total_duration: number, styles: string[] = [], image_control = false, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/confirm`
  return postJson<{ run_id: string }>(url, { storyboards, total_duration, styles, image_control })
}

export async function workflowRunClips(run_id: string, storyboards: ClipSpec[], onEvent: (e: EventItem) => void, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/run-clips`
  return streamSSE(url, { run_id, storyboards }, onEvent)
}

export async function workflowStitch(run_id: string, segments: string[], output_key?: string, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/stitch`
  return postJson<{ run_id: string; segments: string[]; final_url: string }>(url, { run_id, segments, output_key })
}

export async function crewRun(payload: { goal: string; styles?: string[]; total_duration?: number; num_clips?: number; image_control?: boolean; run_id?: string }, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/crew-run`
  return postJson<{ run_id: string; session_id: string; status: string; message: string }>(url, payload)
}

export async function crewStatus(run_id: string, base?: string) {
  const url = `${getBaseUrl(base)}/workflow/crew-status/${encodeURIComponent(run_id)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<CrewStatus>
}

export async function agentSSE(payload: { prompt?: string; img?: string; thread_id?: string; run_id?: string; goal?: string; styles?: string[]; total_duration?: number; num_clips?: number; image_control?: boolean; use_crewai?: boolean }, onEvent: (e: EventItem) => void, base?: string) {
  const url = `${getBaseUrl(base)}/crewai-agent`
  return streamSSE(url, payload, onEvent)
}

export async function chatSSE(payload: { action: 'start' | 'message'; thread_id?: string; run_id?: string; message?: string }, onEvent: (e: EventItem) => void, base?: string) {
  const url = `${getBaseUrl(base)}/crewai-chat`
  return streamSSE(url, payload, onEvent)
}

export async function jobsCreate(payload: { slogan?: string; user_id?: string; run_id?: string }, base?: string) {
  const url = `${getBaseUrl(base)}/jobs`
  return postJson<{ run_id: string; share_slug: string }>(url, payload)
}

export async function jobsGet(run_id: string, base?: string) {
  const url = `${getBaseUrl(base)}/jobs/${encodeURIComponent(run_id)}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<JobInfo>
}

export async function storyboardConfirm(payload: { run_id: string; confirmed?: boolean; feedback?: string }, base?: string) {
  const url = `${getBaseUrl(base)}/crewai/storyboard/confirm`
  return postJson<{ run_id: string; status: string; message: string }>(url, payload)
}

export async function sceneUpdate(payload: { message_id: string; scene_idx: number; script?: string; image_url?: string }, base?: string) {
  const url = `${getBaseUrl(base)}/crewai/scene/update`
  return postJson<{ message_id: string; scene_idx: number; clips?: ClipSpec[]; image_url?: string }>(url, payload)
}

export async function sceneRegenerate(payload: { message_id: string; scene_idx: number; script?: string; context?: any }, base?: string) {
  const url = `${getBaseUrl(base)}/crewai/scene/regenerate`
  return postJson<{ message_id: string; scene_idx: number; clips: ClipSpec[]; image_url: string }>(url, payload)
}
