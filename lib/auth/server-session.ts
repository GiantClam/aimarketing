import { headers } from "next/headers"
import { NextRequest } from "next/server"

import { getSessionUser } from "@/lib/auth/session"
import type { AuthUserPayload } from "@/lib/enterprise/server"

export async function getServerSessionUser(): Promise<AuthUserPayload | null> {
  const headerStore = await headers()
  const requestHeaders = new Headers()

  headerStore.forEach((value, key) => {
    requestHeaders.set(key, value)
  })

  const request = new NextRequest("http://internal.aimarketing.local", {
    headers: requestHeaders,
  })

  return getSessionUser(request)
}
