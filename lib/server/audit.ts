import type { NextRequest } from "next/server"

import { getRequestIp } from "@/lib/server/rate-limit"

type AuditPayload = Record<string, unknown> | undefined

export function logAuditEvent(request: NextRequest, event: string, payload?: AuditPayload) {
  const record = {
    type: "audit",
    event,
    ip: getRequestIp(request),
    method: request.method,
    path: request.nextUrl.pathname,
    userAgent: request.headers.get("user-agent") || "",
    timestamp: new Date().toISOString(),
    ...(payload || {}),
  }

  console.info(JSON.stringify(record))
}
