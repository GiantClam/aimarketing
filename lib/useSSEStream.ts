import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EventItem, ClipSpec, streamSSE, streamSSEEx, getBaseUrl, SSEOptions } from './saleagent-client'

export function useSSEStream(path: string, base?: string) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [running, setRunning] = useState(false)
  const handleRef = useRef<{ stop: () => void } | null>(null)
  const lastEvent = useMemo(() => (events.length ? events[events.length - 1] : null), [events])
  const progress = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e && e.progress) return e.progress
    }
    return undefined
  }, [events])

  const start = useCallback(async (body: any) => {
    if (running) return
    setEvents([])
    setRunning(true)
    const url = `${getBaseUrl(base)}${path}`
    const h = await streamSSE(url, body, (e) => setEvents((prev) => [...prev, e]))
    handleRef.current = h
  }, [path, base, running])

  const stop = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    setRunning(false)
  }, [])

  const clear = useCallback(() => setEvents([]), [])

  useEffect(() => () => handleRef.current?.stop(), [])

  return { events, lastEvent, progress, running, start, stop, clear }
}

export function useSSEStreamEx(path: string, options?: { base?: string; headers?: Record<string, string>; reconnect?: boolean; maxAttempts?: number; backoffMs?: number; onError?: (err: any) => void; filter?: (e: EventItem) => boolean; onOpen?: () => void; onDone?: () => void }) {
  const [events, setEvents] = useState<EventItem[]>([])
  const [running, setRunning] = useState(false)
  const handleRef = useRef<{ stop: () => void } | null>(null)
  const lastEvent = useMemo(() => (events.length ? events[events.length - 1] : null), [events])
  const progress = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]
      if (e && e.progress) return e.progress
    }
    return undefined
  }, [events])
  const start = useCallback(async (body: any) => {
    if (running) return
    setEvents([])
    setRunning(true)
    const base = options?.base
    const url = `${getBaseUrl(base)}${path}`
    const opts: SSEOptions = {
      reconnect: options?.reconnect,
      maxAttempts: options?.maxAttempts,
      backoffMs: options?.backoffMs,
      onError: options?.onError,
      onOpen: options?.onOpen,
      onDone: options?.onDone,
      init: options?.headers ? { headers: options.headers } : undefined
    }
    const h = await streamSSEEx(url, body, (e) => {
      if (options?.filter && !options.filter(e)) return
      setEvents((prev) => [...prev, e])
    }, opts)
    handleRef.current = h
  }, [path, options, running])
  const stop = useCallback(() => {
    handleRef.current?.stop()
    handleRef.current = null
    setRunning(false)
  }, [])
  const clear = useCallback(() => setEvents([]), [])
  useEffect(() => () => handleRef.current?.stop(), [])
  return { events, lastEvent, progress, running, start, stop, clear }
}

export function useAgentSSE(base?: string) {
  const core = useSSEStream('/crewai-agent', base)
  const start = useCallback((payload: { prompt?: string; img?: string; thread_id?: string; run_id?: string; goal?: string; styles?: string[]; total_duration?: number; num_clips?: number; image_control?: boolean; use_crewai?: boolean }) => core.start(payload), [core.start])
  return { ...core, start }
}

export function useRunClipsSSE(base?: string) {
  const core = useSSEStream('/workflow/run-clips', base)
  const [results, setResults] = useState<Array<{ idx: number; status: string; video_url?: string }>>([])

  useEffect(() => {
    if (!core.events.length) return
    const last = core.events[core.events.length - 1]
    if (last?.type === 'progress' && (last as any).clip) {
      const clip = (last as any).clip
      setResults((prev) => {
        const existing = prev.find((c) => c.idx === clip.idx)
        if (existing) return prev.map((c) => c.idx === clip.idx ? { ...c, status: clip.status, video_url: clip.video_url } : c)
        return [...prev, { idx: clip.idx, status: clip.status, video_url: clip.video_url }]
      })
    }
    if (last?.type === 'done' && (last as any).results) {
      const arr = (last as any).results as Array<{ idx: number; status: string; video_url?: string }>
      setResults(arr)
    }
  }, [core.events])

  const start = useCallback((run_id: string, storyboards: ClipSpec[]) => core.start({ run_id, storyboards }), [core.start])

  return { ...core, start, results }
}
