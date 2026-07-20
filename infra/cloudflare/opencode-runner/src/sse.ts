export function sseEvent(payload: unknown) {
  return `event: runtime\ndata: ${JSON.stringify(payload)}\n\n`
}

export function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  })
}
